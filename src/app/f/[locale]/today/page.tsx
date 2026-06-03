"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApiQuery } from "@/lib/api/hooks";
import { MobileWrapper } from "@/components/mobile/mobile-wrapper";
import { CashOnHandBadge } from "@/components/mobile/cash-on-hand-badge";
import { VisitTypeBadge } from "@/components/visits/visit-state-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";

interface VisitCard {
  id: string;
  type: string;
  state: string;
  scheduledFor: string;
  scheduledWindow: string | null;
  leadTechnicianId: string | null;
  customer: {
    code: string;
    name: string;
    address: string | null;
    district: string | null;
    city: string | null;
    contacts: { name: string }[];
  };
  equipment: {
    serialNumber: string | null;
    model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null };
  } | null;
  signatureDocs: string[];
}

export default function MobileTodayPage() {
  return (
    <MobileWrapper>
      <MobileTodayContent />
    </MobileWrapper>
  );
}

function MobileTodayContent() {
  const t = useTranslations("mobile");
  const locale = useLocale();
  const query = useApiQuery<{ lead: VisitCard[]; collaborator: VisitCard[] }>(
    `/api/mobile/visits/today`,
  );
  const lead = query.data?.lead ?? [];
  const collab = query.data?.collaborator ?? [];

  if (query.isLoading) {
    return <p className="text-sm text-[#737373]">Loading…</p>;
  }

  const empty = lead.length === 0 && collab.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#002A4D]">{t("todayTitle")}</h1>
      <CashOnHandBadge />
      {empty ? (
        <p className="text-sm text-[#737373]">{t("noVisitsToday")}</p>
      ) : (
        <>
          {lead.length > 0 && <VisitSection items={lead} tag={t("lead")} tone="info" locale={locale} />}
          {collab.length > 0 && (
            <VisitSection items={collab} tag={t("shared")} tone="warning" locale={locale} />
          )}
        </>
      )}
    </div>
  );
}

function VisitSection({
  items,
  tag,
  tone,
  locale,
}: Readonly<{
  items: VisitCard[];
  tag: string;
  tone: "info" | "warning";
  locale: string;
}>) {
  const t = useTranslations("mobile");
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium uppercase tracking-wide text-[#737373]">{tag}</h2>
      <ul className="flex flex-col gap-2">
        {items.map((v) => (
          <li key={v.id}>
            <Link
              href={`/f/visits/${v.id}`}
              className="block rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold text-[#002A4D]">
                  {v.customer.name}
                </span>
                <StatusBadge tone={tone}>{tag}</StatusBadge>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <VisitTypeBadge type={v.type} />
                <span className="font-mono text-xs text-[#737373]">{v.customer.code}</span>
              </div>
              <p className="mt-2 text-sm text-[#525252]">
                {formatDate(v.scheduledFor, locale)} ·{" "}
                {v.scheduledFor.slice(11, 16)}
                {v.scheduledWindow ? ` · ${v.scheduledWindow}` : ""}
              </p>
              {v.equipment && (
                <p className="text-xs text-[#737373]">
                  {pickModelName(v.equipment.model, locale)}
                  {v.equipment.serialNumber ? ` · ${v.equipment.serialNumber}` : ""}
                </p>
              )}
              {v.signatureDocs.length > 0 && (
                <div className="mt-2 rounded-lg border border-[#fcd34d] bg-[#fffbeb] px-2 py-1.5 text-xs text-[#92400e]">
                  <span className="font-semibold">{t("signRequired")}: </span>
                  {v.signatureDocs
                    .map((k) =>
                      t(
                        `signatureDocLabels.${k}` as "signatureDocLabels.WORK_CONFIRMATION",
                      ),
                    )
                    .join(", ")}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
