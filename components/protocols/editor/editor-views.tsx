import { ArrowLeftIcon, GitBranchIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { notFound } from "next/navigation";
import type { Locale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { scopeOf } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { ORG_MANAGER_ROLES } from "@/lib/permissions";
import { emptyEditorValues } from "@/lib/protocols/editor-form";
import { type EditorProtocol, getEditorProtocol } from "@/lib/protocols/editor-queries";
import { editorBasePath, type EditorScope, SCENARIO_EDITOR_PATH } from "@/lib/protocols/editor-scope";
import { type AuthContext, requireContentEditor, requireOrgRole } from "@/lib/session";
import { cn } from "@/lib/utils";
import { ProtocolEditor } from "./protocol-editor";
import { ProtocolStatusBadge } from "./status-badge";
import { UnpublishOldVersion } from "./version-actions";

/**
 * Server parts of the editor pages (all Suspense'd: they read the session). The gate runs here, in the data
 * component: platform admins for "global", managers of the active institution for "institution".
 */

export async function requireEditor(kind: EditorScope): Promise<AuthContext> {
  return kind === "global" ? requireContentEditor() : requireOrgRole(ORG_MANAGER_ROLES);
}

/** /admin/protocols/new and /org/protocols/new. */
export async function CreateProtocolView({ kind }: { kind: EditorScope }) {
  await requireEditor(kind);
  const t = await getTranslations("protocols");
  const title = kind === "global" ? t("editor.newTitle") : t("org.newPage.title");
  return (
    <>
      <BreadcrumbLabel label={title} />
      <EditorHeader
        kind={kind}
        titleId={`protocol-editor-title-new-${kind}`}
        title={title}
        description={kind === "global" ? t("admin.newDescription") : t("org.newPage.description")}
      />
      <ProtocolEditor kind={kind} protocol={null} initialValues={emptyEditorValues()} titleId={`protocol-editor-title-new-${kind}`} />
    </>
  );
}

/** /admin/protocols/[id] (global ones) and /org/protocols/[id]. Not found for anything this user may not edit. */
export async function EditProtocolView({ kind, id, ctx }: { kind: EditorScope; id: string; ctx: AuthContext }) {
  const [protocol, locale] = await Promise.all([getEditorProtocol(kind, scopeOf(ctx), id), getLocale()]);
  if (!protocol) notFound();
  const t = await getTranslations("protocols.editor");
  const title = pick(protocol, "title", locale) || t("untitled");
  return (
    <>
      <BreadcrumbLabel label={title} />
      <EditorHeader kind={kind} titleId={`protocol-editor-title-${protocol.id}`} title={title} protocol={protocol} locale={locale} />
      <ProtocolEditor kind={kind} protocol={protocol} initialValues={protocol.values} titleId={`protocol-editor-title-${protocol.id}`} />
    </>
  );
}

async function EditorHeader({
  kind,
  titleId,
  title,
  description,
  protocol,
  locale,
}: {
  kind: EditorScope;
  titleId: string;
  title: string;
  description?: string;
  protocol?: EditorProtocol;
  locale?: Locale;
}) {
  const t = await getTranslations("protocols.editor");
  return (
    <header className="flex flex-col gap-3">
      <Link
        href={editorBasePath(kind)}
        className="inline-flex min-h-8 w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
        {t(`back.${kind}`)}
      </Link>
      <div className="flex flex-col gap-2">
        {protocol && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ProtocolStatusBadge published={protocol.isPublished} />
            <p className="text-xs text-muted-foreground">
              <span className="sr-only">{t("address")}: </span>
              <bdi dir="ltr" className="font-mono">
                /protocols/{protocol.slug}
              </bdi>
            </p>
          </div>
        )}
        <h1 id={titleId} className="text-2xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {description && <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {protocol?.source && locale && (
        <Note icon="info">
          {t.rich(protocol.source.isPublished ? "links.copyOf" : "links.copyOfUnpublished", {
            title: pick(protocol.source, "title", locale),
            link: (chunks) => (
              <Link href={`/protocols/${protocol.source!.slug}`} className="font-medium text-primary underline underline-offset-4">
                {chunks}
              </Link>
            ),
            b: (chunks) => <strong className="font-medium">{chunks}</strong>,
          })}
        </Note>
      )}
      {protocol?.newerSource && locale && <NewerSourceNote newerSource={protocol.newerSource} locale={locale} />}
      {protocol?.versionOf && locale && <VersionOfNote kind={kind} protocol={protocol} versionOf={protocol.versionOf} locale={locale} />}
      {protocol?.newerVersion && locale && (
        <Note icon="version">
          {t.rich("links.newerVersion", {
            title: pick(protocol.newerVersion, "title", locale),
            link: (chunks) => (
              <Link href={`${editorBasePath(kind)}/${protocol.newerVersion!.id}`} className="font-medium text-primary underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}{" "}
          {protocol.newerVersion.isPublished ? (protocol.isPublished ? t("links.newerBothPublished") : null) : t("links.newerDraft")}
        </Note>
      )}
    </header>
  );
}

/**
 * On a new version: what it replaces, the order of the switch-over (publish this one, then unpublish the old one,
 * with that action right here once both are live), and what stays with the old version (its training scenarios and
 * the institution copies made from it never move).
 */
async function VersionOfNote({
  kind,
  protocol,
  versionOf,
  locale,
}: {
  kind: EditorScope;
  protocol: EditorProtocol;
  versionOf: NonNullable<EditorProtocol["versionOf"]>;
  locale: Locale;
}) {
  const t = await getTranslations("protocols.editor.links");
  const oldTitle = pick(versionOf, "title", locale);
  const bothLive = versionOf.isPublished && protocol.isPublished;
  const scenarioLink = (chunks: React.ReactNode) =>
    kind === "global" ? (
      <Link href={SCENARIO_EDITOR_PATH} className="font-medium text-primary underline underline-offset-4">
        {chunks}
      </Link>
    ) : (
      chunks
    );
  const scenarioKey = versionOf.isPublished ? "versionOfScenarios" : "versionOfScenariosHidden";
  return (
    <Note icon={bothLive ? "warning" : "version"}>
      {t.rich("versionOf", {
        title: oldTitle,
        link: (chunks) => (
          <Link href={`${editorBasePath(kind)}/${versionOf.id}`} className="font-medium text-primary underline underline-offset-4">
            {chunks}
          </Link>
        ),
      })}{" "}
      {versionOf.isPublished ? (protocol.isPublished ? t("versionOfBothPublished") : t("versionOfPublished")) : null}
      {versionOf.scenarios > 0 && (
        <span className="block pt-1.5">
          {kind === "global"
            ? t.rich(scenarioKey, { count: versionOf.scenarios, link: scenarioLink })
            : t(`${scenarioKey}Institution`, { count: versionOf.scenarios })}
        </span>
      )}
      {kind === "global" && versionOf.copies > 0 && <span className="block pt-1.5">{t("versionOfCopies", { count: versionOf.copies })}</span>}
      {bothLive && (
        <UnpublishOldVersion kind={kind} id={versionOf.id} title={oldTitle} scenarios={versionOf.scenarios} copies={kind === "global" ? versionOf.copies : 0} />
      )}
    </Note>
  );
}

/**
 * On an institution copy: a newer version of the global protocol it was copied from is published. The copy never
 * changes by itself; the note says how to adopt the new version (copy it, adapt, publish, unpublish this copy), or
 * opens the institution's copy of it when there already is one.
 */
async function NewerSourceNote({ newerSource, locale }: { newerSource: NonNullable<EditorProtocol["newerSource"]>; locale: Locale }) {
  const t = await getTranslations("protocols.editor.links");
  const linkClass = "font-medium text-primary underline underline-offset-4";
  const copyHref = newerSource.copyId ? `/org/protocols/${newerSource.copyId}` : "/org/protocols/copy";
  return (
    <Note icon="version">
      {t.rich(newerSource.copyId ? "newerSourceCopied" : "newerSource", {
        title: pick(newerSource, "title", locale),
        link: (chunks) => (
          <Link href={`/protocols/${newerSource.slug}`} className={linkClass}>
            {chunks}
          </Link>
        ),
        copy: (chunks) => (
          <Link href={copyHref} className={linkClass}>
            {chunks}
          </Link>
        ),
      })}
    </Note>
  );
}

function Note({ icon, children }: { icon: "info" | "version" | "warning"; children: React.ReactNode }) {
  const Icon = icon === "info" ? InfoIcon : icon === "warning" ? TriangleAlertIcon : GitBranchIcon;
  return (
    <div
      role="note"
      className={cn(
        "flex max-w-3xl items-start gap-2.5 rounded-xl p-3 text-sm ring-1",
        icon === "warning" ? "bg-warning/10 ring-warning/40" : "bg-secondary/60 ring-border",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", icon === "warning" ? "text-warning-foreground dark:text-warning" : "text-primary")} />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

/** While the session and the protocol's owner are read: the header both kinds of protocol page share. */
export function ProtocolPageSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-8 w-2/3 max-w-md" />
    </div>
  );
}

/** The read-only protocol view (one column of steps). */
export function ReadOnlyProtocolSkeleton() {
  return (
    <div className="flex max-w-4xl flex-col gap-6" aria-hidden>
      <ProtocolPageSkeleton />
      <Skeleton className="h-16 w-full rounded-xl" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-8 w-2/3 max-w-md" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-96 w-full rounded-xl" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
