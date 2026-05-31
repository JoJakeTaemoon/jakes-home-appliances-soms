"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Optional className for the cell + header. */
  className?: string;
  /** Render the cell value. */
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Server-side sort key (sent as ?sortBy=…). Header becomes clickable when set. */
  sortKey?: string;
}

export interface SortState {
  column: string;
  direction: "asc" | "desc";
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  /** Unique key per row. */
  rowKey: (row: T) => string;
  /** Click handler (e.g. open detail page). */
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyText?: string;
  /** Slot above the table (filters, search). */
  toolbar?: ReactNode;
  /** Slot below the table (pagination). */
  footer?: ReactNode;
  /** Sticky header. */
  stickyHeader?: boolean;
  className?: string;
  /** Current sort state for the rendered table. */
  sort?: SortState | null;
  /** Called when the user clicks a sortable header. */
  onSortChange?: (next: SortState) => void;
}

const ALIGN: Record<NonNullable<Column<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isLoading,
  emptyText = "No data",
  toolbar,
  footer,
  stickyHeader = true,
  className,
  sort,
  onSortChange,
}: Readonly<Props<T>>) {
  const handleSort = (sortKey: string) => {
    if (!onSortChange) return;
    if (sort?.column === sortKey) {
      onSortChange({ column: sortKey, direction: sort.direction === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ column: sortKey, direction: "asc" });
    }
  };
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {toolbar && <div className="flex flex-col gap-3">{toolbar}</div>}

      <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead
              className={cn(
                "bg-[#fafafa] text-[#525252]",
                stickyHeader && "sticky top-0 z-10",
              )}
            >
              <tr>
                {columns.map((c) => {
                  const sortable = !!c.sortKey && !!onSortChange;
                  const active = sortable && sort?.column === c.sortKey;
                  const indicator = active ? (sort?.direction === "asc" ? " ▲" : " ▼") : sortable ? " ↕" : "";
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      onClick={sortable && c.sortKey ? () => handleSort(c.sortKey!) : undefined}
                      className={cn(
                        "border-b border-[#e5e5e5] px-3 py-2.5 text-xs font-medium uppercase tracking-wider",
                        ALIGN[c.align ?? "left"],
                        sortable && "cursor-pointer select-none hover:text-[#111111]",
                        c.className,
                      )}
                    >
                      {c.header}
                      {sortable && (
                        <span className={active ? "text-[var(--brand-blue-700)]" : "text-[#a3a3a3]"}>
                          {indicator}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-[#737373]">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-[#a3a3a3]">
                    {emptyText}
                  </td>
                </tr>
              )}
              {!isLoading &&
                rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-[#f5f5f5] last:border-b-0",
                      onRowClick && "cursor-pointer hover:bg-[#fafafa]",
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 py-2.5 text-sm text-[#111111]",
                          ALIGN[c.align ?? "left"],
                          c.className,
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {footer && <div>{footer}</div>}
    </div>
  );
}

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: Readonly<PaginationProps>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-[#737373]">
      <span>
        {start}–{end} / {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-md border border-[#e5e5e5] px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
        >
          ‹
        </button>
        <span className="px-2 text-xs">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-md border border-[#e5e5e5] px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
        >
          ›
        </button>
      </div>
    </div>
  );
}
