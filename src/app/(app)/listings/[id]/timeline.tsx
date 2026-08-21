import {
  ArrowRightLeft,
  CalendarClock,
  HandCoins,
  ListChecks,
  StickyNote,
} from "lucide-react";

/** One row of the unified listing timeline (SPEC §5) — pre-translated and
 * pre-formatted by the server page; this component only renders. */
export interface TimelineEntry {
  id: string;
  icon: "stage" | "offer" | "viewing" | "note" | "task";
  whenFormatted: string;
  text: string;
  detail?: string | null;
}

const ICONS = {
  stage: ArrowRightLeft,
  offer: HandCoins,
  viewing: CalendarClock,
  note: StickyNote,
  task: ListChecks,
} as const;

export function Timeline({ entries, empty }: { entries: TimelineEntry[]; empty: string }) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-sm">{empty}</p>;
  }
  return (
    <ol className="relative grid gap-0">
      {entries.map((entry, index) => {
        const Icon = ICONS[entry.icon];
        return (
          <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < entries.length - 1 ? (
              <span
                aria-hidden
                className="bg-border absolute top-6 left-[11px] h-full w-px"
              />
            ) : null}
            <span className="bg-vertical/10 text-vertical mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
              <Icon aria-hidden className="size-3.5" />
            </span>
            <div className="grid gap-0.5">
              <p className="text-sm">{entry.text}</p>
              {entry.detail ? (
                <p className="text-muted-foreground text-xs whitespace-pre-wrap">{entry.detail}</p>
              ) : null}
              <p className="text-muted-foreground text-xs">{entry.whenFormatted}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
