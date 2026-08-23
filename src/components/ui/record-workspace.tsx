import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Side-by-side master-detail frame: **left detail panel stays fixed in view,
 * right list scrolls independently** — the page itself barely scrolls.
 *
 * On desktop (lg+) both columns share a height-constrained row: the detail
 * column scrolls within itself only when its form is tall, and the list column
 * owns its own vertical scroll (the list child should be `flex h-full flex-col`
 * with a `flex-1 overflow-y-auto` table region + sticky header). Below lg it
 * stacks and the page scrolls normally (mobile is not the target here).
 *
 * `heightClass` is the one knob that must be tuned to the surrounding page
 * chrome (topbar + breadcrumb + page header + tabs). Default assumes the office
 * dashboard shell; override per screen if the header height differs.
 */
export function RecordWorkspace({
  detail,
  list,
  heightClass = "lg:h-[calc(100dvh-12rem)]",
  className,
}: Readonly<{
  detail: ReactNode;
  list: ReactNode;
  heightClass?: string;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        "grid gap-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]",
        heightClass,
        className,
      )}
    >
      {/* Left — detail/form. Fixed in view; scrolls within itself only if tall.
          min-h-0 is the flex/grid scroll-trap requirement, not optional. */}
      <div className="min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto">{detail}</div>
      {/* Right — list owns its own vertical scroll (child is flex h-full flex-col). */}
      <div className="flex min-w-0 flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">{list}</div>
    </div>
  );
}
