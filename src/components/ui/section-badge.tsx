/** Numbered blue section badge (① ② ③) matching the ERP mockup headers. */
export function SectionBadge({ n, title }: Readonly<{ n: number; title: string }>) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[var(--brand-blue-600,#1657c8)] text-[11px] font-bold text-white">
        {n}
      </span>
      <h2 className="text-sm font-semibold text-[#002A4D]">{title}</h2>
    </div>
  );
}
