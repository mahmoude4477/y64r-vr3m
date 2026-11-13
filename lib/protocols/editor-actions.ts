"use server";

// Server Actions of the shared protocol editor (components/protocols/editor). Every action takes the editor scope
// explicitly: "global" (platform admins and protocol editors, requireContentEditor) or "institution" (owners / admins of the ACTIVE
// institution, requireOrgRole(ORG_MANAGER_ROLES) + protocolsEditable). Order in each: locale -> authorize -> rate
// limit -> validate -> one transaction with its audit row (writeAudit with { tx }: no change without its audit row)
// -> revalidate. Failures return a stable `error` code plus a `message` already translated into `locale`.
// History rules (lib/protocols/history.ts): steps and protocols with history are never deleted.
import { hasLocale, type Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { routing } from "@/i18n/routing";
import { takeAppRateLimit } from "@/lib/app-rate-limit";
import { writeAudit } from "@/lib/audit";
import { requireOrgScope, scopeOf, type Scope } from "@/lib/authz";
import { log } from "@/lib/log";
import { ORG_MANAGER_ROLES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { type AuthContext, requireContentEditor, requireOrgRole } from "@/lib/session";
import { protocolSchema } from "@/lib/validation/protocol";
import { zodErrorMap } from "@/lib/zod-i18n";
import {
  type EditorValues,
  editorSchema,
  editorValuesShape,
  issuesToFieldErrors,
  newStepKey,
  nextVersionSlug,
  protocolToEditorValues,
  randomSuffix,
  suffixedSlug,
  versionSlugBase,
} from "./editor-form";
import { editableWhere, type EditorScope, isEditorScope, MAX_INSTITUTION_PROTOCOLS } from "./editor-scope";
import { isPlausibleId } from "./editor-queries";
import {
  canDeleteProtocol,
  changedStepFields,
  changesReportedWording,
  type MeaningField,
  planStepChanges,
  protocolUsage,
  type StepContent,
  stepMeaningLocked,
  type WordingField,
} from "./history";

export type EditorErrorCode =
  | "bad_input"
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "slug_taken"
  | "step_has_history"
  | "step_locked"
  | "wording_confirm"
  | "has_history"
  | "published"
  | "source_unavailable"
  | "limit"
  | "too_many_requests"
  | "failed";

export type EditorFailure = {
  ok: false;
  error: EditorErrorCode;
  /** Translated into the locale the action was called with. */
  message: string;
  /** invalid_input / slug_taken: translated message per field path ("titleAr", "steps.2.criteriaAr"). */
  fieldErrors?: Record<string, string>;
  /** wording_confirm: the steps (1-based, in the order sent) whose reported wording the save would change. */
  wordingSteps?: number[];
};

export type SaveResult = { ok: true; id: string; version: string; values: EditorValues } | EditorFailure;
export type CreateResult = { ok: true; id: string } | EditorFailure;
export type PublishResult = { ok: true; isPublished: boolean; version: string } | EditorFailure;
export type DeleteResult = { ok: true } | EditorFailure;

const MESSAGE_KEY = {
  bad_input: "generic",
  invalid_input: "invalid",
  not_found: "notFound",
  conflict: "conflict",
  slug_taken: "slugTaken",
  step_has_history: "stepHasHistory",
  step_locked: "stepLocked",
  wording_confirm: "wordingConfirm",
  has_history: "hasHistory",
  published: "published",
  source_unavailable: "sourceUnavailable",
  limit: "limit",
  too_many_requests: "tooManyRequests",
  failed: "generic",
} as const satisfies Record<EditorErrorCode, string>;

/** Writes per user per 5 minutes, across all editor actions (protocol content changes rarely). */
const WRITES_PER_5_MIN = 60;

class EditorError extends Error {
  constructor(
    readonly code: EditorErrorCode,
    readonly fieldErrors?: Record<string, string>,
    readonly wordingSteps?: number[],
  ) {
    super(code);
  }
}

async function failure(
  locale: Locale,
  code: EditorErrorCode,
  fieldErrors?: Record<string, string>,
  wordingSteps?: number[],
): Promise<EditorFailure> {
  const t = await getTranslations({ locale, namespace: "protocols.editor.errors" });
  const message = code === "limit" ? t("limit", { max: String(MAX_INSTITUTION_PROTOCOLS) }) : t(MESSAGE_KEY[code]);
  return { ok: false, error: code, message, ...(fieldErrors ? { fieldErrors } : {}), ...(wordingSteps ? { wordingSteps } : {}) };
}

/** Denied users get the not-found UI (requireContentEditor / requireOrgRole call notFound(), guests are redirected). */
async function authorize(kind: EditorScope): Promise<{ ctx: AuthContext; scope: Scope }> {
  const ctx = kind === "global" ? await requireContentEditor() : await requireOrgRole(ORG_MANAGER_ROLES);
  return { ctx, scope: scopeOf(ctx) };
}

type Prepared = { locale: Locale; kind: EditorScope; ctx: AuthContext; scope: Scope };

/** Locale, scope and authorization, then the per-user write limit. */
async function prepare(locale: string, kind: unknown): Promise<Prepared | EditorFailure> {
  const lang: Locale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  if (!hasLocale(routing.locales, locale) || !isEditorScope(kind)) return failure(lang, "bad_input");
  const { ctx, scope } = await authorize(kind);
  if (!(await takeAppRateLimit(`protocols.edit:${ctx.user.id}`, WRITES_PER_5_MIN, 300))) return failure(lang, "too_many_requests");
  return { locale: lang, kind, ctx, scope };
}

function isFailure<T extends object>(value: T | EditorFailure): value is EditorFailure {
  return "ok" in value && value.ok === false;
}

function revalidateProtocolPages() {
  revalidatePath("/[locale]/protocols", "layout");
  revalidatePath("/[locale]/admin/protocols", "layout");
  revalidatePath("/[locale]/org/protocols", "layout");
}

const prismaCode = (e: unknown) => (typeof e === "object" && e !== null ? String((e as { code?: unknown }).code ?? "") : "");

async function handleUnexpected(locale: Locale, action: string, e: unknown): Promise<EditorFailure> {
  if (e instanceof EditorError) return failure(locale, e.code, e.fieldErrors, e.wordingSteps);
  // A foreign key that appeared between the check and the delete (a result written meanwhile): history.
  if (prismaCode(e) === "P2003") return failure(locale, action === "delete" ? "has_history" : "step_has_history");
  // Next's control flow (redirect / notFound from the auth helpers) must keep propagating.
  if (typeof e === "object" && e !== null && "digest" in e && /^NEXT_/.test(String((e as { digest: unknown }).digest))) throw e;
  log.error("protocols.editor.failed", { action, err: e });
  return failure(locale, "failed");
}

const idInput = z.object({ id: z.string().min(1).max(64), version: z.iso.datetime().optional() });

/** Untrusted input -> validated protocol data, or translated field errors. */
async function validate(locale: Locale, values: unknown, withSlug: boolean) {
  const t = await getTranslations({ locale, namespace: "validation" });
  const error = zodErrorMap(t, locale);
  const shape = editorValuesShape.safeParse(values, { error });
  if (!shape.success) return { ok: false as const, failure: await failure(locale, "bad_input") };
  const parsed = editorSchema(withSlug).safeParse(shape.data, { error });
  if (!parsed.success) {
    return { ok: false as const, failure: await failure(locale, "invalid_input", issuesToFieldErrors(parsed.error.issues)) };
  }
  // Steps in the same order as the input, with the id the form sent next to each (the schema drops it).
  const steps = parsed.data.steps.map((step, i) => ({ ...step, id: shape.data.steps[i]?.id ?? null }));
  return { ok: true as const, data: { ...parsed.data, steps } };
}

type ValidData = Extract<Awaited<ReturnType<typeof validate>>, { ok: true }>["data"];

function protocolFields(data: ValidData) {
  return {
    category: data.category,
    icon: data.icon,
    titleAr: data.titleAr,
    titleEn: data.titleEn,
    summaryAr: data.summaryAr,
    summaryEn: data.summaryEn,
    descriptionAr: data.descriptionAr,
    descriptionEn: data.descriptionEn,
  };
}

function stepFields(step: ValidData["steps"][number], order: number) {
  return {
    order,
    textAr: step.textAr,
    textEn: step.textEn,
    rationaleAr: step.rationaleAr,
    rationaleEn: step.rationaleEn,
    criteriaAr: step.criteriaAr,
    criteriaEn: step.criteriaEn,
    referenceLabel: step.referenceLabel,
    referenceUrl: step.referenceUrl,
    isMandatory: step.isMandatory,
    isCritical: step.isCritical,
    weight: step.weight,
    visualCheck: step.visualCheck,
  };
}

/** The saved step content a save compares against (history.ts MEANING_FIELDS + WORDING_FIELDS). */
const stepContentSelect = {
  textAr: true,
  textEn: true,
  rationaleAr: true,
  rationaleEn: true,
  criteriaAr: true,
  criteriaEn: true,
  referenceLabel: true,
  referenceUrl: true,
  isMandatory: true,
  isCritical: true,
  weight: true,
  visualCheck: true,
} as const satisfies Record<keyof StepContent, true>;

/** One saved step a save changed, as the protocol.update audit row records it. */
type ChangedStep = {
  id: string;
  key: string;
  fields: Array<MeaningField | WordingField>;
  /** The old wording of a step with results (what its past results were assessed against). */
  before?: Partial<Record<WordingField, string | null>>;
};

/** New-step keys for a brand-new protocol (no saved steps yet). */
function freshKeys(steps: ValidData["steps"]): string[] {
  const taken = new Set<string>();
  return steps.map((s) => {
    const key = newStepKey(s.textEn, taken);
    taken.add(key);
    return key;
  });
}

const TX = { timeout: 20_000, maxWait: 10_000 } as const;

/**
 * Refuses a new institution protocol once the institution has MAX_INSTITUTION_PROTOCOLS. Call it inside the
 * transaction that creates the row: the per-institution advisory lock (held until that transaction ends) makes
 * parallel creates of the same institution count one after another, so a burst cannot pass the cap.
 */
async function assertInstitutionRoom(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('waqaya.protocols.institution'), hashtext(${organizationId}))`;
  const count = await tx.protocol.count({ where: { organizationId } });
  if (count >= MAX_INSTITUTION_PROTOCOLS) throw new EditorError("limit");
}

/** Creates a protocol with a generated "<base>-<random>" address, retrying if the address is taken. */
async function createWithGeneratedSlug<T>(base: string, create: (slug: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await create(suffixedSlug(base, randomSuffix()));
    } catch (e) {
      if (prismaCode(e) !== "P2002" || attempt >= 4) throw e;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * Creates a protocol from the editor: a global one (the admin picks its address) or one of the active institution
 * (address generated). Always a draft (isPublished false).
 */
export async function createProtocol(locale: string, kind: EditorScope, values: unknown): Promise<CreateResult> {
  const p = await prepare(locale, kind);
  if (isFailure(p)) return p;
  const v = await validate(p.locale, values, p.kind === "global");
  if (!v.ok) return v.failure;
  const data = v.data;
  const keys = freshKeys(data.steps);
  const steps = { create: data.steps.map((s, i) => ({ key: keys[i]!, ...stepFields(s, i + 1) })) };

  try {
    const created =
      p.kind === "global"
        ? await prisma.$transaction(async (tx) => {
            const row = await tx.protocol.create({
              data: { slug: (data as unknown as { slug: string }).slug, organizationId: null, isPublished: false, createdById: p.ctx.user.id, ...protocolFields(data), steps },
              select: { id: true, slug: true },
            });
            await writeAudit(p.ctx, "protocol.create", { type: "protocol", id: row.id }, { scope: "global", slug: row.slug, steps: keys.length }, { tx });
            return row;
          }, TX)
        : await createWithGeneratedSlug(data.titleEn, (slug) =>
            prisma.$transaction(async (tx) => {
              const { organizationId } = requireOrgScope(p.scope);
              await assertInstitutionRoom(tx, organizationId);
              const row = await tx.protocol.create({
                data: { slug, organizationId, isPublished: false, createdById: p.ctx.user.id, ...protocolFields(data), steps },
                select: { id: true, slug: true },
              });
              await writeAudit(
                p.ctx,
                "protocol.create",
                { type: "protocol", id: row.id },
                { scope: "institution", organizationId, slug: row.slug, steps: keys.length },
                { tx },
              );
              return row;
            }, TX),
          );
    revalidateProtocolPages();
    return { ok: true, id: created.id };
  } catch (e) {
    if (p.kind === "global" && prismaCode(e) === "P2002") {
      const t = await getTranslations({ locale: p.locale, namespace: "protocols.editor.errors" });
      return failure(p.locale, "slug_taken", { slug: t("slugTaken") });
    }
    return handleUnexpected(p.locale, "create", e);
  }
}

/**
 * Saves the editor: protocol fields and the whole step list in one transaction. `version` (the updatedAt the editor
 * loaded) must still be current, else "conflict" (someone else saved meanwhile). Saved steps are updated in place
 * (they keep id and key, so their history stays attached); steps the editor dropped are deleted only when they have
 * no history; new steps get readable unique keys. A step with results keeps its meaning (mandatory, critical,
 * weight, photo check: "step_locked" with field errors otherwise); its wording may change, and the audit row then
 * keeps the old wording (changedSteps[].before). Past reports show a step's current wording, so rewording such a
 * step (history.ts REPORTED_WORDING_FIELDS) needs `confirmWording: true`: without it the save changes nothing and
 * answers "wording_confirm" with the steps concerned, and the editor asks. The address never changes here.
 */
export async function saveProtocol(
  locale: string,
  kind: EditorScope,
  input: { id: string; version: string; values: unknown; confirmWording?: boolean },
): Promise<SaveResult> {
  const p = await prepare(locale, kind);
  if (isFailure(p)) return p;
  const ids = idInput.safeParse({ id: input?.id, version: input?.version });
  if (!ids.success || !ids.data.version || !isPlausibleId(ids.data.id)) return failure(p.locale, "bad_input");
  const v = await validate(p.locale, input?.values, false);
  if (!v.ok) return v.failure;
  const data = v.data;
  const { id, version } = { id: ids.data.id, version: ids.data.version };
  const lockedField = (await getTranslations({ locale: p.locale, namespace: "protocols.editor.errors" }))("lockedField");

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const current = await tx.protocol.findFirst({
        where: { AND: [{ id }, editableWhere(p.kind, p.scope)] },
        select: {
          id: true,
          slug: true,
          organizationId: true,
          updatedAt: true,
          steps: { select: { ...stepContentSelect, id: true, key: true, _count: { select: { scanResults: true, simulationResults: true, options: true } } } },
        },
      });
      if (!current) throw new EditorError("not_found");
      if (current.updatedAt.toISOString() !== version) throw new EditorError("conflict");

      const plan = planStepChanges(
        current.steps.map((s) => ({ id: s.id, key: s.key, usage: s._count })),
        data.steps.map((s) => ({ id: s.id, textEn: s.textEn })),
        newStepKey,
      );
      if (!plan.ok) throw new EditorError(plan.error === "unknown_step" ? "conflict" : "step_has_history");

      // A step with results keeps what it means (history.ts); its wording may change, and the audit row keeps the
      // old wording, so a finalised report can be traced back to the text it was assessed against.
      const savedById = new Map(current.steps.map((s) => [s.id, s]));
      const lockedErrors: Record<string, string> = {};
      const changedSteps: ChangedStep[] = [];
      /** Steps with results whose reported wording changes (1-based). */
      const reworded: number[] = [];
      plan.rows.forEach((row, index) => {
        const before = row.id ? savedById.get(row.id) : undefined;
        if (!before) return;
        // Compared the way the editor saves it (a critical step is always mandatory), so an older row that was
        // critical but not marked mandatory does not count as a change nobody made.
        const changes = changedStepFields({ ...before, isMandatory: before.isMandatory || before.isCritical }, stepFields(data.steps[index]!, index + 1));
        const locked = stepMeaningLocked(before._count);
        if (locked) for (const field of changes.meaning) lockedErrors[`steps.${index}.${field}`] = lockedField;
        if (locked && changesReportedWording(changes.wording)) reworded.push(index + 1);
        if (changes.meaning.length + changes.wording.length === 0) return;
        changedSteps.push({
          id: before.id,
          key: before.key,
          fields: [...changes.meaning, ...changes.wording],
          ...(locked && changes.wording.length > 0 ? { before: Object.fromEntries(changes.wording.map((f) => [f, before[f]])) } : {}),
        });
      });
      if (Object.keys(lockedErrors).length > 0) throw new EditorError("step_locked", lockedErrors);
      if (reworded.length > 0 && input.confirmWording !== true) throw new EditorError("wording_confirm", undefined, reworded);

      // Claim the row: a second save with the same version finds updatedAt changed and stops here.
      const claimed = await tx.protocol.updateMany({ where: { id, updatedAt: current.updatedAt }, data: protocolFields(data) });
      if (claimed.count !== 1) throw new EditorError("conflict");

      if (plan.remove.length > 0) {
        const removed = await tx.protocolStep.deleteMany({
          where: { id: { in: plan.remove }, protocolId: id, scanResults: { none: {} }, simulationResults: { none: {} }, options: { none: {} } },
        });
        if (removed.count !== plan.remove.length) throw new EditorError("step_has_history");
      }
      let created = 0;
      for (const [index, row] of plan.rows.entries()) {
        const fields = stepFields(data.steps[index]!, index + 1);
        if (row.id) {
          await tx.protocolStep.update({ where: { id: row.id }, data: fields });
        } else {
          await tx.protocolStep.create({ data: { protocolId: id, key: row.key, ...fields } });
          created += 1;
        }
      }
      await writeAudit(
        p.ctx,
        "protocol.update",
        { type: "protocol", id },
        {
          scope: p.kind,
          ...(current.organizationId ? { organizationId: current.organizationId } : {}),
          slug: current.slug,
          steps: { total: plan.rows.length, created, removed: plan.remove.length },
          ...(plan.remove.length > 0 ? { removedSteps: plan.remove.map((stepId) => ({ id: stepId, key: savedById.get(stepId)?.key ?? null })) } : {}),
          ...(changedSteps.length > 0 ? { changedSteps } : {}),
          ...(reworded.length > 0 ? { rewordedWithResults: reworded.length } : {}),
        },
        { tx },
      );
      return tx.protocol.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          slug: true,
          updatedAt: true,
          category: true,
          icon: true,
          titleAr: true,
          titleEn: true,
          summaryAr: true,
          summaryEn: true,
          descriptionAr: true,
          descriptionEn: true,
          steps: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              key: true,
              textAr: true,
              textEn: true,
              rationaleAr: true,
              rationaleEn: true,
              criteriaAr: true,
              criteriaEn: true,
              referenceLabel: true,
              referenceUrl: true,
              isMandatory: true,
              isCritical: true,
              weight: true,
              visualCheck: true,
            },
          },
        },
      });
    }, TX);
    revalidateProtocolPages();
    return { ok: true, id: saved.id, version: saved.updatedAt.toISOString(), values: protocolToEditorValues(saved) };
  } catch (e) {
    return handleUnexpected(p.locale, "save", e);
  }
}

/** Publishes or unpublishes. With `version`, refuses when the protocol changed since the editor loaded it. */
export async function setProtocolPublished(
  locale: string,
  kind: EditorScope,
  input: { id: string; version?: string; publish: boolean },
): Promise<PublishResult> {
  const p = await prepare(locale, kind);
  if (isFailure(p)) return p;
  const ids = idInput.safeParse({ id: input?.id, version: input?.version });
  if (!ids.success || typeof input.publish !== "boolean" || !isPlausibleId(ids.data.id)) return failure(p.locale, "bad_input");
  const { id, version } = ids.data;
  const publish = input.publish;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.protocol.findFirst({
        where: { AND: [{ id }, editableWhere(p.kind, p.scope)] },
        select: {
          id: true,
          slug: true,
          organizationId: true,
          isPublished: true,
          updatedAt: true,
          category: true,
          icon: true,
          titleAr: true,
          titleEn: true,
          summaryAr: true,
          summaryEn: true,
          descriptionAr: true,
          descriptionEn: true,
          steps: {
            orderBy: { order: "asc" },
            select: {
              key: true,
              textAr: true,
              textEn: true,
              rationaleAr: true,
              rationaleEn: true,
              criteriaAr: true,
              criteriaEn: true,
              referenceLabel: true,
              referenceUrl: true,
              isMandatory: true,
              isCritical: true,
              weight: true,
              visualCheck: true,
            },
          },
        },
      });
      if (!current) throw new EditorError("not_found");
      if (version && current.updatedAt.toISOString() !== version) throw new EditorError("conflict");
      if (current.isPublished === publish) return { isPublished: publish, updatedAt: current.updatedAt };
      // Only complete content goes live (the same rules as every save and the seed).
      if (publish && !protocolSchema.safeParse(current).success) throw new EditorError("invalid_input");
      const claimed = await tx.protocol.updateMany({ where: { id, updatedAt: current.updatedAt }, data: { isPublished: publish } });
      if (claimed.count !== 1) throw new EditorError("conflict");
      await writeAudit(
        p.ctx,
        publish ? "protocol.publish" : "protocol.unpublish",
        { type: "protocol", id },
        { scope: p.kind, ...(current.organizationId ? { organizationId: current.organizationId } : {}), slug: current.slug },
        { tx },
      );
      const after = await tx.protocol.findUniqueOrThrow({ where: { id }, select: { updatedAt: true, isPublished: true } });
      return { isPublished: after.isPublished, updatedAt: after.updatedAt };
    }, TX);
    revalidateProtocolPages();
    return { ok: true, isPublished: result.isPublished, version: result.updatedAt.toISOString() };
  } catch (e) {
    return handleUnexpected(p.locale, publish ? "publish" : "unpublish", e);
  }
}

const copyFields = {
  category: true,
  icon: true,
  titleAr: true,
  titleEn: true,
  summaryAr: true,
  summaryEn: true,
  descriptionAr: true,
  descriptionEn: true,
  steps: {
    orderBy: { order: "asc" },
    select: {
      key: true,
      order: true,
      textAr: true,
      textEn: true,
      rationaleAr: true,
      rationaleEn: true,
      criteriaAr: true,
      criteriaEn: true,
      referenceLabel: true,
      referenceUrl: true,
      isMandatory: true,
      isCritical: true,
      weight: true,
      visualCheck: true,
    },
  },
} satisfies Prisma.ProtocolSelect;

type CopySource = Prisma.ProtocolGetPayload<{ select: typeof copyFields }>;

/** The content of a protocol (fields + steps with their keys) as nested create data for a copy or a new version. */
function copyData(source: CopySource) {
  return {
    category: source.category,
    icon: source.icon,
    titleAr: source.titleAr,
    titleEn: source.titleEn,
    summaryAr: source.summaryAr,
    summaryEn: source.summaryEn,
    descriptionAr: source.descriptionAr,
    descriptionEn: source.descriptionEn,
    steps: { create: source.steps.map((s, i) => ({ ...s, order: i + 1 })) },
  };
}

/**
 * Institution managers: copies a PUBLISHED global protocol into the active institution as a draft (sourceProtocolId
 * keeps the link, so recommendations can fall back to the source's scenarios). Later changes to the global protocol
 * do not change the copy.
 */
export async function copyGlobalProtocol(locale: string, input: { sourceProtocolId: string }): Promise<CreateResult> {
  const p = await prepare(locale, "institution");
  if (isFailure(p)) return p;
  const sourceId = typeof input?.sourceProtocolId === "string" ? input.sourceProtocolId : "";
  if (!isPlausibleId(sourceId)) return failure(p.locale, "bad_input");

  try {
    const source = await prisma.protocol.findFirst({
      where: { id: sourceId, organizationId: null, isPublished: true },
      select: { id: true, slug: true, ...copyFields },
    });
    if (!source) return failure(p.locale, "source_unavailable");
    const { organizationId } = requireOrgScope(p.scope);
    const created = await createWithGeneratedSlug(source.slug, (slug) =>
      prisma.$transaction(async (tx) => {
        await assertInstitutionRoom(tx, organizationId);
        const row = await tx.protocol.create({
          data: { slug, organizationId, sourceProtocolId: source.id, isPublished: false, createdById: p.ctx.user.id, ...copyData(source) },
          select: { id: true, slug: true },
        });
        await writeAudit(
          p.ctx,
          "protocol.copy",
          { type: "protocol", id: row.id },
          { scope: "institution", organizationId, slug: row.slug, sourceProtocolId: source.id },
          { tx },
        );
        return row;
      }, TX),
    );
    revalidateProtocolPages();
    return { ok: true, id: created.id };
  } catch (e) {
    return handleUnexpected(p.locale, "copy", e);
  }
}

/**
 * A new version: an unpublished copy of the protocol with all its steps (new ids, same keys) and the next free
 * "<address>-v<n>" address. Past results stay with the old version; the editor then publishes the new one and
 * unpublishes the old one. Institution versions keep the global source they were copied from.
 */
export async function createProtocolVersion(locale: string, kind: EditorScope, input: { id: string }): Promise<CreateResult> {
  const p = await prepare(locale, kind);
  if (isFailure(p)) return p;
  const id = typeof input?.id === "string" ? input.id : "";
  if (!isPlausibleId(id)) return failure(p.locale, "bad_input");

  try {
    const current = await prisma.protocol.findFirst({
      where: { AND: [{ id }, editableWhere(p.kind, p.scope)] },
      select: { id: true, slug: true, organizationId: true, sourceProtocolId: true, ...copyFields },
    });
    if (!current) return failure(p.locale, "not_found");
    const { id: fromId, slug: fromSlug, organizationId, sourceProtocolId } = current;

    const created = await (async () => {
      for (let attempt = 0; ; attempt++) {
        const taken = await prisma.protocol.findMany({ where: { slug: { startsWith: versionSlugBase(fromSlug) } }, select: { slug: true } });
        const slug = nextVersionSlug(fromSlug, new Set(taken.map((t) => t.slug)));
        try {
          return await prisma.$transaction(async (tx) => {
            if (organizationId) await assertInstitutionRoom(tx, organizationId);
            const row = await tx.protocol.create({
              data: {
                slug,
                organizationId,
                sourceProtocolId,
                versionOfId: fromId,
                isPublished: false,
                createdById: p.ctx.user.id,
                ...copyData(current),
              },
              select: { id: true, slug: true },
            });
            await writeAudit(
              p.ctx,
              "protocol.version",
              { type: "protocol", id: row.id },
              { scope: p.kind, ...(organizationId ? { organizationId } : {}), slug: row.slug, fromProtocolId: fromId, fromSlug },
              { tx },
            );
            return row;
          }, TX);
        } catch (e) {
          if (prismaCode(e) !== "P2002" || attempt >= 4) throw e;
        }
      }
    })();
    revalidateProtocolPages();
    return { ok: true, id: created.id };
  } catch (e) {
    return handleUnexpected(p.locale, "version", e);
  }
}

/** Deletes a protocol that is unpublished and has no history (a draft nobody used). Everything else: unpublish. */
export async function deleteProtocolDraft(locale: string, kind: EditorScope, input: { id: string }): Promise<DeleteResult> {
  const p = await prepare(locale, kind);
  if (isFailure(p)) return p;
  const id = typeof input?.id === "string" ? input.id : "";
  if (!isPlausibleId(id)) return failure(p.locale, "bad_input");

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.protocol.findFirst({
        where: { AND: [{ id }, editableWhere(p.kind, p.scope)] },
        select: {
          id: true,
          slug: true,
          organizationId: true,
          isPublished: true,
          _count: { select: { scans: true, scenarios: true, copies: true } },
          steps: { select: { _count: { select: { scanResults: true, simulationResults: true, options: true } } } },
        },
      });
      if (!current) throw new EditorError("not_found");
      const check = canDeleteProtocol({ isPublished: current.isPublished, usage: protocolUsage(current._count, current.steps.map((s) => s._count)) });
      if (!check.ok) throw new EditorError(check.reason === "history" ? "has_history" : "published");
      // The conditions again in the delete itself, so nothing that appeared meanwhile is lost.
      const removed = await tx.protocol.deleteMany({
        where: { id, isPublished: false, scans: { none: {} }, scenarios: { none: {} }, copies: { none: {} } },
      });
      if (removed.count !== 1) throw new EditorError("has_history");
      await writeAudit(
        p.ctx,
        "protocol.delete",
        { type: "protocol", id },
        { scope: p.kind, ...(current.organizationId ? { organizationId: current.organizationId } : {}), slug: current.slug },
        { tx },
      );
    }, TX);
    revalidateProtocolPages();
    return { ok: true };
  } catch (e) {
    return handleUnexpected(p.locale, "delete", e);
  }
}
