import { describe, expect, it, vi } from "vitest";

type Row = { id: string; identifier: string; value: string; expiresAt: Date; createdAt: Date };
const db = vi.hoisted(() => ({ rows: [] as Row[], locks: 0, seq: 0 }));

vi.mock("@/lib/prisma", () => {
  const verification = {
    deleteMany: async ({
      where,
    }: {
      where: { identifier?: string; id?: string | { not: string }; createdAt?: { lt: Date } };
    }) => {
      const before = db.rows.length;
      const matches = (r: Row) =>
        (where.identifier === undefined || r.identifier === where.identifier) &&
        (where.id === undefined || (typeof where.id === "string" ? r.id === where.id : r.id !== where.id.not)) &&
        (where.createdAt === undefined || r.createdAt < where.createdAt.lt);
      db.rows = db.rows.filter((r) => !matches(r));
      return { count: before - db.rows.length };
    },
    create: async ({ data }: { data: Omit<Row, "createdAt"> }) => {
      const row = { ...data, createdAt: new Date(Date.now() + (db.seq += 1)) }; // strictly increasing, like now()
      db.rows.push(row);
      return row;
    },
    // orderBy createdAt desc: the newest matching row
    findFirst: async ({ where }: { where: { identifier: string } }) => db.rows.findLast((r) => r.identifier === where.identifier) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: { value: string } }) => {
      const row = db.rows.find((r) => r.id === where.id)!;
      row.value = data.value;
      return row;
    },
  };
  const tx = {
    verification,
    $executeRaw: async () => {
      db.locks += 1;
      return 1;
    },
  };
  return {
    prisma: {
      verification,
      $transaction: async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (t: typeof tx) => unknown)(tx)),
    },
  };
});

vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret");

const m = await import("./deletion-code");

describe("deletion code helpers", () => {
  it("hashes with the server secret (a database dump alone cannot brute-force the code)", () => {
    const a = m.hashDeletionCode("u-1", "123456", "s1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(m.hashDeletionCode("u-1", "123456", "s2")).not.toBe(a);
    expect(m.hashDeletionCode("u-2", "123456", "s1")).not.toBe(a);
    expect(m.sameDigest(a, m.hashDeletionCode("u-1", "123456", "s1"))).toBe(true);
    expect(m.sameDigest(a, "")).toBe(false);
  });

  it("parses stored values; anything malformed counts as used up", () => {
    const h = "a".repeat(64);
    expect(m.parseCodeValue(`${h}:2`)).toEqual({ hash: h, tries: 2 });
    expect(m.parseCodeValue("garbage")).toEqual({ hash: "", tries: m.DELETION_CODE_MAX_TRIES });
    expect(m.parseCodeValue(`${h}:x`).tries).toBe(m.DELETION_CODE_MAX_TRIES);
    expect(m.normalizeCode(" 123 456 ")).toBe("123456");
    expect(m.normalizeCode("123-456")).toBe("123456");
  });
});

describe("deletion code flow", () => {
  it("one live code, 10 minutes, stored hashed (never the plain code)", async () => {
    db.rows = [];
    const first = await m.issueDeletionCode("u-1");
    const code = await m.issueDeletionCode("u-1");
    expect(code).toMatch(/^\d{6}$/);
    expect(db.rows).toHaveLength(1); // the second request replaced the first code
    expect(db.rows[0].identifier).toBe("account-delete:u-1");
    expect(db.rows[0].value).not.toContain(code);
    expect(db.rows[0].value.endsWith(":0")).toBe(true);
    const ttl = db.rows[0].expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000);
    if (first !== code) expect(await m.checkDeletionCode("u-1", first)).toBe("invalid");
  });

  it("the right code passes (spaces allowed) and keeps the row until the account is gone", async () => {
    db.rows = [];
    const code = await m.issueDeletionCode("u-1");
    expect(await m.checkDeletionCode("u-1", `${code.slice(0, 3)} ${code.slice(3)}`)).toBe("ok");
    expect(db.rows).toHaveLength(1);
    expect(db.locks).toBeGreaterThan(0); // checked under the per-user advisory lock
  });

  it("5 wrong tries (codes or passwords) use the code up", async () => {
    db.rows = [];
    const code = await m.issueDeletionCode("u-1");
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await m.checkDeletionCode("u-1", wrong)).toBe("invalid");
    expect(await m.checkDeletionCode("u-1", wrong)).toBe("invalid");
    expect(await m.recordDeletionFailure("u-1")).toBe("invalid"); // a wrong password counts too
    expect(await m.checkDeletionCode("u-1", wrong)).toBe("invalid");
    expect(await m.checkDeletionCode("u-1", wrong)).toBe("too_many");
    expect(db.rows).toHaveLength(0);
    expect(await m.checkDeletionCode("u-1", code)).toBe("expired"); // even the right code is gone now
  });

  it("an expired code is removed and reported as expired", async () => {
    db.rows = [];
    const code = await m.issueDeletionCode("u-1");
    db.rows[0].expiresAt = new Date(Date.now() - 1000);
    expect(await m.checkDeletionCode("u-1", code)).toBe("expired");
    expect(db.rows).toHaveLength(0);
    expect(await m.recordDeletionFailure("u-1")).toBe("expired");
  });

  it("a new code replaces the earlier one only once the e-mail went out", async () => {
    db.rows = [];
    const first = await m.issueDeletionCode("u-1");
    let second = "";
    const sent = await m.sendNewDeletionCode("u-1", async (code) => {
      second = code;
      expect(db.rows).toHaveLength(2); // both exist while the e-mail is on its way
      return { ok: true as const };
    });
    expect(sent.ok).toBe(true);
    expect(db.rows).toHaveLength(1);
    if (first !== second) expect(await m.checkDeletionCode("u-1", first)).toBe("invalid");
    expect(await m.checkDeletionCode("u-1", second)).toBe("ok");
  });

  it("two requests at once (two tabs, a double tap) never delete each other's code: the newer one works", async () => {
    db.rows = [];
    const codes: string[] = [];
    let bothCreated!: () => void;
    const gate = new Promise<void>((r) => {
      bothCreated = r;
    });
    const deliver = async (code: string) => {
      codes.push(code);
      if (codes.length === 2) bothCreated();
      await gate; // both rows exist before either e-mail "goes out"
      return { ok: true as const };
    };
    const [a, b] = await Promise.all([m.sendNewDeletionCode("u-1", deliver), m.sendNewDeletionCode("u-1", deliver)]);
    expect(a.ok && b.ok).toBe(true);
    expect(db.rows).toHaveLength(1); // the older row went, the newer one stayed
    expect(await m.checkDeletionCode("u-1", codes[1])).toBe("ok");
  });

  it("a failed send keeps the earlier code valid and leaves no new row", async () => {
    db.rows = [];
    const first = await m.issueDeletionCode("u-1");
    const sent = await m.sendNewDeletionCode("u-1", async () => ({ ok: false as const, reason: "failed" }));
    expect(sent.ok).toBe(false);
    expect(db.rows).toHaveLength(1);
    expect(await m.checkDeletionCode("u-1", first)).toBe("ok");
    await expect(m.sendNewDeletionCode("u-1", async () => Promise.reject(new Error("provider down")))).rejects.toThrow();
    expect(db.rows).toHaveLength(1);
    expect(await m.checkDeletionCode("u-1", first)).toBe("ok");
  });

  it("another user's code never matches", async () => {
    db.rows = [];
    const code = await m.issueDeletionCode("u-1");
    expect(await m.checkDeletionCode("u-2", code)).toBe("expired");
  });
});
