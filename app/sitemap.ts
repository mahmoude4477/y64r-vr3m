import type { MetadataRoute } from "next";
import { sitemapEntries, siteUrl } from "@/lib/seo";

// /sitemap.xml (note 07 §2.5): the public pages that exist (lib/seo.ts SITEMAP_PATHS) in both locales, each with its
// hreflang alternates. Built at BUILD time from BETTER_AUTH_URL. Signed-in pages are never listed.
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(siteUrl());
}
