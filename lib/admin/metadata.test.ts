import { beforeEach, describe, expect, it, vi } from "vitest";

// Document titles of the admin pages follow what the page shows (review round 2, R2-3): the "acting as" notice while
// an admin acts as a user, "Page not found" for anyone else who is not a platform admin, the record's name on detail
// pages.

const mocks = vi.hoisted(() => ({ getAuthContext: vi.fn(), warn: vi.fn() }));
vi.mock("@/lib/session", () => ({ getAuthContext: mocks.getAuthContext }));
vi.mock("@/lib/log", () => ({ log: { warn: mocks.warn, error: vi.fn(), info: vi.fn() } }));
vi.mock("next-intl/server", () => ({ getTranslations: async (ns: string) => (key: string) => `${ns}.${key}` }));

const { adminMetadata, adminTitleKind, joinTitle } = await import("./metadata");

const admin = { isPlatformAdmin: true, session: { impersonatedBy: null } };
const actingAs = { isPlatformAdmin: false, session: { impersonatedBy: "admin-1" } };
const trainee = { isPlatformAdmin: false, session: { impersonatedBy: null } };

beforeEach(() => vi.clearAllMocks());

describe("admin page titles", () => {
  it("picks the title kind from the visitor", () => {
    expect(adminTitleKind(admin)).toBe("page");
    expect(adminTitleKind(actingAs)).toBe("impersonation");
    expect(adminTitleKind(trainee)).toBe("notFound");
    expect(adminTitleKind(null)).toBe("notFound");
  });

  it("joins a record name to the section title", () => {
    expect(joinTitle("مؤسسة أ", "المؤسسات")).toBe("مؤسسة أ | المؤسسات");
    expect(joinTitle("  ", "Users")).toBe("Users");
    expect(joinTitle(null, "Users")).toBe("Users");
  });

  it("titles the page for a platform admin, with the record's name when there is one", async () => {
    mocks.getAuthContext.mockResolvedValue(admin);
    expect(await adminMetadata("Users")).toEqual({ title: "Users" });
    expect(await adminMetadata("Scan details", async () => ({ name: "Treatment room" }))).toEqual({ title: "Treatment room | Scan details" });
    expect(await adminMetadata("Scan details", async () => null)).toEqual({ title: "common.notFound.title" });
  });

  it("falls back to the section title when the record cannot be read", async () => {
    mocks.getAuthContext.mockResolvedValue(admin);
    expect(await adminMetadata("Scan details", async () => Promise.reject(new Error("db down")))).toEqual({ title: "Scan details" });
    expect(mocks.warn).toHaveBeenCalledWith("admin.metadata.record_failed", expect.anything());
  });

  it("never reads the record for anyone else, and titles what they see instead", async () => {
    const record = vi.fn(async () => ({ name: "secret" }));
    mocks.getAuthContext.mockResolvedValue(actingAs);
    expect(await adminMetadata("Users", record)).toEqual({ title: "admin.impersonation.title" });
    mocks.getAuthContext.mockResolvedValue(trainee);
    expect(await adminMetadata("Users", record)).toEqual({ title: "common.notFound.title" });
    expect(record).not.toHaveBeenCalled();
  });
});
