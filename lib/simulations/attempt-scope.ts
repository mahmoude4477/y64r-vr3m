import type { Prisma } from "@/generated/prisma/client";
import { attemptsOwn, type Scope } from "@/lib/authz";

/**
 * Where an open attempt may be continued (pure, unit-tested in attempt-scope.test.ts).
 *
 * An attempt is credited to the institution that was active when it started (`organizationId`, null for an individual
 * user): its result counts in that institution's reports. So it is continued, answered and completed only by its owner
 * while that institution is still the active one (or when it belongs to none). A member who left or was removed, or
 * who switched to another institution, can no longer write into the first one's data (PRODUCT 7: membership and role
 * on every read and write). Whether the scenario itself may still be played is checked separately (scenariosReadable).
 *
 * One open attempt per user, scenario and institution (review round 2, SPEC-2): starting the scenario in another
 * context opens a separate attempt there and leaves the first one open, so it continues where it stopped once its
 * institution is the active one again, as its result page promises. "Start over" closes only the attempts that could
 * be continued in the active context.
 */
export function canContinueIn(attemptOrganizationId: string | null, scope: Pick<Scope, "organizationId">): boolean {
  return attemptOrganizationId === null || attemptOrganizationId === scope.organizationId;
}

/** Attempts credited to no institution or to the active one (the where-clause form of canContinueIn). */
export function attemptsCreditedHere(scope: Pick<Scope, "organizationId">): Prisma.SimulationAttemptWhereInput {
  return scope.organizationId ? { OR: [{ organizationId: null }, { organizationId: scope.organizationId }] } : { organizationId: null };
}

/** The user's open attempts that may be continued in the active context (same rule as canContinueIn). */
export function attemptsContinuable(scope: Scope): Prisma.SimulationAttemptWhereInput {
  return { AND: [attemptsOwn(scope), attemptsCreditedHere(scope), { status: "in_progress" }] };
}

/**
 * Of the user's open attempts on one scenario (newest first), the one the player continues in the active context: the
 * attempt credited to the active institution first, else an attempt of no institution. Two can be continuable at once
 * only when an individual attempt was started while an institution's attempt stayed open; the institution's attempt
 * then comes first in that institution, and the individual one continues after it, or with no institution active.
 * Every page that offers "Continue" (catalogue, player, result) and startAttempt pick with this, so they agree.
 */
export function resumableAttempt<T extends { organizationId: string | null }>(
  newestFirst: readonly T[],
  scope: Pick<Scope, "organizationId">,
): T | undefined {
  const credited = scope.organizationId ? newestFirst.find((a) => a.organizationId === scope.organizationId) : undefined;
  return credited ?? newestFirst.find((a) => a.organizationId === null);
}
