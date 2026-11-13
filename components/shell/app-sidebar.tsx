"use client";

import { useLocale, useTranslations } from "next-intl";
import { Suspense } from "react";
import { LogoMark } from "@/components/brand/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Link, usePathname } from "@/i18n/navigation";
import { localeDir } from "@/i18n/routing";
import { NAV_ITEMS, type NavItem, type ShellAccess } from "./nav";
import type { ShellData } from "./types";

const GROUPS = ["workspace", "manage", "platform"] as const;

function NavMenu({ items, activeKey }: { items: readonly NavItem[]; activeKey: string | null }) {
  const t = useTranslations("nav");
  const dir = localeDir[useLocale()];
  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.key === activeKey;
        return (
          <SidebarMenuItem key={item.key}>
            <SidebarMenuButton
              isActive={active}
              aria-current={active ? "page" : undefined}
              tooltip={{ children: t(item.key), side: dir === "rtl" ? "left" : "right" }}
              render={<Link href={item.href} />}
            >
              <Icon aria-hidden />
              <span>{t(item.key)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/** usePathname is request data on dynamic routes: only this part waits for it (inside Suspense). */
function NavMenuWithActive({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const active = items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return <NavMenu items={items} activeKey={active?.key ?? null} />;
}

/**
 * App sidebar. `data` is null while the session streams in (Suspense fallback): gated items stay
 * hidden until the server says the user may see them. Sidebar `side` is physical, so it flips by dir.
 */
export function AppSidebar({ data }: { data: ShellData | null }) {
  const t = useTranslations("nav");
  const dir = localeDir[useLocale()];
  const access: ShellAccess = {
    orgStaff: !!data?.orgRole && ["owner", "admin", "examiner"].includes(data.orgRole),
    platformAdmin: !!data?.isPlatformAdmin,
    contentEditor: !!data?.isContentEditor,
  };
  const visible = NAV_ITEMS.filter((item) => !item.show || item.show(access));

  return (
    // role="navigation": the desktop sidebar is a landmark (axe "region"), named by aria-label. On phones the
    // sidebar is a Sheet (a dialog named by mobileTitle / mobileDescription) and role / aria-label are not used.
    <Sidebar
      side={dir === "rtl" ? "right" : "left"}
      dir={dir}
      collapsible="icon"
      role="navigation"
      aria-label={t("mainNavigation")}
      mobileTitle={t("mainNavigation")}
      mobileDescription={t("mobileNavigationDescription")}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/dashboard" />}
              tooltip={{ children: t("app"), side: dir === "rtl" ? "left" : "right" }}
            >
              <LogoMark className="size-8" />
              <span className="text-lg font-bold text-primary">{t("app")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {GROUPS.map((group) => {
          const items = visible.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>{t(`groups.${group}`)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <Suspense fallback={<NavMenu items={items} activeKey={null} />}>
                  <NavMenuWithActive items={items} />
                </Suspense>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      {/* shadcn's rail has an English aria-label/title; ours come from nav.toggleSidebar (both languages). */}
      <SidebarRail aria-label={t("toggleSidebar")} title={t("toggleSidebar")} />
    </Sidebar>
  );
}
