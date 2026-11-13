import { afterEach, describe, expect, it, vi } from "vitest";

// A fake Postgres advisory lock: pg_advisory_xact_lock waits while another transaction holds it; commit releases.
// `open` / `maxOpen` count the interactive transactions (= pooled connections) in use at the same time.
const pg = vi.hoisted(() => ({
  held: false,
  waiters: [] as Array<() => void>,
  sql: [] as string[],
  failNext: false,
  open: 0,
  maxOpen: 0,
}));

vi.mock("@/lib/log", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      let mine = false;
      pg.open += 1;
      pg.maxOpen = Math.max(pg.maxOpen, pg.open);
      const tx = {
        $executeRaw: async (strings: TemplateStringsArray) => {
          const sql = strings.join("?");
          pg.sql.push(sql);
          if (sql.includes("pg_advisory_xact_lock")) {
            if (pg.failNext) {
              pg.failNext = false;
              throw new Error("canceling statement due to lock timeout");
            }
            while (pg.held) await new Promise<void>((r) => pg.waiters.push(r));
            pg.held = true;
            mine = true;
          }
          return 1;
        },
      };
      try {
        return await fn(tx);
      } finally {
        pg.open -= 1;
        if (mine) {
          pg.held = false;
          pg.waiters.shift()?.();
        }
      }
    },
  },
}));

const m = await import("./deletion-lock");
const { log } = await import("@/lib/log");

afterEach(() => {
  vi.useRealTimers();
});

describe("account lock", () => {
  it("sets a lock timeout, then takes one global advisory lock", async () => {
    pg.sql = [];
    await m.withAccountLock(async () => undefined);
    expect(pg.sql[0]).toContain("lock_timeout");
    expect(pg.sql[1]).toContain("pg_advisory_xact_lock");
  });

  it("serialises: the second check-and-delete starts only after the first one released the lock", async () => {
    const events: string[] = [];
    let finishFirst!: () => void;
    const first = m.withAccountLock(async () => {
      events.push("first:check");
      await new Promise<void>((r) => {
        finishFirst = r;
      });
      events.push("first:delete");
    });
    await vi.waitFor(() => expect(events).toEqual(["first:check"]));
    const second = m.withAccountLock(async () => {
      events.push("second:check");
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual(["first:check"]); // still waiting
    finishFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:check", "first:delete", "second:check"]);
  });

  it("releases the lock when the work throws", async () => {
    await expect(m.withAccountLock(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await m.withAccountLock(async () => undefined); // would hang if the lock were still held
    await vi.waitFor(() => expect(pg.held).toBe(false)); // the commit follows release() by a tick
  });

  it("rejects when the lock cannot be taken in time (nothing runs)", async () => {
    pg.failNext = true;
    const work = vi.fn();
    await expect(m.withAccountLock(work)).rejects.toThrow(/lock timeout/);
    expect(work).not.toHaveBeenCalled();
  });

  it("parallel callers wait in memory: at most one transaction (pooled connection) per instance (review round 2)", async () => {
    pg.maxOpen = 0;
    const holder = await m.acquireAccountLock();
    const order: number[] = [];
    const waiting = Array.from({ length: 20 }, (_, i) =>
      m.withAccountLock(async () => {
        order.push(i);
      }),
    );
    await vi.waitFor(() => expect(m.localWaiters()).toBe(20));
    expect(pg.open).toBe(1); // only the holder's transaction; the 20 waiters hold no connection
    holder.release();
    await Promise.all(waiting);
    expect(order).toEqual([...Array(20).keys()]); // first come, first served
    expect(pg.maxOpen).toBe(1);
    expect(m.localWaiters()).toBe(0);
  });

  it("refuses at once when MAX_LOCAL_WAITERS calls already wait, and a waiter gives up after LOCK_WAIT_MS", async () => {
    const holder = await m.acquireAccountLock(); // real timers: its LOCK_HOLD_MS expiry must not fire below
    vi.useFakeTimers();
    const waiting = Array.from({ length: m.MAX_LOCAL_WAITERS }, () => m.acquireAccountLock());
    const settled = waiting.map((p) => p.then(() => "got", (e: unknown) => e));
    await expect(m.acquireAccountLock()).rejects.toBeInstanceOf(m.AccountLockBusyError);
    await vi.advanceTimersByTimeAsync(m.LOCK_WAIT_MS + 1);
    const results = await Promise.all(settled);
    expect(results.every((r) => r instanceof m.AccountLockBusyError)).toBe(true);
    expect(m.localWaiters()).toBe(0);
    holder.release();
    vi.useRealTimers();
    await m.withAccountLock(async () => undefined); // the gate is free again
  });

  it("a holder that never releases loses the lock after LOCK_HOLD_MS, logged with its name", async () => {
    // The hold limit is far longer than a waiter's patience (final review): it frees a leaked lock, it never cuts
    // a slow but valid holder short while others wait.
    expect(m.LOCK_HOLD_MS).toBeGreaterThanOrEqual(3 * m.LOCK_WAIT_MS);
    vi.useFakeTimers();
    vi.mocked(log.warn).mockClear();
    await m.acquireAccountLock("/admin/remove-user"); // never released (e.g. the after hook never ran)
    const early = expect(m.acquireAccountLock()).rejects.toBeInstanceOf(m.AccountLockBusyError);
    await vi.advanceTimersByTimeAsync(m.LOCK_WAIT_MS + 1);
    await early; // a caller during the hold gives up ("try again")
    await vi.advanceTimersByTimeAsync(m.LOCK_HOLD_MS - m.LOCK_WAIT_MS - 2);
    expect(log.warn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(log.warn).toHaveBeenCalledWith("account.lock.expired", { holdMs: m.LOCK_HOLD_MS, holder: "/admin/remove-user" });
    const late = await m.acquireAccountLock(); // free again
    late.release();
  });
});

describe("hook locks (one Better Auth call: before hook takes, after hook releases)", () => {
  it("is found again by the call's headers or its request object", async () => {
    const headers = new Headers();
    const request = new Request("http://127.0.0.1/api/auth/admin/remove-user");
    expect(await m.lockForRequest({ headers, request })).toBe(true);
    expect(pg.held).toBe(true);
    m.releaseRequestLock({ request }); // the after hook may see only one of them
    await vi.waitFor(() => expect(pg.held).toBe(false));
    m.releaseRequestLock({ headers, request }); // idempotent
  });

  it("does nothing for a call with neither headers nor a request", async () => {
    expect(await m.lockForRequest({})).toBe(false);
    expect(pg.held).toBe(false);
  });

  it("lists the endpoints that can remove an owner or a platform admin", () => {
    expect([...m.ACCOUNT_LOCK_PATHS].sort()).toEqual([
      "/admin/ban-user",
      "/admin/remove-user",
      "/admin/set-role",
      "/organization/leave",
      "/organization/remove-member",
      "/organization/update-member-role",
    ]);
  });
});
