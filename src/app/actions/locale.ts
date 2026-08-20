"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, toLocale } from "@/lib/i18n";

export async function setLocaleAction(locale: string): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, toLocale(locale), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
