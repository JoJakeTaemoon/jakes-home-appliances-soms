"use client";

/**
 * Delivery history for SMS + email (ADMIN + MANAGER).
 *
 * Every dispatch writes a NotificationLog row, so this screen is the place to
 * answer "did the customer actually get it?". Successful rows carry the
 * provider's message id; failed rows carry the provider's own words, which
 * for eSMS includes the numeric CodeResult and what it means (146 = the body
 * is not registered with the carrier yet, 104 = brandname problem, and so on).
 *
 * Failed rows can be retried from here. The retry re-renders the message from
 * the current template and contact, so fixing the template or the phone
 * number and pressing Resend is the whole recovery path.
 *
 * Staff can also send a template by hand: pick one of the registered SMS
 * templates, fill its variables, choose the recipients. There is no free-text
 * box on purpose — eSMS refuses any body it has not registered for the
 * brandname, so typed text would never reach a handset.
 */

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useApiPageQuery } from "@/lib/api/hooks";
import { useApi } from "@/lib/api/client";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { approximateSmsSegments } from "@/lib/notifications/sms-segments";

interface LogRow {
  id: string;
  createdAt: string;
  sentAt: string | null;
  templateCode: string;
  channel: "SMS" | "EMAIL";
  locale: "ko" | "vi" | "en";
  provider: string;
  recipient: string;
  status: "QUEUED" | "SENT" | "FAILED" | "MOCKED" | "SKIPPED";
  providerMessageId: string | null;
  errorMessage: string | null;
  segmentsUsed: number | null;
  subject: string | null;
  body: string | null;
  bodyRedacted: boolean;
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  contactName: string | null;
}

interface TemplateRow {
  code: string;
  channel: "SMS" | "EMAIL";
  locale: "ko" | "vi" | "en";
  description: string;
  defaultBody: string;
  overrideBody: string | null;
  enabled: boolean;
}

/** A template collapsed across its three locale rows. */
interface TemplateOption {
  code: string;
  description: string;
  bodies: Record<"ko" | "vi" | "en", string>;
  vars: string[];
}

interface CustomerHit {
  id: string;
  code: string;
  name: string;
  contacts: { id: string; name: string; phone1: string }[];
}

const PAGE_SIZE = 50;
const STATUS_OPTIONS = ["SENT", "FAILED", "MOCKED", "SKIPPED", "QUEUED"] as const;
const CHANNEL_OPTIONS = ["SMS", "EMAIL"] as const;
const PERIOD_OPTIONS = ["TODAY", "D7", "D30"] as const;

function statusTone(
  status: LogRow["status"],
): "success" | "danger" | "warning" | "info" | "muted" {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  if (status === "SKIPPED") return "warning";
  if (status === "MOCKED") return "info";
  return "muted";
}

/** `{var}` interpolation, matching the server-side renderer. */
function renderBody(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] || m);
}

/**
 * Every placeholder the template uses across its locales. `hq_phone` is left
 * out: the server always substitutes the company number from settings.
 */
function varsOf(bodies: Record<string, string>): string[] {
  const found = new Set<string>();
  for (const body of Object.values(bodies)) {
    for (const m of body.matchAll(/\{(\w+)\}/g)) {
      if (m[1] !== "hq_phone") found.add(m[1]);
    }
  }
  return [...found];
}

/** Period filter → the `start` query param, as a VST calendar day. */
function periodStart(period: string | null): string | null {
  if (!period) return null;
  const days = period === "TODAY" ? 0 : period === "D7" ? 6 : 29;
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export default function NotificationLogsPage() {
  const t = useTranslations("admin.notificationLogs");
  const api = useApi();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<LogRow | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Compose — pick a registered template, fill it, send it.
  const [composeOpen, setComposeOpen] = useState(false);
  const [mode, setMode] = useState<"CUSTOMER" | "PHONE">("CUSTOMER");
  const [customerSearch, setCustomerSearch] = useState("");
  const [picked, setPicked] = useState<{ id: string; label: string }[]>([]);
  const [rawPhone, setRawPhone] = useState("");
  const [templateCode, setTemplateCode] = useState<string | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [previewLocale, setPreviewLocale] = useState<"ko" | "vi" | "en">("vi");
  const [sending, setSending] = useState(false);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (search.trim()) params.set("q", search.trim());
    if (status) params.set("status", status);
    if (channel) params.set("channel", channel);
    const start = periodStart(period);
    if (start) params.set("start", start);
    return `/api/admin/notification-logs?${params.toString()}`;
  }, [page, search, status, channel, period]);

  const query = useApiPageQuery<LogRow[]>(url);
  const rows = query.data?.data ?? [];
  const total =
    (query.data?.pagination as { total?: number } | undefined)?.total ?? 0;

  const resend = useCallback(
    async (row: LogRow) => {
      setResendingId(row.id);
      try {
        const res = await api.post<{
          status: string;
          errorMessage: string | null;
        }>(`/api/admin/notification-logs/${row.id}/resend`);
        if (res.data.status === "FAILED") {
          toast.push(t("resendFailed", { reason: res.data.errorMessage ?? "" }), {
            tone: "error",
          });
        } else {
          toast.push(t("resendQueued"), { tone: "success" });
        }
        setSelected(null);
        await query.refetch();
      } catch (err) {
        toast.push(
          t("resendFailed", {
            reason: err instanceof Error ? err.message : String(err),
          }),
          { tone: "error" },
        );
      } finally {
        setResendingId(null);
      }
    },
    [api, query, t, toast],
  );

  // Registered templates, loaded once the compose modal opens. The admin
  // template screen is the source of truth, so an edited body shows up here.
  const templateQuery = useApiPageQuery<{ rows: TemplateRow[] }>(
    "/api/admin/notification-templates",
    { enabled: composeOpen },
  );
  const templateOptions: TemplateOption[] = useMemo(() => {
    const rows = templateQuery.data?.data?.rows ?? [];
    const byCode = new Map<string, TemplateOption>();
    for (const r of rows) {
      if (r.channel !== "SMS" || !r.enabled) continue;
      const entry = byCode.get(r.code) ?? {
        code: r.code,
        description: "",
        bodies: { ko: "", vi: "", en: "" },
        vars: [],
      };
      entry.bodies[r.locale] = r.overrideBody ?? r.defaultBody;
      if (r.locale === "vi" || !entry.description) entry.description = r.description;
      byCode.set(r.code, entry);
    }
    return [...byCode.values()].map((o) => ({ ...o, vars: varsOf(o.bodies) }));
  }, [templateQuery.data]);

  const template = templateOptions.find((o) => o.code === templateCode) ?? null;
  const preview = template
    ? renderBody(template.bodies[previewLocale], vars)
    : "";
  const missingVars = template
    ? template.vars.filter((v) => !vars[v]?.trim())
    : [];

  // Only queried while the compose modal is open on customer mode.
  const customerQuery = useApiPageQuery<CustomerHit[]>(
    customerSearch.trim().length >= 1
      ? `/api/customers?q=${encodeURIComponent(customerSearch.trim())}&pageSize=8`
      : "",
    { enabled: composeOpen && mode === "CUSTOMER" },
  );
  const customerHits = customerQuery.data?.data ?? [];

  const closeCompose = useCallback(() => {
    setComposeOpen(false);
    setTemplateCode(null);
    setVars({});
    setPicked([]);
    setRawPhone("");
    setCustomerSearch("");
  }, []);

  const send = useCallback(async () => {
    setSending(true);
    try {
      const res = await api.post<{
        sent: number;
        failed: number;
        errorMessage: string | null;
      }>(
        "/api/admin/notification-logs/send",
        mode === "CUSTOMER"
          ? {
              templateCode,
              vars,
              customerContactIds: picked.map((p) => p.id),
            }
          : { templateCode, vars, phone: rawPhone, locale: previewLocale },
      );
      const { sent, failed } = res.data;
      if (sent === 0) {
        toast.push(t("sendFailed", { reason: res.data.errorMessage ?? "" }), {
          tone: "error",
        });
      } else if (failed > 0) {
        toast.push(t("sendPartial", { sent, failed }), { tone: "warning" });
        closeCompose();
      } else {
        toast.push(t("sendDone", { sent }), { tone: "success" });
        closeCompose();
      }
      await query.refetch();
    } catch (err) {
      toast.push(
        t("sendFailed", {
          reason: err instanceof Error ? err.message : String(err),
        }),
        { tone: "error" },
      );
    } finally {
      setSending(false);
    }
  }, [
    api,
    closeCompose,
    mode,
    picked,
    previewLocale,
    query,
    rawPhone,
    t,
    templateCode,
    toast,
    vars,
  ]);

  const canSend =
    !!template &&
    missingVars.length === 0 &&
    !sending &&
    (mode === "CUSTOMER" ? picked.length > 0 : rawPhone.trim().length >= 6);

  const columns: Column<LogRow>[] = [
    {
      key: "createdAt",
      header: t("colSentAt"),
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-[#525252]">
          {formatDateTime(r.createdAt, "vi")}
        </span>
      ),
    },
    {
      key: "channel",
      header: t("colChannel"),
      cell: (r) => (
        <span className="text-xs font-medium text-[#111]">{r.channel}</span>
      ),
    },
    {
      key: "template",
      header: t("colTemplate"),
      cell: (r) => (
        <div>
          <div className="font-mono text-[11px] text-[#111]">{r.templateCode}</div>
          <div className="text-[11px] text-[#a3a3a3]">
            {r.locale.toUpperCase()} · {r.provider}
          </div>
        </div>
      ),
    },
    {
      key: "recipient",
      header: t("colRecipient"),
      cell: (r) => (
        <div>
          <div className="text-xs text-[#111]">{r.recipient}</div>
          {(r.customerName ?? r.contactName) && (
            <div className="text-[11px] text-[#737373]">
              {r.customerName ?? r.contactName}
              {r.customerCode ? ` · ${r.customerCode}` : ""}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: t("colStatus"),
      cell: (r) => (
        <StatusBadge tone={statusTone(r.status)}>
          {t(`status.${r.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: "result",
      header: t("colResult"),
      cell: (r) =>
        r.errorMessage ? (
          <span className="line-clamp-2 text-[11px] text-red-700">
            {r.errorMessage}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-[#737373]">
            {r.providerMessageId ?? "—"}
            {r.segmentsUsed ? ` · ${r.segmentsUsed} seg` : ""}
          </span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) =>
        r.status === "FAILED" ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={resendingId === r.id}
            onClick={(e) => {
              e.stopPropagation();
              void resend(r);
            }}
          >
            {resendingId === r.id ? t("resending") : t("resend")}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="w-full">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[#737373]">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setComposeOpen(true)}>{t("compose")}</Button>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={t("searchPlaceholder")}
          className="max-w-xs"
        />
        <Combobox
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={STATUS_OPTIONS.map((s) => ({
            value: s,
            label: t(`status.${s}`),
          }))}
          placeholder={t("filterStatus")}
          allowClear
          searchable={false}
        />
        <Combobox
          value={channel}
          onChange={(v) => {
            setChannel(v);
            setPage(1);
          }}
          options={CHANNEL_OPTIONS.map((c) => ({ value: c, label: c }))}
          placeholder={t("filterChannel")}
          allowClear
          searchable={false}
        />
        <Combobox
          value={period}
          onChange={(v) => {
            setPeriod(v);
            setPage(1);
          }}
          options={PERIOD_OPTIONS.map((p) => ({
            value: p,
            label: t(`period.${p}`),
          }))}
          placeholder={t("filterPeriod")}
          allowClear
          searchable={false}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={query.isLoading}
        emptyText={t("empty")}
        onRowClick={(r) => setSelected(r)}
        footer={
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        }
      />

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        size="lg"
        title={selected?.templateCode}
        footer={
          selected?.status === "FAILED" ? (
            <Button
              disabled={resendingId === selected.id}
              onClick={() => void resend(selected)}
            >
              {resendingId === selected.id ? t("resending") : t("resend")}
            </Button>
          ) : null
        }
      >
        {selected && (
          <div className="flex flex-col gap-3 text-sm">
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-[#737373]">{t("colSentAt")}</dt>
              <dd>{formatDateTime(selected.createdAt, "vi")}</dd>
              <dt className="text-[#737373]">{t("colRecipient")}</dt>
              <dd>{selected.recipient}</dd>
              <dt className="text-[#737373]">{t("colStatus")}</dt>
              <dd>
                <StatusBadge tone={statusTone(selected.status)}>
                  {t(`status.${selected.status}`)}
                </StatusBadge>
              </dd>
              <dt className="text-[#737373]">{t("colProvider")}</dt>
              <dd>
                {selected.provider}
                {selected.providerMessageId
                  ? ` · ${selected.providerMessageId}`
                  : ""}
              </dd>
              {selected.segmentsUsed != null && (
                <>
                  <dt className="text-[#737373]">{t("colSegments")}</dt>
                  <dd>{selected.segmentsUsed}</dd>
                </>
              )}
            </dl>

            {selected.errorMessage && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {selected.errorMessage}
              </div>
            )}

            {selected.subject && (
              <div className="text-xs">
                <span className="text-[#737373]">{t("colSubject")}: </span>
                {selected.subject}
              </div>
            )}

            <div className="rounded-md bg-[#fafafa] px-3 py-2 text-xs whitespace-pre-wrap text-[#111]">
              {selected.bodyRedacted
                ? t("bodyRedacted")
                : (selected.body ?? t("bodyUnavailable"))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={composeOpen}
        onClose={closeCompose}
        size="md"
        title={t("composeTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={closeCompose} disabled={sending}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void send()} disabled={!canSend}>
              {sending ? t("sending") : t("sendAction")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            {(["CUSTOMER", "PHONE"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  mode === m
                    ? "rounded-lg border-2 border-[var(--brand-blue-500)] bg-[var(--brand-blue-50)] px-3 py-1.5 text-xs font-medium text-[var(--brand-blue-700)]"
                    : "rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs text-[#525252] hover:bg-[#fafafa]"
                }
              >
                {m === "CUSTOMER" ? t("modeCustomer") : t("modePhone")}
              </button>
            ))}
          </div>

          {mode === "CUSTOMER" ? (
            <div className="flex flex-col gap-2">
              <Input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder={t("searchCustomer")}
              />

              {picked.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {picked.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] px-2.5 py-1 text-[11px] text-[var(--brand-blue-700)]"
                    >
                      {p.label}
                      <button
                        type="button"
                        aria-label={t("removeRecipient")}
                        className="text-[var(--brand-blue-500)] hover:text-[var(--brand-blue-700)]"
                        onClick={() =>
                          setPicked((prev) => prev.filter((x) => x.id !== p.id))
                        }
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <ul className="max-h-48 divide-y divide-[#f0f0f0] overflow-y-auto rounded-lg border border-[#e5e5e5]">
                {customerHits.flatMap((c) =>
                  c.contacts
                    .filter((ct) => !picked.some((p) => p.id === ct.id))
                    .map((ct) => (
                      <li key={ct.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-[#fafafa]"
                          onClick={() =>
                            setPicked((prev) => [
                              ...prev,
                              {
                                id: ct.id,
                                label: `${ct.name} · ${ct.phone1}`,
                              },
                            ])
                          }
                        >
                          <span className="text-xs text-[#111]">
                            {c.name}{" "}
                            <span className="text-[#a3a3a3]">{c.code}</span>
                          </span>
                          <span className="text-[11px] text-[#737373]">
                            {ct.name} · {ct.phone1}
                          </span>
                        </button>
                      </li>
                    )),
                )}
                {customerSearch.trim() !== "" &&
                  customerHits.length === 0 &&
                  !customerQuery.isLoading && (
                    <li className="px-3 py-3 text-xs text-[#a3a3a3]">
                      {t("noCustomer")}
                    </li>
                  )}
                {customerSearch.trim() === "" && (
                  <li className="px-3 py-3 text-xs text-[#a3a3a3]">
                    {t("searchHint")}
                  </li>
                )}
              </ul>
              {picked.length > 0 && (
                <p className="text-[11px] text-[#737373]">
                  {t("pickedCount", { count: picked.length })}
                </p>
              )}
            </div>
          ) : (
            <Input
              value={rawPhone}
              onChange={(e) => setRawPhone(e.target.value)}
              placeholder={t("phonePlaceholder")}
            />
          )}

          <div className="flex flex-col gap-2">
            <Combobox
              value={templateCode}
              onChange={(v) => {
                setTemplateCode(v);
                setVars({});
              }}
              options={templateOptions.map((o) => ({
                value: o.code,
                label: o.description ? `${o.code} — ${o.description}` : o.code,
              }))}
              placeholder={t("pickTemplate")}
              allowClear={false}
            />

            {template && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#737373]">
                    {t("previewLocale")}
                  </span>
                  {(["vi", "en", "ko"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setPreviewLocale(l)}
                      className={
                        previewLocale === l
                          ? "rounded-md border-2 border-[var(--brand-blue-500)] bg-[var(--brand-blue-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-blue-700)]"
                          : "rounded-md border border-[#e5e5e5] bg-white px-2 py-0.5 text-[11px] text-[#525252] hover:bg-[#fafafa]"
                      }
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>

                {template.vars.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {template.vars.map((v) => (
                      <label key={v} className="flex flex-col gap-1">
                        <span className="font-mono text-[11px] text-[#525252]">
                          {`{${v}}`}
                        </span>
                        <Input
                          value={vars[v] ?? ""}
                          onChange={(e) =>
                            setVars((prev) => ({ ...prev, [v]: e.target.value }))
                          }
                          maxLength={200}
                        />
                      </label>
                    ))}
                  </div>
                )}

                <div className="rounded-md bg-[#fafafa] px-3 py-2 text-xs whitespace-pre-wrap text-[#111]">
                  {preview}
                </div>
                <p className="text-right text-[11px] text-[#737373]">
                  {t("segments", {
                    chars: preview.length,
                    segments: preview ? approximateSmsSegments(preview) : 0,
                  })}
                </p>
              </>
            )}
          </div>

          <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800 ring-1 ring-amber-200">
            {mode === "CUSTOMER" ? t("localeNotice") : t("registeredOnly")}
          </p>
        </div>
      </Modal>
    </div>
  );
}
