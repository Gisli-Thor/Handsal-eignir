"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addListingAgentAction, removeListingAgentAction } from "../actions";

export interface AgentLinkItem {
  id: string;
  userId: string;
  name: string;
  isPrimary: boolean;
}

export function AgentsPanel({
  listingId,
  links,
  availableUsers,
  canManage,
}: {
  listingId: string;
  links: AgentLinkItem[];
  availableUsers: { id: string; name: string }[];
  canManage: boolean;
}) {
  const t = useTranslations("listings.agents");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [pending, startTransition] = useTransition();

  const assignedIds = new Set(links.map((link) => link.userId));
  const selectable = availableUsers.filter((user) => !assignedIds.has(user.id));

  function handleAdd() {
    startTransition(async () => {
      const result = await addListingAgentAction(listingId, userId);
      if (result?.error) toast.error(tCommon("errorOccurred"));
      else setUserId("");
      router.refresh();
    });
  }

  function handleRemove(linkId: string) {
    startTransition(async () => {
      const result = await removeListingAgentAction(listingId, linkId);
      if (result?.error) toast.error(tCommon("errorOccurred"));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-48 flex-1 gap-2">
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectUser")} />
              </SelectTrigger>
              <SelectContent>
                {selectable.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={handleAdd} disabled={!userId || pending}>
            <UserPlus aria-hidden className="size-4" />
            {t("add")}
          </Button>
        </div>
      ) : null}

      {links.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{link.name}</span>
                {link.isPrimary ? (
                  <Badge variant="secondary">{t("primary")}</Badge>
                ) : null}
              </div>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(link.id)}
                  disabled={pending || links.length === 1}
                  title={t("remove")}
                >
                  <X aria-hidden className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
