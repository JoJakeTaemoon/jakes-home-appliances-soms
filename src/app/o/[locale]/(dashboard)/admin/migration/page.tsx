"use client";

/**
 * Bulk migration — load existing customers, contracts, equipment and
 * consumables from one workbook (ADMIN only — a bad file rewrites the whole
 * customer book, so this one stays off the MANAGER menu).
 *
 * Two steps on purpose. The file is checked and the findings shown first;
 * only then does the confirm button write anything. The same file is posted
 * both times, so there is no half-finished import parked on the server, and
 * the confirm step re-validates against the catalog as it stands at that
 * moment.
 */

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

interface RowIssue {
  sheet: string;
  row: number;
  column: string | null;
  message: string;
}

interface Counts {
  customers: number;
  contracts: number;
  equipment: number;
  consumables: number;
}

interface ImportResult {
  mode: "validate" | "commit";
  committed: boolean;
  counts: Counts;
  skipped: { customers: number; contracts: number; equipment: number };
  applied?: {
    customersCreated: number;
    contractsCreated: number;
    equipmentCreated: number;
    consumablesCreated: number;
    visitsCreated: number;
  };
  errors: RowIssue[];
  errorCount: number;
}

export default function MigrationPage() {
  const t = useTranslations("admin.migration");
  const { accessToken, user } = useAuth();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (mode: "validate" | "commit") => {
      if (!file || !accessToken) return;
      setBusy(true);
      try {
        // A multipart body cannot go through `useApi`, which JSON-encodes.
        const body = new FormData();
        body.append("file", file);
        body.append("mode", mode);
        const res = await fetch("/api/admin/migration/import", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body,
        });
        const json = (await res.json().catch(() => null)) as
          | { success: true; data: ImportResult }
          | { success: false; error?: { message?: string } }
          | null;
        if (!res.ok || !json || json.success === false) {
          const message =
            (json && json.success === false && json.error?.message) ||
            `Upload failed (${res.status})`;
          toast.push(message, { tone: "error" });
          return;
        }
        setResult(json.data);
        if (json.data.committed) {
          toast.push(t("committed"), { tone: "success" });
        } else if (json.data.errorCount > 0) {
          toast.push(t("hasErrors", { count: json.data.errorCount }), {
            tone: "warning",
          });
        } else {
          toast.push(t("checkPassed"), { tone: "success" });
        }
      } catch (err) {
        toast.push(err instanceof Error ? err.message : String(err), {
          tone: "error",
        });
      } finally {
        setBusy(false);
      }
    },
    [accessToken, file, t, toast],
  );

  /**
   * Both files authenticate on the bearer token, which a plain anchor cannot
   * carry — fetch, then hand the browser a blob.
   */
  const download = useCallback(
    async (path: string, fallbackName: string) => {
      if (!accessToken) return;
      setBusy(true);
      try {
        const res = await fetch(path, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          toast.push(`Download failed (${res.status})`, { tone: "error" });
          return;
        }
        const name =
          /filename="?([^"]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
          fallbackName;
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } finally {
        setBusy(false);
      }
    },
    [accessToken, toast],
  );

  const pick = (f: File | null) => {
    setFile(f);
    setResult(null);
  };

  const clean = result !== null && result.errorCount === 0 && !result.committed;
  const total =
    (result?.counts.customers ?? 0) +
    (result?.counts.contracts ?? 0) +
    (result?.counts.equipment ?? 0);

  if (user && user.role !== "ADMIN") {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <p className="text-sm text-[#737373]">{t("adminOnly")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[#737373]">{t("subtitle")}</p>
      </header>

      {/* The single most common reason an upload fails: the workbook names a
          model or SKU the catalog does not have yet. Say so before the file
          is even chosen, not only in the error table afterwards. */}
      <section className="mb-4 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-900">{t("catalogFirstTitle")}</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-800">
          {t("catalogFirstBody")}
        </p>
        <Link
          href="/o/admin/products"
          className="mt-2 inline-flex text-xs font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700"
        >
          {t("openCatalog")}
        </Link>
      </section>

      {/* Step 1 — template */}
      <section className="mb-4 rounded-2xl border border-[#e5e5e5] bg-white p-5">
        <h2 className="text-sm font-semibold text-[#111]">{t("step1Title")}</h2>
        <p className="mt-1 mb-3 text-xs leading-relaxed text-[#737373]">
          {t("step1Body")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              void download(
                "/api/admin/migration/template",
                "jakes-home-appliances-migration-template.xls",
              )
            }
            disabled={busy}
          >
            {t("downloadTemplate")}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              void download("/api/admin/migration/export", "jakes-home-appliances-data.xls")
            }
            disabled={busy}
          >
            {t("downloadData")}
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[#737373]">
          {t("downloadDataHint")}
        </p>
      </section>

      {/* Step 2 — upload + check */}
      <section className="mb-4 rounded-2xl border border-[#e5e5e5] bg-white p-5">
        <h2 className="text-sm font-semibold text-[#111]">{t("step2Title")}</h2>
        <p className="mt-1 mb-3 text-xs leading-relaxed text-[#737373]">
          {t("step2Body")}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <Button variant="secondary" onClick={() => inputRef.current?.click()}>
            {t("chooseFile")}
          </Button>
          <span className="text-xs text-[#525252]">
            {file ? file.name : t("noFile")}
          </span>
          <Button
            onClick={() => void send("validate")}
            disabled={!file || busy}
            className="ml-auto"
          >
            {busy ? t("working") : t("check")}
          </Button>
        </div>
      </section>

      {/* Step 3 — result + confirm */}
      {result && (
        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#111]">
              {t("step3Title")}
            </h2>
            <StatusBadge
              tone={
                result.committed ? "success" : result.errorCount > 0 ? "danger" : "info"
              }
            >
              {result.committed
                ? t("statusCommitted")
                : result.errorCount > 0
                  ? t("statusErrors", { count: result.errorCount })
                  : t("statusReady")}
            </StatusBadge>
          </div>

          <table className="mb-4 w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5e5e5] text-left text-xs text-[#737373]">
                <th className="py-2">{t("colEntity")}</th>
                <th className="py-2 text-right">{t("colNew")}</th>
                <th className="py-2 text-right">{t("colSkipped")}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-b border-[#f5f5f5]">
                <td className="py-2">{t("entityCustomers")}</td>
                <td className="py-2 text-right">{result.counts.customers}</td>
                <td className="py-2 text-right text-[#a3a3a3]">
                  {result.skipped.customers}
                </td>
              </tr>
              <tr className="border-b border-[#f5f5f5]">
                <td className="py-2">{t("entityContracts")}</td>
                <td className="py-2 text-right">{result.counts.contracts}</td>
                <td className="py-2 text-right text-[#a3a3a3]">
                  {result.skipped.contracts}
                </td>
              </tr>
              <tr className="border-b border-[#f5f5f5]">
                <td className="py-2">{t("entityEquipment")}</td>
                <td className="py-2 text-right">{result.counts.equipment}</td>
                <td className="py-2 text-right text-[#a3a3a3]">
                  {result.skipped.equipment}
                </td>
              </tr>
              <tr>
                <td className="py-2">{t("entityConsumables")}</td>
                <td className="py-2 text-right">{result.counts.consumables}</td>
                <td className="py-2 text-right text-[#a3a3a3]">—</td>
              </tr>
            </tbody>
          </table>

          {result.errors.length > 0 && (
            <div className="mb-4 max-h-80 overflow-y-auto rounded-lg border border-red-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-red-50 text-left text-red-800">
                  <tr>
                    <th className="px-3 py-2">{t("colSheet")}</th>
                    <th className="px-3 py-2">{t("colRow")}</th>
                    <th className="px-3 py-2">{t("colColumn")}</th>
                    <th className="px-3 py-2">{t("colProblem")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e) => (
                    <tr
                      key={`${e.sheet}-${e.row}-${e.column}-${e.message}`}
                      className="border-t border-red-100"
                    >
                      <td className="px-3 py-1.5">{e.sheet}</td>
                      <td className="px-3 py-1.5 tabular-nums">{e.row || "—"}</td>
                      <td className="px-3 py-1.5 font-mono">{e.column ?? "—"}</td>
                      <td className="px-3 py-1.5 text-red-700">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.errorCount > result.errors.length && (
                <p className="bg-red-50 px-3 py-2 text-[11px] text-red-800">
                  {t("errorsTruncated", {
                    shown: result.errors.length,
                    total: result.errorCount,
                  })}
                </p>
              )}
            </div>
          )}

          {result.committed && result.applied && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
              {t("appliedSummary", {
                customers: result.applied.customersCreated,
                contracts: result.applied.contractsCreated,
                equipment: result.applied.equipmentCreated,
                consumables: result.applied.consumablesCreated,
              })}
            </p>
          )}

          {clean && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[#737373]">
                {total === 0 ? t("nothingToDo") : t("confirmHint")}
              </p>
              <Button
                onClick={() => void send("commit")}
                disabled={busy || total === 0}
              >
                {busy ? t("working") : t("commit")}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
