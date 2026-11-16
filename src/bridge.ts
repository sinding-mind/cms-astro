// Runs inside the preview page (only with CMS_PREVIEW=1). It marks editable elements, reports clicks to the
// editor, lets the user type directly in text fields, and applies quick text patches before the file is saved.
// Messages are plain data: the bridge never inserts HTML it receives.

declare global {
  interface Window { __CMS__: { editorOrigin: string } }
}

const { editorOrigin } = window.__CMS__;
const SELECTOR = "[data-cms-field],[data-cms-image],[data-cms-item],[data-cms-list]";
let nonce: string | null = null;
let selected: string | null = null;
let editing: HTMLElement | null = null;
let original = "";
/** Text fields the editor says must not be typed on the page (placeholders, markup made from the text). */
let noInline = new Set<string>();
/** An element with child elements (a link, a <mark>) would lose them if typed into as plain text. */
const isPlainText = (el: HTMLElement) => el.childElementCount === 0;

type Kind = "text" | "image" | "item" | "list";
const refOf = (el: Element): [string, Kind] | null => {
  const d = (el as HTMLElement).dataset;
  if (d.cmsField) return [d.cmsField, "text"];
  if (d.cmsImage) return [d.cmsImage, "image"];
  if (d.cmsItem) return [d.cmsItem, "item"];
  if (d.cmsList) return [d.cmsList, "list"];
  return null;
};
const byRef = (ref: string) =>
  [...document.querySelectorAll<HTMLElement>(SELECTOR)].filter((el) => refOf(el)?.[0] === ref);

function post(msg: Record<string, unknown>) {
  if (nonce) parent.postMessage({ ...msg, nonce }, editorOrigin);
}

// ---- Overlay (shadow DOM, so the site's CSS cannot reach it and it cannot reach the site) ----
const host = document.createElement("div");
host.setAttribute("data-cms-overlay", "");
const shadow = host.attachShadow({ mode: "open" });
shadow.innerHTML = `<style>
  :host{all:initial}
  .box{position:fixed;pointer-events:none;border-radius:6px;z-index:2147483646;display:none}
  .hover{outline:2px dashed #2D68AF;outline-offset:3px}
  .sel{outline:3px solid #2D68AF;outline-offset:3px;box-shadow:0 0 0 9999px rgba(20,35,58,.06)}
  .tools{position:fixed;z-index:2147483647;display:none;gap:2px;background:#14233A;border-radius:8px;padding:3px;box-shadow:0 4px 16px rgba(0,0,0,.25)}
  .tools button{all:unset;cursor:pointer;color:#fff;font:600 13px/1 system-ui,sans-serif;padding:8px 10px;border-radius:6px;min-width:24px;min-height:24px;text-align:center}
  .tools button:hover,.tools button:focus-visible{background:#2D68AF;outline:2px solid #F8C838;outline-offset:0}
  .label{position:fixed;z-index:2147483647;display:none;background:#2D68AF;color:#fff;font:600 12px/1 system-ui,sans-serif;padding:4px 7px;border-radius:4px;pointer-events:none}
</style>
<div class="box hover"></div><div class="box sel"></div><div class="label"></div>
<div class="tools" role="toolbar" aria-label="Element i listen">
  <button data-op="up" aria-label="Flyt op" title="Flyt op">↑</button>
  <button data-op="down" aria-label="Flyt ned" title="Flyt ned">↓</button>
  <button data-op="duplicate" aria-label="Kopiér" title="Kopiér">Kopiér</button>
  <button data-op="add" aria-label="Tilføj nyt efter" title="Tilføj nyt efter">+ Ny</button>
  <button data-op="delete" aria-label="Slet" title="Slet">Slet</button>
</div>`;
const hoverBox = shadow.querySelector<HTMLElement>(".hover")!;
const selBox = shadow.querySelector<HTMLElement>(".sel")!;
const label = shadow.querySelector<HTMLElement>(".label")!;
const tools = shadow.querySelector<HTMLElement>(".tools")!;
let toolsFor: string | null = null;
let hovered: HTMLElement | null = null;

function place(box: HTMLElement, el: HTMLElement | null) {
  if (!el) { box.style.display = "none"; return; }
  const r = el.getBoundingClientRect();
  Object.assign(box.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
}

function redraw() {
  place(hoverBox, hovered && refOf(hovered)?.[0] !== selected ? hovered : null);
  const selEl = selected ? byRef(selected)[0] ?? null : null;
  place(selBox, selEl);
  const itemEl = toolsFor ? byRef(toolsFor)[0] : null;
  if (itemEl) {
    const r = itemEl.getBoundingClientRect();
    tools.style.display = "flex";
    tools.style.left = `${Math.max(4, r.right - tools.offsetWidth)}px`;
    tools.style.top = `${Math.max(4, r.top - tools.offsetHeight - 6)}px`;
  } else tools.style.display = "none";
}

tools.addEventListener("click", (e) => {
  const op = (e.target as HTMLElement).closest("button")?.dataset.op;
  if (op && toolsFor) post({ type: "list-op", ref: toolsFor, op });
});

// ---- Selection and inline text editing ----
function select(ref: string | null, scroll = false) {
  selected = ref;
  const el = ref ? byRef(ref)[0] : null;
  const item = el?.closest<HTMLElement>("[data-cms-item]");
  toolsFor = item ? refOf(item)![0] : null;
  if (el && scroll) el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
  redraw();
}

function startEditing(el: HTMLElement, x: number, y: number) {
  if (editing === el) return;
  stopEditing(true);
  editing = el;
  original = el.textContent ?? "";
  el.contentEditable = "plaintext-only";
  el.spellcheck = true;
  el.focus({ preventScroll: true });
  // Put the caret where the user clicked, not at the start.
  const range = document.caretRangeFromPoint?.(x, y);
  if (range) { const s = getSelection(); s?.removeAllRanges(); s?.addRange(range); }
}

function stopEditing(save: boolean) {
  const el = editing;
  if (!el) return;
  editing = null;
  el.removeAttribute("contenteditable");
  const ref = refOf(el)![0];
  const value = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!save) {
    el.textContent = original;
    post({ type: "input", ref, value: original });
    return;
  }
  if (value !== original) post({ type: "commit", ref, value });
}

let visitor = false;

document.addEventListener("click", (e) => {
  if (!nonce || visitor) return;
  const t = e.target as Element;
  if (host.contains(t)) return;
  const el = t.closest<HTMLElement>(SELECTOR);
  if (!el) return;
  const [ref, kind] = refOf(el)!;
  // While editing, links and buttons must not fire when the user clicks their text.
  e.preventDefault();
  e.stopPropagation();
  // A text the page shows differently from how it is stored is edited in the editor's panel instead.
  const inline = kind === "text" && !noInline.has(ref) && isPlainText(el);
  if (inline) startEditing(el, e.clientX, e.clientY);
  else stopEditing(true);
  select(ref);
  post({ type: "select", ref, kind, inline, src: kind === "image" ? (el as HTMLImageElement).currentSrc : undefined });
}, true);

document.addEventListener("input", (e) => {
  if (e.target === editing && editing) {
    const ref = refOf(editing)![0];
    const value = editing.textContent ?? "";
    for (const other of byRef(ref)) if (other !== editing && isPlainText(other)) other.textContent = value;
    post({ type: "input", ref, value });
    redraw();
  }
}, true);

document.addEventListener("keydown", (e) => {
  if (!editing) return;
  if (e.key === "Enter") { e.preventDefault(); stopEditing(true); }
  else if (e.key === "Escape") { e.preventDefault(); stopEditing(false); }
}, true);

document.addEventListener("focusout", (e) => { if (e.target === editing) stopEditing(true); }, true);

document.addEventListener("mouseover", (e) => {
  if (visitor) return;
  const el = (e.target as Element).closest<HTMLElement>(SELECTOR);
  hovered = el;
  if (el) {
    label.textContent = { text: "Tekst", image: "Billede", item: "Element i liste", list: "Liste" }[refOf(el)![1]];
    const r = el.getBoundingClientRect();
    Object.assign(label.style, { display: "block", left: `${r.left}px`, top: `${Math.max(0, r.top - 22)}px` });
  } else label.style.display = "none";
  redraw();
});

addEventListener("scroll", redraw, { passive: true, capture: true });
addEventListener("resize", redraw);

// ---- Messages from the editor ----
addEventListener("message", (e) => {
  if (e.source !== parent || e.origin !== editorOrigin) return;
  const m = e.data as Record<string, unknown>;
  if (!m || typeof m !== "object" || typeof m.type !== "string") return;
  if (m.type === "hello") {
    if (nonce || typeof m.nonce !== "string") return;
    nonce = m.nonce;
    announce();
    return;
  }
  if (m.nonce !== nonce) return;
  const ref = typeof m.ref === "string" ? m.ref : null;
  switch (m.type) {
    case "select":
      select(ref, true);
      break;
    case "patch-text":
      // Never flatten an element that has markup inside it; the real render arrives after the save.
      if (ref && typeof m.value === "string" && !noInline.has(ref)) for (const el of byRef(ref)) if (el !== editing && isPlainText(el)) el.textContent = m.value;
      redraw();
      break;
    case "fields":
      if (Array.isArray(m.noInline)) noInline = new Set(m.noInline.filter((r): r is string => typeof r === "string"));
      break;
    case "patch-image":
      if (!ref) break;
      for (const el of byRef(ref)) {
        const img = el as HTMLImageElement;
        if (typeof m.alt === "string") img.alt = m.alt;
        const f = m.fokus as { x?: unknown; y?: unknown } | undefined;
        if (f && typeof f.x === "number" && typeof f.y === "number") img.style.objectPosition = `${f.x}% ${f.y}%`;
      }
      break;
    case "visitor-view":
      visitor = m.on === true;
      stopEditing(true);
      host.style.display = visitor ? "none" : "";
      break;
  }
});

function announce() {
  const seen = new Set<string>();
  const fields = [...document.querySelectorAll<HTMLElement>(SELECTOR)].flatMap((el) => {
    const [ref, kind] = refOf(el)!;
    if (seen.has(ref)) return [];
    seen.add(ref);
    const img = kind === "image" ? (el as HTMLImageElement) : null;
    return [{ ref, kind, text: img ? img.alt : (el.textContent ?? "").trim().slice(0, 80), src: img ? img.currentSrc || img.src : undefined }];
  });
  post({ type: "ready", url: location.pathname, title: document.title, fields });
}

// Site convention while editing: every <details> is open, so answers and other folded text can be clicked.
// (CSS motion is turned off by the integration's head script; JS animations check isCmsEditing().)
const openDetails = () => document.querySelectorAll("details").forEach((d) => { d.open = true; });
openDetails();
addEventListener("load", openDetails);

// Keep the scroll position when the dev server reloads the page after a save.
addEventListener("pagehide", () => sessionStorage.setItem(`cms-scroll:${location.pathname}`, String(scrollY)));
const y = sessionStorage.getItem(`cms-scroll:${location.pathname}`);
if (y) requestAnimationFrame(() => scrollTo({ top: Number(y), behavior: "instant" as ScrollBehavior }));

document.body.append(host);
parent.postMessage({ type: "boot" }, editorOrigin);

export {};
