"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { GripVertical, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  confirmMediaUploadAction,
  deleteMediaAction,
  reorderMediaAction,
  setCoverAction,
  setMediaCategoryAction,
  requestMediaUploadAction,
} from "../media-actions";

type Category = "PHOTO" | "FLOOR_PLAN" | "DOCUMENT_SCAN";

export interface MediaItem {
  id: string;
  thumbUrl: string | null;
  filename: string;
  category: Category;
  isCover: boolean;
}

const CATEGORIES: Category[] = ["PHOTO", "FLOOR_PLAN", "DOCUMENT_SCAN"];

export function MediaManager({
  listingId,
  items,
  canManage,
}: {
  listingId: string;
  items: MediaItem[];
  canManage: boolean;
}) {
  const t = useTranslations("listings.media");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<Category>("PHOTO");
  const [uploadingCount, setUploadingCount] = useState(0);
  const [order, setOrder] = useState<string[] | null>(null);
  const dragId = useRef<string | null>(null);
  const [, startTransition] = useTransition();

  const ordered = order
    ? [...items].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : items;

  async function uploadFiles(files: FileList) {
    setUploadingCount(files.length);
    let failed = 0;
    for (const file of Array.from(files)) {
      try {
        const request = await requestMediaUploadAction(listingId, {
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
        const confirm = await confirmMediaUploadAction(listingId, {
          assetId: request.assetId,
          filename: file.name,
          contentType: file.type,
          category: uploadCategory,
        });
        if (!confirm.ok) throw new Error(confirm.error);
      } catch (error) {
        failed += 1;
        const reason = error instanceof Error ? error.message : "unknown";
        toast.error(
          t("uploadFailed", {
            filename: file.name,
            reason:
              reason === "unsupportedType" || reason === "tooLarge"
                ? t(`errors.${reason}`)
                : tCommon("errorOccurred"),
          }),
        );
      } finally {
        setUploadingCount((count) => count - 1);
      }
    }
    if (failed < files.length) toast.success(t("uploadedToast"));
    router.refresh();
  }

  function run(action: () => Promise<{ ok: boolean }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(tCommon("errorOccurred"));
      router.refresh();
    });
  }

  function handleDrop(targetId: string) {
    const sourceId = dragId.current;
    dragId.current = null;
    if (!sourceId || sourceId === targetId) return;
    const ids = ordered.map((item) => item.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, sourceId);
    setOrder(ids);
    run(() => reorderMediaAction(listingId, ids));
  }

  return (
    <div className="grid gap-4">
      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length) void uploadFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploadingCount > 0}
          >
            <Upload aria-hidden className="size-4" />
            {uploadingCount > 0
              ? t("uploading", { count: uploadingCount })
              : t("upload")}
          </Button>
          <Select
            value={uploadCategory}
            onValueChange={(v) => setUploadCategory(v as Category)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {t(`category.${category}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">{t("uploadHint")}</p>
        </div>
      ) : null}

      {ordered.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ordered.map((item) => (
            <li
              key={item.id}
              draggable={canManage}
              onDragStart={() => (dragId.current = item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(item.id)}
              className={cn(
                "group border-border bg-card relative overflow-hidden rounded-lg border",
                canManage && "cursor-grab active:cursor-grabbing",
              )}
            >
              <div className="bg-muted relative aspect-[4/3]">
                {item.thumbUrl ? (
                  // Signed URLs are short-lived; next/image optimization would
                  // cache/refetch them after expiry, so use a plain <img>.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbUrl}
                    alt={item.filename}
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : null}
                {item.isCover ? (
                  <Badge className="absolute top-2 left-2">{t("cover")}</Badge>
                ) : null}
                {canManage ? (
                  <GripVertical
                    aria-hidden
                    className="text-muted-foreground/60 absolute top-2 right-2 size-4 opacity-0 transition-opacity group-hover:opacity-100"
                  />
                ) : null}
              </div>
              <div className="grid gap-2 p-2">
                <Select
                  value={item.category}
                  disabled={!canManage}
                  onValueChange={(v) =>
                    run(() => setMediaCategoryAction(listingId, item.id, v as Category))
                  }
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {t(`category.${category}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canManage ? (
                  <div className="flex justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={item.category !== "PHOTO" || item.isCover}
                      onClick={() => run(() => setCoverAction(listingId, item.id))}
                      title={t("setCover")}
                    >
                      <Star
                        aria-hidden
                        className={cn("size-4", item.isCover && "fill-current")}
                      />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => run(() => deleteMediaAction(listingId, item.id))}
                      title={tCommon("actions")}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
