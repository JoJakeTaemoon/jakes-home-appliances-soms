/**
 * Product classification rules (2026-09-26).
 *
 *   제품군 (ProductCategory) ─┬─ 제품 유형 (ProductType)   M:N, a type has ≥ 1
 *                             ├─ 모델                      M:N, a model has ≥ 1
 *                             └─ 소모품 / 부속품           M:N, 0..N, search only
 *   모델 ── 제품 유형                                      0..1
 *
 * When a model carries a type, every 제품군 on the model must be one of the
 * type's 제품군. None of this fits in a DB constraint — join tables cannot
 * say "at least one", and the subset rule spans three tables — so every write
 * path runs through here.
 *
 * Tagging a consumable or accessory with a 제품군 never applies it to that
 * 제품군's models. Which parts a model uses is `ConsumableOnModel` /
 * `AccessoryOnModel`, edited on the model form.
 */

import type { Prisma } from "@/generated/prisma/client";
import { ConflictError, ValidationError } from "@/lib/api/error";

type Issue = { path: (string | number)[]; message: string };

/** Select shape for a row's 제품군 — shared so every reader flattens alike. */
export const CATEGORY_LINKS_SELECT = {
  categories: {
    select: {
      category: {
        select: { id: true, code: true, nameKo: true, nameVi: true, nameEn: true },
      },
    },
  },
} as const;

export interface CategoryLite {
  id: string;
  code: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
}

/** `{ categories: [{ category }] }` → `CategoryLite[]`. */
export function flattenCategories(row: {
  categories: { category: CategoryLite }[];
}): CategoryLite[] {
  return row.categories.map((l) => l.category);
}

/**
 * Pure rule check. `typeCategoryIds` is null when the model carries no type.
 * Returns field-level issues in the same shape the API's ValidationError
 * uses, so the form can name the box that is wrong.
 */
export function classificationIssues(input: {
  categoryIds: readonly string[];
  typeCategoryIds: readonly string[] | null;
}): Issue[] {
  const issues: Issue[] = [];
  if (input.categoryIds.length === 0) {
    issues.push({ path: ["categoryIds"], message: "At least one 제품군 is required" });
  }
  if (input.typeCategoryIds) {
    const allowed = new Set(input.typeCategoryIds);
    const outside = input.categoryIds.filter((id) => !allowed.has(id));
    if (outside.length > 0) {
      issues.push({
        path: ["categoryIds"],
        message: "Every 제품군 must belong to the selected 제품 유형",
      });
    }
  }
  return issues;
}

/**
 * Validates a model's classification against the DB and throws a
 * ValidationError on the first problem. `categoryIds` is the model's full,
 * final set (callers merge a partial PATCH with the stored row first).
 */
export async function assertModelClassification(
  tx: Prisma.TransactionClient,
  input: { categoryIds: readonly string[]; productTypeId: string | null },
): Promise<void> {
  const unique = [...new Set(input.categoryIds)];
  if (unique.length > 0) {
    const found = await tx.productCategory.count({ where: { id: { in: unique } } });
    if (found !== unique.length) {
      throw new ValidationError("Unknown 제품군", [
        { path: ["categoryIds"], message: "One or more 제품군 do not exist" },
      ]);
    }
  }

  let typeCategoryIds: string[] | null = null;
  if (input.productTypeId) {
    const type = await tx.productType.findUnique({
      where: { id: input.productTypeId },
      select: { categories: { select: { categoryId: true } } },
    });
    if (!type) {
      throw new ValidationError("Unknown 제품 유형", [
        { path: ["productTypeId"], message: "제품 유형 does not exist" },
      ]);
    }
    typeCategoryIds = type.categories.map((c) => c.categoryId);
  }

  const issues = classificationIssues({ categoryIds: unique, typeCategoryIds });
  if (issues.length > 0) throw new ValidationError("Invalid classification", issues);
}

/**
 * Replaces a model's 제품군 links. Callers validate first.
 */
export async function writeModelCategories(
  tx: Prisma.TransactionClient,
  modelId: string,
  categoryIds: readonly string[],
): Promise<void> {
  await tx.equipmentModelCategory.deleteMany({ where: { modelId } });
  const unique = [...new Set(categoryIds)];
  if (unique.length > 0) {
    await tx.equipmentModelCategory.createMany({
      data: unique.map((categoryId) => ({ modelId, categoryId })),
    });
  }
}

/**
 * A 제품 유형 may not drop a 제품군 that a model of that type still uses —
 * that would leave the model violating the subset rule behind everyone's back.
 * Throws 409 with the number of models in the way.
 */
export async function assertTypeKeepsModelCategories(
  tx: Prisma.TransactionClient,
  productTypeId: string,
  nextCategoryIds: readonly string[],
): Promise<void> {
  const keep = new Set(nextCategoryIds);
  const models = await tx.equipmentModel.findMany({
    where: { productTypeId },
    select: { categories: { select: { categoryId: true } } },
  });
  const blocked = models.filter((m) =>
    m.categories.some((c) => !keep.has(c.categoryId)),
  ).length;
  if (blocked > 0) {
    throw new ConflictError(
      `${blocked} model(s) of this 제품 유형 still use a 제품군 being removed`,
    );
  }
}
