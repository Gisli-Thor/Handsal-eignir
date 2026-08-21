// NOTE: no "server-only" marker — the seed script (tsx) and integration tests
// (vitest) import this module outside the Next.js server runtime.
/**
 * Central PDF render entry: dynamically imports @react-pdf/renderer (kept out
 * of edge/client graphs and off the cold path), registers fonts on that same
 * module instance, and renders a document element to a Buffer.
 */
import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { registerPdfFonts } from "@/lib/pdf/fonts";

export async function renderPdf(element: ReactElement): Promise<Buffer> {
  const reactPdf = await import("@react-pdf/renderer");
  registerPdfFonts(reactPdf.Font);
  // Our wrapper components render a <Document> but carry their own props —
  // the DocumentProps constraint is about the rendered tree, not the wrapper.
  return Buffer.from(
    await reactPdf.renderToBuffer(element as ReactElement<DocumentProps>),
  );
}
