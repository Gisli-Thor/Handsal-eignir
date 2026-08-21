"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SimulatorRequest {
  id: string;
  providerRequestId: string;
  title: string;
  status: string;
  tenantName: string;
  address: string;
  createdAtFormatted: string;
  signers: Array<{
    providerSignerId: string;
    name: string;
    kennitala: string;
    status: "PENDING" | "SIGNED" | "REJECTED";
  }>;
}

/** Plays the signing provider: buttons fire the real webhook route. Dev tool
 * — deliberately not translated. */
export function SimulatorClient({
  requests,
  webhookSecret,
}: {
  requests: SimulatorRequest[];
  webhookSecret: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);

  function fire(providerRequestId: string, providerSignerId: string, event: "signed" | "rejected") {
    startTransition(async () => {
      try {
        const response = await fetch("/api/webhooks/signing", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-signing-secret": webhookSecret,
          },
          body: JSON.stringify({ providerRequestId, providerSignerId, event }),
        });
        const body = await response.json();
        setLastResult(
          response.ok
            ? `Webhook OK → request status: ${body.requestStatus}`
            : `Webhook ${response.status}: ${body.error}`,
        );
      } catch (error) {
        setLastResult(`Webhook failed: ${String(error)}`);
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          E-signing simulator (dev)
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Plays the external signing provider: sign/reject buttons POST the real
          webhook at <code>/api/webhooks/signing</code>.
        </p>
        {lastResult ? (
          <p className="bg-muted mt-2 rounded-md px-3 py-1.5 font-mono text-xs">{lastResult}</p>
        ) : null}
      </div>

      {requests.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-6 py-16 text-center text-sm">
          No open signing requests. Create one from a listing&apos;s signing panel.
        </p>
      ) : (
        requests.map((request) => (
          <Card key={request.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {request.title}
                <Badge variant="secondary">{request.status}</Badge>
              </CardTitle>
              <p className="text-muted-foreground text-xs">
                {request.tenantName} · {request.address} · {request.createdAtFormatted}
              </p>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2">
                {request.signers.map((signer) => (
                  <li
                    key={signer.providerSignerId}
                    className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
                  >
                    <div className="grid">
                      <span className="text-sm font-medium">{signer.name}</span>
                      <span className="text-muted-foreground text-xs">kt. {signer.kennitala}</span>
                    </div>
                    <Badge
                      variant={signer.status === "PENDING" ? "outline" : "default"}
                      className={
                        signer.status === "SIGNED"
                          ? "bg-emerald-600 text-white"
                          : signer.status === "REJECTED"
                            ? "bg-red-600 text-white"
                            : undefined
                      }
                    >
                      {signer.status}
                    </Badge>
                    {signer.status === "PENDING" ? (
                      <span className="ml-auto flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            fire(request.providerRequestId, signer.providerSignerId, "signed")
                          }
                        >
                          Sign
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={pending}
                          onClick={() =>
                            fire(request.providerRequestId, signer.providerSignerId, "rejected")
                          }
                        >
                          Reject
                        </Button>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
