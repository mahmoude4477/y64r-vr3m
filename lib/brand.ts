// Brand colours that live OUTSIDE the CSS theme (browser chrome, web manifest, generated images, e-mail).
// Pure constants: safe in next.config, route handlers, scripts and client code. Keep in step with
// app/globals.css (--background light/dark) and the deck navy.

/** Browser UI colour (<meta name="theme-color">) per colour scheme: the page background. */
export const THEME_COLOR = { light: "#fbfdfd", dark: "#06141b" } as const;

/** Deck navy: manifest background/theme colour, OG image and icon background, e-mail header. */
export const BRAND_NAVY = "#06141b";

/** Deck cyan: the name on navy (OG image, e-mail header). */
export const BRAND_CYAN = "#5fd0e3";
