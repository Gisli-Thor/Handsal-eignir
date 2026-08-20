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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTenantAction, type TenantActionState } from "./actions";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[áàâä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/[ýÿ]/g, "y")
    .replace(/æ/g, "ae")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreateTenantDialog({
  plans,
}: {
  plans: { id: string; name: string }[];
}) {
  const t = useTranslations("admin.tenants");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [state, formAction, pending] = useActionState<
    TenantActionState,
    FormData
  >(createTenantAction, null);

  useEffect(() => {
    if (open && state?.ok) {
      toast.success(t("createdToast"));
      setOpen(false);
      setSlug("");
      setSlugEdited(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="tenant-name">{t("name")}</Label>
            <Input
              id="tenant-name"
              name="name"
              required
              onChange={(e) => {
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tenant-slug">{t("slug")}</Label>
            <Input
              id="tenant-slug"
              name="slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("vertical")}</Label>
            <Select name="vertical" defaultValue="EIGNIR" required>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EIGNIR">
                  {tCommon("verticalLabel.EIGNIR")}
                </SelectItem>
                <SelectItem value="BILAR">
                  {tCommon("verticalLabel.BILAR")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>{t("plan")}</Label>
            <Select name="planId" defaultValue={plans[0]?.id} required>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state?.error ? (
            <p role="alert" className="text-destructive text-sm">
              {state.error === "slugTaken"
                ? t("errors.slugTaken")
                : state.error === "invalid"
                  ? t("errors.invalidSlug")
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
              {tCommon("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
