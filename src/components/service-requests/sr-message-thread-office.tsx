"use client";

/**
 * Office-side SR conversation thread. Reads + posts via the staff-auth
 * endpoint `/api/service-requests/:id/messages`.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

interface SrMessage {
  id: string;
  at: string;
  author: "CUSTOMER" | "OFFICE";
  authorName: string;
  body: string;
}

export function SrMessageThreadOffice({ srId }: Readonly<{ srId: string }>) {
  const t = useTranslations("portalThread");
  const api = useApi();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryUrl = srId ? `/api/service-requests/${srId}/messages` : null;
  const query = useApiQuery<{ messages: SrMessage[] }>(queryUrl, {
    refetchInterval: 30_000,
  });
  const messages = query.data?.messages ?? [];
  const qc = useQueryClient();

  const send = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      const env = (await api.post<{ messages: SrMessage[] }>(
        `/api/service-requests/${srId}/messages`,
        { body: trimmed },
      )) as unknown as { data: { messages: SrMessage[] } };
      // Inject POST response into cache so the new message shows up
      // immediately without the refetch flash.
      if (queryUrl && Array.isArray(env.data?.messages)) {
        qc.setQueryData([queryUrl], { messages: env.data.messages });
      }
      setBody("");
      query.refetch().catch(() => undefined);
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
                  <span>
                    {isOffice ? t("office") : t("you")} · {m.authorName}
                  </span>
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
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={t("placeholder")}
        />
        {error && (
          <p className="text-xs text-red-700" role="alert">
            {error}
          </p>
        )}
        <Button
          onClick={send}
          disabled={sending || !body.trim()}
          size="sm"
          className="self-end"
        >
          {sending ? "…" : t("send")}
        </Button>
      </div>
    </section>
  );
}
