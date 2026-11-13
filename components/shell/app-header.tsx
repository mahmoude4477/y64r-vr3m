import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AppBreadcrumbs } from "./breadcrumbs";
import { OrgSwitcher } from "./org-switcher";
import { getShellData } from "./shell-data";
import { UserMenu } from "./user-menu";

async function HeaderAccount() {
  const data = await getShellData();
  return (
    <>
      <OrgSwitcher data={data} />
      <UserMenu data={data} />
    </>
  );
}

export async function AppHeader() {
  const t = await getTranslations("nav");
  return (
    <header
      data-print="hide"
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4"
    >
      <SidebarTrigger className="-ms-1" aria-label={t("toggleSidebar")} />
      <Separator orientation="vertical" className="me-1 h-4 data-vertical:self-center" />
      <Suspense fallback={<div className="min-w-0 flex-1" />}>
        <AppBreadcrumbs />
      </Suspense>
      <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <LocaleSwitcher persist compact />
        <ThemeToggle />
        <Suspense
          fallback={
            <>
              <OrgSwitcher data={null} />
              <UserMenu data={null} />
            </>
          }
        >
          <HeaderAccount />
        </Suspense>
      </div>
    </header>
  );
}
