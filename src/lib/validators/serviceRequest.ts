/**
 * Service Request validators (Phase 5 — UC-SR-01..06).
 *
 * createServiceRequestSchema   — portal customer submits an SR
 * listServiceRequestQuery      — office side list filters
 * approveServiceRequestSchema  — UC-SR-02 manager approves paid SR
 * rejectServiceRequestSchema   — UC-SR-03 STAFF+ rejects SR
 * cancelServiceRequestSchema   — UC-SR-05 customer (or office) cancels
 * scheduleSrVisitSchema        — office turns APPROVED → SCHEDULED by attaching a visit
 */

import { z } from "zod";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

const moneyRequired = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom" as const, message: "Invalid amount" });
      return z.NEVER;
    }
    return n;
  });

export const srTypeEnum = z.enum([
  "INSPECTION",
  "REPAIR",
  "PART_REPLACEMENT",
  "RELOCATION",
  "OTHER",
]);

export const srStateEnum = z.enum([
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
]);

export const srAttachmentSchema = z.object({
  storageKey: z.string().trim().min(1).max(500),
  filename: z.string().trim().min(1).max(200),
  mimeType: optStr(80),
  sizeBytes: z.number().int().min(0).max(20 * 1024 * 1024).optional(),
});

export const createServiceRequestSchema = z.object({
  equipmentId: optStr(60),
  type: srTypeEnum,
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(4000),
  attachments: z.array(srAttachmentSchema).max(8).optional().default([]),
  // Customer's preferred visit time (optional). Office uses it to seed the
  // approval modal's scheduledFor.
  preferredVisitAt: z.coerce.date().optional(),
});

/** Office-staff manual SR creation — adds customerId + optional contactId. */
export const staffCreateServiceRequestSchema = createServiceRequestSchema.extend({
  customerId: z.string().min(1, "customerId is required"),
  contactId: optStr(60),
});

export const listServiceRequestQuerySchema = z.object({
  q: optStr(200),
  state: srStateEnum.optional(),
  type: srTypeEnum.optional(),
  customerId: optStr(60),
  isPaid: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  // Office-only — when true, restrict the result to SRs that have at
  // least one customer SR_MESSAGE more recent than the team's
  // lastOfficeReadAt. Powers the "읽지 않은 메시지" tab.
  unread: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  sortBy: z.string().trim().min(1).max(60).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

export const approveServiceRequestSchema = z.object({
  approvedPrice: moneyRequired,
  approvedDate: z.coerce.date(),
  scheduledFor: z.coerce.date().optional(),
  scheduledWindow: optStr(40),
  leadTechnicianId: optStr(60),
  notes: optStr(2000),
});

export const rejectServiceRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  customerMessage: optStr(1000),
});

export const cancelServiceRequestSchema = z.object({
  reason: optStr(500),
});

export const escalateServiceRequestSchema = z.object({
  reason: optStr(500),
});

export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;
export type ListServiceRequestQuery = z.infer<typeof listServiceRequestQuerySchema>;
export type ApproveServiceRequestInput = z.infer<typeof approveServiceRequestSchema>;
export type RejectServiceRequestInput = z.infer<typeof rejectServiceRequestSchema>;
export type CancelServiceRequestInput = z.infer<typeof cancelServiceRequestSchema>;
export type EscalateServiceRequestInput = z.infer<typeof escalateServiceRequestSchema>;
export type SrAttachment = z.infer<typeof srAttachmentSchema>;
