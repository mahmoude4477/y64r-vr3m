import { describe, expect, it } from "vitest";
import { calendarDaysAgo } from "./last-active";

const RIYADH = "Asia/Riyadh"; // UTC+3, no daylight saving time

describe("calendarDaysAgo", () => {
  const now = new Date("2026-10-29T09:00:00Z"); // 12:00 in Riyadh

  it("counts calendar days in the given time zone, not 24-hour blocks", () => {
    expect(calendarDaysAgo(new Date("2026-10-29T08:59:00Z"), now, RIYADH)).toBe(0);
    // 21:30 UTC on the 28th is 00:30 on the 29th in Riyadh: still today there.
    expect(calendarDaysAgo(new Date("2026-10-28T21:30:00Z"), now, RIYADH)).toBe(0);
    // 20:59 UTC on the 28th is 23:59 on the 28th in Riyadh: yesterday, only ~12 hours ago.
    expect(calendarDaysAgo(new Date("2026-10-28T20:59:00Z"), now, RIYADH)).toBe(1);
    expect(calendarDaysAgo(new Date("2026-10-22T10:00:00Z"), now, RIYADH)).toBe(7);
  });

  it("gives the same moment different days in different time zones", () => {
    const lateEvening = new Date("2026-10-28T22:00:00Z");
    expect(calendarDaysAgo(lateEvening, now, RIYADH)).toBe(0);
    expect(calendarDaysAgo(lateEvening, now, "UTC")).toBe(1);
  });

  it("crosses month and year ends", () => {
    expect(calendarDaysAgo(new Date("2026-12-31T12:00:00Z"), new Date("2027-01-01T12:00:00Z"), RIYADH)).toBe(1);
    expect(calendarDaysAgo(new Date("2026-02-28T12:00:00Z"), new Date("2026-03-01T12:00:00Z"), RIYADH)).toBe(1);
  });

  it("never goes below zero (a date after now)", () => {
    expect(calendarDaysAgo(new Date("2026-10-30T12:00:00Z"), now, RIYADH)).toBe(0);
  });
});
