"use client";

/**
 * Step 3 of the 4-step bulk-register wizard — per-line service method
 * (rental / sale / maintenance) + the contract fields specific to that
 * method. Maps 1:1 onto the extended `bulk-register` API fields (Phase 1).
 */

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form-field";

export type ServiceMethodValue = {
  method: "RENTAL" | "SALE" | "MAINTENANCE";
  contractNumber?: string | null;
  contractDate?: string | null;
  termMonths?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  hasContract?: boolean;
  salePrice?: number | null;
  installFee?: number | null;
  managementType?: "FULL_SERVICE" | "SELF_MANAGED";
  monthlyMaintenanceFee?: number | null;
};

interface Props {
  value: ServiceMethodValue;
  onChange: (v: ServiceMethodValue) => void;
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const METHODS = ["RENTAL", "SALE", "MAINTENANCE"] as const;

const SECTION_CLASS =
  "flex flex-col gap-3 rounded-2xl border-4 border-[var(--brand-blue-100)] bg-white p-4";
const GRID_CLASS = "grid grid-cols-1 gap-3 sm:grid-cols-2";

export function ServiceMethodSection({ value, onChange }: Readonly<Props>) {
  const t = useTranslations("equipment.serviceMethod");

  function patch(p: Partial<ServiceMethodValue>) {
    onChange({ ...value, ...p });
  }

  function setMethod(method: ServiceMethodValue["method"]) {
    // Reset to that method's defaults per the spec (contractDate defaults
    // to today, termMonths to 36, money fields to 0) rather than carrying
    // over stale values from whichever method was previously selected.
    if (method === "RENTAL") {
      onChange({
        method,
        contractNumber: value.contractNumber ?? "",
        contractDate: value.contractDate || todayYmd(),
        termMonths: value.termMonths ?? 36,
        deposit: value.deposit ?? 0,
        monthlyRent: value.monthlyRent ?? 0,
      });
    } else if (method === "SALE") {
      onChange({
        method,
        hasContract: value.hasContract ?? false,
        contractNumber: value.contractNumber ?? "",
        contractDate: value.contractDate || todayYmd(),
        salePrice: value.salePrice ?? 0,
        installFee: value.installFee ?? 0,
        managementType: value.managementType ?? "SELF_MANAGED",
        monthlyMaintenanceFee: value.monthlyMaintenanceFee ?? 0,
      });
    } else {
      onChange({
        method,
        contractNumber: value.contractNumber ?? "",
        contractDate: value.contractDate || todayYmd(),
        termMonths: value.termMonths ?? 36,
        monthlyMaintenanceFee: value.monthlyMaintenanceFee ?? 0,
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FormField label={t("method")}>
        <div className="flex gap-4">
          {METHODS.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="service-method"
                checked={value.method === m}
                onChange={() => setMethod(m)}
              />
              {t(`methodValues.${m}`)}
            </label>
          ))}
        </div>
      </FormField>

      {value.method === "RENTAL" && (
        <div className={SECTION_CLASS}>
          <div className={GRID_CLASS}>
            <FormField label={t("contractNumber")}>
              <Input
                aria-label={t("contractNumber")}
                value={value.contractNumber ?? ""}
                onChange={(e) => patch({ contractNumber: e.target.value })}
              />
            </FormField>
            <FormField label={t("contractDate")}>
              <DatePicker
                ariaLabel={t("contractDate")}
                value={value.contractDate || todayYmd()}
                onChange={(v) => patch({ contractDate: v })}
              />
            </FormField>
            <FormField label={t("termMonths")}>
              <NumberInput
                ariaLabel={t("termMonths")}
                value={value.termMonths ?? 36}
                onChange={(v) => patch({ termMonths: v })}
                min={1}
              />
            </FormField>
            <FormField label={t("deposit")}>
              <NumberInput
                ariaLabel={t("deposit")}
                variant="money"
                value={value.deposit ?? 0}
                onChange={(v) => patch({ deposit: v })}
              />
            </FormField>
            <FormField label={t("monthlyRent")}>
              <NumberInput
                ariaLabel={t("monthlyRent")}
                variant="money"
                value={value.monthlyRent ?? 0}
                onChange={(v) => patch({ monthlyRent: v })}
              />
            </FormField>
          </div>
        </div>
      )}

      {value.method === "SALE" && (
        <div className={SECTION_CLASS}>
          <FormField label={t("hasContract")}>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sale-has-contract"
                  checked={value.hasContract !== true}
                  onChange={() => patch({ hasContract: false })}
                />
                {t("hasContractValues.false")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sale-has-contract"
                  checked={value.hasContract === true}
                  onChange={() =>
                    patch({
                      hasContract: true,
                      contractNumber: value.contractNumber ?? "",
                      contractDate: value.contractDate || todayYmd(),
                    })
                  }
                />
                {t("hasContractValues.true")}
              </label>
            </div>
          </FormField>

          {value.hasContract === true && (
            <div className={GRID_CLASS}>
              <FormField label={t("contractNumber")}>
                <Input
                  aria-label={t("contractNumber")}
                  value={value.contractNumber ?? ""}
                  onChange={(e) => patch({ contractNumber: e.target.value })}
                />
              </FormField>
              <FormField label={t("contractDate")}>
                <DatePicker
                  ariaLabel={t("contractDate")}
                  value={value.contractDate || todayYmd()}
                  onChange={(v) => patch({ contractDate: v })}
                />
              </FormField>
            </div>
          )}

          <div className={GRID_CLASS}>
            <FormField label={t("salePrice")}>
              <NumberInput
                ariaLabel={t("salePrice")}
                variant="money"
                value={value.salePrice ?? 0}
                onChange={(v) => patch({ salePrice: v })}
              />
            </FormField>
            <FormField label={t("installFee")}>
              <NumberInput
                ariaLabel={t("installFee")}
                variant="money"
                value={value.installFee ?? 0}
                onChange={(v) => patch({ installFee: v })}
              />
            </FormField>
          </div>

          <FormField label={t("managementType")}>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sale-management-type"
                  checked={(value.managementType ?? "SELF_MANAGED") === "SELF_MANAGED"}
                  onChange={() => patch({ managementType: "SELF_MANAGED" })}
                />
                {t("managementTypeValues.SELF_MANAGED")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sale-management-type"
                  checked={value.managementType === "FULL_SERVICE"}
                  onChange={() =>
                    patch({
                      managementType: "FULL_SERVICE",
                      contractDate: value.contractDate || todayYmd(),
                      monthlyMaintenanceFee: value.monthlyMaintenanceFee ?? 0,
                    })
                  }
                />
                {t("managementTypeValues.FULL_SERVICE")}
              </label>
            </div>
          </FormField>

          {value.managementType === "FULL_SERVICE" && (
            // ponytail: ServiceMethodValue has a single `contractDate` field
            // (no separate sale-contract vs. maintenance-contract date), so
            // this picker reads/writes the same field as the sale contract
            // date above. Split into two fields if the API ever needs them
            // to diverge. Also intentionally no contractNumber field here —
            // the API auto-allocates the MAINTENANCE contract's number;
            // only the SALE contract above takes a manual contractNumber.
            <div className="rounded-xl border-2 border-[var(--brand-blue-100)] p-3">
              <p className="mb-2 text-xs font-medium text-[#525252]">
                {t("maintenanceSection")}
              </p>
              <div className={GRID_CLASS}>
                <FormField label={t("maintenanceContractDate")}>
                  <DatePicker
                    ariaLabel={t("maintenanceContractDate")}
                    value={value.contractDate || todayYmd()}
                    onChange={(v) => patch({ contractDate: v })}
                  />
                </FormField>
                <FormField label={t("monthlyMaintenanceFee")}>
                  <NumberInput
                    ariaLabel={t("monthlyMaintenanceFee")}
                    variant="money"
                    value={value.monthlyMaintenanceFee ?? 0}
                    onChange={(v) => patch({ monthlyMaintenanceFee: v })}
                  />
                </FormField>
              </div>
            </div>
          )}
        </div>
      )}

      {value.method === "MAINTENANCE" && (
        <div className={SECTION_CLASS}>
          <div className={GRID_CLASS}>
            <FormField label={t("contractNumber")}>
              <Input
                aria-label={t("contractNumber")}
                value={value.contractNumber ?? ""}
                onChange={(e) => patch({ contractNumber: e.target.value })}
              />
            </FormField>
            <FormField label={t("contractDate")}>
              <DatePicker
                ariaLabel={t("contractDate")}
                value={value.contractDate || todayYmd()}
                onChange={(v) => patch({ contractDate: v })}
              />
            </FormField>
            <FormField label={t("termMonths")}>
              <NumberInput
                ariaLabel={t("termMonths")}
                value={value.termMonths ?? 36}
                onChange={(v) => patch({ termMonths: v })}
                min={1}
              />
            </FormField>
            <FormField label={t("monthlyMaintenanceFee")}>
              <NumberInput
                ariaLabel={t("monthlyMaintenanceFee")}
                variant="money"
                value={value.monthlyMaintenanceFee ?? 0}
                onChange={(v) => patch({ monthlyMaintenanceFee: v })}
              />
            </FormField>
          </div>
        </div>
      )}
    </div>
  );
}
