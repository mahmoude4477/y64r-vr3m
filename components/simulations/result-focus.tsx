"use client";

import { useEffect } from "react";

/**
 * Focus after the last answer (WCAG 2.4.3): the player moves focus to each new stage heading, and when the attempt
 * completes it marks the attempt here before opening its result page; the result page then moves focus to its h1, so
 * keyboard and screen-reader users continue from the result instead of the top of the page. Only that arrival moves
 * focus: a later visit, a reload or a link from elsewhere leaves the normal page-load focus alone.
 */

const KEY = "waqaya.sim.focusResult";

export function markResultFocus(attemptId: string) {
  try {
    window.sessionStorage.setItem(KEY, attemptId);
  } catch {
    // Storage can be blocked (private mode, policies): focus then simply stays at the page start.
  }
}

export function ResultFocus({ attemptId, targetId }: { attemptId: string; targetId: string }) {
  useEffect(() => {
    let wanted = false;
    try {
      wanted = window.sessionStorage.getItem(KEY) === attemptId;
      if (wanted) window.sessionStorage.removeItem(KEY);
    } catch {
      wanted = false;
    }
    if (wanted) document.getElementById(targetId)?.focus();
  }, [attemptId, targetId]);
  return null;
}
