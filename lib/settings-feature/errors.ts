// Results of the /settings Server Actions (client-safe: the client components import these types and keys).

export type SettingsErrorCode =
  | "bad_locale"
  | "invalid_input"
  | "too_many_requests"
  | "impersonating"
  | "session_not_found"
  | "current_session"
  | "session_expired"
  | "failed";

/** settings.errors.* key for each code. */
export const SETTINGS_ERROR_KEY = {
  bad_locale: "generic",
  invalid_input: "invalidInput",
  too_many_requests: "tooManyRequests",
  impersonating: "impersonating",
  session_not_found: "sessionNotFound",
  current_session: "currentSession",
  session_expired: "sessionExpired",
  failed: "generic",
} as const satisfies Record<SettingsErrorCode, string>;

export type SettingsErrorKey = (typeof SETTINGS_ERROR_KEY)[SettingsErrorCode];

export type SettingsFailure = {
  ok: false;
  error: SettingsErrorCode;
  /** Already translated into the locale the action was called with. */
  message: string;
  /** error === "invalid_input": translated messages per field. */
  fieldErrors?: Partial<Record<string, string[]>>;
};

export type SettingsResult = { ok: true } | SettingsFailure;
