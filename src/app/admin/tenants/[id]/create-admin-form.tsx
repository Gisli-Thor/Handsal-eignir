"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTenantAdminAction, type TenantActionState } from "../actions";

export function CreateAdminForm({ tenantId }: { tenantId: string }) {
  const t = useTranslations("admin.tenants");
  const tCommon = useTranslations("common");
  const formRef = useRef<HTMLFormElement>(null);
  const lastState = useRef<TenantActionState>(null);
  const [state, formAction, pending] = useActionState<
    TenantActionState,
    FormData
  >(createTenantAdminAction.bind(null, tenantId), null);

  useEffect(() => {
    if (state && state !== lastState.current && state.ok) {
      toast.success(t("adminCreatedToast"));
      formRef.current?.reset();
    }
    lastState.current = state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="admin-name">{t("adminName")}</Label>
        <Input id="admin-name" name="name" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="admin-email">{t("adminEmail")}</Label>
        <Input id="admin-email" name="email" type="email" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="admin-password">{t("tempPassword")}</Label>
        <Input
          id="admin-password"
          name="tempPassword"
          type="password"
          minLength={8}
          required
        />
      </div>
      {state?.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error === "emailTaken"
            ? t("emailTaken")
            : tCommon("errorOccurred")}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {t("addAdmin")}
        </Button>
      </div>
    </form>
  );
}
