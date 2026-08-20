"use client";

import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { LocaleSwitcherItems } from "@/components/locale-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations();
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={t("nav.userMenu")}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-vertical/15 text-foreground text-xs font-semibold">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate">{user.name}</div>
          <div className="text-muted-foreground truncate text-xs font-normal">
            {user.email}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <LocaleSwitcherItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void signOutAction();
          }}
        >
          <LogOut className="size-4" />
          {t("auth.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
