import { z } from "zod";

function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}

export const productKindEnum = z.enum(["EQUIPMENT", "CONSUMABLE", "OTHER"]);
export const orderStateEnum = z.enum(["PENDING", "DELIVERED", "CANCELLED"]);

const orderItemSchema = z
  .object({
    productKind: productKindEnum,
    consumableId: optStr(60),
    equipmentModelId: optStr(60),
    customName: optStr(255),
    /**
     * Optional per-line link to a specific installed Equipment row.
     * Independent from `equipmentModelId` (catalog reference) —
     * `equipmentId` says "this parts order is for that unit at the
     * customer's site".
     */
    equipmentId: optStr(60),
    quantity: z.coerce.number().int().min(1).max(10_000),
    unitPrice: z.coerce.number().nonnegative(),
    totalPrice: z.coerce.number().nonnegative(),
    purpose: optStr(120),
    notes: optStr(500),
  })
  .superRefine((v, ctx) => {
    // XOR — exactly one product identifier per row based on kind.
    if (v.productKind === "CONSUMABLE" && !v.consumableId) {
      ctx.addIssue({
        code: "custom",
        path: ["consumableId"],
        message: "consumableId required when productKind=CONSUMABLE",
      });
    }
    if (v.productKind === "EQUIPMENT" && !v.equipmentModelId) {
      ctx.addIssue({
        code: "custom",
        path: ["equipmentModelId"],
        message: "equipmentModelId required when productKind=EQUIPMENT",
      });
    }
    if (v.productKind === "OTHER" && !v.customName) {
      ctx.addIssue({
        code: "custom",
        path: ["customName"],
        message: "customName required when productKind=OTHER",
      });
    }
  });

/**
 * Visit auto-creation block for POST /api/orders.
 *
 * Always present in new modal-driven submissions — every order yields a
 * SUGGESTED visit on the field-tech queue. `scheduledFor` defaults to
 * the earliest practical slot on the client (tomorrow, skipping Sunday)
 * and the office user can move it.
 */
export const orderVisitSchema = z.object({
  scheduledFor: z.coerce.date(),
  /// Default INSTALLATION when the order ships equipment, FILTER_REPLACEMENT
  /// when it's consumables, OTHER as fallback. Validator just takes the
  /// caller's choice; the modal computes the suggested default from items.
  type: z.enum([
    "INSTALLATION",
    "PERIODIC_INSPECTION",
    "REPAIR",
    "FILTER_REPLACEMENT",
    "RELOCATION",
    "PAYMENT_COLLECTION",
    "RETRIEVAL",
    "CONSUMABLE_DELIVERY",
    "OTHER",
  ]),
  leadTechnicianId: optStr(60),
  notes: optStr(1000),
});

export const createOrderSchema = z
  .object({
    customerId: z.string().trim().min(1),
    equipmentId: optStr(60),
    siteId: optStr(60),
    contractId: optStr(60),
    orderedAt: z.coerce.date(),
    deliveredAt: z.coerce.date().optional(),
    state: orderStateEnum.default("PENDING"),
    notes: optStr(2000),
    items: z.array(orderItemSchema).min(1).max(50),
    /// Spawn a brand-new visit for this order. Mutually exclusive with
    /// `attachToVisitId` — the client picks one path.
    visit: orderVisitSchema.optional(),
    /// Attach the order to an already-scheduled visit for the same
    /// customer. The route appends CONSUMABLE_DELIVERY to that visit's
    /// `additionalTypes` (idempotent) instead of creating a new visit.
    attachToVisitId: optStr(60),
    serviceRequestId: optStr(60),
  })
  .superRefine((v, ctx) => {
    if (v.visit && v.attachToVisitId) {
      ctx.addIssue({
        code: "custom",
        path: ["visit"],
        message: "visit and attachToVisitId are mutually exclusive",
      });
    }
  });

export const updateOrderSchema = z.object({
  equipmentId: optStr(60),
  siteId: optStr(60),
  contractId: optStr(60),
  orderedAt: z.coerce.date().optional(),
  deliveredAt: z.coerce.date().nullable().optional(),
  state: orderStateEnum.optional(),
  notes: optStr(2000),
});

export const orderListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  customerId: z.string().trim().min(1).optional(),
  equipmentId: z.string().trim().min(1).optional(),
  contractId: z.string().trim().min(1).optional(),
  state: orderStateEnum.optional(),
  productKind: productKindEnum.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortBy: z.string().trim().min(1).max(60).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/**
 * Generate the next order number for a given date.
 * Format: SO{YYMMDD}-{seq:03d}
 *
 * Caller is responsible for resolving `seq` from DB (e.g. count rows whose
 * orderedAt is on the same calendar date) and re-trying on unique-constraint
 * collisions.
 */
export function formatOrderNumber(orderedAt: Date, seq: number): string {
  const yy = String(orderedAt.getFullYear()).slice(-2);
  const mm = String(orderedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(orderedAt.getDate()).padStart(2, "0");
  return `SO${yy}${mm}${dd}-${String(seq).padStart(3, "0")}`;
}
