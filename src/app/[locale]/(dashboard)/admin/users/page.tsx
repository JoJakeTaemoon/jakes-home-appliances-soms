"use client";

/**
 * User management list — ADMIN + MANAGER only.
 *
 * Lists all staff users with their role + phone. Phone is editable inline;
 * saving fires PATCH /api/users/[id]/phone, which revokes the affected
 * user's active sessions so they re-authenticate with the new key.
 *
 * Out of scope (later phase): create user, disable, change role.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { useApi } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

type Role = "ADMIN" | "MANAGER" | "STAFF" | "TECHNICIAN";

interface UserRow {
  id: string;
  username: string;
  phone: string;
  role: Role;
  preferredRegion: string | null;
}

interface ListResp {
  data: UserRow[];
}

export default function AdminUsersPage() {
  const t = useTranslations("admin.users");
  const tRoles = useTranslations("roles");
  const { user } = useAuth();
  const api = useApi();

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPhone, setDraftPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState<string | null>(null);

  const allowed = user?.role === "ADMIN" || user?.role === "MANAGER";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UserRow[]>(`/api/users`);
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (allowed) load().catch(() => undefined);
  }, [allowed, load]);

  const startEdit = (row: UserRow) => {
    setEditingId(row.id);
    setDraftPhone(row.phone);
    setError(null);
    setFlashOk(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftPhone("");
  };

  const savePhone = async (row: UserRow) => {
    if (!draftPhone.trim() || draftPhone.trim() === row.phone) {
      cancelEdit();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<UserRow>(
        `/api/users/${row.id}/phone`,
        { phone: draftPhone.trim() },
      );
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, phone: res.data.phone } : r)),
      );
      setFlashOk(t("updateSuccess", { name: row.username }));
      setEditingId(null);
      setDraftPhone("");
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "CONFLICT") {
        setError(t("errorConflict"));
      } else {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-[#737373]">{t("notAllowed")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[#525252]">{t("subtitle")}</p>
      </header>

      {flashOk && (
        <div
          role="status"
          className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {flashOk}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]"
        >
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#fafafa] text-left text-xs font-medium uppercase tracking-wider text-[#737373]">
            <tr>
              <th className="px-4 py-3">{t("colName")}</th>
              <th className="px-4 py-3">{t("colRole")}</th>
              <th className="px-4 py-3">{t("colPhone")}</th>
              <th className="px-4 py-3 text-right">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[#a3a3a3]">
                  {t("loading")}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className="hover:bg-[#fafafa]">
                    <td className="px-4 py-3 font-medium text-[#262626]">
                      {row.username}
                    </td>
                    <td className="px-4 py-3 text-[#525252]">
                      {tRoles(row.role)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#262626]">
                      {isEditing ? (
                        <input
                          type="tel"
                          inputMode="tel"
                          value={draftPhone}
                          onChange={(e) => setDraftPhone(e.target.value)}
                          className="block w-40 rounded-md border border-[var(--brand-blue-300)] bg-white px-2 h-9 text-sm outline-none focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]"
                          autoFocus
                        />
                      ) : (
                        row.phone
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="inline-flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            {t("cancel")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => savePhone(row)}
                            disabled={saving}
                          >
                            {saving ? t("saving") : t("save")}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(row)}
                        >
                          {t("editPhone")}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
