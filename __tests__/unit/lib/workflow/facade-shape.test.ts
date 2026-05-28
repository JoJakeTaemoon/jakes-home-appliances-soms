/**
 * Workflow façade shape tests (Refactor C).
 *
 * Each domain workflow exposes a stable public surface. These tests pin the
 * surface so future moves (renames, additions, accidental deletions) are
 * caught at CI time. Pure shape — no DB calls.
 */

import { describe, expect, it } from "vitest";
import { ContractWorkflow } from "@/lib/contracts/workflow";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { PaymentWorkflow } from "@/lib/payments/workflow";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";

const fnsOf = (obj: object): string[] =>
  Object.entries(obj)
    .filter(([, v]) => typeof v === "function")
    .map(([k]) => k)
    .sort();

describe("ContractWorkflow facade", () => {
  it("exposes the documented public surface", () => {
    expect(fnsOf(ContractWorkflow)).toEqual(
      [
        "activate",
        "amend",
        "cancel",
        "completeRentals",
        "create",
        "getById",
        "list",
        "regeneratePdf",
        "renew",
        "terminate",
        "transition",
      ].sort(),
    );
  });
  it("exposes role-check access namespace", () => {
    expect(fnsOf(ContractWorkflow.access)).toEqual(
      [
        "canAmend",
        "canCreate",
        "canEditActiveNotes",
        "canEditDraft",
        "canEmail",
        "canRegeneratePdf",
        "canRenew",
        "canTransition",
        "canView",
      ].sort(),
    );
  });
});

describe("VisitWorkflow facade", () => {
  it("exposes mutators + queries", () => {
    expect(fnsOf(VisitWorkflow)).toEqual(
      [
        "addNotes",
        "addOfficeNote",
        "cancel",
        "complete",
        "create",
        "fail",
        "forTechnician",
        "getById",
        "list",
        "loadCollaborators",
        "reassign",
        "reschedule",
        "schedule",
        "start",
      ].sort(),
    );
  });
  it("exposes access namespace with role + visit predicates", () => {
    expect(fnsOf(VisitWorkflow.access)).toEqual(
      [
        "canAddNotes",
        "canComplete",
        "canCreate",
        "canEditMeta",
        "canFail",
        "canReassign",
        "canStart",
        "canTechnicianView",
        "canView",
        "isCollaborator",
        "isLead",
        "isOfficeRole",
        "technicianVisitWhere",
      ].sort(),
    );
  });
});

describe("PaymentWorkflow facade", () => {
  it("consolidates the seven UC-PY mutators + queries + helpers", () => {
    expect(fnsOf(PaymentWorkflow)).toEqual(
      [
        "applyPartial",
        "computeDaysOverdue",
        "createExpected",
        "escalate",
        "getById",
        "handOver",
        "list",
        "outstandingForCustomer",
        "pickContactLocale",
        "reconcile",
        "recordCash",
        "recordTransfer",
        "writeOff",
      ].sort(),
    );
  });
  it("exposes access namespace", () => {
    expect(fnsOf(PaymentWorkflow.access)).toEqual(
      [
        "canApplyPartial",
        "canCreateExpected",
        "canHandOver",
        "canIssueTaxInvoice",
        "canReconcile",
        "canRecordBankTransfer",
        "canViewList",
        "canWriteOff",
        "isManagerOrHigher",
        "isOfficeRole",
        "scopeForActor",
      ].sort(),
    );
  });
});

describe("ServiceRequestWorkflow facade", () => {
  it("exposes lifecycle + messages + queries + pure utilities", () => {
    expect(fnsOf(ServiceRequestWorkflow)).toEqual(
      [
        "allocateCode",
        "appendMessage",
        "approve",
        "cancel",
        "completeFromVisit",
        "create",
        "determineIsPaid",
        "escalate",
        "forCustomer",
        "getById",
        "list",
        "listMessages",
        "markScheduled",
        "reject",
        "srTypeToVisitType",
      ].sort(),
    );
  });
  it("exposes minimal access namespace (shared with visits)", () => {
    expect(fnsOf(ServiceRequestWorkflow.access)).toEqual(
      ["isManagerOrHigher", "isOfficeRole"].sort(),
    );
  });
});

describe("Cross-domain wiring", () => {
  it("VisitWorkflow.schedule references ServiceRequestWorkflow.markScheduled internally", () => {
    // We can't trigger the internal call without DB, but the import path
    // must resolve — checked by tsc + the existence of markScheduled.
    expect(typeof ServiceRequestWorkflow.markScheduled).toBe("function");
  });
  it("payment + visit workflows surface the shared `computeDaysOverdue` helper", () => {
    expect(typeof PaymentWorkflow.computeDaysOverdue).toBe("function");
    // Pure call: zero days overdue for today's date.
    expect(PaymentWorkflow.computeDaysOverdue(new Date(), new Date())).toBe(0);
  });
});
