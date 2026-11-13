// One cluster-wide lock for the changes that can leave an institution without an owner or the platform without an
// admin (review rounds 1-2). The deletion blockers (lib/account/deletion-rules.ts) are check-then-act: without a lock,
// two co-owners deleting at the same moment each see the other as owner and both succeed, two remaining platform
// admins can delete, demote or ban each other, and an owner can delete the account while the other owner leaves or
// is demoted.
//
// Who takes it (always BEFORE the check, released when the change is done):
// - confirmAccountDeletion (lib/account/delete-account.ts): around the blocker check and auth.api.deleteUser;
// - the lib/auth.ts before hook, ONLY for calls that can really remove an owner or a platform admin, decided first
//   with cheap reads (accountLockDecision, lib/account/lock-scope.ts): /admin/remove-user, /admin/set-role (dropping
//   admin) and /admin/ban-user of a platform admin, by a platform admin; /organization/leave, remove-member and
//   update-member-role only when an OWNER of the institution leaves, removes or demotes an owner. Any other caller
//   never touches the lock, so a signed-in user cannot queue on it (review round 2, DoS).
// Released by the after hook (success or APIError) and, for HTTP calls, also by app/api/auth/[...all]/route.ts once
// the response is built (Better Auth skips after hooks when an endpoint throws a plain Error).
// Never call auth.api.removeUser (or those endpoints) while holding the lock: the hook would wait for a lock its own
// caller holds, until LOCK_WAIT_MS.
// Not covered (accepted, rare, fixable by a platform admin): an invitation accepted or a member added at the moment
// the sole owner who is the only member deletes the account leaves that institution with a member and no owner.
//
// How: a Postgres advisory transaction lock, held by an interactive transaction on its own pooled connection until
// release() (Prisma has no session-level connection to pin). The lock is in Postgres, so it covers every replica.
// In front of it an in-process gate: per server instance at most ONE call holds or waits for that connection; the
// others wait in memory (at most MAX_LOCAL_WAITERS, each at most LOCK_WAIT_MS), so waiters never take connections
// from the app pool (review round 2: 60 parallel calls used to exhaust the 10-connection pool).
// Bounded: waiting gives up after LOCK_WAIT_MS (AccountLockBusyError or Postgres' lock timeout; the caller fails, the
// user retries) and a holder that never calls release() loses the lock after LOCK_HOLD_MS. LOCK_HOLD_MS is far longer
// than the slowest real holder (a deletion under load took up to 10 s in the final review, 2.6 s when six ran at once
// on a quiet server): the expiry exists for a holder whose release never runs, not to cut a slow one short, which
// would let a queued deletion run beside it. The expiry is logged with the holder (account.lock.expired { holder }).
// CLI-safe (no "server-only"): lib/auth.ts imports it.
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";

export const ACCOUNT_LOCK_KEY = "waqaya:account-membership-v1";
export const LOCK_WAIT_MS = 10_000;
export const LOCK_HOLD_MS = 30_000;
export const MAX_LOCAL_WAITERS = 32;

export type AccountLock = { release: () => void };

/** The lock could not be taken in time, or too many calls are already waiting on this instance. */
export class AccountLockBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountLockBusyError";
  }
}

/** Better Auth endpoints whose calls MAY take the lock in lib/auth.ts (accountLockDecision says when). */
export const ACCOUNT_LOCK_PATHS: ReadonlySet<string> = new Set([
  "/admin/remove-user",
  "/admin/set-role",
  "/admin/ban-user",
  "/organization/leave",
  "/organization/update-member-role",
  "/organization/remove-member",
]);

// ---- in-process gate (one per server process: on globalThis, because Next may load this module more than once) ----

type GateWaiter = { grant: () => void; timer: ReturnType<typeof setTimeout> };
type Gate = { held: boolean; queue: GateWaiter[] };
const globalForLock = globalThis as typeof globalThis & {
  __waqayaAccountLockGate?: Gate;
  __waqayaAccountHookLocks?: WeakMap<object, AccountLock>;
};
const gate: Gate = (globalForLock.__waqayaAccountLockGate ??= { held: false, queue: [] });

/** For tests and diagnostics: how many calls wait in memory on this instance. */
export const localWaiters = () => gate.queue.length;

/** Enters the gate (waits at most `timeoutMs`) and returns its idempotent leave(). */
function enterGate(timeoutMs: number): Promise<() => void> {
  return new Promise((resolve, reject) => {
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      const next = gate.queue.shift();
      if (next) {
        clearTimeout(next.timer);
        next.grant(); // ownership passes on: gate.held stays true
      } else {
        gate.held = false;
      }
    };
    if (!gate.held) {
      gate.held = true;
      resolve(leave);
      return;
    }
    if (gate.queue.length >= MAX_LOCAL_WAITERS) {
      reject(new AccountLockBusyError("account lock: too many calls waiting"));
      return;
    }
    const waiter: GateWaiter = {
      grant: () => resolve(leave),
      timer: setTimeout(() => {
        const i = gate.queue.indexOf(waiter);
        if (i >= 0) gate.queue.splice(i, 1);
        reject(new AccountLockBusyError("account lock: timed out waiting"));
      }, timeoutMs),
    };
    waiter.timer.unref?.();
    gate.queue.push(waiter);
  });
}

/** The Postgres side: resolves once the advisory lock is held; `onSettled` runs when its transaction has ended. */
function advisoryLock(waitMs: number, holder: string, onSettled: () => void): Promise<AccountLock> {
  return new Promise<AccountLock>((resolve, reject) => {
    let acquired = false;
    prisma
      .$transaction(
        async (tx) => {
          // lock_timeout also bounds advisory-lock waits; is_local = true: this transaction only.
          await tx.$executeRaw`SELECT set_config('lock_timeout', ${`${waitMs}ms`}, true)`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ACCOUNT_LOCK_KEY}, 0))`;
          acquired = true;
          let done!: () => void;
          const released = new Promise<void>((r) => {
            done = r;
          });
          const timer = setTimeout(() => {
            log.warn("account.lock.expired", { holdMs: LOCK_HOLD_MS, holder });
            done();
          }, LOCK_HOLD_MS);
          timer.unref?.();
          let open = true;
          resolve({
            release: () => {
              if (!open) return;
              open = false;
              clearTimeout(timer);
              done();
            },
          });
          await released; // commit = unlock
        },
        { maxWait: waitMs, timeout: waitMs + LOCK_HOLD_MS + 5_000 },
      )
      .catch((err: unknown) => {
        if (!acquired) reject(err);
        else log.error("account.lock.release_failed", { err });
      })
      .finally(onSettled);
  });
}

/**
 * Waits for the lock (at most LOCK_WAIT_MS in all, then throws) and returns its release(). release() is idempotent.
 * `holder` names the caller in the logs (an endpoint path, "account.delete").
 */
export async function acquireAccountLock(holder = "unknown"): Promise<AccountLock> {
  const started = Date.now();
  const leaveGate = await enterGate(LOCK_WAIT_MS);
  const waitLeft = Math.max(1, LOCK_WAIT_MS - (Date.now() - started));
  try {
    return await advisoryLock(waitLeft, holder, leaveGate);
  } catch (err) {
    leaveGate(); // onSettled calls it too: idempotent
    throw err;
  }
}

/** Runs `fn` while holding the account lock. */
export async function withAccountLock<T>(fn: () => Promise<T>, holder?: string): Promise<T> {
  const lock = await acquireAccountLock(holder);
  try {
    return await fn();
  } finally {
    lock.release();
  }
}

// Locks taken in a Better Auth before hook and released in the after hook of the same call (or by the auth route
// handler). Keyed by the call's Headers and Request objects: Better Auth (api/dispatch.mjs) and better-call pass the
// same instances to both hooks, and better-call hands the route handler's Request to the endpoint unchanged.
// If neither release runs (a server-side auth.api.* call whose endpoint throws a plain Error), LOCK_HOLD_MS does.
const hookLocks: WeakMap<object, AccountLock> = (globalForLock.__waqayaAccountHookLocks ??= new WeakMap());

type RequestKeys = { headers?: object | null; request?: object | null; path?: string };
const keysOf = ({ headers, request }: RequestKeys): object[] => [headers, request].filter((k): k is object => !!k);

/** Takes the account lock for this call. Returns false (no lock) when the call has neither headers nor a request. */
export async function lockForRequest(call: RequestKeys): Promise<boolean> {
  const keys = keysOf(call);
  if (keys.length === 0) return false;
  const lock = await acquireAccountLock(call.path);
  for (const key of keys) hookLocks.set(key, lock);
  return true;
}

export function releaseRequestLock(call: RequestKeys): void {
  for (const key of keysOf(call)) {
    hookLocks.get(key)?.release();
    hookLocks.delete(key);
  }
}
