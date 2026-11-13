"use server";

// Server Actions of the platform-admin scenario editor (/admin/scenarios). Each one: checks the locale, authorises a
// platform admin (no redirect: a stable error code the UI translates), validates the input with the same rules as the
// browser form (./content.ts), then calls ./mutations.ts, which re-checks what depends on the database inside a
// transaction and writes the audit row. Errors are logged without content (CONVENTIONS 8).
// Only async functions are exported from this file: every export is a Server Action endpoint.
import { hasLocale, type Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { refresh, revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import * as z from "zod";
import { routing } from "@/i18n/routing";
import { log } from "@/lib/log";
import type { AuthContext } from "@/lib/session";
import { zodErrorMap } from "@/lib/zod-i18n";
import { platformAdminOrNull } from "./authorize";
import { createScenarioSchema, type IssueKey, scenarioContentSchema } from "./content";
import { withScenarioIssues } from "./error-map";
import {
  type AdminError,
  createScenario,
  createVersion,
  deleteDraft,
  eligibleProtocolSteps,
  publishScenario,
  saveScenario,
  scenarioOwner,
  unpublishScenario,
} from "./mutations";

export type ActionError = AdminError | "bad_locale" | "forbidden" | "invalid_input" | "failed";
/** A field problem from the server's validation: the dotted form path ("stages.0.options.1.stepId") and its text. */
export type FieldIssue = { path: string; message: string };
export type ActionFailure = { ok: false; error: ActionError; issues?: IssueKey[]; fieldIssues?: FieldIssue[] };

const idSchema = z.string().trim().min(1).max(64);
const idInput = z.object({ id: idSchema });
const saveInput = z.object({ id: idSchema, expectedUpdatedAt: z.iso.datetime(), content: z.unknown() });

async function run<T>(
  name: string,
  locale: string,
  work: (ctx: AuthContext, locale: Locale) => Promise<T | ActionFailure>,
): Promise<T | ActionFailure> {
  if (!hasLocale(routing.locales, locale)) return { ok: false, error: "bad_locale" };
  try {
    const ctx = await platformAdminOrNull();
    if (!ctx) return { ok: false, error: "forbidden" };
    return await work(ctx, locale);
  } catch (err) {
    unstable_rethrow(err);
    log.error("simulations.admin.action.failed", { action: name, err });
    return { ok: false, error: "failed" };
  }
}

async function errorMapFor(locale: Locale) {
  const [tv, ti] = await Promise.all([
    getTranslations({ locale, namespace: "validation" }),
    getTranslations({ locale, namespace: "simulations.admin.issues" }),
  ]);
  return withScenarioIssues(zodErrorMap(tv, locale), (key) => ti(key));
}

function fieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.slice(0, 50).map((i) => ({ path: i.path.join("."), message: i.message }));
}

/**
 * The list shows fresh data on the next visit (the pages are dynamic; this also drops the router's copies of the
 * pages visited before, Next 16 revalidatePath notes).
 */
function revalidateAdmin(locale: Locale) {
  revalidatePath(`/${locale}/admin/scenarios`);
}

/** Creates an unpublished draft (meta only); the editor adds the stages. */
export async function createScenarioAction(locale: string, input: unknown): Promise<{ ok: true; id: string } | ActionFailure> {
  return run("create", locale, async (ctx, l) => {
    const parsed = createScenarioSchema.safeParse(input, { error: await errorMapFor(l) });
    if (!parsed.success) return { ok: false, error: "invalid_input", fieldIssues: fieldIssues(parsed.error) };
    const result = await createScenario(ctx, parsed.data);
    if (result.ok) revalidateAdmin(l);
    return result;
  });
}

/** Saves the whole content of a scenario that nobody has attempted yet. */
export async function saveScenarioAction(locale: string, input: unknown): Promise<{ ok: true; updatedAt: string } | ActionFailure> {
  return run("save", locale, async (ctx, l) => {
    const outer = saveInput.safeParse(input);
    if (!outer.success) return { ok: false, error: "invalid_input" };
    const owner = await scenarioOwner(outer.data.id);
    if (!owner) return { ok: false, error: "not_found" };
    const protocolId = (outer.data.content as { protocolId?: unknown } | null)?.protocolId;
    const steps = typeof protocolId === "string" ? await eligibleProtocolSteps(protocolId, owner.organizationId) : null;
    if (typeof protocolId === "string" && !steps) return { ok: false, error: "protocol_not_allowed" };
    const parsed = scenarioContentSchema((pid) => (pid === protocolId && steps ? steps : undefined)).safeParse(outer.data.content, {
      error: await errorMapFor(l),
    });
    if (!parsed.success) return { ok: false, error: "invalid_input", fieldIssues: fieldIssues(parsed.error) };
    const result = await saveScenario(ctx, { id: outer.data.id, expectedUpdatedAt: outer.data.expectedUpdatedAt, content: parsed.data });
    if (result.ok) {
      revalidateAdmin(l);
      refresh();
    }
    return result;
  });
}

export async function publishScenarioAction(
  locale: string,
  input: unknown,
): Promise<{ ok: true; replaced: string[]; abandoned: number } | ActionFailure> {
  return run("publish", locale, async (ctx, l) => {
    const parsed = idInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const result = await publishScenario(ctx, parsed.data.id);
    if (result.ok) {
      revalidateAdmin(l);
      refresh();
    }
    return result;
  });
}

export async function unpublishScenarioAction(locale: string, input: unknown): Promise<{ ok: true } | ActionFailure> {
  return run("unpublish", locale, async (ctx, l) => {
    const parsed = idInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const result = await unpublishScenario(ctx, parsed.data.id);
    if (result.ok) {
      revalidateAdmin(l);
      refresh();
    }
    return result;
  });
}

/** Copies the scenario into its next version (or returns the draft of it that already exists). */
export async function createVersionAction(
  locale: string,
  input: unknown,
): Promise<{ ok: true; id: string; version: number; existing: boolean } | ActionFailure> {
  return run("version", locale, async (ctx, l) => {
    const parsed = idInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const result = await createVersion(ctx, parsed.data.id);
    if (result.ok) revalidateAdmin(l);
    return result;
  });
}

/** Deletes an unpublished draft that nobody has attempted. */
export async function deleteDraftAction(locale: string, input: unknown): Promise<{ ok: true } | ActionFailure> {
  return run("delete", locale, async (ctx, l) => {
    const parsed = idInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const result = await deleteDraft(ctx, parsed.data.id);
    if (result.ok) revalidateAdmin(l);
    return result;
  });
}
