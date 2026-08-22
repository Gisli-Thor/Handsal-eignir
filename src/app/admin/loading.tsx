import { Loader2 } from "lucide-react";

/** Segment-level loading state for the superadmin area (M5 polish pass). */
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 aria-hidden className="text-primary size-8 animate-spin" />
    </div>
  );
}
