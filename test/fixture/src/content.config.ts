import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { cmsCollection } from "@sindingmind/cms-astro/content";
import cms from "../cms.config.ts";

export const collections = {
  pages: defineCollection(cmsCollection(cms, "pages")),
  faq: defineCollection(cmsCollection(cms, "faq", {
    extend: (s) => s.extend({ order: z.number().int().min(1), draft: z.boolean().default(false) }),
  })),
};
