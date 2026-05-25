# SPEC — Seoul Aqua Service Operation Management System (SOMS)

**Version:** v0.1 (Bootstrap draft, 2026-05-25)
**Status:** Awaiting client answers (see `docs/QUESTIONS.docx`); sections marked `[TBC]` are blocked on specific question IDs.

> Read this document FIRST when joining the project. Then read `docs/PROJECT_PLAN.md` for the phased delivery roadmap.

---

## 1. Project Overview

### 1.1 Client

**CÔNG TY TNHH MTV TM&DV ĐẠI Á** — operating brand **Seoul Aqua (서울 아쿠아)**. Vietnam-based, head office at Số 47 Hoàng Trọng Mậu, P. Tân Hưng, TP. Hồ Chí Minh. Sells / rents / maintains household water-treatment and air-quality products.

### 1.2 What we're building

A **customer-centric service operation management system** replacing the current per-device spreadsheet workflow. It covers the full lifecycle a Seoul Aqua product goes through with a customer:

1. **Sale or rental contract** signed
2. **Device installation** by a field technician
3. **Periodic maintenance visits** (monthly or every 2 months) for filter/consumable replacement
4. **Ad-hoc service** (repair, relocation, paid parts replacement)
5. **Payments collected** (cash at visit, bank transfer, or B2B tax invoice)
6. **Contract end** — for rentals, ownership transfers to customer + optional maintenance contract

### 1.3 Why now

The current operation manages **per device** rather than per customer. A B2B site with 50 air purifiers is 50 separate spreadsheet rows; the same customer's name is searched 50 times; filter-change dates are updated 50 times after one visit. Three concrete pains drove this project (cited from `reference/process/회사 운영 프로세스 종합 정리.pdf`):

- Same customer must be searched, updated, and printed-for 10+ times for a 10-device site
- Visit confirmation requires per-device data entry, taking ~50 % of a technician's office time
- Filter-due alerts are computed manually by scrolling a spreadsheet

The intended outcome is **one customer search → see everything → bulk update**.

### 1.4 Success criteria (v1)

| Outcome | Measure |
|---|---|
| Customer lookup time | < 5 sec to find any customer and see all their devices, contracts, payments, filter-change schedule |
| Visit-completion data entry | < 30 sec per visit (down from current ~3 min × N devices) |
| Filter-due alerts | Automatic, no manual scrolling |
| Cash-handover audit | 100 % of cash-collected payments traceable from "technician collected" → "office received" → "matched to contract installment" |
| Document delivery | Every contract & receipt printable from the system; signed copies tracked back to office (next-day handoff or postal) |
| Mobile usability | A field technician can complete a maintenance visit + collect payment + log filter change + capture signature on a phone in < 2 minutes |
| Multi-language | Office staff can switch ko ↔ vi ↔ en on any screen without losing state |

### 1.5 What this is NOT (v1 out of scope)

- **Vietnamese e-invoice integration** (Viettel SInvoice / MISA / VNPT eHoadon) — v1 lets staff upload an externally-generated PDF e-invoice; direct integration is Phase 7+
- **Marketing automation / CRM lead funnel** — Phase 8+
- **Route optimization with maps** — v1 has region grouping; map-based routing is Phase 4+ (a Question item asks whether to use Google Maps or Goong Maps)
- **Multi-warehouse inventory + MRP** — v1 has a single warehouse with a simple stock counter
- **Accounting system integration** (QuickBooks / MISA Accounting / etc.) — explicitly out of scope; the system exports CSVs that the accounting team imports
- **Customer self-service portal** — Phase 8+ (the design system, role model, and API conventions are built with a future Customer role in mind, but no portal ships in v1)

---

## 2. Stakeholders & Users

| Group | Size | Primary device | Daily use |
|---|---|---|---|
| Management (Director / CEO) | 1–2 | Desktop | Read reports, sign contracts, approve refunds |
| Office staff — Operations / Sales | ~5 | Desktop | Customer search, contract creation, visit scheduling, document handoff, payment matching |
| Office staff — Accounting | ~3 | Desktop | Payment reconciliation, B2B invoice issuance + tracking, monthly close |
| Field technicians | up to 80 | **Phone** | Today's visit roster, filter-change logging, photo + signature capture, cash collection, mark visit complete |
| (Future) Customers — B2C | hundreds | Phone | View own contracts, request a visit, see payment history |
| (Future) Customers — B2B | dozens | Desktop | Download invoices, view service history per device |

### 2.1 Initial role model

| Role | Permissions (high-level) |
|---|---|
| `ADMIN` | Full system access; user management; system settings |
| `OFFICE_MANAGER` | Full customer + contract + visit + payment access; no user management |
| `SALES` | Customer + contract create / edit; read-only on visits and payments |
| `TECHNICIAN` | Read-own assigned visits; complete-visit; log filter change; capture signature + photo; collect payment for own visits |
| `ACCOUNTANT` | Read-all visits + customers; full payment access; export to accounting |
| `CUSTOMER` (future, Phase 8+) | Own contracts, own visit history, own payments |

The exact permission matrix is `[TBC — Q11]` (questions section C of `QUESTIONS.docx`).

---

## 3. Customer Model

### 3.1 Customer-type discriminator

Every Customer is one of:

- **B2C** (`type = 'B2C'`) — 가정집 / Hộ gia đình / Individual or household
- **B2B** (`type = 'B2B'`) — 회사 / Doanh nghiệp / Company

### 3.2 Customer code

Format: **`KH#####`** (KH prefix + zero-padded 5-digit sequence, e.g. `KH00001`).

- Sequence is **system-assigned** at customer-create time, monotonically increasing
- Existing CSV uses a separate sequential management number (e.g., `8918`) — kept as a **legacy reference column** (`legacyCode`) but not used as primary key. Migration script generates `KH#####` for every imported customer. `[TBC — Q1]`
- Customer code never recycled even if customer deactivated

### 3.3 Customer fields

Inferred from `reference/data/고객관리대장-26-05-21.csv`:

| Field | Required | Notes |
|---|---|---|
| `code` (KH#####) | system | Auto-generated |
| `legacyCode` | optional | Previous management number from spreadsheet |
| `type` | yes | B2C / B2B |
| `name` | yes | Person name (B2C) or company name (B2B) |
| `displayName` | optional | Friendly name / nickname |
| `taxCode` | optional | B2B only — Vietnamese MST |
| `phone1` / `phone2` | one required | Phone number (Vietnamese / international) |
| `email` | optional | For (future) e-receipt / portal access |
| `addressFull` | yes | Full installation address — drives technician routing |
| `district` / `city` | optional | Parsed from `addressFull` for region grouping |
| `salesRep` | optional | Office staff who closed the deal — for reporting attribution |
| `referredBy` | optional | "고객 소개처" — referral source for analytics |
| `notes` | optional | Free-form |
| `isActive` | yes | Default `true`; deactivate doesn't delete |
| `createdAt` / `updatedAt` | system | |
| `createdBy` / `updatedBy` | system | User-id of office staff who created/last-edited |

### 3.4 Customer-Equipment relationship

A Customer can have many Equipment installations. Each Equipment is identified by `{customerCode}-{seq}` (e.g. `KH00001-1`, `KH00001-2`). When a Customer has 5 devices, equipment codes auto-generate `KH00001-1` through `KH00001-5`. Removed devices' codes are **not reused**; sequence keeps incrementing.

---

## 4. Equipment Model

### 4.1 Two distinct concepts

- **`EquipmentModel`** (catalog) — a product the company sells/rents. e.g., model `PTS-2100` (water purifier), model `SA-J430` (bidet seat). Master data; one row per model.
- **`Equipment`** (installation) — a specific device installed at a specific customer's address. e.g., `KH00001-1` is "the water purifier (model PTS-2100) installed at Mr. Kim's kitchen on 2025-03-03". One row per installation.

### 4.2 EquipmentModel fields

Inferred from `reference/data/정수기등록-26-05-21.csv`:

| Field | Notes |
|---|---|
| `modelCode` | e.g. `PTS-2100` — primary identifier |
| `category` | 정수기 / 비데 / 공기청정기 / 샤워기 / 기타 (enum) |
| `displayName` | Customer-facing product name |
| `manufacturer` | optional |
| `description` | optional |
| `defaultRentPrice` | VND/month — typical rental price; can be overridden per contract |
| `defaultSalePrice` | VND — typical sale price |
| `isActive` | true / false |
| `compatibleParts` | many-to-many → `Part` (filter compatibility — data coming from client) `[TBC — Q4]` |

### 4.3 Equipment fields

| Field | Notes |
|---|---|
| `code` | `KH00001-1` — auto-generated |
| `customerId` | FK → Customer |
| `modelId` | FK → EquipmentModel |
| `serialNumber` | optional, on the device |
| `installLocation` | "주방", "안방", "회사 1층 휴게실" — free-text room/area within the customer's address |
| `installedAt` | date |
| `installedBy` | FK → User (technician) |
| `contractId` | FK → Contract (the sale or rental that put this device here) |
| `status` | `ACTIVE` / `RELOCATED` / `RETIRED` / `RETURNED` |
| `currentFilters` | derived view: which filters are due, last-replaced when, due in N days |

---

## 5. Contract Model

### 5.1 Contract types

| Type | Code | Description |
|---|---|---|
| Sale | `SALE` | Outright purchase. Customer owns immediately. No periodic visit unless they sign a separate maintenance contract. |
| Rental | `RENTAL` | 36-month standard term. Includes monthly or bi-monthly periodic visits + free filter changes. Ownership transfers to customer at end of term. Mandatory-use period: 24 months (early termination fee = 50 % of remaining months × monthly fee). |
| Maintenance | `MAINTENANCE` | Post-rental conversion OR sale customer requests it OR third-party device. Periodic visit + filter replacement, billed monthly. |

> Note: Rental contracts have an **auto-renewal-as-maintenance** clause per §9 of `가정집 임대 계약서.pdf` — if neither party terminates 1 month before contract end, it converts to a Maintenance contract at the existing fee.

### 5.2 Contract fields

| Field | Notes |
|---|---|
| `code` | e.g. `HD-2026-00001` (format `[TBC — Q6]`) |
| `customerId` | FK |
| `type` | `SALE` / `RENTAL` / `MAINTENANCE` |
| `startDate` | Installation date (rental term clock starts here) |
| `endDate` | Computed: `startDate + termMonths` (typically 36 for rental); recalculated dynamically based on **actually-paid installment count**, not calendar (per §5-4 of the process PDF) |
| `termMonths` | 36 for standard rental; null for sale |
| `mandatoryMonths` | 24 for rental |
| `monthlyFee` | VND — for rental + maintenance |
| `totalSalePrice` | VND — for sale |
| `depositAmount` | VND — usually 0 in practice |
| `signedAt` | When customer signed |
| `signedBy` | Customer signer name |
| `paidInstallments` | Count of installments actually collected (drives `endDate` recompute) |
| `status` | `DRAFT` / `ACTIVE` / `OVERDUE` / `COMPLETED` / `TERMINATED_EARLY` |
| `terminationReason` | optional |
| `documentPdfPath` | reference to the signed contract PDF stored in S3 |

### 5.3 Contract-Equipment relationship

One Contract → many Equipment (a single rental contract can cover multiple devices installed at the same address; example: a B2B contract for 64 water purifiers across one office building — `정기 점검 확인서` shows this is normal).

---

## 6. Visit & Schedule Model

### 6.1 Visit types

| Type | Trigger | Frequency |
|---|---|---|
| `INSTALLATION` | New contract activated | One-off |
| `PERIODIC` | Contract schedule | Monthly or every-2-months per contract |
| `REPAIR` | Customer call | Ad-hoc |
| `RELOCATION` | Customer move | Ad-hoc, paid |
| `RETRIEVAL` | Contract end (rental returned) | One-off |
| `OTHER` | (e.g. customer-requested extra inspection) | Ad-hoc |

### 6.2 Visit fields

| Field | Notes |
|---|---|
| `id` | UUID |
| `customerId` | FK |
| `type` | enum above |
| `scheduledDate` | date — appointment day |
| `scheduledTimeWindow` | e.g. "09:00-11:00" or "오전" / "오후" (B2C requires specific time, B2B usually doesn't) |
| `assignedTechnicianIds` | array of FK → User (multi-technician parallel work for big sites) |
| `equipmentIds` | array — which devices are covered by this visit (a visit can touch some but not all of a customer's devices) |
| `status` | `SCHEDULED` / `CONFIRMED` / `IN_PROGRESS` / `COMPLETED` / `RESCHEDULED` / `CANCELLED` / `CUSTOMER_NO_SHOW` / `NEEDS_REVISIT` |
| `completedAt` | timestamp |
| `notes` | technician's free-form notes after visit |
| `signatureCustomerPath` | S3 — customer signature image (tablet or photo of paper) |
| `signatureTechnicianPath` | S3 — technician signature |
| `attachedPhotos` | array S3 paths — before/after, parts replaced |
| `paymentCollected` | FK → Payment (if cash collected on this visit) |
| `rescheduledFromVisitId` | FK self-ref — chain to previous visit if rescheduled |
| `rescheduleReason` | enum: customer-requested / technician-unavailable / weather / customer-absent / other |

### 6.3 Schedule mechanics

- **Daily roster:** each technician sees "today's visits" (a list with addresses, time windows, customer names, devices to service) — mobile-first screen.
- **Reschedule flow** (very common per `프로세스 질의와 응답.pdf`): customer calls → office staff updates `scheduledDate`, status → `RESCHEDULED`, new visit row auto-created and linked via `rescheduledFromVisitId`.
- **Multi-day big sites:** for a B2B site with 64 devices, one logical "service job" can span multiple days. v1 implementation: one Visit per day-of-work, all linked by `parentJobId` (TBD field). Progress tracked as `12 / 64 devices completed`.
- **Multi-technician parallel:** for a site needing 2 technicians on the same day, `assignedTechnicianIds` is an array — each technician sees the visit on their roster, with `partition` info ("Tech 1: floors 1–3", "Tech 2: floors 4–5"). `[TBC — Q8]`

### 6.4 Schedule UI (v1)

- Office staff: weekly calendar view by technician (Mon–Sun × techs grid), drag to reschedule
- Technician: phone roster — "tomorrow", "today", "overdue" tabs
- Map view: deferred to Phase 4+ pending decision on map provider (`[TBC — Q10]`)

---

## 7. Payment Model

### 7.1 Payment methods

| Method | Code | Flow |
|---|---|---|
| Cash collected at visit | `CASH_AT_VISIT` | Technician collects → marks visit completed with payment → office receives cash next business day → marks `officeReceivedAt` |
| Bank transfer | `BANK_TRANSFER` | Customer transfers to company account; office matches against pending installments |
| B2B tax invoice (e-invoice) | `B2B_EINVOICE` | Office issues e-invoice (Vietnamese hóa đơn điện tử) via external system, uploads PDF; customer pays via bank transfer; reconciled like `BANK_TRANSFER` |
| B2B non-invoice (some customers don't need invoice) | `B2B_NO_INVOICE` | Same as bank transfer flow, just no invoice PDF |

### 7.2 Payment fields

| Field | Notes |
|---|---|
| `id` | UUID |
| `customerId` | FK |
| `contractId` | FK — which contract this payment applies to |
| `installmentNumber` | which monthly installment this covers (drives contract `endDate` recompute) |
| `coveredMonth` | YYYY-MM — accounting period this installment is for |
| `amount` | VND |
| `method` | enum above |
| `status` | `PENDING` / `RECEIVED` / `RECONCILED` / `BOUNCED` / `WAIVED` |
| `collectedAt` | when technician took the cash (CASH_AT_VISIT) or customer transfer cleared (BANK_TRANSFER) |
| `collectedByUserId` | technician (CASH_AT_VISIT) or office staff who matched the transfer |
| `officeReceivedAt` | when office actually got the cash (CASH_AT_VISIT only) |
| `visitId` | optional FK if collected on a visit |
| `invoicePdfPath` | S3 — uploaded e-invoice |
| `transferReference` | bank reference for matching |
| `notes` | reconciliation notes |

### 7.3 Special-case rules (from process PDF §5-4)

- **Visit-deferred = invoice-deferred.** If the May visit slips to June, May's installment is collected at the June visit. Two installments can be collected at one visit (`paymentsAtVisitId` is an array).
- **Contract end date is computed from actually-collected installments, not calendar.** A 36-month rental where 4 installments were skipped runs 40 calendar months.

---

## 8. Document Workflow

10 paper-form templates exist today (see `docs/DOCUMENT_TEMPLATES.md`). For v1, each form is:

1. **Server-rendered as PDF** from contract/visit data
2. **Sent to technician's phone** at visit time (download or in-browser preview)
3. **Signed by customer** — either on tablet (e-signature) or on paper (photo upload). v1 defaults to photo-of-paper; tablet e-sig is a Phase 7 polish. `[TBC — Q14]`
4. **Returned to office** — B2C via next-day handoff by technician, B2B sometimes by post (especially contract originals). Document tracking: `physicalReceivedAt` timestamp marked by office when paper arrives.
5. **Archived** in S3 with the signed image attached

The system can answer "have we received the signed original for contract HD-2026-00123?" instantly.

---

## 9. Notifications

### 9.1 Channels (v1)

- **In-app** — bell notification for office staff (new visit, customer call, payment received, etc.). Carry forward PMIS notification shell.
- **SMS** — outbound only, to customers, for visit reminders ("기사가 내일 10시에 방문 예정입니다"). Vietnamese SMS provider TBD. `[TBC — Q17]`
- **Email** — to B2B customers for invoice delivery. Vietnamese email provider TBD (likely `vhost.vn` Email Relay or SendGrid). `[TBC — Q18]`

### 9.2 Out of scope (v1)

- Push notifications to customer phones (no app yet)
- WhatsApp / Zalo integration (Phase 8+)
- Marketing email campaigns (Phase 8+)

---

## 10. i18n & UX

- **Languages:** Korean, Vietnamese, English. Switchable on **any screen** via the existing `LocaleSwitcher` (carried from PMIS).
- **Default per device:** browser-language detection on first visit; remembered per user thereafter.
- **Date format:** ISO `YYYY-MM-DD` in DB; UI shows VST (Asia/Ho_Chi_Minh, UTC+7) with locale-aware formatting via `Intl.DateTimeFormat`.
- **Currency:** VND in all displays. Round to whole đồng (no decimals).
- **Phone:** Vietnamese numbers default `(+84) NNN NNN NNNN`; the legacy CSV has many already-formatted numbers — import script normalizes.
- **Numerals:** tabular nums everywhere; thousand separator per locale (KR: `,`, VI: `.`, EN: `,`).

### 10.1 Mobile vs desktop split

- **Mobile-first screens** (technician daily use): visit roster, visit-completion form, payment collection, signature capture, photo upload, filter-change log
- **Desktop-first screens** (office daily use): customer list w/ filters, contract creation wizard, payment reconciliation, scheduling calendar, reports, admin

Both responsive; the priorities just inform which breakpoint gets the polish.

---

## 11. Non-Functional Requirements

| Requirement | Target |
|---|---|
| **Concurrent users (steady)** | ~10 office staff + ~30 technicians simultaneously typing into visits at end-of-day. Spikes to ~50 unique concurrent. |
| **Database size (year 1)** | Customers ~10K, Equipment ~30K, Visits ~150K (assuming 80 techs × 5 visits/day × 365), Payments ~150K. Conservatively < 5 GB. |
| **Storage (uploads, year 1)** | Photos (visits): 80 techs × 5 visits/day × 2 photos × 200 KB × 365 = ~117 GB/year. Signed-paper photos: similar. Use lifecycle: hot 3 months → archive 12 months → backup. |
| **Hosting** | Vercel (Next.js) + Supabase (Postgres) initially. vhost.vn migration deferred. `[TBC — Q24]` |
| **Region** | HCMC primary. Vietnamese Personal Data Protection law applies — data residency `[TBC — Q23]` |
| **Backup** | Supabase auto-backup (daily, 7-day retention). Plus weekly `pg_dump` archived to object storage. |
| **Uptime target** | 99 % during business hours (Mon–Sat 08:00–18:00 VST). Acceptable downtime: <2 h scheduled maintenance per month, off-hours. |
| **PII handling** | Customer phone + address encrypted at rest (Postgres TDE / column-level encryption to be evaluated in Phase 1) |
| **Audit log retention** | 24 months minimum (Vietnamese legal best practice) |
| **Mobile offline tolerance** | Visit-completion form can be filled offline and synced when network returns. v1 implementation: localStorage queue + sync-on-reconnect. `[TBC — Q12]` |

---

## 12. Open Questions

The full list with rationale is in `docs/QUESTIONS.docx` (real Word file for client) and `docs/QUESTIONS.md` (markdown twin for git diff). Summary:

| Section | Count | Theme |
|---|---|---|
| A | 5 | Customer & equipment coding (legacy code migration, KH prefix, equipment retirement, multi-location B2B) |
| B | 5 | Contract & lifecycle (sale-to-rental conversion, post-36-month ownership, auto-renewal, contract amendments) |
| C | 5 | Visit, schedule, technician operations (assignment algorithm, territories, mobile-app preference, offline) |
| D | 5 | Payments & invoicing (Vietnamese e-invoice vendor, cash audit trail, partial payments, currency, non-invoice B2B) |
| E | 3 | Documents & signatures (tablet e-sig vs photo, retention period, paper disposal) |
| F | 3 | Notifications & customer touch (SMS provider, email language priority, opt-out) |
| G | 3 | Customer portal (timing, B2C vs B2B differences, payment on portal) |
| H | 3 | Hosting & compliance (data residency, audit retention, backup window) |
| I | 2 | Logo & branding (vector file, exact hex confirmation) |
| J | 3 | Operational data migration (cutover plan, dedup, validator) |

**Cross-references:** every `[TBC — QN]` tag in this SPEC points to the question with that ID in `QUESTIONS.docx`.

---

## 13. Glossary

See `.claude/CLAUDE.md` § "Domain Vocabulary" for the canonical KR / VI / EN term table.

---

## Change log

- **2026-05-25** — v0.1 initial draft. Based on `reference/process/회사 운영 프로세스 종합 정리.pdf` + `프로세스 질의와 응답.pdf` + the 7 CSV samples + 10 form templates. All sections marked `[TBC]` await client answers to the corresponding `QUESTIONS.docx` items.
