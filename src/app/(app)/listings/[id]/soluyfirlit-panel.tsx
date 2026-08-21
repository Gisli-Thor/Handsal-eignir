"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, FileText, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  generateSoluyfirlitAction,
  sendSoluyfirlitAction,
} from "../soluyfirlit-actions";

export interface SoluyfirlitVersionItem {
  id: string;
  version: number;
  createdAtFormatted: string;
  generatedByName: string | null;
  downloadUrl: string;
}

export interface SoluyfirlitSendItem {
  id: string;
  contactName: string;
  version: number;
  sentByName: string | null;
  whenFormatted: string;
  receiptStatus: string | null;
}

export interface ProspectOption {
  id: string;
  name: string;
  hasEmail: boolean;
  hasKennitala: boolean;
}

export function SoluyfirlitPanel({
  listingId,
  versions,
  sends,
  prospects,
  canManage,
}: {
  listingId: string;
  versions: SoluyfirlitVersionItem[];
  sends: SoluyfirlitSendItem[];
  prospects: ProspectOption[];
  canManage: boolean;
}) {
  const t = useTranslations("soluyfirlit");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [requestReceipt, setRequestReceipt] = useState(false);

  const latest = versions[0] ?? null;

  function generate() {
    startTransition(async () => {
      const result = await generateSoluyfirlitAction(listingId);
      if (result?.error) {
        toast.error(result.error === "renderFailed" ? t("errors.renderFailed") : tCommon("errorOccurred"));
      } else {
        toast.success(t("generatedToast"));
      }
      router.refresh();
    });
  }

  function send() {
    if (!latest || selectedContacts.size === 0) return;
    startTransition(async () => {
      const result = await sendSoluyfirlitAction(listingId, {
        versionId: latest.id,
        contactIds: [...selectedContacts],
        requestReceipt,
      });
      if (result?.error) {
        toast.error(
          result.error === "noEmail" ? t("errors.noEmail") : tCommon("errorOccurred"),
        );
      } else {
        toast.success(t("sentToast", { count: selectedContacts.size }));
        setSelectedContacts(new Set());
        setRequestReceipt(false);
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {/* Versions */}
      {versions.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-1.5">
          {versions.map((version, index) => (
            <li key={version.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
              <FileText aria-hidden className="text-vertical size-4" />
              <span className="text-sm font-medium">
                {t("versionLabel", { version: version.version })}
              </span>
              {index === 0 ? <Badge variant="secondary">{t("current")}</Badge> : null}
              <span className="text-muted-foreground text-xs">
                {version.createdAtFormatted}
                {version.generatedByName ? ` · ${version.generatedByName}` : ""}
              </span>
              <a
                href={version.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="text-vertical ml-auto inline-flex items-center gap-1 text-sm hover:underline"
              >
                <Download aria-hidden className="size-4" />
                {t("download")}
              </a>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div>
          <Button type="button" variant="outline" disabled={pending} onClick={generate}>
            <FileText aria-hidden className="size-4" />
            {versions.length === 0 ? t("generate") : t("regenerate")}
          </Button>
        </div>
      ) : null}

      {/* Send */}
      {canManage && latest ? (
        <div className="grid gap-2 rounded-md border p-3">
          <p className="text-sm font-medium">{t("sendTitle", { version: latest.version })}</p>
          {prospects.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noProspects")}</p>
          ) : (
            <>
              <ul className="grid gap-1 sm:grid-cols-2">
                {prospects.map((prospect) => (
                  <li key={prospect.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`sy-send-${prospect.id}`}
                      className="accent-primary size-4"
                      disabled={!prospect.hasEmail || pending}
                      checked={selectedContacts.has(prospect.id)}
                      onChange={(event) =>
                        setSelectedContacts((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(prospect.id);
                          else next.delete(prospect.id);
                          return next;
                        })
                      }
                    />
                    <label
                      htmlFor={`sy-send-${prospect.id}`}
                      className={prospect.hasEmail ? "text-sm" : "text-muted-foreground text-sm"}
                    >
                      {prospect.name}
                      {!prospect.hasEmail ? ` (${t("noEmailShort")})` : ""}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-primary size-4"
                    checked={requestReceipt}
                    onChange={(event) => setRequestReceipt(event.target.checked)}
                  />
                  {t("requestReceipt")}
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || selectedContacts.size === 0}
                  onClick={send}
                >
                  <Send aria-hidden className="size-4" />
                  {t("send")}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Send history (SPEC §9: prove who received what, when) */}
      {sends.length > 0 ? (
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">{t("sendHistory")}</p>
          <ul className="grid gap-1 text-xs">
            {sends.map((send) => (
              <li key={send.id} className="text-muted-foreground flex flex-wrap gap-x-2">
                <span className="text-foreground font-medium">{send.contactName}</span>
                <span>{t("versionLabel", { version: send.version })}</span>
                {send.sentByName ? <span>· {send.sentByName}</span> : null}
                {send.receiptStatus ? (
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                    {t("receipt")}: {send.receiptStatus}
                  </Badge>
                ) : null}
                <span className="ml-auto">{send.whenFormatted}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
