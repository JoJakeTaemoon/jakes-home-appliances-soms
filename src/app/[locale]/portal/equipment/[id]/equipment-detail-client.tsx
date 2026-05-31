"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";

interface FilterEntry {
  type: string;
  replaceEveryDays: number;
}
interface ModelInfo {
  id: string;
  modelCode: string;
  name: string;
  category: string;
  filterPolicy: { filters?: FilterEntry[] } | null;
}
interface EquipmentDetail {
  id: string;
  serialNumber: string | null;
  status: string;
  ownership: string;
  installedAt: string | null;
  model: ModelInfo;
  site: { id: string; name: string; address: string } | null;
  filterPolicyOverride: unknown;
}

function computeNextFilterDates(
  installedAt: string | null,
  filters: FilterEntry[] | undefined,
): { type: string; dueOn: string }[] {
  if (!installedAt || !filters) return [];
  const installed = new Date(installedAt);
  if (Number.isNaN(installed.getTime())) return [];
  return filters.map((f) => {
    const due = new Date(installed);
    due.setDate(due.getDate() + f.replaceEveryDays);
    return { type: f.type, dueOn: due.toISOString().slice(0, 10) };
  });
}

interface Props { id: string }

export function EquipmentDetailClient({ id }: Readonly<Props>) {
  const t = useTranslations("portal.equipmentDetail");
  const { accessToken } = useCustomerAuth();
  const router = useRouter();
  const [eq, setEq] = useState<EquipmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`/api/portal/equipment/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    })
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) {
          setError(json?.error?.message ?? t("loadError"));
          return;
        }
        setEq(json.data.equipment as EquipmentDetail);
      })
      .catch(() => setError(t("loadError")));
  }, [accessToken, id, t]);

  if (error) {
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
          {error}
        </p>
        <button
          type="button"
          onClick={() => router.replace("/portal/equipment")}
          className="text-sm text-[var(--brand-blue-600)] hover:underline"
        >
          {t("back")}
        </button>
      </div>
    );
  }

  if (!eq) {
    return <p className="py-6 text-center text-sm text-[#737373]">{t("loading")}</p>;
  }

  const nextFilters = computeNextFilterDates(
    eq.installedAt,
    eq.model.filterPolicy?.filters,
  );

  return (
    <div className="space-y-4">
      <Link href="/portal/equipment" className="text-sm text-[var(--brand-blue-600)] hover:underline">
        ← {t("back")}
      </Link>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
        <h1 className="text-lg font-semibold text-[#002A4D]">{eq.model.name}</h1>
        <p className="text-xs text-[#737373]">{eq.model.name}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[#737373]">{t("serial")}</dt>
            <dd className="font-medium text-[#262626]">{eq.serialNumber ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#737373]">{t("status")}</dt>
            <dd className="font-medium text-[#262626]">{eq.status}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#737373]">{t("ownership")}</dt>
            <dd className="font-medium text-[#262626]">{eq.ownership}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#737373]">{t("installedAt")}</dt>
            <dd className="font-medium text-[#262626]">{eq.installedAt?.slice(0, 10) ?? "—"}</dd>
          </div>
          {eq.site && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#737373]">{t("site")}</dt>
              <dd className="text-right font-medium text-[#262626]">
                {eq.site.name}
                <span className="block text-xs font-normal text-[#737373]">
                  {eq.site.address}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </section>

      {nextFilters.length > 0 && (
        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#737373]">
            {t("nextFilters")}
          </h2>
          <ul className="space-y-1.5 text-sm">
            {nextFilters.map((f) => (
              <li key={f.type} className="flex justify-between gap-2">
                <span>{f.type}</span>
                <span className="font-medium text-[#262626]">{f.dueOn}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
