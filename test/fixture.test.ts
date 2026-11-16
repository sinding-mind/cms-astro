// The package as a site gets it from npm, in a small Astro site (test/fixture). Proves the invariants:
//
// 1. Production build: no CMS traces in any file in dist/ (no data-cms-*, __CMS__, bridge, editing style,
//    virtual module), two builds are byte-identical, and a build without the package (integration not loaded,
//    no-op attribute helpers, `isCmsEditing()` written as `false`) is byte-identical too. Both pages have a client
//    script that calls `isCmsEditing()`, so without the folding plugin Rolldown would build a shared chunk with the
//    helper; the test asserts there is none.
// 2. Types: the published .d.ts files type a site's collections (tsc against Astro's generated types).
// 3. Preview: `astro dev` with CMS_PREVIEW=1 marks the fields, sets data-cms-editing, injects the bridge and serves
//    it, and `isCmsEditing()` is true in the page scripts.
//
// The package is installed into test/fixture/node_modules from exactly the files `npm pack` would publish (a real
// folder, not a link), so Node and Vite treat it like any dependency from npm. `npm test` builds dist/ first.
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const fixture = join(repo, "test", "fixture");
const dist = join(fixture, "dist");
const require = createRequire(import.meta.url);
const astroBin = join(repo, "node_modules", "astro", "bin", "astro.mjs");
const tsc = require.resolve("typescript/bin/tsc");

/** Environment for Astro without the test's own CMS variables. */
const env = (extra: Record<string, string>) => {
  const { CMS_PREVIEW, CMS_WITHOUT_PACKAGE, CMS_EDITOR_ORIGIN, ...rest } = process.env;
  return { ...rest, ASTRO_TELEMETRY_DISABLED: "1", ...extra };
};

before(() => {
  // What `npm pack` would put in the tarball, copied file by file into the fixture's node_modules.
  const [pack] = JSON.parse(execSync("npm pack --dry-run --json --ignore-scripts", { cwd: repo, encoding: "utf8" }));
  const target = join(fixture, "node_modules", "@sindingmind", "cms-astro");
  rmSync(join(fixture, "node_modules"), { recursive: true, force: true });
  for (const { path } of pack.files as { path: string }[]) {
    mkdirSync(join(target, path, ".."), { recursive: true });
    cpSync(join(repo, path), join(target, path));
  }
  assert.ok(pack.files.some((f: { path: string }) => f.path === "dist/bridge.js"), "the tarball has the bridge");
  assert.ok(!pack.files.some((f: { path: string }) => /^(src|test)\//.test(f.path)), "the tarball has no sources or tests");
});

after(() => rmSync(dist, { recursive: true, force: true }));

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const build = (extra: Record<string, string>) => {
  rmSync(dist, { recursive: true, force: true });
  execFileSync(process.execPath, [astroBin, "build"], { cwd: fixture, stdio: "pipe", env: env(extra) });
  return new Map(files(dist).map((f) => [relative(dist, f).split(sep).join("/"), readFileSync(f)]));
};
const differences = (a: Map<string, Buffer>, b: Map<string, Buffer>) =>
  [...new Set([...a.keys(), ...b.keys()])].sort().filter((n) => !a.has(n) || !b.has(n) || !a.get(n)!.equals(b.get(n)!));

test("a production build has no CMS traces and is byte-identical to the site without the package", () => {
  // CMS_PREVIEW=1 is set on purpose: the flag must have no effect outside `astro dev`.
  const a = build({ CMS_PREVIEW: "1" });
  const b = build({ CMS_PREVIEW: "1" });
  const c = build({ CMS_WITHOUT_PACKAGE: "1" });

  assert.ok(a.has("index.html") && a.has("about/index.html"), `both pages are built: ${[...a.keys()].join(", ")}`);
  const traces = /data-cms-(field|image|item|list|editing|overlay)|__CMS__|\/__cms|bridge|sinding-cms|cms-astro/;
  assert.deepEqual([...a].filter(([, buf]) => traces.test(buf.toString("latin1"))).map(([f]) => f), [], "CMS traces");
  assert.deepEqual(differences(a, b), [], "two builds with the package differ");
  assert.deepEqual(differences(a, c), [], "the build with the package differs from the build without it");

  // isCmsEditing() is folded at each call site: no chunk with the helpers, no import of one, and both scripts built.
  const text = [...a].filter(([f]) => /\.(html|m?js)$/.test(f)).map(([f, buf]) => [f, buf.toString("utf8")] as const);
  assert.deepEqual(text.filter(([f]) => /\.m?js$/.test(f) && /attrs/i.test(f)).map(([f]) => f), [], "a chunk with the attribute helpers");
  for (const [f, s] of text) assert.doesNotMatch(s, /from\s*["'][^"']*attrs/, `${f} imports the attribute helpers`);
  assert.ok(text.some(([, s]) => s.includes("requestAnimationFrame")), "the front page's script is built");
  assert.ok(text.some(([, s]) => s.includes("setTimeout")), "the about page's script is built");

  // The content is really there (folder collection, text list, root list in file order, merged placeholder).
  const home = a.get("index.html")!.toString("utf8");
  assert.match(home, /<title>Example Co\.<\/title>/);
  assert.match(home, /<li>No CMS code in production<\/li>/);
  assert.match(home, /<dt>What does it cost\?<\/dt><dd>It costs 100 kr\. a month\.<\/dd>.*<dt>How do I edit a text\?<\/dt>/s);
  assert.match(home, /object-position:30% 70%/);
});

test("the published types give a site typed collections (astro sync + tsc)", () => {
  execFileSync(process.execPath, [astroBin, "sync"], { cwd: fixture, stdio: "pipe", env: env({}) });
  try {
    execFileSync(process.execPath, [tsc, "--noEmit", "-p", "tsconfig.json"], { cwd: fixture, encoding: "utf8", env: env({}) });
  } catch (e) {
    assert.fail(`tsc failed in test/fixture:\n${(e as { stdout?: string }).stdout}`);
  }
});

test("astro dev with CMS_PREVIEW=1 marks the fields and serves the bridge", async () => {
  Object.assign(process.env, { CMS_PREVIEW: "1", CMS_EDITOR_ORIGIN: "http://localhost:4599", ASTRO_TELEMETRY_DISABLED: "1" });
  const { dev } = (await import(pathToFileURL(require.resolve("astro")).href)) as typeof import("astro");
  const server = await dev({ root: fixture, logLevel: "error", server: { host: "127.0.0.1", port: 4598 } });
  try {
    const base = `http://127.0.0.1:${server.address.port}`;
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /data-cms-field="pages\/home#hero\.heading"/);
    assert.match(html, /data-cms-item="pages\/home#hero\.points\.1"/);
    assert.match(html, /data-cms-list="faq\/faq#items"/);
    assert.match(html, /data-cms-item="faq\/faq#items\.0"/);
    assert.match(html, /data-cms-image="pages\/home#photo"/);
    assert.match(html, /setAttribute\("data-cms-editing",""\)/);
    assert.match(html, /window\.__CMS__=\{"editorOrigin":"http:\/\/localhost:4599"\}/);

    // Follow the module graph from the page's scripts: the bridge is served from the package's dist/, and the
    // attribute helpers see the preview flag as true.
    const seen = new Map<string, string>();
    const queue = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]);
    while (queue.length && seen.size < 200) {
      const url = queue.shift()!;
      if (seen.has(url) || /\/node_modules\/(astro|vite)\/|\/\.vite\/deps\/(?!@sindingmind)/.test(url) || url.includes("@vite/client")) continue;
      const res = await fetch(new URL(url, base));
      assert.equal(res.status, 200, `${url} is served`);
      const code = await res.text();
      seen.set(url, code);
      for (const m of code.matchAll(/(?:import|from)\s*["']([^"']+)["']/g)) queue.push(new URL(m[1], new URL(url, base)).pathname + new URL(m[1], new URL(url, base)).search);
    }
    const urls = [...seen.keys()];
    assert.ok(urls.some((u) => /cms-astro\/dist\/bridge\.js/.test(u)), `the bridge is loaded: ${urls.join(", ")}`);
    const flag = [...seen.values()].find((c) => /export const preview\s*=/.test(c));
    assert.match(flag ?? "", /export const preview\s*=\s*true/, "virtual:sinding-cms says preview = true");
  } finally {
    await server.stop();
  }
});
