"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { NumberInput } from "@/components/ui/number-input";

interface ContractRow {
  id: string;
  contractNumber: string;
  type: "SALE" | "RENTAL" | "MAINTENANCE";
  monthlyMaintenanceFee: string | null;
  termMonths: number | null;
  customer: { id: string; code: string; name: string };
}

export default function RenewContractPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const router = useRouter();
  const api = useApi();

  const [contract, setContract] = useState<ContractRow | null>(null);
  const [monthlyFee, setMonthlyFee] = useState<number>(0);
  const [term, setTerm] = useState<number>(12);
  const [newType, setNewType] = useState<"RENTAL" | "MAINTENANCE">("MAINTENANCE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<ContractRow>(`/api/contracts/${id}`);
    setContract(res.data);
    if (res.data.monthlyMaintenanceFee !== null) setMonthlyFee(Number(res.data.monthlyMaintenanceFee));
    if (res.data.termMonths !== null) setTerm(res.data.termMonths);
    if (res.data.type === "RENTAL") setNewType("MAINTENANCE");
    else if (res.data.type === "MAINTENANCE") setNewType("MAINTENANCE");
  }, [api, id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  if (!contract) return <div className="text-sm text-[#737373]">{tc("loading")}</div>;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ contract: { id: string; contractNumber: string } }>(
        `/api/contracts/${id}/renew`,
        {
          monthlyMaintenanceFee: monthlyFee,
          termMonths: term,
          type: newType,
        },
      );
      router.push(`/contracts/${res.data.contract.id}`);
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.message);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("renew.title")}</h1>
        <p className="text-xs text-[#737373]">
          {contract.contractNumber} · {contract.customer.code} {contract.customer.name}
        </p>
        <p className="mt-2 text-sm text-[#525252]">{t("renew.intro")}</p>
      </header>

      <FormField label={t("type")} required>
        <Combobox
          value={newType}
          onChange={(v) => v && setNewType(v as "RENTAL" | "MAINTENANCE")}
          options={[
            { value: "MAINTENANCE", label: t("types.MAINTENANCE") },
            { value: "RENTAL", label: t("types.RENTAL") },
          ]}
          searchable={false}
          allowClear={false}
        />
      </FormField>

      <FormField label={t("monthlyFee")} required>
        <NumberInput value={monthlyFee} onChange={setMonthlyFee} min={0} />
      </FormField>

      <FormField label={t("termMonths")} required>
        <NumberInput value={term} onChange={setTerm} min={1} max={120} />
      </FormField>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <footer className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()} disabled={busy}>
          {tc("cancel")}
        </Button>
        <Button onClick={submit} isLoading={busy}>
          {t("renew.submit")}
        </Button>
      </footer>
    </div>
  );
}
