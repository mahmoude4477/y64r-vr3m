import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { Suspense } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { ImpersonationBanner } from "@/components/shell/impersonation-banner";
import { getShellData } from "@/components/shell/shell-data";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { clientMessages } from "@/i18n/client-messages";
import { PRIVATE_ROBOTS } from "@/lib/seo";

// Signed-in pages are never indexed (robots.txt also disallows them).
export const metadata: Metadata = { robots: PRIVATE_ROBOTS };

// The signed-in app shell. Foundation-owned: features render inside {children} only.
// No top-level request reads here (cacheComponents): the session is read inside <Suspense> by
// getShellData() for the SIDEBAR only. With partial prerendering the sidebar and the page stream
// independently, so this does NOT gate the page: static page content is in the prerendered shell for
// everyone, and every page data component must call requireUser() / requireOrgRole() /
// requirePlatformAdmin() itself (that is also where the mustChangePassword gate applies).

async function SidebarWithSession() {
  return <AppSidebar data={await getShellData()} />;
}

export default async function AppLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    // The app's client components read every feature namespace (i18n/client-messages.ts); public pages do not.
    <NextIntlClientProvider messages={await clientMessages("app")}>
      <SidebarProvider>
        <Suspense fallback={<AppSidebar data={null} />}>
          <SidebarWithSession />
        </Suspense>
        {/* min-w-0: a flex item, so wide content (tables, long breadcrumbs) would otherwise widen the whole page. */}
        <SidebarInset className="min-w-0">
          <AppHeader />
          {/* "Acting as <name> / Return to my account" on every app page while a platform admin impersonates. */}
          <Suspense fallback={null}>
            <ImpersonationBanner />
          </Suspense>
          <div id="main" tabIndex={-1} className="flex flex-1 flex-col gap-6 p-4 outline-none md:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NextIntlClientProvider>
  );
}
