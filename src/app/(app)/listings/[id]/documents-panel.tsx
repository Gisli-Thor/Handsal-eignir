"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, FileText, Trash2 } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  confirmDocumentUploadAction,
  deleteDocumentAction,
  requestDocumentUploadAction,
} from "../document-actions";

type DocumentType =
  | "EIGNASKIPTAYFIRLYSING"
  | "SKILALYSING"
  | "VEDBANDAYFIRLIT"
  | "ANNAD";

const DOCUMENT_TYPES: DocumentType[] = [
  "EIGNASKIPTAYFIRLYSING",
  "SKILALYSING",
  "VEDBANDAYFIRLIT",
  "ANNAD",
];

export interface DocumentItem {
  id: string;
  type: DocumentType;
  title: string;
  /** Pre-formatted (Icelandic locale) on the server; null when undated. */
  documentDateFormatted: string | null;
  filename: string;
  sizeBytes: number;
  downloadUrl: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function DocumentsPanel({
  listingId,
  documents,
  canManage,
}: {
  listingId: string;
  documents: DocumentItem[];
  canManage: boolean;
}) {
  const t = useTranslations("listings.documents");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocumentType>("ANNAD");
  const [pending, startTransition] = useTransition();

  function handleUpload(formData: FormData) {
    if (!file) return;
    const title = String(formData.get("title") ?? "").trim() || file.name;
    const documentDate = String(formData.get("documentDate") ?? "");
    startTransition(async () => {
      try {
        const request = await requestDocumentUploadAction(listingId, {
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        });
        if (!request.ok) throw new Error(request.error);
        const put = await fetch(request.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("uploadFailed");
        const confirm = await confirmDocumentUploadAction(listingId, {
          documentId: request.documentId,
          filename: file.name,
          contentType: file.type,
          type,
          title,
          documentDate,
        });
        if (!confirm.ok) throw new Error(confirm.error);
        toast.success(t("uploadedToast"));
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
        router.refresh();
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown";
        toast.error(
          reason === "unsupportedType" || reason === "tooLarge"
            ? t(`errors.${reason}`)
            : tCommon("errorOccurred"),
        );
      }
    });
  }

  function handleDelete(documentId: string) {
    startTransition(async () => {
      const result = await deleteDocumentAction(listingId, documentId);
      if (!result.ok) toast.error(tCommon("errorOccurred"));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {canManage ? (
        <form action={handleUpload} className="grid gap-3 sm:grid-cols-[1fr_1fr] lg:grid-cols-[2fr_1.4fr_1.4fr_1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="doc-file">{t("file")}</Label>
            <Input
              id="doc-file"
              ref={fileInput}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as DocumentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((docType) => (
                  <SelectItem key={docType} value={docType}>
                    {t(`types.${docType}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-title">{t("docTitle")}</Label>
            <Input id="doc-title" name="title" placeholder={file?.name ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-date">{t("date")}</Label>
            <Input id="doc-date" name="documentDate" type="date" />
          </div>
          <Button type="submit" disabled={!file || pending}>
            {pending ? tCommon("loading") : t("upload")}
          </Button>
        </form>
      ) : null}

      {documents.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("docTitle")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("type")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("date")}</TableHead>
              <TableHead className="text-right">{tCommon("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileText aria-hidden className="text-muted-foreground size-4 shrink-0" />
                    <div>
                      <div className="font-medium">{doc.title}</div>
                      <div className="text-muted-foreground text-xs">
                        {doc.filename} · {formatSize(doc.sizeBytes)}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {t(`types.${doc.type}`)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {doc.documentDateFormatted ?? "–"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="sm" title={t("download")}>
                      <a href={doc.downloadUrl}>
                        <Download aria-hidden className="size-4" />
                      </a>
                    </Button>
                    {canManage ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(doc.id)}
                        disabled={pending}
                        title={t("delete")}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
