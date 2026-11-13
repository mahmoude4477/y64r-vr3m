import type { MetadataRoute } from "next";
import { isIndexableEnvironment } from "@/lib/security-headers";
import { robotsRules, siteUrl } from "@/lib/seo";

// /robots.txt (note 07 §2.5). Built at BUILD time like the X-Robots-Tag header (lib/security-headers.ts): only the
// Railway "production" environment may be crawled; staging, local and CI builds disallow everything.
export default function robots(): MetadataRoute.Robots {
  return robotsRules({ indexable: isIndexableEnvironment(), base: siteUrl() });
}
