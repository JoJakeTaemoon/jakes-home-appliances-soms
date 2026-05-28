"use client";

/**
 * Company contact editor (ADMIN only).
 *
 * Edits the HQ phone number stored in `SystemSetting` keyed `company.hqPhone`.
 * It is the single source of truth for the mobile "Call HQ" action and every
 * {hq_phone} notification placeholder. Changes apply within 60 seconds via the
 * in-memory settings cache.
 */

import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

interface Contact {
  hqPhone: string;
}

interface Resp {
  current: Contact;
  defaults: Contact;
}

export default function CompanyContactPage() {
  const { user } = useAuth();
  const api = useApi();
  const [data, setData] = useState<Resp | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Resp>(`/api/admin/company-contact`);
      setData(res.data);
      setDraft(res.data.current.hqPhone);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [api]);

  useEffect(() => {
    if (user?.role === "ADMIN") load().catch(() => undefined);
  }, [user?.role, load]);

  if (user && user.role !== "ADMIN") {
    return (
      <div className="rounded-md border-2 border-red-500 bg-red-50 p-4 text-sm text-red-700">
        Administrator role required.
      </div>
    );
  }
  if (!data) {
    return <p className="text-sm text-[#737373]">Loading…</p>;
  }

  const submit = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put<unknown>(`/api/admin/company-contact`, { hqPhone: draft });
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setDraft(data.defaults.hqPhone);
  const dirty = draft.trim() !== data.current.hqPhone;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">Company contact</h1>
        <p className="mt-1 text-sm text-[#525252]">
          The HQ phone number shown on the technician&apos;s &ldquo;Call HQ&rdquo;
          button and used in every customer SMS / email. Changes apply within 60
          seconds.
        </p>
      </header>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <FormField label="HQ phone number">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={data.defaults.hqPhone}
            inputMode="tel"
          />
          <p className="mt-1 text-[11px] text-[#737373]">
            Default {data.defaults.hqPhone}. Digits, spaces, and + ( ) - allowed.
          </p>
        </FormField>
      </section>

      {error && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}
      {saved && (
        <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">
          Saved. New calls and messages will use this number within 60 seconds.
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={saving || !dirty || draft.trim().length < 4}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button onClick={reset} variant="secondary">
          Reset to default
        </Button>
      </div>
    </div>
  );
}
