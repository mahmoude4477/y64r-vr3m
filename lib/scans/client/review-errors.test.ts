import { describe, expect, it } from "vitest";
import en from "@/messages/en/scans.json";
import { callAction, REVIEW_ERROR_KEYS, reviewErrorKey } from "./review-errors";

describe("reviewErrorKey", () => {
  it("maps the review action codes and falls back to the generic text", () => {
    expect(reviewErrorKey("finalized")).toBe("detail.errors.finalized");
    expect(reviewErrorKey("incomplete")).toBe("detail.errors.incomplete");
    expect(reviewErrorKey("not_found")).toBe("errors.notFound");
    expect(reviewErrorKey("slow_down")).toBe("errors.slowDown");
    expect(reviewErrorKey("bad_locale")).toBe("errors.generic");
    expect(reviewErrorKey("something_new")).toBe("errors.generic");
    expect(reviewErrorKey(undefined)).toBe("errors.generic");
  });

  it("every key exists in the messages", () => {
    for (const key of REVIEW_ERROR_KEYS) {
      const value = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en);
      expect(typeof value, key).toBe("string");
    }
  });
});

describe("callAction", () => {
  it("turns a thrown call into a network failure, but lets Next's redirect through", async () => {
    expect(await callAction(async () => ({ ok: true }))).toEqual({ ok: true });
    expect(await callAction(async () => undefined as unknown as { ok: true })).toEqual({ ok: false, error: "network" });
    expect(await callAction(async () => Promise.reject(new TypeError("Failed to fetch")))).toEqual({ ok: false, error: "network" });
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/ar/sign-in;307;" });
    await expect(callAction(async () => Promise.reject(redirect))).rejects.toBe(redirect);
  });
});
