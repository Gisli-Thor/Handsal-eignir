import { getTranslations } from "next-intl/server";
import { HandsalLogo } from "@/components/brand/logo";
import { UserMenu } from "@/components/user-menu";
import { requireSuperadmin } from "@/lib/auth-guards";
import { AdminNav } from "./admin-nav";

export async function generateMetadata() {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSuperadmin();
  const t = await getTranslations("admin");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 md:px-6">
          <HandsalLogo className="text-base" />
          <span className="border-sidebar-border hidden border-l pl-4 text-xs uppercase tracking-widest opacity-70 sm:inline">
            {t("subtitle")}
          </span>
          <div className="ml-auto">
            <UserMenu
              user={{
                name: session.user.name ?? "",
                email: session.user.email ?? "",
              }}
            />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
