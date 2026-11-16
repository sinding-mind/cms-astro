// One field definition gives both the Zod schema (used by Astro at build and by the file API on save)
// and the UI metadata the editor needs. Definitions are plain JSON so they can be sent to the editor.
import { z } from "astro/zod";
import { altMaxOf, placeholderIssues, rootKey, type Collection, type Field, type FieldValue, type ListField, type RootList } from "./fields.ts";

export * from "./fields.ts";

// `image` is Astro's image() helper at build time. The file API passes a plain string check instead,
// because it validates the raw YAML value, not the resolved image.
export type ImageSchema = () => z.ZodTypeAny;
/** What an image's `src` becomes with this `image` helper: a string in the file API, image metadata in Astro. */
export type ImageOf<I> = I extends () => infer S ? (S extends z.ZodTypeAny ? z.output<S> : unknown) : unknown;

// ---- Typed schemas ----
// The Zod schema of a field has the data type of the field (FieldValue in fields.ts). An optional field is a
// ZodOptional, so z.object() makes its key optional. A record of fields is a ZodObject with one schema per key, so
// the site's `extend: (s) => s.extend({...})` keeps every type. At runtime nothing changes: the types are casts on
// the schemas built below.

/** The schema of one field. */
export type ZodFor<F, Img> = F extends { optional: true } ? z.ZodOptional<z.ZodType<FieldValue<F, Img>>> : z.ZodType<FieldValue<F, Img>>;
/** The shape of a ZodObject for a record of fields. */
export type ShapeOf<G, Img> = { -readonly [K in keyof G]: ZodFor<G[K], Img> };
/** The position number's schema in a list item (`orderField`). */
type OrderShape<L> = L extends { orderField: infer O extends string } ? (string extends O ? {} : { [K in O]: z.ZodOptional<z.ZodNumber> }) : {};
/** The schema of a collection's Astro entry: the page, or one item of a root list. */
export type CollectionSchema<C, Img> = C extends { root: "list" }
  ? RootList<C> extends { item: infer I } ? z.ZodObject<ShapeOf<I, Img> & OrderShape<RootList<C>>> : never
  : C extends { fields: infer Fs } ? z.ZodObject<ShapeOf<Fs, Img>> : never;

/** Danish messages for a missing value or one of the wrong type (Zod's own are English). */
const typed = (label: string, what: string) => ({
  error: (issue: { input?: unknown }) => (issue.input === undefined ? `${label} mangler` : `${label} skal være ${what}`),
});

/** The Zod schema of one field, typed from the definition. */
export function toZod<F extends Field, I extends ImageSchema>(field: F, image: I): ZodFor<F, ImageOf<I>> {
  return zodOf(field, image) as unknown as ZodFor<F, ImageOf<I>>;
}

function zodOf(field: Field, image: ImageSchema): z.ZodTypeAny {
  switch (field.kind) {
    case "text": {
      let s = z.string(typed(field.label, "tekst")).trim();
      // An optional text may be missing or empty (the site then leaves it out); a required one may not be empty.
      if (!field.optional) s = s.min(1, `${field.label} må ikke være tom`);
      if (field.max) s = s.max(field.max, `${field.label} må højst være ${field.max} tegn`);
      const allowed = field.placeholders;
      if (allowed?.length) {
        s = s.superRefine((value, ctx) => {
          for (const message of placeholderIssues(value, allowed)) ctx.addIssue({ code: "custom", message: `${field.label}: ${message}` });
        });
      }
      return field.optional ? s.optional() : s;
    }
    case "number": {
      let s = z.number(typed(field.label, "et tal"));
      if (field.min !== undefined) s = s.min(field.min, `${field.label} skal være mindst ${field.min}`);
      if (field.max !== undefined) s = s.max(field.max, `${field.label} må højst være ${field.max}`);
      return field.optional ? s.optional() : s;
    }
    case "image":
      return z.object({
        src: image(),
        alt: z.string().trim().min(1, "Skriv en alt-tekst, der beskriver billedet")
          .max(altMaxOf(field), `Alt-teksten til "${field.label}" må højst være ${altMaxOf(field)} tegn`),
        // No default: "not chosen" (missing) is not the same as "the middle", and the CMS must never write a focus
        // point the user did not set. fokus() in attrs.ts falls back to the middle for the page.
        fokus: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).optional(),
      }, typed(field.label, "et billede"));
    case "group":
      return objectOfAny(field.fields, image, field.label);
    case "list": {
      let s = z.array(field.scalar ? zodOf(field.scalar, image) : itemOf(field, image), typed(`"${field.label}"`, "en liste"));
      if (field.min !== undefined) s = s.min(field.min, `Der skal være mindst ${field.min} i "${field.label}"`);
      if (field.max !== undefined) s = s.max(field.max, `Der må højst være ${field.max} i "${field.label}"`);
      return field.optional ? s.optional() : s;
    }
  }
}

/** The ZodObject for a record of fields (a page, a group), typed from the definitions. */
export function objectOf<G extends Record<string, Field>, I extends ImageSchema>(fields: G, image: I, label?: string): z.ZodObject<ShapeOf<G, ImageOf<I>>> {
  return objectOfAny(fields, image, label) as unknown as z.ZodObject<ShapeOf<G, ImageOf<I>>>;
}

function objectOfAny(fields: Record<string, Field>, image: ImageSchema, label?: string) {
  const shape = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, zodOf(v, image)]));
  return label ? z.object(shape, typed(label, "en gruppe af felter")) : z.object(shape);
}

/** One item of a list of objects. The position number (`orderField`) is kept in the data, so the site can sort by it. */
function itemOf(list: ListField, image: ImageSchema) {
  const item = objectOfAny(list.item, image, list.itemLabel);
  return list.orderField ? item.extend({ [list.orderField]: z.number().int().min(1).optional() }) : item;
}

/**
 * The schema Astro needs for one collection. A page (`file`, or a folder of files) is validated as a whole. A root
 * list is loaded by Astro's file() loader, which validates each item on its own, so this is the item's schema.
 * Fields the CMS does not show (ids, categories, flags) are not in it: add them with `.extend({...})`, or Zod drops
 * them from the data.
 */
export function schemaOf<C extends Collection, I extends ImageSchema>(collection: C, image: I): CollectionSchema<C, ImageOf<I>> {
  const key = rootKey(collection);
  if (!key) return objectOfAny(collection.fields, image) as unknown as CollectionSchema<C, ImageOf<I>>;
  const list = collection.fields[key];
  if (list.kind !== "list" || list.scalar) throw new Error('Astro\'s file() loader needs a root list of objects (each with an "id")');
  return itemOf(list, image) as unknown as CollectionSchema<C, ImageOf<I>>;
}
