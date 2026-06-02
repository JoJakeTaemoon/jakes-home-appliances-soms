"use client";

/**
 * Portal SR message thread.
 *
 * Polls the messages endpoint every 30s + on send so customers see new
 * office replies without a page refresh. Uses AuditLog under the hood
 * (action='SR_MESSAGE') — no new schema table.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { useApiQuery } from "@/lib/api/hooks";

interface SrMessage {
  id: string;
  at: string;
  author: "CUSTOMER" | "OFFICE";
  authorName: string;
  body: string;
}

export function SrMessageThread({ srId }: Readonly<{ srId: string }>) {
  const t = useTranslations("portalThread");
  const { accessToken } = useCustomerAuth();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  // Polls every 30s so customer sees new office replies without refresh.
  const query = useApiQuery<{ messages: SrMessage[] }>(
    srId ? `/api/portal/service-requests/${srId}/messages` : null,
    { refetchInterval: 30_000 },
  );
  const messages = query.data?.messages ?? [];

  const send = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/service-requests/${srId}/messages`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ body: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? "Failed");
      }
      // The POST response includes the updated message list; bake it in
      // via a refetch so the query cache stays the single source of truth.
      await query.refetch();
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-2 rounded-2xl border border-[#e5e5e5] bg-white p-4">
      <h2 className="text-sm font-semibold text-[#002A4D]">{t("title")}</h2>
      {messages.length === 0 ? (
        <p className="text-sm text-[#737373]">{t("noMessages")}</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const isOffice = m.author === "OFFICE";
            return (
              <li
                key={m.id}
                className={
                  isOffice
                    ? "rounded-lg border border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] p-3"
                    : "rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3"
                }
              >
                <div className="flex items-center justify-between text-xs text-[#737373]">
                  <span>{isOffice ? t("office") : t("you")} · {m.authorName}</span>
                  <span>{new Date(m.at).toLocaleString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#262626]">
                  {m.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={t("placeholder")}
          className="w-full rounded-md border border-[#e5e5e5] bg-white p-2 text-sm text-[#262626] outline-none focus:border-[var(--brand-blue-500)]"
        />
        {error && (
          <p className="text-xs text-[#b91c1c]" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={sending || !body.trim()}
          onClick={send}
          className="self-end rounded-md bg-[var(--brand-blue-500)] px-4 py-1.5 text-sm font-semibold text-white outline-none disabled:opacity-50"
        >
          {sending ? "…" : t("send")}
        </button>
      </div>
    </section>
  );
}
