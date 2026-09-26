import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Right-aligned value emphasis (e.g. money). */
  variant?: "default" | "money" | "warning";
  /** Compact strip: ~half the height (tighter padding, smaller value, hint hidden). */
  dense?: boolean;
}

/**
 * Compact KPI card used by the customer-list KPI strip + the customer-detail
 * top KPI panel. The Jake's Home Appliances design system: warm cream canvas, 4px sharp
 * borders, brand-blue accent. Keep it stateless — accepts pre-computed
 * values.
 */
export function KpiCard({ label, value, hint, icon, variant = "default", dense = false }: KpiCardProps) {
  const valueColor =
    variant === "money"
      ? "text-blue-700"
      : variant === "warning"
        ? "text-red-700"
        : "text-gray-900";
  if (dense) {
    // ~half height: tight padding, small value, hint dropped, single stack.
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors hover:border-blue-300">
        {icon ? <div className="flex size-6 flex-shrink-0 items-center justify-center rounded bg-blue-50 text-blue-600">{icon}</div> : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
          <div className={`text-lg font-semibold leading-tight ${valueColor}`}>{value}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border-2 border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-300">
      {icon ? (
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
          {icon}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
        <div className={`mt-1 text-2xl font-semibold leading-tight ${valueColor}`}>{value}</div>
        {hint ? <div className="mt-1 text-[11px] text-gray-500">{hint}</div> : null}
      </div>
    </div>
  );
}
