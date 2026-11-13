import { describe, expect, it, vi } from "vitest";

// The copy page's version notes (copyableRows): which global protocol is an old version of a published newer one,
// and which one is newer than what the institution copied. The query parts are covered by the e2e specs.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { copyableRows } = await import("./editor-queries");

const g = (id: string, slug = id) => ({ id, slug, titleAr: `عنوان ${slug}`, titleEn: `Title ${slug}` });

describe("copyableRows", () => {
  const edges = [
    { from: "g1", to: "g2" },
    { from: "g2", to: "g3" },
  ];

  it("counts direct copies and opens the newest one", () => {
    const [row] = copyableRows([g("g1")], [{ id: "c2", sourceProtocolId: "g1" }, { id: "c1", sourceProtocolId: "g1" }, { id: "c9", sourceProtocolId: "zz" }], []);
    expect(row).toMatchObject({ copies: 2, latestCopyId: "c2", olderVersionCopyId: null, newerVersion: null });
  });

  it("an old version still published points at the newest PUBLISHED newer version", () => {
    // g3 is not in the published rows (a draft): g2 is the newest published one.
    const rows = copyableRows([g("g1", "hand"), g("g2", "hand-v2")], [], edges);
    expect(rows[0]).toMatchObject({ newerVersion: { slug: "hand-v2", titleEn: "Title hand-v2" } });
    expect(rows[1]).toMatchObject({ newerVersion: null });
  });

  it("a newer version names the institution's copy of an older one (only when it has no copy of this one)", () => {
    const copies = [{ id: "c1", sourceProtocolId: "g1" }];
    const rows = copyableRows([g("g1"), g("g2"), g("g3")], copies, edges);
    expect(rows.map((r) => [r.id, r.copies, r.olderVersionCopyId])).toEqual([
      ["g1", 1, null],
      ["g2", 0, "c1"],
      ["g3", 0, "c1"],
    ]);
    const adopted = copyableRows([g("g2")], [{ id: "c2", sourceProtocolId: "g2" }, ...copies], edges);
    expect(adopted[0]).toMatchObject({ copies: 1, latestCopyId: "c2", olderVersionCopyId: null });
  });
});
