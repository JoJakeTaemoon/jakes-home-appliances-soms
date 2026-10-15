"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * 「포털 열기」 on a customer-detail contact card. Opens the contact's
 * customer-portal account and shows the temporary password once — nothing is
 * texted; staff read it out by phone (2026-09-25). Same shape as the
 * 「포털 비밀번호 초기화」 card on 고객 수정.
 *
 * `onOpened` fires when the dialog closes after success, not on success:
 * reloading flips `portalEnabled`, which unmounts this button and would take
 * the password off screen before anyone read it.
 */
export function OpenPortalButton({
  customerId,
  contact,
  onOpened,
}: Readonly<{
  customerId: string;
  contact: { id: string; name: string; phone1: string; email: string | null };
  onOpened: () => void;
}>) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<{ tempPassword: string }>(
        `/api/customers/${customerId}/contacts/${contact.id}/enable-portal`,
      );
      setTempPassword(res.data.tempPassword);
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setErr(null);
    if (tempPassword) {
      setTempPassword(null);
      onOpened();
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t("openPortal")}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={t("openPortal")}
        size="sm"
        footer={
          tempPassword ? (
            <Button onClick={close}>{t("resetPortalPasswordDone")}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>
                {tc("cancel")}
              </Button>
              <Button onClick={submit} isLoading={busy}>
                {t("openPortal")}
              </Button>
            </>
          )
        }
      >
        {tempPassword ? (
          <div>
            <p className="text-sm text-[#525252]">
              {t("openPortalSuccess", { name: contact.name, phone: contact.phone1 })}
            </p>
            <p className="mt-3 select-all rounded-md border border-[#e5e5e5] bg-[#fafafa] px-3 py-2 text-center font-mono text-lg tracking-widest text-[#262626]">
              {tempPassword}
            </p>
            <p className="mt-3 text-sm font-medium text-[#b45309]">
              {t("resetPortalPasswordOnce")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-[#525252]">
              {t("openPortalConfirm", { name: contact.name, phone: contact.phone1 })}
            </p>
            <p className="text-xs text-[#737373]">
              {contact.email
                ? t("openPortalEmailNotice", { email: contact.email })
                : t("openPortalNoEmail")}
            </p>
            {err && <div className="text-sm text-red-600">{err}</div>}
          </div>
        )}
      </Modal>
    </>
  );
}
