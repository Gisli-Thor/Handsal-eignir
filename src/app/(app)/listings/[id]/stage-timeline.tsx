"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ban, Check, Gauge, RotateCcw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { transitionStageAction } from "../stage-actions";

export function StageTimeline({
  listingId,
  stages,
  currentStage,
  withdrawnStage,
  isWithdrawn,
  withdrawnReason,
  canManage,
  isAdmin,
}: {
  listingId: string;
  stages: string[];
  currentStage: string;
  withdrawnStage: string;
  isWithdrawn: boolean;
  withdrawnReason: string | null;
  canManage: boolean;
  isAdmin: boolean;
}) {
  const t = useTranslations("pipeline");
  const tStages = useTranslations("listings.stage");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [overridePrompt, setOverridePrompt] = useState<{
    to: string;
    code: string;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [limitPromptOpen, setLimitPromptOpen] = useState(false);

  const currentIndex = stages.indexOf(currentStage);

  function runTransition(to: string, reason?: string, override?: boolean) {
    startTransition(async () => {
      const result = await transitionStageAction(listingId, { to, reason, override });
      if (result?.blocked) {
        if (result.blocked.overridable && isAdmin) {
          setOverridePrompt({ to, code: result.blocked.code });
        } else if (result.blocked.code === "planLimitReached") {
          // SPEC §12: hard block with a clear upgrade prompt.
          setLimitPromptOpen(true);
        } else {
          toast.error(t(`guards.${result.blocked.code}`));
        }
      } else if (result?.error) {
        toast.error(
          result.error === "reasonRequired"
            ? t("reasonRequired")
            : result.error === "conflict"
              ? t("conflict")
              : tCommon("errorOccurred"),
        );
      } else {
        toast.success(t("moved", { stage: tStages(to) }));
        setWithdrawOpen(false);
        setWithdrawReason("");
        setOverridePrompt(null);
        setOverrideReason("");
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-y-3 text-xs">
        {stages.map((stage, index) => {
          const done = !isWithdrawn && index < currentIndex;
          const current = !isWithdrawn && index === currentIndex;
          const clickable = canManage && !pending && stage !== currentStage;
          return (
            <li key={stage} className="flex items-center">
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "mx-1 h-px w-4 sm:w-6",
                    done || current ? "bg-vertical" : "bg-border",
                  )}
                />
              ) : null}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => runTransition(stage)}
                title={clickable ? t("moveTo", { stage: tStages(stage) }) : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors",
                  current
                    ? "border-vertical bg-vertical text-white"
                    : done
                      ? "border-vertical/40 bg-vertical/10 text-foreground"
                      : "border-border text-muted-foreground",
                  clickable && !current && "hover:border-vertical/60 hover:text-foreground",
                )}
              >
                {done ? <Check aria-hidden className="size-3" /> : null}
                {tStages(stage)}
              </button>
            </li>
          );
        })}
      </ol>

      {isWithdrawn ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="destructive">{tStages(withdrawnStage)}</Badge>
          {withdrawnReason ? (
            <span className="text-muted-foreground text-sm">{withdrawnReason}</span>
          ) : null}
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => runTransition(stages[0])}
            >
              <RotateCcw aria-hidden className="size-4" />
              {t("reactivate")}
            </Button>
          ) : null}
        </div>
      ) : canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive"
            disabled={pending}
            onClick={() => setWithdrawOpen(true)}
          >
            <Ban aria-hidden className="size-4" />
            {t("withdraw")}
          </Button>
        </div>
      ) : null}

      {/* Fallið frá reason dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("withdrawTitle")}</DialogTitle>
            <DialogDescription>{t("withdrawBody")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="withdraw-reason">{t("reason")}</Label>
            <textarea
              id="withdraw-reason"
              value={withdrawReason}
              onChange={(event) => setWithdrawReason(event.target.value)}
              rows={3}
              className="border-input bg-transparent focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWithdrawOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || withdrawReason.trim() === ""}
              onClick={() => runTransition(withdrawnStage, withdrawReason)}
            >
              {t("withdrawConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan-limit upgrade prompt (SPEC §12 — hard block, no override) */}
      <Dialog open={limitPromptOpen} onOpenChange={setLimitPromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge aria-hidden className="text-vertical size-5" />
              {t("limit.title")}
            </DialogTitle>
            <DialogDescription>
              {t("limit.body")} {isAdmin ? t("limit.adminHint") : t("limit.agentHint")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLimitPromptOpen(false)}>
              {tCommon("cancel")}
            </Button>
            {isAdmin ? (
              <Button asChild>
                <Link href="/settings">{t("limit.goToSettings")}</Link>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADMIN guard-override dialog (SPEC §7) */}
      <Dialog
        open={overridePrompt !== null}
        onOpenChange={(open) => {
          if (!open) setOverridePrompt(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert aria-hidden className="text-destructive size-5" />
              {t("overrideTitle")}
            </DialogTitle>
            <DialogDescription>
              {overridePrompt ? t(`guards.${overridePrompt.code}`) : null}{" "}
              {t("overrideBody")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="override-reason">{t("reason")}</Label>
            <textarea
              id="override-reason"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              rows={3}
              className="border-input bg-transparent focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOverridePrompt(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || overrideReason.trim() === ""}
              onClick={() =>
                overridePrompt && runTransition(overridePrompt.to, overrideReason, true)
              }
            >
              {t("overrideConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
