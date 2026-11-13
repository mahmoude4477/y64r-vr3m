import { describe, expect, it } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "better-auth/client/plugins";
import arOrg from "@/messages/ar/org.json";
import enOrg from "@/messages/en/org.json";
import { ORG_ERROR_KEYS, orgErrorKey } from "./errors";

describe("orgErrorKey", () => {
  it("maps the codes our hooks throw", () => {
    expect(orgErrorKey({ status: 503, code: "ACCOUNT_LOCK_BUSY" })).toBe("lockBusy");
    expect(orgErrorKey({ status: 403, code: "ORGANIZATION_SUSPENDED" })).toBe("suspended");
    expect(orgErrorKey({ status: 403, code: "MUST_CHANGE_PASSWORD" })).toBe("mustChangePassword");
    expect(orgErrorKey({ status: 400, code: "ACCOUNT_DELETION_BLOCKED" })).toBe("deletionBlocked");
  });

  it("maps the server rules of lib/org/auth-gates.ts", () => {
    expect(orgErrorKey({ status: 400, code: "INVALID_INPUT" })).toBe("invalidInput");
    expect(orgErrorKey({ status: 400, code: "DEPARTMENT_NAME_TAKEN" })).toBe("departmentNameTaken");
    expect(orgErrorKey({ status: 403, code: "YOU_ARE_NOT_ALLOWED_TO_VIEW_THIS" })).toBe("notAllowed");
    expect(orgErrorKey({ status: 400, code: "FIELD_NOT_ALLOWED" })).toBe("notAllowed");
    expect(orgErrorKey({ status: 403, code: "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION" })).toBe("notAllowed");
  });

  it("maps Better Auth's owner and invitation rules", () => {
    expect(orgErrorKey({ status: 400, code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER" })).toBe("lastOwner");
    expect(orgErrorKey({ status: 400, code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER" })).toBe("lastOwner");
    expect(orgErrorKey({ status: 403, code: "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE" })).toBe("ownerRoleOnly");
    expect(orgErrorKey({ status: 400, code: "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION" })).toBe("alreadyMember");
    expect(orgErrorKey({ status: 400, code: "UNABLE_TO_REMOVE_LAST_TEAM" })).toBe("lastDepartment");
    expect(orgErrorKey({ status: 403, code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION" })).toBe("notRecipient");
  });

  it("every Better Auth organization code we map is a real one", () => {
    const real = new Set(Object.keys(ORGANIZATION_ERROR_CODES));
    for (const code of [
      "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
      "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER",
      "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM",
      "UNABLE_TO_REMOVE_LAST_TEAM",
      "INVITATION_NOT_FOUND",
      "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
    ]) {
      expect(real.has(code), code).toBe(true);
    }
  });

  it("falls back on the status, then generic; a thrown request is a network error", () => {
    expect(orgErrorKey({ status: 400, message: "ROLE_NOT_FOUND: member" })).toBe("roleNotFound");
    expect(orgErrorKey({ status: 429 })).toBe("rateLimited");
    expect(orgErrorKey({ status: 401 })).toBe("sessionExpired");
    expect(orgErrorKey({ status: 403, code: "SOMETHING_NEW" })).toBe("notAllowed");
    expect(orgErrorKey({ status: 500 })).toBe("generic");
    expect(orgErrorKey({ status: 0 })).toBe("network");
    expect(orgErrorKey(null)).toBe("network");
  });

  it("every key has a text in both languages", () => {
    for (const key of ORG_ERROR_KEYS) {
      expect(typeof (arOrg.errors as Record<string, unknown>)[key], `ar ${key}`).toBe("string");
      expect(typeof (enOrg.errors as Record<string, unknown>)[key], `en ${key}`).toBe("string");
    }
  });
});
