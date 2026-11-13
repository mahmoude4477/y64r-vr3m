import { describe, expect, it } from "vitest";
import { MAX_SCAN_PHOTOS, REVIEW_BELOW as AI_REVIEW_BELOW, SCAN_IMAGE_TYPES } from "@/lib/ai/analyze-scan";
import * as storage from "@/lib/storage";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_SCAN, REVIEW_BELOW, SCAN_STATUSES, UPLOAD_TYPES } from "./constants";

// The browser checks the same limits as the server: the client-safe copies must never drift.
describe("client-safe scan constants", () => {
  it("equal the server's photo limits", () => {
    expect(MAX_PHOTO_BYTES).toBe(storage.MAX_PHOTO_BYTES);
    expect(MAX_PHOTOS_PER_SCAN).toBe(storage.MAX_PHOTOS_PER_SCAN);
    expect(MAX_PHOTOS_PER_SCAN).toBe(MAX_SCAN_PHOTOS);
    expect([...UPLOAD_TYPES]).toEqual([...storage.PHOTO_TYPES]);
    expect([...UPLOAD_TYPES]).toEqual([...SCAN_IMAGE_TYPES]);
  });

  it("flag low-confidence AI verdicts at the same threshold as the analysis", () => {
    expect(REVIEW_BELOW).toBe(AI_REVIEW_BELOW);
  });

  it("list every ScanStatus of the schema", async () => {
    const { ScanStatus } = await import("@/generated/prisma/enums");
    expect([...SCAN_STATUSES].sort()).toEqual(Object.values(ScanStatus).sort());
  });
});
