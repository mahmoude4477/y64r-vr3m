import * as z from "zod";
import {
  AREA_LABEL_MAX,
  ID_PATTERN,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_SCAN,
  SCAN_NOTES_MAX,
  STEP_NOTE_MAX,
  UPLOAD_TYPES,
} from "./constants";

/**
 * Request bodies of /api/scans/** (validated on the server; the new-scan form uses newScanFormSchema with the same
 * limits). No inline messages (CONVENTIONS 9): the form translates through useZodErrorMap.
 */

const id = z.string().regex(ID_PATTERN);

/**
 * Free text as it is stored: PostgreSQL `text` cannot hold U+0000, so a pasted NUL character would fail the write (a
 * 500 and an error log instead of a validation message). It is removed before the trim and the length check; every
 * other character, line breaks included, is kept.
 */
export function freeText(opts: { min?: number; max: number }) {
  const rest = z.string().trim().max(opts.max);
  return z
    .string()
    .transform((s) => s.replaceAll("\u0000", ""))
    .pipe(opts.min ? rest.min(opts.min) : rest);
}

/** POST /api/scans/photos/sign */
export const signPhotoSchema = z.object({
  contentType: z.enum(UPLOAD_TYPES),
  size: z.number().int().min(1).max(MAX_PHOTO_BYTES),
});

/** POST /api/scans/photos (confirm an upload). The key is checked with isOwnPhotoKey on the server. */
export const confirmPhotoSchema = z.object({
  key: z.string().min(1).max(400),
  width: z.number().int().min(1).max(20_000),
  height: z.number().int().min(1).max(20_000),
});

/** POST /api/scans (create the draft scan and attach the uploaded photos). */
export const createScanSchema = z.object({
  protocolId: id,
  teamId: id.nullable().optional(),
  areaLabel: freeText({ min: 1, max: AREA_LABEL_MAX }),
  photoIds: z
    .array(id)
    .min(1)
    .max(MAX_PHOTOS_PER_SCAN)
    .refine((ids) => new Set(ids).size === ids.length, { params: { i18n: "invalidOption" } }),
});
export type CreateScanInput = z.infer<typeof createScanSchema>;

/** The details part of the new-scan form ("" = no department). */
export const newScanFormSchema = z.object({
  protocolId: z.string().min(1),
  teamId: z.string(),
  areaLabel: freeText({ min: 1, max: AREA_LABEL_MAX }),
});
export type NewScanFormValues = z.infer<typeof newScanFormSchema>;

// Review and finalisation (Server Actions in lib/scans/actions.ts). Free text is trimmed; "" clears it.

export const FINAL_VERDICTS = ["compliant", "non_compliant", "not_applicable"] as const;

/** One step's decision and/or note. A missing key leaves that field as it is; `verdict: null` clears the decision. */
export const saveStepSchema = z
  .object({
    scanId: id,
    stepId: id,
    verdict: z.enum(FINAL_VERDICTS).nullable().optional(),
    note: freeText({ max: STEP_NOTE_MAX }).optional(),
  })
  .refine((v) => v.verdict !== undefined || v.note !== undefined, { params: { i18n: "required" } });
export type SaveStepInput = z.infer<typeof saveStepSchema>;

export const scanNotesSchema = z.object({ scanId: id, notes: freeText({ max: SCAN_NOTES_MAX }) });
export type ScanNotesInput = z.infer<typeof scanNotesSchema>;

/** The notes form on the review screen (same limit as the server). */
export const scanNotesFormSchema = z.object({ notes: freeText({ max: SCAN_NOTES_MAX }) });
export type ScanNotesFormValues = z.infer<typeof scanNotesFormSchema>;

export const scanIdSchema = z.object({ scanId: id });
