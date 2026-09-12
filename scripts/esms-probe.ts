/**
 * eSMS template probe.
 *
 * Sends SMS templates to a phone number through the normal notification path
 * (`sendNotification()` → provider factory), so every attempt lands in
 * `NotificationLog` and shows up at /o/admin/notification-logs exactly like a
 * production send. That is how we find out which CSKH bodies ViHAT has
 * registered for brandname `SEOUL AQUA`: `CodeResult 146` means that body
 * still needs registering, `104` means the brandname, `101` the credentials.
 *
 * Defaults to sandbox: eSMS validates the request but delivers nothing and
 * charges nothing (those rows log as MOCKED).
 *
 * Registration is per body text, so each language of a template is a separate
 * question for the carrier: `SMS_VISIT_REMINDER` can be accepted in Vietnamese
 * and refused in Korean. The probe therefore walks template × locale and
 * reports each pair on its own line.
 *
 *   npx tsx scripts/esms-probe.ts 0901888484                     # sandbox, every template × ko/vi/en
 *   npx tsx scripts/esms-probe.ts 0901888484 SMS_VISIT_REMINDER  # one template, all locales
 *   npx tsx scripts/esms-probe.ts 0901888484 SMS_VISIT_REMINDER vi
 *   ESMS_PROBE_LIVE=1 npx tsx scripts/esms-probe.ts 0901888484
 *   ESMS_PROBE_OUT=/tmp/probe.json ESMS_PROBE_LIVE=1 npx tsx scripts/esms-probe.ts 0901888484
 *
 * A live run delivers real messages and is billed per accepted segment, so
 * pass a number you own. Refused bodies are never accepted and not billed.
 */

import { config as loadDotenv } from "dotenv";

loadDotenv();

// Must be set before the provider factory and adapter read them.
process.env.SMS_PROVIDER = "esms";
process.env.ESMS_SANDBOX = process.env.ESMS_PROBE_LIVE === "1" ? "0" : "1";

// App modules are imported dynamically inside main(): a static import is
// hoisted above `loadDotenv()`, and `src/lib/prisma.ts` reads DATABASE_URL at
// module scope, so it would initialise against an empty connection string.

const phone = process.argv[2];
const onlyCode = process.argv[3];
const onlyLocale = process.argv[4] as "ko" | "vi" | "en" | undefined;
const LOCALES = ["ko", "vi", "en"] as const;

if (!phone) {
  console.error(
    "Usage: npx tsx scripts/esms-probe.ts <phone> [TEMPLATE_CODE] [ko|vi|en]",
  );
  process.exit(1);
}

/**
 * Tomorrow at the current wall-clock minute, VST. Varying this per run keeps
 * each probe body unique: the adapter derives its eSMS `RequestId` from the
 * rendered text, and eSMS rejects a repeat of the same RequestId inside 24h
 * with CodeResult 124.
 */
function tomorrowVst(offsetMinutes = 0): string {
  const d = new Date(
    Date.now() + 86_400_000 + 7 * 3_600_000 + offsetMinutes * 60_000,
  );
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/**
 * Per-run offset, in minutes, so no two probe runs render the same body.
 *
 * eSMS refuses a repeat of the same RequestId inside 24h with CodeResult 124,
 * and the adapter derives that id from the rendered text. It records the id
 * for SANDBOX requests too, so a sandbox rehearsal otherwise burns the ids the
 * following live run needs. Kept under a day so the sample appointment time
 * stays plausible.
 */
const RUN_ID = Math.floor(Date.now() / 1000) % 100000;
/** The time-shaped slice of the run id, kept under a day. */
const RUN_MINUTES = RUN_ID % 1440;

/**
 * Plausible values for every placeholder the SMS templates use.
 *
 * `seq` separates the sends within one run — notably the Korean and
 * Vietnamese visit reminders, which share one approved body and would
 * otherwise collide with each other.
 */
function varsFor(seq: number): Record<string, string> {
  const n = RUN_ID + seq;
  // Every value that appears in a body has to move between runs, not just the
  // ones that look like identifiers: templates such as the overdue notice
  // carry only a name and an amount, and a fixed pair there collides with
  // yesterday's probe.
  return {
    name: `Nguyen Van A${n}`,
    equipment: "May loc nuoc PTS-2100",
    datetime: tomorrowVst(RUN_MINUTES + seq),
    date: tomorrowVst(RUN_MINUTES + seq).slice(0, 10),
    time: "09:00",
    technician: "Tran B",
    service: "INSPECTION",
    url: "portal.seoulaqua.com.vn",
    pwd: `Ab12Cd${String(n).padStart(5, "0").slice(-5)}`,
    phone,
    code: String(100000 + (n % 900000)).slice(-6),
    minutes: "10",
    req_no: String(10000 + (n % 89999)),
    amount: `${500 + (n % 400)}.000`,
    month: "09/2026",
    reason: "Het thoi han bao hanh",
    days: "7",
  };
}

async function main() {
  const { sendNotification } = await import("../src/lib/notifications/send");
  const { TEMPLATES, pickLocaleBody, renderTemplate } = await import(
    "../src/lib/notifications/templates"
  );
  const fs = await import("node:fs");

  const live = process.env.ESMS_SANDBOX === "0";
  const codes = Object.keys(TEMPLATES)
    .filter((c) => c.startsWith("SMS_"))
    .filter((c) => !onlyCode || c === onlyCode)
    .sort();
  const locales = onlyLocale ? [onlyLocale] : [...LOCALES];

  if (codes.length === 0) {
    console.error(`No SMS template matches "${onlyCode}"`);
    process.exit(1);
  }

  console.log(
    `mode=${live ? "LIVE (billed)" : "SANDBOX"}  phone=${phone}  ` +
      `templates=${codes.length}  locales=${locales.join("/")}\n`,
  );

  const rows: Record<string, unknown>[] = [];
  let seq = 0;

  for (const code of codes) {
    for (const locale of locales) {
      const vars = varsFor(seq++);
      const body = renderTemplate(pickLocaleBody(TEMPLATES[code], locale), vars);
      const [result] = await sendNotification({
        templateCode: code,
        contactOverride: {
          customerId: null,
          contactId: null,
          phone1: phone,
          email: null,
          language: locale,
        },
        vars,
        locale,
        actorType: "SYSTEM",
      });

      const accepted = result?.status === "SENT" || result?.status === "MOCKED";
      const error = result?.errorMessage ?? null;
      const codeResult = error?.match(/CodeResult (\d+)/)?.[1] ?? (accepted ? "100" : "");
      rows.push({
        template: code,
        locale,
        accepted,
        codeResult,
        segments: result?.segmentsUsed ?? null,
        chars: body.length,
        unicode: /[^\x00-\x7F]/.test(body),
        providerMessageId: result?.providerMessageId ?? null,
        error,
        body,
      });

      console.log(
        `${accepted ? "PASS" : "FAIL"}  ${codeResult.padEnd(3)} ` +
          `${locale}  ${code.padEnd(28)} ${String(body.length).padStart(3)}ch ` +
          `${result?.segmentsUsed ?? "-"}seg  ${error ?? ""}`.trimEnd(),
      );
    }
  }

  const pass = rows.filter((r) => r.accepted).length;
  console.log(`\n${pass} accepted / ${rows.length - pass} refused`);

  const out = process.env.ESMS_PROBE_OUT;
  if (out) {
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log(`results → ${out}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
