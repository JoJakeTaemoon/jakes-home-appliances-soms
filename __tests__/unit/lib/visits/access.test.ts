import { describe, it, expect } from "vitest";
import {
  canCompleteVisit,
  canStartVisit,
  canAddVisitNotes,
  canViewVisit,
  canTechnicianViewVisit,
  isLead,
  isCollaborator,
} from "@/lib/visits/access";

const lead = { userId: "u-lead", role: "TECHNICIAN" } as const;
const collab = { userId: "u-collab", role: "TECHNICIAN" } as const;
const otherTech = { userId: "u-other", role: "TECHNICIAN" } as const;
const officeStaff = { userId: "u-staff", role: "STAFF" } as const;
const officeManager = { userId: "u-manager", role: "MANAGER" } as const;

const visit = {
  leadTechnicianId: "u-lead",
  collaboratorTechnicianIds: ["u-collab"],
};

describe("visit access", () => {
  it("recognizes the lead", () => {
    expect(isLead(lead, visit)).toBe(true);
    expect(isLead(collab, visit)).toBe(false);
  });
  it("recognizes a collaborator (not lead)", () => {
    expect(isCollaborator(collab, visit)).toBe(true);
    expect(isCollaborator(lead, visit)).toBe(false);
  });
  it("only the lead can start the visit", () => {
    expect(canStartVisit(lead, visit)).toBe(true);
    expect(canStartVisit(collab, visit)).toBe(false);
    expect(canStartVisit(otherTech, visit)).toBe(false);
  });
  it("only the lead can complete the visit", () => {
    expect(canCompleteVisit(lead, visit)).toBe(true);
    expect(canCompleteVisit(collab, visit)).toBe(false);
  });
  it("lead + collaborator can add notes", () => {
    expect(canAddVisitNotes(lead, visit)).toBe(true);
    expect(canAddVisitNotes(collab, visit)).toBe(true);
    expect(canAddVisitNotes(otherTech, visit)).toBe(false);
  });
  it("technician-only-view rejects outsiders", () => {
    expect(canTechnicianViewVisit(lead, visit)).toBe(true);
    expect(canTechnicianViewVisit(collab, visit)).toBe(true);
    expect(canTechnicianViewVisit(otherTech, visit)).toBe(false);
  });
  it("office staff can view any visit", () => {
    expect(canViewVisit(officeStaff, visit)).toBe(true);
    expect(canViewVisit(officeManager, visit)).toBe(true);
  });
});
