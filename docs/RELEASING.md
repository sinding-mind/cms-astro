# Releasing @sindingmind/cms-astro

The package is published to npm under the scope `@sindingmind`, owned by the npm organisation `sindingmind`. Every
release after the first is published by `.github/workflows/publish.yml` with **npm trusted publishing** (OIDC): no npm
token exists anywhere, and every version gets a provenance statement that links it to the commit and workflow run.

## 1. First release (once, by hand)

npm can only set up a trusted publisher for a package that already exists, so 0.1.0 is published from a PC by a
member of the `sindingmind` organisation with two-factor authentication on.

```bash
npm login                      # as the npm user that is a member of the sindingmind organisation; 2FA required
npm whoami
git clone git@github.com:sinding-mind/cms-astro.git && cd cms-astro
git checkout v0.1.0            # the tagged commit
npm ci
npm test && npm run typecheck
npm pack --dry-run             # check the file list: dist/, LICENSE, README.md, CHANGELOG.md, package.json
npm publish --access public --provenance=false
```

`--provenance=false` is needed only here: `package.json` asks for provenance (`publishConfig.provenance`), and npm
refuses to make a provenance statement outside a supported CI system. npm asks for the second factor before it
publishes. `prepack` builds `dist/` from a clean folder first.

## 2. Trust the workflow (once)

Either on npmjs.com: **Packages → @sindingmind/cms-astro → Settings → Trusted publishing → GitHub Actions**, with

- Organization or user: `sinding-mind`
- Repository: `cms-astro`
- Workflow filename: `publish.yml`
- Environment: `npm`

or from the command line (npm 11.10.0 or newer, 2FA required; checked with npm 11.12.1):

```bash
npm trust github @sindingmind/cms-astro --repository sinding-mind/cms-astro --file publish.yml --environment npm
npm trust list @sindingmind/cms-astro
```

Then, on npmjs.com under the package's **Settings → Publishing access**, choose "Require two-factor authentication and
disallow tokens", so the workflow is the only way to publish without a person and their second factor.

On GitHub, in the repository's **Settings → Environments**, create the environment `npm` and add a required reviewer
(the repository is public, so this is available on the Free plan) and limit it to tags `v*`. A publish then waits for
a human to approve it.

## 3. Every later release

```bash
git switch main && git pull
# update CHANGELOG.md (move the changes under a new heading with today's date)
npm version 0.2.0 -m "Release %s"   # bumps package.json and package-lock.json, commits and tags v0.2.0
git push origin main --follow-tags
```

The tag starts `publish.yml`: it checks that npm supports trusted publishing, that the tag equals the version in
`package.json`, runs the tests and the type check, and runs `npm publish --provenance --access public`. Approve the
`npm` environment when GitHub asks. Then create the GitHub release from the tag with the changelog text.

Sites using the package pin the exact version and update deliberately.
