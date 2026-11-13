import { streamDebrief } from "@/lib/ai/debrief";
import { scopeOf } from "@/lib/authz";
import { log } from "@/lib/log";
import { authorizeApi } from "@/lib/session";
import { debriefContext, saveDebrief, storedDebriefResponse } from "@/lib/simulations/debrief";
import { readJsonBody } from "@/lib/http";
import { debriefRequestSchema } from "@/lib/simulations/schemas";

/**
 * POST /api/simulations/attempts/<id>/debrief  { locale }  (useCompletion from @ai-sdk/react; its `prompt` is ignored)
 * Streams the owner's short AI debrief of a completed attempt in that language and stores it when it finishes; a
 * stored one is streamed back without a model call. Failures answer JSON { error } with the status from
 * lib/ai/errors.ts (503 not_configured, 429 daily_limit / too_many_requests, …), 401/403 from authorizeApi,
 * 404 when the attempt is not the caller's own completed attempt, 422 when it could not be assessed. The body must be
 * application/json (415) of at most 1 KiB (413), read with a bounded reader (lib/http.ts).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/simulations/attempts/[id]/debrief">) {
  const auth = await authorizeApi();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!id || id.length > 64) return Response.json({ error: "not_found" }, { status: 404 });

  const body = await readJsonBody(request);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = debriefRequestSchema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });
  const { locale } = parsed.data;

  const scope = scopeOf(auth.ctx);
  const context = await debriefContext(scope, id, locale);
  if (!context.ok) return Response.json({ error: context.error }, { status: context.status });
  if (context.stored) return storedDebriefResponse(context.stored);

  const result = await streamDebrief({
    ...context.facts,
    userId: scope.userId,
    organizationId: context.organizationId,
    attemptId: id,
    abortSignal: request.signal,
    onComplete: (text) => saveDebrief(scope, id, locale, text),
  });
  if (!result.ok) {
    if (result.code !== "not_configured") log.warn("simulations.debrief.failed", { errorCode: result.code });
    return Response.json({ error: result.code }, { status: result.status });
  }
  return result.response;
}
