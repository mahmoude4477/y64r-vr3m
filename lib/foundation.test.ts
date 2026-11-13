import { describe, expect, it } from "vitest";
import {
  attemptsReadable,
  isOrgManager,
  isOrgStaff,
  photosReadable,
  protocolsReadable,
  requireOrgScope,
  scansReadable,
  scansWritable,
  type Scope,
  scopeOf,
} from "./authz";
import { maskAddress, parseFrom } from "./email";
import { escapeHtml, renderInvitationEmail, renderVerificationOtpEmail } from "./email/templates";
import { localizedColumn, pick, pickOrNull } from "./i18n-content";
import { fitLongEdge } from "./image/prepare-photo";
import { strongestOrgRole } from "./permissions";
import { localeFromHeaders } from "./request-locale";
import { safeCallbackUrl, switchLocaleHref, withLocale } from "./safe-callback";

const ORIGIN = "https://waqaya.example";

describe("safeCallbackUrl", () => {
  const fb = "/ar/dashboard";
  it("accepts same-origin locale-prefixed paths", () => {
    expect(safeCallbackUrl("/ar/scans/abc?x=1#top", ORIGIN, fb)).toBe("/ar/scans/abc?x=1#top");
    expect(safeCallbackUrl("/en", ORIGIN, fb)).toBe("/en");
    expect(safeCallbackUrl("/en/", ORIGIN, fb)).toBe("/en/");
  });
  it("rejects open redirects and junk", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "//evil.com",
      "/\\evil.com",
      "/ar\\..\\evil",
      "https://evil.com/ar/x",
      "/fr/x",
      "/arx",
      "/ar/x\u0000",
      "javascript:alert(1)",
      "/dashboard",
      "ar/dashboard",
    ]) {
      expect(safeCallbackUrl(bad, ORIGIN, fb)).toBe(fb);
    }
  });
});

describe("locale switching", () => {
  it("withLocale replaces only a leading locale segment", () => {
    expect(withLocale("/ar/scans?x=1", "en")).toBe("/en/scans?x=1");
    expect(withLocale("/en", "ar")).toBe("/ar");
    expect(withLocale("/arx/y", "en")).toBe("/arx/y");
    expect(withLocale("/dashboard", "en")).toBe("/dashboard");
  });
  it("switchLocaleHref keeps path, query and hash and moves callbackUrl to the new locale", () => {
    expect(switchLocaleHref({ pathname: "/ar/sign-in", search: "?callbackUrl=%2Far%2Fscans", hash: "" }, "en")).toBe(
      "/en/sign-in?callbackUrl=%2Fen%2Fscans",
    );
    expect(switchLocaleHref({ pathname: "/en/scans/abc", search: "?tab=2", hash: "#top" }, "ar")).toBe("/ar/scans/abc?tab=2#top");
    expect(switchLocaleHref({ pathname: "/ar", search: "", hash: "" }, "en")).toBe("/en");
    expect(switchLocaleHref({ pathname: "/ar/", search: "", hash: "" }, "en")).toBe("/en");
  });
});

describe("pick", () => {
  const row = { titleAr: "عنوان", titleEn: "Title", noteAr: null, noteEn: "" };
  it("returns the locale column with fallback to the other", () => {
    expect(pick(row, "title", "ar")).toBe("عنوان");
    expect(pick(row, "title", "en")).toBe("Title");
    expect(pick({ titleAr: "عنوان", titleEn: "" }, "title", "en")).toBe("عنوان");
    expect(pick({ titleAr: "", titleEn: "Title" }, "title", "ar")).toBe("Title");
  });
  it("handles optional pairs", () => {
    expect(pick(row, "note", "ar")).toBe("");
    expect(pickOrNull(row, "note", "en")).toBeNull();
    expect(localizedColumn("title", "en")).toBe("titleEn");
    expect(localizedColumn("title", "ar")).toBe("titleAr");
  });
});

describe("authz", () => {
  const base: Scope = { userId: "u1", organizationId: "o1", orgRole: "trainee", isPlatformAdmin: false };
  const personal: Scope = { userId: "u1", organizationId: null, orgRole: null, isPlatformAdmin: false };

  it("scopeOf drops a role without an organization", () => {
    expect(scopeOf({ user: { id: "u" }, organizationId: null, orgRole: "owner", isPlatformAdmin: false }).orgRole).toBeNull();
  });

  it("classifies roles", () => {
    expect(isOrgManager({ ...base, orgRole: "owner" })).toBe(true);
    expect(isOrgManager({ ...base, orgRole: "examiner" })).toBe(false);
    expect(isOrgStaff({ ...base, orgRole: "examiner" })).toBe(true);
    expect(isOrgStaff(base)).toBe(false);
    expect(isOrgStaff(personal)).toBe(false);
  });

  it("protocols: global published + own org (managers see drafts)", () => {
    expect(protocolsReadable(personal)).toEqual({ OR: [{ organizationId: null, isPublished: true }] });
    expect(protocolsReadable(base)).toEqual({
      OR: [{ organizationId: null, isPublished: true }, { organizationId: "o1", isPublished: true }],
    });
    expect(protocolsReadable({ ...base, orgRole: "admin" })).toEqual({
      OR: [{ organizationId: null, isPublished: true }, { organizationId: "o1" }],
    });
  });

  it("scans and attempts never leak other organizations", () => {
    const nothing = { id: { in: [] } };
    expect(scansReadable({ ...base, orgRole: "examiner" })).toEqual({ organizationId: "o1" });
    expect(scansWritable({ ...base, orgRole: "admin" })).toEqual({ organizationId: "o1" });
    expect(photosReadable({ ...base, orgRole: "owner" })).toEqual({ organizationId: "o1" });
    // trainees and individual users see no scans or photos at all
    for (const s of [base, personal]) {
      expect(scansReadable(s)).toEqual(nothing);
      expect(scansWritable(s)).toEqual(nothing);
      expect(photosReadable(s)).toEqual(nothing);
    }
    expect(attemptsReadable(base)).toEqual({ userId: "u1" });
    expect(attemptsReadable({ ...base, orgRole: "owner" })).toEqual({
      OR: [{ organizationId: "o1" }, { userId: "u1" }],
    });
  });

  it("a removed or demoted examiner keeps no access to the institution's scans and photos", () => {
    const nothing = { id: { in: [] } };
    // removed from o1 and now active in o2 as an examiner: only o2, never the old o1 scans they examined
    const movedToOtherOrg: Scope = { userId: "u1", organizationId: "o2", orgRole: "examiner", isPlatformAdmin: false };
    expect(scansReadable(movedToOtherOrg)).toEqual({ organizationId: "o2" });
    expect(JSON.stringify(scansReadable(movedToOtherOrg))).not.toContain("examinerId");
    expect(photosReadable(movedToOtherOrg)).toEqual({ organizationId: "o2" });
    // removed with no organization left (getAuthContext drops a non-member's active org)
    const removed = scopeOf({ user: { id: "u1" }, organizationId: null, orgRole: null, isPlatformAdmin: false });
    expect(scansReadable(removed)).toEqual(nothing);
    expect(photosReadable(removed)).toEqual(nothing);
    // demoted to trainee in the same organization
    const demoted: Scope = { ...base, orgRole: "trainee" };
    expect(scansReadable(demoted)).toEqual(nothing);
    expect(photosReadable(demoted)).toEqual(nothing);
  });

  it("requireOrgScope throws without an active organization", () => {
    expect(requireOrgScope(base)).toEqual({ organizationId: "o1" });
    expect(() => requireOrgScope(personal)).toThrow();
  });

  it("strongestOrgRole reads Better Auth multi-role strings", () => {
    expect(strongestOrgRole("trainee,examiner")).toBe("examiner");
    expect(strongestOrgRole("member")).toBeNull();
    expect(strongestOrgRole(null)).toBeNull();
  });
});

describe("email helpers", () => {
  it("parses the From header", () => {
    expect(parseFrom("وقاية Waqaya <waqaya@tirazkit.com>")).toEqual({ name: "وقاية Waqaya", address: "waqaya@tirazkit.com" });
    expect(parseFrom("waqaya@tirazkit.com")).toEqual({ address: "waqaya@tirazkit.com" });
  });
  it("masks addresses for development logs", () => {
    expect(maskAddress("user@example.com")).toBe("u***@e***.com");
  });
  it("renders bilingual OTP emails with html + text and no remote images", () => {
    const ar = renderVerificationOtpEmail({ locale: "ar", code: "123456", minutes: 10 });
    expect(ar.subject).toContain("123456");
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.text).toContain("123456");
    expect(ar.html).not.toMatch(/<img/i);
    const en = renderVerificationOtpEmail({ locale: "en", code: "654321", minutes: 10 });
    expect(en.html).toContain('dir="ltr"');
    expect(en.text).toContain("10 minutes");
  });
  it("escapes user-provided names in invitations", () => {
    const r = renderInvitationEmail({
      locale: "en",
      inviterName: "<script>x</script>",
      organizationName: "Hospital & Co",
      role: "examiner",
      url: "https://waqaya.example/en/invite/abc",
      days: 7,
    });
    expect(r.html).not.toContain("<script>x</script>");
    expect(r.html).toContain("Hospital &amp; Co");
    expect(r.text).toContain("Examiner");
    expect(escapeHtml(`"'<>&`)).toBe("&quot;&#39;&lt;&gt;&amp;");
  });
});

describe("misc", () => {
  it("localeFromHeaders trusts only same-host referers", () => {
    const h = (referer: string, host = "waqaya.example") => new Headers({ referer, host });
    expect(localeFromHeaders(h("https://waqaya.example/en/sign-in"))).toBe("en");
    expect(localeFromHeaders(h("https://waqaya.example/ar"))).toBe("ar");
    expect(localeFromHeaders(h("https://evil.example/en/x"))).toBeNull();
    expect(localeFromHeaders(h("https://waqaya.example/fr/x"))).toBeNull();
    expect(localeFromHeaders(new Headers())).toBeNull();
  });
  it("fitLongEdge keeps the aspect ratio and never upscales", () => {
    expect(fitLongEdge(4032, 3024)).toEqual({ width: 1568, height: 1176 });
    expect(fitLongEdge(3024, 4032)).toEqual({ width: 1176, height: 1568 });
    expect(fitLongEdge(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
