import { cn } from "@/lib/utils";

/**
 * Handsal brand mark: two interlocking arcs meeting in the middle — a
 * stylized handshake. Inherits `currentColor`; the accent dot uses the
 * vertical accent token.
 */
export function HandsalMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-7", className)}
    >
      <path
        d="M4 21c0-6 4-11 9-11 3.2 0 5.2 1.7 6.6 4"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M28 11c0 6-4 11-9 11-3.2 0-5.2-1.7-6.6-4"
        stroke="var(--vertical-accent)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HandsalLogo({
  verticalName,
  className,
  markClassName,
}: {
  /** e.g. "Eignir" / "Bílar" — omitted for the neutral platform lockup */
  verticalName?: string;
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5 font-semibold", className)}>
      <HandsalMark className={markClassName} />
      <span className="flex items-baseline gap-1.5 tracking-tight">
        <span>Handsal</span>
        {verticalName ? (
          <span className="font-normal text-[0.9em] opacity-80">
            {verticalName}
          </span>
        ) : null}
      </span>
    </span>
  );
}
