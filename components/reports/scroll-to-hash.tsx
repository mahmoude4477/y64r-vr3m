"use client";

import { useEffect } from "react";

/**
 * Brings a report section into view when the URL's hash names it (/reports#report-trainees), once the section has
 * streamed in: on a client navigation the router looks for the target before a Suspense'd section exists, and the
 * page stays at the top. Focus moves to the section's heading too, as a native in-page link would move the
 * keyboard's starting point there.
 */
export function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: "start" });
    const heading = document.getElementById(`${id}-title`);
    if (heading) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }, [id]);
  return null;
}
