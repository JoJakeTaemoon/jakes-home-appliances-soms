"use client";

/**
 * Single-line audit row: timestamp + natural-language sentence + "details" button.
 */

import { useTranslations } from "next-intl";
import { ActionSentence } from "./ActionSentence";
import { useAuditRowFormatter } from "@/lib/audit/use-audit-row-formatter";

export interface AuditRowData {
  id: string;
  at: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityDisplay: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  before: unknown;
  after: unknown;
}

interface Props {
  row: AuditRowData;
  onOpen: (row: AuditRowData) => void;
}

export function AuditRow({ row, onOpen }: Readonly<Props>) {
  const t = useTranslations("reports.audit");
  const fmt = useAuditRowFormatter();
  const at = fmt.formatValue(row.at);

  return (
    <li className="flex flex-col gap-1 border-b border-[#f0f0f0] px-4 py-3 transition-colors hover:bg-[#FAFAFA] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
        <span className="shrink-0 font-mono text-xs text-[#737373]">{at}</span>
        <span className="min-w-0">
          <ActionSentence
            actorName={row.actorName}
            actorRole={row.actorRole}
            actorType={row.actorType}
            action={row.action}
            entityType={row.entityType}
            entityDisplay={row.entityDisplay}
            entityId={row.entityId}
          />
        </span>
      </div>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="shrink-0 self-start rounded-md border border-[var(--brand-blue-500)] px-3 py-1.5 text-xs font-medium text-[var(--brand-blue-700)] transition-transform hover:scale-[1.03] hover:bg-[var(--brand-blue-50)] sm:self-auto"
      >
        {t("viewDetails")}
      </button>
    </li>
  );
}
