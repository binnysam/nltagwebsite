/**
 * NLTAG self-hosted fonts (Phase 1 §4.1). All SIL OFL — licences in ./files.
 *
 * Each Tamil family is split into a Tamil-range face and a Latin-range face (same typeface),
 * mirroring Google Fonts' unicode-range subsetting so digits and "NECK" inside Tamil text
 * render in the family's own Latin glyphs, exactly as on the approved board.
 *
 * Tamil-range faces disable next/font's Arial fallback: that fallback has no unicode-range
 * and would otherwise capture Latin characters before the Latin-range face.
 *
 * Exposed as CSS variables (--nf-*) and composed into the approved stacks in
 * ../tokens/component-tokens.css. Components never reference --nf-* directly.
 */
import localFont from "next/font/local";

// next/font requires literal options, so the unicode ranges are written out in each call:
// Tamil  = U+0964-0965,U+0B82-0BFA,U+200C-200D,U+20B9,U+25CC
// Latin  = Google Fonts "latin" subset range.

// Anek Tamil — Tamil display, 300 (≥ 32px) and 400 (h1–h3, schedule names, card titles)
const anekTa = localFont({
  src: [
    { path: "./files/anek-tamil-tamil-300-normal.woff2", weight: "300" },
    { path: "./files/anek-tamil-tamil-400-normal.woff2", weight: "400" },
  ],
  variable: "--nf-anek-ta",
  display: "swap",
  preload: true, // Phase 3: above-the-fold Tamil faces (hero h1, header, body) — prevents a font-swap layout shift on /ta
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0964-0965,U+0B82-0BFA,U+200C-200D,U+20B9,U+25CC" }],
});
const anekLatin = localFont({
  src: [
    { path: "./files/anek-tamil-latin-300-normal.woff2", weight: "300" },
    { path: "./files/anek-tamil-latin-400-normal.woff2", weight: "400" },
  ],
  variable: "--nf-anek-latin",
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

// Noto Sans Tamil — Tamil body 400/500
const notoSansTa = localFont({
  src: [
    { path: "./files/noto-sans-tamil-tamil-400-normal.woff2", weight: "400" },
    { path: "./files/noto-sans-tamil-tamil-500-normal.woff2", weight: "500" },
  ],
  variable: "--nf-noto-sans-ta",
  display: "swap",
  preload: true, // Phase 3: above-the-fold Tamil faces (hero h1, header, body) — prevents a font-swap layout shift on /ta
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0964-0965,U+0B82-0BFA,U+200C-200D,U+20B9,U+25CC" }],
});
const notoSansLatin = localFont({
  src: [
    { path: "./files/noto-sans-tamil-latin-400-normal.woff2", weight: "400" },
    { path: "./files/noto-sans-tamil-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--nf-noto-sans-latin",
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

// Noto Serif Tamil — scripture (verse card only)
const notoSerifTa = localFont({
  src: [{ path: "./files/noto-serif-tamil-tamil-400-normal.woff2", weight: "400" }],
  variable: "--nf-noto-serif-ta",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0964-0965,U+0B82-0BFA,U+200C-200D,U+20B9,U+25CC" }],
});
const notoSerifLatin = localFont({
  src: [{ path: "./files/noto-serif-tamil-latin-400-normal.woff2", weight: "400" }],
  variable: "--nf-noto-serif-latin",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

// Inter Tight — English display 300/400/500 (wordmark uses 500)
const interTight = localFont({
  src: [
    { path: "./files/inter-tight-latin-300-normal.woff2", weight: "300" },
    { path: "./files/inter-tight-latin-400-normal.woff2", weight: "400" },
    { path: "./files/inter-tight-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--nf-inter-tight",
  display: "swap",
  preload: true,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

// Inter — English body 400/500 (also UI labels on Tamil pages: EN switch, chips)
const inter = localFont({
  src: [
    { path: "./files/inter-latin-400-normal.woff2", weight: "400" },
    { path: "./files/inter-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--nf-inter",
  display: "swap",
  preload: true,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

// Newsreader — English scripture (verse card only)
const newsreader = localFont({
  src: [{ path: "./files/newsreader-latin-400-normal.woff2", weight: "400" }],
  variable: "--nf-newsreader",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

/** Apply to <html>. Declares every --nf-* variable; loads nothing until a face is used. */
export const fontVariables = [
  anekTa, anekLatin, notoSansTa, notoSansLatin, notoSerifTa, notoSerifLatin, interTight, inter, newsreader,
]
  .map((f) => f.variable)
  .join(" ");
