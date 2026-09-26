"use client";

/**
 * Inline "not in the list? add it here" popups for the catalog masters a
 * model / consumable form has to reference: 제품군 (ProductCategory), 제품
 * 유형 (ProductType) and 브랜드 (Brand).
 *
 * Both are driven by the Combobox's own `allowCreate` row — the user types a
 * name that matches nothing, picks "+ 추가", and lands in the matching modal
 * with that text prefilled. On success the caller gets the created row so it
 * can push it into its option list and select it without a round trip.
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApi, apiErrorText } from "@/lib/api/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { MultiCombobox } from "@/components/ui/multi-combobox";
import { categoryAltNames, pickCategoryName } from "@/lib/products/name";

export interface CreatedCategory {
  id: string;
  code: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
}

export interface CreatedProductType extends CreatedCategory {
  categoryIds: string[];
}

export interface CreatedBrand {
  id: string;
  name: string;
}

/** Names the failing field too (a bare "Invalid body" says nothing). */
function useErrorText() {
  const t = useTranslations("admin.products");
  return (e: unknown) => apiErrorText(e, t("errorGeneric"));
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
  // Blank by default — the server mints the code from the name on save.
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setName(which: "ko" | "vi" | "en", value: string) {
    if (which === "ko") setNameKo(value);
    if (which === "vi") setNameVi(value);
    if (which === "en") setNameEn(value);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<CreatedCategory>("/api/admin/products/categories", {
        code: code.trim() || undefined,
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
        <FormField label={t("colNameKo")} required>
          <Input autoFocus={locale === "ko"} value={nameKo} onChange={(e) => setName("ko", e.target.value)} />
        </FormField>
        <FormField label={t("colNameVi")} required>
          <Input autoFocus={locale === "vi"} value={nameVi} onChange={(e) => setName("vi", e.target.value)} />
        </FormField>
        <FormField label={t("colNameEn")} required>
          <Input autoFocus={locale === "en"} value={nameEn} onChange={(e) => setName("en", e.target.value)} />
        </FormField>
        <FormField label={t("colCode")}>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("codeAutoPlaceholder")}
          />
        </FormField>
      </div>
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
    </Modal>
  );
}

/**
 * 제품 유형 추가 — from the model form's 제품 유형 dropdown. A type needs at
 * least one 제품군; the model's current 제품군 selection is pre-picked, since
 * the new type is almost always meant to hold the model being entered.
 */
export function ProductTypeQuickCreateModal({
  initialName,
  categories,
  initialCategoryIds,
  onClose,
  onCreated,
}: Readonly<{
  initialName: string;
  categories: CreatedCategory[];
  initialCategoryIds: string[];
  onClose: () => void;
  onCreated: (row: CreatedProductType) => void;
}>) {
  const t = useTranslations("admin.products");
  const locale = useLocale();
  const api = useApi();
  const toErrorText = useErrorText();
  const [nameKo, setNameKo] = useState(initialName);
  const [nameVi, setNameVi] = useState(initialName);
  const [nameEn, setNameEn] = useState(initialName);
  const [categoryIds, setCategoryIds] = useState<string[]>(initialCategoryIds);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<CreatedProductType>("/api/admin/products/product-types", {
        code: code.trim() || undefined,
        nameKo: nameKo || nameVi || nameEn,
        nameVi: nameVi || nameEn || nameKo,
        nameEn: nameEn || nameVi || nameKo,
        categoryIds,
      });
      if (res.data) onCreated({ ...res.data, categoryIds });
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
      title={t("addProductType")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button onClick={save} isLoading={busy} disabled={categoryIds.length === 0}>
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("colNameKo")} required>
          <Input autoFocus={locale === "ko"} value={nameKo} onChange={(e) => setNameKo(e.target.value)} />
        </FormField>
        <FormField label={t("colNameVi")} required>
          <Input autoFocus={locale === "vi"} value={nameVi} onChange={(e) => setNameVi(e.target.value)} />
        </FormField>
        <FormField label={t("colNameEn")} required>
          <Input autoFocus={locale === "en"} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </FormField>
        <FormField label={t("colCategories")} required hint={t("categoriesRequiredHint")}>
          <MultiCombobox
            values={categoryIds}
            onChange={setCategoryIds}
            options={categories.map((c) => ({
              value: c.id,
              label: pickCategoryName(c, locale),
              description: categoryAltNames(c, locale),
            }))}
            placeholder={t("colCategories")}
            searchPlaceholder={t("searchOrAdd")}
            ariaLabel={t("colCategories")}
          />
        </FormField>
        <FormField label={t("colCode")}>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("codeAutoPlaceholder")}
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
      <FormField label={t("colBrand")} required>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
    </Modal>
  );
}
