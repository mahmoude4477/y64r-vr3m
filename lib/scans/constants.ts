/**
 * Scan constants that Client Components need too. lib/storage.ts and lib/ai/analyze-scan.ts are server-only, so the
 * values the browser checks before an upload live here; constants.test.ts keeps them equal to the server's.
 */

export const SCAN_STATUSES = ["draft", "analyzing", "review", "finalized", "failed"] as const;
export type ScanStatusValue = (typeof SCAN_STATUSES)[number];

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevelValue = (typeof RISK_LEVELS)[number];

/** = lib/storage.ts MAX_PHOTO_BYTES (the sign route and presignPhotoUpload enforce it). */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
/** = lib/storage.ts MAX_PHOTOS_PER_SCAN and lib/ai/analyze-scan.ts MAX_SCAN_PHOTOS. */
export const MAX_PHOTOS_PER_SCAN = 4;
/** = lib/storage.ts PHOTO_TYPES (what Claude vision accepts). preparePhoto always produces image/jpeg. */
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Scan.areaLabel: free text typed by the examiner ("Room 12 sink"). */
export const AREA_LABEL_MAX = 120;

export const SCANS_PAGE_SIZE = 20;
/** Free-text search on the area label. */
export const SEARCH_MAX = 80;

/** Row ids (cuid) and Better Auth ids: letters, digits, "_" and "-". */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** A scan left in "analyzing" longer than this belongs to a crashed request: it may be analysed again. */
export const ANALYSIS_STALE_MS = 5 * 60 * 1000;

/** Statuses in which the examiner reviews (answers, overrides, notes, finalise, delete). A stale "analyzing" counts as failed. */
export const REVIEWABLE_STATUSES = ["draft", "review", "failed"] as const satisfies readonly ScanStatusValue[];

/** = lib/ai/analyze-scan.ts REVIEW_BELOW: an AI verdict under this confidence is flagged for the examiner. */
export const REVIEW_BELOW = 0.6;
/** At or above this confidence the UI calls an AI verdict "high confidence". */
export const HIGH_CONFIDENCE = 0.8;

/** ScanStepResult.note: the examiner's note on one step. */
export const STEP_NOTE_MAX = 500;
/** Scan.notes: the examiner's notes on the whole scan (shown in the report). */
export const SCAN_NOTES_MAX = 2000;
