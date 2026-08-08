import type { ReactNode } from "react";

/**
 * A labelled group of form fields — a subheading + 2-col grid. Gives dense
 * forms visual sections (기본정보 / 가격 / 재고) instead of one uniform grid,
 * so related fields read as a unit.
 */
export function FieldGroup({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section>
      <h3 className="mb-3 border-b border-[#f0f0f0] pb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--brand-blue,#1657c8)]">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
