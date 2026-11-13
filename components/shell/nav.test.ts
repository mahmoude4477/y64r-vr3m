import { describe, expect, it } from "vitest";
import { NAV_ITEMS, resolveTrail } from "./nav";

const key = (p: string) => {
  const r = resolveTrail(p);
  return [r.section?.key ?? null, r.sub];
};

describe("resolveTrail", () => {
  it("maps sections and sub pages", () => {
    expect(key("/dashboard")).toEqual(["dashboard", null]);
    expect(key("/protocols/sharps-safety")).toEqual(["protocols", "protocolDetail"]);
    expect(key("/simulations/blood-spill")).toEqual(["simulations", "simulationPlay"]);
    expect(key("/simulations/attempts/abc")).toEqual(["simulations", "simulationAttempt"]);
    expect(key("/scans/new")).toEqual(["scans", "scanNew"]);
    expect(key("/scans/abc")).toEqual(["scans", "scanDetail"]);
    expect(key("/admin/ai")).toEqual(["admin", "adminAi"]);
    expect(key("/settings/password")).toEqual(["settings", "settingsPassword"]);
  });
  it("falls back to the closest known parent for deeper feature pages", () => {
    expect(key("/scans/abc/report")).toEqual(["scans", "scanDetail"]);
  });
  it("keeps the list page as a linked parent crumb on detail pages", () => {
    expect(resolveTrail("/admin/protocols/abc").parent).toEqual({ label: "adminProtocols", href: "/admin/protocols" });
    expect(key("/admin/protocols/new")).toEqual(["admin", "adminProtocolNew"]);
    expect(key("/admin/protocols")).toEqual(["admin", "adminProtocols"]);
    expect(resolveTrail("/admin/protocols").parent).toBeNull();
    expect(key("/org/protocols/copy")).toEqual(["org", "orgProtocolCopy"]);
    expect(resolveTrail("/admin/scenarios/abc/preview").parent?.href).toBe("/admin/scenarios");
    expect(resolveTrail("/admin/assessments/scans/abc").parent?.href).toBe("/admin/assessments");
    expect(key("/reports/trainees/abc")).toEqual(["reports", "reportTrainee"]);
    expect(resolveTrail("/reports/trainees/abc").parent).toBeNull();
    expect(key("/reports/print")).toEqual(["reports", "reportPrint"]);
  });
  it("returns nothing outside the app", () => {
    expect(key("/")).toEqual([null, null]);
    expect(key("/sign-in")).toEqual([null, null]);
  });
  it("gates org, scans and admin items", () => {
    const visible = (orgStaff: boolean, platformAdmin: boolean) =>
      NAV_ITEMS.filter((i) => !i.show || i.show({ orgStaff, platformAdmin })).map((i) => i.key);
    // individual users and org trainees: no scans (staff-only), no org, no admin
    expect(visible(false, false)).toEqual(["dashboard", "protocols", "simulations", "reports", "settings"]);
    expect(visible(true, false)).toContain("org");
    expect(visible(true, false)).toContain("scans");
    expect(visible(false, true)).toContain("admin");
    expect(visible(false, true)).not.toContain("scans");
  });
  it("shows protocol editors the content item only, and platform admins the admin item only", () => {
    const keys = (access: { orgStaff: boolean; platformAdmin: boolean; contentEditor?: boolean }) =>
      NAV_ITEMS.filter((i) => !i.show || i.show(access)).map((i) => i.key);
    expect(keys({ orgStaff: false, platformAdmin: false, contentEditor: true })).toContain("content");
    expect(keys({ orgStaff: false, platformAdmin: false, contentEditor: true })).not.toContain("admin");
    expect(keys({ orgStaff: false, platformAdmin: true, contentEditor: true })).not.toContain("content");
    expect(keys({ orgStaff: false, platformAdmin: false })).not.toContain("content");
  });
});
