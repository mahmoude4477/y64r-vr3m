// Shared classes of the org and settings dialogs.

/**
 * DialogContent of a form dialog: scrolls inside the screen, and its single grid column may shrink below the width of
 * a long unbreakable line (a long name in a `truncate` span). Without minmax(0,1fr) the implicit grid column takes the
 * min-content width of that line and the dialog grows wider than a 390 px screen, cutting its start side in Arabic.
 */
export const DIALOG_CONTENT = "max-h-[calc(100svh-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg";

/**
 * A DialogFooter that stays in view while the dialog body scrolls (phones): the main action is never below the fold.
 * The background is an opaque copy of the footer's own muted tint, so scrolled content does not show through. Mixed
 * in oklab: in oklch the light popover (pure white, no hue) lost the hue and the footer came out pink (R2-UX-5).
 */
export const STICKY_FOOTER = "sticky bottom-0 z-10 bg-[color-mix(in_oklab,var(--muted)_50%,var(--popover))]";

/** Small buttons stay at least 32 px tall on phones (CONVENTIONS 9 tap targets). */
export const TAP_SM = "max-sm:h-8";
