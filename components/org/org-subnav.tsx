import { BookOpenCheckIcon, Building2Icon, NetworkIcon, UsersRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type OrgSection = "overview" | "members" | "departments";

/**
 * Tabs-like navigation between the institution pages. Server-rendered links (no client JS). The protocols tab is for
 * managers only: /org/protocols (protocols team) is a managers' page.
 */
export function OrgSubnav({ current, canManage }: { current: OrgSection; canManage: boolean }) {
  const t = useTranslations("org");
  const nav = useTranslations("nav.sub");
  const items = [
    { key: "overview", href: "/org", label: t("nav.overview"), icon: Building2Icon },
    { key: "members", href: "/org/members", label: nav("orgMembers"), icon: UsersRoundIcon },
    { key: "departments", href: "/org/departments", label: nav("orgDepartments"), icon: NetworkIcon },
    ...(canManage ? [{ key: "protocols", href: "/org/protocols", label: nav("orgProtocols"), icon: BookOpenCheckIcon }] : []),
  ] as const;
  return (
    <nav aria-label={t("nav.label")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b">
        {items.map(({ key, href, label, icon: Icon }) => {
          const active = key === current;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Skeleton of OrgSubnav for Suspense fallbacks (same height, no layout shift). */
export function OrgSubnavSkeleton() {
  return (
    <div aria-hidden className="flex h-10 items-center gap-4 border-b">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-4 w-20" />
      ))}
    </div>
  );
}
