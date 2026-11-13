"use client";

import { useEffect } from "react";

// After "Finalise" the server re-renders the page as the report and the review (with the focused button) disappears.
// The review marks the scan here; the report then moves focus to its heading (WCAG 2.4.3), once, only after that action.
let justFinalized: string | null = null;

/** Set just before the finalise action runs (its response may render the report before the await returns); null undoes it. */
export function markJustFinalized(scanId: string | null): void {
  justFinalized = scanId;
}

export function ReportFocus({ scanId, targetId }: { scanId: string; targetId: string }) {
  useEffect(() => {
    if (justFinalized !== scanId) return;
    justFinalized = null;
    const target = document.getElementById(targetId);
    if (!target) return;
    target.focus({ preventScroll: true });
    // The title is the report's first line: scroll the page to the top, so the sticky app header cannot cover the
    // focused title (WCAG 2.4.11; scrollIntoView put it right under the header).
    window.scrollTo({ top: 0 });
  }, [scanId, targetId]);
  return null;
}
