"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import { addListingContactAction, removeListingContactAction } from "../actions";

type ContactRole = "SELLER" | "BUYER" | "PROSPECTIVE_BUYER" | "CO_OWNER";

const ROLES: ContactRole[] = ["SELLER", "BUYER", "PROSPECTIVE_BUYER", "CO_OWNER"];

export interface ContactLinkItem {
  id: string;
  contactId: string;
  name: string;
  role: ContactRole;
}

export function ContactsPanel({
  listingId,
  links,
  availableContacts,
  canManage,
}: {
  listingId: string;
  links: ContactLinkItem[];
  availableContacts: { id: string; name: string }[];
  canManage: boolean;
}) {
  const t = useTranslations("listings.parties");
  const tRole = useTranslations("contacts.role");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [contactId, setContactId] = useState("");
  const [role, setRole] = useState<ContactRole>("SELLER");
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    startTransition(async () => {
      const result = await addListingContactAction(listingId, contactId, role);
      if (result?.error) toast.error(tCommon("errorOccurred"));
      else setContactId("");
      router.refresh();
    });
  }

  function handleRemove(linkId: string) {
    startTransition(async () => {
      const result = await removeListingContactAction(listingId, linkId);
      if (result?.error) toast.error(tCommon("errorOccurred"));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-48 flex-1 gap-2">
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectContact")} />
              </SelectTrigger>
              <SelectContent>
                {availableContacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={role} onValueChange={(v) => setRole(v as ContactRole)}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {tRole(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" onClick={handleAdd} disabled={!contactId || pending}>
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
                <Link
                  href={`/contacts/${link.contactId}`}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {link.name}
                </Link>
                <Badge variant="secondary">{tRole(link.role)}</Badge>
              </div>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(link.id)}
                  disabled={pending}
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
