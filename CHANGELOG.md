# Changelog

All notable changes to `@sindingmind/cms-astro`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/). Before 1.0.0, a minor version may break the API.

## [0.1.1] - 2026-11-16

The first version published from GitHub Actions with npm trusted publishing, so it has a provenance statement. The
code is the same as 0.1.0. (This entry was added after the tag, so the 0.1.1 tarball does not contain it.)

### Changed

- Security reports go through GitHub private security advisories only (`SECURITY.md`).

## [0.1.0] - 2026-11-16

First public release.

### Added

- Field definitions (`defineCms`, `f.text`, `f.number`, `f.image`, `f.group`, `f.list`, `f.textList`) with optional
  fields, placeholders, list limits, ids, defaults and position numbers (`orderField`).
- Zod schemas from the definitions (`objectOf`, `schemaOf`, `toZod`) with Danish validation messages, and data types
  worked out from the fields.
- Astro content collections from the config (`cmsCollection`) for folder collections, single files and root lists,
  plus `entryOf` and `inFileOrder` for root lists.
- Attribute helpers (`field`, `list`, `item`, `image`, `fokus`) and `isCmsEditing()`.
- The Astro integration: in `astro dev` with `CMS_PREVIEW=1` it marks the page, turns CSS motion off and loads the
  editor bridge; in a build it folds `isCmsEditing()` calls to `false` and adds nothing else.
- Published as JavaScript with `.d.ts` files, with npm provenance.

[0.1.0]: https://github.com/sinding-mind/cms-astro/releases/tag/v0.1.0
