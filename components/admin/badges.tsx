import {
  BanIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  KeyRoundIcon,
  MailWarningIcon,
  ShieldCheckIcon,
  SquarePenIcon,
  UserRoundCheckIcon,
  UserRoundIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { OrgRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

// Status badges of the admin panel: color + icon + text (never color alone), same tones as components/shared.

// Light-theme text is darkened toward the foreground so it keeps 4.5:1 on its own tint (WCAG AA for 12 px text):
// plain --success is 3.8:1 on bg-success/12, --warning mixed 35 % only 4.2:1 on bg-warning/15 (axe, admin e2e).
const tone = {
  neutral: "bg-muted text-muted-foreground ring-1 ring-border",
  primary: "bg-primary/10 text-primary ring-1 ring-primary/20",
  success: "bg-success/12 text-[color-mix(in_oklab,var(--success),var(--foreground)_30%)] ring-1 ring-success/25 dark:text-success",
  warning:
    "bg-warning/15 text-[color-mix(in_oklab,var(--warning),var(--foreground)_50%)] ring-1 ring-warning/30 dark:text-warning",
  danger: "bg-destructive/10 text-destructive ring-1 ring-destructive/25",
} as const;

export function ToneBadge({
  kind,
  icon: Icon,
  children,
  className,
}: {
  kind: keyof typeof tone;
  icon?: typeof BanIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("border-transparent", tone[kind], className)}>
      {Icon && <Icon aria-hidden />}
      {children}
    </Badge>
  );
}

export function PlatformRoleBadge({ admin, protocolEditor = false }: { admin: boolean; protocolEditor?: boolean }) {
  const t = useTranslations("common.roles");
  return admin ? (
    <ToneBadge kind="primary" icon={ShieldCheckIcon}>
      {t("platformAdmin")}
    </ToneBadge>
  ) : protocolEditor ? (
    <ToneBadge kind="primary" icon={SquarePenIcon}>
      {t("protocolEditor")}
    </ToneBadge>
  ) : (
    <ToneBadge kind="neutral" icon={UserRoundIcon}>
      {t("user")}
    </ToneBadge>
  );
}

/** Account state: banned, then not verified, then active; plus the forced password change when it applies. */
export function UserStatusBadges({
  bannedNow,
  emailVerified,
  mustChangePassword,
}: {
  bannedNow: boolean;
  emailVerified: boolean;
  mustChangePassword: boolean;
}) {
  const t = useTranslations("admin.users.badges");
  return (
    <span className="flex flex-wrap gap-1">
      {bannedNow ? (
        <ToneBadge kind="danger" icon={BanIcon}>
          {t("banned")}
        </ToneBadge>
      ) : !emailVerified ? (
        <ToneBadge kind="warning" icon={MailWarningIcon}>
          {t("unverified")}
        </ToneBadge>
      ) : (
        <ToneBadge kind="success" icon={CircleCheckIcon}>
          {t("active")}
        </ToneBadge>
      )}
      {mustChangePassword && (
        <ToneBadge kind="neutral" icon={KeyRoundIcon}>
          {t("mustChangePassword")}
        </ToneBadge>
      )}
    </span>
  );
}

export function OrgStatusBadges({ suspended, hasOwner }: { suspended: boolean; hasOwner: boolean }) {
  const t = useTranslations("admin.organizations.badges");
  return (
    <span className="flex flex-wrap gap-1">
      {suspended ? (
        <ToneBadge kind="danger" icon={CirclePauseIcon}>
          {t("suspended")}
        </ToneBadge>
      ) : (
        <ToneBadge kind="success" icon={CircleCheckIcon}>
          {t("active")}
        </ToneBadge>
      )}
      {!hasOwner && (
        <ToneBadge kind="warning" icon={CircleAlertIcon}>
          {t("noOwner")}
        </ToneBadge>
      )}
    </span>
  );
}

export function OrgRoleBadge({ role }: { role: OrgRole | null }) {
  const t = useTranslations("common.roles");
  if (!role) return null;
  return <ToneBadge kind={role === "owner" ? "primary" : "neutral"}>{t(role)}</ToneBadge>;
}

/** The viewing platform admin's own role in an institution of a list (nothing when they are not a member). */
export function YourRoleBadge({ role }: { role: OrgRole | null }) {
  const t = useTranslations("admin.organizations.badges");
  const roles = useTranslations("common.roles");
  if (!role) return null;
  return (
    <ToneBadge kind="primary" icon={UserRoundCheckIcon}>
      {t("yourRole", { role: roles(role) })}
    </ToneBadge>
  );
}
