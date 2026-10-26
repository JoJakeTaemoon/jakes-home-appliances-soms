"use client";

/**
 * 고객 삭제 — hard delete (MANAGER+). Shows what is attached to the customer
 * in four groups and lets each one move to another customer or go with it
 * (see src/lib/customers/delete.ts for why these four). Nothing happens until
 * the customer's code is typed back.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";

type Group = "operations" | "contacts" | "requests" | "records";
type Action = "MOVE" | "DELETE";
const GROUPS: Group[] = ["operations", "contacts", "requests", "records"];

interface Preview {
  customer: { id: string; code: string; name: string };
  groups: Record<Group, Record<string, number>>;
}
interface CustomerLite {
  id: string;
  code: string;
  name: string;
}

export function CustomerDeleteModal({
  open,
  onClose,
  customerId,
  onDeleted,
}: Readonly<{ open: boolean; onClose: () => void; customerId: string; onDeleted: () => void }>) {
  const t = useTranslations("customers.delete");
  const api = useApi();
  const preview = useApiQuery<Preview>(open ? `/api/customers/${customerId}/delete-preview` : null).data;
  const [actions, setActions] = useState<Record<Group, Action>>({
    operations: "DELETE",
    contacts: "DELETE",
    requests: "DELETE",
    records: "DELETE",
  });
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<CustomerLite | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const results =
    useApiQuery<CustomerLite[]>(
      search.trim() ? `/api/customers?q=${encodeURIComponent(search.trim())}&pageSize=10` : null,
    ).data ?? [];
  const moving = GROUPS.some((g) => actions[g] === "MOVE");
  const ready = !!preview && code.trim() === preview.customer.code && (!moving || !!target);
  const empty = (g: Group) => !preview || Object.values(preview.groups[g]).every((n) => n === 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/customers/${customerId}/delete`, {
        actions,
        targetCustomerId: moving ? target!.id : null,
        confirmCode: code.trim(),
      });
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={preview ? t("title", { name: preview.customer.name, code: preview.customer.code }) : t("button")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button variant="danger" onClick={submit} disabled={!ready} isLoading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">{t("warning")}</p>

        {GROUPS.map((g) => (
          <div
            key={g}
            role="group"
            aria-label={t(`groups.${g}`)}
            className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="font-medium text-[#111]">{t(`groups.${g}`)}</div>
              <div className="text-xs text-[#737373]">
                {empty(g)
                  ? t("none")
                  : Object.entries(preview!.groups[g])
                      .filter(([, n]) => n > 0)
                      .map(([k, n]) => t(`count.${k}`, { count: n }))
                      .join(" · ")}
              </div>
            </div>
            {!empty(g) && (
              <div role="radiogroup" aria-label={t(`groups.${g}`)} className="flex gap-1">
                {(["MOVE", "DELETE"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={actions[g] === a}
                    onClick={() => setActions((s) => ({ ...s, [g]: a }))}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-medium",
                      actions[g] === a
                        ? a === "DELETE"
                          ? "border-red-600 bg-red-600 text-white"
                          : "border-[var(--brand-blue-600)] bg-[var(--brand-blue-600)] text-white"
                        : "border-[#d4d4d4] bg-white text-[#404040] hover:bg-[#f5f5f5]",
                    )}
                  >
                    {t(a === "MOVE" ? "move" : "delete")}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {actions.operations === "MOVE" && actions.contacts === "DELETE" && (
          <p className="text-xs text-amber-800">{t("hintSiteDropped")}</p>
        )}
        {actions.contacts === "MOVE" && <p className="text-xs text-[#525252]">{t("hintContacts")}</p>}

        {moving && (
          <div className="flex flex-col gap-2">
            <span className="font-medium">{t("target")}</span>
            {target ? (
              <div className="flex items-center justify-between rounded-md border border-[var(--brand-blue-300)] bg-[var(--brand-blue-50)] px-3 py-2">
                <span>
                  <span className="font-mono text-xs">{target.code}</span> {target.name}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setTarget(null)}>
                  {t("targetChange")}
                </Button>
              </div>
            ) : (
              <>
                <Input aria-label={t("targetSearch")} placeholder={t("targetSearch")} value={search} onChange={(e) => setSearch(e.target.value)} />
                <ul role="listbox" className="max-h-48 overflow-y-auto rounded-md border border-[#e5e5e5]">
                  {results
                    .filter((c) => c.id !== customerId)
                    .map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => setTarget(c)}
                          className="w-full px-3 py-1.5 text-left hover:bg-[#f5f5f5]"
                        >
                          <span className="font-mono text-xs">{c.code}</span> {c.name}
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="font-medium">{t("confirmLabel", { code: preview?.customer.code ?? "" })}</span>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={preview?.customer.code} />
        </label>

        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
