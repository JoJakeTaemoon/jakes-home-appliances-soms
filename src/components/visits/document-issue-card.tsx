"use client";

/**
 * "지참 서류" card on the office visit-detail page.
 *
 * - Renders the auto-suggested DocumentKind (visit type + customer type +
 *   contract type) with a one-click "발급" button.
 * - Lists previously issued documents with download / re-issue actions
 *   per row.
 * - Lets the operator add a different kind via a dropdown.
 * - Disables issuance when the visit policy gate blocks it (SUGGESTED,
 *   CANCELLED, FAILED_NO_SHOW, or no leadTechnicianId).
 *
 * Talks to:
 *   POST /api/visits/[id]/issue-document
 *   GET  /api/visits/[id]/documents/[docId]/download
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api/client";
import { canIssueVisitDocument } from "@/lib/visits/document-policy";
import {
  suggestVisitDocumentKind,
  VISIT_DOCUMENT_KINDS,
  type VisitDocumentKind,
} from "@/lib/visits/document-suggest";

interface IssuedDocument {
  id: string;
  kind: string;
  filename: string;
  generatedAt: string;
}

interface Props {
  visitId: string;
  /** Visit state string from the server — narrowed to the policy enum internally. */
  state: string;
  leadTechnicianId: string | null;
  visitType: string;
  customerType: "B2C" | "B2B";
  /** Latest active contract type for the customer, if available. */
  contractType: "RENTAL" | "SALE" | "MAINTENANCE" | null;
  documents: IssuedDocument[];
  onIssued: () => void | Promise<void>;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (v: number) => (v < 10 ? `0${v}` : String(v));
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DocumentIssueCard({
  visitId,
  state,
  leadTechnicianId,
  visitType,
  customerType,
  contractType,
  documents,
  onIssued,
}: Readonly<Props>) {
  const t = useTranslations("visits.documents");
  const api = useApi();
  const [busy, setBusy] = useState<string | null>(null);
  const [pickKind, setPickKind] = useState<VisitDocumentKind>("WORK_CONFIRMATION");
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const policy = canIssueVisitDocument({
    state: state as Parameters<typeof canIssueVisitDocument>[0]["state"],
    leadTechnicianId,
  });

  const suggested = useMemo<VisitDocumentKind>(
    () =>
      suggestVisitDocumentKind({
        visitType: visitType as Parameters<typeof suggestVisitDocumentKind>[0]["visitType"],
        customerType,
        contractType,
      }),
    [visitType, customerType, contractType],
  );

  const issuedKinds = useMemo(
    () => new Set(documents.map((d) => d.kind)),
    [documents],
  );

  const handleIssue = async (kind: VisitDocumentKind) => {
    setBusy(kind);
    setError(null);
    try {
      await api.post(`/api/visits/${visitId}/issue-document`, { kind });
      await onIssued();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const kindLabel = (k: string): string => {
    const key = `kindLabels.${k}` as const;
    // next-intl returns the key string if missing; we accept that as fallback.
    return t(key);
  };

  return (
    <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#002A4D]">{t("title")}</h2>
      </div>

      {!policy.allowed ? (
        <div className="mt-2 rounded border border-[#e5e5e5] bg-[#fafafa] p-3 text-sm text-[#525252]">
          {policy.reason === "VISIT_UNASSIGNED" && t("gateUnassigned")}
          {policy.reason === "VISIT_CANCELLED" && t("gateCancelled")}
          {policy.reason === "VISIT_FAILED" && t("gateFailed")}
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] p-3">
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--brand-blue-700)]">
                {t("suggested")}
              </p>
              <p className="text-sm font-semibold text-[#002A4D]">
                {kindLabel(suggested)}
              </p>
            </div>
            <Button
              onClick={() => handleIssue(suggested)}
              disabled={busy !== null}
              size="sm"
            >
              {busy === suggested
                ? "…"
                : issuedKinds.has(suggested)
                  ? t("reissue")
                  : t("issue")}
            </Button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-[#737373]">
              {t("issuedSoFar")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPicker((s) => !s)}
              disabled={busy !== null}
            >
              {t("addOther")}
            </Button>
          </div>

          {showPicker && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-[#e5e5e5] bg-[#fafafa] p-2">
              <select
                value={pickKind}
                onChange={(e) => setPickKind(e.target.value as VisitDocumentKind)}
                className="rounded border border-[#d4d4d4] bg-white px-2 py-1 text-sm"
              >
                {VISIT_DOCUMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kindLabel(k)}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => {
                  void handleIssue(pickKind);
                  setShowPicker(false);
                }}
                disabled={busy !== null}
                size="sm"
              >
                {issuedKinds.has(pickKind) ? t("reissue") : t("issue")}
              </Button>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {documents.length === 0 ? (
          <li className="text-sm text-[#737373]">{t("empty")}</li>
        ) : (
          documents.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-2 rounded border border-[#e5e5e5] bg-white p-2 text-sm text-[#262626]"
            >
              <span className="font-mono text-[10px] text-[#737373]">
                {kindLabel(d.kind)}
              </span>
              <span className="flex-1 break-all">{d.filename}</span>
              <span className="text-[10px] text-[#737373]">
                {formatDateTime(d.generatedAt)}
              </span>
              <a
                href={`/api/visits/${visitId}/documents/${d.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-[var(--brand-blue-700)] px-2 py-1 text-xs font-medium text-[var(--brand-blue-700)] hover:bg-[var(--brand-blue-50)]"
              >
                {t("download")}
              </a>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
