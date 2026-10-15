/**
 * POST /api/mobile/uploads — the technician photo / signature upload.
 *
 * The route lives under /api/mobile, so it must authenticate the FIELD
 * realm. It used to call the staff guard, which rejects every field token
 * (`aud` mismatch) — no technician could upload the mandatory signature, so
 * no visit could be completed from the app.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { signFieldAccessToken, signStaffAccessToken } from "@/lib/auth/jwt";
import { POST as uploadRoute } from "@/app/api/mobile/uploads/route";

// 1×1 transparent PNG
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

let techId = "";
let customerId = "";
let visitId = "";
let fieldToken = "";
let staffToken = "";

const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");

beforeAll(async () => {
  const tech = await prisma.user.create({
    data: {
      username: `test_upload_tech_${rand()}`,
      phone: `0987${rand()}`,
      passwordHash: "x",
      role: "TECHNICIAN",
    },
  });
  techId = tech.id;
  const customer = await prisma.customer.create({
    data: { code: `TESTUP-${rand()}`, name: "TEST_UPLOAD_Customer", type: "B2C" },
  });
  customerId = customer.id;
  const visit = await prisma.visit.create({
    data: {
      customerId,
      type: "REPAIR",
      state: "IN_PROGRESS",
      scheduledFor: new Date(),
      leadTechnicianId: techId,
    },
  });
  visitId = visit.id;
  const claims = { userId: tech.id, username: tech.username, role: tech.role };
  fieldToken = await signFieldAccessToken(claims);
  staffToken = await signStaffAccessToken(claims);
});

afterAll(async () => {
  await prisma.visit.deleteMany({ where: { id: visitId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.user.deleteMany({ where: { id: techId } });
  await fs.rm(path.join(process.cwd(), "uploads", "visits", visitId), { recursive: true, force: true });
});

function uploadRequest(token: string) {
  const form = new FormData();
  form.append("visitId", visitId);
  form.append("file", new File([PNG], "signature.png", { type: "image/png" }));
  return new NextRequest("http://localhost/api/mobile/uploads", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
}

describe("POST /api/mobile/uploads", () => {
  it("accepts the technician's field-realm token", async () => {
    const res = await uploadRoute(uploadRequest(fieldToken));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("rejects an office-realm token", async () => {
    const res = await uploadRoute(uploadRequest(staffToken));
    expect(res.status).toBe(401);
  });
});
