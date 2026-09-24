"use client";

/**
 * Inline "not in the list? add it here" popups for the two catalog masters a
 * model / consumable form has to reference: 제품군 (ProductCategory) and
 * 브랜드 (Brand).
 *
 * Both are driven by the Combobox's own `allowCreate` row — the user types a
 * name that matches nothing, picks "+ 추가", and lands in the matching modal
 * with that text prefilled. On success the caller gets the created row so it
 * can push it into its option list and select it without a round trip.
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { categoryCodeFromName } from "@/lib/products/category-code";

export interface CreatedCategory {
  id: string;
  code: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
}

export interface CreatedBrand {
  id: string;
  name: string;
}

function useErrorText() {
  const t = useTranslations("admin.products");
  return (e: unknown) =>
    e instanceof ApiClientError || e instanceof Error ? e.message : t("errorGeneric");
}

/**
 * 제품군 추가. The typed text seeds the current locale's name field (and the
 * others, so a one-language shop can save straight away); `code` is derived
 * from whichever name is available but stays editable.
 */
export function CategoryQuickCreateModal({
  initialName,
  onClose,
  onCreated,
}: Readonly<{
  initialName: string;
  onClose: () => void;
  onCreated: (row: CreatedCategory) => void;
}>) {
  const t = useTranslations("admin.products");
  const locale = useLocale();
  const api = useApi();
  const toErrorText = useErrorText();
  const [nameKo, setNameKo] = useState(initialName);
  const [nameVi, setNameVi] = useState(initialName);
  const [nameEn, setNameEn] = useState(initialName);
  const [code, setCode] = useState(() => categoryCodeFromName(initialName));
  // Once the user edits the code by hand we stop tracking the name.
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Code follows the Latin-script names (EN → VI); Korean can't produce an
  // A-Z code, so a ko-only entry keeps whatever the initial derivation gave.
  function setName(which: "ko" | "vi" | "en", value: string) {
    const next = { ko: nameKo, vi: nameVi, en: nameEn, [which]: value };
    if (which === "ko") setNameKo(value);
    if (which === "vi") setNameVi(value);
    if (which === "en") setNameEn(value);
    const codeSource = next.en || next.vi;
    if (!codeTouched && codeSource) setCode(categoryCodeFromName(codeSource));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<CreatedCategory>("/api/admin/products/categories", {
        code,
        nameKo: nameKo || nameVi || nameEn,
        nameVi: nameVi || nameEn || nameKo,
        nameEn: nameEn || nameVi || nameKo,
      });
      if (res.data) onCreated(res.data);
    } catch (e) {
      setErr(toErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("addCategory")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={save} isLoading={busy}>{t("save")}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("colNameKo")}>
          <Input autoFocus={locale === "ko"} value={nameKo} onChange={(e) => setName("ko", e.target.value)} />
        </FormField>
        <FormField label={t("colNameVi")}>
          <Input autoFocus={locale === "vi"} value={nameVi} onChange={(e) => setName("vi", e.target.value)} />
        </FormField>
        <FormField label={t("colNameEn")}>
          <Input autoFocus={locale === "en"} value={nameEn} onChange={(e) => setName("en", e.target.value)} />
        </FormField>
        <FormField label={t("colCode")}>
          <Input
            value={code}
            onChange={(e) => {
              setCodeTouched(true);
              setCode(e.target.value.toUpperCase());
            }}
            placeholder="DEHUMIDIFIER"
          />
        </FormField>
      </div>
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
    </Modal>
  );
}

/** 브랜드 추가 — single name field, so the popup is one input + save. */
export function BrandQuickCreateModal({
  initialName,
  onClose,
  onCreated,
}: Readonly<{
  initialName: string;
  onClose: () => void;
  onCreated: (row: CreatedBrand) => void;
}>) {
  const t = useTranslations("admin.products");
  const api = useApi();
  const toErrorText = useErrorText();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<CreatedBrand>("/api/admin/products/brands", { name });
      if (res.data) onCreated(res.data);
    } catch (e) {
      setErr(toErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("addBrand")}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={save} isLoading={busy}>{t("save")}</Button>
        </>
      }
    >
      <FormField label={t("colBrand")}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
    </Modal>
  );
}
