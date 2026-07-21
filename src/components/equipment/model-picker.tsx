"use client";

/**
 * Brand / category filters + model Combobox — extracted from the bulk-
 * register wizard's Equipment section (Task 2a.3) so later wizard steps
 * (and any other "pick an equipment model" flow) can reuse the same
 * server-filtered picker instead of re-wiring the three queries inline.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { useApiPageQuery } from "@/lib/api/hooks";
import { pickCategoryName, pickModelName } from "@/lib/products/name";

interface ModelLite {
  id: string;
  modelCode: string | null;
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
  brand: { id: string; name: string } | null;
  productCategory: {
    id: string;
    nameKo: string;
    nameVi: string;
    nameEn: string;
  } | null;
}

interface BrandLite {
  id: string;
  name: string;
}

interface CategoryLite {
  id: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
}

interface Props {
  brandFilter: string | null;
  categoryFilter: string | null;
  modelId: string | null;
  onBrand: (v: string | null) => void;
  onCategory: (v: string | null) => void;
  /**
   * `meta` carries the picked model's brand/category ids so callers can
   * back-fill the brand + category selects (선택한 모델의 브랜드·제품군 자동
   * 입력). Null on clear, or when the model has no brand/category.
   */
  onModel: (
    v: string | null,
    meta?: { brandId: string | null; categoryId: string | null },
  ) => void;
  locale?: "vi" | "ko" | "en";
}

export function ModelPicker({
  brandFilter,
  categoryFilter,
  modelId,
  onBrand,
  onCategory,
  onModel,
  locale = "vi",
}: Readonly<Props>) {
  const t = useTranslations("equipment.bulkRegister");

  const brandsQuery = useApiPageQuery<BrandLite[]>(
    "/api/admin/products/brands?pageSize=200",
  );
  const brands = brandsQuery.data?.data ?? [];

  // Categories narrow to the selected brand (브랜드 선택 시 그 브랜드가 보유한
  // 제품군만) — Brand↔Category link exists only through EquipmentModel, so the
  // API resolves it via `models.some.brandId`.
  const categoriesUrl = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("pageSize", "200");
    if (brandFilter) qs.set("brandId", brandFilter);
    return `/api/admin/products/categories?${qs.toString()}`;
  }, [brandFilter]);
  const categoriesQuery = useApiPageQuery<CategoryLite[]>(categoriesUrl);
  const categories = categoriesQuery.data?.data ?? [];

  // Brand + category filters are pushed to the server so the catalog
  // stays small even if it grows past pageSize.
  const modelsUrl = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("isActive", "true");
    qs.set("pageSize", "200");
    if (brandFilter) qs.set("brandId", brandFilter);
    if (categoryFilter) qs.set("categoryId", categoryFilter);
    return `/api/equipment-models?${qs.toString()}`;
  }, [brandFilter, categoryFilter]);
  const modelsQuery = useApiPageQuery<ModelLite[]>(modelsUrl);
  const models = modelsQuery.data?.data ?? [];

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("fields.brand")}>
          <Combobox
            value={brandFilter}
            onChange={onBrand}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
            placeholder={t("fields.brandPlaceholder")}
            searchable
          />
        </FormField>
        <FormField label={t("fields.category")}>
          <Combobox
            value={categoryFilter}
            onChange={onCategory}
            options={categories.map((c) => ({
              value: c.id,
              label: pickCategoryName(c, locale),
            }))}
            placeholder={t("fields.categoryPlaceholder")}
            searchable
          />
        </FormField>
      </div>
      <FormField label={t("fields.model")}>
        <Combobox
          value={modelId}
          onChange={(v) => {
            // Emit the picked model's brand/category so the caller can
            // auto-fill those selects. On clear (v === null) send nulls.
            const picked = v ? models.find((m) => m.id === v) : null;
            onModel(v, {
              brandId: picked?.brand?.id ?? null,
              categoryId: picked?.productCategory?.id ?? null,
            });
          }}
          options={models.map((m) => {
            const name = pickModelName(m, locale);
            // Add brand + category context so search hits "Seoul Aqua
            // AQ-500" even when the operator only remembers one token.
            const cat = m.productCategory ? pickCategoryName(m.productCategory, locale) : null;
            const suffix = [m.brand?.name, cat].filter(Boolean).join(" · ");
            return {
              value: m.id,
              label: suffix ? `${name} (${suffix})` : name,
            };
          })}
          placeholder={t("fields.modelPlaceholder")}
          searchable
        />
      </FormField>
    </>
  );
}
