import prisma from "@/lib/prisma";

/**
 * The customer's current contract — what the field detail page offers for
 * signing on an INSTALLATION visit and what the CONTRACT preview streams.
 * Shared so the two can never point at different contracts.
 */
export function findLatestContract(customerId: string) {
  return prisma.contract.findFirst({
    where: {
      customerId,
      state: { in: ["ACTIVE", "PENDING_SIGNATURE", "AMENDED"] },
    },
    orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, contractNumber: true, type: true, pdfStorageKey: true },
  });
}
