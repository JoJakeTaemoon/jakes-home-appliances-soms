"use client";

/**
 * UC-AD-05 — Scheduler weights editor (ADMIN only).
 *
 * Three sliders persist into `SystemSetting` keyed `scheduler.weights`.
 * The scheduler reads them via `getSchedulerWeights()` (60s in-memory
 * cache); saving here invalidates the cache.
 */

import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

interface Weights {
  preferred: number;
  regionMatch: number;
  loadPenaltyPerVisit: number;
}

interface Resp {
  current: Weights;
  defaults: Weights;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  hint?: string;
}

function Slider({ label, value, min, max, onChange, hint }: Readonly<SliderProps>) {
  return (
    <FormField label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-[var(--brand-blue-500)]"
        />
        <span className="w-12 text-right text-sm tabular-nums">{value}</span>
      </div>
      {hint && <p className="mt-1 text-[11px] text-[#737373]">{hint}</p>}
    </FormField>
  );
}

export default function SchedulerWeightsPage() {
  const { user } = useAuth();
  const api = useApi();
  const [data, setData] = useState<Resp | null>(null);
  const [draft, setDraft] = useState<Weights | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Resp>(`/api/admin/scheduler-weights`);
      setData(res.data);
      setDraft(res.data.current);
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
  if (!data || !draft) {
    return <p className="text-sm text-[#737373]">Loading…</p>;
  }

  const submit = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put<unknown>(`/api/admin/scheduler-weights`, draft);
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(data.defaults);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">
          Scheduler weights
        </h1>
        <p className="mt-1 text-sm text-[#525252]">
          Tune the visit auto-recommender. Higher weights win bigger fights;
          the load penalty pulls busy technicians down. Changes apply within
          60 seconds via in-memory cache.
        </p>
      </header>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <Slider
          label="Preferred technician bonus"
          value={draft.preferred}
          min={0}
          max={500}
          onChange={(v) => setDraft({ ...draft, preferred: v })}
          hint={`Default ${data.defaults.preferred}`}
        />
        <Slider
          label="Region match bonus"
          value={draft.regionMatch}
          min={0}
          max={200}
          onChange={(v) => setDraft({ ...draft, regionMatch: v })}
          hint={`Default ${data.defaults.regionMatch}`}
        />
        <Slider
          label="Load penalty per existing visit"
          value={draft.loadPenaltyPerVisit}
          min={0}
          max={100}
          onChange={(v) => setDraft({ ...draft, loadPenaltyPerVisit: v })}
          hint={`Default ${data.defaults.loadPenaltyPerVisit}. Stored as magnitude (subtracted at scoring time).`}
        />
      </section>

      {error && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}
      {saved && (
        <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">
          Saved. The scheduler will use these on its next recommendation.
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Save weights"}
        </Button>
        <Button onClick={reset} variant="secondary">
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
