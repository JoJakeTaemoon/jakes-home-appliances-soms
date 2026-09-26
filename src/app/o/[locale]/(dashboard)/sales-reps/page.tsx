"use client";

/**
 * 판매원 roster + per-rep KPI cards.
 *
 * A rep is a row in the `SalesRep` master, not a login account (2026-09-25) —
 * most reps never sign in, so the roster is maintained here rather than from
 * 사용자 관리. Adding is open to any office role because whoever registers a
 * customer may need the rep in the same breath; editing and retiring are
 * MANAGER+. Retiring is a soft flag: a customer already assigned keeps naming
 * who sold them.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApiQuery } from "@/lib/api/hooks";
import { useApi, apiErrorText } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { canApproveOps } from "@/lib/auth/roles";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";

export interface RepRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  title: string | null;
  notes: string | null;
  isActive: boolean;
  stats: {
    customerCount: number;
    last30dRevenue: number;
    receivables: number;
  };
}

export default function SalesRepsPage() {
  const t = useTranslations("salesReps");
  const tc = useTranslations("common");
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();
  const canManage = canApproveOps(user?.role ?? "");

  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RepRow | null>(null);
  const [retiring, setRetiring] = useState<RepRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = useApiQuery<RepRow[]>(
    `/api/sales-reps${showInactive ? "?includeInactive=true" : ""}`,
  );
  const reps = q.data ?? [];

  async function retire() {
    if (!retiring) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/sales-reps/${retiring.id}`);
      setFlash(t("retireSuccess", { name: retiring.name }));
      setRetiring(null);
      await q.refetch();
    } catch (e) {
      setError(apiErrorText(e, tc("error")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-[#525252]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            {t("showInactive")}
          </label>
          <Button onClick={() => setCreating(true)}>+ {t("addRep")}</Button>
        </div>
      </header>

      {flash && (
        <div role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {flash}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
          {error}
        </div>
      )}

      {q.isLoading && <div className="text-sm text-gray-500">{tc("loading")}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reps.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-3 rounded-lg border-2 border-gray-200 bg-white p-4"
          >
            <div className="flex items-center gap-3">
              <Avatar name={r.name} size="lg" />
              <button
                type="button"
                onClick={() => router.push(`/o/sales-reps/${r.id}`)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold text-gray-900 hover:underline">
                    {r.name}
                  </span>
                  {!r.isActive && <StatusBadge tone="muted">{t("inactive")}</StatusBadge>}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {r.title ?? r.phone ?? "—"}
                </div>
              </button>
              {canManage && (
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                    {tc("edit")}
                  </Button>
                  {r.isActive && (
                    <Button size="sm" variant="ghost" onClick={() => setRetiring(r)}>
                      {t("retire")}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
              <Stat label={t("kpi.customers")} value={String(r.stats.customerCount)} />
              <Stat
                label={t("kpi.last30dRevenue")}
                value={formatMoney(r.stats.last30dRevenue)}
              />
              <Stat
                label={t("kpi.receivables")}
                value={formatMoney(r.stats.receivables)}
                tone={r.stats.receivables > 0 ? "warning" : undefined}
              />
            </div>
          </div>
        ))}
        {!q.isLoading && reps.length === 0 && (
          <div className="col-span-full rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
            {t("emptyState")}
          </div>
        )}
      </div>

      {creating && (
        <SalesRepModal
          onClose={() => setCreating(false)}
          onSaved={(name) => {
            setCreating(false);
            setFlash(t("createSuccess", { name }));
            void q.refetch();
          }}
        />
      )}
      {editing && (
        <SalesRepModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setFlash(t("updateSuccess", { name }));
            void q.refetch();
          }}
        />
      )}
      <ConfirmDialog
        open={retiring != null}
        title={t("retireTitle")}
        message={retiring ? t("retireConfirm", { name: retiring.name }) : ""}
        confirmLabel={t("retire")}
        cancelLabel={tc("cancel")}
        variant="danger"
        busy={busy}
        onCancel={() => setRetiring(null)}
        onConfirm={retire}
      />
    </div>
  );
}

/** Add / edit — the same five fields either way; only `name` is required. */
export function SalesRepModal({
  row,
  initialName,
  onClose,
  onSaved,
}: Readonly<{
  row?: RepRow | { id: string; name: string; phone: string | null; email: string | null; title: string | null; notes: string | null; isActive: boolean };
  /** Seeds the name field — used by the customer form's inline "+ 추가". */
  initialName?: string;
  onClose: () => void;
  onSaved: (name: string, created?: { id: string; name: string }) => void;
}>) {
  const t = useTranslations("salesReps");
  const tc = useTranslations("common");
  const api = useApi();
  const [name, setName] = useState(row?.name ?? initialName ?? "");
  const [phone, setPhone] = useState(row?.phone ?? "");
  const [email, setEmail] = useState(row?.email ?? "");
  const [title, setTitle] = useState(row?.title ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      title: title.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (row) {
        await api.patch(`/api/sales-reps/${row.id}`, payload);
        onSaved(payload.name);
      } else {
        const res = await api.post<{ id: string; name: string }>(
          "/api/sales-reps",
          payload,
        );
        onSaved(payload.name, res.data);
      }
    } catch (e) {
      setErr(apiErrorText(e, tc("error")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? t("editRep") : t("addRepTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} isLoading={busy} disabled={!name.trim()}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("fieldName")} className="sm:col-span-2" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </FormField>
        <FormField label={t("fieldPhone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </FormField>
        <FormField label={t("fieldEmail")}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </FormField>
        <FormField label={t("fieldTitle")} className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label={t("fieldNotes")} className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </FormField>
      </div>
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
    </Modal>
  );
}

function Stat({
  label,
  value,
  tone,
}: Readonly<{ label: string; value: string; tone?: "warning" }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <span
        className={
          tone === "warning"
            ? "text-sm font-semibold text-red-600"
            : "text-sm font-semibold text-gray-900"
        }
      >
        {value}
      </span>
    </div>
  );
}

function formatMoney(v: number): string {
  if (v === 0) return "—";
  return new Intl.NumberFormat("vi-VN").format(Math.round(v)) + " ₫";
}
