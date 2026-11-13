import { describe, expect, it } from "vitest";
import type { Scope } from "@/lib/authz";
import { attemptsContinuable, canContinueIn, resumableAttempt } from "./attempt-scope";

/** Where an open attempt may be continued (SEC-1): only in the institution it is credited to, or anywhere if none. */

const inOrg: Scope = { userId: "u1", organizationId: "o1", orgRole: "trainee", isPlatformAdmin: false };
const solo: Scope = { userId: "u1", organizationId: null, orgRole: null, isPlatformAdmin: false };

describe("canContinueIn", () => {
  it("continues an attempt of the active institution or of none", () => {
    expect(canContinueIn("o1", inOrg)).toBe(true);
    expect(canContinueIn(null, inOrg)).toBe(true);
    expect(canContinueIn(null, solo)).toBe(true);
  });
  it("refuses an attempt credited to an institution that is not the active one (left, removed or switched)", () => {
    expect(canContinueIn("o1", solo)).toBe(false);
    expect(canContinueIn("o2", inOrg)).toBe(false);
  });
});

describe("attemptsContinuable", () => {
  it("is the user's own open attempts of no institution or of the active one", () => {
    expect(attemptsContinuable(inOrg)).toEqual({
      AND: [{ userId: "u1" }, { OR: [{ organizationId: null }, { organizationId: "o1" }] }, { status: "in_progress" }],
    });
    expect(attemptsContinuable(solo)).toEqual({ AND: [{ userId: "u1" }, { organizationId: null }, { status: "in_progress" }] });
  });
});

describe("resumableAttempt (review round 2, SPEC-2)", () => {
  const o1 = { id: "a-o1", organizationId: "o1" };
  const o2 = { id: "a-o2", organizationId: "o2" };
  const personal = { id: "a-solo", organizationId: null };

  it("continues the attempt of the active institution before a newer one of no institution", () => {
    expect(resumableAttempt([personal, o2, o1], inOrg)?.id).toBe("a-o1");
    expect(resumableAttempt([o1, personal], inOrg)?.id).toBe("a-o1");
  });
  it("continues an attempt of no institution when the active one has none", () => {
    expect(resumableAttempt([o2, personal], inOrg)?.id).toBe("a-solo");
    expect(resumableAttempt([o1, personal], solo)?.id).toBe("a-solo");
  });
  it("never continues an attempt of another institution", () => {
    expect(resumableAttempt([o2], inOrg)).toBeUndefined();
    expect(resumableAttempt([o1, o2], solo)).toBeUndefined();
    expect(resumableAttempt([], inOrg)).toBeUndefined();
  });
  it("takes the newest when two qualify (rows come newest first)", () => {
    const older = { id: "a-o1-old", organizationId: "o1" };
    expect(resumableAttempt([o1, older], inOrg)?.id).toBe("a-o1");
  });
});
