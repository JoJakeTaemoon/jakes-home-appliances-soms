"use client";

/**
 * Scheduling widget for the visit detail page.
 * - When state is SUGGESTED: shows the recommended technicians (top-3) with
 *   rationale tags + per-day load, and a "Confirm" button to schedule with
 *   that lead. Supports adding collaborators inline.
 * - For SCHEDULED visits: shows the assigned lead + a "Reassign" mode toggle.
 *
 * Pulls candidates from GET /api/visits/recommend.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { StatusBadge } from "@/components/ui/status-badge";

interface Candidate {
  technicianId: string;
  name: string;
  username: string;
  phone: string | null;
  preferredRegion: string | null;
  score: number;
  rationale: "preferred" | "region_match" | "available";
  isPreferred: boolean;
  regionMatch: boolean;
  visitsOnDate: number;
}

interface TechOption {
  id: string;
  username: string;
}

interface Props {
  visitId: string;
  customerId: string;
  siteId: string | null;
  scheduledFor: string;
  state: string;
  leadTechnicianId: string | null;
  collaboratorTechnicianIds: string[];
  onScheduled: () => void;
}

export function SchedulerWidget({
  visitId,
  customerId,
  siteId,
  scheduledFor,
  state,
  leadTechnicianId,
  collaboratorTechnicianIds,
  onScheduled,
}: Readonly<Props>) {
  const t = useTranslations("visits");
  const api = useApi();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [allTechs, setAllTechs] = useState<TechOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickedLead, setPickedLead] = useState<string | null>(
    leadTechnicianId,
  );
  const [pickedCollab, setPickedCollab] = useState<string[]>(
    collaboratorTechnicianIds,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        customerId,
        scheduledFor,
        maxResults: "3",
      });
      if (siteId) sp.set("siteId", siteId);
      const res = await api.get<Candidate[]>(
        `/api/visits/recommend?${sp.toString()}`,
      );
      setCandidates(res.data);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [api, customerId, siteId, scheduledFor]);

  useEffect(() => {
    let cancelled = false;
    if (state === "SUGGESTED" || state === "SCHEDULED") {
      loadRecommendations().catch(() => undefined);
      api
        .get<TechOption[]>(`/api/users?role=TECHNICIAN&pageSize=100`)
        .then((res) => {
          if (!cancelled) setAllTechs(res.data);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [api, state, loadRecommendations]);

  const confirm = async () => {
    if (!pickedLead) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/visits/${visitId}/schedule`, {
        leadTechnicianId: pickedLead,
        collaboratorTechnicianIds: pickedCollab,
      });
      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (state !== "SUGGESTED") {
    return null;
  }

  const rationaleLabel = (r: Candidate["rationale"]) => {
    if (r === "preferred") return t("rationalePreferred");
    if (r === "region_match") return t("rationaleRegionMatch");
    return t("rationaleAvailable");
  };

  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-[#002A4D]">
        {t("recommendTitle")}
      </h3>
      {loading ? (
        <p className="text-sm text-[#737373]">{t("loadingRecommend")}</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-[#737373]">{t("recommendEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((c) => {
            const selected = c.technicianId === pickedLead;
            return (
              <li key={c.technicianId}>
                <button
                  type="button"
                  onClick={() => setPickedLead(c.technicianId)}
                  className={
                    selected
                      ? "flex w-full items-start justify-between gap-3 rounded-md border border-[var(--brand-blue-500)] bg-[var(--brand-blue-50)] p-3 text-left"
                      : "flex w-full items-start justify-between gap-3 rounded-md border border-[#e5e5e5] bg-white p-3 text-left hover:bg-[#f5f5f5]"
                  }
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.username}</span>
                      <StatusBadge
                        tone={
                          c.rationale === "preferred"
                            ? "success"
                            : c.rationale === "region_match"
                              ? "info"
                              : "neutral"
                        }
                      >
                        {rationaleLabel(c.rationale)}
                      </StatusBadge>
                    </div>
                    <span className="text-xs text-[#737373]">
                      {c.preferredRegion ?? "—"} ·{" "}
                      {t("load", { n: c.visitsOnDate })}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[#737373]">
                    {c.score}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#525252]">
            {t("manualPick")}
          </label>
          <Combobox
            value={pickedLead}
            onChange={setPickedLead}
            options={allTechs.map((u) => ({ value: u.id, label: u.username }))}
            placeholder={t("manualPick")}
            searchable
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#525252]">
            {t("addCollaborator")}
          </label>
          <Combobox
            value={null}
            onChange={(v) => {
              if (v && !pickedCollab.includes(v) && v !== pickedLead) {
                setPickedCollab([...pickedCollab, v]);
              }
            }}
            options={allTechs
              .filter(
                (u) =>
                  u.id !== pickedLead && !pickedCollab.includes(u.id),
              )
              .map((u) => ({ value: u.id, label: u.username }))}
            placeholder={t("addCollaborator")}
            searchable
            allowClear={false}
          />
          {pickedCollab.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {pickedCollab.map((id) => {
                const u = allTechs.find((x) => x.id === id);
                return (
                  <li
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-blue-50)] px-2 py-0.5 text-xs text-[var(--brand-blue-700)]"
                  >
                    {u?.username ?? id}
                    <button
                      type="button"
                      aria-label="Remove collaborator"
                      onClick={() =>
                        setPickedCollab(pickedCollab.filter((c) => c !== id))
                      }
                      className="text-[var(--brand-blue-700)] hover:text-red-600"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button
          onClick={confirm}
          disabled={submitting || !pickedLead}
        >
          {submitting ? t("saving") : t("schedule")}
        </Button>
      </div>
    </div>
  );
}
