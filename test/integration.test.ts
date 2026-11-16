// The Astro integration's config hook: it only marks the preview with `astro dev` and CMS_PREVIEW=1.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import cms, { EDITING_CSS } from "../src/index.ts";

type Script = [stage: string, content: string];
const run = (command: string, options?: Parameters<typeof cms>[0]) => {
  const scripts: Script[] = [];
  const configs: { vite: { plugins: { name: string }[] } }[] = [];
  const hook = cms(options).hooks["astro:config:setup"] as unknown as (p: unknown) => void;
  hook({
    command,
    updateConfig: (c: (typeof configs)[number]) => configs.push(c),
    injectScript: (stage: string, content: string) => scripts.push([stage, content]),
  });
  return { scripts, plugins: configs.flatMap((c) => c.vite.plugins.map((p) => p.name)) };
};

afterEach(() => {
  delete process.env.CMS_PREVIEW;
  delete process.env.CMS_EDITOR_ORIGIN;
});

test("a build injects nothing, even with CMS_PREVIEW=1", () => {
  process.env.CMS_PREVIEW = "1";
  const { scripts, plugins } = run("build");
  assert.deepEqual(scripts, []);
  assert.deepEqual(plugins, ["sinding-cms-virtual", "sinding-cms-editing-flag"]);
});

test("astro dev without CMS_PREVIEW injects nothing", () => {
  assert.deepEqual(run("dev").scripts, []);
});

test("the preview injects the editing flag, the motion stylesheet, the editor origin and the bridge", () => {
  process.env.CMS_PREVIEW = "1";
  process.env.CMS_EDITOR_ORIGIN = "https://editor.example";
  const { scripts } = run("dev", { editorOrigin: "http://ignored.example" });
  const [head, page] = scripts;
  assert.equal(head[0], "head-inline");
  assert.match(head[1], /setAttribute\("data-cms-editing",""\)/);
  assert.ok(head[1].includes(JSON.stringify(EDITING_CSS)));
  assert.match(head[1], /window\.__CMS__=\{"editorOrigin":"https:\/\/editor\.example"\}/);
  assert.equal(page[0], "page");
  assert.match(page[1], /^import ".*bridge\.ts";$/);
});

test("keepMotion leaves CSS motion alone", () => {
  process.env.CMS_PREVIEW = "1";
  assert.doesNotMatch(run("dev", { keepMotion: true }).scripts[0][1], /data-cms-editing-style/);
});

test("the editor origin must be a bare origin, because it ends up in an inline script", () => {
  process.env.CMS_PREVIEW = "1";
  for (const bad of ["https://editor.example/path", "https://editor.example/?x=</script>", "not a url"]) {
    process.env.CMS_EDITOR_ORIGIN = bad;
    assert.throws(() => run("dev"), Error, bad);
  }
});
