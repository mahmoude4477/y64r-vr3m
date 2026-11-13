"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Edges = { scrolls: boolean; atStart: boolean; atEnd: boolean };

/**
 * Holds a table that may be wider than its card (a phone, or a tablet next to the sidebar).
 * - The frame is the scroll container (the table's own container is told not to scroll), and `contain: inline-size`
 *   keeps the table's width out of the min-content width of everything around it: without it the app shell's flex
 *   row grows past the screen and the whole page scrolls sideways instead of the table.
 * - Only while it really scrolls, the frame is a labelled, keyboard-focusable group, so keyboard users can scroll it
 *   with the arrow keys (WCAG 2.1.1; axe scrollable-region-focusable) without an extra tab stop when it fits.
 * - While more columns hide past an edge, that edge fades out (end edge first: in Arabic it is the left one), so
 *   sighted users see that the table goes on.
 * - On paper nothing scrolls: give the table `print:min-w-0` so it shrinks to the page.
 */
export function TableFrame({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<Edges>({ scrolls: false, atStart: true, atEnd: true });

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const measure = () => {
      const max = frame.scrollWidth - frame.clientWidth;
      // In RTL scrollLeft runs from 0 to -max: the distance from the start edge is its absolute value.
      const fromStart = Math.abs(frame.scrollLeft);
      const next = { scrolls: max > 1, atStart: fromStart <= 1, atEnd: fromStart >= max - 1 };
      setEdges((prev) => (prev.scrolls === next.scrolls && prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next));
    };
    measure();
    frame.addEventListener("scroll", measure, { passive: true });
    // ResizeObserver reports once when observing starts, then on every size change of the frame or the table.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(frame);
    const table = frame.querySelector("table");
    if (table) observer?.observe(table);
    return () => {
      frame.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);

  const fade = "pointer-events-none absolute inset-y-0 w-8 from-card to-transparent print:hidden";
  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        ref={ref}
        role={edges.scrolls ? "group" : undefined}
        aria-label={edges.scrolls ? label : undefined}
        tabIndex={edges.scrolls ? 0 : undefined}
        className={cn(
          "min-w-0 overflow-x-auto rounded-md outline-none [contain:inline-size] focus-visible:ring-3 focus-visible:ring-ring/50",
          "[&>[data-slot=table-container]]:overflow-visible print:overflow-visible print:[contain:none]",
        )}
      >
        {children}
      </div>
      {edges.scrolls && !edges.atStart && <div aria-hidden className={cn(fade, "start-0 bg-linear-to-r rtl:bg-linear-to-l")} />}
      {edges.scrolls && !edges.atEnd && <div aria-hidden className={cn(fade, "end-0 bg-linear-to-l rtl:bg-linear-to-r")} />}
    </div>
  );
}
