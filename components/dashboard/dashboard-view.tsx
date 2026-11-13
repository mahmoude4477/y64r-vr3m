import type { Locale } from "next-intl";
import { getLocale } from "next-intl/server";
import { isAppLocale, routing } from "@/i18n/routing";
import { scopeOf } from "@/lib/authz";
import { dashboardPlan } from "@/lib/dashboard/plan";
import { institutionScope } from "@/lib/reports/scope";
import { requireUser } from "@/lib/session";
import { InstitutionDashboard } from "./institution-dashboard";
import { AdminCard } from "./parts";
import { PersonalDashboard } from "./personal-dashboard";

/**
 * The role-aware body of /dashboard (rendered inside <Suspense> by the page): requireUser() first (guests go to
 * sign-in, mustChangePassword users to the password page), then the institution dashboard for staff of the active
 * institution or the personal training dashboard for everyone else, with the /admin card on top for platform admins.
 */
export async function DashboardView() {
  const ctx = await requireUser();
  const scope = scopeOf(ctx);
  const raw = await getLocale();
  const locale: Locale = isAppLocale(raw) ? raw : routing.defaultLocale;
  const plan = dashboardPlan(scope);
  const inst = institutionScope(scope);
  return (
    <div className="flex flex-col gap-6">
      {plan.platformAdmin && <AdminCard />}
      {plan.kind === "institution" && inst ? (
        <InstitutionDashboard inst={inst} locale={locale} name={ctx.user.name} />
      ) : (
        <PersonalDashboard scope={scope} locale={locale} name={ctx.user.name} platformAdmin={plan.platformAdmin} />
      )}
    </div>
  );
}
