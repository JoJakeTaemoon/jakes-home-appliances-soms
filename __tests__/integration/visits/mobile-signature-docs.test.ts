/**
 * The field app's 「서명 필요 서류」 must list the documents for every type a
 * visit carries — a periodic inspection with an order piggy-backed on it
 * (additionalTypes: CONSUMABLE_DELIVERY) needs the sale receipt too.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { signFieldAccessToken } from "@/lib/auth/jwt";
import { GET as mobileVisitGet } from "@/app/api/mobile/visits/[id]/route";
import { GET as todayGet } from "@/app/api/mobile/visits/today/route";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
let techId = "";
let customerId = "";
let visitId = "";
let token = "";

beforeAll(async () => {
  const tech = await prisma.user.create({
    data: { username: `test_sigdocs_${rand()}`, phone: `0975${rand()}`, passwordHash: "x", role: "TECHNICIAN" },
  });
  techId = tech.id;
  token = await signFieldAccessToken({ userId: tech.id, username: tech.username, role: tech.role });
  const customer = await prisma.customer.create({
    data: { code: `TESTSD-${rand()}`, name: "TEST_SIGDOCS", type: "B2C" },
  });
  customerId = customer.id;
  const visit = await prisma.visit.create({
    data: {
      customerId,
      type: "PERIODIC_INSPECTION",
      additionalTypes: ["CONSUMABLE_DELIVERY"],
      state: "SCHEDULED",
      scheduledFor: new Date(),
      leadTechnicianId: techId,
    },
  });
  visitId = visit.id;
});

afterAll(async () => {
  await prisma.visit.deleteMany({ where: { customerId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.user.deleteMany({ where: { id: techId } });
});

const req = (url: string) =>
  new NextRequest(`http://localhost${url}`, { headers: { authorization: `Bearer ${token}` } });

describe("field signature documents include additional visit types", () => {
  it("visit detail lists the inspection sheet and the sale receipt", async () => {
    const res = await mobileVisitGet(req(`/api/mobile/visits/${visitId}`), {
      params: Promise.resolve({ id: visitId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.signatureDocs).toEqual(["PERIODIC_CHECK_B2C", "SALE_RECEIPT_B2C"]);
  });

  it("today's card lists both as well", async () => {
    const res = await todayGet(req("/api/mobile/visits/today"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const card = [...body.data.lead, ...body.data.collaborator].find((v: { id: string }) => v.id === visitId);
    expect(card?.signatureDocs).toEqual(["PERIODIC_CHECK_B2C", "SALE_RECEIPT_B2C"]);
  });
});
