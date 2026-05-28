"use client";

/**
 * UC-RP-06 — Audit log search.
 *
 * Filters: actor, entityType, action, date range, free text. Paginated.
 * STAFF sees only own actions (server enforces).
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

interface AuditRow {
  id: string;
  at: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  before: unknown;
  after: unknown;
}

interface AuditResp {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function AuditReportPage() {
  const t = useTranslations("reports.audit");
  const api = useApi();
  const [actorId, setActorId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [data, setData] = useState<AuditResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const queryString = useCallback(() => {
    const sp = new URLSearchParams();
    if (actorId) sp.set("actorId", actorId);
    if (entityType) sp.set("entityType", entityType);
    if (action) sp.set("action", action);
    if (start) sp.set("start", start);
    if (end) sp.set("end", end);
    if (q) sp.set("q", q);
    sp.set("page", String(page));
    sp.set("pageSize", String(pageSize));
    return sp.toString();
  }, [actorId, entityType, action, start, end, q, page, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AuditResp>(`/api/reports/audit?${queryString()}`);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [api, queryString]);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const onSearch = () => {
    setPage(1);
    load().catch(() => undefined);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[#525252]">{t("description")}</p>
      </header>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <FormField label={t("filters.actorId")}>
            <Input
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              placeholder="userId"
            />
          </FormField>
          <FormField label={t("filters.entityType")}>
            <Input
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="Customer"
            />
          </FormField>
          <FormField label={t("filters.action")}>
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="CUSTOMER_CREATE"
            />
          </FormField>
          <FormField label={t("filters.start")}>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </FormField>
          <FormField label={t("filters.end")}>
            <Input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </FormField>
          <FormField label={t("filters.q")}>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("filters.qPlaceholder")}
            />
          </FormField>
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={onSearch}>{t("search")}</Button>
          <a
            href={`/api/reports/audit?${queryString()}&format=csv`}
            className="inline-flex h-10 items-center rounded-lg border border-[#e5e5e5] bg-white px-3 text-sm text-[#525252] hover:bg-[#fafafa]"
          >
            {t("downloadCsv")}
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        {loading && <p className="text-sm text-[#737373]">Loading…</p>}
        {!loading && (data?.rows.length ?? 0) === 0 && (
          <p className="text-sm text-[#737373]">{t("noResults")}</p>
        )}
        {!loading && (data?.rows.length ?? 0) > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#737373]">
                    <th className="py-2 font-medium">{t("columns.at")}</th>
                    <th className="py-2 font-medium">{t("columns.actor")}</th>
                    <th className="py-2 font-medium">{t("columns.action")}</th>
                    <th className="py-2 font-medium">{t("columns.entity")}</th>
                    <th className="py-2 font-medium">{t("columns.ip")}</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((r) => (
                    <Row
                      key={r.id}
                      r={r}
                      expanded={expanded === r.id}
                      onToggle={() =>
                        setExpanded(expanded === r.id ? null : r.id)
                      }
                      t={t}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#737373]">
              <span>
                {t("pageOf", { page: data?.page ?? 1, total: totalPages })} ·{" "}
                {data?.total ?? 0} {t("rows")}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  size="sm"
                >
                  {t("prev")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  size="sm"
                >
                  {t("next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Row({
  r,
  expanded,
  onToggle,
  t,
}: Readonly<{
  r: AuditRow;
  expanded: boolean;
  onToggle: () => void;
  t: (k: string) => string;
}>) {
  return (
    <>
      <tr className="border-t border-[#f0f0f0] align-top">
        <td className="py-2 font-mono text-xs">
          {new Date(r.at).toLocaleString()}
        </td>
        <td className="py-2">
          <div className="font-medium">{r.actorName ?? r.actorType}</div>
          <div className="text-xs text-[#737373]">{r.actorType}</div>
        </td>
        <td className="py-2 font-mono text-xs">{r.action}</td>
        <td className="py-2">
          <div>{r.entityType}</div>
          <div className="font-mono text-xs text-[#737373]">{r.entityId}</div>
        </td>
        <td className="py-2 font-mono text-xs">{r.ipAddress ?? "—"}</td>
        <td className="py-2 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-[var(--brand-blue-700)] hover:underline"
          >
            {expanded ? t("collapseDetails") : t("viewDetails")}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-[#f0f0f0] bg-[#fafafa]">
          <td colSpan={6} className="py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase text-[#737373]">
                  {t("before")}
                </div>
                <pre className="mt-1 whitespace-pre-wrap rounded-md bg-white p-2 text-[11px] font-mono text-[#525252]">
                  {r.before ? JSON.stringify(r.before, null, 2) : "—"}
                </pre>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-[#737373]">
                  {t("after")}
                </div>
                <pre className="mt-1 whitespace-pre-wrap rounded-md bg-white p-2 text-[11px] font-mono text-[#525252]">
                  {r.after ? JSON.stringify(r.after, null, 2) : "—"}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
