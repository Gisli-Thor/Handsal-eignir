import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireTenantUser } from "@/lib/auth-guards";
import { getTenantDb } from "@/lib/db";
import { formatKennitala } from "@/core/contacts/kennitala";

export async function generateMetadata() {
  const t = await getTranslations("contacts");
  return { title: t("title") };
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireTenantUser();
  const t = await getTranslations("contacts");
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const contacts = await getTenantDb(session.user.tenantId).contact.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { kennitala: { contains: query.replace(/[\s-]/g, "") } },
            { tags: { has: query } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
    take: 200,
  });

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Button asChild>
          <Link href="/contacts/new">
            <Plus aria-hidden className="size-4" />
            {t("new")}
          </Link>
        </Button>
      </div>

      <form action="/contacts" className="relative max-w-sm">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t("searchPlaceholder")}
          className="pl-9"
        />
      </form>

      <Card>
        <CardContent>
          {contacts.length === 0 ? (
            <div className="text-muted-foreground py-10 text-center text-sm">
              {query ? t("emptySearch") : t("empty")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fields.name")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("fields.kennitala")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("fields.contactInfo")}
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("fields.tags")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="font-medium hover:underline"
                      >
                        {contact.name}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {t(`type.${contact.type}`)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-sm sm:table-cell">
                      {contact.kennitala ? formatKennitala(contact.kennitala) : "–"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="text-sm">{contact.email ?? "–"}</div>
                      <div className="text-muted-foreground text-xs">
                        {contact.phone ?? ""}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
