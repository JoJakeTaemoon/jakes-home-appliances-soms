"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import {
  canAmendContract,
  canRenewContract,
  canRegenerateContractPdf,
  canEmailContract,
  canTransitionContract,
} from "@/lib/contracts/access";
import type { ContractState } from "@/lib/contracts/state";

interface Props {
  id: string;
  state: string;
  type: string;
  contractNumber: string;
  hasContractPartyEmail: boolean;
  role: string;
  onChanged: () => void | Promise<void>;
}

export function ContractActions({ id, state, contractNumber, hasContractPartyEmail, role, onChanged }: Props) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const router = useRouter();
  const api = useApi();

  const [busy, setBusy] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [reason, setReason] = useState("");

  async function transition(to: ContractState, withReason?: string) {
    setBusy(true);
    try {
      await api.post(`/api/contracts/${id}/state`, { to, reason: withReason });
      await onChanged();
    } catch (err) {
      if (err instanceof ApiClientError) alert(err.message);
    } finally {
      setBusy(false);
      setShowTerminate(false);
      setShowCancel(false);
      setShowActivate(false);
      setShowSend(false);
      setShowComplete(false);
      setReason("");
    }
  }

  async function regeneratePdf() {
    setBusy(true);
    try {
      await api.post(`/api/contracts/${id}/regenerate-pdf`);
      await onChanged();
      alert(t("pdfRegenerated"));
    } catch (err) {
      if (err instanceof ApiClientError) alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function emailContract() {
    setBusy(true);
    try {
      await api.post(`/api/contracts/${id}/email`, {});
      alert(t("emailQueued"));
    } catch (err) {
      if (err instanceof ApiClientError) alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  const isDraft = state === "DRAFT";
  const isPending = state === "PENDING_SIGNATURE";
  const isActive = state === "ACTIVE";

  const canSend = isDraft && canTransitionContract(role, "DRAFT", "PENDING_SIGNATURE");
  const canActivate = isPending && canTransitionContract(role, "PENDING_SIGNATURE", "ACTIVE");
  const canCancel =
    (isDraft && canTransitionContract(role, "DRAFT", "CANCELLED")) ||
    (isPending && canTransitionContract(role, "PENDING_SIGNATURE", "CANCELLED"));
  const canTerminate = isActive && canTransitionContract(role, "ACTIVE", "TERMINATED");
  const canComplete = isActive && canTransitionContract(role, "ACTIVE", "COMPLETED");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canSend && (
          <Button variant="primary" size="sm" onClick={() => setShowSend(true)}>
            {t("actions.sendForSignature")}
          </Button>
        )}
        {canActivate && (
          <Button variant="primary" size="sm" onClick={() => setShowActivate(true)}>
            {t("actions.activate")}
          </Button>
        )}
        {canCancel && (
          <Button variant="ghost" size="sm" onClick={() => setShowCancel(true)}>
            {t("actions.cancel")}
          </Button>
        )}
        {isActive && canAmendContract(role) && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/contracts/${id}/amend`)}
          >
            {t("actions.amend")}
          </Button>
        )}
        {isActive && canRenewContract(role) && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/contracts/${id}/renew`)}
          >
            {t("actions.renew")}
          </Button>
        )}
        {canComplete && (
          <Button variant="secondary" size="sm" onClick={() => setShowComplete(true)}>
            {t("actions.complete")}
          </Button>
        )}
        {canTerminate && (
          <Button variant="danger" size="sm" onClick={() => setShowTerminate(true)}>
            {t("actions.terminate")}
          </Button>
        )}
        {canRegenerateContractPdf(role) && (
          <Button variant="outline" size="sm" onClick={regeneratePdf} isLoading={busy}>
            {t("actions.regeneratePdf")}
          </Button>
        )}
        <Link href={`/api/contracts/${id}/pdf` as never} target="_blank">
          <Button variant="ghost" size="sm">{t("actions.downloadPdf")}</Button>
        </Link>
        {canEmailContract(role) && hasContractPartyEmail && (
          <Button variant="ghost" size="sm" onClick={emailContract} isLoading={busy}>
            {t("actions.emailPdf")}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={showSend}
        title={t("actions.sendForSignature")}
        message={`${contractNumber}`}
        busy={busy}
        onCancel={() => setShowSend(false)}
        onConfirm={() => transition("PENDING_SIGNATURE")}
      />
      <ConfirmDialog
        open={showActivate}
        title={t("actions.activate")}
        message={`${contractNumber}`}
        busy={busy}
        onCancel={() => setShowActivate(false)}
        onConfirm={() => transition("ACTIVE")}
      />
      <ConfirmDialog
        open={showCancel}
        title={t("actions.cancel")}
        message={`${contractNumber}`}
        variant="danger"
        busy={busy}
        onCancel={() => setShowCancel(false)}
        onConfirm={() => transition("CANCELLED")}
      />
      <ConfirmDialog
        open={showComplete}
        title={t("actions.complete")}
        message={`${contractNumber}`}
        busy={busy}
        onCancel={() => setShowComplete(false)}
        onConfirm={() => transition("COMPLETED")}
      />
      <Modal
        open={showTerminate}
        onClose={() => setShowTerminate(false)}
        title={t("actions.terminate")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowTerminate(false)} disabled={busy}>
              {tc("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => transition("TERMINATED", reason.trim() || undefined)}
              isLoading={busy}
              disabled={!reason.trim()}
            >
              {t("actions.terminate")}
            </Button>
          </>
        }
      >
        <FormField label={t("amendmentReason")} required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </FormField>
      </Modal>
    </>
  );
}
