import { notFound } from "next/navigation";
import { unscopedDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { SimulatorClient, type SimulatorRequest } from "./simulator-client";

export const dynamic = "force-dynamic";

/**
 * Dev-only e-signing simulator (SPEC §11): lists open signing requests with
 * per-signer sign/reject buttons that fire the REAL webhook
 * (/api/webhooks/signing) — the whole flow is demonstrable end-to-end.
 *
 * Cross-tenant listing via unscopedDb is deliberate: this is a development
 * tool playing the role of the external signing provider, which sees all
 * requests regardless of tenant. Gated to development (or ALLOW_DEV_TOOLS).
 */
export default async function SigningSimulatorPage() {
  const enabled =
    process.env.NODE_ENV === "development" || process.env.ALLOW_DEV_TOOLS === "true";
  if (!enabled) notFound();

  const requests = await unscopedDb.signingRequest.findMany({
    where: { status: { in: ["SENT", "PARTIALLY_SIGNED"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      signers: true,
      listing: { include: { property: true, tenant: { select: { name: true } } } },
    },
  });

  const items: SimulatorRequest[] = requests.map((request) => ({
    id: request.id,
    providerRequestId: request.providerRequestId ?? "",
    title: request.title,
    status: request.status,
    tenantName: request.listing.tenant.name,
    address: request.listing.property
      ? `${request.listing.property.gotuheiti} ${request.listing.property.husnumer}`
      : request.listingId,
    createdAtFormatted: formatDateTime(request.createdAt),
    signers: request.signers.map((signer) => ({
      providerSignerId: signer.providerSignerId,
      name: signer.name,
      kennitala: signer.kennitala,
      status: signer.status,
    })),
  }));

  return (
    <SimulatorClient
      requests={items}
      webhookSecret={process.env.SIGNING_WEBHOOK_SECRET ?? ""}
    />
  );
}
