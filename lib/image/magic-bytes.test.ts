import { describe, expect, it } from "vitest";
import { detectImageType, matchesMagic } from "./magic-bytes";

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

describe("detectImageType", () => {
  it("detects JPEG, PNG and WebP", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(detectImageType(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP"), ...ascii("VP8 ")))).toBe("image/webp");
  });

  it("rejects other or truncated content", () => {
    expect(detectImageType(bytes())).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull();
    expect(detectImageType(bytes(...ascii("GIF89a")))).toBeNull();
    expect(detectImageType(bytes(...ascii("<svg xmlns")))).toBeNull();
    expect(detectImageType(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE")))).toBeNull();
    // HEIC (ftypheic) is not accepted by Claude vision
    expect(detectImageType(bytes(0, 0, 0, 0x18, ...ascii("ftypheic")))).toBeNull();
  });

  it("matchesMagic compares against the declared type", () => {
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xdb);
    expect(matchesMagic(jpeg, "image/jpeg")).toBe(true);
    expect(matchesMagic(jpeg, "image/png")).toBe(false);
  });
});
