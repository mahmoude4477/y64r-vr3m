import { ArrowLeftIcon, ArrowRightIcon, BanIcon, Building2Icon, InfoIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { OrgRoleBadge, PlatformRoleBadge, ToneBadge, UserStatusBadges } from "@/components/admin/badges";
import { InitialsAvatar } from "@/components/admin/initials-avatar";
import { UserActions } from "@/components/admin/user-actions";
import { UserSessions } from "@/components/admin/user-sessions";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { adminMetadata, joinTitle } from "@/lib/admin/metadata";
import { parseId } from "@/lib/admin/params";
import { getUserDetail } from "@/lib/admin/queries";
import { isPlatformAdminRole, isProtocolEditorRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/session";

// /admin/users/<id>: one account (profile, institutions, activity counts, sessions) and the admin actions on it.
// The title names the kind of page, not the person: a name never goes into the document title (browser history,
// shared screens). A missing account is titled "Page not found", like the page.

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/users/[id]">): Promise<Metadata> {
  const [nav, t] = await Promise.all([getTranslations("nav"), getTranslations("admin.user")]);
  return adminMetadata(joinTitle(t("pageTitle"), nav("sub.adminUsers")), async () => {
    const id = parseId((await params).id);
    const user = id ? await prisma.user.findUnique({ where: { id }, select: { id: true } }) : null;
    return user ? { name: null } : null;
  });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-3 sm:gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm sm:col-span-2">{children}</dd>
    </div>
  );
}

async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatformAdmin();
  const { id } = await params;
  const detail = await getUserDetail(id);
  if (!detail) notFound();
  const [t, common, format, locale] = await Promise.all([getTranslations("admin.user"), getTranslations("common"), getFormatter(), getLocale()]);
  const { profile, memberships, sessions, activity, blockers } = detail;
  const self = profile.id === ctx.user.id;
  const isAdmin = isPlatformAdminRole(profile.role);
  const isProtocolEditor = !isAdmin && isProtocolEditorRole(profile.role);
  const orgName = (o: { name: string; nameEn: string | null }) => (locale === "en" && o.nameEn) || o.name;
  const soleOwnerOf = blockers.flatMap((b) => (b.kind === "only_owner" ? b.organizations.map(orgName) : []));
  const n = (v: number) => format.number(v, "integer");

  return (
    <>
      <BreadcrumbLabel label={profile.name} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <InitialsAvatar name={profile.name} className="size-14 text-lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            <bdi>{profile.name}</bdi>
          </h1>
          <span className="truncate text-sm text-muted-foreground">
            <bdi dir="ltr">{profile.email}</bdi>
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            <PlatformRoleBadge admin={isAdmin} protocolEditor={isProtocolEditor} />
            <UserStatusBadges bannedNow={profile.bannedNow} emailVerified={profile.emailVerified} mustChangePassword={profile.mustChangePassword} />
          </div>
        </div>
      </div>

      {self && (
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>{t("self")}</AlertDescription>
        </Alert>
      )}
      {profile.banned && (
        <Alert variant={profile.bannedNow ? "destructive" : "default"}>
          <BanIcon aria-hidden />
          <AlertTitle>{t("ban.title")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-1">
            {profile.banReason && (
              <p>
                {t("ban.reason")}: <bdi>{profile.banReason}</bdi>
              </p>
            )}
            <p>
              {!profile.banExpires
                ? t("ban.permanent")
                : profile.bannedNow
                  ? t("ban.until", { date: format.dateTime(profile.banExpires, "dateTime") })
                  : t("ban.expired", { date: format.dateTime(profile.banExpires, "dateTime") })}
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:order-last">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("actions.title")}</h2>
              </CardTitle>
              <CardDescription>{t("actions.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <UserActions
                target={{
                  id: profile.id,
                  name: profile.name,
                  email: profile.email,
                  isAdmin,
                  isProtocolEditor,
                  bannedNow: profile.bannedNow,
                  self,
                  soleOwnerOf,
                  lastPlatformAdmin: blockers.some((b) => b.kind === "last_platform_admin"),
                  managedMemberships: memberships
                    .filter((m) => m.role === "owner" || m.role === "admin")
                    .map((m) => ({ memberId: m.id, organizationId: m.organization.id, name: orgName(m.organization), role: m.role as "owner" | "admin" })),
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("activity.title")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3">
                {(
                  [
                    ["attempts", activity.attempts, activity.attempts30],
                    ["scans", activity.scans, activity.scans30],
                  ] as const
                ).map(([key, total, recent]) => (
                  <div key={key} className="flex items-baseline justify-between gap-3">
                    <dt className="flex flex-col">
                      <span className="text-sm">{t(`activity.${key}`)}</span>
                      <span className="text-xs text-muted-foreground">{t("activity.last30", { n: n(recent) })}</span>
                    </dt>
                    <dd className="text-xl font-semibold tabular-nums">{n(total)}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="flex flex-col">
                    <span className="text-sm">{t("activity.aiCalls")}</span>
                    <span className="text-xs text-muted-foreground">{t("activity.aiHint")}</span>
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums">{n(activity.aiCalls30)}</dd>
                </div>
              </dl>
            </CardContent>
            <CardFooter className="py-2">
              <Link
                href={`/admin/audit?actor=${encodeURIComponent(profile.id)}`}
                className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {t("activity.auditLink")}
                <ArrowRightIcon aria-hidden className="size-4 rtl:rotate-180" />
              </Link>
            </CardFooter>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("profile.title")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Row label={t("profile.name")}>
                  <bdi>{profile.name}</bdi>
                </Row>
                <Row label={t("profile.email")}>
                  <bdi dir="ltr" className="break-all">
                    {profile.email}
                  </bdi>
                </Row>
                <Row label={t("profile.emailVerified")}>{profile.emailVerified ? t("profile.yes") : t("profile.no")}</Row>
                <Row label={t("profile.role")}>{isAdmin ? common("roles.platformAdmin") : isProtocolEditor ? common("roles.protocolEditor") : common("roles.user")}</Row>
                <Row label={t("profile.locale")}>
                  {profile.locale === "en" ? common("localeSwitcher.en") : profile.locale === "ar" ? common("localeSwitcher.ar") : t("profile.notSet")}
                </Row>
                <Row label={t("profile.profession")}>{profile.profession ? <bdi>{profile.profession}</bdi> : t("profile.notSet")}</Row>
                <Row label={t("profile.password")}>{profile.hasPassword ? t("profile.passwordSet") : t("profile.passwordNone")}</Row>
                <Row label={t("profile.joined")}>{format.dateTime(profile.createdAt, "dateTime")}</Row>
                <Row label={t("profile.updated")}>{format.dateTime(profile.updatedAt, "dateTime")}</Row>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("memberships.title")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {memberships.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("memberships.empty")}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {memberships.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Building2Icon aria-hidden className="size-4" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <Link href={`/admin/organizations/${m.organization.id}`} className="truncate text-sm font-medium hover:underline">
                            <bdi>{orgName(m.organization)}</bdi>
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {t("memberships.joined", { date: format.dateTime(m.joinedAt, "date") })}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <OrgRoleBadge role={m.role} />
                        {m.organization.suspended && <ToneBadge kind="danger">{t("memberships.suspended")}</ToneBadge>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("sessions.title")}</h2>
              </CardTitle>
              <CardDescription>{t("sessions.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <UserSessions
                userId={profile.id}
                readOnly={self}
                sessions={sessions.map((s) => ({
                  id: s.id,
                  createdAt: s.createdAt.toISOString(),
                  updatedAt: s.updatedAt.toISOString(),
                  ipAddress: s.ipAddress,
                  userAgent: s.userAgent,
                  impersonated: s.impersonated,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function UserDetailSkeleton() {
  return (
    <>
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:order-last" />
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </>
  );
}

export default async function AdminUserPage({ params }: PageProps<"/[locale]/admin/users/[id]">) {
  const t = await getTranslations("admin.user");
  return (
    <>
      <Link href="/admin/users" className="inline-flex min-h-8 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
        {t("back")}
      </Link>
      <Suspense fallback={<UserDetailSkeleton />}>
        <UserDetail params={params} />
      </Suspense>
    </>
  );
}
