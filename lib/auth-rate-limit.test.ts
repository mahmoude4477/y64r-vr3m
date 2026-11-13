import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  queries: [] as Array<{ sql: string; values: unknown[] }>,
  executes: [] as Array<{ sql: string; values: unknown[] }>,
  results: [] as unknown[][],
  transactions: 0,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      db.queries.push({ sql: strings.join("?"), values });
      return db.results.shift() ?? [];
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      db.executes.push({ sql: strings.join("?"), values });
      return 0;
    },
    $transaction: async () => {
      db.transactions += 1;
      throw new Error("no transaction expected");
    },
  },
}));

const {
  authRateLimitStorage,
  consumeRateLimit,
  endpointPathFor,
  MAX_KEY_LENGTH,
  PRUNE_AFTER_MS,
  PRUNE_EVERY_MS,
  retryAfterSeconds,
  setAuthEndpointPaths,
  storageKey,
} = await import("./auth-rate-limit");

beforeEach(() => {
  db.queries.length = 0;
  db.executes.length = 0;
  db.results.length = 0;
  db.transactions = 0;
});

describe("consumeRateLimit", () => {
  it("counts an allowed request with ONE statement and no transaction", async () => {
    db.results.push([{ count: 3 }]);
    const r = await consumeRateLimit("1.2.3.4|/get-session", { window: 60, max: 100 }, 1_000_000);
    expect(r).toEqual({ allowed: true, retryAfter: null });
    expect(db.queries).toHaveLength(1);
    expect(db.transactions).toBe(0);
    const [q] = db.queries;
    expect(q!.sql).toContain('INSERT INTO "rateLimit"');
    expect(q!.sql).toContain('ON CONFLICT ("key") DO UPDATE');
    // the key, the window in ms and max are parameters, never spliced into the SQL
    expect(q!.values).toContain("1.2.3.4|/get-session");
    expect(q!.values).toContain(60_000n);
    expect(q!.values).toContain(100);
    expect(q!.sql).not.toContain("1.2.3.4");
  });

  it("refuses when the upsert updates nothing, with the seconds left in the window", async () => {
    db.results.push([], [{ lastRequest: 1_000_000n - 15_000n }]); // last request 15 s ago, window 60 s
    const r = await consumeRateLimit("k", { window: 60, max: 5 }, 1_000_000);
    expect(r).toEqual({ allowed: false, retryAfter: 45 });
    expect(db.queries).toHaveLength(2);
    expect(db.queries[1]!.sql).toContain('SELECT "lastRequest"');
  });

  it("refuses with retryAfter >= 1 even when the row vanished in between", async () => {
    db.results.push([], []);
    const r = await consumeRateLimit("k", { window: 10, max: 3 }, 5_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBe(10);
  });

  it("prunes old rows in the background at most once per interval, only on a new or restarted window", async () => {
    db.results.push([{ count: 2 }]);
    await consumeRateLimit("k", { window: 60, max: 5 }, 10 * PRUNE_AFTER_MS);
    expect(db.executes).toHaveLength(0); // count 2: an ordinary increment

    db.results.push([{ count: 1 }]);
    await consumeRateLimit("k", { window: 60, max: 5 }, 10 * PRUNE_AFTER_MS);
    expect(db.executes).toHaveLength(1);
    expect(db.executes[0]!.sql).toContain('DELETE FROM "rateLimit" WHERE "lastRequest" <');
    expect(db.executes[0]!.values).toEqual([BigInt(9 * PRUNE_AFTER_MS)]);

    db.results.push([{ count: 1 }]);
    await consumeRateLimit("k2", { window: 60, max: 5 }, 10 * PRUNE_AFTER_MS + 1_000);
    expect(db.executes).toHaveLength(1); // throttled
  });
});

describe("pruning", () => {
  it("keeps rows only a little longer than the longest window (Better Auth prunes at its longest window)", async () => {
    expect(PRUNE_AFTER_MS).toBeLessThanOrEqual(5 * 60 * 1000); // was 1 h: unknown paths piled up for an hour
    expect(PRUNE_AFTER_MS).toBeGreaterThan(60 * 1000); // every window in lib/auth.ts is at most 60 s
    expect(PRUNE_EVERY_MS).toBeLessThanOrEqual(PRUNE_AFTER_MS);
  });

  it("never cuts below twice the longest window it has seen", async () => {
    const now = 100 * PRUNE_AFTER_MS;
    db.results.push([{ count: 1 }]);
    await consumeRateLimit("k-long", { window: 600, max: 5 }, now); // a 10-minute rule
    expect(db.executes).toHaveLength(1);
    expect(db.executes[0]!.values).toEqual([BigInt(now - 2 * 600_000)]);
  });
});

describe("bounded keys", () => {
  const rule = { window: 60, max: 100 };

  it("before the endpoints are known: keeps short keys, hashes long ones", () => {
    expect(storageKey("1.2.3.4|/x", rule)).toBe("1.2.3.4|/x");
    const long = storageKey(`1.2.3.4|/${"a".repeat(6000)}`, rule);
    expect(long).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(long.length).toBeLessThanOrEqual(MAX_KEY_LENGTH);
  });

  it("keeps an endpoint's key, folds path parameters into the pattern and unknown paths into one row per rule", () => {
    setAuthEndpointPaths(["/sign-in/email", "/get-session", "/reset-password", "/reset-password/:token", "/callback/:id", undefined, 42]);
    expect(storageKey("1.2.3.4|/sign-in/email", { window: 60, max: 5 })).toBe("1.2.3.4|/sign-in/email");
    expect(storageKey("1.2.3.4|/get-session", rule)).toBe("1.2.3.4|/get-session");
    expect(storageKey("1.2.3.4|/reset-password", rule)).toBe("1.2.3.4|/reset-password");
    expect(storageKey("1.2.3.4|/reset-password/abc", rule)).toBe("1.2.3.4|/reset-password/:token");
    expect(storageKey(`1.2.3.4|/reset-password/${"t".repeat(6000)}`, rule)).toBe("1.2.3.4|/reset-password/:token");
    // 3000 different unknown paths (the review's measurement) are ONE row per client, also when very long
    const keys = new Set(Array.from({ length: 3000 }, (_, i) => storageKey(`9.9.9.9|/x${i}-${"y".repeat(200)}`, rule)));
    expect([...keys]).toEqual(["9.9.9.9|(other paths 60s/100)"]);
    expect(storageKey(`9.9.9.9|/${"z".repeat(12_000)}`, rule)).toBe("9.9.9.9|(other paths 60s/100)");
    // a rule of its own (Better Auth's /sign-in* special rule) keeps its own row
    expect(storageKey("9.9.9.9|/sign-in/nope", { window: 10, max: 3 })).toBe("9.9.9.9|(other paths 10s/3)");
    // a parameter must not be empty, and the segment count must match
    expect(endpointPathFor("/reset-password/")).toBeNull();
    expect(endpointPathFor("/reset-password/a/b")).toBeNull();
    expect(endpointPathFor("/sign-in/email")).toBe("/sign-in/email");
    // other clients stay apart
    expect(storageKey("8.8.8.8|/nope", rule)).toBe("8.8.8.8|(other paths 60s/100)");
  });

  it("the storage consumes the bounded key", async () => {
    db.results.push([{ count: 2 }]);
    await authRateLimitStorage.consume(`7.7.7.7|/${"q".repeat(6000)}`, rule);
    expect(db.queries[0]!.values).toContain("7.7.7.7|(other paths 60s/100)");
  });
});

describe("retryAfterSeconds", () => {
  it("rounds up and never answers 0", () => {
    expect(retryAfterSeconds(0, 60, 59_001)).toBe(1);
    expect(retryAfterSeconds(0, 60, 60_000)).toBe(1);
    expect(retryAfterSeconds(0, 60, 1_000)).toBe(59);
  });
});
