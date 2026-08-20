"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions/locale";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { LOCALES } from "@/lib/i18n";

/** Locale picker rendered inside a DropdownMenu (user menu). */
export function LocaleSwitcherItems() {
  const t = useTranslations("locale");
  const locale = useLocale();
  const [, startTransition] = useTransition();

  return (
    <>
      <DropdownMenuLabel className="text-muted-foreground text-xs">
        {t("label")}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={locale}
        onValueChange={(value) => {
          startTransition(() => {
            void setLocaleAction(value);
          });
        }}
      >
        {LOCALES.map((l) => (
          <DropdownMenuRadioItem key={l} value={l}>
            {t(l)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
