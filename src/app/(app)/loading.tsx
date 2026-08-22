import { Loader2 } from "lucide-react";

/** Segment-level loading state for all tenant pages (M5 polish pass). */
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 aria-hidden className="text-vertical size-8 animate-spin" />
    </div>
  );
}
