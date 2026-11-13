import { Building2Icon, CircleCheckIcon, MailOpenIcon, PauseCircleIcon, UserRoundIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { InitialsAvatar } from "@/components/org/initials-avatar";
import { RoleBadge } from "@/components/org/role-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import { ORGANIZATION_TYPES } from "@/lib/permissions";
import { orgDisplayName, orgTypeOf } from "@/lib/org/display";
import { isStaffRole } from "@/lib/org/roles";
import { NameText } from "@/components/org/name-text";
import { cn } from "@/lib/utils";
import type { SettingsData, SettingsMembership } from "@/lib/settings-feature/queries";
import { sectionHeadingId, SettingsSection } from "./settings-section";
import { SwitchInstitutionButton } from "./switch-institution-button";

function ActiveBadge() {
  const t = useTranslations("settings.institutions");
  return (
    <Badge variant="outline" className="border-success/40 bg-success/10 text-foreground">
      <CircleCheckIcon aria-hidden className="text-success" />
      {t("active")}
    </Badge>
  );
}

function MembershipItem({ membership }: { membership: SettingsMembership }) {
  const t = useTranslations("settings.institutions");
  const types = useTranslations("common.orgType");
  const locale = useLocale();
  const format = useFormatter();
  const name = orgDisplayName(membership, locale);
  const type = orgTypeOf(membership.type, ORGANIZATION_TYPES);
  return (
    <Item role="listitem" variant="outline" className={membership.active ? "border-primary/30 bg-primary/5" : undefined}>
      <ItemMedia>
        <InitialsAvatar name={name} kind="organization" size="md" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          <NameText>{name}</NameText>
          {membership.active && <ActiveBadge />}
          {membership.suspended && (
            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-foreground">
              <PauseCircleIcon aria-hidden />
              {t("suspended")}
            </Badge>
          )}
        </ItemTitle>
        <ItemDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <RoleBadge role={membership.role} />
          {type && <span>{types(type)}</span>}
          <span>{t("joined", { date: format.dateTime(membership.joinedAt, "date") })}</span>
        </ItemDescription>
        {membership.suspended && <p className="text-sm text-muted-foreground">{t("suspendedHint")}</p>}
      </ItemContent>
      {membership.active && isStaffRole(membership.role) && (
        <ItemActions className="w-full justify-end sm:w-auto">
          {/* cn(): buttonVariants alone keeps the base border-transparent next to the outline border color. */}
          <Link href="/org" className={cn(buttonVariants({ variant: "outline" }))}>
            <Building2Icon aria-hidden />
            {t("open")}
          </Link>
        </ItemActions>
      )}
      {!membership.active && !membership.suspended && (
        <ItemActions className="w-full justify-end sm:w-auto">
          <SwitchInstitutionButton
            organizationId={membership.organizationId}
            label={t("switch")}
            accessibleLabel={t("switchLabel", { name })}
            switchedMessage={t("switched", { name })}
          />
        </ItemActions>
      )}
    </Item>
  );
}

/** Without an active institution (or with none at all) the user works with the individual account. */
function PersonalItem({ active }: { active: boolean }) {
  const t = useTranslations("settings.institutions");
  return (
    <Item role="listitem" variant="outline" className={active ? "border-primary/30 bg-primary/5" : undefined}>
      <ItemMedia>
        <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
          <UserRoundIcon className="size-4" />
        </span>
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          {t("personal.title")}
          {active && <ActiveBadge />}
        </ItemTitle>
        <ItemDescription>{t("personal.description")}</ItemDescription>
      </ItemContent>
      {!active && (
        <ItemActions className="w-full justify-end sm:w-auto">
          <SwitchInstitutionButton
            organizationId={null}
            label={t("switch")}
            accessibleLabel={t("personal.switchLabel")}
            switchedMessage={t("personal.switched")}
          />
        </ItemActions>
      )}
    </Item>
  );
}

function Invitations({ invitations }: { invitations: SettingsData["invitations"] }) {
  const t = useTranslations("settings.institutions.invitations");
  const roles = useTranslations("common.roles");
  const locale = useLocale();
  const format = useFormatter();
  return (
    <div className="flex flex-col gap-3">
      <h3 id="invitations-heading" className="text-sm font-semibold">
        {t("title")}
      </h3>
      <ItemGroup aria-labelledby="invitations-heading" className="gap-2">
        {invitations.map((inv) => {
          const name = orgDisplayName({ name: inv.organizationName, nameEn: inv.organizationNameEn }, locale);
          return (
            <Item key={inv.id} role="listitem" variant="outline">
              <ItemMedia variant="icon" className="size-9 rounded-lg bg-primary/10 text-primary">
                <MailOpenIcon aria-hidden className="size-4" />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>
                  <NameText>{name}</NameText>
                </ItemTitle>
                <ItemDescription className="flex flex-wrap gap-x-3">
                  <span>{t("role", { role: roles(inv.role) })}</span>
                  <span>{t("expires", { date: format.dateTime(inv.expiresAt, "date") })}</span>
                </ItemDescription>
              </ItemContent>
              <ItemActions className="w-full justify-end sm:w-auto">
                <Link
                  href={`/invite/${encodeURIComponent(inv.id)}`}
                  aria-label={t("viewLabel", { name })}
                  className={cn(buttonVariants({ variant: "default" }))}
                >
                  {t("view")}
                </Link>
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
    </div>
  );
}

export function InstitutionsSection({ data }: { data: Pick<SettingsData, "memberships" | "invitations"> }) {
  const t = useTranslations("settings.institutions");
  const { memberships, invitations } = data;
  const anyActive = memberships.some((m) => m.active);
  return (
    <SettingsSection id="institutions" title={t("title")} description={t("description")}>
      <CardContent className="flex flex-col gap-6">
        {memberships.length === 0 ? (
          <Empty className="border bg-muted/30 p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("empty.title")}</EmptyTitle>
              <EmptyDescription>{t("empty.description")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup aria-labelledby={sectionHeadingId("institutions")} className="gap-2">
            {memberships.map((m) => (
              <MembershipItem key={m.organizationId} membership={m} />
            ))}
            <PersonalItem active={!anyActive} />
          </ItemGroup>
        )}
        {invitations.length > 0 && (
          <>
            {memberships.length > 0 && <Separator />}
            <Invitations invitations={invitations} />
          </>
        )}
      </CardContent>
    </SettingsSection>
  );
}
