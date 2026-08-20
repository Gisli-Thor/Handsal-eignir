import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantUser } from "@/lib/auth-guards";
import { ContactForm } from "../contact-form";

export async function generateMetadata() {
  const t = await getTranslations("contacts");
  return { title: t("new") };
}

export default async function NewContactPage() {
  await requireTenantUser();
  const t = await getTranslations("contacts");
  const tCommon = await getTranslations("common");

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/contacts">
            <ArrowLeft aria-hidden className="size-4" />
            {tCommon("back")}
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("new")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactForm />
        </CardContent>
      </Card>
    </div>
  );
}
