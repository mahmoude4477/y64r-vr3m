import {
  BookOpenCheckIcon,
  Building2Icon,
  CalendarDaysIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  MailIcon,
  NetworkIcon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { ORG_ROLES, ORGANIZATION_TYPES, type OrgRole } from "@/lib/permissions";
import { orgDisplayName, orgSecondaryName, orgTypeOf } from "@/lib/org/display";
import type { OrgSummary } from "@/lib/org/queries";
import { type SetupStepKey, setupSteps } from "@/lib/org/setup";
import { cn } from "@/lib/utils";
import { TAP_SM } from "./dialog-styles";
import { EditOrgDialog } from "./edit-org-dialog";
import { InitialsAvatar } from "./initials-avatar";
import { NameText } from "./name-text";
import { OrgSubnavSkeleton } from "./org-subnav";
import { RoleBadge } from "./role-badge";

// Building blocks of /org (server-rendered; the edit dialog is the only client island).

/** A decorative bar (0..1); the number next to it carries the information. */
function Bar({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
  return (
    <div aria-hidden className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function OrgProfileCard({ summary, role, canManage }: { summary: OrgSummary; role: OrgRole; canManage: boolean }) {
  const t = useTranslations("org.overview");
  const types = useTranslations("common.orgType");
  const locale = useLocale();
  const format = useFormatter();
  const name = orgDisplayName(summary, locale);
  const secondary = orgSecondaryName(summary, locale);
  const type = orgTypeOf(summary.type, ORGANIZATION_TYPES);
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <InitialsAvatar name={name} kind="organization" size="xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <h2 id="org-profile" className="text-xl font-semibold text-balance">
              <NameText>{name}</NameText>
            </h2>
            {secondary ? (
              // <bdi>: the other-language name keeps its own direction but lines up with the page (start side).
              <p className="text-sm text-muted-foreground">
                <bdi dir={locale === "en" ? "rtl" : "ltr"} lang={locale === "en" ? "ar" : "en"}>
                  {secondary}
                </bdi>
              </p>
            ) : (
              canManage && locale === "ar" && <p className="text-sm text-muted-foreground">{t("noNameEn")}</p>
            )}
          </div>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <li>
              <span className="sr-only">{t("yourRole")}: </span>
              <RoleBadge role={role} />
            </li>
            <li className="flex items-center gap-1.5 text-muted-foreground">
              <Building2Icon aria-hidden className="size-4" />
              {type ? types(type) : t("noType")}
            </li>
            <li className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarDaysIcon aria-hidden className="size-4" />
              {t("since", { date: format.dateTime(summary.createdAt, "date") })}
            </li>
          </ul>
        </div>
        {canManage && (
          <EditOrgDialog
            organizationId={summary.id}
            profile={{ name: summary.name, nameEn: summary.nameEn, type }}
            triggerLabel={t("edit")}
          />
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon: Icon, href }: { label: string; value: number; icon: typeof UsersRoundIcon; href?: string }) {
  const format = useFormatter();
  const body = (
    <>
      <span className="flex items-start gap-2 text-sm text-muted-foreground">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {label}
      </span>
      <span className="text-3xl font-semibold tabular-nums">{format.number(value, "integer")}</span>
    </>
  );
  // justify-between: the figures line up across a row even when one label wraps to two lines (390 px).
  const className = "flex flex-col justify-between gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10";
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(className, "h-full transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50")}
        >
          {body}
        </Link>
      ) : (
        <div className={cn(className, "h-full")}>{body}</div>
      )}
    </li>
  );
}

export function OrgStats({ summary, canManage }: { summary: OrgSummary; canManage: boolean }) {
  const t = useTranslations("org.overview");
  const staff = summary.roleCounts.owner + summary.roleCounts.admin + summary.roleCounts.examiner;
  return (
    <section aria-label={t("statsLabel")}>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("stats.members")} value={summary.memberCount} icon={UsersRoundIcon} href="/org/members" />
        <StatCard label={t("stats.staff")} value={staff} icon={ShieldCheckIcon} />
        <StatCard label={t("stats.departments")} value={summary.departmentCount} icon={NetworkIcon} href="/org/departments" />
        <StatCard
          label={t("stats.pendingInvitations")}
          value={summary.pendingInvitationCount}
          icon={MailIcon}
          href={canManage ? "/org/members#invitations" : undefined}
        />
      </ul>
    </section>
  );
}

export function RoleComposition({ summary }: { summary: OrgSummary }) {
  const t = useTranslations("org.overview.composition");
  const format = useFormatter();
  const total = summary.memberCount;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {/* Members with no Waqaya role get their own line, so the shares add up to the total. */}
          {[...ORG_ROLES, ...(summary.noRoleCount > 0 ? [null] : [])].map((role) => {
            const count = role === null ? summary.noRoleCount : summary.roleCounts[role];
            const share = total > 0 ? count / total : 0;
            return (
              <li key={role ?? "none"} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <RoleBadge role={role} />
                  <span className="text-sm tabular-nums">
                    <span className="font-medium">{format.number(count, "integer")}</span>
                    <span className="text-muted-foreground"> · {t("share", { percent: format.number(share, "percent") })}</span>
                  </span>
                </div>
                <Bar value={share} />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

type SetupStep = { key: SetupStepKey; done: boolean; action: React.ReactNode };

/** Managers' first steps, checked from the database; hidden once every step is done. */
export function SetupChecklist({ summary }: { summary: OrgSummary }) {
  const t = useTranslations("org.overview.setup");
  const format = useFormatter();
  const type = orgTypeOf(summary.type, ORGANIZATION_TYPES);
  const stepDone = setupSteps({ ...summary, ownerCount: summary.roleCounts.owner });
  const steps: SetupStep[] = [
    {
      key: "details",
      done: stepDone.details,
      action: (
        <EditOrgDialog
          organizationId={summary.id}
          profile={{ name: summary.name, nameEn: summary.nameEn, type }}
          triggerLabel={t("details.action")}
        />
      ),
    },
    {
      key: "invite",
      done: stepDone.invite,
      action: (
        // cn(): buttonVariants alone keeps the base border-transparent next to the outline border color.
        <Link href="/org/members?invite=1" className={cn(buttonVariants({ variant: "outline", size: "sm" }), TAP_SM)}>
          {t("invite.action")}
        </Link>
      ),
    },
    {
      key: "departments",
      done: stepDone.departments,
      action: (
        <Link href="/org/departments?create=1" className={cn(buttonVariants({ variant: "outline", size: "sm" }), TAP_SM)}>
          {t("departments.action")}
        </Link>
      ),
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Card className="bg-primary/5 ring-primary/20">
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Bar value={done / steps.length} className="flex-1" />
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("progress", { done: format.number(done, "integer"), total: format.number(steps.length, "integer") })}
          </span>
        </div>
        <ol className="flex flex-col gap-2">
          {steps.map((step) => (
            <li key={step.key}>
              <Item variant="outline" className="bg-card">
                <ItemMedia variant="icon">
                  {step.done ? (
                    <CircleCheckIcon aria-hidden className="size-5 text-success" />
                  ) : (
                    <CircleDashedIcon aria-hidden className="size-5 text-muted-foreground" />
                  )}
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className={cn(step.done && "text-muted-foreground line-through")}>
                    {t(`${step.key}.title`)}
                    <span className="sr-only"> ({step.done ? t("doneLabel") : t("todoLabel")})</span>
                  </ItemTitle>
                  {/* Never cut: each step says what to do (ItemDescription clamps to two lines by default, R2-UX-3). */}
                  <ItemDescription className="line-clamp-none">{t(`${step.key}.description`)}</ItemDescription>
                </ItemContent>
                {/* Under the text on phones, so the explanation keeps the full width. */}
                {!step.done && <ItemActions className="w-full justify-end sm:w-auto">{step.action}</ItemActions>}
              </Item>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** Links to the other institution pages: "Manage the institution" for managers, "About the institution" for examiners. */
export function OrgLinks({ canManage }: { canManage: boolean }) {
  const t = useTranslations("org.overview.links");
  const nav = useTranslations("nav.sub");
  const links = [
    { href: "/org/members", title: nav("orgMembers"), description: canManage ? t("membersManage") : t("membersView"), icon: UsersRoundIcon },
    {
      href: "/org/departments",
      title: nav("orgDepartments"),
      description: canManage ? t("departmentsManage") : t("departmentsView"),
      icon: NetworkIcon,
    },
    ...(canManage ? [{ href: "/org/protocols", title: nav("orgProtocols"), description: t("protocols"), icon: BookOpenCheckIcon }] : []),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{canManage ? t("label") : t("labelView")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          {links.map(({ href, title, description, icon: Icon }) => (
            // The list item wraps the link: role="listitem" on the <a> itself would hide that it is a link.
            <div key={href} role="listitem">
              <Item variant="outline" render={<Link href={href} />}>
                <ItemMedia variant="icon">
                  <Icon aria-hidden className="size-5 text-primary" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{title}</ItemTitle>
                  <ItemDescription>{description}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground rtl:rotate-180" />
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}

export function OrgOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <OrgSubnavSkeleton />
      <div className="flex items-start gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
        <Skeleton className="size-16 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-56 max-w-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
