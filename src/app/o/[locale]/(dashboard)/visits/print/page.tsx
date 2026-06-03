"use client";

/**
 * Track 4 — /o/{locale}/visits/print
 *
 * Bulk print view. Operator picks date + technician + langPair, the
 * server returns a single merged PDF that contains:
 *   - For every INSTALLATION visit: the matching contract PDF × 2
 *     (customer + company copy) followed by the delivery slip / sale
 *     receipt.
 *   - For every other visit: the auto-suggested visit document.
 *
 * The browser prints the merged PDF natively (A4 sized, no
 * iframe-scaling weirdness). The page itself just embeds that PDF for
 * preview + offers a "open in new tab to print" button — Chrome's
 * iframe PDF viewer otherwise scales the embedded PDF to fit the
 * iframe and the print job inherits the wrong scale.
 */

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useApiQuery } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";

function todayYmd(): string {
  const d = new Date();
  const pad = (v: number) => (v < 10 ? `0${v}` : String(v));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function VisitsPrintPage() {
  // See `/o/[locale]/(dashboard)/visits/page.tsx` for the same pattern —
  // useSearchParams() requires a Suspense boundary for static prerender.
  return (
    <Suspense fallback={<div className="text-sm text-[#737373]">Loading…</div>}>
      <VisitsPrintPageInner />
    </Suspense>
  );
}

function VisitsPrintPageInner() {
  const t = useTranslations("visitsPrint");
  const search = useSearchParams();
  const [date, setDate] = useState<string>(search?.get("date") ?? todayYmd());
  const [techId, setTechId] = useState<string>(
    search?.get("technicianId") ?? "",
  );
  const [langPair, setLangPair] = useState<"vi-ko" | "vi-en">("vi-ko");

  const techsQuery = useApiQuery<{ id: string; username: string }[]>(
    "/api/users?role=TECHNICIAN&pageSize=100",
  );
  const technicians = techsQuery.data ?? [];

  // Light meta query so we can disable the "open PDF" button when the
  // bundle is empty and show entry counts to the operator.
  const bundleUrl =
    techId && date
      ? `/api/visits/print-bundle?date=${encodeURIComponent(date)}&technicianId=${encodeURIComponent(techId)}&langPair=${langPair}`
      : null;
  const bundleQuery = useApiQuery<{
    entries: { visitId: string; contract: { id: string } | null }[];
  }>(bundleUrl);
  const entries = bundleQuery.data?.entries ?? [];

  const pdfUrl = useMemo(() => {
    if (!techId || !date) return null;
    return `/api/visits/print-bundle/pdf?date=${encodeURIComponent(date)}&technicianId=${encodeURIComponent(techId)}&langPair=${langPair}`;
  }, [techId, date, langPair]);

  const hasEntries = entries.length > 0;
  const installCount = entries.filter((e) => e.contract).length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="text-sm text-[#737373]">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-[#d4d4d4] px-2 py-1 text-sm"
          />
          <select
            value={techId}
            onChange={(e) => setTechId(e.target.value)}
            className="rounded border border-[#d4d4d4] px-2 py-1 text-sm"
          >
            <option value="">{t("pickTechnician")}</option>
            {technicians.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
          <select
            value={langPair}
            onChange={(e) =>
              setLangPair(e.target.value === "vi-en" ? "vi-en" : "vi-ko")
            }
            className="rounded border border-[#d4d4d4] px-2 py-1 text-sm"
          >
            <option value="vi-ko">VI + KO</option>
            <option value="vi-en">VI + EN</option>
          </select>
          <Button
            onClick={() => {
              if (pdfUrl) window.open(pdfUrl, "_blank", "noreferrer");
            }}
            disabled={!hasEntries || !pdfUrl}
          >
            {t("openPrintTab")}
          </Button>
        </div>
      </header>

      {!bundleUrl && <p className="text-sm text-[#737373]">{t("pickPrompt")}</p>}
      {bundleQuery.isLoading && (
        <p className="text-sm text-[#737373]">{t("loading")}</p>
      )}
      {bundleUrl && !bundleQuery.isLoading && !hasEntries && (
        <p className="text-sm text-[#737373]">{t("empty")}</p>
      )}

      {hasEntries && (
        <p className="text-sm text-[#525252]">
          {t("ready", { n: entries.length })}
          {installCount > 0 ? ` · ${t("installCount", { n: installCount })}` : ""}
        </p>
      )}

      {hasEntries && pdfUrl && (
        <div className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-2">
          <iframe
            key={pdfUrl}
            title="bulk-print-pdf"
            src={pdfUrl}
            className="h-[85vh] w-full rounded border border-[#d4d4d4] bg-white"
          />
        </div>
      )}
    </div>
  );
}
