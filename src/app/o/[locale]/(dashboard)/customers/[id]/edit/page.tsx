"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

interface CustomerDetail {
  id: string;
  code: string;
  type: "B2C" | "B2B";
  name: string;
  shortcode: string | null;
  taxCode: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  preferredRegion: string | null;
  notes: string | null;
}

export default function EditCustomerPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const router = useRouter();
  const api = useApi();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<CustomerDetail | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<CustomerDetail>(`/api/customers/${id}`);
    setData(res.data);
    setLoading(false);
  }, [api, id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  async function submit() {
    if (!data) return;
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/api/customers/${id}`, {
        name: data.name,
        shortcode: data.shortcode ?? undefined,
        taxCode: data.taxCode ?? undefined,
        address: data.address ?? undefined,
        district: data.district ?? undefined,
        city: data.city ?? undefined,
        preferredRegion: data.preferredRegion ?? undefined,
        notes: data.notes ?? undefined,
      });
      router.push(`/o/customers/${id}`);
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) {
    return <div className="text-sm text-[#737373]">{tc("loading")}</div>;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("editCustomer")}</h1>
        <Button variant="ghost" onClick={() => router.push(`/o/customers/${id}`)}>
          {tc("cancel")}
        </Button>
      </header>
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-6 sm:grid-cols-2">
        <FormField label={t("name")} className="sm:col-span-2" required>
          <Input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
        </FormField>
        {data.type === "B2B" && (
          <>
            <FormField label={t("shortcode")}>
              <Input
                value={data.shortcode ?? ""}
                onChange={(e) => setData({ ...data, shortcode: e.target.value.toUpperCase() })}
                maxLength={5}
              />
            </FormField>
            <FormField label={t("taxCode")}>
              <Input value={data.taxCode ?? ""} onChange={(e) => setData({ ...data, taxCode: e.target.value })} />
            </FormField>
          </>
        )}
        <FormField label={tc("address")} className="sm:col-span-2">
          <Input value={data.address ?? ""} onChange={(e) => setData({ ...data, address: e.target.value })} />
        </FormField>
        <FormField label={tc("district")}>
          <Input value={data.district ?? ""} onChange={(e) => setData({ ...data, district: e.target.value })} />
        </FormField>
        <FormField label={tc("city")}>
          <Input value={data.city ?? ""} onChange={(e) => setData({ ...data, city: e.target.value })} />
        </FormField>
        <FormField label={t("preferredRegion")}>
          <Input
            value={data.preferredRegion ?? ""}
            onChange={(e) => setData({ ...data, preferredRegion: e.target.value })}
            placeholder="HCMC-D1"
          />
        </FormField>
        <FormField label={t("notes")} className="sm:col-span-2">
          <Textarea
            value={data.notes ?? ""}
            onChange={(e) => setData({ ...data, notes: e.target.value })}
            rows={3}
          />
        </FormField>
      </div>
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push(`/o/customers/${id}`)} disabled={busy}>
          {tc("cancel")}
        </Button>
        <Button onClick={submit} isLoading={busy}>
          {tc("save")}
        </Button>
      </div>
    </div>
  );
}
