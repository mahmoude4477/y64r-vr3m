import { describe, expect, it } from "vitest";
import { formatEmailDate, renderAccountDeletedEmail, renderAccountDeletionCodeEmail } from "./templates";

const when = new Date("2026-10-28T12:15:00Z"); // 15:15 in Riyadh

describe("account e-mails", () => {
  it("deletion code: both languages, html + plain text, the code, no remote content", () => {
    for (const locale of ["ar", "en"] as const) {
      const m = renderAccountDeletionCodeEmail({ locale, code: "042917", minutes: 10 });
      expect(m.subject).toContain("042917");
      expect(m.html).toContain(`lang="${locale}"`);
      expect(m.html).toContain(locale === "ar" ? 'dir="rtl"' : 'dir="ltr"');
      expect(m.html).toContain("042917");
      expect(m.text).toContain("042917");
      expect(m.text).toContain("10");
      expect(m.html).not.toMatch(/<img|https?:\/\/(?!www\.w3\.org)/);
    }
    expect(renderAccountDeletionCodeEmail({ locale: "ar", code: "1", minutes: 10 }).subject).toContain("حذف حسابك");
  });

  it("the account-deleted notice carries the date in Riyadh time with Latin digits, in both languages", () => {
    const ar = renderAccountDeletedEmail({ locale: "ar", date: when });
    const en = renderAccountDeletedEmail({ locale: "en", date: when });
    expect(ar.text).toContain(formatEmailDate("ar", when));
    expect(en.text).toContain(formatEmailDate("en", when));
    expect(formatEmailDate("ar", when)).toMatch(/2026/);
    expect(formatEmailDate("ar", when)).not.toMatch(/[٠-٩]/);
    expect(formatEmailDate("en", when)).toContain("3:15");
    expect(ar.html).toContain(`dir="rtl"`);
    expect(en.html).toContain(`dir="ltr"`);
  });
});
