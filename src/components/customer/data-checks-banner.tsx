"use client";

/**
 * The customer screen's "please check" list — mostly what a data migration
 * left behind: an operations contact the system filled in, live contracts
 * that never bill, and units whose filter dates are only a guess from the
 * install date. Renders nothing when there is nothing to check.
 */

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useApiQuery } from "@/lib/api/hooks";

interface DataChecks {
  opsToReview: { id: string; name: string }[];
  contractsWithoutFee: { id: string; contractNumber: string }[];
  equipmentWithoutFilterDate: { id: string; assetCode: string | null; modelCode: string | null }[];
}

const SHOWN = 5;

export function CustomerDataChecksBanner({
  customerId,
  onOpenContacts,
}: Readonly<{ customerId: string; onOpenContacts: () => void }>) {
  const t = useTranslations("customers.dataChecks");
  const q = useApiQuery<DataChecks>(`/api/customers/${customerId}/data-checks`);
  const d = q.data;
  if (!d || (d.opsToReview.length === 0 && d.contractsWithoutFee.length === 0 && d.equipmentWithoutFilterDate.length === 0)) {
    return null;
  }

  const more = (n: number) => (n > SHOWN ? <span className="text-amber-700"> {t("more", { count: n - SHOWN })}</span> : null);

  return (
    <section role="status" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <h2 className="font-semibold">{t("title")}</h2>
      <ul className="mt-2 space-y-2">
        {d.opsToReview.length > 0 && (
          <li>
            {t("opsToReview", { count: d.opsToReview.length })}{" "}
            <button type="button" onClick={onOpenContacts} className="font-medium underline">
              {t("openContacts")}
            </button>
          </li>
        )}
        {d.contractsWithoutFee.length > 0 && (
          <li>
            {t("contractsWithoutFee", { count: d.contractsWithoutFee.length })}{" "}
            {d.contractsWithoutFee.slice(0, SHOWN).map((k, i) => (
              <span key={k.id}>
                {i > 0 && ", "}
                <Link href={`/o/contracts/${k.id}` as never} className="font-mono underline">
                  {k.contractNumber}
                </Link>
              </span>
            ))}
            {more(d.contractsWithoutFee.length)}
          </li>
        )}
        {d.equipmentWithoutFilterDate.length > 0 && (
          <li>
            {t("equipmentWithoutFilterDate", { count: d.equipmentWithoutFilterDate.length })}{" "}
            {d.equipmentWithoutFilterDate.slice(0, SHOWN).map((e, i) => (
              <span key={e.id}>
                {i > 0 && ", "}
                <Link href={`/o/equipment/${e.id}` as never} className="underline">
                  {[e.modelCode, e.assetCode].filter(Boolean).join(" ")}
                </Link>
              </span>
            ))}
            {more(d.equipmentWithoutFilterDate.length)}
          </li>
        )}
      </ul>
    </section>
  );
}
