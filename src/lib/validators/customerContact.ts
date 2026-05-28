import { z } from "zod";

const phoneRegex = /^\+?[0-9\s\-().]{6,20}$/;
function optStr(max: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().max(max).optional());
}
function optPhone() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().regex(phoneRegex).max(20).optional());
}
function optEmail() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  }, z.string().email().optional());
}

export const createContactSchema = z.object({
  role: z.enum(["CONTRACT_PARTY", "OPS_CONTACT"]),
  scope: z.enum(["CUSTOMER", "SITE"]).default("CUSTOMER"),
  siteId: optStr(60),
  isPrimary: z.boolean().default(false),
  name: z.string().trim().min(1).max(120),
  title: optStr(120),
  phone1: z.string().trim().regex(phoneRegex).min(6).max(20),
  phone2: optPhone(),
  email: optEmail(),
  language: z.enum(["ko", "vi", "en"]).default("vi"),
  /** When true, server auto-generates portal credentials and sends SMS/Email. */
  portalEnabled: z.boolean().default(false),
}).superRefine((val, ctx) => {
  if (val.role === "CONTRACT_PARTY" && val.scope !== "CUSTOMER") {
    ctx.addIssue({
      code: "custom",
      message: "CONTRACT_PARTY must always have scope=CUSTOMER",
      path: ["scope"],
    });
  }
  if (val.scope === "SITE" && !val.siteId) {
    ctx.addIssue({
      code: "custom",
      message: "siteId is required when scope=SITE",
      path: ["siteId"],
    });
  }
});

export const updateContactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  title: optStr(120),
  phone1: z.string().trim().regex(phoneRegex).min(6).max(20).optional(),
  phone2: optPhone(),
  email: optEmail(),
  language: z.enum(["ko", "vi", "en"]).optional(),
  isPrimary: z.boolean().optional(),
  smsOptOut: z.boolean().optional(),
  emailOptOut: z.boolean().optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
