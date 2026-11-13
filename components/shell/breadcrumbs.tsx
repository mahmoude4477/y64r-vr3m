"use client";

import { useTranslations } from "next-intl";
import { Fragment, useEffect, useSyncExternalStore } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Link, usePathname } from "@/i18n/navigation";
import { resolveTrail } from "./nav";

// Tiny external store: a page can replace the last crumb label (e.g. the protocol title) with
// <BreadcrumbLabel label={title} />. Keyed by pathname so a stale label never leaks to another page.
const labels = new Map<string, string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Render anywhere in a page to set the last breadcrumb text for the current path. */
export function BreadcrumbLabel({ label }: { label: string }) {
  const pathname = usePathname();
  useEffect(() => {
    labels.set(pathname, label);
    emit();
    return () => {
      if (labels.get(pathname) === label) labels.delete(pathname);
      emit();
    };
  }, [pathname, label]);
  return null;
}

export function AppBreadcrumbs() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const override = useSyncExternalStore(
    subscribe,
    () => labels.get(pathname) ?? null,
    () => null,
  );
  const { section, parent, sub } = resolveTrail(pathname);
  if (!section) return null;

  const crumbs: Array<{ label: string; href?: string }> = [{ label: t(section.key), href: section.href }];
  if (parent) crumbs.push({ label: t(`sub.${parent.label}`), href: parent.href });
  if (sub) crumbs.push({ label: t(`sub.${sub}`) });
  const last = crumbs.length - 1;
  if (override) crumbs[last] = { label: override };

  return (
    <Breadcrumb aria-label={t("breadcrumb.label")} className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, i) => (
          <Fragment key={`${i}-${crumb.label}`}>
            {i > 0 && <BreadcrumbSeparator className="rtl:rotate-180" />}
            <BreadcrumbItem className={i < last ? "hidden sm:inline-flex" : "min-w-0"}>
              {i < last && crumb.href ? (
                <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
