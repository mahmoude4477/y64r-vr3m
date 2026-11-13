// Which Better Auth calls take the account lock (lib/account/deletion-lock.ts) and what they check under it (review
// round 2). Decided in the lib/auth.ts before hook, BEFORE the lock, with one or two indexed reads: only a call that
// Better Auth itself would let remove an owner or a platform admin waits for the lock. Everyone else (a trainee
// calling /organization/leave with any id, an examiner calling remove-member, a non-admin calling /admin/*) gets
// Better Auth's own answer without touching it. CLI-safe: lib/auth.ts imports it.
//
// Better Auth's rules this mirrors (plugins/organization/routes/crud-members.mjs, plugins/admin/routes.mjs):
// - only an OWNER may remove or demote an owner, and the target must be a member of the same institution
//   (body.organizationId, else the active one; leave needs body.organizationId);
// - admin endpoints answer 403 to anyone who is not a platform admin; nobody may ban themselves.
// The reads run before the lock, so a role that changes in between can skip it; that needs a promotion racing a
// removal racing a deletion, and it can at worst leave an institution without an owner (a platform admin fixes it).
import { hasRole } from "@/lib/account/deletion-rules";
import { isPlatformAdminRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type LockCaller = { userId: string; activeOrganizationId?: string | null; platformAdmin: boolean };

export type AccountLockDecision =
  | { lock: false }
  /** /admin/remove-user: the target's deletion blockers (deletionBlockers) under the lock. */
  | { lock: true; check: "deletion"; targetUserId: string }
  /** /admin/set-role dropping admin, /admin/ban-user: refuse when the target is the last active platform admin. */
  | { lock: true; check: "last_admin"; targetUserId: string }
  /** Organization endpoints: Better Auth's own last-owner check runs under the lock. */
  | { lock: true; check: null };

const NO_LOCK: AccountLockDecision = { lock: false };
const LOCK_ONLY: AccountLockDecision = { lock: true, check: null };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** An id from a request body (Better Auth coerces admin userIds to strings). */
function idOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** The roles of a Better Auth role value: "a,b" or ["a", "b,c"]. */
export function roleList(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value])
    .filter((r): r is string => typeof r === "string")
    .flatMap((r) => r.split(","))
    .map((r) => r.trim())
    .filter(Boolean);
}

async function isOwnerOf(userId: string, organizationId: string): Promise<boolean> {
  const m = await prisma.member.findFirst({ where: { userId, organizationId }, select: { role: true } });
  return !!m && hasRole(m.role, "owner");
}

async function isPlatformAdminUser(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return !!u && isPlatformAdminRole(u.role);
}

async function memberIsOwner(organizationId: string, memberIdOrEmail: string): Promise<boolean> {
  const m = memberIdOrEmail.includes("@")
    ? await prisma.member.findFirst({
        where: { organizationId, user: { email: { equals: memberIdOrEmail.trim(), mode: "insensitive" } } },
        select: { role: true },
      })
    : await prisma.member.findFirst({ where: { id: memberIdOrEmail, organizationId }, select: { role: true } });
  return !!m && hasRole(m.role, "owner");
}

/** Whether this Better Auth call must take the account lock, and what to check once it holds it. */
export async function accountLockDecision(path: string, body: unknown, caller: LockCaller): Promise<AccountLockDecision> {
  const b = asRecord(body);
  const orgId = () => idOf(b.organizationId) ?? caller.activeOrganizationId ?? null;
  switch (path) {
    case "/admin/remove-user": {
      const target = idOf(b.userId);
      return caller.platformAdmin && target ? { lock: true, check: "deletion", targetUserId: target } : NO_LOCK;
    }
    case "/admin/set-role": {
      const target = idOf(b.userId);
      if (!caller.platformAdmin || !target || roleList(b.role).includes("admin")) return NO_LOCK;
      return (await isPlatformAdminUser(target)) ? { lock: true, check: "last_admin", targetUserId: target } : NO_LOCK;
    }
    case "/admin/ban-user": {
      const target = idOf(b.userId);
      if (!caller.platformAdmin || !target || target === caller.userId) return NO_LOCK; // self: Better Auth refuses
      return (await isPlatformAdminUser(target)) ? { lock: true, check: "last_admin", targetUserId: target } : NO_LOCK;
    }
    case "/organization/leave": {
      const org = idOf(b.organizationId); // leave never falls back to the active institution
      return org && (await isOwnerOf(caller.userId, org)) ? LOCK_ONLY : NO_LOCK;
    }
    case "/organization/remove-member": {
      const org = orgId();
      const target = idOf(b.memberIdOrEmail);
      if (!org || !target || !(await isOwnerOf(caller.userId, org))) return NO_LOCK;
      return (await memberIsOwner(org, target)) ? LOCK_ONLY : NO_LOCK;
    }
    case "/organization/update-member-role": {
      const org = orgId();
      const target = idOf(b.memberId);
      if (!org || !target || roleList(b.role).includes("owner")) return NO_LOCK; // an owner stays an owner
      if (!(await isOwnerOf(caller.userId, org))) return NO_LOCK;
      return (await memberIsOwner(org, target)) ? LOCK_ONLY : NO_LOCK;
    }
    default:
      return NO_LOCK;
  }
}
