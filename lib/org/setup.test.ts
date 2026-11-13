import { describe, expect, it } from "vitest";
import { setupSteps } from "./setup";

const fresh = { type: null, memberCount: 1, ownerCount: 1, departmentCount: 0, pendingInvitationCount: 0 };

describe("setupSteps", () => {
  it("a new institution has every step open", () => {
    expect(setupSteps(fresh)).toEqual({ details: false, invite: false, departments: false });
  });

  it("the details step needs the type only (the English name is optional)", () => {
    expect(setupSteps({ ...fresh, type: "hospital" }).details).toBe(true);
    expect(setupSteps({ ...fresh, type: "bogus" }).details).toBe(false);
  });

  it("inviting is done with a member who is not an owner, or a waiting invitation", () => {
    expect(setupSteps({ ...fresh, memberCount: 2, ownerCount: 2 }).invite).toBe(false);
    expect(setupSteps({ ...fresh, memberCount: 2 }).invite).toBe(true);
    expect(setupSteps({ ...fresh, pendingInvitationCount: 1 }).invite).toBe(true);
    expect(setupSteps({ ...fresh, departmentCount: 1 }).departments).toBe(true);
  });
});
