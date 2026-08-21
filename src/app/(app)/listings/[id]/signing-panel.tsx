"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, PenLine, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  cancelSigningRequestAction,
  createSigningRequestAction,
  type SigningActionState,
} from "../signing-actions";

export interface SigningRequestItem {
  id: string;
  title: string;
  docType: string;
  status: "DRAFT" | "SENT" | "PARTIALLY_SIGNED" | "SIGNED" | "REJECTED" | "EXPIRED" | "CANCELLED";
  createdAtFormatted: string;
  signers: Array<{ name: string; kennitala: string; status: "PENDING" | "SIGNED" | "REJECTED" }>;
  signedDownloadUrl: string | null;
}

export interface SignerCandidate {
  key: string;
  name: string;
  kennitala: string | null;
  email: string | null;
  phone: string | null;
  roleLabel: string;
}

export interface PdfDocumentOption {
  id: string;
  title: string;
}

const REQUEST_TONE: Record<SigningRequestItem["status"], string> = {
  DRAFT: "",
  SENT: "",
  PARTIALLY_SIGNED: "bg-amber-500 text-white",
  SIGNED: "bg-emerald-600 text-white",
  REJECTED: "bg-red-600 text-white",
  EXPIRED: "",
  CANCELLED: "",
};

export function SigningPanel({
  listingId,
  requests,
  hasAcceptedOffer,
  pdfDocuments,
  signerCandidates,
  canManage,
}: {
  listingId: string;
  requests: SigningRequestItem[];
  hasAcceptedOffer: boolean;
  pdfDocuments: PdfDocumentOption[];
  signerCandidates: SignerCandidate[];
  canManage: boolean;
}) {
  const t = useTranslations("signing");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [source, setSource] = useState<string>("");
  const [selectedSigners, setSelectedSigners] = useState<Set<string>>(new Set());

  function report(result: SigningActionState, successKey: string) {
    if (result?.error) {
      const key =
        result.error === "noAcceptedOffer"
          ? "errors.noAcceptedOffer"
          : result.error === "invalidKennitala"
            ? "errors.invalidKennitala"
            : result.error === "renderFailed"
              ? "errors.renderFailed"
              : null;
      toast.error(key ? t(key) : tCommon("errorOccurred"));
    } else {
      toast.success(t(successKey));
    }
  }

  function create() {
    if (!source || selectedSigners.size === 0) return;
    const signers = signerCandidates
      .filter((candidate) => selectedSigners.has(candidate.key) && candidate.kennitala)
      .map((candidate) => ({
        name: candidate.name,
        kennitala: candidate.kennitala!,
        email: candidate.email ?? undefined,
        phone: candidate.phone ?? undefined,
      }));
    if (signers.length === 0) return;
    startTransition(async () => {
      const input =
        source.startsWith("doc:")
          ? { source: { kind: "DOCUMENT" as const, documentId: source.slice(4) }, signers }
          : {
              source: { kind: source as "KAUPTILBOD" | "KAUPSAMNINGUR" | "AFSAL" },
              signers,
            };
      const result = await createSigningRequestAction(listingId, input);
      report(result, "createdToast");
      if (!result?.error) {
        setSelectedSigners(new Set());
        setSource("");
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {requests.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {requests.map((request) => (
            <li key={request.id} className="grid gap-1.5 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <PenLine aria-hidden className="text-vertical size-4" />
                <span className="text-sm font-medium">{request.title}</span>
                <Badge
                  variant={REQUEST_TONE[request.status] ? "default" : "secondary"}
                  className={cn("ml-auto", REQUEST_TONE[request.status])}
                >
                  {t(`status.${request.status}`)}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {request.signers.map((signer, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className={cn(
                      signer.status === "SIGNED" && "border-emerald-600 text-emerald-700",
                      signer.status === "REJECTED" && "border-red-600 text-red-700",
                    )}
                  >
                    {signer.name} — {t(`signerStatus.${signer.status}`)}
                  </Badge>
                ))}
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                <span>{request.createdAtFormatted}</span>
                {request.signedDownloadUrl ? (
                  <a
                    href={request.signedDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-vertical inline-flex items-center gap-1 hover:underline"
                  >
                    <Download aria-hidden className="size-3.5" />
                    {t("downloadSigned")}
                  </a>
                ) : null}
                {canManage && (request.status === "SENT" || request.status === "PARTIALLY_SIGNED") ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive ml-auto h-6 px-2"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await cancelSigningRequestAction(listingId, request.id);
                        report(result, "cancelledToast");
                        router.refresh();
                      })
                    }
                  >
                    <X aria-hidden className="size-3.5" />
                    {t("cancel")}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="grid gap-3 rounded-md border p-3">
          <p className="text-sm font-medium">{t("newTitle")}</p>
          <div className="grid gap-2">
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectSource")} />
              </SelectTrigger>
              <SelectContent>
                {hasAcceptedOffer ? (
                  <SelectItem value="KAUPTILBOD">{t("source.KAUPTILBOD")}</SelectItem>
                ) : null}
                <SelectItem value="KAUPSAMNINGUR">{t("source.KAUPSAMNINGUR")}</SelectItem>
                <SelectItem value="AFSAL">{t("source.AFSAL")}</SelectItem>
                {pdfDocuments.map((document) => (
                  <SelectItem key={document.id} value={`doc:${document.id}`}>
                    {t("source.DOCUMENT", { title: document.title })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <p className="text-muted-foreground text-xs">{t("selectSigners")}</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {signerCandidates.map((candidate) => (
                <li key={candidate.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`signer-${candidate.key}`}
                    className="accent-primary size-4"
                    disabled={!candidate.kennitala || pending}
                    checked={selectedSigners.has(candidate.key)}
                    onChange={(event) =>
                      setSelectedSigners((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(candidate.key);
                        else next.delete(candidate.key);
                        return next;
                      })
                    }
                  />
                  <label
                    htmlFor={`signer-${candidate.key}`}
                    className={cn("text-sm", !candidate.kennitala && "text-muted-foreground")}
                  >
                    {candidate.name}
                    <span className="text-muted-foreground text-xs"> · {candidate.roleLabel}</span>
                    {!candidate.kennitala ? (
                      <span className="text-muted-foreground text-xs"> ({t("noKennitala")})</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Button
              type="button"
              disabled={pending || !source || selectedSigners.size === 0}
              onClick={create}
            >
              <Plus aria-hidden className="size-4" />
              {t("create")}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t("draftNote")}</p>
        </div>
      ) : null}
    </div>
  );
}
