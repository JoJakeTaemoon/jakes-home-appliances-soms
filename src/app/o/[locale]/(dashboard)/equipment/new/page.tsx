"use client";

/**
 * Equipment install — contract-first entry point (2026-06 redesign).
 *
 * Previously this page asked the user to pick a customer and then
 * register a single device. The new policy ("신규 설치는 반드시 계약에
 * 종속") makes the contract the canonical owner of equipment, so this
 * page hosts the `BulkInstallEquipmentForm` with the contract picker
 * enabled.
 */

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { BulkInstallEquipmentForm } from "@/components/contracts/bulk-install-equipment-form";

export default function NewEquipmentPage() {
  return (
    <Suspense fallback={<div className="text-sm text-[#737373]">Loading…</div>}>
      <NewEquipmentInner />
    </Suspense>
  );
}

function NewEquipmentInner() {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const router = useRouter();
  const sp = useSearchParams();
  const presetContract = sp.get("contractId");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#002A4D]">
          {t("installNew")}
        </h1>
        <Button variant="ghost" onClick={() => router.push("/o/equipment")}>
          {tc("cancel")}
        </Button>
      </header>

      <BulkInstallEquipmentForm
        lockedContractId={presetContract ?? undefined}
        onSuccess={({ contractId }) => router.push(`/o/contracts/${contractId}`)}
      />
    </div>
  );
}
