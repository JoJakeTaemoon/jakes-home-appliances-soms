"use client";

/**
 * Retired 2026-06-22. The standalone "equipment install" entry point has
 * been removed — equipment is now always installed via the contract
 * creation wizard (`/o/contracts/new`). This page exists only to bounce
 * legacy bookmarks / sidebar links onto the new flow so the user doesn't
 * land on a 404.
 *
 * If `?contractId=…` survives the redirect (e.g. someone shared the
 * pre-fill link from the contract detail page) we hand it off to the
 * contract detail page's install modal — that's where contract-scoped
 * additional installs now live.
 */

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";

export default function RetiredEquipmentNewPage() {
  return (
    <Suspense fallback={<div className="text-sm text-[#737373]">Redirecting…</div>}>
      <Redirector />
    </Suspense>
  );
}

function Redirector() {
  const sp = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const contractId = sp.get("contractId");
    if (contractId) {
      router.replace(`/o/contracts/${contractId}`);
      return;
    }
    const customerId = sp.get("customerId");
    router.replace(
      customerId ? `/o/contracts/new?customerId=${customerId}` : "/o/contracts/new",
    );
  }, [router, sp]);
  return <div className="text-sm text-[#737373]">Redirecting to contract flow…</div>;
}
