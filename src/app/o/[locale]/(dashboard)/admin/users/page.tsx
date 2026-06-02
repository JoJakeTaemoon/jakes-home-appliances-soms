"use client";

/**
 * User management — ADMIN + MANAGER only.
 *
 * Lists every staff user (including disabled) and supports add / edit /
 * deactivate. Phone changes still go through PATCH /api/users/[id]/phone
 * (separate endpoint with session-revoke semantics); username, role and
 * preferred region change through PATCH /api/users/[id]. Soft-delete is
 * DELETE /api/users/[id] which sets status=DISABLED + revokes sessions.
 *
 * Every destructive action (deactivate) routes through a ConfirmDialog —
 * single-click delete is intentionally not exposed.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Combobox } from "@/components/ui/combobox";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";

type Role = "ADMIN" | "MANAGER" | "STAFF" | "TECHNICIAN";
type Status = "ACTIVE" | "DISABLED";

interface UserRow {
  id: string;
  username: string;
  phone: string;
  role: Role;
  preferredRegion: string | null;
  status: Status;
}

const ROLES: Role[] = ["ADMIN", "MANAGER", "STAFF", "TECHNICIAN"];

export default function AdminUsersPage() {
  const t = useTranslations("admin.users");
  const tRoles = useTranslations("roles");
  const { user } = useAuth();
  const api = useApi();

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const allowed = user?.role === "ADMIN" || user?.role === "MANAGER";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UserRow[]>(`/api/users?includeDisabled=true`);
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

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await api.del(`/api/users/${deleting.id}`);
      setFlashOk(t("disableSuccess", { name: deleting.username }));
      setDeleting(null);
      await load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 400) setError(t("errorSelfDisable"));
        else if (err.status === 403) setError(t("errorManagerOnAdmin"));
        else setError(err.message);
      } else {
        setError(t("errorGeneric"));
      }
    } finally {
      setDeletingBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-[#737373]">{t("notAllowed")}</p>
      </div>
    );
  }

  const canEditRow = (row: UserRow) => {
    if (row.status === "DISABLED") return false;
    if (user?.role === "MANAGER" && row.role === "ADMIN") return false;
    return true;
  };
  const canDeleteRow = (row: UserRow) => {
    if (row.id === user?.id) return false;
    if (row.status === "DISABLED") return false;
    if (user?.role === "MANAGER" && row.role === "ADMIN") return false;
    return true;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[#525252]">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ {t("addUser")}</Button>
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
              <th className="px-4 py-3">{t("colRegion")}</th>
              <th className="px-4 py-3">{t("colStatus")}</th>
              <th className="px-4 py-3 text-right">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#a3a3a3]">
                  {t("loading")}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#a3a3a3]">
                  {t("noUsers")}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-[#fafafa]">
                  <td className="px-4 py-3 font-medium text-[#262626]">
                    {row.username}
                    {row.id === user?.id && (
                      <span className="ml-1 text-xs text-[#737373]">(me)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#525252]">
                    {tRoles(row.role)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[#262626]">{row.phone}</td>
                  <td className="px-4 py-3 text-[#525252]">
                    {row.preferredRegion ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={row.status === "ACTIVE" ? "success" : "muted"}>
                      {row.status === "ACTIVE"
                        ? t("statusActive")
                        : t("statusDisabled")}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditing(row)}
                        disabled={!canEditRow(row)}
                      >
                        {t("editUser")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleting(row)}
                        disabled={!canDeleteRow(row)}
                      >
                        {t("deactivate")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(name) => {
            setShowCreate(false);
            setFlashOk(t("createSuccess", { name }));
            void load();
          }}
        />
      )}

      {editing && (
        <EditUserModal
          row={editing}
          callerRole={(user?.role as Role) ?? "STAFF"}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setFlashOk(t("updateSuccess", { name }));
            void load();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title={t("deactivateTitle")}
          message={t("deactivateConfirm", { name: deleting.username })}
          confirmLabel={t("deactivate")}
          cancelLabel={t("cancel")}
          variant="danger"
          busy={deletingBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Create user modal
// ─────────────────────────────────────────────────────────────────────────

function CreateUserModal({
  onClose,
  onCreated,
}: Readonly<{ onClose: () => void; onCreated: (name: string) => void }>) {
  const t = useTranslations("admin.users");
  const tRoles = useTranslations("roles");
  const api = useApi();
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [preferredRegion, setPreferredRegion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/users", {
        username,
        phone,
        password,
        role,
        preferredRegion: preferredRegion || undefined,
      });
      onCreated(username);
    } catch (e) {
      if (e instanceof ApiClientError) {
        if (e.status === 409) setErr(t("errorConflict"));
        else setErr(e.message);
      } else {
        setErr(e instanceof Error ? e.message : t("errorGeneric"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("addUserTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            onClick={submit}
            isLoading={busy}
            disabled={!username.trim() || !phone.trim() || password.length < 8}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("fieldUsername")} required>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </FormField>
        <FormField label={t("fieldPhone")} required>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
        <FormField label={t("fieldPassword")} required className="sm:col-span-2">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1 text-xs text-[#737373]">{t("fieldPasswordHint")}</p>
        </FormField>
        <FormField label={t("fieldRole")} required>
          <Combobox
            value={role}
            onChange={(v) => v && setRole(v as Role)}
            options={ROLES.map((r) => ({ value: r, label: tRoles(r) }))}
            searchable={false}
            allowClear={false}
          />
        </FormField>
        <FormField label={t("fieldRegion")}>
          <Input
            value={preferredRegion}
            onChange={(e) => setPreferredRegion(e.target.value)}
            placeholder="HCMC-D1"
          />
        </FormField>
      </div>
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Edit user modal — username / role / region (+ phone via separate endpoint)
// ─────────────────────────────────────────────────────────────────────────

function EditUserModal({
  row,
  callerRole,
  onClose,
  onSaved,
}: Readonly<{
  row: UserRow;
  callerRole: Role;
  onClose: () => void;
  onSaved: (name: string) => void;
}>) {
  const t = useTranslations("admin.users");
  const tRoles = useTranslations("roles");
  const api = useApi();
  const [username, setUsername] = useState(row.username);
  const [phone, setPhone] = useState(row.phone);
  const [role, setRole] = useState<Role>(row.role);
  const [preferredRegion, setPreferredRegion] = useState(
    row.preferredRegion ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // MANAGER cannot promote to ADMIN.
  const roleOptions = ROLES.filter(
    (r) => callerRole === "ADMIN" || r !== "ADMIN",
  );

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      // Username / role / region (single PATCH).
      await api.patch(`/api/users/${row.id}`, {
        username,
        role,
        preferredRegion: preferredRegion.trim() === "" ? null : preferredRegion.trim(),
      });
      // Phone update via dedicated endpoint (revokes sessions).
      if (phone.trim() !== row.phone) {
        await api.patch(`/api/users/${row.id}/phone`, { phone: phone.trim() });
      }
      onSaved(username);
    } catch (e) {
      if (e instanceof ApiClientError) {
        if (e.status === 409) setErr(t("errorConflict"));
        else if (e.status === 403) setErr(t("errorManagerOnAdmin"));
        else setErr(e.message);
      } else {
        setErr(e instanceof Error ? e.message : t("errorGeneric"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("editUser")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} isLoading={busy} disabled={!username.trim() || !phone.trim()}>
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("fieldUsername")} required>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </FormField>
        <FormField label={t("fieldPhone")} required>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
        <FormField label={t("fieldRole")} required>
          <Combobox
            value={role}
            onChange={(v) => v && setRole(v as Role)}
            options={roleOptions.map((r) => ({ value: r, label: tRoles(r) }))}
            searchable={false}
            allowClear={false}
          />
        </FormField>
        <FormField label={t("fieldRegion")}>
          <Input
            value={preferredRegion}
            onChange={(e) => setPreferredRegion(e.target.value)}
            placeholder="HCMC-D1"
          />
        </FormField>
      </div>
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
    </Modal>
  );
}
