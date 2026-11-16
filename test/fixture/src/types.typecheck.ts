// Type test against Astro's own generated types (after `astro sync`), with the package as a site gets it from npm
// (dist/*.d.ts). Checked by tsc in test/fixture.test.ts, never run.
import { getCollection, getEntry } from "astro:content";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const expect = <T extends true>(): T | void => undefined;

const page = (await getEntry("pages", "home"))!;
expect<Equal<typeof page.data, {
  title: string;
  hero: { heading: string; lead?: string | undefined; points: string[]; count: number };
  cards: { name: string; text: string }[];
}>>();
// @ts-expect-error: an optional text may be missing
const lead: string = page.data.hero.lead;

const faq = await getCollection("faq");
expect<Equal<(typeof faq)[number]["data"], { question: string; answer: string; order: number; draft: boolean }>>();
// @ts-expect-error: not a field
faq[0].data.missing;
void lead;
