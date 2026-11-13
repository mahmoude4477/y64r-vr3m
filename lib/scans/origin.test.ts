import { describe, expect, it } from "vitest";
import { appOrigins, requestOriginAllowed } from "./origin";

const env = { BETTER_AUTH_URL: "https://waqaya.example", BETTER_AUTH_TRUSTED_ORIGINS: "https://staging.waqaya.example,not a url" };
const headers = (h: Record<string, string>) => new Headers(h);

describe("scan API origin check", () => {
  it("knows the app origins", () => {
    expect(appOrigins(env)).toEqual(["https://waqaya.example", "https://staging.waqaya.example"]);
    expect(appOrigins({})).toEqual([]);
  });

  it("allows same-origin browser requests and non-browser clients", () => {
    expect(requestOriginAllowed(headers({ "sec-fetch-site": "same-origin", origin: "https://waqaya.example" }), env)).toBe(true);
    expect(requestOriginAllowed(headers({ "sec-fetch-site": "same-origin" }), env)).toBe(true);
    expect(requestOriginAllowed(headers({}), env)).toBe(true);
    expect(requestOriginAllowed(headers({ origin: "https://staging.waqaya.example" }), env)).toBe(true);
  });

  it("refuses cross-site and same-site requests and foreign origins", () => {
    expect(requestOriginAllowed(headers({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }), env)).toBe(false);
    expect(requestOriginAllowed(headers({ "sec-fetch-site": "same-site", origin: "https://sub.waqaya.example" }), env)).toBe(false);
    expect(requestOriginAllowed(headers({ origin: "https://evil.example" }), env)).toBe(false);
    expect(requestOriginAllowed(headers({ origin: "null" }), env)).toBe(false);
    expect(requestOriginAllowed(headers({ "sec-fetch-site": "none", origin: "https://evil.example" }), env)).toBe(false);
  });
});
