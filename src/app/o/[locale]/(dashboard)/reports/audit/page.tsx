"use client";

/**
 * UC-RP-06 — Audit log (ADMIN / MANAGER only).
 *
 * The previous engineer-oriented JSON dump was replaced with:
 *   - Natural-language one-line description per row
 *   - Field-level diff table (changed fields only)
 *   - Side drawer with collapsible "technical info" for power users
 *
 * Permission gate:
 *   - STAFF / TECHNICIAN see the localised "adminOnly" notice
 *   - The API mirrors this gate (403 for non-ADMIN/MANAGER)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { useApi } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  AuditFilters,
  EMPTY_FILTERS,
  type AuditFilterState,
} from "./_components/AuditFilters";
import { AuditRow, type AuditRowData } from "./_components/AuditRow";
import { AuditDetailDrawer } from "./_components/AuditDetailDrawer";

interface AuditResp {
  rows: AuditRowData[];
  total: number;
  page: number;
  pageSize: number;
}

export default function AuditReportPage() {
  const t = useTranslations("reports.audit");
  const api = useApi();
  const { user } = useAuth();

  const [draft, setDraft] = useState<AuditFilterState>(EMPTY_FILTERS);
  const [committed, setCommitted] = useState<AuditFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  const [data, setData] = useState<AuditResp | null>(null);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<AuditRowData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isAllowed =
    !!user && (user.role === "ADMIN" || user.role === "MANAGER");

  const queryString = useCallback(() => {
    const sp = new URLSearchParams();
    if (committed.entityType) sp.set("entityType", committed.entityType);
    if (committed.action) sp.set("action", committed.action);
    if (committed.actor) sp.set("actorId", committed.actor);
    if (committed.rangeStart) sp.set("start", committed.rangeStart);
    if (committed.rangeEnd) sp.set("end", committed.rangeEnd);
    if (committed.q) sp.set("q", committed.q);
    sp.set("page", String(page));
    sp.set("pageSize", String(pageSize));
    return sp.toString();
  }, [committed, page, pageSize]);

  const load = useCallback(async () => {
    if (!isAllowed) return;
    setLoading(true);
    try {
      const res = await api.get<AuditResp>(
        `/api/reports/audit?${queryString()}`,
      );
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [api, isAllowed, queryString]);

  useEffect(() => {
    // Fetches list when filters/page change — calls setState via setData on
    // success. This is the canonical "sync data into React" effect pattern;
    // not a render-cascade hazard the lint rule is targeting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => undefined);
  }, [load]);

  const onSearch = () => {
    setCommitted(draft);
    setPage(1);
  };
  const onReset = () => {
    setDraft(EMPTY_FILTERS);
    setCommitted(EMPTY_FILTERS);
    setPage(1);
  };

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1),
    [data, pageSize],
  );

  if (user && !isAllowed) {
    return (
      <div
        role="alert"
        className="rounded-md border-2 border-red-500 bg-red-50 p-4 text-sm text-red-700"
      >
        {t("adminOnly")}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[#525252]">{t("description")}</p>
      </header>

      <AuditFilters
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={onSearch}
        onReset={onReset}
        loading={loading}
      />

      <section className="rounded-2xl border-2 border-[#e5e5e5] bg-white">
        <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
          <span className="text-xs text-[#737373]">
            {data
              ? `${data.total} ${t("rows")}`
              : loading
                ? t("loading")
                : ""}
          </span>
          <a
            href={`/api/reports/audit?${queryString()}&format=csv`}
            className="rounded-md border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs text-[#525252] hover:bg-[#FAFAFA]"
          >
            {t("downloadCsv")}
          </a>
        </div>

        {loading && (
          <p className="px-4 py-6 text-sm text-[#737373]">{t("loading")}</p>
        )}
        {!loading && (data?.rows.length ?? 0) === 0 && (
          <p className="px-4 py-6 text-sm text-[#737373]">{t("noResults")}</p>
        )}
        {!loading && (data?.rows.length ?? 0) > 0 && (
          <ul
            className="divide-y divide-[#f0f0f0]"
            data-testid="audit-row-list"
          >
            {(data?.rows ?? []).map((row) => (
              <AuditRow
                key={row.id}
                row={row}
                onOpen={(r) => {
                  setSelected(r);
                  setDrawerOpen(true);
                }}
              />
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-[#f0f0f0] px-4 py-3 text-xs text-[#737373]">
          <span>
            {t("pageOf", { page: data?.page ?? 1, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1 || loading}
              size="sm"
            >
              {t("prev")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || loading}
              size="sm"
            >
              {t("next")}
            </Button>
          </div>
        </div>
      </section>

      <AuditDetailDrawer
        row={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
