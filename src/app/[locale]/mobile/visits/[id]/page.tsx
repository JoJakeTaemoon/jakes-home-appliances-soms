"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useApi } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { MobileWrapper } from "@/components/mobile/mobile-wrapper";
import {
  VisitStateBadge,
  VisitTypeBadge,
} from "@/components/visits/visit-state-badge";
import { formatDate } from "@/lib/format";
import { HQ_PHONE } from "@/lib/config/company";
import { Phone, MapPin, CheckCircle2, AlertTriangle, Play, Send } from "lucide-react";

interface OfficeNoteEntry {
  at: string;
  authorId: string;
  authorName: string;
  text: string;
}

interface VisitDetail {
  id: string;
  type: string;
  state: string;
  scheduledFor: string;
  scheduledWindow: string | null;
  expectedAmount: string | null;
  findings: string | null;
  officeNotes: OfficeNoteEntry[] | null;
  leadTechnicianId: string | null;
  collaboratorTechnicianIds: string[];
  hqPhone: string | null;
  customer: {
    name: string;
    code: string;
    address: string | null;
    district: string | null;
    city: string | null;
    contacts: { name: string; isPrimary: boolean; scope: string; siteId: string | null }[];
  };
  equipment: {
    serialNumber: string | null;
    model: { modelCode: string; name: string };
    site: { id: string; name: string } | null;
  } | null;
  leadTechnician: { username: string } | null;
  serviceRequest: {
    id: string;
    code: string;
    type: string;
    description: string;
    isPaid: boolean;
  } | null;
}

export default function MobileVisitDetailPage() {
  return (
    <MobileWrapper>
      <MobileVisitDetailContent />
    </MobileWrapper>
  );
}

function MobileVisitDetailContent() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("mobile");
  const tv = useTranslations("visits");
  const locale = useLocale();
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();
  const [data, setData] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<VisitDetail>(`/api/mobile/visits/${id}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    if (!id) return;
    reload().catch(() => undefined);
  }, [id, reload]);

  if (loading && !data) return <p className="text-sm text-[#737373]">Loading…</p>;
  if (error || !data) {
    return <p className="text-sm text-red-600">{error ?? "Not found"}</p>;
  }

  const isLead = !!user && data.leadTechnicianId === user.id;

  const addressStr = [data.customer.address, data.customer.district, data.customer.city]
    .filter(Boolean)
    .join(", ");
  const mapsUrl = addressStr
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressStr)}`
    : null;
  const primaryOps =
    data.customer.contacts.find((c) => c.isPrimary) ?? data.customer.contacts[0];

  const start = async () => {
    setActionError(null);
    try {
      await api.post(`/api/mobile/visits/${id}/start`);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const submitOfficeNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setActionError(null);
    setNoteSaving(true);
    try {
      await api.post(`/api/mobile/visits/${id}/office-note`, { text });
      setNoteText("");
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setNoteSaving(false);
    }
  };

  const officeNotes = data.officeNotes ?? [];
  const hqPhone = data.hqPhone ?? HQ_PHONE;
  const hqPhoneTel = hqPhone.replace(/[^\d+]/g, "");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <VisitTypeBadge type={data.type} />
          <VisitStateBadge state={data.state} />
        </div>
        <h1 className="text-lg font-semibold text-[#002A4D]">{data.customer.name}</h1>
        <p className="text-sm text-[#525252]">
          {formatDate(data.scheduledFor, locale)} · {data.scheduledFor.slice(11, 16)}
          {data.scheduledWindow ? ` · ${data.scheduledWindow}` : ""}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-2">
        <a
          href={`tel:${hqPhoneTel}`}
          className="flex h-16 items-center justify-between rounded-xl border border-[#e5e5e5] bg-white px-4 text-sm font-medium text-[#002A4D] shadow-sm active:scale-[0.99]"
        >
          <span className="flex items-center gap-2">
            <Phone className="size-5 text-[var(--brand-blue-500)]" />
            {t("callHq")}
          </span>
          <span className="text-xs text-[#737373]">{hqPhone}</span>
        </a>
        {primaryOps && (
          <p className="px-1 text-xs text-[#737373]">
            {t("contactLabel")}: {primaryOps.name}
          </p>
        )}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-16 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 text-sm font-medium text-[#002A4D] shadow-sm active:scale-[0.99]"
          >
            <MapPin className="size-5 text-[var(--brand-blue-500)]" />
            {t("openMaps")}
          </a>
        )}
      </div>

      <section className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-[#737373]">{tv("equipment")}</h2>
        {data.equipment ? (
          <p className="mt-1 text-sm">
            {data.equipment.model.modelCode} · {data.equipment.model.name}
            <br />
            <span className="font-mono text-xs text-[#737373]">
              {data.equipment.serialNumber ?? "—"}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-[#737373]">—</p>
        )}
      </section>

      {data.serviceRequest && (
        <section className="rounded-xl border border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] p-4 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-blue-700)]">
            {data.serviceRequest.code} · {data.serviceRequest.type}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[#262626]">
            {data.serviceRequest.description}
          </p>
        </section>
      )}

      {addressStr && (
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-medium text-[#737373]">Address</h2>
          <p className="mt-1 text-sm">{addressStr}</p>
        </section>
      )}

      <section className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-[#737373]">{t("officeNote.title")}</h2>
        <p className="mt-1 text-xs text-[#a3a3a3]">{t("officeNote.hint")}</p>
        {officeNotes.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {officeNotes.map((n, i) => (
              <li key={`${n.at}-${i}`} className="rounded-lg bg-[#f5f5f5] p-2 text-sm text-[#262626]">
                <span className="block whitespace-pre-wrap">{n.text}</span>
                <span className="mt-1 block text-[10px] text-[#737373]">
                  {n.authorName} · {formatDate(n.at, locale)} {n.at.slice(11, 16)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t("officeNote.placeholder")}
          className="mt-3 w-full resize-none rounded-lg border border-[#e5e5e5] p-2 text-sm focus:border-[var(--brand-blue-500)] focus:outline-none"
        />
        <Button
          onClick={submitOfficeNote}
          disabled={!noteText.trim()}
          isLoading={noteSaving}
          variant="outline"
          fullWidth
          className="mt-2"
        >
          <span className="inline-flex items-center gap-2">
            <Send className="size-4" />
            {t("officeNote.submit")}
          </span>
        </Button>
      </section>

      {actionError && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{actionError}</p>
      )}

      <div className="flex flex-col gap-2">
        {isLead && data.state === "SCHEDULED" && (
          <Button onClick={start} fullWidth size="lg">
            <span className="inline-flex items-center gap-2">
              <Play className="size-5" />
              {t("actions.start")}
            </span>
          </Button>
        )}
        {isLead && data.state === "IN_PROGRESS" && (
          <Link href={`/mobile/visits/${id}/complete`} className="block">
            <Button fullWidth size="lg">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="size-5" />
                {t("actions.complete")}
              </span>
            </Button>
          </Link>
        )}
        {isLead && (data.state === "SCHEDULED" || data.state === "IN_PROGRESS") && (
          <Button
            variant="outline"
            fullWidth
            size="lg"
            onClick={() => router.push(`/mobile/visits/${id}/complete?action=fail`)}
          >
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="size-5" />
              {t("actions.fail")}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
