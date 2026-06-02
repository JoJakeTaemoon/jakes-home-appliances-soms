"use client";

/**
 * UC-CM-08 — Customer merge (ADMIN only).
 *
 * Workflow:
 *   1. Pick source customer (left)
 *   2. Pick target customer (right)
 *   3. Side-by-side preview: lists each relation count for source + target
 *   4. Confirm — POST /api/customers/merge → ADMIN-only endpoint
 *
 * Server side does the heavy lifting (transactional repointing of every FK
 * + audit log). UI is intentionally simple — heavy modal confirmation,
 * irreversible action warning.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/api/client";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

interface CustomerLite {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
  status: string;
  _count?: {
    contacts: number;
    equipment: number;
    contracts: number;
    sites: number;
    visits: number;
    payments: number;
  };
}

function useCustomerSearch() {
  const api = useApi();
  return useCallback(
    async (q: string): Promise<CustomerLite[]> => {
      if (!q.trim()) return [];
      const res = await api.get<CustomerLite[]>(
        `/api/customers?q=${encodeURIComponent(q)}&pageSize=10`,
      );
      return res.data ?? [];
    },
    [api],
  );
}

export default function CustomerMergePage() {
  const t = useTranslations("merge");
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();
  const search = useCustomerSearch();
  const [sourceQ, setSourceQ] = useState("");
  const [targetQ, setTargetQ] = useState("");
  const [sourceResults, setSourceResults] = useState<CustomerLite[]>([]);
  const [targetResults, setTargetResults] = useState<CustomerLite[]>([]);
  const [source, setSource] = useState<CustomerLite | null>(null);
  const [target, setTarget] = useState<CustomerLite | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const r = await search(sourceQ);
      if (!cancelled) setSourceResults(r);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [sourceQ, search]);

  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const r = await search(targetQ);
      if (!cancelled) setTargetResults(r);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [targetQ, search]);

  if (user && user.role !== "ADMIN") {
    return (
      <div className="rounded-md border-2 border-red-500 bg-red-50 p-4 text-sm text-red-700">
        Administrator role required.
      </div>
    );
  }

  const onConfirm = async () => {
    if (!source || !target) return;
    if (source.id === target.id) {
      setError(t("error") + ": same customer");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await api.post(`/api/customers/merge`, {
        sourceId: source.id,
        targetId: target.id,
      });
      setSuccess(true);
      window.setTimeout(() => router.push(`/o/customers/${target.id}`), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[#525252]">{t("description")}</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CustomerPicker
          label={t("pickSource")}
          q={sourceQ}
          setQ={setSourceQ}
          results={sourceResults}
          selected={source}
          onPick={setSource}
        />
        <CustomerPicker
          label={t("pickTarget")}
          q={targetQ}
          setQ={setTargetQ}
          results={targetResults}
          selected={target}
          onPick={setTarget}
        />
      </section>

      {source && target && source.id !== target.id && (
        <section className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-amber-800">
            {t("previewLabel")}
          </h2>
          <p className="text-sm text-amber-900">
            <strong>{source.code}</strong> ({source.name}) → INACTIVE
            <br />
            <strong>{target.code}</strong> ({target.name}) will inherit all
            references.
          </p>
          <ul className="mt-2 list-inside list-disc text-xs text-amber-900">
            <li>Sites, contacts, equipment, contracts, service requests</li>
            <li>Visits, payments, documents, notification logs</li>
          </ul>
        </section>
      )}

      {error && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">
          {t("success")}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="danger"
          onClick={onConfirm}
          disabled={
            !source || !target || source.id === target.id || confirming
          }
        >
          {confirming ? t("confirming") : t("confirm")}
        </Button>
      </div>
    </div>
  );
}

function CustomerPicker({
  label,
  q,
  setQ,
  results,
  selected,
  onPick,
}: Readonly<{
  label: string;
  q: string;
  setQ: (v: string) => void;
  results: CustomerLite[];
  selected: CustomerLite | null;
  onPick: (c: CustomerLite | null) => void;
}>) {
  return (
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
      <FormField label={label}>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search code / name / phone"
        />
      </FormField>
      {selected ? (
        <div className="mt-2 rounded-md border border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] p-3">
          <div className="font-mono text-xs text-[var(--brand-blue-700)]">
            {selected.code}
          </div>
          <div className="font-medium text-[#002A4D]">{selected.name}</div>
          <div className="mt-1 text-xs text-[#525252]">
            {selected.type} · {selected.status}
          </div>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="mt-2 text-xs text-[var(--brand-blue-700)] hover:underline"
          >
            Change
          </button>
        </div>
      ) : (
        <ul className="mt-2 max-h-60 divide-y divide-[#f0f0f0] overflow-y-auto">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="block w-full px-2 py-2 text-left text-sm hover:bg-[#fafafa]"
              >
                <div className="font-mono text-xs text-[#737373]">{c.code}</div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-[#737373]">
                  {c.type} · {c.status}
                </div>
              </button>
            </li>
          ))}
          {results.length === 0 && q.trim() && (
            <li className="px-2 py-2 text-xs text-[#737373]">No matches.</li>
          )}
        </ul>
      )}
    </div>
  );
}
