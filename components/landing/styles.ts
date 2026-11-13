/** Large call-to-action link (a real link styled as a button: CONVENTIONS 9), next to buttonVariants({ size: "lg" }). */
export const CTA_CLASS = "h-11 gap-2 rounded-xl px-5 text-base";

/**
 * Keyboard focus on the landing's own text links (the hero's phone-only "sign in"): a solid 2 px outline in the ring
 * colour, 2 px clear of the link. The 50 % halo the app uses (`ring-ring/50`) is only 1.9:1 against the page in light
 * mode and 2.7:1 in dark, under the 3:1 WCAG 2.2 1.4.11 asks of a focus indicator (landing review r2); the full ring
 * colour is 3.7:1 and 7.3:1. Buttons (buttonVariants) turn their border to the full ring colour instead.
 *
 * The sticky header's clearance (anchor jumps and focus scrolling) and print colours are site-wide rules in
 * app/globals.css (`scroll-padding-top`, `print-color-adjust`).
 */
export const LINK_FOCUS_CLASS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring";
