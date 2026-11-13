import { ArrowLeftIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { FamilyMember, ScenarioOwner } from "@/lib/simulations/admin/queries";
import { cn } from "@/lib/utils";
import { OwnerLabel, PublishBadge, VersionBadge } from "./badges";

/** Title block of the editor and of the locked view: back link, title, protocol, owner, status, version, address. */
export function EditorHeader({
  title,
  slug,
  version,
  isPublished,
  played = false,
  owner,
  protocol,
  actions,
}: {
  title: string;
  slug: string;
  version: number;
  isPublished: boolean;
  /** Trainees have attempted it (an unpublished one then reads "Unpublished", not "Draft"). */
  played?: boolean;
  owner: ScenarioOwner;
  protocol: { title: string; icon: string } | null;
  actions: React.ReactNode;
}) {
  const t = useTranslations("simulations.admin.editor");
  return (
    <header className="flex flex-col gap-4">
      <Link href="/admin/scenarios" className={cn(buttonVariants({ variant: "ghost" }), "self-start")}>
        <ArrowLeftIcon aria-hidden className="rtl:rotate-180" />
        {t("back")}
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {protocol && (
              <span className="inline-flex items-center gap-1.5">
                <ProtocolIcon name={protocol.icon} className="size-4 text-primary" />
                {protocol.title}
              </span>
            )}
            {protocol && <span aria-hidden>·</span>}
            <OwnerLabel owner={owner} />
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <PublishBadge published={isPublished} played={played} />
            <VersionBadge version={version} />
            <bdi dir="ltr" className="font-mono text-xs text-muted-foreground">
              /simulations/{slug}
            </bdi>
          </div>
        </div>
        <div className="shrink-0">{actions}</div>
      </div>
    </header>
  );
}

/** Links between the versions of one scenario (shown when there is more than one). */
export function VersionList({ family, currentId }: { family: FamilyMember[]; currentId: string }) {
  const t = useTranslations("simulations.admin");
  const format = useFormatter();
  if (family.length < 2) return null;
  const n = (value: number) => format.number(value, "integer");
  return (
    <nav aria-labelledby="scenario-versions" className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <h2 id="scenario-versions" className="text-sm font-semibold">
        {t("versions.title")}
      </h2>
      <ol className="flex flex-col gap-1.5">
        {family.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {member.id === currentId ? (
              <span className="font-medium" aria-current="page">
                {t("version", { n: n(member.version) })} ({t("versions.current")})
              </span>
            ) : (
              <Link href={`/admin/scenarios/${member.id}`} className="inline-flex min-h-8 items-center font-medium text-primary underline-offset-4 hover:underline">
                {t("version", { n: n(member.version) })}
              </Link>
            )}
            <PublishBadge published={member.isPublished} played={member.attempts > 0} />
            <span className="text-xs text-muted-foreground">{t("versions.attempts", { count: member.attempts, n: n(member.attempts) })}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
