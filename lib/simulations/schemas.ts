import * as z from "zod";

/** Input schemas of the simulation server actions and the debrief route (no inline messages: CONVENTIONS 9). */

const id = z.string().trim().min(1).max(64);

export const startAttemptSchema = z.object({ scenarioId: id });

export const answerStageSchema = z.object({
  attemptId: id,
  stageId: id,
  // A stage has a handful of options; 20 is a generous ceiling against oversized payloads.
  optionIds: z.array(id).min(1).max(20),
});

export const completeAttemptSchema = z.object({ attemptId: id });

/** useCompletion posts { prompt, ...body }: only the locale matters (the facts are loaded on the server). */
export const debriefRequestSchema = z.object({ locale: z.enum(["ar", "en"]) });

export type StartAttemptInput = z.infer<typeof startAttemptSchema>;
export type AnswerStageInput = z.infer<typeof answerStageSchema>;
export type CompleteAttemptInput = z.infer<typeof completeAttemptSchema>;
