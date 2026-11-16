// foldEditingCalls(): every isCmsEditing() call in a module that imports it from the attrs module becomes a literal.
// The parser is Rolldown's (the one Vite 8 gives a plugin as `this.parse`). The real build is proven by
// `npm run verify` (two page scripts import the check; no shared chunk, byte-identical to the site without it).
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAst } from "rolldown/parseAst";
import { foldEditingCalls } from "../src/editing-flag.ts";

const parse = (code: string) => parseAst(code);
const fold = (code: string, value = false) => foldEditingCalls(code, parse, value);

test("replaces every call, also under an `as` name, and keeps the rest", () => {
  const code = [
    `import { isCmsEditing, field } from "@sindingmind/cms-astro/attrs";`,
    `import { isCmsEditing as editing } from "@sindingmind/cms-astro/attrs";`,
    `// æøå before the call, so the offsets must be UTF-16`,
    `const s = "æøå";`,
    `if (!isCmsEditing() && !reduce) run();`,
    `const x = editing() ? 1 : 2; const y = isCmsEditing().toString();`,
  ].join("\n");
  const out = fold(code)!;
  assert.match(out, /if \(!\(false\) && !reduce\) run\(\);/);
  assert.match(out, /const x = \(false\) \? 1 : 2; const y = \(false\)\.toString\(\);/);
  assert.match(out, /const s = "æøå";/);
  assert.doesNotMatch(out, /isCmsEditing\(\)|editing\(\)/);
  parse(out); // still valid JavaScript
});

test("true in the preview", () => {
  assert.match(fold(`import { isCmsEditing } from "@sindingmind/cms-astro/attrs"; f(isCmsEditing());`, true)!, /f\(\(true\)\)/);
});

test("leaves modules alone that do not import it from the attrs module", () => {
  assert.equal(fold(`const isCmsEditing = () => true; isCmsEditing(); "@sindingmind/cms-astro/attrs";`), undefined);
  assert.equal(fold(`import { isCmsEditing } from "./my-own.ts"; isCmsEditing(); // @sindingmind/cms-astro/attrs`), undefined);
  assert.equal(fold(`import { field } from "@sindingmind/cms-astro/attrs"; field(e, "x");`), undefined);
});

test("does not touch a call with arguments, a value use, or text in a string", () => {
  const code = `import { isCmsEditing } from "@sindingmind/cms-astro/attrs"; const f = isCmsEditing; g(isCmsEditing(1)); h("isCmsEditing()");`;
  assert.equal(fold(code), undefined);
});
