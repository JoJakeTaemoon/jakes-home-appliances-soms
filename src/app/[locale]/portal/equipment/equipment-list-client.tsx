"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";

interface EquipmentRow {
  id: string;
  serialNumber: string | null;
  status: string;
  ownership: string;
  installedAt: string | null;
  model: {
    id: string;
    modelCode: string;
    name: string;
    category: string;
  };
  site: { id: string; name: string } | null;
}

export function EquipmentListClient() {
  const t = useTranslations("portal.equipment");
  const { accessToken } = useCustomerAuth();
  const [rows, setRows] = useState<EquipmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/portal/equipment", {
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
        setRows(json.data.equipment as EquipmentRow[]);
      })
      .catch(() => {
        setError(t("loadError"));
        setRows([]);
      });
  }, [accessToken, t]);

  if (rows === null) {
    return <p className="py-6 text-center text-sm text-[#737373]">{t("loading")}</p>;
  }
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
        {error}
      </p>
    );
  }
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-[#737373]">{t("empty")}</p>;
  }

  // Group by Site name (null/B2C → single "All" bucket)
  const groups = new Map<string, EquipmentRow[]>();
  for (const r of rows) {
    const key = r.site?.name ?? "__nosite__";
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const groupOrder = Array.from(groups.keys()).sort((a, b) => {
    if (a === "__nosite__") return -1;
    if (b === "__nosite__") return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[#002A4D]">{t("title")}</h1>

      {groupOrder.map((key) => (
        <section key={key} className="space-y-2">
          {key !== "__nosite__" && (
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#737373]">
              {key}
            </h2>
          )}
          <ul className="space-y-2">
            {groups.get(key)!.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/portal/equipment/${r.id}`}
                  className="block rounded-2xl border border-[#e5e5e5] bg-white p-4 transition-colors hover:border-[var(--brand-blue-500)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#002A4D]">
                        {r.model.name}
                      </div>
                      <div className="text-xs text-[#737373]">
                        {r.model.modelCode}
                        {r.serialNumber ? ` · ${r.serialNumber}` : ""}
                      </div>
                    </div>
                    <span
                      className={[
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
                        r.status === "ACTIVE"
                          ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
                          : "border-[#e5e5e5] bg-[#f5f5f5] text-[#525252]",
                      ].join(" ")}
                    >
                      {r.status}
                    </span>
                  </div>
                  {r.installedAt && (
                    <div className="mt-2 text-xs text-[#525252]">
                      {t("installed")}: {r.installedAt.slice(0, 10)}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
