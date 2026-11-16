// What an editor may change, with labels. Two kinds of collections, so both paths are built:
// - `pages`: a folder collection (every *.yaml in src/content/pages is one entry).
// - `faq`: a root list in one file, with a position number (orderField) and hidden fields added in content.config.ts.
import { defineCms, f } from "@sindingmind/cms-astro/schema";

export default defineCms({
  site: "Fixture",
  collections: {
    pages: {
      label: "Pages",
      dir: "src/content/pages",
      fields: {
        title: f.text("Page title", { max: 70 }),
        hero: f.group("Top of the page", {
          heading: f.text("Heading", { max: 60 }),
          lead: f.text("Lead", { max: 200, multiline: true, optional: true }),
          points: f.textList("Points", "Point", { max: 60 }, { min: 1, max: 5 }),
          count: f.number("Count", { min: 0 }),
        }),
        cards: f.list("Cards", "Card", {
          name: f.text("Name", { max: 40 }),
          text: f.text("Text", { max: 200 }),
        }, { min: 1, max: 4, titleField: "name" }),
      },
    },
    faq: {
      label: "Questions",
      dir: "src/content",
      file: "faq.yaml",
      root: "list",
      fields: {
        items: f.list("Questions", "Question", {
          question: f.text("Question", { max: 120 }),
          answer: f.text("Answer", { max: 600, placeholders: ["price"] }),
        }, { idField: "id", orderField: "order", defaults: { draft: false } }),
      },
    },
  },
});
