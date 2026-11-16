// Astro content collections from cms.config.ts, so the loader and the schema always match what the CMS reads and
// writes. Use it in the site's content.config.ts:
//
//   import { defineCollection } from "astro:content";
//   import { cmsCollection } from "@sindingmind/cms-astro/content";
//   import cms from "../cms.config.ts";
//   export const collections = {
//     forside: defineCollection(cmsCollection(cms, "forside")),
//     faq: defineCollection(cmsCollection(cms, "faq", { extend: (s) => s.extend({ kategori: z.string() }) })),
//   };
//
// - A folder collection (no `file`) is `glob("*.yaml")` in `dir`: one entry per file.
// - A page (`file`) is `glob(file)` in `dir`: one entry, whose id is the file name lower-cased, as everywhere else.
// - A root list (`root: "list"`) is `file(dir/file)`: one Astro entry per item (each item needs an `id`), and the
//   schema is the item's. The CMS still sees the whole file as one entry (see entryOf()).
//
// Types: the schema is typed from the fields (see CollectionSchema in schema.ts), so `getEntry()` and
// `getCollection()` give typed data, with what `extend` adds on top. `name` must be a collection of the config.
import { file, glob } from "astro/loaders";
import type { SchemaContext } from "astro/content/config";
import type { z } from "astro/zod";
import { schemaOf, type CmsConfig, type CollectionSchema, type ImageOf } from "./schema.ts";

/** Astro's `image()` helper, as content.config.ts gets it. */
type AstroImage = SchemaContext["image"];
/** The CMS's schema of a collection as the site's content.config.ts gets it (`src` of an image is Astro's image). */
export type CmsSchema<C extends CmsConfig, N extends keyof C["collections"]> = CollectionSchema<C["collections"][N], ImageOf<AstroImage>>;

export type CmsCollectionOptions<B = z.ZodTypeAny, S = z.ZodTypeAny> = {
  /** Adds what the CMS does not edit: hidden fields of root-list items, locked page fields. Gets the CMS's schema. */
  extend?: (schema: B, context: SchemaContext) => S;
};

export function cmsCollection<
  const C extends CmsConfig,
  N extends keyof C["collections"] & string,
  S = CmsSchema<C, N>,
>(config: C, name: N, options: CmsCollectionOptions<CmsSchema<C, N>, S> = {}) {
  if (!Object.hasOwn(config.collections, name)) throw new Error(`cms.config has no collection "${name}"`);
  const collection = config.collections[name];
  const base = collection.dir.replace(/\/+$/, "");
  if (collection.root === "list" && !collection.file) throw new Error(`Collection "${name}": a root list needs "file"`);
  const loader = collection.root === "list" ? file(`${base}/${collection.file}`) : glob({ pattern: collection.file ?? "*.yaml", base });
  return {
    loader,
    schema: (context: SchemaContext): S => {
      const schema = schemaOf(collection, context.image) as unknown as CmsSchema<C, N>;
      return options.extend ? options.extend(schema, context) : (schema as unknown as S);
    },
  };
}
