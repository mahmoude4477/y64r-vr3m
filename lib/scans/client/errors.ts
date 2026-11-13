/**
 * API error codes -> message keys (pure, unit-tested): scans.errors.*, except the service states that every feature
 * shares (SHARED_STATE_KEYS: common.states.*, the same text ServiceOffAlert shows). Unknown codes fall back to
 * "generic", so a new server code never shows a raw identifier to the user. Components translate with
 * useScanErrorText (components/scans/use-scan-error-text.ts).
 */
export const SCAN_ERROR_KEYS = [
  "network",
  "unauthorized",
  "forbidden",
  "storageOff",
  "aiOff",
  "aiLimit",
  "aiBusy",
  "slowDown",
  "refused",
  "timeout",
  "aiFailed",
  "invalidPhoto",
  "photoTooLarge",
  "unsupportedImage",
  "uploadFailed",
  "photosUnavailable",
  "protocolNotFound",
  "teamNotFound",
  "notFound",
  "alreadyAnalyzed",
  "analysisRunning",
  "noVisualSteps",
  "storageFailed",
  "generic",
] as const;
export type ScanErrorKey = (typeof SCAN_ERROR_KEYS)[number];

/** Keys whose text is common.states.* (not repeated in scans.errors). */
export const SHARED_STATE_KEYS = ["storageOff", "aiOff", "aiLimit", "aiBusy"] as const satisfies readonly ScanErrorKey[];
export type SharedStateKey = (typeof SHARED_STATE_KEYS)[number];

export function isSharedStateKey(key: ScanErrorKey): key is SharedStateKey {
  return (SHARED_STATE_KEYS as readonly string[]).includes(key);
}

const MAP: Record<string, ScanErrorKey> = {
  network: "network",
  unauthorized: "unauthorized",
  must_change_password: "unauthorized",
  forbidden: "forbidden",
  forbidden_origin: "forbidden",
  forbidden_key: "forbidden",
  storage_off: "storageOff",
  not_configured: "aiOff",
  daily_limit: "aiLimit",
  too_many_requests: "aiBusy",
  rate_limited: "aiBusy",
  overloaded: "aiBusy",
  slow_down: "slowDown",
  refused: "refused",
  timeout: "timeout",
  truncated: "aiFailed",
  invalid_output: "aiFailed",
  bad_request: "aiFailed",
  config: "aiFailed",
  unknown: "aiFailed",
  invalid_photo: "invalidPhoto",
  photo_too_large: "photoTooLarge",
  unsupported: "unsupportedImage",
  encode_failed: "unsupportedImage",
  upload_failed: "uploadFailed",
  not_uploaded: "uploadFailed",
  photo_conflict: "uploadFailed",
  photos_unavailable: "photosUnavailable",
  protocol_not_found: "protocolNotFound",
  protocol_empty: "protocolNotFound",
  team_not_found: "teamNotFound",
  not_found: "notFound",
  already_analyzed: "alreadyAnalyzed",
  finalized: "alreadyAnalyzed",
  analysis_running: "analysisRunning",
  no_visual_steps: "noVisualSteps",
  no_photos: "invalidPhoto",
  storage_failed: "storageFailed",
};

export function scanErrorKey(code: string | null | undefined): ScanErrorKey {
  return (code && MAP[code]) || "generic";
}

/** AI failures after which "continue without AI" is the way forward (retrying now cannot help). */
export function aiGaveUp(code: string): boolean {
  return ["not_configured", "daily_limit", "refused", "no_visual_steps", "invalid_photo"].includes(code);
}
