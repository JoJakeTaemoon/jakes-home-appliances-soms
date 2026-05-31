"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, Tab, TabPanel } from "@/components/ui/tabs";
import {
  StatusBadge,
  customerStatusTone,
  customerTypeTone,
  equipmentStatusTone,
  equipmentOwnershipTone,
} from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import {
  canDeactivateCustomer,
  canReactivateCustomer,
  canEditContractParty,
  canManageContact,
  canManageSite,
  canDeactivateSite,
  canManageEquipment,
} from "@/lib/customers/access";
import { formatDate } from "@/lib/format";
import { useLocale } from "next-intl";

interface CustomerDetail {
  id: string;
  code: string;
  type: "B2C" | "B2B";
  status: "ACTIVE" | "INACTIVE" | "PROSPECT";
  name: string;
  shortcode: string | null;
  taxCode: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  preferredRegion: string | null;
  notes: string | null;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  contacts: CustomerContact[];
  sites: SiteRow[];
  equipment: EquipmentRow[];
  contracts: ContractRow[];
  recentAudit: AuditRow[];
}

interface CustomerContact {
  id: string;
  role: "CONTRACT_PARTY" | "OPS_CONTACT";
  scope: "CUSTOMER" | "SITE";
  siteId: string | null;
  isPrimary: boolean;
  isAccountingContact: boolean;
  name: string;
  title: string | null;
  phone1: string;
  phone2: string | null;
  email: string | null;
  language: "vi" | "ko" | "en";
  portalEnabled: boolean;
  smsOptOut: boolean;
  emailOptOut: boolean;
}

interface SiteRow {
  id: string;
  name: string;
  address: string;
  district: string | null;
  city: string | null;
  region: string | null;
  isActive: boolean;
  _count?: { equipment: number; contacts: number };
}

interface EquipmentRow {
  id: string;
  modelId: string;
  model: { modelCode: string; name: string };
  siteId: string | null;
  site: { id: string; name: string } | null;
  serialNumber: string | null;
  status: string;
  ownership: string;
  installedAt: string | null;
}

interface ContractRow {
  id: string;
  contractNumber: string;
  state: string;
  type: string;
  startDate: string | null;
}

interface AuditRow {
  id: string;
  action: string;
  at: string;
  actorUser: { username: string; role: string } | null;
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const tSite = useTranslations("sites");
  const tEq = useTranslations("equipment");
  const router = useRouter();
  const locale = useLocale();
  const api = useApi();
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";

  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [showAddSite, setShowAddSite] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [siteFilter, setSiteFilter] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CustomerDetail>(`/api/customers/${id}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    if (!id) return;
    void reload();
  }, [id, reload]);

  async function doDeactivate() {
    if (!deactivateReason.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/customers/${id}/deactivate`, { reason: deactivateReason.trim() });
      setShowDeactivate(false);
      setDeactivateReason("");
      await reload();
    } catch (err) {
      if (err instanceof ApiClientError) alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function doReactivate() {
    setBusy(true);
    try {
      await api.post(`/api/customers/${id}/reactivate`);
      setShowReactivate(false);
      await reload();
    } catch (err) {
      if (err instanceof ApiClientError) alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return <div className="text-sm text-[#737373]">{tc("loading")}</div>;
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error ?? "Not found"}
      </div>
    );
  }

  const isInactive = data.status === "INACTIVE";
  const filteredEquipment = siteFilter
    ? data.equipment.filter((e) => e.siteId === siteFilter)
    : data.equipment;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#737373]">{data.code}</span>
            <StatusBadge tone={customerTypeTone(data.type)}>{data.type}</StatusBadge>
            <StatusBadge tone={customerStatusTone(data.status)}>{data.status}</StatusBadge>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#002A4D]">{data.name}</h1>
          {data.shortcode && (
            <p className="text-xs text-[#737373]">SC: {data.shortcode}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/customers/${id}/edit`}>
            <Button variant="secondary">{tc("edit")}</Button>
          </Link>
          {!isInactive && canDeactivateCustomer(role) && (
            <Button variant="danger" onClick={() => setShowDeactivate(true)}>
              {t("deactivate")}
            </Button>
          )}
          {isInactive && canReactivateCustomer(role) && (
            <Button variant="outline" onClick={() => setShowReactivate(true)}>
              {t("reactivate")}
            </Button>
          )}
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <Tab value="overview">{t("tabs.overview")}</Tab>
          <Tab value="contacts">{t("tabs.contacts")}</Tab>
          {data.type === "B2B" && <Tab value="sites">{t("tabs.sites")}</Tab>}
          <Tab value="equipment">{t("tabs.equipment")}</Tab>
          <Tab value="contracts">{t("tabs.contracts")}</Tab>
          <Tab value="service-requests">{t("tabs.serviceRequests")}</Tab>
          <Tab value="activity">{t("tabs.activity")}</Tab>
        </TabsList>

        <TabPanel value="overview">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card label={tc("address")}>
              <Field label={tc("address")} value={data.address} />
              <Field label={tc("district")} value={data.district} />
              <Field label={tc("city")} value={data.city} />
              <Field label={t("preferredRegion")} value={data.preferredRegion} />
            </Card>
            {data.type === "B2B" && (
              <Card label="B2B">
                <Field label={t("shortcode")} value={data.shortcode} />
                <Field label={t("taxCode")} value={data.taxCode} />
              </Card>
            )}
            <Card label={t("notes")}>
              <p className="whitespace-pre-wrap text-sm text-[#525252]">
                {data.notes ?? "—"}
              </p>
            </Card>
            {data.deactivatedAt && (
              <Card label={t("deactivateTitle")}>
                <Field label={tc("name")} value={formatDate(data.deactivatedAt, locale)} />
                <p className="text-sm text-[#525252]">{data.deactivationReason}</p>
              </Card>
            )}
          </div>
        </TabPanel>

        <TabPanel value="contacts">
          <ContactsTab
            customer={data}
            role={role}
            reload={reload}
            onAdd={() => setShowAddContact(true)}
          />
        </TabPanel>

        {data.type === "B2B" && (
          <TabPanel value="sites">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-end">
                {canManageSite(role) && (
                  <Button onClick={() => setShowAddSite(true)}>{tSite("addSite")}</Button>
                )}
              </div>
              {data.sites.length === 0 && (
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-center text-sm text-[#737373]">
                  {tSite("noSites")}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.sites.map((s) => (
                  <SiteCard
                    key={s.id}
                    site={s}
                    customerId={data.id}
                    role={role}
                    onChanged={reload}
                  />
                ))}
              </div>
            </div>
          </TabPanel>
        )}

        <TabPanel value="equipment">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              {data.type === "B2B" && data.sites.length > 0 && (
                <div className="w-64">
                  <Combobox
                    value={siteFilter}
                    onChange={setSiteFilter}
                    options={[
                      ...data.sites.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                    placeholder={tEq("site")}
                    searchable={data.sites.length > 5}
                  />
                </div>
              )}
              {canManageEquipment(role) && (
                <Link href={`/equipment/new?customerId=${data.id}`}>
                  <Button>{tEq("installNew")}</Button>
                </Link>
              )}
            </div>
            {filteredEquipment.length === 0 ? (
              <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-center text-sm text-[#737373]">
                {tEq("noEquipment")}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-[#fafafa] text-[#525252]">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs uppercase">{tEq("model")}</th>
                      <th className="px-3 py-2 text-left text-xs uppercase">{tEq("serial")}</th>
                      {data.type === "B2B" && (
                        <th className="px-3 py-2 text-left text-xs uppercase">{tEq("site")}</th>
                      )}
                      <th className="px-3 py-2 text-left text-xs uppercase">{tEq("installDate")}</th>
                      <th className="px-3 py-2 text-left text-xs uppercase">{tEq("status")}</th>
                      <th className="px-3 py-2 text-left text-xs uppercase">{tEq("ownership")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEquipment.map((e) => (
                      <tr
                        key={e.id}
                        onClick={() => router.push(`/equipment/${e.id}`)}
                        className="cursor-pointer border-b border-[#f5f5f5] last:border-b-0 hover:bg-[#fafafa]"
                      >
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span className="font-medium">{e.model.modelCode}</span>
                            <span className="text-xs text-[#737373]">{e.model.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{e.serialNumber ?? "—"}</td>
                        {data.type === "B2B" && (
                          <td className="px-3 py-2">{e.site?.name ?? "—"}</td>
                        )}
                        <td className="px-3 py-2">{formatDate(e.installedAt, locale)}</td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={equipmentStatusTone(e.status)}>{e.status}</StatusBadge>
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={equipmentOwnershipTone(e.ownership)}>
                            {e.ownership}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabPanel>

        <TabPanel value="contracts">
          <CustomerContractsTab customerId={data.id} />
        </TabPanel>

        <TabPanel value="service-requests">
          <CustomerServiceRequestsTab customerId={data.id} />
        </TabPanel>

        <TabPanel value="activity">
          <ul className="flex flex-col divide-y divide-[#f5f5f5] overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
            {data.recentAudit.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-[#a3a3a3]">
                {tc("noData")}
              </li>
            )}
            {data.recentAudit.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium">{a.action}</span>
                <span className="text-xs text-[#737373]">
                  {a.actorUser?.username ?? "system"} • {formatDate(a.at, locale)}
                </span>
              </li>
            ))}
          </ul>
        </TabPanel>
      </Tabs>

      {/* Deactivate */}
      <Modal
        open={showDeactivate}
        onClose={() => setShowDeactivate(false)}
        title={t("deactivateTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowDeactivate(false)} disabled={busy}>
              {tc("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={doDeactivate}
              disabled={!deactivateReason.trim()}
              isLoading={busy}
            >
              {t("deactivate")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[#525252]">
          {t("deactivateConfirm", { code: data.code, name: data.name })}
        </p>
        <div className="mt-4">
          <FormField label={t("deactivateReason")} required htmlFor="deact-reason">
            <Textarea
              id="deact-reason"
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              rows={3}
            />
          </FormField>
        </div>
      </Modal>

      {/* Reactivate */}
      <ConfirmDialog
        open={showReactivate}
        title={t("reactivate")}
        message={t("reactivateConfirm", { code: data.code, name: data.name })}
        confirmLabel={t("reactivate")}
        cancelLabel={tc("cancel")}
        busy={busy}
        onCancel={() => setShowReactivate(false)}
        onConfirm={doReactivate}
      />

      {showAddSite && data.type === "B2B" && (
        <AddSiteModal
          customerId={data.id}
          onClose={() => setShowAddSite(false)}
          onCreated={() => {
            setShowAddSite(false);
            void reload();
          }}
        />
      )}

      {showAddContact && (
        <AddContactModal
          customer={data}
          onClose={() => setShowAddContact(false)}
          onCreated={() => {
            setShowAddContact(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

// --- subcomponents ---

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">{label}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs text-[#737373]">{label}</span>
      <span className="text-[#111111]">{value ?? "—"}</span>
    </div>
  );
}

function ContactsTab({
  customer,
  role,
  reload,
  onAdd,
}: {
  customer: CustomerDetail;
  role: string;
  reload: () => Promise<void>;
  onAdd: () => void;
}) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const cp = customer.contacts.find((c) => c.role === "CONTRACT_PARTY");
  const ops = customer.contacts.filter((c) => c.role === "OPS_CONTACT");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        {canManageContact(role) && <Button onClick={onAdd}>{t("addContact")}</Button>}
      </div>

      {cp && (
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <StatusBadge tone="info">{t("contractParty")}</StatusBadge>
              <h3 className="mt-2 text-base font-semibold">{cp.name}</h3>
              <p className="text-xs text-[#737373]">{cp.title}</p>
            </div>
            <ContactActions contact={cp} customer={customer} role={role} reload={reload} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label={tc("phone")} value={cp.phone1} />
            <Field label={tc("email")} value={cp.email} />
            <Field label={tc("language")} value={cp.language.toUpperCase()} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-[#525252]">{t("opsContacts")}</h3>
        {ops.length === 0 && (
          <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4 text-sm text-[#737373]">
            —
          </div>
        )}
        {ops.map((c) => (
          <div key={c.id} className="rounded-xl border border-[#e5e5e5] bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {c.isPrimary && <StatusBadge tone="success">{t("primaryBadge")}</StatusBadge>}
                  {c.isAccountingContact && <StatusBadge tone="warning">{t("accountingBadge")}</StatusBadge>}
                  {c.scope === "SITE" && <StatusBadge tone="info">SITE</StatusBadge>}
                </div>
                <h4 className="mt-1 text-base font-semibold">{c.name}</h4>
                <p className="text-xs text-[#737373]">{c.title}</p>
              </div>
              <ContactActions contact={c} customer={customer} role={role} reload={reload} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label={tc("phone")} value={c.phone1} />
              <Field label={tc("email")} value={c.email} />
              <Field label={tc("language")} value={c.language.toUpperCase()} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactActions({
  contact,
  customer,
  role,
  reload,
}: {
  contact: CustomerContact;
  customer: CustomerDetail;
  role: string;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = contact.role === "CONTRACT_PARTY" ? canEditContractParty(role) : canManageContact(role);

  async function doDelete() {
    setBusy(true);
    try {
      await api.del(`/api/customers/${customer.id}/contacts/${contact.id}`);
      setConfirming(false);
      await reload();
    } catch (err) {
      if (err instanceof ApiClientError) alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) return null;
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
        {tc("edit")}
      </Button>
      {contact.role !== "CONTRACT_PARTY" && (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          {t("deleteContact")}
        </Button>
      )}
      {editing && (
        <EditContactModal
          contact={contact}
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void reload();
          }}
        />
      )}
      <ConfirmDialog
        open={confirming}
        title={t("deleteContact")}
        message={t("deleteContactConfirm", { name: contact.name })}
        confirmLabel={t("deleteContact")}
        cancelLabel={tc("cancel")}
        variant="danger"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={doDelete}
      />
    </div>
  );
}

function EditContactModal({
  contact,
  customer,
  onClose,
  onSaved,
}: {
  contact: CustomerContact;
  customer: CustomerDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(contact.name);
  const [title, setTitle] = useState(contact.title ?? "");
  const [phone1, setPhone1] = useState(contact.phone1);
  const [email, setEmail] = useState(contact.email ?? "");
  const [language, setLanguage] = useState(contact.language);
  const [isPrimary, setIsPrimary] = useState(contact.isPrimary);
  const [isAccountingContact, setIsAccountingContact] = useState(contact.isAccountingContact);
  const accountingAllowed =
    contact.role === "OPS_CONTACT" && contact.scope === "CUSTOMER";
  const emailRequired = isPrimary || isAccountingContact;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/api/customers/${customer.id}/contacts/${contact.id}`, {
        name,
        title: title || undefined,
        phone1,
        email: email || undefined,
        language,
        isPrimary,
        isAccountingContact: accountingAllowed ? isAccountingContact : undefined,
      });
      onSaved();
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("editContact")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{tc("cancel")}</Button>
          <Button onClick={submit} isLoading={busy}>{tc("save")}</Button>
        </>
      }
    >
      {contact.role === "CONTRACT_PARTY" && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          {t("contactWarning")}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={tc("name")} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={tc("title")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label={tc("phone")} required>
          <Input value={phone1} onChange={(e) => setPhone1(e.target.value)} />
        </FormField>
        <FormField label={tc("email")} required={emailRequired}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </FormField>
        <FormField label={tc("language")}>
          <Combobox
            value={language}
            onChange={(v) => v && setLanguage(v as "vi" | "ko" | "en")}
            options={[
              { value: "vi", label: "Tiếng Việt" },
              { value: "ko", label: "한국어" },
              { value: "en", label: "English" },
            ]}
            searchable={false}
            allowClear={false}
          />
        </FormField>
        {contact.role === "OPS_CONTACT" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            {t("primaryToggle")}
          </label>
        )}
        {accountingAllowed && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAccountingContact}
              onChange={(e) => setIsAccountingContact(e.target.checked)}
            />
            {t("accountingToggle")}
          </label>
        )}
      </div>
      {err && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}
    </Modal>
  );
}

function AddContactModal({
  customer,
  onClose,
  onCreated,
}: {
  customer: CustomerDetail;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [role, setRoleState] = useState<"OPS_CONTACT" | "CONTRACT_PARTY">("OPS_CONTACT");
  const [scope, setScope] = useState<"CUSTOMER" | "SITE">("CUSTOMER");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone1, setPhone1] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<"vi" | "ko" | "en">("vi");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isAccountingContact, setIsAccountingContact] = useState(false);

  const hasCp = customer.contacts.some((c) => c.role === "CONTRACT_PARTY");
  const allowCpRole = !hasCp; // refuse adding a 2nd one
  const accountingAllowed = role === "OPS_CONTACT" && scope === "CUSTOMER";
  const emailRequired = (role === "OPS_CONTACT" && isPrimary) || isAccountingContact;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/customers/${customer.id}/contacts`, {
        role,
        scope: role === "CONTRACT_PARTY" ? "CUSTOMER" : scope,
        siteId: scope === "SITE" ? siteId : undefined,
        name,
        title: title || undefined,
        phone1,
        email: email || undefined,
        language,
        isPrimary: role === "OPS_CONTACT" ? isPrimary : false,
        isAccountingContact: accountingAllowed ? isAccountingContact : false,
      });
      onCreated();
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("addContact")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{tc("cancel")}</Button>
          <Button onClick={submit} isLoading={busy} disabled={!name || !phone1}>{tc("save")}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Role" required>
          <Combobox
            value={role}
            onChange={(v) => v && setRoleState(v as "OPS_CONTACT" | "CONTRACT_PARTY")}
            options={[
              { value: "OPS_CONTACT", label: t("opsContact") },
              ...(allowCpRole
                ? [{ value: "CONTRACT_PARTY", label: t("contractParty") }]
                : []),
            ]}
            searchable={false}
            allowClear={false}
          />
        </FormField>
        {role === "OPS_CONTACT" && customer.type === "B2B" && customer.sites.length > 0 && (
          <FormField label="Scope">
            <Combobox
              value={scope}
              onChange={(v) => v && setScope(v as "CUSTOMER" | "SITE")}
              options={[
                { value: "CUSTOMER", label: "Organization-wide" },
                { value: "SITE", label: "Site-specific" },
              ]}
              searchable={false}
              allowClear={false}
            />
          </FormField>
        )}
        {role === "OPS_CONTACT" && scope === "SITE" && (
          <FormField label="Site" required className="sm:col-span-2">
            <Combobox
              value={siteId}
              onChange={setSiteId}
              options={customer.sites.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Pick site"
            />
          </FormField>
        )}
        <FormField label={tc("name")} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={tc("title")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label={tc("phone")} required>
          <Input value={phone1} onChange={(e) => setPhone1(e.target.value)} />
        </FormField>
        <FormField label={tc("email")} required={emailRequired}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </FormField>
        <FormField label={tc("language")}>
          <Combobox
            value={language}
            onChange={(v) => v && setLanguage(v as "vi" | "ko" | "en")}
            options={[
              { value: "vi", label: "Tiếng Việt" },
              { value: "ko", label: "한국어" },
              { value: "en", label: "English" },
            ]}
            searchable={false}
            allowClear={false}
          />
        </FormField>
        {role === "OPS_CONTACT" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            {t("primaryToggle")}
          </label>
        )}
        {accountingAllowed && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAccountingContact}
              onChange={(e) => setIsAccountingContact(e.target.checked)}
            />
            {t("accountingToggle")}
          </label>
        )}
      </div>
      {err && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}
    </Modal>
  );
}

function SiteCard({
  site,
  customerId,
  role,
  onChanged,
}: {
  site: SiteRow;
  customerId: string;
  role: string;
  onChanged: () => Promise<void>;
}) {
  const tSite = useTranslations("sites");
  const tc = useTranslations("common");
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function doDeactivate() {
    setBusy(true);
    try {
      await api.post(`/api/customers/${customerId}/sites/${site.id}/deactivate`, {
        reason: reason.trim() || "Deactivated by office staff",
      });
      setConfirming(false);
      await onChanged();
    } catch (err) {
      if (err instanceof ApiClientError) alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-base font-semibold">{site.name}</h4>
          <p className="text-xs text-[#737373]">{site.region ?? "—"}</p>
        </div>
        {!site.isActive && <StatusBadge tone="muted">INACTIVE</StatusBadge>}
      </div>
      <Field label={tc("address")} value={site.address} />
      <Field label={tc("district")} value={site.district} />
      <Field label={tc("city")} value={site.city} />
      <p className="text-xs text-[#737373]">
        {tSite("equipmentCount", { count: site._count?.equipment ?? 0 })} · {tSite("contactsCount", { count: site._count?.contacts ?? 0 })}
      </p>
      <div className="flex items-center gap-2 pt-1">
        {canManageSite(role) && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {tc("edit")}
          </Button>
        )}
        {site.isActive && canDeactivateSite(role) && (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            {tSite("deactivateSite")}
          </Button>
        )}
      </div>
      {editing && (
        <EditSiteModal
          site={site}
          customerId={customerId}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void onChanged();
          }}
        />
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={tSite("deactivateSite")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>{tc("cancel")}</Button>
            <Button variant="danger" onClick={doDeactivate} isLoading={busy}>{tSite("deactivateSite")}</Button>
          </>
        }
      >
        <p className="text-sm text-[#525252]">{tSite("deactivateConfirm", { name: site.name })}</p>
        <div className="mt-3">
          <FormField label={tSite("deactivateReason")}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}

function AddSiteModal({
  customerId,
  onClose,
  onCreated,
}: {
  customerId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("sites");
  const tc = useTranslations("common");
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/customers/${customerId}/sites`, {
        name,
        address,
        district: district || undefined,
        city: city || undefined,
        region: region || undefined,
      });
      onCreated();
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("addSite")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{tc("cancel")}</Button>
          <Button onClick={submit} isLoading={busy} disabled={!name || !address}>{tc("save")}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("name")} required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t("address")} required className="sm:col-span-2">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </FormField>
        <FormField label={t("district")}>
          <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
        </FormField>
        <FormField label={t("city")}>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </FormField>
        <FormField label={t("region")}>
          <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="HCMC-D1" />
        </FormField>
      </div>
      {err && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}
    </Modal>
  );
}

function EditSiteModal({
  site,
  customerId,
  onClose,
  onSaved,
}: {
  site: SiteRow;
  customerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("sites");
  const tc = useTranslations("common");
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(site.name);
  const [address, setAddress] = useState(site.address);
  const [district, setDistrict] = useState(site.district ?? "");
  const [city, setCity] = useState(site.city ?? "");
  const [region, setRegion] = useState(site.region ?? "");

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/api/customers/${customerId}/sites/${site.id}`, {
        name,
        address,
        district: district || undefined,
        city: city || undefined,
        region: region || undefined,
      });
      onSaved();
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("editSite")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{tc("cancel")}</Button>
          <Button onClick={submit} isLoading={busy}>{tc("save")}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("name")} required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t("address")} required className="sm:col-span-2">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </FormField>
        <FormField label={t("district")}>
          <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
        </FormField>
        <FormField label={t("city")}>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </FormField>
        <FormField label={t("region")}>
          <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="HCMC-D1" />
        </FormField>
      </div>
      {err && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}
    </Modal>
  );
}

function CustomerContractsTab({ customerId }: Readonly<{ customerId: string }>) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const locale = useLocale();
  const api = useApi();
  type Row = {
    id: string;
    contractNumber: string;
    type: "SALE" | "RENTAL" | "MAINTENANCE";
    state: string;
    startDate: string | null;
    endDate: string | null;
    monthlyMaintenanceFee: string | null;
    amendmentRevision: number;
  };
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Row[]>(`/api/contracts?customerId=${customerId}&pageSize=100`)
      .then((res) => {
        if (!cancelled) setRows(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, customerId]);

  if (loading) return <div className="text-sm text-[#737373]">{tc("loading")}</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <Link href={`/contracts/new?customerId=${customerId}` as never}>
          <Button>{t("newContract")}</Button>
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-center text-sm text-[#737373]">
          {t("noContracts")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-xs text-[#525252]">
              <tr>
                <th className="px-3 py-2 text-left">{t("contractNumber")}</th>
                <th className="px-3 py-2 text-left">{t("type")}</th>
                <th className="px-3 py-2 text-left">{t("state")}</th>
                <th className="px-3 py-2 text-left">{t("startDate")}</th>
                <th className="px-3 py-2 text-left">{t("endDate")}</th>
                <th className="px-3 py-2 text-right">{t("monthlyFee")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-[#f5f5f5] hover:bg-[#fafafa]">
                  <td className="px-3 py-2">
                    <Link href={`/contracts/${c.id}` as never} className="font-mono text-xs text-[var(--brand-blue-700)] underline">
                      {c.contractNumber}
                      {c.amendmentRevision > 0 ? ` (A${c.amendmentRevision})` : ""}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{t(`types.${c.type}`)}</td>
                  <td className="px-3 py-2">{t(`states.${c.state}` as never)}</td>
                  <td className="px-3 py-2">{formatDate(c.startDate, locale)}</td>
                  <td className="px-3 py-2">{formatDate(c.endDate, locale)}</td>
                  <td className="px-3 py-2 text-right">
                    {c.monthlyMaintenanceFee ? `${c.monthlyMaintenanceFee}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CustomerServiceRequestsTab({ customerId }: Readonly<{ customerId: string }>) {
  const t = useTranslations("serviceRequests");
  const tc = useTranslations("common");
  const locale = useLocale();
  const api = useApi();
  type Row = {
    id: string;
    code: string;
    type: string;
    state: string;
    isPaid: boolean;
    submittedAt: string;
    equipment: { id: string; model: { modelCode: string; name: string } } | null;
  };
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Row[]>(`/api/service-requests?customerId=${customerId}&pageSize=100`)
      .then((res) => {
        if (!cancelled) setRows(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, customerId]);

  if (loading) return <div className="text-sm text-[#737373]">{tc("loading")}</div>;
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-center text-sm text-[#737373]">
        {t("noRequests")}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
      <table className="w-full text-sm">
        <thead className="bg-[#fafafa] text-xs text-[#525252]">
          <tr>
            <th className="px-3 py-2 text-left">{t("code")}</th>
            <th className="px-3 py-2 text-left">{t("type")}</th>
            <th className="px-3 py-2 text-left">{t("state")}</th>
            <th className="px-3 py-2 text-left">{t("isPaid")}</th>
            <th className="px-3 py-2 text-left">{t("submittedAt")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[#f5f5f5] hover:bg-[#fafafa]">
              <td className="px-3 py-2">
                <Link
                  href={`/service-requests/${r.id}` as never}
                  className="font-mono text-xs text-[var(--brand-blue-700)] underline"
                >
                  {r.code}
                </Link>
              </td>
              <td className="px-3 py-2">{t(`types.${r.type}` as never)}</td>
              <td className="px-3 py-2">{t(`states.${r.state}` as never)}</td>
              <td className="px-3 py-2">{r.isPaid ? t("yes") : t("no")}</td>
              <td className="px-3 py-2">{formatDate(r.submittedAt, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
