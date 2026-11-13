// The address being verified / reset is kept in sessionStorage between auth steps instead of the URL
// (no personal data in query strings, logs or Referer headers). Browser-only.
const KEY = "waqaya.pendingEmail";

export function savePendingEmail(email: string) {
  try {
    sessionStorage.setItem(KEY, email);
  } catch {
    // private mode / storage disabled: the next step asks for the email again
  }
}

export function readPendingEmail(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearPendingEmail() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
