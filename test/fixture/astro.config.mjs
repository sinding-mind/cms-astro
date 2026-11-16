// The fixture site for test/fixture.test.ts. A site with the CMS names the integration and nothing else.
//
// CMS_WITHOUT_PACKAGE=1 is used only by the test: it builds the same site the way it would be written without the
// CMS (no integration, attribute helpers that add nothing, and `isCmsEditing()` in page scripts written as `false`),
// to prove the package leaves no trace in a production build. The integration is not even loaded then.
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import { withoutCmsEditing } from "./scripts/without-cms-editing.mjs";

const withoutCms = process.env.CMS_WITHOUT_PACKAGE === "1";
const integrations = withoutCms ? [] : [(await import("@sindingmind/cms-astro")).default()];

export default defineConfig({
  output: "static",
  devToolbar: { enabled: false },
  integrations,
  vite: withoutCms
    ? {
      resolve: { alias: [{ find: /^@sindingmind\/cms-astro\/attrs$/, replacement: fileURLToPath(new URL("./scripts/attrs-noop.mjs", import.meta.url)) }] },
      plugins: [withoutCmsEditing()],
    }
    : {},
});
