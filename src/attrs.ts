// Attribute helpers for templates. In a production build they return {} and the HTML is exactly what the
// template would render without the CMS. Only `astro dev` with CMS_PREVIEW=1 adds data-cms-* attributes.
import { preview } from "virtual:sinding-cms";

type Entry = { collection: string; id: string };
const ref = (e: Entry, path: string) => `${e.collection}/${e.id}#${path}`;

/** A text field: the element's text content is the value. */
export const field = (e: Entry, path: string) => (preview ? { "data-cms-field": ref(e, path) } : {});

/** A list container. Items inside it must use item(). */
export const list = (e: Entry, path: string) => (preview ? { "data-cms-list": ref(e, path) } : {});

/**
 * One list item. `index` is the item's position in the YAML file, not on the page: if the template sorts or
 * filters the list, keep the file position (for a root list, the order of getCollection()).
 * For a text list the item is the text, so put both on the element: `{...item(e, "tillid", i)} {...field(e, `tillid.${i}`)}`.
 */
export const item = (e: Entry, path: string, index: number) => (preview ? { "data-cms-item": ref(e, `${path}.${index}`) } : {});

/** An image field ({ src, alt, fokus }). Put it on the <img>. */
export const image = (e: Entry, path: string) => (preview ? { "data-cms-image": ref(e, path) } : {});

/** CSS object-position for an image's focus point. Used in production too. */
export const fokus = (v: { fokus?: { x: number; y: number } }) => `object-position:${v.fokus?.x ?? 50}% ${v.fokus?.y ?? 50}%`;

/**
 * True while the page is shown in the CMS editor. For the site's own client scripts: skip JS animations (typing
 * effects, counters, carousels) and show the final text. In a build the integration replaces each call
 * `isCmsEditing()` with the literal `false` in the module that imports it (editing-flag.ts), so the check and this
 * module disappear from the output, also when several page scripts import it. Call it, do not pass it around: a
 * value use is not folded (it still works). (`html[data-cms-editing]` is the same signal for CSS and inline scripts.)
 */
export const isCmsEditing = (): boolean => preview;
