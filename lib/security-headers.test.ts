import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { describe, expect, it } from "vitest";
import {
  bucketOrigin,
  contentSecurityPolicy,
  headerRules,
  isIndexableEnvironment,
  securityHeaders,
  securityOptionsFromEnv,
} from "./security-headers";

const BUCKET_ENV = { S3_ENDPOINT: "https://t3.storageapi.dev", S3_BUCKET: "scans-x1y2" };
const prod = { dev: false, https: true, bucket: "https://scans-x1y2.t3.storageapi.dev", indexable: true };

const header = (list: Array<{ key: string; value: string }>, key: string) => list.find((h) => h.key === key)?.value;
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `) || d === name);

describe("bucketOrigin", () => {
  it("is the exact virtual-hosted origin, or the endpoint origin for path style", () => {
    expect(bucketOrigin(BUCKET_ENV)).toBe("https://scans-x1y2.t3.storageapi.dev");
    expect(bucketOrigin({ ...BUCKET_ENV, S3_URL_STYLE: "path" })).toBe("https://t3.storageapi.dev");
    expect(bucketOrigin({ ...BUCKET_ENV, S3_ENDPOINT: "https://t3.storageapi.dev/" })).toBe("https://scans-x1y2.t3.storageapi.dev");
  });

  it("is null when storage is not configured or the endpoint is not an http(s) URL", () => {
    expect(bucketOrigin({})).toBeNull();
    expect(bucketOrigin({ S3_ENDPOINT: "https://t3.storageapi.dev" })).toBeNull();
    expect(bucketOrigin({ ...BUCKET_ENV, S3_ENDPOINT: "not a url" })).toBeNull();
    expect(bucketOrigin({ ...BUCKET_ENV, S3_ENDPOINT: "ftp://t3.storageapi.dev" })).toBeNull();
  });

  it("matches where the AWS SDK really sends a presigned PUT (offline, fake credentials)", async () => {
    for (const style of ["virtual", "path"] as const) {
      const env = { ...BUCKET_ENV, S3_URL_STYLE: style };
      const client = new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: "auto",
        forcePathStyle: style === "path",
        credentials: { accessKeyId: "AKIAFAKE", secretAccessKey: "fake-secret" },
      });
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: "scans/x.jpg" }), { expiresIn: 60 });
      expect(new URL(url).origin).toBe(bucketOrigin(env));
    }
  });
});

describe("Content-Security-Policy", () => {
  it("production: strict defaults, no eval, no nonce or hash next to 'unsafe-inline'", () => {
    const csp = contentSecurityPolicy(prod);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/'nonce-|'sha(256|384|512)-|'strict-dynamic'/);
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'none'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
    expect(directive(csp, "upgrade-insecure-requests")).toBe("upgrade-insecure-requests");
  });

  it("allows exactly the bucket origin for photos, never a wildcard", () => {
    const csp = contentSecurityPolicy(prod);
    expect(directive(csp, "img-src")).toBe("img-src 'self' blob: data: https://scans-x1y2.t3.storageapi.dev");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://scans-x1y2.t3.storageapi.dev");
    expect(csp).not.toContain("*");
    const none = contentSecurityPolicy({ ...prod, bucket: null });
    expect(directive(none, "connect-src")).toBe("connect-src 'self'");
  });

  it("dev adds 'unsafe-eval' only; plain http drops upgrade-insecure-requests", () => {
    expect(directive(contentSecurityPolicy({ ...prod, dev: true }), "script-src")).toBe("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(contentSecurityPolicy({ ...prod, https: false })).not.toContain("upgrade-insecure-requests");
  });
});

describe("securityHeaders", () => {
  it("sends the full set on https production", () => {
    const h = securityHeaders(prod);
    expect(header(h, "Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expect(header(h, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(h, "X-Frame-Options")).toBe("DENY");
    expect(header(h, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header(h, "Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(header(h, "Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(header(h, "Permissions-Policy")).toContain("camera=(self)");
    expect(header(h, "Permissions-Policy")).toContain("microphone=()");
    expect(header(h, "Permissions-Policy")).toContain("geolocation=()");
    expect(header(h, "X-Robots-Tag")).toBeUndefined();
    expect(header(h, "X-XSS-Protection")).toBeUndefined();
    expect(new Set(h.map((x) => x.key)).size).toBe(h.length);
  });

  it("no HSTS on http or in dev; noindex outside production", () => {
    expect(header(securityHeaders({ ...prod, https: false }), "Strict-Transport-Security")).toBeUndefined();
    expect(header(securityHeaders({ ...prod, dev: true }), "Strict-Transport-Security")).toBeUndefined();
    expect(header(securityHeaders({ ...prod, indexable: false }), "X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("only the Railway production environment is indexable", () => {
    expect(isIndexableEnvironment({ RAILWAY_ENVIRONMENT_NAME: "production" })).toBe(true);
    expect(isIndexableEnvironment({ RAILWAY_ENVIRONMENT_NAME: "staging" })).toBe(false);
    expect(isIndexableEnvironment({ RAILWAY_ENVIRONMENT_NAME: "pr-12" })).toBe(false);
    expect(isIndexableEnvironment({})).toBe(false);
  });

  it("reads the options from the environment", () => {
    expect(
      securityOptionsFromEnv({ NODE_ENV: "production", BETTER_AUTH_URL: "https://waqaya.example", RAILWAY_ENVIRONMENT_NAME: "production", ...BUCKET_ENV }),
    ).toEqual(prod);
    expect(securityOptionsFromEnv({ NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" })).toEqual({
      dev: true,
      https: false,
      bucket: null,
      indexable: false,
    });
  });
});

describe("header rules", () => {
  it("covers every path and opens only the brand images to other sites", () => {
    const rules = headerRules(prod);
    expect(rules[0].source).toBe("/:path*");
    expect(rules[1].source).toBe("/:dir(og|icons)/:path*");
    // The TS source must keep "\\." so Next's matcher sees "\." (a literal dot).
    expect(rules[2].source).toBe("/:file(icon\\.svg|apple-icon\\.png|favicon\\.ico)");
    for (const r of rules.slice(1)) expect(header(r.headers, "Cross-Origin-Resource-Policy")).toBe("cross-origin");
  });
});
