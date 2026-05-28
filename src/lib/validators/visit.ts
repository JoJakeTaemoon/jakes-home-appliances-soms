/**
 * Visit validators (Phase 4).
 *
 * createVisitSchema       — office creates a SUGGESTED visit
 * updateVisitSchema       — non-state field tweaks (SUGGESTED + SCHEDULED only)
 * scheduleVisitSchema     — UC-VS-02 (assign lead + collab, transition SCHEDULED)
 * reassignVisitSchema     — UC-VS-03 (swap lead / collab)
 * rescheduleVisitSchema   — UC-VS-08 (new scheduledFor + reason)
 * cancelVisitSchema       — cancel with reason
 * completeVisitSchema     — UC-VS-06 (lead-only)
 * failVisitSchema         — UC-VS-09 (no-show)
 * addNotesSchema          — collaborator-friendly notes/photos append
 * visitListQuerySchema    — list endpoint filters
 * recommendQuerySchema    — UC-VS-01 candidate query
 * uploadResponseSchema    — server response after photo upload
 *
 * Photo shape kept tight: client uploads via /api/mobile/uploads then echoes
 * back `{ storageKey, takenAt }` per file when calling complete/fail.
 */

import { z } from "zod";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

const moneyOptional = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom" as const, message: "Invalid amount" });
      return z.NEVER;
    }
    return n;
  });

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

export const visitTypeEnum = z.enum([
  "INSTALLATION",
  "PERIODIC_INSPECTION",
  "REPAIR",
  "FILTER_REPLACEMENT",
  "RELOCATION",
  "PAYMENT_COLLECTION",
  "OTHER",
]);

export const visitStateEnum = z.enum([
  "SUGGESTED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED_NO_SHOW",
  "RESCHEDULED",
  "CANCELLED",
]);

export const photoMetaSchema = z.object({
  storageKey: z.string().trim().min(1).max(500),
  takenAt: z.coerce.date().optional(),
});

const collaboratorList = z
  .array(z.string().trim().min(1))
  .max(10)
  .optional()
  .default([])
  .transform((arr) => Array.from(new Set(arr)));

export const createVisitSchema = z.object({
  customerId: z.string().trim().min(1),
  siteId: optStr(60),
  equipmentId: optStr(60),
  type: visitTypeEnum,
  scheduledFor: z.coerce.date(),
  scheduledWindow: optStr(40),
  expectedAmount: moneyOptional,
  notes: optStr(2000),
});

export const updateVisitSchema = z.object({
  type: visitTypeEnum.optional(),
  scheduledWindow: optStr(40),
  expectedAmount: moneyOptional,
  siteId: z.string().trim().min(1).nullable().optional(),
  equipmentId: z.string().trim().min(1).nullable().optional(),
  notes: optStr(2000),
});

export const scheduleVisitSchema = z.object({
  leadTechnicianId: z.string().trim().min(1),
  collaboratorTechnicianIds: collaboratorList,
  scheduledFor: z.coerce.date().optional(),
  scheduledWindow: optStr(40),
});

export const reassignVisitSchema = z.object({
  leadTechnicianId: z.string().trim().min(1).optional(),
  collaboratorTechnicianIds: collaboratorList,
  reason: z.string().trim().min(3).max(500),
});

export const rescheduleVisitSchema = z.object({
  scheduledFor: z.coerce.date(),
  scheduledWindow: optStr(40),
  reason: z.string().trim().min(3).max(500),
});

export const cancelVisitSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const completeVisitSchema = z.object({
  findings: z.string().trim().min(1).max(4000),
  partsReplaced: z
    .array(z.string().trim().min(1).max(120))
    .max(50)
    .optional()
    .default([]),
  photos: z.array(photoMetaSchema).max(40).optional().default([]),
  customerSignaturePhotoStorageKey: z.string().trim().min(1).max(500),
  collectedAmount: moneyOptional,
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]).optional(),
});

export const failVisitSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  photos: z.array(photoMetaSchema).max(20).optional().default([]),
});

export const addNotesSchema = z.object({
  note: optStr(2000),
  photos: z.array(photoMetaSchema).max(20).optional().default([]),
});

/** Technician → HQ relay message (방문 전달사항). Plain text, no photos. */
export const officeNoteSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const visitListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  technicianId: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).optional(),
  state: visitStateEnum.optional(),
  type: visitTypeEnum.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

export const recommendQuerySchema = z.object({
  customerId: z.string().trim().min(1),
  siteId: optStr(60),
  scheduledFor: z.coerce.date(),
  maxResults: z.coerce.number().int().min(1).max(10).optional(),
});

export const uploadResponseSchema = z.object({
  storageKey: z.string(),
  url: z.string(),
  sizeBytes: z.number(),
  mimeType: z.string(),
});

export type CreateVisitInput = z.infer<typeof createVisitSchema>;
export type UpdateVisitInput = z.infer<typeof updateVisitSchema>;
export type ScheduleVisitInput = z.infer<typeof scheduleVisitSchema>;
export type ReassignVisitInput = z.infer<typeof reassignVisitSchema>;
export type RescheduleVisitInput = z.infer<typeof rescheduleVisitSchema>;
export type CancelVisitInput = z.infer<typeof cancelVisitSchema>;
export type CompleteVisitInput = z.infer<typeof completeVisitSchema>;
export type FailVisitInput = z.infer<typeof failVisitSchema>;
export type AddNotesInput = z.infer<typeof addNotesSchema>;
export type OfficeNoteInput = z.infer<typeof officeNoteSchema>;
export type VisitListQuery = z.infer<typeof visitListQuerySchema>;
export type RecommendQuery = z.infer<typeof recommendQuerySchema>;
export type PhotoMeta = z.infer<typeof photoMetaSchema>;
export { moneyRequired };
