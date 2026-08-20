"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  Building2,
  Car,
  ChartNoAxesColumn,
  Handshake,
  LayoutDashboard,
  Menu,
  Settings,
  Users,
} from "lucide-react";
import { HandsalLogo } from "@/components/brand/logo";
import { UserMenu } from "@/components/user-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { VerticalNavItem } from "@/verticals/types";
import { cn } from "@/lib/utils";

const ICONS: Record<VerticalNavItem["icon"], ComponentType<{ className?: string }>> = {
  "listings-eignir": Building2,
  "listings-bilar": Car,
  contacts: Users,
  offers: Handshake,
  reports: ChartNoAxesColumn,
};

export interface AppShellProps {
  verticalKey: "eignir" | "bilar";
  /** Short vertical name for the logo lockup, e.g. "Eignir" */
  verticalShortName: string;
  tenantName: string;
  user: { name: string; email: string };
  navItems: VerticalNavItem[];
  children: React.ReactNode;
}

function NavLinks({
  verticalKey,
  navItems,
  onNavigate,
}: Pick<AppShellProps, "verticalKey" | "navItems"> & {
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();

  const baseItems = [
    { href: "/dashboard", label: t("dashboard"), Icon: LayoutDashboard },
  ];

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    );

  return (
    <nav className="grid gap-1 px-3">
      {baseItems.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} className={linkClass(active)}>
            <Icon className="size-4 shrink-0" />
            {label}
            {active ? (
              <span className="bg-sidebar-primary ml-auto size-1.5 rounded-full" />
            ) : null}
          </Link>
        );
      })}
      {navItems.map((item) => {
        const Icon = ICONS[item.icon];
        const label = t(`${verticalKey}.${item.labelKey}`);
        if (item.comingSoon) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              className="text-sidebar-foreground/40 flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm font-medium"
            >
              <Icon className="size-4 shrink-0" />
              {label}
              <Badge
                variant="outline"
                className="border-sidebar-border text-sidebar-foreground/50 ml-auto text-[10px]"
              >
                {tCommon("comingSoon")}
              </Badge>
            </span>
          );
        }
        const active = pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate} className={linkClass(active)}>
            <Icon className="size-4 shrink-0" />
            {label}
            {active ? (
              <span className="bg-sidebar-primary ml-auto size-1.5 rounded-full" />
            ) : null}
          </Link>
        );
      })}
      <Link
        href="/settings"
        onClick={onNavigate}
        className={linkClass(pathname.startsWith("/settings"))}
      >
        <Settings className="size-4 shrink-0" />
        {t("settings")}
      </Link>
    </nav>
  );
}

function SidebarContent(props: Pick<AppShellProps, "verticalKey" | "verticalShortName" | "tenantName" | "navItems"> & { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="text-sidebar-foreground px-6 pt-6 pb-5">
        <HandsalLogo verticalName={props.verticalShortName} className="text-lg" />
        <p className="text-sidebar-foreground/60 mt-1 truncate text-xs">
          {props.tenantName}
        </p>
      </div>
      <NavLinks
        verticalKey={props.verticalKey}
        navItems={props.navItems}
        onNavigate={props.onNavigate}
      />
    </div>
  );
}

export function AppShell({
  verticalKey,
  verticalShortName,
  tenantName,
  user,
  navItems,
  children,
}: AppShellProps) {
  const t = useTranslations("nav");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-svh">
      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-svh w-64 shrink-0 border-r md:block">
        <SidebarContent
          verticalKey={verticalKey}
          verticalShortName={verticalShortName}
          tenantName={tenantName}
          navItems={navItems}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={t("openMenu")}
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-sidebar w-72 border-0 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>{t("openMenu")}</SheetTitle>
              </SheetHeader>
              <SidebarContent
                verticalKey={verticalKey}
                verticalShortName={verticalShortName}
                tenantName={tenantName}
                navItems={navItems}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1 truncate text-sm font-medium md:hidden">
            {tenantName}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
