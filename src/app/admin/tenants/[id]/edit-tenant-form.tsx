"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { updateTenantAction, type TenantActionState } from "../actions";

interface TenantFields {
  id: string;
  name: string;
  slug: string;
  planId: string;
  status: "ACTIVE" | "SUSPENDED";
  email: string | null;
  phone: string | null;
  address: string | null;
  brandColor: string | null;
  logoUrl: string | null;
}

export function EditTenantForm({
  tenant,
  plans,
}: {
  tenant: TenantFields;
  plans: { id: string; name: string }[];
}) {
  const t = useTranslations("admin.tenants");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    TenantActionState,
    FormData
  >(updateTenantAction.bind(null, tenant.id), null);
  const lastState = useRef<TenantActionState>(null);

  useEffect(() => {
    if (state && state !== lastState.current && state.ok) {
      toast.success(t("updatedToast"));
    }
    lastState.current = state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="edit-name">{t("name")}</Label>
        <Input id="edit-name" name="name" required defaultValue={tenant.name} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="edit-slug">{t("slug")}</Label>
        <Input
          id="edit-slug"
          name="slug"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          defaultValue={tenant.slug}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>{t("plan")}</Label>
          <Select name="planId" defaultValue={tenant.planId} required>
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
        <div className="grid gap-2">
          <Label>{t("status")}</Label>
          <Select name="status" defaultValue={tenant.status} required>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">{tCommon("active")}</SelectItem>
              <SelectItem value="SUSPENDED">{tCommon("suspended")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="edit-email">{t("email")}</Label>
          <Input
            id="edit-email"
            name="email"
            type="email"
            defaultValue={tenant.email ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="edit-phone">{t("phone")}</Label>
          <Input id="edit-phone" name="phone" defaultValue={tenant.phone ?? ""} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="edit-address">{t("address")}</Label>
        <Input
          id="edit-address"
          name="address"
          defaultValue={tenant.address ?? ""}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="edit-brand-color">{t("brandColor")}</Label>
          <Input
            id="edit-brand-color"
            name="brandColor"
            placeholder="#b06c3b"
            pattern="#[0-9a-fA-F]{6}"
            defaultValue={tenant.brandColor ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="edit-logo-url">{t("logoUrl")}</Label>
          <Input
            id="edit-logo-url"
            name="logoUrl"
            defaultValue={tenant.logoUrl ?? ""}
          />
        </div>
      </div>
      {state?.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error === "slugTaken"
            ? t("errors.slugTaken")
            : tCommon("errorOccurred")}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
