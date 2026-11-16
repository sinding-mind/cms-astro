// Used only in the CMS_WITHOUT_PACKAGE=1 build. A site without the CMS has no editing check, so this rewrites the
// page scripts the way their author would have written them: the import of `isCmsEditing` is removed and every
// `isCmsEditing()` becomes `false`. A plain text rewrite, on purpose independent of the package's own folding
// (src/editing-flag.ts), so the comparison proves the package leaves nothing behind.
const IMPORT = /import\s*\{\s*isCmsEditing\s*\}\s*from\s*["']@sindingmind\/cms-astro\/attrs["'];?/g;

export function withoutCmsEditing() {
  return {
    name: "fixture-without-cms-editing",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes(".astro?astro&type=script") || !code.includes("isCmsEditing")) return undefined;
      return { code: code.replace(IMPORT, "").replace(/\bisCmsEditing\(\)/g, "false"), map: null };
    },
  };
}
