// Field definitions without Zod, so the editor (browser) can import them too.

export type TextField = {
  kind: "text";
  label: string;
  help?: string;
  max?: number;
  multiline?: boolean;
  /** May be missing or empty in the YAML. An empty value removes the key from the YAML. */
  optional?: boolean;
  /**
   * Names the site replaces in this text, written as `{name}` (e.g. `["modul", "timepris"]` for "{modul}"). Only
   * these may appear in the text; an unknown name or a stray brace is rejected. The YAML keeps them as written,
   * and the preview shows the merged text because the site's own render merges them. Implies `inline: false`.
   */
  placeholders?: readonly string[];
  /**
   * `false`: the text cannot be typed on the page, only in the panel and the page form. Use it when the page
   * shows something else than the stored text (merged placeholders, `{klammer}` turned into markup, ...).
   */
  inline?: boolean;
};
export type NumberField = { kind: "number"; label: string; help?: string; min?: number; max?: number; optional?: boolean };
export type ImageField = {
  kind: "image";
  label: string;
  help?: string;
  ratio?: string;
  /** Most characters in the alt text. Default `DEFAULT_ALT_MAX` (200). */
  altMax?: number;
};
/** The alt text's length limit when the field sets none: room for a real description, short enough to listen to. */
export const DEFAULT_ALT_MAX = 200;
export const altMaxOf = (field: ImageField): number => field.altMax ?? DEFAULT_ALT_MAX;
export type GroupField = { kind: "group"; label: string; fields: Record<string, Field> };
export type ListField = {
  kind: "list";
  label: string;
  itemLabel: string;
  /** Plural of `itemLabel` for summaries ("2 spørgsmål"). Default: the same word. */
  plural?: string;
  item: Record<string, Field>;
  min?: number;
  max?: number;
  /** Field shown as the item's name in the editor ("Slet spørgsmålet 'X'?") */
  titleField?: string;
  /**
   * A list of plain strings (`- tekst` in YAML): set `scalar` (use `f.textList`) and leave `item` empty. The item
   * itself is the text, so its ref is e.g. "hero.tillid.2".
   */
  scalar?: TextField;
  /** Name of an id field that new and duplicated items get a fresh value for (Astro's file() loader needs `id`). */
  idField?: string;
  /**
   * Values given to new items, after the placeholders: hidden fields the editor does not show (e.g.
   * `{ kategori: "undervisning" }`) or a better start value for a shown field (e.g. `{ enhed: "kr." }`).
   */
  defaults?: Record<string, unknown>;
  /** The list may be missing in the YAML. */
  optional?: boolean;
  /** A number field in each item that holds its 1-based position, kept in step after every add, copy, move and delete. */
  orderField?: string;
};
export type Field = TextField | NumberField | ImageField | GroupField | ListField;

export type Collection = {
  label: string;
  dir: string;
  /** The entry is this one file in `dir` (e.g. "forside.yaml"). Without it, every `*.yaml` in `dir` is an entry. */
  file?: string;
  /**
   * "list": the file is a list at the top level (`- id: ...`). `fields` then has exactly one list field, and its key
   * stands for the whole file in refs and data (e.g. "punkter.2.svar" is item 2 of the file).
   */
  root?: "list";
  fields: Record<string, Field>;
};
export type CmsConfig = { site: string; collections: Record<string, Collection> };

/** Image value as stored in YAML. `src` is relative to the YAML file, as Astro's image() expects. */
export type ImageValue = { src: string; alt: string; fokus?: { x: number; y: number } };

// ---- The data type of a field, worked out from its definition ----
//
// The builders below keep what matters for the type (`optional: true`, `orderField: "order"`, the fields of a group
// or list item), so `defineCms()` gives a config whose collections have typed data: Astro's getEntry() and
// getCollection() see it through cmsCollection() (content.ts). `Img` is what an image's `src` becomes: a string in
// the YAML (the file API), Astro's image metadata in the site (`image()` in content.config.ts).

/** An image value with its `src` as `Img`. */
export type ImageData<Img = string> = { src: Img; alt: string; fokus?: { x: number; y: number } };
type IsOptional<F> = F extends { optional: true } ? true : false;
/** The position number of a list with `orderField`, optional in the CMS's own schema (the site may require it). */
export type OrderData<L> = L extends { orderField: infer O extends string } ? (string extends O ? {} : { [K in O]?: number }) : {};
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The value of one field. */
export type FieldValue<F, Img = string> =
  F extends { kind: "text" } ? string
    : F extends { kind: "number" } ? number
      : F extends { kind: "image" } ? ImageData<Img>
        : F extends { kind: "group"; fields: infer G } ? FieldsValue<G, Img>
          : F extends { kind: "list"; scalar: object } ? string[]
            : F extends { kind: "list"; item: infer I } ? Simplify<FieldsValue<I, Img> & OrderData<F>>[]
              : unknown;

/** The value of a record of fields: an optional field (`optional: true`) is an optional key. */
export type FieldsValue<G, Img = string> = Simplify<
  { -readonly [K in keyof G as IsOptional<G[K]> extends true ? never : K]: FieldValue<G[K], Img> }
  & { -readonly [K in keyof G as IsOptional<G[K]> extends true ? K : never]?: FieldValue<G[K], Img> }
>;

/** The list field of a `root: "list"` collection. */
export type RootList<C> = C extends { root: "list"; fields: infer Fs } ? Fs[keyof Fs] : never;

/**
 * The data of one Astro entry of a collection: the page, or for a root list one item (Astro's file() loader gives
 * one entry per item). Without the fields `extend` adds.
 */
export type CollectionData<C, Img = string> = C extends { root: "list" }
  ? RootList<C> extends { item: infer I } ? Simplify<FieldsValue<I, Img> & OrderData<RootList<C>>> : never
  : C extends { fields: infer Fs } ? FieldsValue<Fs, Img> : never;

type Opts<T> = Omit<T, "kind" | "label">;
type ListOpts = Partial<Omit<ListField, "kind" | "label" | "itemLabel" | "item">>;
/**
 * Field builders. The options are `const` type parameters, so `optional: true` and `orderField: "order"` stay
 * literal in the type; that is what makes a field optional or adds the position number in the data type.
 */
export const f = {
  text: <const O extends Opts<TextField> = {}>(label: string, o?: O) => ({ kind: "text", label, ...o }) as TextField & O & { kind: "text" },
  number: <const O extends Opts<NumberField> = {}>(label: string, o?: O) => ({ kind: "number", label, ...o }) as NumberField & O & { kind: "number" },
  image: <const O extends Opts<ImageField> = {}>(label: string, o?: O) => ({ kind: "image", label, ...o }) as ImageField & O & { kind: "image" },
  group: <const G extends Record<string, Field>>(label: string, fields: G) => ({ kind: "group", label, fields }) as Omit<GroupField, "fields"> & { fields: G },
  list: <const I extends Record<string, Field>, const O extends ListOpts = {}>(label: string, itemLabel: string, item: I, o?: O) =>
    ({ kind: "list", label, itemLabel, item, ...o }) as unknown as Omit<ListField, "item"> & O & { item: I },
  /** A list of plain strings. `scalar` options are those of a text field (max length per item, placeholders, ...). */
  textList: <const S extends Opts<TextField> = {}, const O extends Omit<ListOpts, "scalar"> = {}>(label: string, itemLabel: string, scalar?: S, o?: O) =>
    ({ kind: "list", label, itemLabel, item: {}, scalar: { kind: "text", label: itemLabel, ...scalar }, ...o }) as unknown as Omit<ListField, "item" | "scalar"> & O & { item: {}; scalar: TextField & S },
};

/** The site's CMS config. Generic, so the collections keep their field types (see `CollectionData`). */
export const defineCms = <const C extends CmsConfig>(c: C): C => c;

/** The one key of a `root: "list"` collection, or undefined for an ordinary collection. */
export function rootKey(c: Collection): string | undefined {
  if (c.root !== "list") return undefined;
  const keys = Object.keys(c.fields);
  if (keys.length !== 1 || c.fields[keys[0]].kind !== "list") throw new Error('A root: "list" collection needs exactly one field, and it must be a list');
  return keys[0];
}
/** What the editor and the schemas see for a parsed YAML value: for a root list, the list under its key. */
export const toView = (c: Collection, js: unknown): unknown => {
  const key = rootKey(c);
  return key ? { [key]: js } : js;
};
/** Path inside the YAML document for a field path of the view (the root key is dropped for a root list). */
export const docPath = <T>(c: Collection, parts: T[]): T[] => (rootKey(c) ? parts.slice(1) : parts);

/**
 * The entry of a collection with `file`, as the attribute helpers want it: `{ collection, id }`. Astro lower-cases
 * ids, so `gratisSamtale.yaml` gives "gratissamtale". Use it for a root list, whose items are separate Astro entries
 * but share one file: `item(entryOf(cms, "faq"), "punkter", i)`.
 */
export function entryOf(config: CmsConfig, name: string): { collection: string; id: string } {
  const c = Object.hasOwn(config.collections, name) ? config.collections[name] : undefined;
  if (!c?.file) throw new Error(`Collection "${name}" has no "file", so it has no single entry`);
  return { collection: name, id: c.file.replace(/\.ya?ml$/i, "").toLowerCase() };
}

/**
 * "hero.titel" or "faq.punkter.2.svar" → the field definition at that path, or undefined if the path is
 * not editable. A path ending in a list index ("faq.punkter.2") gives a group with the item's fields.
 */
export function fieldAt(fields: Record<string, Field>, path: string): Field | undefined {
  const parts = path.split(".");
  let scope: Record<string, Field> | undefined = fields;
  let current: Field | undefined;
  for (let i = 0; i < parts.length; i++) {
    // Own keys only, so "__proto__", "constructor" and the like never resolve to prototype members.
    if (!scope || !Object.hasOwn(scope, parts[i])) return undefined;
    current = scope[parts[i]];
    if (!current || typeof current !== "object") return undefined;
    if (current.kind === "group") scope = current.fields;
    else if (current.kind === "list") {
      const idx = parts[i + 1];
      if (idx === undefined) return current;
      if (!/^\d+$/.test(idx)) return undefined;
      i++;
      if (current.scalar) return i === parts.length - 1 ? current.scalar : undefined;
      if (i === parts.length - 1) return { kind: "group", label: current.itemLabel, fields: current.item };
      scope = current.item;
    } else scope = undefined;
  }
  return current;
}

/**
 * The items of a root list from Astro's getCollection(), in file order, each with its position in the file (the
 * index the CMS refs use: `item(entryOf(cms, "faq"), "punkter", index)`). getCollection() does not keep the file's
 * order, so the list needs `orderField`: the CMS keeps it equal to the position (1, 2, 3 …) after every change, and
 * refuses to save or publish a file where it is not (see orderIssues()).
 */
export function inFileOrder<T extends { data: Record<string, unknown> }>(config: CmsConfig, name: string, entries: T[]): { entry: T; index: number }[] {
  const c = Object.hasOwn(config.collections, name) ? config.collections[name] : undefined;
  const key = c ? rootKey(c) : undefined;
  const list = key ? c!.fields[key] : undefined;
  if (list?.kind !== "list" || !list.orderField) {
    throw new Error(`inFileOrder("${name}"): needs a root list with orderField, because getCollection() does not keep the file order`);
  }
  const order = list.orderField;
  return entries.map((entry) => ({ entry, index: Number(entry.data[order]) - 1 })).sort((a, b) => a.index - b.index);
}

/**
 * Lists with `orderField` must number their items 1, 2, 3 … in the order they stand in the file, or the page (which
 * sorts by the number) and the CMS (which edits by position) would point at different items. Returns Danish problems.
 */
export function orderIssues(fields: Record<string, Field>, value: unknown): string[] {
  const issues: string[] = [];
  const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
  for (const [k, def] of Object.entries(fields)) {
    const v = obj(value)?.[k];
    if (def.kind === "group") issues.push(...orderIssues(def.fields, v));
    if (def.kind !== "list" || !Array.isArray(v)) continue;
    if (def.orderField && v.some((item, i) => obj(item)?.[def.orderField!] !== i + 1)) {
      issues.push(`Rækkefølgen i "${def.label}" passer ikke med filen: ${def.orderField} skal være 1, 2, 3 … i den rækkefølge, de står. Kontakt Sinding Mind.`);
    }
    if (!def.scalar) for (const item of v) issues.push(...orderIssues(def.item, item));
  }
  return issues;
}

/** False for a text that must not be typed on the page (see `TextField.inline`). */
export const isInlineEditable = (field: Field | undefined): boolean =>
  field?.kind === "text" && field.inline !== false && !field.placeholders?.length;

/** A placeholder name: letters, digits, "-" and "_" (e.g. "klippekort-5"). */
export const PLACEHOLDER_NAME = /^[A-Za-z0-9_-]+$/;

/** The placeholders written in a text, in order, without braces: "Pris {modul}, {timepris}" → ["modul", "timepris"]. */
export const placeholdersIn = (text: string): string[] => [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);

/**
 * Danish problems with the placeholders in a text, or [] if it is fine. Used by the schema (on save and in the
 * build) and by the editor (while typing), so both say the same thing.
 */
export function placeholderIssues(text: string, allowed: readonly string[]): string[] {
  const issues: string[] = [];
  const unknown = [...new Set(placeholdersIn(text).filter((n) => !allowed.includes(n)))];
  if (unknown.length) {
    issues.push(`Ukendt pladsholder: ${unknown.map((n) => `{${n}}`).join(", ")}. Brug kun ${allowed.map((n) => `{${n}}`).join(", ")}`);
  }
  // A brace that is not part of a {name} is most often a placeholder that lost its other half.
  if (/[{}]/.test(text.replace(/\{[^{}]*\}/g, ""))) issues.push("Der er en { eller } for meget. En pladsholder skrives som {navn}");
  return issues;
}
