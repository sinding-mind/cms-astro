// Stand-in for @sindingmind/cms-astro/attrs in the CMS_WITHOUT_PACKAGE=1 build: what a site without the CMS would
// write. The attribute helpers add nothing; fokus() is the site's own styling.
export const field = () => ({});
export const list = () => ({});
export const item = () => ({});
export const image = () => ({});
export const fokus = (v) => `object-position:${v.fokus?.x ?? 50}% ${v.fokus?.y ?? 50}%`;
export const isCmsEditing = () => false;
