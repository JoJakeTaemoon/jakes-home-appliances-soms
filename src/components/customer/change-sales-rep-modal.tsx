"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/input";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";

interface SalesRepOption {
  id: string;
  username: string;
  title: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  customerId: string;
  currentSalesRepId: string | null;
  onChanged: () => void;
}

export function ChangeSalesRepModal({
  open,
  onClose,
  customerId,
  currentSalesRepId,
  onChanged,
}: Readonly<Props>) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const api = useApi();
  const repsQuery = useApiQuery<SalesRepOption[]>(open ? "/api/sales-reps" : null);
  const reps = repsQuery.data ?? [];
  const [selected, setSelected] = useState<string | null>(currentSalesRepId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/customers/${customerId}/sales-rep`, {
        salesRepId: selected,
        reason: reason.trim() || undefined,
      });
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("changeSalesRep")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">{t("salesRep")}</span>
          <Combobox
            value={selected}
            onChange={(v) => setSelected(v as string | null)}
            options={reps.map((r) => ({
              value: r.id,
              label: r.title ? `${r.username} · ${r.title}` : r.username,
            }))}
            placeholder={t("all")}
            searchable
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">{tc("notes")}</span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </label>
        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
