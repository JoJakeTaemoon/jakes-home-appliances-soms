/**
 * Writing a migration plan — what lands in the database for a customer moved
 * over from the old program.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "@/lib/prisma";
import { planImport, SHEETS, HEADERS, type ExistingSnapshot } from "@/lib/migration/plan";
import { applyPlan } from "@/lib/migration/apply";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
const TAG = `TMIG${rand()}`;
const MODEL = `TEST-MIG-${rand()}`;

let actorId = "";

function snapshot(): ExistingSnapshot {
  return {
    customerLegacyCodes: new Set(),
    contractLegacyNumbers: new Set(),
    modelCodes: new Map([[MODEL.toLowerCase(), "x"]]),
    consumableSkus: new Map(),
    equipmentSerials: new Set(),
    equipmentKeys: new Set(),
  };
}

beforeAll(async () => {
  actorId = (await prisma.user.create({
    data: { username: `test_mig_${rand()}`, phone: `0957${rand()}`, passwordHash: "x", role: "ADMIN" },
  })).id;
  await prisma.equipmentModel.create({ data: { modelCode: MODEL, nameKo: "m", nameVi: "m", nameEn: "m" } });

  const customer = (code: string) =>
    [code, `${TAG} ${code}`, "B2C", "", "", "Lan", "0901234567", "", "vi", "", "", "", "ACTIVE", "", ""];
  const contract = (no: string, code: string, type: string, state: string, end: string, day: string) =>
    [no, code, type, "2023-06-01", type === "RENTAL" ? "36" : "", "300000", "", "", "", state, end, day];
  const unit = (key: string, code: string, no: string, type: string) =>
    [key, code, no, MODEL, "", key, "2023-06-01", type, "FULL_SERVICE", "300000", "", "", "ACTIVE"];

  const plan = planImport(
    {
      [SHEETS.customers]: [[...HEADERS.customers], customer(`${TAG}-1`)],
      [SHEETS.contracts]: [
        [...HEADERS.contracts],
        contract(`${TAG}-K1`, `${TAG}-1`, "MAINTENANCE", "ACTIVE", "", "25"),
        // A rental the old program kept open after its term ran out.
        [...contract(`${TAG}-K2`, `${TAG}-1`, "RENTAL", "COMPLETED", "2026-06-01", "").slice(0, 3),
          "2023-06-02", "36", "300000", "", "", "", "COMPLETED", "2026-06-01", ""],
      ],
      [SHEETS.equipment]: [
        [...HEADERS.equipment],
        unit(`${TAG}-E1`, `${TAG}-1`, `${TAG}-K1`, "MAINTENANCE"),
        unit(`${TAG}-E2`, `${TAG}-1`, `${TAG}-K2`, "RENTAL"),
      ],
      [SHEETS.consumables]: [[...HEADERS.consumables]],
      [SHEETS.payments]: [
        [...HEADERS.payments],
        [`${TAG}-E1`, "2024-04", "2024-04-24", "300000", "VND", "CASH", ""],
        [`${TAG}-E1`, "2014-10", "2014-10-14", "17", "USD", "", ""],
      ],
    },
    snapshot(),
  );
  expect(plan.errors).toEqual([]);
  const result = await applyPlan(prisma, plan, actorId);
  expect(result.paymentsCreated).toBe(2);
});

afterAll(async () => {
  const customers = await prisma.customer.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const ids = customers.map((c) => c.id);
  await prisma.payment.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.visit.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.contractEquipment.deleteMany({ where: { contract: { customerId: { in: ids } } } });
  await prisma.contract.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.equipment.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  await prisma.equipmentModel.deleteMany({ where: { modelCode: MODEL } });
  await prisma.user.deleteMany({ where: { id: actorId } });
});

const customerRow = () =>
  prisma.customer.findFirstOrThrow({ where: { legacyCode: `${TAG}-1` }, include: { contacts: true } });

describe("applyPlan", () => {
  it("copies the contract party in as a primary operations contact staff must confirm", async () => {
    const c = await customerRow();
    const ops = c.contacts.filter((x) => x.role === "OPS_CONTACT");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ isPrimary: true, needsReview: true, name: "Lan", phone1: "0901234567" });
    expect(c.contacts.find((x) => x.role === "CONTRACT_PARTY")?.needsReview).toBe(false);
  });

  it("keeps the contract's billing day", async () => {
    const k = await prisma.contract.findFirstOrThrow({ where: { legacyContractNumber: `${TAG}-K1` } });
    expect(k.billingDay).toBe(25);
  });

  it("records collected history, due on the billing day, in its own currency", async () => {
    const c = await customerRow();
    const payments = await prisma.payment.findMany({ where: { customerId: c.id }, orderBy: { dueDate: "asc" } });
    expect(payments.map((p) => [p.dueDate?.toISOString(), p.currency, Number(p.actualAmount), p.state, p.kind])).toEqual([
      ["2014-10-25T23:59:59.000Z", "USD", 17, "RECONCILED", "MAINTENANCE_FEE"],
      ["2024-04-25T23:59:59.000Z", "VND", 300000, "RECONCILED", "MAINTENANCE_FEE"],
    ]);
    expect(payments[1].collectedAt?.toISOString().slice(0, 10)).toBe("2024-04-24");
  });

  it("hands a finished rental's unit to the customer", async () => {
    const e = await prisma.equipment.findFirstOrThrow({ where: { serialNumber: `${TAG}-E2` } });
    expect(e).toMatchObject({ ownership: "CUSTOMER", lifecycleStage: "IN_MAINTENANCE", status: "ACTIVE" });
  });
});
