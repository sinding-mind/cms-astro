// Field definitions and Zod schemas: what the build and the editor both validate with.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "astro/zod";
import {
  defineCms, entryOf, f, fieldAt, inFileOrder, isInlineEditable, objectOf, orderIssues, placeholderIssues, placeholdersIn, schemaOf, toZod,
} from "../src/schema.ts";
import { cmsCollection } from "../src/content.ts";

const str = () => z.string();
const cms = defineCms({
  site: "Test",
  collections: {
    pages: {
      label: "Pages",
      dir: "src/content/pages",
      fields: {
        title: f.text("Title", { max: 10 }),
        lead: f.text("Lead", { optional: true }),
        count: f.number("Count", { min: 1, max: 3 }),
        photo: f.image("Photo", { altMax: 5 }),
        points: f.textList("Points", "Point", { max: 8 }, { min: 1, max: 2 }),
        cards: f.list("Cards", "Card", { name: f.text("Name") }, { orderField: "order" }),
        group: f.group("Group", { inner: f.text("Inner") }),
      },
    },
    faq: {
      label: "FAQ",
      dir: "src/content",
      file: "Faq.yaml",
      root: "list",
      fields: { items: f.list("Questions", "Question", { q: f.text("Q", { placeholders: ["price"] }) }, { orderField: "order" }) },
    },
  },
});
const page = objectOf(cms.collections.pages.fields, str);
const valid = {
  title: "Hi", count: 2, photo: { src: "a.jpg", alt: "Alt" }, points: ["One"], cards: [{ name: "A", order: 1 }], group: { inner: "x" },
};
const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];

test("a valid page passes, optional fields may be missing", () => {
  assert.equal(page.safeParse(valid).success, true);
});

test("Danish messages for empty, too long, missing, wrong type and limits", () => {
  assert.deepEqual(messages(page.safeParse({ ...valid, title: " " })), ["Title må ikke være tom"]);
  assert.deepEqual(messages(page.safeParse({ ...valid, title: "x".repeat(11) })), ["Title må højst være 10 tegn"]);
  assert.deepEqual(messages(page.safeParse({ ...valid, title: undefined })), ["Title mangler"]);
  assert.deepEqual(messages(page.safeParse({ ...valid, count: "2" })), ["Count skal være et tal"]);
  assert.deepEqual(messages(page.safeParse({ ...valid, count: 4 })), ["Count må højst være 3"]);
  assert.deepEqual(messages(page.safeParse({ ...valid, points: [] })), ['Der skal være mindst 1 i "Points"']);
  assert.deepEqual(messages(page.safeParse({ ...valid, photo: { src: "a.jpg", alt: "Too long" } })), ['Alt-teksten til "Photo" må højst være 5 tegn']);
  assert.deepEqual(messages(page.safeParse({ ...valid, photo: { src: "a.jpg", alt: "" } })), ["Skriv en alt-tekst, der beskriver billedet"]);
});

test("an image's fokus is optional with no default", () => {
  const r = page.parse(valid);
  assert.equal("fokus" in r.photo, false);
  assert.equal(page.safeParse({ ...valid, photo: { src: "a", alt: "b", fokus: { x: 101, y: 0 } } }).success, false);
});

test("placeholders: only the named ones, no stray braces", () => {
  assert.deepEqual(placeholdersIn("A {price} and {x}"), ["price", "x"]);
  assert.deepEqual(placeholderIssues("Costs {price}.", ["price"]), []);
  assert.equal(placeholderIssues("Costs {cost}.", ["price"]).length, 1);
  assert.equal(placeholderIssues("Costs {price.", ["price"]).length, 1);
  const q = toZod(cms.collections.faq.fields.items, str);
  assert.equal(q.safeParse([{ q: "{price}" }]).success, true);
  assert.equal(q.safeParse([{ q: "{pris}" }]).success, false);
  assert.equal(isInlineEditable(cms.collections.faq.fields.items.item.q), false);
  assert.equal(isInlineEditable(cms.collections.pages.fields.title), true);
});

test("fieldAt resolves paths, list items and text-list items, never prototype members", () => {
  const fields = cms.collections.pages.fields;
  assert.equal(fieldAt(fields, "group.inner")?.label, "Inner");
  assert.equal(fieldAt(fields, "cards.0")?.kind, "group");
  assert.equal(fieldAt(fields, "cards.0.name")?.label, "Name");
  assert.equal(fieldAt(fields, "points.1")?.kind, "text");
  assert.equal(fieldAt(fields, "points.x"), undefined);
  assert.equal(fieldAt(fields, "__proto__"), undefined);
  assert.equal(fieldAt(fields, "constructor"), undefined);
});

test("root lists: entryOf lower-cases the id, inFileOrder sorts by position, orderIssues finds wrong numbers", () => {
  assert.deepEqual(entryOf(cms, "faq"), { collection: "faq", id: "faq" });
  assert.throws(() => entryOf(cms, "pages"));
  const entries = [{ data: { order: 2 } }, { data: { order: 1 } }];
  assert.deepEqual(inFileOrder(cms, "faq", entries).map((e) => e.index), [0, 1]);
  assert.throws(() => inFileOrder(cms, "pages", entries));
  assert.deepEqual(orderIssues(cms.collections.pages.fields, { cards: [{ order: 1 }, { order: 2 }] }), []);
  assert.equal(orderIssues(cms.collections.pages.fields, { cards: [{ order: 2 }, { order: 1 }] }).length, 1);
  const item = schemaOf(cms.collections.faq, str);
  assert.deepEqual(item.parse({ q: "x", order: 1 }), { q: "x", order: 1 });
});

test("cmsCollection refuses unknown collections and a root list without a file", () => {
  assert.throws(() => cmsCollection(cms, "missing" as "faq"), /no collection "missing"/);
  const bad = defineCms({ site: "x", collections: { l: { label: "L", dir: "d", root: "list", fields: { a: f.list("A", "A", {}) } } } });
  assert.throws(() => cmsCollection(bad, "l"), /needs "file"/);
});
