"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CornerDownRight, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  acceptOfferAction,
  createOfferAction,
  rejectOfferAction,
  withdrawOfferAction,
  type OfferActionState,
} from "../offer-actions";

export interface OfferView {
  id: string;
  parentId: string | null;
  depth: number;
  kind: "KAUPTILBOD" | "GAGNTILBOD";
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "COUNTERED" | "EXPIRED" | "WITHDRAWN";
  amountFormatted: string;
  gildistimiFormatted: string;
  /** ms until expiry at render time; negative = past (display only). */
  msToExpiry: number;
  afhendingFormatted: string | null;
  terms: string | null;
  buyers: Array<{ name: string; sharePct: string | null }>;
  paymentItems: Array<{
    description: string;
    amountFormatted: string;
    dueDateFormatted: string | null;
  }>;
  createdAtFormatted: string;
}

export interface ContactOption {
  id: string;
  name: string;
}

const STATUS_BADGE: Record<OfferView["status"], "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "default",
  ACCEPTED: "default",
  REJECTED: "destructive",
  COUNTERED: "secondary",
  EXPIRED: "outline",
  WITHDRAWN: "outline",
};

interface PaymentRow {
  description: string;
  amount: string;
  dueDate: string;
}

interface BuyerRow {
  contactId: string;
  sharePct: string;
}

function parseIskInput(value: string): bigint | null {
  const digits = value.replace(/(kr\.?|[.\s])/gi, "");
  return /^\d{1,15}$/.test(digits) ? BigInt(digits) : null;
}

function formatIskDisplay(value: bigint): string {
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} kr.`;
}

export function OffersPanel({
  listingId,
  chains,
  availableContacts,
  canManage,
}: {
  listingId: string;
  chains: OfferView[][];
  availableContacts: ContactOption[];
  canManage: boolean;
}) {
  const t = useTranslations("offers");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [counterOf, setCounterOf] = useState<OfferView | null>(null);

  function decide(
    action: (listingId: string, offerId: string) => Promise<OfferActionState>,
    offerId: string,
  ) {
    startTransition(async () => {
      const result = await action(listingId, offerId);
      if (result?.error) {
        toast.error(
          result.error === "notPending" ? t("errors.notPending") : tCommon("errorOccurred"),
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {chains.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">{t("empty")}</p>
      ) : (
        chains.map((chain) => (
          <div key={chain[0].id} className="grid gap-2 rounded-lg border p-3">
            {chain.map((offer) => (
              <div
                key={offer.id}
                className={cn("grid gap-2 rounded-md border p-3", offer.depth > 0 && "ml-5")}
                style={offer.depth > 1 ? { marginLeft: `${offer.depth * 1.25}rem` } : undefined}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {offer.depth > 0 ? (
                    <CornerDownRight aria-hidden className="text-muted-foreground size-4" />
                  ) : null}
                  <span className="font-medium">{t(`kind.${offer.kind}`)}</span>
                  <Badge
                    variant={STATUS_BADGE[offer.status]}
                    className={cn(
                      offer.status === "ACCEPTED" && "bg-emerald-600 text-white",
                    )}
                  >
                    {t(`status.${offer.status}`)}
                  </Badge>
                  <span className="ml-auto text-base font-semibold tabular-nums">
                    {offer.amountFormatted}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {t("buyersLine", {
                    buyers: offer.buyers
                      .map((buyer) =>
                        buyer.sharePct ? `${buyer.name} (${buyer.sharePct}%)` : buyer.name,
                      )
                      .join(", "),
                  })}
                </p>
                <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-xs">
                  <span>
                    {t("gildistimi")}: {offer.gildistimiFormatted}
                    {offer.status === "PENDING" && offer.msToExpiry > 0 && offer.msToExpiry < 48 * 3_600_000 ? (
                      <Badge variant="destructive" className="ml-2">
                        {t("expiringSoon")}
                      </Badge>
                    ) : null}
                  </span>
                  {offer.afhendingFormatted ? (
                    <span>
                      {t("afhending")}: {offer.afhendingFormatted}
                    </span>
                  ) : null}
                  <span>
                    {t("received")}: {offer.createdAtFormatted}
                  </span>
                </div>
                {offer.paymentItems.length > 0 ? (
                  <div className="text-sm">
                    <p className="text-muted-foreground mb-1 text-xs font-medium">
                      {t("paymentSchedule")}
                    </p>
                    <ul className="grid gap-0.5">
                      {offer.paymentItems.map((item, index) => (
                        <li key={index} className="flex justify-between gap-4">
                          <span>
                            {item.description}
                            {item.dueDateFormatted ? (
                              <span className="text-muted-foreground"> — {item.dueDateFormatted}</span>
                            ) : null}
                          </span>
                          <span className="tabular-nums">{item.amountFormatted}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {offer.terms ? (
                  <p className="text-sm whitespace-pre-wrap">{offer.terms}</p>
                ) : null}
                {canManage && offer.status === "PENDING" ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => decide(acceptOfferAction, offer.id)}
                    >
                      {t("accept")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        setCounterOf(offer);
                        setFormOpen(true);
                      }}
                    >
                      {t("counter")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={pending}
                      onClick={() => decide(rejectOfferAction, offer.id)}
                    >
                      {t("reject")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => decide(withdrawOfferAction, offer.id)}
                    >
                      {t("withdraw")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))
      )}

      {canManage ? (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCounterOf(null);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden className="size-4" />
            {t("new")}
          </Button>
        </div>
      ) : null}

      <OfferFormDialog
        key={counterOf?.id ?? "new"}
        listingId={listingId}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setCounterOf(null);
        }}
        counterOf={counterOf}
        availableContacts={availableContacts}
      />
    </div>
  );
}

function OfferFormDialog({
  listingId,
  open,
  onOpenChange,
  counterOf,
  availableContacts,
}: {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counterOf: OfferView | null;
  availableContacts: ContactOption[];
}) {
  const t = useTranslations("offers.form");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [buyers, setBuyers] = useState<BuyerRow[]>([{ contactId: "", sharePct: "" }]);
  const [items, setItems] = useState<PaymentRow[]>([
    { description: "", amount: "", dueDate: "" },
  ]);

  const amountParsed = parseIskInput(amount);
  const itemSum = useMemo(() => {
    let sum = 0n;
    for (const row of items) {
      const parsed = parseIskInput(row.amount);
      if (parsed !== null) sum += parsed;
    }
    return sum;
  }, [items]);
  const diff = amountParsed !== null ? amountParsed - itemSum : null;

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createOfferAction(listingId, null, formData);
      if (result?.error) {
        const key =
          result.error === "buyersRequired"
            ? "errors.buyersRequired"
            : result.error === "paymentEmpty"
              ? "errors.paymentEmpty"
              : result.error === "paymentNonPositive"
                ? "errors.paymentNonPositive"
                : result.error === "paymentSumMismatch"
                  ? "errors.paymentSumMismatch"
                  : result.error === "gildistimiPast"
                    ? "errors.gildistimiPast"
                    : result.error === "notPending"
                      ? "errors.parentClosed"
                      : null;
        toast.error(key ? t(key) : tCommon("errorOccurred"));
      } else {
        onOpenChange(false);
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{counterOf ? t("counterTitle") : t("title")}</DialogTitle>
          {counterOf ? (
            <DialogDescription>
              {t("counterBody", { amount: counterOf.amountFormatted })}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <form action={submit} className="grid gap-4">
          {counterOf ? <input type="hidden" name="parentId" value={counterOf.id} /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="offer-amount">{t("amount")}</Label>
              <Input
                id="offer-amount"
                name="amountISK"
                inputMode="numeric"
                placeholder="89.990.000"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="offer-gildistimi">{t("gildistimi")}</Label>
              <Input id="offer-gildistimi" name="gildistimi" type="datetime-local" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="offer-afhending">{t("afhending")}</Label>
              <Input id="offer-afhending" name="afhendingDate" type="date" />
            </div>
          </div>

          {counterOf === null ? (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">{t("buyers")}</legend>
              {buyers.map((row, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="grid flex-1 gap-1">
                    {index === 0 ? (
                      <Label className="text-muted-foreground text-xs">{t("buyer")}</Label>
                    ) : null}
                    <Select
                      name="buyerContactId"
                      value={row.contactId}
                      onValueChange={(value) =>
                        setBuyers((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, contactId: value } : r)),
                        )
                      }
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("selectContact")} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableContacts.map((contact) => (
                          <SelectItem key={contact.id} value={contact.id}>
                            {contact.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid w-24 gap-1">
                    {index === 0 ? (
                      <Label className="text-muted-foreground text-xs">{t("sharePct")}</Label>
                    ) : null}
                    <Input
                      name="buyerSharePct"
                      inputMode="decimal"
                      placeholder="50"
                      value={row.sharePct}
                      onChange={(event) =>
                        setBuyers((rows) =>
                          rows.map((r, i) =>
                            i === index ? { ...r, sharePct: event.target.value } : r,
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
                    disabled={buyers.length === 1}
                    onClick={() => setBuyers((rows) => rows.filter((_, i) => i !== index))}
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
                  onClick={() => setBuyers((rows) => [...rows, { contactId: "", sharePct: "" }])}
                >
                  <Plus aria-hidden className="size-4" />
                  {t("addBuyer")}
                </Button>
              </div>
            </fieldset>
          ) : null}

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t("paymentSchedule")}</legend>
            {items.map((row, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="grid flex-1 gap-1">
                  {index === 0 ? (
                    <Label className="text-muted-foreground text-xs">{t("itemDescription")}</Label>
                  ) : null}
                  <Input
                    name="paymentDescription"
                    value={row.description}
                    placeholder={t("itemPlaceholder")}
                    onChange={(event) =>
                      setItems((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, description: event.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
                <div className="grid w-36 gap-1">
                  {index === 0 ? (
                    <Label className="text-muted-foreground text-xs">{t("itemAmount")}</Label>
                  ) : null}
                  <Input
                    name="paymentAmount"
                    inputMode="numeric"
                    value={row.amount}
                    onChange={(event) =>
                      setItems((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, amount: event.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
                <div className="grid w-36 gap-1">
                  {index === 0 ? (
                    <Label className="text-muted-foreground text-xs">{t("itemDueDate")}</Label>
                  ) : null}
                  <Input
                    name="paymentDueDate"
                    type="date"
                    value={row.dueDate}
                    onChange={(event) =>
                      setItems((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, dueDate: event.target.value } : r,
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
                  disabled={items.length === 1}
                  onClick={() => setItems((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems((rows) => [...rows, { description: "", amount: "", dueDate: "" }])
                }
              >
                <Plus aria-hidden className="size-4" />
                {t("addItem")}
              </Button>
              {amountParsed !== null ? (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    diff === 0n ? "text-emerald-600" : "text-destructive",
                  )}
                >
                  {diff === 0n
                    ? t("sumMatches")
                    : t("sumDiff", { diff: formatIskDisplay(diff! < 0n ? -diff! : diff!) })}
                </span>
              ) : null}
            </div>
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor="offer-terms">{t("terms")}</Label>
            <textarea
              id="offer-terms"
              name="terms"
              rows={3}
              className="border-input bg-transparent focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {counterOf ? t("submitCounter") : t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
