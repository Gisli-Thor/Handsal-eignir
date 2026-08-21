"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import {
  addNoteAction,
  addTaskAction,
  addViewingAction,
  deleteNoteAction,
  deleteTaskAction,
  deleteViewingAction,
  toggleTaskAction,
} from "../activity-actions";

// ── Viewings (skoðun / opið hús) ─────────────────────────────────────────────

export interface ViewingItem {
  id: string;
  kind: "SKODUN" | "OPID_HUS";
  startsAtFormatted: string;
  endsAtFormatted: string | null;
  note: string | null;
  attendees: string[];
  upcoming: boolean;
}

export function ViewingsPanel({
  listingId,
  viewings,
  availableContacts,
  canManage,
}: {
  listingId: string;
  viewings: ViewingItem[];
  availableContacts: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const t = useTranslations("activity.viewings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-4">
      {viewings.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {viewings.map((viewing) => (
            <li key={viewing.id} className="flex items-start gap-3 rounded-md border p-3">
              <div className="grid flex-1 gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={viewing.kind === "OPID_HUS" ? "default" : "secondary"}>
                    {t(`kind.${viewing.kind}`)}
                  </Badge>
                  <span className={cn("text-sm", viewing.upcoming && "font-medium")}>
                    {viewing.startsAtFormatted}
                    {viewing.endsAtFormatted ? ` – ${viewing.endsAtFormatted}` : ""}
                  </span>
                  {viewing.upcoming ? (
                    <Badge variant="outline">{t("upcoming")}</Badge>
                  ) : null}
                </div>
                {viewing.attendees.length > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t("attendees")}: {viewing.attendees.join(", ")}
                  </p>
                ) : null}
                {viewing.note ? <p className="text-sm">{viewing.note}</p> : null}
              </div>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteViewingAction(listingId, viewing.id);
                      if (result?.error) toast.error(tCommon("errorOccurred"));
                      router.refresh();
                    })
                  }
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form
          ref={formRef}
          action={(formData) => {
            startTransition(async () => {
              const result = await addViewingAction(listingId, null, formData);
              if (result?.error) {
                toast.error(
                  result.error === "invalid" ? t("errors.invalid") : tCommon("errorOccurred"),
                );
              } else {
                formRef.current?.reset();
              }
              router.refresh();
            });
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <div className="grid gap-2">
            <Label>{t("kindLabel")}</Label>
            <Select name="kind" defaultValue="SKODUN">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SKODUN">{t("kind.SKODUN")}</SelectItem>
                <SelectItem value="OPID_HUS">{t("kind.OPID_HUS")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="viewing-starts">{t("startsAt")}</Label>
            <Input id="viewing-starts" name="startsAt" type="datetime-local" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="viewing-ends">{t("endsAt")}</Label>
            <Input id="viewing-ends" name="endsAt" type="datetime-local" />
          </div>
          <div className="grid gap-2">
            <Label>{t("attendeeLabel")}</Label>
            <select
              name="attendeeContactId"
              multiple
              size={3}
              className="border-input bg-transparent focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
            >
              {availableContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="viewing-note">{t("note")}</Label>
            <Input id="viewing-note" name="note" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              <Plus aria-hidden className="size-4" />
              {t("add")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export interface TaskItem {
  id: string;
  title: string;
  dueDateFormatted: string | null;
  overdue: boolean;
  assigneeName: string | null;
  done: boolean;
}

export function TasksPanel({
  listingId,
  tasks,
  availableUsers,
  canManage,
}: {
  listingId: string;
  tasks: TaskItem[];
  availableUsers: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const t = useTranslations("activity.tasks");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-4">
      {tasks.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-1.5">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <input
                type="checkbox"
                checked={task.done}
                disabled={!canManage || pending}
                className="accent-primary size-4"
                onChange={(event) =>
                  startTransition(async () => {
                    const result = await toggleTaskAction(
                      listingId,
                      task.id,
                      event.target.checked,
                    );
                    if (result?.error) toast.error(tCommon("errorOccurred"));
                    router.refresh();
                  })
                }
              />
              <div className="grid flex-1 gap-0.5">
                <span className={cn("text-sm", task.done && "text-muted-foreground line-through")}>
                  {task.title}
                </span>
                <span className="text-muted-foreground text-xs">
                  {task.dueDateFormatted ? (
                    <span className={cn(task.overdue && !task.done && "text-destructive font-medium")}>
                      {t("due")}: {task.dueDateFormatted}
                    </span>
                  ) : null}
                  {task.dueDateFormatted && task.assigneeName ? " · " : null}
                  {task.assigneeName}
                </span>
              </div>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteTaskAction(listingId, task.id);
                      if (result?.error) toast.error(tCommon("errorOccurred"));
                      router.refresh();
                    })
                  }
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form
          ref={formRef}
          action={(formData) => {
            startTransition(async () => {
              const result = await addTaskAction(listingId, null, formData);
              if (result?.error) {
                toast.error(
                  result.error === "invalid" ? t("errors.invalid") : tCommon("errorOccurred"),
                );
              } else {
                formRef.current?.reset();
              }
              router.refresh();
            });
          }}
          className="grid gap-3 lg:grid-cols-[1.8fr_1fr_1fr_auto] lg:items-end"
        >
          <div className="grid gap-2">
            <Label htmlFor="task-title">{t("title")}</Label>
            <Input id="task-title" name="title" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-due">{t("due")}</Label>
            <Input id="task-due" name="dueDate" type="date" />
          </div>
          <div className="grid gap-2">
            <Label>{t("assignee")}</Label>
            <Select name="assigneeUserId">
              <SelectTrigger>
                <SelectValue placeholder={t("unassigned")} />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={pending}>
            <Plus aria-hidden className="size-4" />
            {t("add")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

// ── Notes ────────────────────────────────────────────────────────────────────

export interface NoteItem {
  id: string;
  body: string;
  createdAtFormatted: string;
  authorName: string | null;
}

export function NotesPanel({
  listingId,
  notes,
  canManage,
}: {
  listingId: string;
  notes: NoteItem[];
  canManage: boolean;
}) {
  const t = useTranslations("activity.notes");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-4">
      {notes.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {notes.map((note) => (
            <li key={note.id} className="flex items-start gap-3 rounded-md border p-3">
              <div className="grid flex-1 gap-1">
                <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                <p className="text-muted-foreground text-xs">
                  {note.authorName ? `${note.authorName} · ` : ""}
                  {note.createdAtFormatted}
                </p>
              </div>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteNoteAction(listingId, note.id);
                      if (result?.error) toast.error(tCommon("errorOccurred"));
                      router.refresh();
                    })
                  }
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form
          ref={formRef}
          action={(formData) => {
            startTransition(async () => {
              const result = await addNoteAction(listingId, null, formData);
              if (result?.error) toast.error(tCommon("errorOccurred"));
              else formRef.current?.reset();
              router.refresh();
            });
          }}
          className="grid gap-2"
        >
          <Label htmlFor="note-body">{t("newNote")}</Label>
          <textarea
            id="note-body"
            name="body"
            rows={2}
            required
            className="border-input bg-transparent focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
          />
          <div>
            <Button type="submit" disabled={pending}>
              <Plus aria-hidden className="size-4" />
              {t("add")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
