import { describe, expect, it, vi } from "vitest";

// Version links between global protocols, read from Protocol.versionOfId (lib/protocols/versions.ts).

const db = vi.hoisted(() => ({ rows: [] as unknown[], args: [] as unknown[] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    protocol: {
      findMany: async (args: unknown) => {
        db.args.push(args);
        return db.rows;
      },
    },
  },
}));

const { loadGlobalVersionEdges, newerVersions, versionEdges, versionFamily } = await import("./versions");

const A = "aaaaaaaaaa";
const B = "bbbbbbbbbb";
const C = "cccccccccc";
const D = "dddddddddd";
const X = "xxxxxxxxxx";

describe("versionEdges", () => {
  it("reads fromProtocolId -> targetId, oldest first, and skips rows without a usable link", () => {
    expect(
      versionEdges([
        { targetId: B, meta: { scope: "global", fromProtocolId: A } },
        { targetId: null, meta: { fromProtocolId: A } },
        { targetId: C, meta: null },
        { targetId: C, meta: { fromProtocolId: 42 } },
        { targetId: C, meta: { fromProtocolId: "../etc" } },
        { targetId: A, meta: { fromProtocolId: A } },
        { targetId: C, meta: { fromProtocolId: B } },
      ]),
    ).toEqual([
      { from: A, to: B },
      { from: B, to: C },
    ]);
  });
});

describe("newerVersions", () => {
  const edges = [
    { from: A, to: B },
    { from: X, to: D },
    { from: B, to: C },
  ];

  it("lists versions of versions, newest first, never the protocol itself", () => {
    expect(newerVersions(edges, A)).toEqual([C, B]);
    expect(newerVersions(edges, B)).toEqual([C]);
    expect(newerVersions(edges, C)).toEqual([]);
  });

  it("two versions made from the same protocol: the later one first", () => {
    expect(newerVersions([{ from: A, to: B }, { from: A, to: C }], A)).toEqual([C, B]);
  });

  it("stops on a cycle (rows written by hand)", () => {
    expect(newerVersions([{ from: A, to: B }, { from: B, to: A }], A)).toEqual([B]);
  });
});

describe("versionFamily", () => {
  it("is every version linked to the protocol, older and newer, and nothing else", () => {
    const edges = [
      { from: A, to: B },
      { from: B, to: C },
      { from: X, to: D },
    ];
    expect([...versionFamily(edges, B)].sort()).toEqual([A, B, C]);
    expect([...versionFamily(edges, D)].sort()).toEqual([D, X]);
    expect([...versionFamily([], A)]).toEqual([A]);
  });
});

describe("loadGlobalVersionEdges", () => {
  it("reads the global version rows only, oldest first", async () => {
    db.rows = [{ id: B, versionOfId: A }];
    expect(await loadGlobalVersionEdges()).toEqual([{ from: A, to: B }]);
    expect(db.args[0]).toEqual({
      where: { organizationId: null, versionOfId: { not: null } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, versionOfId: true },
    });
  });
});
