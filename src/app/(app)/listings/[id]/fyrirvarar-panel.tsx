"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, CircleSlash, Plus, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addFyrirvariAction,
  deleteFyrirvariAction,
  resolveFyrirvariAction,
} from "../fyrirvari-actions";
import { transitionStageAction } from "../stage-actions";

export interface FyrirvariView {
  id: string;
  type: "FJARMOGNUN" | "SALA_EIGIN_EIGNAR" | "ASTANDSSKODUN" | "SAMTHYKKI_STJORNAR" | "ANNAD";
  description: string;
  deadlineFormatted: string;
  /** Days until the deadline at render time (negative = overdue). */
  daysLeft: number;
  responsible: "BUYER" | "SELLER";
  status: "PENDING" | "FULFILLED" | "WAIVED" | "FAILED";
  resolvedAtFormatted: string | null;
  resolvedByName: string | null;
}

const FYRIRVARI_TYPES = [
  "FJARMOGNUN",
  "SALA_EIGIN_EIGNAR",
  "ASTANDSSKODUN",
  "SAMTHYKKI_STJORNAR",
  "ANNAD",
] as const;

/** SPEC §7: green fulfilled, amber < 7 days, red overdue. */
function deadlineTone(item: FyrirvariView): "green" | "amber" | "red" | "muted" {
  if (item.status === "FULFILLED" || item.status === "WAIVED") return "green";
  if (item.status === "FAILED") return "red";
  if (item.daysLeft < 0) return "red";
  if (item.daysLeft < 7) return "amber";
  return "muted";
}

export function FyrirvararPanel({
  listingId,
  offerId,
  items,
  canManage,
  showStageFallback,
}: {
  listingId: string;
  /** The open/accepted offer the panel manages conditions for. */
  offerId: string | null;
  items: FyrirvariView[];
  canManage: boolean;
  /** Offer FAILED fallback prompts (listing is in Tilboð samþykkt). */
  showStageFallback: boolean;
}) {
  const t = useTranslations("fyrirvarar");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const hasFailed = items.some((item) => item.status === "FAILED");

  function run(action: () => Promise<{ error?: string } | null>) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) toast.error(tCommon("errorOccurred"));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {items.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => {
            const tone = deadlineTone(item);
            return (
              <li
                key={item.id}
                className={cn(
                  "grid gap-1.5 rounded-md border p-3",
                  tone === "red" && "border-red-500/50 bg-red-500/5",
                  tone === "amber" && "border-amber-500/50 bg-amber-500/5",
                  tone === "green" && "border-emerald-500/40 bg-emerald-500/5",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t(`type.${item.type}`)}</span>
                  <Badge variant="outline">{t(`responsible.${item.responsible}`)}</Badge>
                  <Badge
                    className={cn(
                      "ml-auto",
                      tone === "green" && "bg-emerald-600 text-white",
                      tone === "amber" && "bg-amber-500 text-white",
                      tone === "red" && "bg-red-600 text-white",
                    )}
                    variant={tone === "muted" ? "secondary" : "default"}
                  >
                    {item.status === "PENDING"
                      ? item.daysLeft < 0
                        ? t("overdue", { days: -item.daysLeft })
                        : t("daysLeft", { days: item.daysLeft })
                      : t(`status.${item.status}`)}
                  </Badge>
                </div>
                <p className="text-sm">{item.description}</p>
                <p className="text-muted-foreground text-xs">
                  {t("deadline")}: {item.deadlineFormatted}
                  {item.resolvedAtFormatted ? (
                    <>
                      {" · "}
                      {t("resolvedLine", {
                        status: t(`status.${item.status}`),
                        by: item.resolvedByName ?? "—",
                        at: item.resolvedAtFormatted,
                      })}
                    </>
                  ) : null}
                </p>
                {canManage ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {item.status === "PENDING" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            run(() => resolveFyrirvariAction(listingId, item.id, "FULFILLED"))
                          }
                        >
                          <CheckCircle2 aria-hidden className="size-4 text-emerald-600" />
                          {t("fulfill")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            run(() => resolveFyrirvariAction(listingId, item.id, "WAIVED"))
                          }
                        >
                          <CircleSlash aria-hidden className="size-4" />
                          {t("waive")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={pending}
                          onClick={() =>
                            run(() => resolveFyrirvariAction(listingId, item.id, "FAILED"))
                          }
                        >
                          <XCircle aria-hidden className="size-4" />
                          {t("fail")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(() => resolveFyrirvariAction(listingId, item.id, "PENDING"))
                        }
                      >
                        <RotateCcw aria-hidden className="size-4" />
                        {t("reopen")}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive ml-auto"
                      disabled={pending}
                      onClick={() => run(() => deleteFyrirvariAction(listingId, item.id))}
                      title={tCommon("delete")}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* SPEC §7: a FAILED fyrirvari prompts fallback to Í sölu or Fallið frá. */}
      {hasFailed && showStageFallback && canManage ? (
        <div className="border-destructive/40 bg-destructive/5 grid gap-2 rounded-md border p-3">
          <p className="text-sm font-medium">{t("failedPrompt")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => transitionStageAction(listingId, { to: "I_SOLU" }))
              }
            >
              {t("backToSale")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={pending}
              onClick={() =>
                run(() =>
                  transitionStageAction(listingId, {
                    to: "FALLID_FRA",
                    reason: t("failedReason"),
                  }),
                )
              }
            >
              {t("markWithdrawn")}
            </Button>
          </div>
        </div>
      ) : null}

      {canManage && offerId ? (
        <form
          ref={formRef}
          action={(formData) => {
            startTransition(async () => {
              const result = await addFyrirvariAction(listingId, offerId, null, formData);
              if (result?.error) {
                toast.error(
                  result.error === "invalid" ? t("errors.invalid") : tCommon("errorOccurred"),
                );
              } else {
                formRef.current?.reset();
              }
              router.refresh();
            });
          }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.6fr_1fr_1fr_auto] lg:items-end"
        >
          <div className="grid gap-2">
            <Label>{t("typeLabel")}</Label>
            <Select name="type" defaultValue="FJARMOGNUN">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FYRIRVARI_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`type.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fyrirvari-description">{t("description")}</Label>
            <Input id="fyrirvari-description" name="description" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fyrirvari-deadline">{t("deadline")}</Label>
            <Input id="fyrirvari-deadline" name="deadline" type="date" required />
          </div>
          <div className="grid gap-2">
            <Label>{t("responsibleLabel")}</Label>
            <Select name="responsible" defaultValue="BUYER">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BUYER">{t("responsible.BUYER")}</SelectItem>
                <SelectItem value="SELLER">{t("responsible.SELLER")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={pending}>
            <Plus aria-hidden className="size-4" />
            {t("add")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
