"use client";

/**
 * Detail drawer for one audit row.
 *
 * Layout (top→bottom):
 *   1. ActionSentence — 1-line natural language
 *   2. DiffTable      — only changed fields
 *   3. Metadata block — time + IP + user agent
 *   4. Technical info — collapsed by default; raw action code + entityType +
 *      entityId + redacted JSON dump (power-user compatibility)
 *
 * We use the shared `<Modal>` component since the project doesn't have a
 * dedicated drawer primitive; sizing is `lg` so it reads well on desktop
 * and full-width on mobile.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { ActionSentence } from "./ActionSentence";
import { DiffTable } from "./DiffTable";
import { useAuditRowFormatter } from "@/lib/audit/use-audit-row-formatter";
import type { AuditRowData } from "./AuditRow";

interface Props {
  row: AuditRowData | null;
  open: boolean;
  onClose: () => void;
}

export function AuditDetailDrawer({ row, open, onClose }: Readonly<Props>) {
  const t = useTranslations("reports.audit");
  const tDetails = useTranslations("reports.audit.details");
  const fmt = useAuditRowFormatter();
  const [showTechnical, setShowTechnical] = useState(false);

  if (!row) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="text-base font-semibold text-[#002A4D]">
          {t("viewDetails")}
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <section className="rounded-md border-2 border-[var(--brand-blue-100)] bg-[var(--brand-blue-50)] p-3 text-sm">
          <ActionSentence
            actorName={row.actorName}
            actorRole={row.actorRole}
            actorType={row.actorType}
            action={row.action}
            entityType={row.entityType}
            entityDisplay={row.entityDisplay}
            entityId={row.entityId}
          />
        </section>

        <section>
          <DiffTable
            entityType={row.entityType}
            before={row.before}
            after={row.after}
          />
        </section>

        <section className="rounded-md border-2 border-[#e5e5e5] bg-white p-3 text-xs">
          <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#737373]">
            {tDetails("metadata")}
          </h4>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-[#737373]">{tDetails("time")}:</dt>
              <dd className="font-mono text-[#525252]">
                {fmt.formatValue(row.at)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[#737373]">{tDetails("ip")}:</dt>
              <dd className="font-mono text-[#525252]">
                {row.ipAddress ?? "—"}
              </dd>
            </div>
            <div className="col-span-1 flex gap-2 sm:col-span-2">
              <dt className="shrink-0 text-[#737373]">{tDetails("userAgent")}:</dt>
              <dd className="break-all font-mono text-[#525252]">
                {row.userAgent ?? "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-md border-2 border-[#e5e5e5] bg-white p-3">
          <button
            type="button"
            onClick={() => setShowTechnical((v) => !v)}
            className="flex w-full items-center justify-between text-left text-xs font-medium uppercase tracking-wider text-[#737373] hover:text-[#171717]"
            aria-expanded={showTechnical}
          >
            <span>{tDetails("technical")}</span>
            <span aria-hidden="true">{showTechnical ? "−" : "+"}</span>
          </button>
          {showTechnical && (
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-[#737373]">{tDetails("rawAction")}:</dt>
                  <dd className="font-mono break-all text-[#525252]">
                    {row.action}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-[#737373]">{tDetails("rawEntityType")}:</dt>
                  <dd className="font-mono break-all text-[#525252]">
                    {row.entityType}
                  </dd>
                </div>
                <div className="col-span-1 flex gap-2 sm:col-span-2">
                  <dt className="shrink-0 text-[#737373]">
                    {tDetails("rawEntityId")}:
                  </dt>
                  <dd className="break-all font-mono text-[#525252]">
                    {row.entityId ?? "—"}
                  </dd>
                </div>
              </div>
              <div>
                <p className="mb-1 text-[#737373]">{tDetails("rawBefore")}</p>
                <pre className="overflow-x-auto rounded-md bg-[#FAFAFA] p-2 text-[11px] font-mono text-[#525252]">
                  {row.before
                    ? JSON.stringify(row.before, null, 2)
                    : "—"}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-[#737373]">{tDetails("rawAfter")}</p>
                <pre className="overflow-x-auto rounded-md bg-[#FAFAFA] p-2 text-[11px] font-mono text-[#525252]">
                  {row.after ? JSON.stringify(row.after, null, 2) : "—"}
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
