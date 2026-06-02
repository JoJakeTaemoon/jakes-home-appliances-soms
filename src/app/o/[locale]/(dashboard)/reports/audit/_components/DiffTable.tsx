"use client";

/**
 * 3-column field-level diff: label / before / after.
 *
 * CREATE rows render with a "newly created" banner + after-only column.
 * DELETE rows mirror that with a "deleted" banner + before-only column.
 * UPDATE rows show only fields that actually changed.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeDiff } from "@/lib/audit/diff";
import { useAuditRowFormatter } from "@/lib/audit/use-audit-row-formatter";

interface Props {
  entityType: string;
  before: unknown;
  after: unknown;
}

export function DiffTable({ entityType, before, after }: Readonly<Props>) {
  const t = useTranslations("reports.audit.diff");
  const fmt = useAuditRowFormatter();

  const entries = useMemo(() => computeDiff(before, after), [before, after]);

  if (entries.length === 0) {
    return <p className="text-sm text-[#737373]">{t("noChanges")}</p>;
  }

  const kind = entries[0].kind;
  const showBefore = kind !== "created";
  const showAfter = kind !== "deleted";

  return (
    <div className="flex flex-col gap-2">
      {kind === "created" && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          {t("createdHeader")}
        </p>
      )}
      {kind === "deleted" && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {t("deletedHeader")}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-[#737373]">
              <th className="border-b-2 border-[#e5e5e5] py-2 pr-3 font-medium">
                {t("field")}
              </th>
              {showBefore && (
                <th className="border-b-2 border-[#e5e5e5] py-2 pr-3 font-medium">
                  {t("before")}
                </th>
              )}
              {showAfter && (
                <th className="border-b-2 border-[#e5e5e5] py-2 pr-3 font-medium">
                  {t("after")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.field}
                className="border-b border-[#f0f0f0] align-top"
              >
                <td className="py-2 pr-3 font-medium text-[#525252]">
                  {fmt.fieldLabel(entityType, entry.field)}
                </td>
                {showBefore && (
                  <td className="py-2 pr-3 text-[#737373]">
                    <span className="whitespace-pre-wrap break-words">
                      {fmt.formatValue(entry.beforeValue)}
                    </span>
                  </td>
                )}
                {showAfter && (
                  <td className="py-2 pr-3 text-[#171717]">
                    <span className="whitespace-pre-wrap break-words">
                      {fmt.formatValue(entry.afterValue)}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
