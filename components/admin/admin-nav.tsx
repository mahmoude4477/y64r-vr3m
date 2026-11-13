"use client";

import {
  BookOpenCheckIcon,
  Building2Icon,
  ClipboardListIcon,
  GaugeIcon,
  GraduationCapIcon,
  type LucideIcon,
  ScrollTextIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { activeAdminSection, type AdminSectionHref } from "@/lib/admin/sections";
import { cn } from "@/lib/utils";

type AdminSection = {
  href: AdminSectionHref;
  label: "adminOverview" | "adminUsers" | "adminOrganizations" | "adminProtocols" | "adminScenarios" | "adminAssessments" | "adminAi" | "adminAudit";
  icon: LucideIcon;
};

const SECTIONS: readonly AdminSection[] = [
  { href: "/admin", label: "adminOverview", icon: GaugeIcon },
  { href: "/admin/users", label: "adminUsers", icon: UsersIcon },
  { href: "/admin/organizations", label: "adminOrganizations", icon: Building2Icon },
  { href: "/admin/protocols", label: "adminProtocols", icon: BookOpenCheckIcon },
  { href: "/admin/scenarios", label: "adminScenarios", icon: GraduationCapIcon },
  { href: "/admin/assessments", label: "adminAssessments", icon: ClipboardListIcon },
  { href: "/admin/ai", label: "adminAi", icon: SparklesIcon },
  { href: "/admin/audit", label: "adminAudit", icon: ScrollTextIcon },
];

/** Width of the fade at an edge of the row that has more sections beyond it. */
const FADE_PX = 40;

/**
 * Scrolls `row` sideways (never the page) so that `item` sits at least `margin` px inside both edges, or the row
 * reaches its end: the first and last sections scroll the row all the way, so no fade is left over them. Physical
 * coordinates, so it works the same in a right-to-left row; the browser clamps to the scroll range.
 */
function revealInRow(row: HTMLElement, item: HTMLElement, margin: number) {
  if (row.scrollWidth <= row.clientWidth) return; // wide screens: the row wraps and does not scroll
  const box = row.getBoundingClientRect();
  const rect = item.getBoundingClientRect();
  let delta = 0;
  if (rect.left < box.left + margin) delta = rect.left - (box.left + margin);
  else if (rect.right > box.right - margin) delta = rect.right - (box.right - margin);
  if (delta !== 0) row.scrollBy({ left: delta, behavior: "instant" });
}

const itemClass =
  "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0";

/** The sections a protocol editor may open (requireContentEditor); every other section is platform admins only. */
const CONTENT_SECTIONS: ReadonlySet<AdminSectionHref> = new Set(["/admin/protocols", "/admin/scenarios"]);

/**
 * Sub-navigation of the platform admin area: a row that scrolls sideways on phones and wraps on larger screens.
 * `contentOnly`: a protocol editor's view, with the protocol and scenario sections only.
 */
export function AdminNav({ contentOnly = false }: { contentOnly?: boolean }) {
  const sections = contentOnly ? SECTIONS.filter((s) => CONTENT_SECTIONS.has(s.href)) : SECTIONS;
  const t = useTranslations("nav.sub");
  const label = useTranslations("admin.nav");
  const pathname = usePathname();
  const active = activeAdminSection(pathname);
  const activeLink = useRef<HTMLAnchorElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // Which ends of the row have more sections beyond the edge (phones: the row scrolls with a hidden scrollbar), so a
  // fade on that edge shows there is more to swipe to.
  const [more, setMore] = useState({ start: false, end: false, rtl: false });
  // On a phone the row scrolls: bring the current section into view, clear of the edge fades. scrollIntoView
  // ("nearest") stopped at the list's padding, so the first or last section stayed under its fade (review round 2).
  useEffect(() => {
    const el = list.current;
    const link = activeLink.current;
    if (el && link) revealInRow(el, link, FADE_PX);
  }, [active]);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const update = () => {
      const rtl = getComputedStyle(el).direction === "rtl";
      const max = el.scrollWidth - el.clientWidth;
      const pos = Math.abs(el.scrollLeft); // negative from the start in a right-to-left row
      const next = { start: pos > 1, end: max - pos > 1, rtl };
      setMore((prev) => (prev.start === next.start && prev.end === next.end && prev.rtl === next.rtl ? prev : next));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);
  const maskImage =
    more.start || more.end
      ? `linear-gradient(${more.rtl ? "to left" : "to right"}, ${more.start ? `transparent, black ${FADE_PX}px` : "black, black"}, ${
          more.end ? `black calc(100% - ${FADE_PX}px), transparent` : "black, black"
        })`
      : undefined;
  return (
    // contain: inline-size keeps the row's full width out of the page's min-content width: without it the app shell
    // (SidebarInset has no min-w-0) grows to fit the row and the whole page scrolls sideways.
    <nav aria-label={label("label")} className="-mx-4 border-b [contain:inline-size] md:-mx-6 print:hidden">
      <ul
        ref={list}
        style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
        className="flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:flex-wrap md:overflow-visible md:px-6"
      >
        {sections.map(({ href, label: key, icon: Icon }) => {
          const current = href === active;
          return (
            <li key={href} className="shrink-0">
              <Link
                ref={current ? activeLink : undefined}
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(itemClass, current && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
              >
                <Icon aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The Suspense fallback: the same row, invisible and hidden from assistive technology, so the page does not move
 * when the real navigation arrives (the row wraps on wide screens, so its height depends on the labels).
 */
export function AdminNavPlaceholder() {
  const t = useTranslations("nav.sub");
  return (
    <div aria-hidden className="invisible -mx-4 border-b [contain:inline-size] md:-mx-6 print:hidden">
      <ul className="flex gap-1 overflow-hidden px-4 pb-2 md:flex-wrap md:px-6">
        {SECTIONS.map(({ href, label: key, icon: Icon }) => (
          <li key={href} className={itemClass}>
            <Icon />
            {t(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}
