"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useCustomerAuth } from "@/providers/customer-auth-provider";

interface PortalContactRow {
  id: string;
  name: string;
  title: string | null;
  phone1: string;
  email: string | null;
  language: "ko" | "vi" | "en";
  role: "CONTRACT_PARTY" | "OPS_CONTACT";
  scope: "CUSTOMER" | "SITE";
  isPrimary: boolean;
  site: { id: string; name: string } | null;
  portalEnabled: boolean;
}

export function ContactsClient() {
  const t = useTranslations("portal.contacts");
  const { accessToken, contact } = useCustomerAuth();
  const [rows, setRows] = useState<PortalContactRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // B2C contacts are usually a household — calling them "Company
  // contacts" is jarring. We branch the heading + add-button label on
  // the customer type the logged-in contact already carries.
  const isB2B = contact?.customerType === "B2B";
  const titleKey = isB2B ? "titleB2B" : "titleB2C";
  const addKey = isB2B ? "addContactB2B" : "addContactB2C";

  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/portal/contacts", {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    })
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) {
          setError(json?.error?.message ?? t("loadError"));
          return;
        }
        setRows(json.data.contacts as PortalContactRow[]);
      })
      .catch(() => setError(t("loadError")));
  }, [accessToken, t]);

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
        {error}
      </p>
    );
  }
  if (rows === null) {
    return <p className="py-6 text-center text-sm text-[#737373]">{t("loading")}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#002A4D]">{t(titleKey)}</h1>
        <button
          type="button"
          disabled
          className="rounded-md border border-[#e5e5e5] bg-white px-3 h-9 text-xs font-medium text-[#a3a3a3] cursor-not-allowed"
        >
          {t(addKey)}
        </button>
      </div>
      <p className="text-xs text-[#737373]">{t("createComingSoon")}</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl border border-[#e5e5e5] bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[#262626]">
                  {r.name}
                </div>
                {r.title && (
                  <div className="truncate text-xs text-[#737373]">{r.title}</div>
                )}
                <div className="mt-1 text-xs text-[#525252]">{r.phone1}</div>
                {r.email && (
                  <div className="text-xs text-[#525252]">{r.email}</div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={[
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
                    r.role === "CONTRACT_PARTY"
                      ? "border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] text-[var(--brand-blue-700)]"
                      : "border-[#e5e5e5] bg-[#f5f5f5] text-[#525252]",
                  ].join(" ")}
                >
                  {t(`role.${r.role}`)}
                </span>
                {r.isPrimary && (
                  <span className="rounded-full border border-[#fde68a] bg-[#fef3c7] px-2 py-0.5 text-[10px] font-medium uppercase text-[#92400e]">
                    {t("primary")}
                  </span>
                )}
                {r.portalEnabled && (
                  <span className="rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-2 py-0.5 text-[10px] font-medium uppercase text-[#15803d]">
                    {t("portalEnabled")}
                  </span>
                )}
              </div>
            </div>
            {r.site && (
              <div className="mt-2 text-xs text-[#737373]">
                {t("siteScope")}: {r.site.name}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
