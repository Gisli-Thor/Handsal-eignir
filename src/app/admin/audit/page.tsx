import { getTranslations } from "next-intl/server";
import { requireSuperadmin } from "@/lib/auth-guards";
import { unscopedDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminAuditPage() {
  await requireSuperadmin();
  const t = await getTranslations("admin.audit");

  // Superadmins only see platform-level events (tenantId = null), never
  // tenant business data (SPEC §3).
  const entries = await unscopedDb.auditLog.findMany({
    where: { tenantId: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actorUser: { select: { name: true, email: true } } },
  });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("when")}</TableHead>
            <TableHead>{t("action")}</TableHead>
            <TableHead>{t("actor")}</TableHead>
            <TableHead>{t("target")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                {t("empty")}
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDateTime(entry.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">
                    {entry.action}
                  </Badge>
                </TableCell>
                <TableCell>
                  {entry.actorUser ? (
                    <>
                      <div className="text-sm">{entry.actorUser.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {entry.actorUser.email}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {entry.targetType ? `${entry.targetType} · ${entry.targetId}` : "–"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
