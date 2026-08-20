"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Search } from "lucide-react";
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
import {
  createContactAction,
  lookupKennitalaAction,
  updateContactAction,
  type ContactActionState,
} from "./actions";

export interface ContactFormValues {
  id?: string;
  type: "PERSON" | "COMPANY";
  name: string;
  kennitala: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
}

const EMPTY: ContactFormValues = {
  type: "PERSON",
  name: "",
  kennitala: null,
  email: null,
  phone: null,
  address: null,
  notes: null,
  tags: [],
};

export function ContactForm({ contact }: { contact?: ContactFormValues }) {
  const t = useTranslations("contacts");
  const tCommon = useTranslations("common");
  const initial = contact ?? EMPTY;
  const isEdit = Boolean(contact?.id);

  const [type, setType] = useState<"PERSON" | "COMPANY">(initial.type);
  const [name, setName] = useState(initial.name);
  const [kennitala, setKennitala] = useState(initial.kennitala ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [lookupPending, startLookup] = useTransition();

  const action = isEdit
    ? updateContactAction.bind(null, contact!.id!)
    : createContactAction;
  const [state, formAction, pending] = useActionState<ContactActionState, FormData>(
    action,
    null,
  );
  const lastState = useRef<ContactActionState>(null);

  useEffect(() => {
    if (state && state !== lastState.current && state.ok) {
      toast.success(t("savedToast"));
    }
    lastState.current = state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleLookup() {
    startLookup(async () => {
      const result = await lookupKennitalaAction(kennitala);
      if (result.ok) {
        setName(result.person.name);
        setType(result.person.type);
        setAddress(result.person.address);
        setKennitala(result.person.kennitala);
        toast.success(t("lookup.foundToast", { name: result.person.name }));
      } else {
        toast.error(t(`lookup.errors.${result.error}`));
      }
    });
  }

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>{t("fields.type")}</Label>
          <Select
            name="type"
            value={type}
            onValueChange={(v) => setType(v as "PERSON" | "COMPANY")}
            required
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERSON">{t("type.PERSON")}</SelectItem>
              <SelectItem value="COMPANY">{t("type.COMPANY")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact-kennitala">{t("fields.kennitala")}</Label>
          <div className="flex gap-2">
            <Input
              id="contact-kennitala"
              name="kennitala"
              value={kennitala}
              onChange={(event) => setKennitala(event.target.value)}
              placeholder="000000-0000"
              inputMode="numeric"
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleLookup}
              disabled={lookupPending || kennitala.trim() === ""}
              title={t("lookup.button")}
            >
              <Search aria-hidden className="size-4" />
              <span className="hidden sm:inline">
                {lookupPending ? tCommon("loading") : t("lookup.button")}
              </span>
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t("lookup.hint")}</p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-name">{t("fields.name")}</Label>
        <Input
          id="contact-name"
          name="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="contact-email">{t("fields.email")}</Label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            defaultValue={initial.email ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact-phone">{t("fields.phone")}</Label>
          <Input id="contact-phone" name="phone" defaultValue={initial.phone ?? ""} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-address">{t("fields.address")}</Label>
        <Input
          id="contact-address"
          name="address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-tags">{t("fields.tags")}</Label>
        <Input
          id="contact-tags"
          name="tags"
          defaultValue={initial.tags.join(", ")}
          placeholder={t("fields.tagsPlaceholder")}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-notes">{t("fields.notes")}</Label>
        <textarea
          id="contact-notes"
          name="notes"
          rows={4}
          defaultValue={initial.notes ?? ""}
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error === "kennitalaTaken"
            ? t("errors.kennitalaTaken")
            : state.error === "invalidKennitala"
              ? t("errors.invalidKennitala")
              : tCommon("errorOccurred")}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {isEdit ? tCommon("save") : tCommon("create")}
        </Button>
      </div>
    </form>
  );
}
