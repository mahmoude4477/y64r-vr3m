import { ArrowLeftIcon, ArrowRightIcon, CircleAlertIcon, CirclePauseIcon, NetworkIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { OrgStatusBadges, ToneBadge } from "@/components/admin/badges";
import { OrganizationActions } from "@/components/admin/organization-actions";
import { OrganizationInvitations } from "@/components/admin/organization-invitations";
import { OrganizationMembers } from "@/components/admin/organization-members";
import { OrganizationMembership } from "@/components/admin/organization-membership";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { orgNames } from "@/lib/admin/display";
import { hasRole, ownerInPlace } from "@/lib/admin/membership-rules";
import { adminMetadata } from "@/lib/admin/metadata";
import { getOrganizationDetail } from "@/lib/admin/queries";
import { parseId } from "@/lib/admin/params";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/session";

// /admin/organizations/<id>: one institution with its members and roles, pending invitations, departments (read
// only), the platform admin's own membership, and edit / suspend / delete.

/**
 * The institution's name as the title (an institution name is not personal data), so several open institutions can
 * be told apart; what the page shows for anyone who is not a platform admin (lib/admin/metadata.ts).
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/admin/organizations/[id]">): Promise<Metadata> {
  const [nav, locale] = await Promise.all([getTranslations("nav"), getLocale()]);
  return adminMetadata(nav("sub.adminOrganizations"), async () => {
    const id = parseId((await params).id);
    const org = id ? await prisma.organization.findUnique({ where: { id }, select: { name: true, nameEn: true } }) : null;
    return org ? { name: orgNames(org, locale).primary } : null;
  });
}

async function OrganizationDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatformAdmin();
  const { id } = await params;
  const detail = await getOrganizationDetail(id, ctx.user.id);
  if (!detail) notFound();
  const [t, roles, types, format, locale] = await Promise.all([
    getTranslations("admin.org"),
    getTranslations("common.roles"),
    getTranslations("common.orgType"),
    getFormatter(),
    getLocale(),
  ]);
  const { organization: org, members, invitations, departments, counts, viewer } = detail;
  const names = orgNames(org, locale);
  const n = (v: number) => format.number(v, "integer");
  const viewerMember = viewer ? members.find((m) => m.id === viewer.memberId) : undefined;
  // Another person owns it: the admin's own owner access (from creating or joining it) is no longer needed.
  const ownOwnerInPlace = !!viewerMember && members.some((m) => m.user.id !== viewerMember.user.id && hasRole(m.rawRole, "owner"));
  // Its owner is there or invited: the invite form then starts with the weakest role, not "owner" (least privilege).
  const hasOwner = ownerInPlace({
    viewerUserId: ctx.user.id,
    members: members.map((m) => ({ userId: m.user.id, role: m.rawRole })),
    invitations: invitations.map((i) => ({ role: i.role, usable: !i.expired && i.inviterIsMember })),
  });

  const stats = [
    ["members", counts.members],
    ["invitations", counts.pendingInvitations],
    ["departments", counts.departments],
    ["scans", counts.scans],
    ["attempts", counts.attempts],
  ] as const;

  return (
    <>
      <BreadcrumbLabel label={names.primary} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            <bdi>{names.primary}</bdi>
          </h1>
          {names.secondary && (
            <p className="text-sm text-muted-foreground">
              <bdi>{names.secondary}</bdi>
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {org.type && <ToneBadge kind="neutral">{types(org.type)}</ToneBadge>}
            <OrgStatusBadges suspended={org.suspended} hasOwner={counts.owners > 0} />
            <span className="text-xs text-muted-foreground">{t("created", { date: format.dateTime(org.createdAt, "date") })}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("slug")}:{" "}
            <bdi dir="ltr" className="font-mono break-all">
              {org.slug}
            </bdi>
          </p>
        </div>
        <OrganizationActions
          org={{
            id: org.id,
            name: org.name,
            nameEn: org.nameEn,
            type: org.type,
            suspended: org.suspended,
            displayName: names.primary,
            members: counts.members,
            scans: counts.scans,
          }}
        />
      </div>

      {org.suspended && (
        <Alert variant="destructive">
          <CirclePauseIcon aria-hidden />
          <AlertTitle>{t("suspendedAlert.title")}</AlertTitle>
          <AlertDescription>{t("suspendedAlert.description")}</AlertDescription>
        </Alert>
      )}
      {counts.owners === 0 && (
        <Alert>
          <CircleAlertIcon aria-hidden />
          <AlertTitle>{t("noOwnerAlert.title")}</AlertTitle>
          <AlertDescription>{t("noOwnerAlert.description")}</AlertDescription>
        </Alert>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-1 rounded-xl p-3 ring-1 ring-foreground/10">
            <dt className="text-xs text-muted-foreground">{t(`stats.${key}`)}</dt>
            <dd className="text-xl font-semibold tabular-nums">{n(value)}</dd>
          </div>
        ))}
      </dl>
      <nav aria-label={t("links.label")} className="-mt-1">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {(
            [
              [`/admin/assessments?org=${encodeURIComponent(org.id)}`, t("links.scans")],
              [`/admin/assessments?kind=attempts&org=${encodeURIComponent(org.id)}`, t("links.attempts")],
              [`/admin/audit?org=${encodeURIComponent(org.id)}`, t("links.audit")],
            ] as const
          ).map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-primary hover:underline">
                {label}
                <ArrowRightIcon aria-hidden className="size-4 rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("members.title")}</h2>
              </CardTitle>
              <CardDescription>{t("members.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <OrganizationMembers
                organizationId={org.id}
                viewerId={ctx.user.id}
                members={members.map((m) => ({
                  id: m.id,
                  role: m.role,
                  joinedAt: m.joinedAt.toISOString(),
                  user: m.user,
                  pendingInvitationsSent: m.pendingInvitationsSent,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("invitations.title")}</h2>
              </CardTitle>
              <CardDescription>{t("invitations.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <OrganizationInvitations
                organizationId={org.id}
                canInvite={viewer?.role === "owner" || viewer?.role === "admin"}
                isOwner={viewer?.role === "owner"}
                ownerInPlace={hasOwner}
                invitations={invitations.map((i) => ({
                  id: i.id,
                  email: i.email,
                  role: i.role,
                  createdAt: i.createdAt.toISOString(),
                  expiresAt: i.expiresAt.toISOString(),
                  expired: i.expired,
                  inviterName: i.inviter?.name ?? null,
                  inviterIsMember: i.inviterIsMember,
                }))}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("membership.title")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OrganizationMembership
                organizationId={org.id}
                displayName={names.primary}
                membership={
                  viewer && viewerMember
                    ? {
                        memberId: viewer.memberId,
                        roleLabel: viewer.role ? roles(viewer.role) : "",
                        pendingInvitationsSent: viewerMember.pendingInvitationsSent,
                        ownOwnerInPlace,
                      }
                    : null
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("departments.title")}</h2>
              </CardTitle>
              <CardDescription>{t("departments.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              {departments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("departments.empty")}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {departments.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <NetworkIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                        <bdi className="truncate">{d.name}</bdi>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {t("departments.members", { count: d.memberCount, n: n(d.memberCount) })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function OrganizationDetailSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </>
  );
}

export default async function AdminOrganizationPage({ params }: PageProps<"/[locale]/admin/organizations/[id]">) {
  const t = await getTranslations("admin.org");
  return (
    <>
      <Link href="/admin/organizations" className="inline-flex min-h-8 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
        {t("back")}
      </Link>
      <Suspense fallback={<OrganizationDetailSkeleton />}>
        <OrganizationDetail params={params} />
      </Suspense>
    </>
  );
}
