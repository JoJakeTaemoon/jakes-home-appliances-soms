"use client";

/**
 * UC-AD-04 — DB-backed notification template editor (ADMIN + MANAGER).
 *
 * Lists every (templateCode × locale) pair with its file-based default and
 * any active DB override. Click "Edit" to overwrite the body (and subject
 * for email templates); "Revert" deletes the override row and the file
 * default takes over again. Each save invalidates the 60s in-memory cache
 * in the notification send path.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApi } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Combobox } from "@/components/ui/combobox";
import { getTemplateDescription } from "@/lib/notifications/template-descriptions";
import { formatDateTime } from "@/lib/format";
import type { NotificationLocale } from "@/lib/notifications/types";

interface TemplateRow {
  code: string;
  channel: "SMS" | "EMAIL";
  locale: "ko" | "vi" | "en";
  defaultBody: string;
  defaultSubject: string | null;
  overrideBody: string | null;
  overrideSubject: string | null;
  overrideUpdatedAt: string | null;
  enabled: boolean;
}

export default function NotificationTemplatesPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  // Descriptions explain the template to the admin, so they follow the UI
  // language — not the template locale tab being edited.
  const uiLocale = useLocale() as NotificationLocale;
  const { user } = useAuth();
  const api = useApi();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "SMS" | "EMAIL">("ALL");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedLocale, setSelectedLocale] = useState<"ko" | "vi" | "en">("vi");
  const [editBody, setEditBody] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ rows: TemplateRow[] }>(
        `/api/admin/notification-templates`,
      );
      setRows(res.data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (user?.role !== "ADMIN" && user?.role !== "MANAGER") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => undefined);
  }, [user?.role, load]);

  const visibleRows = useMemo(() => {
    return rows.filter((r) => filter === "ALL" || r.channel === filter);
  }, [rows, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, TemplateRow[]>();
    for (const r of visibleRows) {
      const list = map.get(r.code) ?? [];
      list.push(r);
      map.set(r.code, list);
    }
    return map;
  }, [visibleRows]);

  const selected = useMemo(() => {
    if (!selectedCode) return null;
    return rows.find(
      (r) => r.code === selectedCode && r.locale === selectedLocale,
    ) ?? null;
  }, [rows, selectedCode, selectedLocale]);

  useEffect(() => {
    if (!selected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditBody(selected.overrideBody ?? selected.defaultBody);
    setEditSubject(selected.overrideSubject ?? selected.defaultSubject ?? "");
  }, [selected]);

  const selectedDescription = selected
    ? getTemplateDescription(selected.code, uiLocale)
    : "";
  const channelLabel = (channel: "SMS" | "EMAIL") =>
    t(
      channel === "SMS"
        ? "notificationTemplates.channelSms"
        : "notificationTemplates.channelEmail",
    );

  if (user && user.role !== "ADMIN" && user.role !== "MANAGER") {
    return (
      <div className="rounded-md border-2 border-red-500 bg-red-50 p-4 text-sm text-red-700">
        {t("notificationTemplates.adminRequired")}
      </div>
    );
  }

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { body: editBody };
      if (selected.channel === "EMAIL") body.subject = editSubject;
      await api.put<unknown>(
        `/api/admin/notification-templates/${selected.code}?locale=${selected.locale}`,
        body,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const revert = async () => {
    if (!selected) return;
    if (!selected.overrideBody) return;
    setSaving(true);
    setError(null);
    try {
      await api.del(
        `/api/admin/notification-templates/${selected.code}?locale=${selected.locale}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#002A4D]">
          {t("notificationTemplates.title")}
        </h1>
        <div className="w-44">
          <Combobox
            value={filter}
            onChange={(v) =>
              setFilter((v ?? "ALL") as "ALL" | "SMS" | "EMAIL")
            }
            options={[
              { value: "ALL", label: t("notificationTemplates.channelAll") },
              { value: "SMS", label: t("notificationTemplates.channelSms") },
              { value: "EMAIL", label: t("notificationTemplates.channelEmail") },
            ]}
            allowClear={false}
            searchable={false}
          />
        </div>
      </header>

      {loading && <p className="text-sm text-[#737373]">{tc("loading")}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr,1.4fr]">
        {/* List */}
        <section className="rounded-2xl border border-[#e5e5e5] bg-white">
          <ul className="divide-y divide-[#f0f0f0]">
            {[...grouped.entries()].map(([code, codeRows]) => {
              const description = getTemplateDescription(code, uiLocale);
              return (
                <li key={code} className="p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-xs text-[#525252]">{code}</span>
                    <span className="text-[10px] uppercase tracking-wider text-[#a3a3a3]">
                      {codeRows[0] && channelLabel(codeRows[0].channel)}
                    </span>
                  </div>
                  {description && (
                    <p className="mb-2 text-[11px] leading-snug text-[#737373]">
                      {description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {codeRows.map((r) => {
                      const active =
                        r.code === selectedCode && r.locale === selectedLocale;
                      const hasOverride = !!r.overrideBody;
                      return (
                        <button
                          key={`${r.code}-${r.locale}`}
                          type="button"
                          onClick={() => {
                            setSelectedCode(r.code);
                            setSelectedLocale(r.locale);
                          }}
                          className={
                            active
                              ? "inline-flex items-center gap-1 rounded-md border-2 border-[var(--brand-blue-500)] bg-[var(--brand-blue-50)] px-2 py-1 text-xs font-medium text-[var(--brand-blue-700)]"
                              : "inline-flex items-center gap-1 rounded-md border border-[#e5e5e5] bg-white px-2 py-1 text-xs text-[#525252] hover:bg-[#fafafa]"
                          }
                        >
                          <span>{r.locale.toUpperCase()}</span>
                          {!r.enabled && (
                            <span className="rounded-sm bg-red-100 px-1 text-[9px] font-semibold uppercase text-red-700">
                              {t("notificationTemplates.off")}
                            </span>
                          )}
                          {hasOverride && (
                            <span className="text-amber-600">•</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Editor */}
        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          {!selected ? (
            <p className="text-sm text-[#737373]">
              {t("notificationTemplates.pickPrompt")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <header className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h2 className="font-mono text-sm text-[#002A4D]">
                    {selected.code} · {selected.locale.toUpperCase()}
                  </h2>
                  <p className="mt-0.5 text-xs text-[#737373]">
                    {t("notificationTemplates.channelInfo", {
                      channel: channelLabel(selected.channel),
                    })}
                    {selected.overrideUpdatedAt &&
                      ` · ${t("notificationTemplates.overrideSaved", {
                        at: formatDateTime(selected.overrideUpdatedAt, uiLocale),
                      })}`}
                  </p>
                  {selectedDescription && (
                    <p className="mt-2 rounded-md bg-[#fafafa] px-2 py-1.5 text-[11px] leading-snug text-[#525252]">
                      {selectedDescription}
                    </p>
                  )}
                </div>
                <EnabledToggle
                  enabled={selected.enabled}
                  label={t(
                    selected.enabled
                      ? "notificationTemplates.enabled"
                      : "notificationTemplates.disabled",
                  )}
                  busy={saving}
                  onToggle={async () => {
                    setSaving(true);
                    setError(null);
                    try {
                      await api.patch(
                        `/api/admin/notification-templates/${selected.code}?locale=${selected.locale}`,
                        { enabled: !selected.enabled },
                      );
                      await load();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setSaving(false);
                    }
                  }}
                />
              </header>
              {selected.channel === "EMAIL" && (
                <FormField label={t("notificationTemplates.subject")}>
                  <Input
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-[#737373]">
                    {t("notificationTemplates.defaultValue", {
                      value: selected.defaultSubject ?? "—",
                    })}
                  </p>
                </FormField>
              )}
              <FormField label={t("notificationTemplates.body")}>
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={selected.channel === "SMS" ? 4 : 14}
                />
                <p className="mt-1 text-[11px] text-[#737373]">
                  {t("notificationTemplates.placeholderHint", {
                    example: "{var}",
                    count: editBody.length,
                  })}
                </p>
              </FormField>
              <details className="text-xs text-[#525252]">
                <summary className="cursor-pointer">
                  {t("notificationTemplates.viewDefault")}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-md bg-[#fafafa] p-2 font-mono text-[11px] text-[#525252]">
                  {selected.defaultBody}
                </pre>
              </details>
              {error && (
                <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button onClick={save} disabled={saving}>
                  {saving ? tc("saving") : t("notificationTemplates.save")}
                </Button>
                {selected.overrideBody && (
                  <Button
                    onClick={revert}
                    disabled={saving}
                    variant="secondary"
                  >
                    {t("notificationTemplates.revert")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EnabledToggle({
  enabled,
  label,
  busy,
  onToggle,
}: Readonly<{
  enabled: boolean;
  label: string;
  busy: boolean;
  onToggle: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={enabled}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-50 ${
        enabled ? "bg-emerald-500" : "bg-[#d4d4d4]"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
      <span className="sr-only">{label}</span>
    </button>
  );
}
