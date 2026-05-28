/**
 * Workflow journey tests (Refactor C).
 *
 * Drives each domain workflow through a multi-step state sequence using
 * mocked Prisma + notifications. Purpose: pin the wire path so a future
 * mistake (wrong audit code, dropped state-guard, wrong order of operations)
 * fails CI without needing a live DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── shared Prisma mock ─────────────────────────────────────────────────
vi.mock("@/lib/prisma", () => ({
  default: {
    contract: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    payment: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    visit: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    serviceRequest: { findUnique: vi.fn(), update: vi.fn() },
    customer: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    equipment: { findMany: vi.fn(), findUnique: vi.fn() },
    site: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/send", () => ({
  sendNotification: vi.fn().mockResolvedValue([]),
}));

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ContractWorkflow } from "@/lib/contracts/workflow";
import { PaymentWorkflow } from "@/lib/payments/workflow";
import { VisitWorkflow } from "@/lib/visits/workflow";

const mockedPrisma = vi.mocked(prisma, true);
const mockedAudit = vi.mocked(logAudit);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── ContractWorkflow ───────────────────────────────────────────────────

describe("ContractWorkflow: DRAFT → PENDING → ACTIVE → terminate journey", () => {
  it("drives state transitions with audit + concurrency guard", async () => {
    // Start state: DRAFT
    mockedPrisma.contract.findUnique.mockResolvedValueOnce({
      id: "c-1",
      state: "DRAFT",
      activatedAt: null,
      signedByCustomerAt: null,
      signedByCompanyAt: null,
      terminatedAt: null,
    } as never);
    mockedPrisma.contract.update.mockResolvedValueOnce({ id: "c-1", state: "PENDING_SIGNATURE" } as never);

    const step1 = await ContractWorkflow.transition({
      contractId: "c-1",
      to: "PENDING_SIGNATURE",
      actor: { userId: "u-1", role: "STAFF" },
    });
    expect((step1 as { state: string }).state).toBe("PENDING_SIGNATURE");

    // WHERE clause must pin the prior state for the concurrency guard.
    const guardedCall = mockedPrisma.contract.update.mock.calls[0][0] as {
      where: { id: string; state: string };
    };
    expect(guardedCall.where.state).toBe("DRAFT");
    expect(guardedCall.where.id).toBe("c-1");

    // Step 2: PENDING_SIGNATURE → ACTIVE via the named helper.
    mockedPrisma.contract.findUnique.mockResolvedValueOnce({
      id: "c-1",
      state: "PENDING_SIGNATURE",
      activatedAt: null,
      signedByCustomerAt: null,
      signedByCompanyAt: null,
      terminatedAt: null,
    } as never);
    mockedPrisma.contract.update.mockResolvedValueOnce({
      id: "c-1",
      state: "ACTIVE",
    } as never);

    const step2 = await ContractWorkflow.activate("c-1", { userId: "u-2", role: "MANAGER" });
    expect((step2 as { state: string }).state).toBe("ACTIVE");

    // Step 3: ACTIVE → TERMINATED with reason.
    mockedPrisma.contract.findUnique.mockResolvedValueOnce({
      id: "c-1",
      state: "ACTIVE",
      activatedAt: new Date(),
      signedByCustomerAt: new Date(),
      signedByCompanyAt: new Date(),
      terminatedAt: null,
    } as never);
    mockedPrisma.contract.update.mockResolvedValueOnce({
      id: "c-1",
      state: "TERMINATED",
    } as never);

    await ContractWorkflow.terminate("c-1", "customer breach", { userId: "u-3", role: "ADMIN" });

    // Three audit rows, one per state change.
    expect(mockedAudit).toHaveBeenCalledTimes(3);
    const actions = mockedAudit.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual([
      "CONTRACT_STATE_PENDING_SIGNATURE",
      "CONTRACT_STATE_ACTIVE",
      "CONTRACT_STATE_TERMINATED",
    ]);
  });

  it("rejects forbidden role at the access gate", async () => {
    mockedPrisma.contract.findUnique.mockResolvedValueOnce({
      id: "c-2",
      state: "PENDING_SIGNATURE",
      activatedAt: null,
      signedByCustomerAt: null,
      signedByCompanyAt: null,
      terminatedAt: null,
    } as never);
    await expect(
      ContractWorkflow.transition({
        contractId: "c-2",
        to: "ACTIVE",
        actor: { userId: "u-1", role: "STAFF" },
      }),
    ).rejects.toThrow(/STAFF cannot move contract/);
    expect(mockedPrisma.contract.update).not.toHaveBeenCalled();
  });
});

// ─── PaymentWorkflow ────────────────────────────────────────────────────

describe("PaymentWorkflow: EXPECTED → COLLECTED → HANDED_OVER → RECONCILED journey", () => {
  it("walks the lifecycle and re-uses the shared state-guard", async () => {
    // recordCash creates a new payment (no state-guard needed on create).
    mockedPrisma.payment.create.mockResolvedValueOnce({
      id: "pay-1",
      state: "COLLECTED",
      expectedAmount: { toString: () => "100000" },
      actualAmount: { toString: () => "100000" },
      carryoverAmount: { toString: () => "0" },
    } as never);
    mockedPrisma.payment.findUnique.mockResolvedValueOnce({
      id: "pay-1",
      customer: { name: "Acme", contacts: [] },
      collectedAt: new Date(),
      actualAmount: { toString: () => "100000" },
      method: "CASH",
    } as never);

    const cash = await PaymentWorkflow.recordCash({
      visitId: "v-1",
      customerId: "c-1",
      collectedById: "u-1",
      actualAmount: 100_000,
      expectedAmount: 100_000,
    });
    expect(cash.paymentId).toBe("pay-1");

    // handOver: state-guard pins COLLECTED in WHERE.
    mockedPrisma.payment.findUnique.mockResolvedValueOnce({
      id: "pay-1",
      state: "COLLECTED",
    } as never);
    mockedPrisma.payment.update.mockResolvedValueOnce({
      id: "pay-1",
      state: "HANDED_OVER",
      handedOverAt: new Date(),
    } as never);

    const handover = await PaymentWorkflow.handOver({
      paymentId: "pay-1",
      handedOverById: "u-1",
    });
    expect((handover as { state: string }).state).toBe("HANDED_OVER");
    const handoverCall = mockedPrisma.payment.update.mock.calls[0][0] as {
      where: { id: string; state: string };
    };
    expect(handoverCall.where.state).toBe("COLLECTED");

    // reconcile: state-guard pins HANDED_OVER in WHERE.
    mockedPrisma.payment.findUnique.mockResolvedValueOnce({
      id: "pay-1",
      state: "HANDED_OVER",
    } as never);
    mockedPrisma.payment.update.mockResolvedValueOnce({
      id: "pay-1",
      state: "RECONCILED",
      reconciledAt: new Date(),
    } as never);

    const reconciled = await PaymentWorkflow.reconcile({
      paymentId: "pay-1",
      reconciledById: "u-2",
    });
    expect((reconciled as { state: string }).state).toBe("RECONCILED");
    const reconcileCall = mockedPrisma.payment.update.mock.calls[1][0] as {
      where: { id: string; state: string };
    };
    expect(reconcileCall.where.state).toBe("HANDED_OVER");
  });

  it("surfaces the friendly race error when state changes concurrently", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValueOnce({
      id: "pay-2",
      state: "COLLECTED",
    } as never);
    // Simulate Prisma's P2025: another transition raced ahead.
    const p2025 = Object.assign(new Error("Record to update not found."), {
      code: "P2025",
    });
    mockedPrisma.payment.update.mockRejectedValueOnce(p2025);

    await expect(
      PaymentWorkflow.handOver({ paymentId: "pay-2", handedOverById: "u-1" }),
    ).rejects.toThrow(/Payment state changed concurrently/);
  });
});

// ─── VisitWorkflow ──────────────────────────────────────────────────────

describe("VisitWorkflow: SCHEDULED → IN_PROGRESS via start()", () => {
  it("uses the shared state-guard for start()", async () => {
    mockedPrisma.visit.findUnique.mockResolvedValueOnce({
      id: "v-1",
      state: "SCHEDULED",
      leadTechnicianId: "u-1",
      collaboratorTechnicianIds: [],
      customer: {
        id: "c-1",
        contacts: [],
      },
      equipment: null,
      leadTechnician: null,
      payments: [],
      documents: [],
      serviceRequest: null,
    } as never);
    mockedPrisma.visit.update.mockResolvedValueOnce({
      id: "v-1",
      state: "IN_PROGRESS",
      startedAt: new Date(),
    } as never);

    const updated = await VisitWorkflow.start(
      "v-1",
      { userId: "u-1", role: "TECHNICIAN" },
    );
    expect((updated as { state: string }).state).toBe("IN_PROGRESS");
    const call = mockedPrisma.visit.update.mock.calls[0][0] as {
      where: { id: string; state: string };
    };
    expect(call.where.state).toBe("SCHEDULED");
  });

  it("rejects illegal state transitions before touching the DB", async () => {
    mockedPrisma.visit.findUnique.mockResolvedValueOnce({
      id: "v-2",
      state: "COMPLETED",
      leadTechnicianId: "u-1",
      collaboratorTechnicianIds: [],
      customer: { id: "c-1", contacts: [] },
      equipment: null,
      leadTechnician: null,
      payments: [],
      documents: [],
      serviceRequest: null,
    } as never);
    await expect(
      VisitWorkflow.start("v-2", { userId: "u-1", role: "TECHNICIAN" }),
    ).rejects.toThrow(/Cannot transition Visit/);
    expect(mockedPrisma.visit.update).not.toHaveBeenCalled();
  });
});

describe("VisitWorkflow: addOfficeNote() technician → HQ relay", () => {
  it("appends a new entry to the officeNotes thread + audits", async () => {
    mockedPrisma.visit.findUnique.mockResolvedValueOnce({
      id: "v-3",
      state: "IN_PROGRESS",
      officeNotes: [
        { at: "2026-05-28T00:00:00.000Z", authorId: "t-0", authorName: "tech0", text: "earlier" },
      ],
      customer: { id: "c-1", contacts: [] },
      equipment: null,
      leadTechnician: null,
      payments: [],
      documents: [],
      serviceRequest: null,
    } as never);
    mockedPrisma.visit.update.mockResolvedValueOnce({ id: "v-3" } as never);

    await VisitWorkflow.addOfficeNote(
      "v-3",
      { text: "Customer asked to reschedule", author: { id: "t-1", name: "tech1" } },
      { userId: "t-1", role: "TECHNICIAN" },
    );

    const call = mockedPrisma.visit.update.mock.calls[0][0] as unknown as {
      data: { officeNotes: Array<{ authorName: string; text: string }> };
    };
    // Existing entry preserved, new one appended.
    expect(call.data.officeNotes).toHaveLength(2);
    expect(call.data.officeNotes[1]).toMatchObject({
      authorId: "t-1",
      authorName: "tech1",
      text: "Customer asked to reschedule",
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VISIT_OFFICE_NOTE_ADD" }),
    );
  });

  it("starts a fresh thread when officeNotes is null", async () => {
    mockedPrisma.visit.findUnique.mockResolvedValueOnce({
      id: "v-4",
      state: "SCHEDULED",
      officeNotes: null,
      customer: { id: "c-1", contacts: [] },
      equipment: null,
      leadTechnician: null,
      payments: [],
      documents: [],
      serviceRequest: null,
    } as never);
    mockedPrisma.visit.update.mockResolvedValueOnce({ id: "v-4" } as never);

    await VisitWorkflow.addOfficeNote(
      "v-4",
      { text: "first note", author: { id: "t-1", name: "tech1" } },
      { userId: "t-1", role: "TECHNICIAN" },
    );
    const call = mockedPrisma.visit.update.mock.calls[0][0] as unknown as {
      data: { officeNotes: unknown[] };
    };
    expect(call.data.officeNotes).toHaveLength(1);
  });
});
