"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createListingAction,
  updateListingAction,
  type ListingActionState,
} from "./actions";

const PROPERTY_TYPES = [
  "FJOLBYLI",
  "EINBYLI",
  "RADHUS",
  "PARHUS",
  "HAED",
  "ATVINNUHUSNAEDI",
  "SUMARHUS",
  "LOD",
  "ANNAD",
] as const;

const PARKING_TYPES = [
  "NONE",
  "BILSKUR",
  "BILSKYLI",
  "STAEDI",
  "STAEDI_I_BILAHUSI",
] as const;

export interface PropertyFormDefaults {
  listingId?: string;
  fastanumer?: string;
  landeignarnumer?: string | null;
  gotuheiti?: string;
  husnumer?: string;
  ibud?: string | null;
  postnumer?: string;
  tegund?: (typeof PROPERTY_TYPES)[number];
  birtStaerd?: string;
  tharAfGeymsla?: string;
  herbergi?: string;
  svefnherbergi?: string;
  badherbergi?: string;
  haed?: string;
  lyfta?: boolean;
  parkingType?: (typeof PARKING_TYPES)[number];
  parkingCount?: string;
  byggingarar?: string;
  fasteignamatISK?: string;
  brunabotamatISK?: string;
  askingPriceISK?: string;
  descriptionIs?: string;
  descriptionEn?: string;
  athugasemdir?: string;
}

export function PropertyForm({
  postalCodes,
  defaults = {},
}: {
  postalCodes: { code: string; locality: string }[];
  defaults?: PropertyFormDefaults;
}) {
  const t = useTranslations("listings");
  const tCommon = useTranslations("common");
  const isEdit = Boolean(defaults.listingId);

  const action = isEdit
    ? updateListingAction.bind(null, defaults.listingId!)
    : createListingAction;
  const [state, formAction, pending] = useActionState<ListingActionState, FormData>(
    action,
    null,
  );
  const lastState = useRef<ListingActionState>(null);

  useEffect(() => {
    if (state && state !== lastState.current && state.ok) {
      toast.success(t("savedToast"));
    }
    lastState.current = state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const section = (key: string) => (
    <>
      <Separator className="my-2" />
      <h2 className="text-sm font-semibold tracking-wide uppercase">
        {t(`sections.${key}`)}
      </h2>
    </>
  );

  return (
    <form action={formAction} className="grid gap-4">
      <h2 className="text-sm font-semibold tracking-wide uppercase">
        {t("sections.address")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="grid gap-2">
          <Label htmlFor="pf-gotuheiti">{t("fields.gotuheiti")}</Label>
          <Input id="pf-gotuheiti" name="gotuheiti" required defaultValue={defaults.gotuheiti ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-husnumer">{t("fields.husnumer")}</Label>
          <Input id="pf-husnumer" name="husnumer" required defaultValue={defaults.husnumer ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-ibud">{t("fields.ibud")}</Label>
          <Input id="pf-ibud" name="ibud" defaultValue={defaults.ibud ?? ""} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>{t("fields.postnumer")}</Label>
          <Select name="postnumer" defaultValue={defaults.postnumer} required>
            <SelectTrigger>
              <SelectValue placeholder={t("fields.postnumerPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {postalCodes.map((pc) => (
                <SelectItem key={pc.code} value={pc.code}>
                  {pc.code} {pc.locality}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>{t("fields.tegund")}</Label>
          <Select name="tegund" defaultValue={defaults.tegund ?? "FJOLBYLI"} required>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`propertyType.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {section("identifiers")}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="pf-fastanumer">{t("fields.fastanumer")}</Label>
          <Input id="pf-fastanumer" name="fastanumer" required defaultValue={defaults.fastanumer ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-landeignarnumer">{t("fields.landeignarnumer")}</Label>
          <Input id="pf-landeignarnumer" name="landeignarnumer" defaultValue={defaults.landeignarnumer ?? ""} />
        </div>
      </div>

      {section("size")}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="pf-birtStaerd">{t("fields.birtStaerd")}</Label>
          <Input
            id="pf-birtStaerd"
            name="birtStaerd"
            inputMode="decimal"
            placeholder="123,4"
            defaultValue={defaults.birtStaerd ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-tharAfGeymsla">{t("fields.tharAfGeymsla")}</Label>
          <Input
            id="pf-tharAfGeymsla"
            name="tharAfGeymsla"
            inputMode="decimal"
            defaultValue={defaults.tharAfGeymsla ?? ""}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="pf-herbergi">{t("fields.herbergi")}</Label>
          <Input id="pf-herbergi" name="herbergi" inputMode="numeric" defaultValue={defaults.herbergi ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-svefnherbergi">{t("fields.svefnherbergi")}</Label>
          <Input id="pf-svefnherbergi" name="svefnherbergi" inputMode="numeric" defaultValue={defaults.svefnherbergi ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-badherbergi">{t("fields.badherbergi")}</Label>
          <Input id="pf-badherbergi" name="badherbergi" inputMode="numeric" defaultValue={defaults.badherbergi ?? ""} />
        </div>
      </div>

      {section("building")}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="pf-haed">{t("fields.haed")}</Label>
          <Input id="pf-haed" name="haed" inputMode="numeric" defaultValue={defaults.haed ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-byggingarar">{t("fields.byggingarar")}</Label>
          <Input id="pf-byggingarar" name="byggingarar" inputMode="numeric" defaultValue={defaults.byggingarar ?? ""} />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <input
            id="pf-lyfta"
            name="lyfta"
            type="checkbox"
            defaultChecked={defaults.lyfta ?? false}
            className="accent-primary size-4"
          />
          <Label htmlFor="pf-lyfta">{t("fields.lyfta")}</Label>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>{t("fields.parkingType")}</Label>
          <Select name="parkingType" defaultValue={defaults.parkingType ?? "NONE"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PARKING_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`parkingType.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-parkingCount">{t("fields.parkingCount")}</Label>
          <Input id="pf-parkingCount" name="parkingCount" inputMode="numeric" defaultValue={defaults.parkingCount ?? ""} />
        </div>
      </div>

      {section("valuation")}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="pf-askingPriceISK">{t("fields.askingPriceISK")}</Label>
          <Input id="pf-askingPriceISK" name="askingPriceISK" inputMode="numeric" defaultValue={defaults.askingPriceISK ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-fasteignamatISK">{t("fields.fasteignamatISK")}</Label>
          <Input id="pf-fasteignamatISK" name="fasteignamatISK" inputMode="numeric" defaultValue={defaults.fasteignamatISK ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-brunabotamatISK">{t("fields.brunabotamatISK")}</Label>
          <Input id="pf-brunabotamatISK" name="brunabotamatISK" inputMode="numeric" defaultValue={defaults.brunabotamatISK ?? ""} />
        </div>
      </div>

      {section("description")}
      <div className="grid gap-2">
        <Label htmlFor="pf-descriptionIs">{t("fields.descriptionIs")}</Label>
        <textarea
          id="pf-descriptionIs"
          name="descriptionIs"
          rows={5}
          defaultValue={defaults.descriptionIs ?? ""}
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-3"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pf-descriptionEn">{t("fields.descriptionEn")}</Label>
        <textarea
          id="pf-descriptionEn"
          name="descriptionEn"
          rows={5}
          defaultValue={defaults.descriptionEn ?? ""}
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-3"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pf-athugasemdir">{t("fields.athugasemdir")}</Label>
        <textarea
          id="pf-athugasemdir"
          name="athugasemdir"
          rows={3}
          defaultValue={defaults.athugasemdir ?? ""}
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-3"
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-destructive text-sm">
          {tCommon("errorOccurred")}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {isEdit ? tCommon("save") : tCommon("create")}
        </Button>
      </div>
    </form>
  );
}
