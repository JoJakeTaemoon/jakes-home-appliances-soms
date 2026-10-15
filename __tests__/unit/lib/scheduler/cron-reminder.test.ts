/**
 * D-1 visit reminder (UC-VS-10).
 *
 * The job runs once a day (16:00 VST — systemd timer + vercel.json), so it
 * must cover the whole of tomorrow on the Vietnamese calendar, not a window
 * relative to the run time. Pins:
 *   - every SCHEDULED visit from VST 00:00 to 24:00 tomorrow is reminded;
 *     today and the day after are not.
 *   - a second run the same day sends nothing new, even when one contact has
 *     several visits tomorrow.
 *   - a visit moved to a new slot is reminded again for that slot.
 *   - recipient order: site primary OPS → customer primary OPS → any OPS →
 *     CONTRACT_PARTY.
 *
 * Prisma is mocked with a tiny in-memory store; `findFirst` understands only
 * the filter keys the job is expected to use and throws on anything else so
 * a query change can't silently match everything.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    visit: { findMany: vi.fn() },
    customer: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    notificationLog: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/notifications/send", () => ({
  sendNotification: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";
import { runVisitReminderD1 } from "@/lib/scheduler/cron-reminder";

const mockedPrisma = vi.mocked(prisma, true);
const mockedSend = vi.mocked(sendNotification);

interface VisitRow {
  id: string;
  customerId: string;
  siteId: string | null;
  leadTechnicianId: string | null;
  scheduledFor: Date;
  state: string;
  type: string;
  equipment: null;
}

interface LogRow {
  templateCode: string;
  contactId: string;
  status: string;
  payload: { vars: Record<string, string> };
}

let visits: VisitRow[] = [];
let logs: LogRow[] = [];

type Contact = {
  id: string;
  role: "OPS_CONTACT" | "CONTRACT_PARTY";
  scope: "CUSTOMER" | "SITE";
  siteId: string | null;
  isPrimary: boolean;
  language: "ko" | "vi" | "en";
};
let contacts: Contact[] = [];

function visit(id: string, scheduledFor: string, over: Partial<VisitRow> = {}): VisitRow {
  return {
    id,
    customerId: "cust-1",
    siteId: null,
    leadTechnicianId: null,
    scheduledFor: new Date(scheduledFor),
    state: "SCHEDULED",
    type: "PERIODIC_INSPECTION",
    equipment: null,
    ...over,
  };
}

function inRange(d: Date, range: Record<string, Date>): boolean {
  for (const [op, bound] of Object.entries(range)) {
    if (op === "gte" && !(d >= bound)) return false;
    else if (op === "gt" && !(d > bound)) return false;
    else if (op === "lt" && !(d < bound)) return false;
    else if (op === "lte" && !(d <= bound)) return false;
    else if (!["gte", "gt", "lt", "lte"].includes(op))
      throw new Error(`unsupported range op ${op}`);
  }
  return true;
}

function atPath(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

function matchesLog(log: LogRow, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "AND") {
      if (!(cond as Record<string, unknown>[]).every((c) => matchesLog(log, c)))
        return false;
    } else if (key === "templateCode" || key === "contactId") {
      if (log[key] !== cond) return false;
    } else if (key === "status") {
      if (!(cond as { in: string[] }).in.includes(log.status)) return false;
    } else if (key === "payload") {
      const { path, equals } = cond as { path: string[]; equals: unknown };
      if (atPath(log.payload, path) !== equals) return false;
    } else {
      throw new Error(`unsupported notificationLog filter ${key}`);
    }
  }
  return true;
}

beforeEach(() => {
  vi.clearAllMocks();
  visits = [];
  logs = [];
  contacts = [
    { id: "cp", role: "CONTRACT_PARTY", scope: "CUSTOMER", siteId: null, isPrimary: false, language: "vi" },
    { id: "ops", role: "OPS_CONTACT", scope: "CUSTOMER", siteId: null, isPrimary: true, language: "vi" },
  ];

  mockedPrisma.visit.findMany.mockImplementation((async (args: {
    where: { state: string; scheduledFor: Record<string, Date> };
  }) =>
    visits.filter(
      (v) =>
        v.state === args.where.state &&
        inRange(v.scheduledFor, args.where.scheduledFor),
    )) as never);

  mockedPrisma.customer.findUnique.mockImplementation((async () => ({
    name: "Nguyen Van A",
    contacts,
  })) as never);
  mockedPrisma.user.findUnique.mockResolvedValue(null);

  mockedPrisma.notificationLog.findFirst.mockImplementation((async (args: {
    where: Record<string, unknown>;
  }) => {
    // newest first, like `orderBy: { createdAt: "desc" }`
    const hit = [...logs].reverse().find((l) => matchesLog(l, args.where));
    return hit ? { id: "log", payload: hit.payload } : null;
  }) as never);

  mockedSend.mockImplementation(async (input) => {
    logs.push({
      templateCode: input.templateCode,
      contactId: input.customerContactId ?? "",
      status: "MOCKED",
      payload: { vars: { ...(input.vars ?? {}) } },
    });
    return [{ notificationLogId: `log-${logs.length}`, status: "MOCKED" }];
  });
});

const remindedVisitIds = () =>
  mockedSend.mock.calls.map((c) => c[0].vars?.visit_id);

// 2026-10-15 16:00 VST — the scheduled run.
const RUN_16H = new Date("2026-10-15T09:00:00Z");

describe("runVisitReminderD1 — window is all of tomorrow (VST)", () => {
  it("reminds 08:00, 15:30 and 21:00 visits tomorrow, not today or the day after", async () => {
    visits = [
      visit("tomorrow-0800", "2026-10-16T01:00:00Z"),
      visit("tomorrow-1530", "2026-10-16T08:30:00Z"),
      visit("tomorrow-2100", "2026-10-16T14:00:00Z"),
      visit("today-1800", "2026-10-15T11:00:00Z"),
      visit("dayafter-0800", "2026-10-17T01:00:00Z"),
    ];

    const r = await runVisitReminderD1(RUN_16H);

    expect(remindedVisitIds().sort()).toEqual([
      "tomorrow-0800",
      "tomorrow-1530",
      "tomorrow-2100",
    ]);
    expect(r).toMatchObject({ candidates: 3, sent: 3, failed: 0 });
  });

  it("treats VST midnight as the day boundary (00:00 tomorrow in, 00:00 the day after out)", async () => {
    visits = [
      visit("tomorrow-0000", "2026-10-15T17:00:00Z"), // 16 Oct 00:00 VST
      visit("tomorrow-2359", "2026-10-16T16:59:00Z"), // 16 Oct 23:59 VST
      visit("today-2359", "2026-10-15T16:59:00Z"), // 15 Oct 23:59 VST
      visit("dayafter-0000", "2026-10-16T17:00:00Z"), // 17 Oct 00:00 VST
    ];

    await runVisitReminderD1(RUN_16H);

    expect(remindedVisitIds().sort()).toEqual(["tomorrow-0000", "tomorrow-2359"]);
  });

  it("derives 'tomorrow' from the VST date, not the UTC date", async () => {
    visits = [
      visit("oct16-1000", "2026-10-16T03:00:00Z"),
      visit("oct17-1000", "2026-10-17T03:00:00Z"),
    ];

    // 00:30 VST on 16 Oct is still 15 Oct in UTC — tomorrow is 17 Oct.
    await runVisitReminderD1(new Date("2026-10-15T17:30:00Z"));

    expect(remindedVisitIds()).toEqual(["oct17-1000"]);
  });

  it("ignores visits that are not SCHEDULED", async () => {
    visits = [visit("cancelled", "2026-10-16T03:00:00Z", { state: "CANCELLED" })];
    const r = await runVisitReminderD1(RUN_16H);
    expect(r.candidates).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
  });
});

describe("runVisitReminderD1 — idempotency", () => {
  it("a second run the same day sends nothing new, even with several visits for one contact", async () => {
    visits = [
      visit("a", "2026-10-16T01:00:00Z"),
      visit("b", "2026-10-16T05:00:00Z"),
      visit("c", "2026-10-16T09:00:00Z"),
    ];

    await runVisitReminderD1(RUN_16H);
    expect(mockedSend).toHaveBeenCalledTimes(3);

    const second = await runVisitReminderD1(new Date("2026-10-15T12:00:00Z"));
    expect(mockedSend).toHaveBeenCalledTimes(3);
    expect(second).toMatchObject({ candidates: 3, sent: 0, skipped: 3 });
  });

  it("re-reminds a visit that was moved to a new slot", async () => {
    const v = visit("moved", "2026-10-16T01:00:00Z");
    visits = [v];
    await runVisitReminderD1(RUN_16H);
    expect(mockedSend).toHaveBeenCalledTimes(1);

    // Rescheduled to the following day: reminded again the day before.
    v.scheduledFor = new Date("2026-10-17T03:00:00Z");
    await runVisitReminderD1(new Date("2026-10-16T09:00:00Z"));
    expect(mockedSend).toHaveBeenCalledTimes(2);

    // Moved to another time on the same day after today's run — the
    // customer holds the wrong time, so it goes out again.
    v.scheduledFor = new Date("2026-10-17T08:00:00Z");
    await runVisitReminderD1(new Date("2026-10-16T10:00:00Z"));
    expect(mockedSend).toHaveBeenCalledTimes(3);

    // …and is not repeated on yet another run.
    await runVisitReminderD1(new Date("2026-10-16T11:00:00Z"));
    expect(mockedSend).toHaveBeenCalledTimes(3);
  });

  it("does not count FAILED sends as reminded", async () => {
    visits = [visit("v", "2026-10-16T01:00:00Z")];
    mockedSend.mockImplementationOnce(async (input) => {
      logs.push({
        templateCode: input.templateCode,
        contactId: input.customerContactId ?? "",
        status: "FAILED",
        payload: { vars: { ...(input.vars ?? {}) } },
      });
      return [{ notificationLogId: "f", status: "FAILED" }];
    });

    const first = await runVisitReminderD1(RUN_16H);
    expect(first.failed).toBe(1);
    await runVisitReminderD1(new Date("2026-10-15T12:00:00Z"));
    expect(mockedSend).toHaveBeenCalledTimes(2);
  });
});

describe("runVisitReminderD1 — recipient order", () => {
  const sentTo = () => mockedSend.mock.calls[0][0].customerContactId;

  it("prefers the site's primary OPS over the customer's", async () => {
    contacts.push({ id: "site-ops", role: "OPS_CONTACT", scope: "SITE", siteId: "site-1", isPrimary: true, language: "en" });
    visits = [visit("v", "2026-10-16T01:00:00Z", { siteId: "site-1" })];
    await runVisitReminderD1(RUN_16H);
    expect(sentTo()).toBe("site-ops");
  });

  it("uses the customer's primary OPS when the site has none", async () => {
    visits = [visit("v", "2026-10-16T01:00:00Z", { siteId: "site-1" })];
    await runVisitReminderD1(RUN_16H);
    expect(sentTo()).toBe("ops");
  });

  it("falls back to any OPS, then the contract party", async () => {
    contacts = [
      { id: "cp", role: "CONTRACT_PARTY", scope: "CUSTOMER", siteId: null, isPrimary: false, language: "vi" },
      { id: "ops-2", role: "OPS_CONTACT", scope: "CUSTOMER", siteId: null, isPrimary: false, language: "vi" },
    ];
    visits = [visit("v", "2026-10-16T01:00:00Z")];
    await runVisitReminderD1(RUN_16H);
    expect(sentTo()).toBe("ops-2");

    mockedSend.mockClear();
    logs = [];
    contacts = [contacts[0]];
    await runVisitReminderD1(RUN_16H);
    expect(sentTo()).toBe("cp");
  });
});
