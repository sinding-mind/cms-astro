// Astro integration (open, MIT). It only marks the preview: with `astro dev` and CMS_PREVIEW=1 it injects the
// bridge and the `data-cms-editing` attribute and sets the `virtual:sinding-cms` flag to true. Otherwise it
// adds nothing except that flag set to false, so a production build is plain static HTML.
// The file API, image processing and everything that writes files live in the closed @sindingmind/cms-runner.
import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { foldEditingCalls, type Parse } from "./editing-flag.ts";

export type CmsOptions = {
  /** Origin of the editor that frames the preview. CMS_EDITOR_ORIGIN (set by the runner) takes precedence. */
  editorOrigin?: string;
  /**
   * Keep CSS animations and transitions while editing. Default false: in the preview they finish at once (the
   * end state is shown), so text does not move or fade while the customer clicks it.
   */
  keepMotion?: boolean;
};

const DEFAULT_EDITOR_ORIGIN = "http://localhost:4500";

/**
 * The editing-mode stylesheet. Animations jump to their end state (fill-mode is kept, so a fade-in ends visible),
 * transitions are instant, and smooth scrolling is off so the editor can scroll straight to a field.
 */
export const EDITING_CSS =
  "html[data-cms-editing] *,html[data-cms-editing] *::before,html[data-cms-editing] *::after{" +
  "animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;" +
  "transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}";

export default function cms(options: CmsOptions = {}): AstroIntegration {
  return {
    name: "@sindingmind/cms-astro",
    hooks: {
      "astro:config:setup": ({ command, updateConfig, injectScript }) => {
        const preview = command === "dev" && process.env.CMS_PREVIEW === "1";
        updateConfig({ vite: { plugins: [virtualModule(preview), editingFlag(preview)] } });
        if (!preview) return;
        const editorOrigin = originOf(process.env.CMS_EDITOR_ORIGIN || options.editorOrigin || DEFAULT_EDITOR_ORIGIN);
        // Runs before the site's own scripts, so they can skip animations while editing (isCmsEditing() or the
        // attribute), and before the first paint, so CSS motion is off from the start.
        const motion = options.keepMotion ? "" : `var s=document.createElement("style");s.setAttribute("data-cms-editing-style","");s.textContent=${JSON.stringify(EDITING_CSS)};document.head.append(s);`;
        injectScript(
          "head-inline",
          `document.documentElement.setAttribute("data-cms-editing","");${motion}window.__CMS__=${JSON.stringify({ editorOrigin })};`,
        );
        // The bridge sits next to this module: bridge.js in the published package (dist/), bridge.ts from source.
        const bridge = new URL(import.meta.url.endsWith(".ts") ? "./bridge.ts" : "./bridge.js", import.meta.url);
        injectScript("page", `import ${JSON.stringify(fileURLToPath(bridge))};`);
      },
    },
  };
}

/** Accepts only a bare origin ("http://localhost:4500"), because it ends up in an inline script. */
function originOf(value: string): string {
  const origin = new URL(value).origin;
  if (origin !== value.replace(/\/$/, "")) throw new Error(`CMS editor origin must be a bare origin, got "${value}"`);
  return origin;
}

/**
 * In a build, every `isCmsEditing()` call in the site's code becomes the literal `false` (see editing-flag.ts), so
 * the bundler can drop the check and `attrs.ts` even when several page scripts import it. Runs after the other
 * plugins (`enforce: "post"`), so it sees JavaScript (TypeScript and .astro already compiled).
 */
function editingFlag(preview: boolean) {
  return {
    name: "sinding-cms-editing-flag",
    apply: "build" as const,
    enforce: "post" as const,
    transform(this: { parse: Parse }, code: string, id: string) {
      if (id.startsWith("\0") || id.includes("/node_modules/")) return undefined;
      const folded = foldEditingCalls(code, (c) => this.parse(c), preview);
      return folded === undefined ? undefined : { code: folded, map: null };
    },
  };
}

function virtualModule(preview: boolean) {
  const id = "virtual:sinding-cms";
  return {
    name: "sinding-cms-virtual",
    resolveId: (s: string) => (s === id ? `\0${id}` : undefined),
    load: (s: string) => (s === `\0${id}` ? `export const preview = ${preview};` : undefined),
  };
}
