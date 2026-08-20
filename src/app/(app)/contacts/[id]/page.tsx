import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantUser } from "@/lib/auth-guards";
import { getTenantDb } from "@/lib/db";
import { ContactForm } from "../contact-form";
import { DeleteContactButton } from "./delete-contact-button";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTenantUser();
  const t = await getTranslations("contacts");
  const tCommon = await getTranslations("common");
  const { id } = await params;

  const contact = await getTenantDb(session.user.tenantId).contact.findUnique({
    where: { id },
    include: {
      listingLinks: {
        include: { listing: { include: { property: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!contact) notFound();

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/contacts">
            <ArrowLeft aria-hidden className="size-4" />
            {tCommon("back")}
          </Link>
        </Button>
        <DeleteContactButton contactId={contact.id} contactName={contact.name} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{contact.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactForm
            contact={{
              id: contact.id,
              type: contact.type,
              name: contact.name,
              kennitala: contact.kennitala,
              email: contact.email,
              phone: contact.phone,
              address: contact.address,
              notes: contact.notes,
              tags: contact.tags,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("linkedListings")}</CardTitle>
        </CardHeader>
        <CardContent>
          {contact.listingLinks.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noLinkedListings")}</p>
          ) : (
            <ul className="grid gap-2">
              {contact.listingLinks.map((link) => (
                <li key={link.id} className="flex items-center justify-between gap-3">
                  <Link
                    href={`/listings/${link.listingId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {link.listing.property
                      ? `${link.listing.property.gotuheiti} ${link.listing.property.husnumer}`
                      : t("untitledListing")}
                  </Link>
                  <Badge variant="secondary">{t(`role.${link.role}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
