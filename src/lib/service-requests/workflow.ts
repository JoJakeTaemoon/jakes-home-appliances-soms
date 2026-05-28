/**
 * ServiceRequestWorkflow — public façade for the ServiceRequest domain (Refactor C).
 *
 * The façade hides the multi-table orchestration in `operations.ts` (pricing,
 * Visit creation, notification dispatch, AuditLog) and re-exports the message
 * thread helpers so routes only need one import.
 *
 * Sibling files (`operations.ts`, `state.ts`, `pricing.ts`, `code.ts`,
 * `messages.ts`) keep their existing exports — they're pure helpers reachable
 * by unit tests.
 */

import prisma from "@/lib/prisma";
import {
  approveServiceRequest,
  cancelServiceRequest,
  completeSrFromVisit,
  createServiceRequest,
  escalateServiceRequest,
  markScheduledFromVisit,
  rejectServiceRequest,
  type ApproveSrArgs,
  type CancelSrArgs,
  type CreateServiceRequestArgs,
  type CreateServiceRequestResult,
  type RejectSrArgs,
} from "@/lib/service-requests/operations";
import {
  appendSrMessage,
  listSrMessages,
  type AppendInput as AppendSrMessageInput,
  type SrMessage,
} from "@/lib/service-requests/messages";
import { allocateServiceRequestCode } from "@/lib/service-requests/code";
import {
  determineIsPaid,
  srTypeToVisitType,
} from "@/lib/service-requests/pricing";

// ── Mutators ───────────────────────────────────────────────────────────────

async function create(args: CreateServiceRequestArgs): Promise<CreateServiceRequestResult> {
  return createServiceRequest(args);
}

async function approve(args: ApproveSrArgs) {
  return approveServiceRequest(args);
}

async function reject(args: RejectSrArgs) {
  return rejectServiceRequest(args);
}

async function cancel(args: CancelSrArgs) {
  return cancelServiceRequest(args);
}

async function escalate(args: {
  serviceRequestId: string;
  reason: string | null;
  actor: { actorType: "USER" | "CUSTOMER" | "SYSTEM"; actorUserId?: string | null; actorContactId?: string | null };
}) {
  return escalateServiceRequest(args);
}

// Visit-linked internal helpers (called by VisitWorkflow).
async function markScheduled(serviceRequestId: string) {
  return markScheduledFromVisit(serviceRequestId);
}

async function completeFromVisit(serviceRequestId: string) {
  return completeSrFromVisit(serviceRequestId);
}

// ── Messages ───────────────────────────────────────────────────────────────

async function appendMessage(input: AppendSrMessageInput) {
  return appendSrMessage(input);
}

async function listMessages(srId: string): Promise<SrMessage[]> {
  return listSrMessages(srId);
}

// ── Queries ────────────────────────────────────────────────────────────────

async function getById(srId: string) {
  return prisma.serviceRequest.findUnique({ where: { id: srId } });
}

async function list(args: Parameters<typeof prisma.serviceRequest.findMany>[0] = {}) {
  return prisma.serviceRequest.findMany(args);
}

async function forCustomer(customerId: string) {
  return prisma.serviceRequest.findMany({
    where: { customerId },
    orderBy: { submittedAt: "desc" },
  });
}

// ── Public façade ──────────────────────────────────────────────────────────

/** Role-check helpers (SR domain has no dedicated access.ts; office gate is
 *  shared with Visits). */
const access = {
  isOfficeRole: (role: string): boolean =>
    role === "ADMIN" || role === "MANAGER" || role === "STAFF",
  isManagerOrHigher: (role: string): boolean =>
    role === "ADMIN" || role === "MANAGER",
} as const;

export const ServiceRequestWorkflow = {
  create,
  approve,
  reject,
  cancel,
  escalate,
  markScheduled,
  completeFromVisit,
  appendMessage,
  listMessages,
  getById,
  list,
  forCustomer,
  // pure utilities re-exposed
  allocateCode: allocateServiceRequestCode,
  determineIsPaid,
  srTypeToVisitType,
  access,
} as const;

export type ServiceRequestWorkflowType = typeof ServiceRequestWorkflow;
