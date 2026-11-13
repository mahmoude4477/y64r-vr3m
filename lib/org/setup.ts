// The managers' first steps on /org (the "set up your institution" card), from the institution's figures. Pure.
import { ORGANIZATION_TYPES } from "@/lib/permissions";
import { orgTypeOf } from "./display";

export type SetupFacts = {
  type: string | null;
  memberCount: number;
  ownerCount: number;
  departmentCount: number;
  pendingInvitationCount: number;
};

export type SetupStepKey = "details" | "invite" | "departments";

/**
 * Which first steps are done. The details step needs the institution's type only: the English name is optional (the
 * edit form says so), so an Arabic-only institution can finish the checklist.
 */
export function setupSteps(facts: SetupFacts): Record<SetupStepKey, boolean> {
  return {
    details: orgTypeOf(facts.type, ORGANIZATION_TYPES) !== null,
    invite: facts.memberCount - facts.ownerCount > 0 || facts.pendingInvitationCount > 0,
    departments: facts.departmentCount > 0,
  };
}
