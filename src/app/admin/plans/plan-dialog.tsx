"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createPlanAction,
  updatePlanAction,
  type PlanActionState,
} from "./actions";

interface PlanFields {
  id: string;
  name: string;
  maxActiveListings: number | null;
  monthlyPriceISK: number;
}

export function PlanDialog(
  props: { mode: "create" } | { mode: "edit"; plan: PlanFields },
) {
  const t = useTranslations("admin.plans");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  const action =
    props.mode === "create"
      ? createPlanAction
      : updatePlanAction.bind(null, props.plan.id);
  const [state, formAction, pending] = useActionState<PlanActionState, FormData>(
    action,
    null,
  );

  useEffect(() => {
    if (open && state?.ok) {
      toast.success(props.mode === "create" ? t("createdToast") : t("updatedToast"));
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const plan = props.mode === "edit" ? props.plan : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {props.mode === "create" ? (
          <Button>
            <Plus className="size-4" />
            {t("new")}
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            {tCommon("edit")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {props.mode === "create" ? t("new") : t("edit")}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="plan-name">{t("name")}</Label>
            <Input
              id="plan-name"
              name="name"
              required
              defaultValue={plan?.name ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan-max">{t("maxActiveListings")}</Label>
            <Input
              id="plan-max"
              name="maxActiveListings"
              type="number"
              min={1}
              defaultValue={plan?.maxActiveListings ?? ""}
            />
            <p className="text-muted-foreground text-xs">
              {t("maxActiveListingsHint")}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan-price">{t("monthlyPrice")} (ISK)</Label>
            <Input
              id="plan-price"
              name="monthlyPriceISK"
              type="number"
              min={0}
              required
              defaultValue={plan?.monthlyPriceISK ?? ""}
            />
          </div>
          {state?.error ? (
            <p role="alert" className="text-destructive text-sm">
              {state.error === "nameTaken"
                ? t("errors.nameTaken")
                : tCommon("errorOccurred")}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {props.mode === "create" ? tCommon("create") : tCommon("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
