import { Suspense } from "react";
import { AdminNav, AdminNavPlaceholder } from "@/components/admin/admin-nav";
import { ImpersonationNotice } from "@/components/admin/impersonation-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthContext } from "@/lib/session";

// The platform admin area: a sub-navigation above every /admin page (including /admin/protocols and /admin/scenarios,
// built by the protocols and simulations teams). The navigation is shown to platform admins only; it is not an access
// check: every page's data component calls requirePlatformAdmin() itself (CONVENTIONS 4).
//
// While a platform admin acts as a user (Better Auth impersonation: session.impersonatedBy), the session is the
// USER's, so every /admin page would answer "not found". Opening the admin panel is the natural way back, so in that
// state every /admin/** address shows the "acting as" notice with "Return to my account" instead of the page. The
// foundation shell has no "acting as" banner on the other pages yet (requested).

async function AdminArea({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (ctx?.session.impersonatedBy && !ctx.isPlatformAdmin) return <ImpersonationNotice name={ctx.user.name} userId={ctx.user.id} />;
  return (
    <>
      {ctx?.isPlatformAdmin ? <AdminNav /> : ctx?.isContentEditor ? <AdminNav contentOnly /> : null}
      {children}
    </>
  );
}

/** Until the session is read: the navigation row (invisible, keeps its height) and a generic page outline. */
function AdminAreaSkeleton() {
  return (
    <>
      <AdminNavPlaceholder />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  return (
    <Suspense fallback={<AdminAreaSkeleton />}>
      <AdminArea>{children}</AdminArea>
    </Suspense>
  );
}
