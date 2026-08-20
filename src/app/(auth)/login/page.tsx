import { getTranslations } from "next-intl/server";
import { HandsalLogo } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("title") };
}

export default function LoginPage() {
  return (
    <main className="bg-sidebar flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-sidebar-foreground mb-8 flex justify-center">
          <HandsalLogo className="text-2xl" markClassName="size-9" />
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
