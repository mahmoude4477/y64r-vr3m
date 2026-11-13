import { describe, expect, it } from "vitest";
import { createScanSchema, newScanFormSchema, saveStepSchema, scanNotesFormSchema, scanNotesSchema } from "./schemas";

// PostgreSQL text cannot store U+0000: a NUL in free text used to fail the write (500 server_error and an error log).
// The schemas remove it before trimming and the length checks; everything else is kept.

const NUL = String.fromCharCode(0);
const base = { protocolId: "p1", teamId: null, photoIds: ["ph1"] };

describe("free text in scan requests", () => {
  it("removes NUL characters and keeps the rest (line breaks, other text)", () => {
    expect(createScanSchema.parse({ ...base, areaLabel: ` Room${NUL} 12 ` }).areaLabel).toBe("Room 12");
    expect(saveStepSchema.parse({ scanId: "s1", stepId: "st1", note: `a${NUL}b` }).note).toBe("ab");
    expect(scanNotesSchema.parse({ scanId: "s1", notes: `line 1\nline${NUL} 2` }).notes).toBe("line 1\nline 2");
    expect(scanNotesFormSchema.parse({ notes: `x${NUL}` }).notes).toBe("x");
    expect(newScanFormSchema.parse({ protocolId: "p1", teamId: "", areaLabel: `${NUL}Sink` }).areaLabel).toBe("Sink");
  });

  it("still refuses an area that is empty once cleaned, and text over the limit", () => {
    expect(createScanSchema.safeParse({ ...base, areaLabel: `${NUL}${NUL} ` }).success).toBe(false);
    expect(createScanSchema.safeParse({ ...base, areaLabel: "x".repeat(121) }).success).toBe(false);
    expect(createScanSchema.safeParse({ ...base, areaLabel: `${"x".repeat(120)}${NUL}` }).success).toBe(true);
  });
});
