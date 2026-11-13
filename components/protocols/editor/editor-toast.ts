import type { ExternalToast } from "sonner";

/**
 * Options of every editor toast: at the top of the screen. The app's toasts sit at the bottom, which on a phone is
 * exactly where the editor's sticky save bar is; a toast there would hide the Save button while it is shown.
 */
export const EDITOR_TOAST = { position: "top-center" } as const satisfies ExternalToast;
