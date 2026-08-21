// NOTE: no "server-only" marker — the seed script (tsx) and integration tests
// (vitest) import this module outside the Next.js server runtime.
/**
 * PDF font registration (M4). The bundled Helvetica would render Icelandic
 * (WinAnsi covers ð/þ/æ), but we embed Noto Sans for consistent branding and
 * proper bold pairs.
 *
 * Registration quirks:
 *  - the Font registry must come from the SAME module instance that renders
 *    (CJS/ESM dual copies of @react-pdf/renderer have separate FontStores),
 *    so registerPdfFonts receives the dynamically imported module;
 *  - fonts are loaded from public/fonts via fs and registered as base64 data
 *    URIs — @react-pdf's font resolver misparses Windows absolute paths
 *    (`C:\…` looks like a URL protocol);
 *  - the default hyphenation callback is English and mangles Icelandic words,
 *    so hyphenation is disabled.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export const PDF_FONT_FAMILY = "Noto Sans";

const registeredStores = new WeakSet<object>();

function fontDataUri(filename: string): string {
  const file = readFileSync(path.join(process.cwd(), "public", "fonts", filename));
  return `data:font/ttf;base64,${file.toString("base64")}`;
}

type FontRegistry = typeof import("@react-pdf/renderer").Font;

/** Idempotent per module instance — call with the imported module's Font. */
export function registerPdfFonts(font: FontRegistry): void {
  if (registeredStores.has(font)) return;
  font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: fontDataUri("NotoSans-Regular.ttf"), fontWeight: "normal" },
      { src: fontDataUri("NotoSans-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  font.registerHyphenationCallback((word) => [word]);
  registeredStores.add(font);
}
