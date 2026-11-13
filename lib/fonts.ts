import { Geist_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";

// next/font calls must be module-scope literals, so both families load and CSS :lang() picks one
// (app/globals.css). IBM Plex Sans Arabic is static on Google Fonts: weights are required.
export const fontArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const fontLatin = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-latin",
  display: "swap",
});

export const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  preload: false,
});

export const fontVariables = `${fontArabic.variable} ${fontLatin.variable} ${fontMono.variable}`;
