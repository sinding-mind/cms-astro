// Type test: the data type of a collection comes from its fields, so Astro's getEntry() and
// getCollection() are typed without casts. Checked by `npm run typecheck` (tsc), never run. Each line marked
// with the expect-error directive fails the check if it stops being an error, so the negative cases are proven too.
// test/fixture.test.ts also checks test/fixture/src/types.typecheck.ts against Astro's own generated types, with
// the package installed from its tarball contents (dist/*.d.ts), as a site gets it from npm.
import { z } from "astro/zod";
import { cmsCollection } from "../src/content.ts";
import { defineCms, f, objectOf, toZod, type FieldValue } from "../src/schema.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const expect = <T extends true>(): T | void => undefined;
/** What Astro does with a collection's schema (`InferEntrySchema` in .astro/content.d.ts). */
type Data<X> = X extends { schema: (...args: never[]) => infer S } ? z.infer<S> : never;
/** Astro's image() output: what an image field's `src` is in the site. */
type AstroImage = { src: string; width: number; height: number; format: "png" | "jpg" | "jpeg" | "tiff" | "webp" | "gif" | "svg" | "avif" | "apng" };
type Fokus = { x: number; y: number };

const cms = defineCms({
  site: "Typetest",
  collections: {
    side: {
      label: "Side",
      dir: "src/content/sider",
      file: "side.yaml",
      fields: {
        meta: f.group("Meta", { titel: f.text("Titel", { max: 70 }), beskrivelse: f.text("Beskrivelse", { optional: true }) }),
        hero: f.group("Top", {
          titel: f.text("Overskrift"),
          antal: f.number("Antal", { min: 0 }),
          valgfrittTal: f.number("Valgfrit tal", { optional: true }),
          tillid: f.textList("Tillid", "Punkt", { max: 40 }, { min: 1 }),
          ekstra: f.textList("Ekstra", "Punkt", {}, { optional: true }),
          foto: f.image("Foto", { altMax: 120 }),
        }),
        kort: f.list("Kort", "Kort", {
          navn: f.text("Navn"),
          chip: f.text("Mærkat", { optional: true }),
          punkter: f.textList("Punkter", "Punkt", {}, { optional: true }),
        }, { min: 1, orderField: "nr" }),
      },
    },
    faq: {
      label: "FAQ",
      dir: "src/content",
      file: "faq.yaml",
      root: "list",
      fields: {
        punkter: f.list("Spørgsmål", "Spørgsmål", {
          spoergsmaal: f.text("Spørgsmål"),
          svar: f.text("Svar", { placeholders: ["pris"] }),
          billede: f.image("Billede"),
        }, { idField: "id", orderField: "order", defaults: { kategori: "a" } }),
      },
    },
  },
});

// ---- A page: groups, optional fields, text lists, a list with a position number, an image ----
const side = cmsCollection(cms, "side");
type Side = Data<typeof side>;
expect<Equal<Side, {
  meta: { titel: string; beskrivelse?: string | undefined };
  hero: {
    titel: string;
    antal: number;
    valgfrittTal?: number | undefined;
    tillid: string[];
    ekstra?: string[] | undefined;
    foto: { src: AstroImage; alt: string; fokus?: Fokus };
  };
  kort: { navn: string; chip?: string; punkter?: string[]; nr?: number }[];
}>>();

declare const s: Side;
const titel: string = s.hero.titel;
const tillid: string[] = s.hero.tillid;
const bredde: number = s.hero.foto.src.width;
const fokusX: number | undefined = s.hero.foto.fokus?.x;
// @ts-expect-error: an optional text may be missing
const beskrivelse: string = s.meta.beskrivelse;
// @ts-expect-error: an optional list may be missing
const ekstra: string[] = s.hero.ekstra;
// @ts-expect-error: fokus is optional (no default): "not chosen" is a real state
const fokus: Fokus = s.hero.foto.fokus;
// @ts-expect-error: a field that is not in the config does not exist
s.hero.findesIkke;
// @ts-expect-error: a text is not a number
const antal: string = s.hero.antal;
void [titel, tillid, bredde, fokusX, beskrivelse, ekstra, fokus, antal];

// ---- A root list: one entry per item, with the position number, and what `extend` adds ----
const faq = cmsCollection(cms, "faq", {
  extend: (schema) => schema.extend({ kategori: z.enum(["a", "b"]), order: z.number().int().min(1), links: z.array(z.string()).default([]) }),
});
type Faq = Data<typeof faq>;
expect<Equal<Faq, {
  spoergsmaal: string;
  svar: string;
  billede: { src: AstroImage; alt: string; fokus?: Fokus };
  order: number;
  kategori: "a" | "b";
  links: string[];
}>>();
// Without extend the position number is optional, as the CMS's own schema has it.
expect<Equal<Data<ReturnType<typeof cmsCollection<typeof cms, "faq">>>["order"], number | undefined>>();

// ---- Wrong use is a type error ----
// @ts-expect-error: not a collection of the config
cmsCollection(cms, "findesIkke");
// @ts-expect-error: extend gets the CMS's ZodObject, so a wrong method is caught
cmsCollection(cms, "faq", { extend: (schema) => schema.extendNot({}) });

// ---- The file API's side: `src` is the string in the YAML ----
const fileApi = objectOf(cms.collections.side.fields, () => z.string());
expect<Equal<z.infer<typeof fileApi>["hero"]["foto"]["src"], string>>();
expect<Equal<z.infer<ReturnType<typeof toZod<typeof cms.collections.side.fields.kort, () => z.ZodString>>>[number]["chip"], string | undefined>>();
expect<Equal<FieldValue<ReturnType<typeof f.textList>>, string[]>>();
