"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addLoanAction, deleteLoanAction } from "../actions";

export interface LoanItem {
  id: string;
  lender: string;
  /** Pre-formatted ISK string from the server. */
  remainingBalanceFormatted: string;
  verdtryggt: boolean;
  interestRatePct: number | null;
  yfirtakanlegt: boolean;
}

export function LoansPanel({
  listingId,
  loans,
  canManage,
}: {
  listingId: string;
  loans: LoanItem[];
  canManage: boolean;
}) {
  const t = useTranslations("listings.loans");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      const result = await addLoanAction(listingId, null, formData);
      if (result?.error) {
        toast.error(
          result.error === "invalid" ? t("errors.invalid") : tCommon("errorOccurred"),
        );
      } else {
        formRef.current?.reset();
      }
      router.refresh();
    });
  }

  function handleDelete(loanId: string) {
    startTransition(async () => {
      const result = await deleteLoanAction(listingId, loanId);
      if (result?.error) toast.error(tCommon("errorOccurred"));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {loans.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("lender")}</TableHead>
              <TableHead className="text-right">{t("remainingBalance")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("terms")}</TableHead>
              {canManage ? <TableHead className="w-12" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loans.map((loan) => (
              <TableRow key={loan.id}>
                <TableCell className="font-medium">{loan.lender}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {loan.remainingBalanceFormatted}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">
                      {loan.verdtryggt ? t("verdtryggt") : t("overdtryggt")}
                    </Badge>
                    {loan.interestRatePct !== null ? (
                      <Badge variant="outline">
                        {String(loan.interestRatePct).replace(".", ",")}%
                      </Badge>
                    ) : null}
                    {loan.yfirtakanlegt ? (
                      <Badge variant="secondary">{t("yfirtakanlegt")}</Badge>
                    ) : null}
                  </div>
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDelete(loan.id)}
                      disabled={pending}
                      title={t("remove")}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canManage ? (
        <form
          ref={formRef}
          action={handleAdd}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1.2fr_1fr_auto_auto_auto] lg:items-end"
        >
          <div className="grid gap-2">
            <Label htmlFor="loan-lender">{t("lender")}</Label>
            <Input id="loan-lender" name="lender" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="loan-balance">{t("remainingBalance")}</Label>
            <Input id="loan-balance" name="remainingBalanceISK" inputMode="numeric" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="loan-rate">{t("interestRate")}</Label>
            <Input id="loan-rate" name="interestRatePct" inputMode="decimal" placeholder="4,25" />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <input id="loan-verdtryggt" name="verdtryggt" type="checkbox" className="accent-primary size-4" />
            <Label htmlFor="loan-verdtryggt">{t("verdtryggt")}</Label>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <input id="loan-yfirtakanlegt" name="yfirtakanlegt" type="checkbox" className="accent-primary size-4" />
            <Label htmlFor="loan-yfirtakanlegt">{t("yfirtakanlegt")}</Label>
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
