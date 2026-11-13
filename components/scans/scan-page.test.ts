import { describe, expect, it } from "vitest";
import { breadcrumbText } from "./scan-page";

describe("breadcrumbText", () => {
  it("keeps short labels and shortens long ones to at most 40 characters with an ellipsis", () => {
    expect(breadcrumbText("  Room 12 sink ")).toBe("Room 12 sink");
    const long = "مغسلة الغرفة 12 في قسم العناية المركزة للأطفال حديثي الولادة";
    const short = breadcrumbText(long);
    expect(Array.from(short).length).toBeLessThanOrEqual(40);
    expect(short.endsWith("…")).toBe(true);
    expect(long.startsWith(short.slice(0, -1).trimEnd())).toBe(true);
  });
});
