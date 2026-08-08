import { cn } from "@/lib/cn";

export interface LegendItem {
  /** 1-based area number shown in the circled badge. */
  n: number;
  title: string;
  body: string;
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

/**
 * Numbered area-explanation footer (①~⑤) matching the client's desktop-ERP
 * mockups. Each item maps a circled number to a short "what this area does".
 */
export function LegendFooter({
  items,
  className,
}: {
  items: LegendItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-6 gap-y-4 border-t border-[#e5e5e5] bg-[#fafafa] px-4 py-4 text-sm sm:grid-cols-2 lg:grid-cols-5",
        className,
      )}
    >
      {items.map((it) => (
        <div key={it.n}>
          <div className="flex items-center gap-1.5 font-semibold text-[var(--brand-blue,#1f6feb)]">
            <span aria-hidden>{CIRCLED[it.n - 1] ?? it.n}</span>
            <span>{it.title}</span>
          </div>
          <p className="mt-1 leading-snug text-[#586a7c]">{it.body}</p>
        </div>
      ))}
    </div>
  );
}
