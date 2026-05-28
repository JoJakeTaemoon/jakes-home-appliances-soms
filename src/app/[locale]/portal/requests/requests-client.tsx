"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { SrStateBadge, SrTypeBadge } from "@/components/service-requests/sr-state-badge";
import { formatDate } from "@/lib/format";

interface SrRow {
  id: string;
  code: string;
  type: string;
  state: string;
  isPaid: boolean;
  submittedAt: string;
  description: string;
  equipment: {
    id: string;
    serialNumber: string | null;
    model: { modelCode: string; name: string };
  } | null;
  visit: {
    id: string;
    state: string;
    scheduledFor: string;
  } | null;
}

export function PortalRequestsClient() {
  const t = useTranslations("portal.requests");
  const locale = useLocale();
  const router = useRouter();
  const { accessToken } = useCustomerAuth();
  const [rows, setRows] = useState<SrRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/portal/service-requests?pageSize=50", {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    })
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) {
          setError(json?.error?.message ?? t("loadError"));
          setRows([]);
          return;
        }
        setRows(json.data as SrRow[]);
      })
      .catch(() => {
        setError(t("loadError"));
        setRows([]);
      });
  }, [accessToken, t]);

  if (rows === null) {
    return (
      <PageWrap>
        <p className="py-6 text-center text-sm text-[#737373]">{t("submittedAt")}...</p>
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <button
          type="button"
          onClick={() => router.push("/portal/requests/new")}
          className="rounded-md border border-[var(--brand-blue-500)] bg-[var(--brand-blue-500)] px-3 h-9 text-xs font-semibold text-white outline-none transition-transform hover:scale-[1.02]"
        >
          {t("newRequest")}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#e5e5e5] bg-white p-8 text-center">
          <div className="mb-2 text-3xl">📨</div>
          <p className="text-sm text-[#525252]">{t("noRequests")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/portal/requests/${r.id}`}
                className="block rounded-2xl border border-[#e5e5e5] bg-white p-4 transition-colors hover:border-[var(--brand-blue-500)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[#002A4D]">
                      {r.code}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <SrTypeBadge type={r.type} portal />
                      <SrStateBadge state={r.state} portal />
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-[#737373]">
                    {formatDate(r.submittedAt, locale)}
                  </div>
                </div>
                {r.equipment && (
                  <div className="mt-2 text-xs text-[#525252]">
                    {r.equipment.model.modelCode} · {r.equipment.model.name}
                  </div>
                )}
                <p className="mt-2 line-clamp-2 text-sm text-[#262626]">
                  {r.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageWrap>
  );
}

function PageWrap({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="space-y-3">{children}</div>;
}
