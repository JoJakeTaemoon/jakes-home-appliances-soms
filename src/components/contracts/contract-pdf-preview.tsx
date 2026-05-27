"use client";

interface Props {
  contractId: string;
  /** Force a re-render when the version changes. */
  cacheBuster?: string | number;
}

export function ContractPdfPreview({ contractId, cacheBuster }: Props) {
  const src = `/api/contracts/${contractId}/pdf${cacheBuster ? `?v=${cacheBuster}` : ""}`;
  return (
    <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
      <iframe
        src={src}
        title={`Contract ${contractId} PDF`}
        className="h-[720px] w-full bg-[#fafafa]"
      />
    </div>
  );
}
