# @sindingmind/cms-astro

The open part of the Sinding Mind CMS, a click-to-edit CMS for static [Astro](https://astro.build) sites.

Editable texts, lists and images live in YAML files with a schema in the site's own repository. This package gives a
site everything it needs to **build** with that content, and to **mark** its pages for a visual editor:

- field definitions (`defineCms`, `f.*`) and the Zod schemas built from them, with typed data in `getEntry()` and
  `getCollection()`,
- Astro content collections from the same config (`cmsCollection`),
- attribute helpers for templates (`field`, `list`, `item`, `image`) and `isCmsEditing()` for client scripts,
- an Astro integration that, only in a preview (`astro dev` with `CMS_PREVIEW=1`), marks the page and loads a small
  bridge script for the editor.

In a production build the package adds nothing: the HTML and every file in `dist/` are byte for byte what the site
would be without it.

The editor itself (the editing UI, the preview runner, the file API, image processing, login and publishing) is a
**separate, closed service** run by Sinding Mind ApS. It is not in this package and not needed to build a site. A
site that stops using the service keeps building with `astro build` as before.

MIT licensed. The validation messages are in Danish, because the editor is.

## Install

```bash
npm install --save-exact @sindingmind/cms-astro
```

Needs Astro 7.3 or newer (a peer dependency). Pin the exact version and update it deliberately.

## Use

### 1. `cms.config.ts`: what may be edited

```ts
import { defineCms, f } from "@sindingmind/cms-astro/schema";

export default defineCms({
  site: "Example Co.",
  collections: {
    pages: {
      label: "Sider",
      dir: "src/content/pages", // a folder: every *.yaml in it is one entry
      fields: {
        hero: f.group("Toppen af siden", {
          heading: f.text("Overskrift", { max: 60 }),
          lead: f.text("Indledning", { max: 220, multiline: true, optional: true }),
          points: f.textList("Punkter", "Punkt", { max: 60 }, { min: 1, max: 5 }),
          photo: f.image("Foto", { altMax: 200 }),
        }),
        prices: f.list("Priser", "Pris", {
          name: f.text("Navn", { max: 40 }),
          amount: f.number("Beløb", { min: 0 }),
        }, { min: 1, max: 4, titleField: "name" }),
      },
    },
    faq: {
      label: "Spørgsmål",
      dir: "src/content",
      file: "faq.yaml", // one file
      root: "list",     // the file is a list at the top level (`- id: ...`)
      fields: {
        items: f.list("Spørgsmål", "Spørgsmål", {
          question: f.text("Spørgsmål", { max: 120 }),
          answer: f.text("Svar", { max: 800, placeholders: ["price"] }),
        }, { idField: "id", orderField: "order" }),
      },
    },
  },
});
```

Field types: `f.text`, `f.number`, `f.image`, `f.group`, `f.list` and `f.textList` (a list of plain strings). Options
include `max`/`min`, `optional`, `multiline`, `help`, `placeholders` (only these `{names}` may appear in a text),
`inline: false` (edit in the panel only), and for lists `titleField`, `idField`, `defaults`, `plural` and
`orderField` (a position number kept equal to the item's place in the file).

### 2. `src/content.config.ts`: collections from the same config

```ts
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { cmsCollection } from "@sindingmind/cms-astro/content";
import cms from "../cms.config.ts";

export const collections = {
  pages: defineCollection(cmsCollection(cms, "pages")),
  // Fields the CMS does not show are added with `extend`, or Zod drops them.
  faq: defineCollection(cmsCollection(cms, "faq", {
    extend: (s) => s.extend({ order: z.number().int().min(1) }),
  })),
};
```

A folder collection is `glob("*.yaml")`, a `file` collection is `glob(file)`, and a root list is Astro's `file()`
loader with the item's schema. The data is typed from the fields, so no casts are needed.

### 3. `astro.config.ts`: the integration

```ts
import { defineConfig } from "astro/config";
import cms from "@sindingmind/cms-astro";

export default defineConfig({
  output: "static",
  integrations: [cms()],
});
```

Options: `editorOrigin` (the origin allowed to frame and talk to the preview; the `CMS_EDITOR_ORIGIN` environment
variable wins) and `keepMotion` (keep CSS animations in the preview).

### 4. Templates: the attribute helpers

```astro
---
import { getCollection, getEntry } from "astro:content";
import { field, list, item, image, fokus } from "@sindingmind/cms-astro/attrs";
import { entryOf, inFileOrder } from "@sindingmind/cms-astro/schema";
import cms from "../../cms.config.ts";

const page = (await getEntry("pages", "home"))!;
const { hero } = page.data;
const faq = entryOf(cms, "faq");
---
<h1 {...field(page, "hero.heading")}>{hero.heading}</h1>
<ul {...list(page, "hero.points")}>
  {hero.points.map((p, i) => <li {...item(page, "hero.points", i)} {...field(page, `hero.points.${i}`)}>{p}</li>)}
</ul>
<img src={hero.photo.src.src} alt={hero.photo.alt} style={fokus(hero.photo)} {...image(page, "hero.photo")} />
<dl {...list(faq, "items")}>
  {inFileOrder(cms, "faq", await getCollection("faq")).map(({ entry, index }) => (
    <div {...item(faq, "items", index)}>
      <dt {...field(faq, `items.${index}.question`)}>{entry.data.question}</dt>
      <dd>{entry.data.answer}</dd>
    </div>
  ))}
</dl>
```

Outside the preview every helper returns `{}`. `item()` takes the item's position in the YAML file, not on the page.
Astro's `getCollection()` does not keep a `file()` list's order, so a root list shown on a page needs `orderField`, and
`inFileOrder()` sorts the entries and gives each its file position.

### 5. Editing mode in client scripts: `isCmsEditing()`

In the preview, `<html>` gets `data-cms-editing` before the site's scripts run, CSS animations and transitions finish
at once, and every `<details>` is opened. JavaScript animations are the site's own job:

```astro
<script>
  import { isCmsEditing } from "@sindingmind/cms-astro/attrs";
  if (!isCmsEditing()) startTypingEffect();
</script>
```

In a build the integration replaces every call `isCmsEditing()` with the literal `false` in the modules that import
it, so the check and the helper module disappear from the output, also when several page scripts import it. Call it
directly; a value use (`const f = isCmsEditing`) or a namespace import still works but is not folded away. For CSS,
use `html[data-cms-editing] .x { ... }`.

## Invariants

These are tested on every change (`test/fixture.test.ts`, on a small Astro site with the package installed from the
files the npm tarball contains):

- **A production build is byte-identical to the site without the package.** Every file in `dist/` (names and bytes)
  equals a build with the integration removed, no-op attribute helpers and `isCmsEditing()` written as `false`. No
  `data-cms-*` attribute, no `__CMS__`, no bridge, no editing stylesheet and no chunk with the helpers is built. Two
  builds are also byte-identical to each other.
- `CMS_PREVIEW=1` has no effect outside `astro dev`.
- The package has no runtime dependencies, makes no network calls and needs no account. It does not write files.

## Security

- The preview marks are added only by `astro dev` with `CMS_PREVIEW=1`. Do not expose such a dev server to the
  internet; the closed editor service runs it behind its own login.
- The bridge (the script injected into the preview) talks to the editor with `postMessage` only. It accepts messages
  only from `window.parent` **and** from the configured editor origin, and only after a handshake that gives it a
  nonce; every later message must carry that nonce. Its own messages go to the editor origin only.
- Messages are plain data. The bridge never inserts HTML it receives: texts are set with `textContent`, and an element
  that contains other elements (a link, a `<mark>`) is never typed into or patched.
- The editor origin must be a bare origin (`https://editor.example`); anything else stops the dev server, because it
  is written into an inline script.
- The overlay lives in a shadow DOM, so the site's CSS cannot reach it.

Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Development

```bash
npm install
npm test           # builds dist/, then unit tests and the fixture site (production build, types, astro dev)
npm run typecheck  # tsc on the sources and the type tests
npm pack --dry-run # what would be published
```

The package is compiled to JavaScript and `.d.ts` files in `dist/` (`npm run build`, also run by `prepack`). Releases:
[docs/RELEASING.md](docs/RELEASING.md).

## Licence

[MIT](LICENSE), Copyright (c) 2026 Sinding Mind ApS.
