/**
 * E-signing status webhook (SPEC §11). Providers — and the /dev/signing
 * simulator, which exercises exactly this route — POST status callbacks here.
 *
 * Authentication: shared secret (SIGNING_WEBHOOK_SECRET) in the
 * `x-signing-secret` header, compared in constant time. All domain logic
 * lives in src/core/signing/webhook.ts; tests import { POST } directly.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { unscopedDb } from "@/lib/db";
import { processSigningEvent, signingWebhookPayload } from "@/core/signing/webhook";

export const runtime = "nodejs";

function secretMatches(provided: string | null): boolean {
  const expected = process.env.SIGNING_WEBHOOK_SECRET ?? "";
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!secretMatches(request.headers.get("x-signing-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalidJson" }, { status: 400 });
  }
  const parsed = signingWebhookPayload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalidPayload" }, { status: 400 });
  }

  const result = await processSigningEvent(unscopedDb, parsed.data);
  if (!result.ok) {
    const status = result.error === "unknownRequest" || result.error === "unknownSigner" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, requestStatus: result.requestStatus });
}
