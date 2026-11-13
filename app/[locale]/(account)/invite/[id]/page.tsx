import {
  BadgeCheckIcon,
  BanIcon,
  CircleCheckBigIcon,
  CirclePauseIcon,
  CircleXIcon,
  ClockAlertIcon,
  type LucideIcon,
  SearchXIcon,
  UserXIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { InitialsAvatar } from "@/components/org/initials-avatar";
import { NameText } from "@/components/org/name-text";
import { InviteResponse, InviteStateHeading, OpenOrganizationButton, SwitchAccountButton } from "@/components/org/invite-actions";
import { RoleBadge } from "@/components/org/role-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { maskAddress } from "@/lib/email";
import { ORGANIZATION_TYPES } from "@/lib/permissions";
import { orgDisplayName, orgTypeOf } from "@/lib/org/display";
import { type InviteState, inviteState, showsInvitationDetails } from "@/lib/org/invite-state";
import { getInvitationForPage, type InvitationForPage } from "@/lib/org/queries";
import { getAuthContext, requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

// /invite/<id>: accept or decline an institution invitation (the link of the invitation e-mail, or the copyable
// fallback). Guests reach it (lib/routes.ts: "/invite" is not crawled but not redirected either); the sign-in, sign-up
// and e-mail-verification pages carry the page along as their callback, so a new account comes back here too. A
// visitor without a valid session (a guest, or an expired session cookie) gets the "sign_in" state: the institution, the role, the masked
// address and Sign in / Create account links. Everything request-specific sits inside Suspense; the static shell is
// the skeleton only.

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations("nav");
  return { title: nav("sub.invite") };
}

const STATE_ICONS: Partial<Record<InviteState, LucideIcon>> = {
  unknown: SearchXIcon,
  already_member: BadgeCheckIcon,
  accepted: CircleCheckBigIcon,
  rejected: CircleXIcon,
  canceled: BanIcon,
  expired: ClockAlertIcon,
  no_longer_valid: UserXIcon,
  suspended: CirclePauseIcon,
  invalid_role: UserXIcon,
};

/** messages org.invitePage.<key> of each closed state. */
const STATE_KEYS = {
  unknown: "unknown",
  already_member: "alreadyMember",
  accepted: "accepted",
  rejected: "rejected",
  canceled: "canceled",
  expired: "expired",
  no_longer_valid: "noLongerValid",
  suspended: "suspended",
  invalid_role: "invalidRole",
} as const;

async function InviteBody({ params }: Pick<PageProps<"/[locale]/invite/[id]">, "params">) {
  const { id } = await params;
  const auth = await getAuthContext();
  if (auth?.user.mustChangePassword) await requireUser(); // the forced password change comes first
  const locale = await getLocale();
  const t = await getTranslations("org.invitePage");
  const invitation = await getInvitationForPage(id, auth?.user.id ?? null);
  const state = inviteState(
    invitation && {
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      email: invitation.email,
      inviterIsMember: invitation.inviterIsMember,
      organizationSuspended: invitation.organization.suspended,
      roleKnown: invitation.role !== null,
    },
    auth ? { email: auth.user.email, isMember: invitation?.viewerIsMember ?? false } : null,
  );

  if (!invitation || !showsInvitationDetails(state)) {
    const key = STATE_KEYS[state as keyof typeof STATE_KEYS] ?? "unknown";
    const Icon = STATE_ICONS[state] ?? SearchXIcon;
    const orgName = invitation ? orgDisplayName(invitation.organization, locale) : "";
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-full",
              state === "already_member" ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon aria-hidden className="size-6" />
          </span>
          <div className="flex flex-col gap-1.5">
            {/* Focused after a decline (the decline button is gone with the open state). */}
            <InviteStateHeading>{t(`${key}.title`, { org: orgName })}</InviteStateHeading>
            {/* The closed states name the institution when the invitation exists. */}
            <p className="text-sm text-muted-foreground">{t(`${key}.description`, { org: orgName })}</p>
          </div>
          {state === "already_member" && invitation ? (
            <div className="w-full">
              <OpenOrganizationButton organizationId={invitation.organization.id} />
            </div>
          ) : auth ? (
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
              {t("dashboard")}
            </Link>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const orgName = orgDisplayName(invitation.organization, locale);
  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <InitialsAvatar name={orgName} kind="organization" size="xl" />
          {state === "open" && (
            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold text-balance">{t("open.title", { org: orgName })}</h1>
              <p className="text-sm text-muted-foreground">
                {invitation.inviterName ? t("open.description", { inviter: invitation.inviterName }) : t("open.descriptionNoInviter")}
              </p>
            </div>
          )}
          {state === "sign_in" && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">
                <NameText>{orgName}</NameText>
              </p>
              <h1 className="text-xl font-semibold text-balance">{t("signIn.title")}</h1>
              <p className="text-sm text-muted-foreground">
                {t.rich("signIn.description", { email: maskAddress(invitation.email), addr: (c) => <Addr>{c}</Addr> })}
              </p>
            </div>
          )}
          {state === "wrong_account" && auth && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">
                <NameText>{orgName}</NameText>
              </p>
              <h1 className="text-xl font-semibold text-balance">{t("wrongAccount.title")}</h1>
              <p className="text-sm text-muted-foreground">
                {t.rich("wrongAccount.description", {
                  email: maskAddress(invitation.email),
                  current: auth.user.email,
                  addr: (c) => <Addr>{c}</Addr>,
                })}
              </p>
            </div>
          )}
        </div>

        {/* Who sent it and the department are for the invited person only (state "open"); a forwarded link or another
            account sees the institution, the role and the validity. */}
        <InvitationDetails invitation={invitation} full={state === "open"} />
        <Separator />

        {state === "open" && <InviteResponse invitationId={invitation.id} orgName={orgName} />}
        {state === "sign_in" && <SignInLinks invitationId={invitation.id} locale={locale} />}
        {state === "wrong_account" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("wrongAccount.hint")}</p>
            <SwitchAccountButton invitationId={invitation.id} />
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost" }))}>
              {t("dashboard")}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Addr({ children }: { children: React.ReactNode }) {
  return (
    <bdi dir="ltr" className="font-medium text-foreground">
      {children}
    </bdi>
  );
}

async function InvitationDetails({ invitation, full }: { invitation: InvitationForPage; full: boolean }) {
  const t = await getTranslations("org.invitePage");
  const roles = await getTranslations("org.roleDescriptions");
  const types = await getTranslations("common.orgType");
  const profile = await getTranslations("org.profile");
  const format = await getFormatter();
  const type = orgTypeOf(invitation.organization.type, ORGANIZATION_TYPES);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 rounded-lg bg-muted/40 p-4 text-sm">
      <dt className="text-muted-foreground">{t("role")}</dt>
      <dd className="flex flex-col items-start gap-1">
        <RoleBadge role={invitation.role} />
        {invitation.role && <span className="text-xs text-muted-foreground">{roles(invitation.role)}</span>}
      </dd>
      {type && (
        <>
          <dt className="text-muted-foreground">{profile("type")}</dt>
          <dd>{types(type)}</dd>
        </>
      )}
      {full && invitation.departments.length > 0 && (
        <>
          <dt className="text-muted-foreground">{t("department")}</dt>
          <dd className="flex flex-wrap gap-1">
            {invitation.departments.map((d) => (
              <Badge key={d.id} variant="outline" title={d.name} className="max-w-full">
                <NameText className="truncate">{d.name}</NameText>
              </Badge>
            ))}
          </dd>
        </>
      )}
      {full && invitation.inviterName && (
        <>
          <dt className="text-muted-foreground">{t("invitedBy")}</dt>
          <dd>
            <NameText>{invitation.inviterName}</NameText>
          </dd>
        </>
      )}
      <dt className="text-muted-foreground">{t("validUntil")}</dt>
      <dd>
        {t("validUntilValue", { date: format.dateTime(invitation.expiresAt, "date"), time: format.dateTime(invitation.expiresAt, "time") })}
      </dd>
    </dl>
  );
}

async function SignInLinks({ invitationId, locale }: { invitationId: string; locale: string }) {
  const t = await getTranslations("org.invitePage.signIn");
  const query = `?${new URLSearchParams({ callbackUrl: `/${locale}/invite/${encodeURIComponent(invitationId)}` })}`;
  // sm:flex-1 only: in the phone column, flex-1 (basis 0%) would shrink the buttons to the text line (R2-UX-1).
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Link href={`/sign-in${query}`} className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto sm:flex-1")}>
        {t("signIn")}
      </Link>
      <Link href={`/sign-up${query}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto sm:flex-1")}>
        {t("signUp")}
      </Link>
    </div>
  );
}

function InviteSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl p-6 ring-1 ring-foreground/10">
      <Skeleton className="size-16 rounded-xl" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

export default function InvitePage({ params }: PageProps<"/[locale]/invite/[id]">) {
  return (
    <Suspense fallback={<InviteSkeleton />}>
      <InviteBody params={params} />
    </Suspense>
  );
}
