"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, RefreshCw, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  portalSyncAction,
  setPortalEnabledAction,
  type PortalActionState,
} from "../portal-actions";

export interface PortalRow {
  key: string;
  displayName: string;
  enabled: boolean;
  status: "NOT_PUBLISHED" | "PUBLISHED" | "NEEDS_UPDATE" | "UNPUBLISHED" | "ERROR";
  lastSyncedFormatted: string | null;
  lastError: string | null;
}

export interface SyncLogRow {
  id: string;
  portalName: string;
  action: "PUBLISH" | "UPDATE" | "UNPUBLISH" | "PULL";
  ok: boolean;
  message: string | null;
  whenFormatted: string;
}

const STATUS_TONE: Record<PortalRow["status"], string> = {
  NOT_PUBLISHED: "",
  PUBLISHED: "bg-emerald-600 text-white",
  NEEDS_UPDATE: "bg-amber-500 text-white",
  UNPUBLISHED: "",
  ERROR: "bg-red-600 text-white",
};

export function PortalsPanel({
  listingId,
  portals,
  syncLog,
  canManage,
}: {
  listingId: string;
  portals: PortalRow[];
  syncLog: SyncLogRow[];
  canManage: boolean;
}) {
  const t = useTranslations("portals");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const needsUpdate = portals.some((portal) => portal.status === "NEEDS_UPDATE");

  function report(result: PortalActionState) {
    if (result?.error) {
      toast.error(tCommon("errorOccurred"));
      return;
    }
    const failed = result?.results?.filter((entry) => !entry.ok) ?? [];
    if (failed.length > 0) {
      toast.error(t("syncFailed", { portals: failed.map((entry) => entry.portalKey).join(", ") }));
    } else {
      toast.success(t("syncDone"));
    }
  }

  function run(kind: "publish" | "unpublish" | "pull", portalKey?: string) {
    startTransition(async () => {
      const result = await portalSyncAction(listingId, kind, portalKey);
      report(result);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {needsUpdate && canManage ? (
        <div className="border-amber-500/50 bg-amber-500/10 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="text-sm">{t("needsUpdatePrompt")}</span>
          <Button type="button" size="sm" disabled={pending} onClick={() => run("publish")}>
            <RefreshCw aria-hidden className={cn("size-4", pending && "animate-spin")} />
            {t("syncNow")}
          </Button>
        </div>
      ) : null}

      <ul className="grid gap-2">
        {portals.map((portal) => (
          <li
            key={portal.key}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2"
          >
            {canManage ? (
              <input
                type="checkbox"
                checked={portal.enabled}
                disabled={pending}
                className="accent-primary size-4"
                title={t("enableToggle")}
                onChange={(event) =>
                  startTransition(async () => {
                    const result = await setPortalEnabledAction(
                      listingId,
                      portal.key,
                      event.target.checked,
                    );
                    if (result?.error) toast.error(tCommon("errorOccurred"));
                    router.refresh();
                  })
                }
              />
            ) : null}
            <span className={cn("font-medium", !portal.enabled && "text-muted-foreground line-through")}>
              {portal.displayName}
            </span>
            <Badge
              variant={portal.status === "NOT_PUBLISHED" || portal.status === "UNPUBLISHED" ? "secondary" : "default"}
              className={STATUS_TONE[portal.status]}
            >
              {t(`status.${portal.status}`)}
            </Badge>
            {portal.lastSyncedFormatted ? (
              <span className="text-muted-foreground text-xs">
                {t("lastSynced")}: {portal.lastSyncedFormatted}
              </span>
            ) : null}
            {canManage && portal.enabled ? (
              <span className="ml-auto flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run("publish", portal.key)}
                  title={t("push")}
                >
                  <Upload aria-hidden className="size-4" />
                  {t("push")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || portal.status === "NOT_PUBLISHED" || portal.status === "UNPUBLISHED"}
                  onClick={() => run("pull", portal.key)}
                  title={t("pull")}
                >
                  <Download aria-hidden className="size-4" />
                  {t("pull")}
                </Button>
              </span>
            ) : null}
            {portal.lastError ? (
              <p className="text-destructive w-full text-xs">{portal.lastError}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run("publish")}>
            <Upload aria-hidden className="size-4" />
            {t("pushAll")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run("pull")}>
            <Download aria-hidden className="size-4" />
            {t("pullAll")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={pending}
            onClick={() => run("unpublish")}
          >
            {t("unpublishAll")}
          </Button>
        </div>
      ) : null}

      {syncLog.length > 0 ? (
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">{t("syncLog")}</p>
          <ul className="grid gap-1 text-xs">
            {syncLog.map((row) => (
              <li key={row.id} className="text-muted-foreground flex flex-wrap gap-x-2">
                <span className={cn("font-medium", row.ok ? "text-emerald-600" : "text-destructive")}>
                  {row.ok ? "✓" : "✕"}
                </span>
                <span>{row.portalName}</span>
                <span>{t(`action.${row.action}`)}</span>
                {row.message ? <span>— {row.message}</span> : null}
                <span className="ml-auto">{row.whenFormatted}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
