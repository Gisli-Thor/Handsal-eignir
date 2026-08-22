"use client";

/**
 * Söluþóknun scheme editor (SPEC §10), shared by the tenant default
 * (/settings) and the per-listing override (listing detail). Builds the
 * zod-validated JSON shape from src/core/commission/scheme.ts; the server
 * action re-validates.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
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

export type SchemeJson = Record<string, unknown>;

export interface CommissionFormState {
  ok?: boolean;
  error?: string;
}

type SchemeType = "FIXED_PERCENT" | "TIERED" | "FLAT_PLUS_PERCENT";

interface TierRow {
  uptoISK: string;
  percent: string;
}

interface LineItemRow {
  label: string;
  amountISK: string;
}

function parsePercent(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function parseIsk(value: string): string | null {
  const digits = value.replace(/(kr\.?|[.\s])/gi, "");
  return /^\d{1,15}$/.test(digits) ? digits : null;
}

function initialState(scheme: SchemeJson | null) {
  const type = (scheme?.type as SchemeType) ?? "FIXED_PERCENT";
  const tiers = Array.isArray(scheme?.tiers)
    ? (scheme!.tiers as Array<{ uptoISK: string | null; percent: number }>)
    : null;
  return {
    type,
    percent:
      typeof scheme?.percent === "number" ? String(scheme.percent).replace(".", ",") : "",
    flatISK: typeof scheme?.flatISK === "string" ? scheme.flatISK : "",
    tierRows: (tiers ?? [{ uptoISK: "50000000", percent: 2.5 }, { uptoISK: null, percent: 1.8 }]).map(
      (tier) => ({
        uptoISK: tier.uptoISK ?? "",
        percent: String(tier.percent).replace(".", ","),
      }),
    ) as TierRow[],
    lineItemRows: (Array.isArray(scheme?.lineItems)
      ? (scheme!.lineItems as Array<{ label: string; amountISK: string }>)
      : []
    ).map((item) => ({ label: item.label, amountISK: item.amountISK })) as LineItemRow[],
  };
}

export function CommissionSchemeForm({
  initialScheme,
  /** When set, a "use default" checkbox submits null (listing override). */
  allowUseDefault,
  onSave,
}: {
  initialScheme: SchemeJson | null;
  allowUseDefault?: boolean;
  onSave: (scheme: SchemeJson | null) => Promise<CommissionFormState | null>;
}) {
  const t = useTranslations("commission");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = initialState(initialScheme);
  const [useDefault, setUseDefault] = useState(allowUseDefault ? initialScheme === null : false);
  const [type, setType] = useState<SchemeType>(initial.type);
  const [percent, setPercent] = useState(initial.percent);
  const [flatISK, setFlatISK] = useState(initial.flatISK);
  const [tierRows, setTierRows] = useState<TierRow[]>(initial.tierRows);
  const [lineItemRows, setLineItemRows] = useState<LineItemRow[]>(initial.lineItemRows);

  function buildScheme(): SchemeJson | null | "invalid" {
    if (useDefault) return null;
    const lineItems = [];
    for (const row of lineItemRows) {
      if (row.label.trim() === "" && row.amountISK.trim() === "") continue;
      const amount = parseIsk(row.amountISK);
      if (row.label.trim() === "" || amount === null) return "invalid";
      lineItems.push({ label: row.label.trim(), amountISK: amount });
    }
    if (type === "FIXED_PERCENT") {
      const pct = parsePercent(percent);
      if (pct === null) return "invalid";
      return { version: 1, type, percent: pct, lineItems };
    }
    if (type === "FLAT_PLUS_PERCENT") {
      const pct = parsePercent(percent);
      const flat = parseIsk(flatISK);
      if (pct === null || flat === null) return "invalid";
      return { version: 1, type, percent: pct, flatISK: flat, lineItems };
    }
    // TIERED — every row except the last needs a bound.
    const tiers = [];
    for (const [index, row] of tierRows.entries()) {
      const pct = parsePercent(row.percent);
      if (pct === null) return "invalid";
      if (index === tierRows.length - 1) {
        tiers.push({ uptoISK: null, percent: pct });
      } else {
        const upto = parseIsk(row.uptoISK);
        if (upto === null) return "invalid";
        tiers.push({ uptoISK: upto, percent: pct });
      }
    }
    return { version: 1, type, tiers, lineItems };
  }

  function save() {
    const scheme = buildScheme();
    if (scheme === "invalid") {
      toast.error(t("errors.invalid"));
      return;
    }
    startTransition(async () => {
      const result = await onSave(scheme);
      if (result?.error) toast.error(tCommon("errorOccurred"));
      else toast.success(t("savedToast"));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {allowUseDefault ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={useDefault}
            onChange={(event) => setUseDefault(event.target.checked)}
          />
          {t("useTenantDefault")}
        </label>
      ) : null}

      {!useDefault ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>{t("type")}</Label>
              <Select value={type} onValueChange={(value) => setType(value as SchemeType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED_PERCENT">{t("types.FIXED_PERCENT")}</SelectItem>
                  <SelectItem value="TIERED">{t("types.TIERED")}</SelectItem>
                  <SelectItem value="FLAT_PLUS_PERCENT">
                    {t("types.FLAT_PLUS_PERCENT")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type !== "TIERED" ? (
              <div className="grid gap-2">
                <Label htmlFor="scheme-percent">{t("percent")}</Label>
                <Input
                  id="scheme-percent"
                  inputMode="decimal"
                  placeholder="2,2"
                  value={percent}
                  onChange={(event) => setPercent(event.target.value)}
                />
              </div>
            ) : null}
            {type === "FLAT_PLUS_PERCENT" ? (
              <div className="grid gap-2">
                <Label htmlFor="scheme-flat">{t("flat")}</Label>
                <Input
                  id="scheme-flat"
                  inputMode="numeric"
                  placeholder="350.000"
                  value={flatISK}
                  onChange={(event) => setFlatISK(event.target.value)}
                />
              </div>
            ) : null}
          </div>

          {type === "TIERED" ? (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">{t("tiers")}</legend>
              {tierRows.map((row, index) => {
                const isLast = index === tierRows.length - 1;
                return (
                  <div key={index} className="flex items-end gap-2">
                    <div className="grid flex-1 gap-1">
                      {index === 0 ? (
                        <Label className="text-muted-foreground text-xs">{t("tierUpto")}</Label>
                      ) : null}
                      <Input
                        inputMode="numeric"
                        disabled={isLast}
                        placeholder={isLast ? t("tierRest") : "50.000.000"}
                        value={isLast ? "" : row.uptoISK}
                        onChange={(event) =>
                          setTierRows((rows) =>
                            rows.map((r, i) =>
                              i === index ? { ...r, uptoISK: event.target.value } : r,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="grid w-28 gap-1">
                      {index === 0 ? (
                        <Label className="text-muted-foreground text-xs">{t("percent")}</Label>
                      ) : null}
                      <Input
                        inputMode="decimal"
                        value={row.percent}
                        onChange={(event) =>
                          setTierRows((rows) =>
                            rows.map((r, i) =>
                              i === index ? { ...r, percent: event.target.value } : r,
                            ),
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={tierRows.length <= 2}
                      onClick={() => setTierRows((rows) => rows.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setTierRows((rows) => [
                      ...rows.slice(0, -1),
                      { uptoISK: "", percent: "" },
                      rows[rows.length - 1],
                    ])
                  }
                >
                  <Plus aria-hidden className="size-4" />
                  {t("addTier")}
                </Button>
              </div>
            </fieldset>
          ) : null}

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t("lineItems")}</legend>
            {lineItemRows.map((row, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="grid flex-1 gap-1">
                  {index === 0 ? (
                    <Label className="text-muted-foreground text-xs">{t("lineItemLabel")}</Label>
                  ) : null}
                  <Input
                    value={row.label}
                    placeholder={t("lineItemPlaceholder")}
                    onChange={(event) =>
                      setLineItemRows((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, label: event.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
                <div className="grid w-36 gap-1">
                  {index === 0 ? (
                    <Label className="text-muted-foreground text-xs">{t("lineItemAmount")}</Label>
                  ) : null}
                  <Input
                    inputMode="numeric"
                    value={row.amountISK}
                    onChange={(event) =>
                      setLineItemRows((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, amountISK: event.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setLineItemRows((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLineItemRows((rows) => [...rows, { label: "", amountISK: "" }])
                }
              >
                <Plus aria-hidden className="size-4" />
                {t("addLineItem")}
              </Button>
            </div>
          </fieldset>
        </>
      ) : null}

      <div>
        <Button type="button" disabled={pending} onClick={save}>
          <Save aria-hidden className="size-4" />
          {tCommon("save")}
        </Button>
      </div>
    </div>
  );
}
