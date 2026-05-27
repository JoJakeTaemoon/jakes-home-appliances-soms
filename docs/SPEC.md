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
- **Customer marketing site / lead funnel** — Phase 8+ (the design system and API conventions allow future expansion)

**(Note — formerly out of scope, now IN scope as of 2026-05-26)**: a mobile-first **Customer self-service portal** ships in **Phase 3.5**, immediately after contracts go live. See §11 for the portal scope. SMS infrastructure (originally Phase 7) moves to Phase 3.5 as a result.

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

### 2.1 Role model — 3-tier HQ hierarchy + TECHNICIAN + CUSTOMER

Seoul Aqua office is small (~10 people) and operations cross departments daily. The role model is **deliberately flat** — three hierarchical ranks for HQ, one separate field role, one customer role:

| Role | Tier | Scope | Notes |
|---|---|---|---|
| `ADMIN` | HQ rank 3 (highest) | Full system + user management + system settings | Typically 1–2 directors |
| `MANAGER` | HQ rank 2 | All operations + price/contract amendments + tax invoice issuance + customer password reset + accounting close | Typically 2–3 senior staff |
| `STAFF` | HQ rank 1 | Day-to-day ops — customer/contract/equipment CRUD, visit creation/edit, payment entry/match, service-request review, reports view | Office workers; sees ALL menus including sales + accounting (no department gating) |
| `TECHNICIAN` | Parallel (field) | Own assigned visits only — complete visit, log filter change, capture signature/photo, collect payment for own visits | Mobile-first; ~80 in the field; never granted HQ permissions |
| `CUSTOMER` | External (portal) | Own contracts, own visit history, own payments, submit service requests | Implemented via `CustomerContact.role` (`CONTRACT_PARTY` or `OPS_CONTACT`) rather than the staff `Role` enum. Ships in **Phase 3.5**. |

**Hierarchy rule**: `ADMIN > MANAGER > STAFF`. Helpers like `canDoX(role)` resolve by rank. `TECHNICIAN` never inherits HQ rank.

**No department roles** — there is no separate "SALES" or "ACCOUNTANT" role. Every HQ user sees the full menu set (sales, contracts, payments, tax invoices, reports). Sensitive operations are gated by rank, not department.

The full capability matrix is now closed (was Q11 — replaced by this section):

| Capability | ADMIN | MANAGER | STAFF | TECHNICIAN |
|---|---|---|---|---|
| User management / system settings | ● | — | — | — |
| Price change / contract pricing edit | ● | ● | — | — |
| Tax invoice issuance / monthly close | ● | ● | — | — |
| Customer password reset | ● | ● | — | — |
| Service request approval (paid types) | ● | ● | ● | — |
| Customer / contract / equipment CRUD | ● | ● | ● | — |
| Visit create / reschedule | ● | ● | ● | — |
| Payment entry / matching | ● | ● | ● | — |
| Sales menus (visible to all HQ) | ● | ● | ● | — |
| Mobile visit completion + own collection | ● | ● | ● | ● (own only) |
| Audit log read | ● | ● | — | — |
| Audit log export | ● | — | — | — |

---

## 3. Customer Model

### 3.1 Customer-type discriminator

Every Customer is one of:

- **B2C** (`type = 'B2C'`) — 가정집 / Hộ gia đình / Individual or household
- **B2B** (`type = 'B2B'`) — 회사 / Doanh nghiệp / Company

### 3.2 Customer code

Format: **`KH#####`** (KH prefix + zero-padded 5-digit sequence, e.g. `KH00001`).

- Sequence is **system-assigned** at customer-create time, monotonically increasing for new customers
- **Migration policy (A.2 confirmed 2026-05-26)**: legacy management number is **preserved by prepending `KH0` and zero-padding** (e.g., `8918` → `KH08918`). Both `code` (new) and `legacyCode` (old) are stored, but they share the same digits for traceability.
- Customer code never recycled even if customer deactivated

### 3.2.1 Site (sub-customer location)

**NEW 2026-05-26 (client answer A.4 + A.8)**: a Customer can have zero or more Sites (physical sub-locations). Hierarchy: **Customer > Site > Equipment**.

| Property | Required | Notes |
|---|---|---|
| `name` | yes | "본사" / "공장 A" / "R&D Building" |
| `addressFull` | yes | Overrides Customer.addressFull |
| `region` | optional | Used in scheduling region match |
| `phone` | optional | Site-level reception phone |

- **B2C** customers typically have **no Sites** — equipment and contacts attach directly to Customer
- **B2B** customers usually have **1+ Sites** — every Equipment and most OPS_CONTACTs attach to a Site
- Customer can dynamically add/edit/remove Sites as the business changes

### 3.3 Customer fields

### 3.3 Customer fields

Inferred from `reference/data/고객관리대장-26-05-21.csv`:

| Field | Required | Notes |
|---|---|---|
| `code` (KH#####) | system | Auto-generated for new customers; `KH0` + legacyCode for migrated (A.2) |
| `legacyCode` | optional | Previous management number from spreadsheet |
| `type` | yes | B2C / B2B |
| `name` | yes | Person name (B2C) or company name (B2B) |
| `displayName` | optional | Friendly name / nickname |
| `shortcode` | optional (B2B) | 2-5 letter abbreviation used in contract code (e.g. `SHV`) — see §5 (B.2) |
| `taxCode` | optional (required for B2B) | B2B Vietnamese MST. **All B2B require tax invoice (D.5 confirmed 2026-05-26)** |
| `phone1` / `phone2` | one required | Phone number (Vietnamese / international) |
| `email` | optional | For (future) e-receipt / portal access |
| `addressFull` | yes | Full installation address (or HQ address for multi-Site B2B) — drives technician routing |
| `district` / `city` | optional | Parsed from `addressFull` for region grouping |
| `preferredTechnicianId` | optional | (C.2) per-customer preferred tech — soft hint for scheduler |
| `preferredRegion` | optional | (C.2) soft region preference |
| `salesRep` | optional | Office staff who closed the deal — for reporting attribution |
| `referredBy` | optional | "고객 소개처" — referral source for analytics |
| `notes` | optional | Free-form |
| `isActive` | yes | Default `true`; deactivate doesn't delete |
| `createdAt` / `updatedAt` | system | |
| `createdBy` / `updatedBy` | system | User-id of office staff who created/last-edited |

### 3.3.1 Customer contacts — **Contract Party + Operations Contact** (1 + N model)

Every Customer has **one `CONTRACT_PARTY`** (the legal signatory) and **zero or more `OPS_CONTACT`s** (day-to-day workers). The previous "exactly two" model expanded to 1:N for OPS contacts as of 2026-05-26 — a B2B factory may legitimately have an HR contact, an operations contact, and a procurement contact, each with their own phone, language, and portal account.

| Role | Korean | Vietnamese | Used for | Count per Customer |
|---|---|---|---|---|
| `CONTRACT_PARTY` | 계약 주체 (서명자) | Bên ký hợp đồng | Contract signing, tax invoice recipient, legal notice, ownership transfer | **exactly 1** |
| `OPS_CONTACT` | 관리 주체 (운영 컨택트) | Liên hệ vận hành | Visit-scheduling confirm, SMS, day-to-day comms, receipt delivery, portal login for service requests | **0 .. N** |

Each contact carries: `name`, `title`, `phone1`, `phone2`, `email`, `language` (`ko` / `vi` / `en`), `relationship` (free text — e.g., 배우자/HR/비서), `cccdOrPassport` (CONTRACT_PARTY only, for B2C rental contracts), and portal-auth fields (see §3.3.2).

A B2C household where the signer is also the day-to-day contact can have **zero OPS_CONTACTs** — the CONTRACT_PARTY carries both roles. In that case all outbound channels route to the CONTRACT_PARTY's language. As soon as an OPS_CONTACT is added, the routing matrix below applies.

**Site-scoped OPS contacts (A.8, 2026-05-26)**: each `OPS_CONTACT` has a `scope` enum (`CUSTOMER` | `SITE`). A B2B customer with multiple Sites can have one site-specific OPS contact per Site (e.g., the building manager of Plant A) **plus** a customer-level OPS contact (e.g., the corporate facilities manager). When a Visit is scheduled, the Visit's `siteId` selects the appropriate site-scoped contact first, then falls back to customer-scoped OPS, then to CONTRACT_PARTY. **CONTRACT_PARTY is always `scope=CUSTOMER`** (the legal signer is always organization-level).

**Shared phone numbers (A.13, 2026-05-26)**: two CustomerContact rows may share the same `phone1` (e.g., a B2B switchboard used by multiple staff). Both can log into the portal independently. Outbound SMS goes to one or the other based on context (e.g., visit reminder goes to the contact responsible for that Site). No global unique index on `phone1`.

**Language fallback (A.7, 2026-05-26)**: when an `OPS_CONTACT.language` is empty (e.g., migrated from a legacy row without language data), the system falls back to the customer's `CONTRACT_PARTY.language` for all outbound messages. **The previous "Vietnamese default" rule is superseded by Contract Party language fallback.**

**Who can manage contacts?**

| Action | Allowed by |
|---|---|
| Add / edit / delete OPS_CONTACT (per customer) | CONTRACT_PARTY (in portal) + MANAGER + ADMIN (in office app) |
| Edit own OPS_CONTACT profile (name/email/language/phone2) | the OPS_CONTACT themselves |
| Edit CONTRACT_PARTY identity | MANAGER + ADMIN only (legal implication) |
| Reset any contact's portal password | MANAGER + ADMIN |

**Automatic language routing** — the system picks the right contact + language per channel:

| Channel | Default recipient | Language source | Fallback |
|---|---|---|---|
| Contract PDF, signature block, legal notices | CONTRACT_PARTY | CONTRACT_PARTY.language | n/a (legal — required field) |
| Tax invoice (B2B) | CONTRACT_PARTY (via Customer.billingEmail) | CONTRACT_PARTY.language | n/a |
| Visit scheduling / change SMS | first OPS_CONTACT marked `isPrimary` (or only OPS if one) | OPS_CONTACT.language | CONTRACT_PARTY if no OPS exists |
| Periodic-check report, receipt | primary OPS_CONTACT | OPS_CONTACT.language | CONTRACT_PARTY |
| Mobile "call customer" default tap | primary OPS_CONTACT | (voice call) | CONTRACT_PARTY |
| Overdue dunning notice | CONTRACT_PARTY + all OPS_CONTACTs (CC) | each contact's language | — |
| Service-request status update (after they submit) | the submitting contact | submitter.language | — |

Where multiple OPS contacts exist, one is flagged `isPrimary=true` (must be exactly one). Office can toggle which OPS is primary; CONTRACT_PARTY can also toggle from portal.

### 3.3.2 Customer portal access model

Each `CustomerContact` with `portalEnabled=true` is a **portal account** that logs in independently. The portal is a mobile-first PWA at **`portal.seoulaqua.com.vn`** (subdomain confirmed by client A.10, 2026-05-26).

| Field on CustomerContact | Purpose |
|---|---|
| `portalEnabled` | `true` if this contact has a portal login |
| `passwordHash` | bcrypt(initial random or user-set password) |
| `mustChangePassword` | `true` after office reset or initial signup; forces a change-password screen on next login |
| `lastLoginAt` | timestamp |
| `failedLoginCount` | resets on success; triggers lockout per policy (Q F.6) |
| `lockedUntil` | timestamp; `null` if not locked |

**Login identifier** — phone number (`phone1`, Vietnamese-format normalized). Email is an optional alternate.

**Sign-up trigger** — automatic on:
- `Contract.status` → `ACTIVE` (rental / maintenance), or
- `DELIVERY_RECEIPT` finalization (single sale).

For each `CustomerContact` of that Customer with `phone1` set and `portalEnabled=false`, the system:
1. Generates a 10-char random password (alphanumeric, ambiguous chars excluded: 0/O, 1/l/I).
2. Bcrypt-hashes → `passwordHash`. Sets `mustChangePassword=true`, `portalEnabled=true`.
3. Queues `SMS_PORTAL_WELCOME` to `phone1` in the contact's `language` (see `docs/DOCUMENT_TEMPLATES.md` for the catalog).
4. On first login, portal forces password change before any other page renders.

**Office password reset** — Single `Reset password` action on customer-detail per contact (MANAGER+). Generates new random password, sets `mustChangePassword=true`, queues `SMS_PASSWORD_RESET`, writes to audit log. Other active sessions: behavior `[TBC — Q F.5]`.

**Multi-contact with same phone** — if two contacts share `phone1` (e.g., company switchboard), v1 treats them as a single portal account (only one of them gets `portalEnabled=true`; office resolves manually). Long-term handling `[TBC — Q A.13]`.

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
| `siteId` | FK → Site (optional; B2C usually null, B2B usually set — see §3.2.1) |
| `modelId` | FK → EquipmentModel |
| `serialNumber` | optional, on the device |
| `installLocation` | "주방", "안방", "회사 1층 휴게실" — free-text room/area within the customer's address |
| `installedAt` | date |
| `installedBy` | FK → User (technician) |
| `contractId` | FK → Contract (the sale or rental that put this device here) |
| `status` | `ACTIVE` / `RELOCATED` / `DEACTIVATED` / `TERMINATED` / `RETIRED` / `RETURNED` (A.3: code never deleted, status preserves history) |
| `ownership` | `COMPANY` (default) / `CUSTOMER` (B.3: auto-flipped to CUSTOMER when 36-month rental Contract.status → COMPLETED) |
| `currentFilters` | derived view: which filters are due, last-replaced when, due in N days |

**Sale → Maintenance transition (B.1, 2026-05-26)**: a customer who originally purchased equipment can later sign a maintenance contract for the **same Equipment row** — the `Equipment.code` is preserved; a new `Contract` row with `type=MAINTENANCE` links to the existing Equipment. Equipment ownership stays with the customer. Adding a **new rental on top** of an existing customer follows the normal flow (new Equipment code).

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
| `code` | **B2C**: `HD-YYYYmmDD/SA-KH####` (e.g. `HD-20260526/SA-KH0001`). **B2B**: `HD-YYYYmmDD/SA-{shortcode}` (e.g. `HD-20260526/SA-SHV`). Format confirmed by client B.2 2026-05-26. |
| `customerId` | FK |
| `type` | `SALE` / `RENTAL` / `MAINTENANCE` |
| `startDate` | Installation date (rental term clock starts here) |
| `endDate` | Computed: `startDate + termMonths` (typically 36 for rental); recalculated dynamically based on **actually-paid installment count**, not calendar (per §5-4 of the process PDF) |
| `termMonths` | 36 for standard rental; null for sale |
| `mandatoryMonths` | 24 for rental |
| `monthlyFee` | VND — for rental + maintenance |
| `monthlyMaintenanceFee` | VND — applied after `RENTAL` → `MAINTENANCE` conversion (B.4: 1-click renewal with new fee) |
| `totalSalePrice` | VND — for sale |
| `depositAmount` | VND — usually 0 in practice |
| `signedAt` | When customer signed |
| `signedBy` | Customer signer name |
| `paidInstallments` | Count of installments actually collected (drives `endDate` recompute) |
| `status` | `DRAFT` / `ACTIVE` / `OVERDUE` / `COMPLETED` / `TERMINATED_EARLY`. **B.3 (2026-05-26)**: transition to `COMPLETED` auto-flips `Equipment.ownership` to `CUSTOMER`. |
| `parentContractId` | (B2B only, B.2 2026-05-26) FK to original Contract when this row is an **Appendix** — some B2B customers prefer to add new equipment as an amendment instead of issuing a new contract |
| `amendmentRevision` | (B2B only, B.5 2026-05-26) `0` = original, `1+` = amendment revisions. B2C amendments do not use this field — price updates happen in place + AuditLog entry |
| `filterPolicy` | JSON: rental filter inclusion policy (E.2 2026-05-26). Default rental = free, but some contracts have specific exceptions per part code |
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
| `siteId` | FK → Site (optional; set when Customer has Sites — A.4 hierarchy) |
| `type` | enum above |
| `scheduledDate` | date — appointment day |
| `scheduledTimeWindow` | e.g. "09:00-11:00" or "오전" / "오후" (B2C requires specific time, B2B usually doesn't) |
| `leadTechnicianId` | FK → User (REQUIRED — primary responsible tech, K.3 2026-05-26) |
| `collaboratorTechnicianIds` | array of FK → User (optional helpers — K.3) |
| `equipmentIds` | array — which devices are covered by this visit (a visit can touch some but not all of a customer's devices) |
| `status` | `SCHEDULED` / `CONFIRMED` / `IN_PROGRESS` / `COMPLETED` / `RESCHEDULED` / `CANCELLED` / `CUSTOMER_NO_SHOW` / `NEEDS_REVISIT` |
| `completedAt` | timestamp |
| `notes` | technician's free-form notes after visit |
| `signatureCustomerPath` | S3 — customer signature image (E.1: v1 photo of paper; tablet TODO) |
| `signatureTechnicianPath` | S3 — lead technician's signature only |
| `attachedPhotos` | array S3 paths — before/after, parts replaced |
| `paymentCollected` | FK → Payment (if cash collected on this visit — lead tech only) |
| `rescheduledFromVisitId` | FK self-ref — chain to previous visit if rescheduled |
| `rescheduleReason` | enum: customer-requested / technician-unavailable / weather / customer-absent / other |

### 6.3 Schedule mechanics

- **Daily roster:** each technician sees "today's visits" (a list with addresses, time windows, customer names, devices to service) — mobile-first screen. Collaborators see shared visits with "Shared with you" badge.
- **Reschedule flow** (very common per `프로세스 질의와 응답.pdf`): customer calls → office staff updates `scheduledDate`, status → `RESCHEDULED`, new visit row auto-created and linked via `rescheduledFromVisitId`.
- **Multi-day big sites:** for a B2B site with 64 devices, one logical "service job" can span multiple days. v1 implementation: one Visit per day-of-work, all linked by `parentJobId` (TBD field). Progress tracked as `12 / 64 devices completed`.
- **Multi-technician parallel (K.3 2026-05-26):** for a site needing 2+ technicians on the same day, the Visit has one `leadTechnicianId` (primary responsible — handles payment, signature, work-confirmation PDF signoff) and 0..N `collaboratorTechnicianIds[]` (helpers — see the visit on their mobile queue, contribute notes/photos, but cannot mark as complete or accept payment).

### 6.4 Schedule UI (v1)

- Office staff: weekly calendar view by technician (Mon–Sun × techs grid), drag to reschedule
- Technician: phone roster — "tomorrow", "today", "overdue" tabs
- Map view: deferred to Phase 4+ — **C.5 (2026-05-26)**: v1 ships without map view; region-based sort only. Map provider TODO for Phase 7+.

### 6.4.1 Technician assignment algorithm (C.1, C.2 — 2026-05-26)

**C.1 (2026-05-26)**: when a new visit is created, the system **auto-recommends** a technician; office staff confirms.

Recommendation ranking signals (priority order):

1. **Per-customer preferred technician** (`Customer.preferredTechnicianId`, C.2) — if set AND available that day, top of list
2. **Region match** — `Technician.preferredRegion` overlaps with `Customer.preferredRegion` or `Site.region`
3. **Daily load balance** — fewer visits already scheduled = higher priority

Office can always manually override with any active technician. **Preferred fields are soft hints, never hard constraints.**

### 6.5 Service Request lifecycle (NEW — Phase 3.5)

A `ServiceRequest` is **submitted from the portal by a customer** (CONTRACT_PARTY or any OPS_CONTACT) and is the upstream event for a `REPAIR` / `RELOCATION` / extra `INSPECTION` Visit. Office staff can also create one manually if a customer calls the office.

| Type | Default billing | Notes |
|---|---|---|
| `INSPECTION` (점검) | free | Rental/maintenance customers; auto-approved |
| `CONSULTATION` (상담) | free | Phone-only typically; auto-approved |
| `FAULT_REPORT` (고장 신고) | free under warranty/rental; paid otherwise | Office decides on review |
| `FILTER_REPLACEMENT_AD_HOC` (필터 임시 교체) | rental free, sale paid | |
| `PART_REPLACEMENT` (non-filter) | paid | |
| `RELOCATION` (이전 설치) | paid | Always paid |
| `OTHER` | manual | Office classifies |

**Fields**: `id`, `customerId`, `submittedByContactId` (FK → CustomerContact), `submittedFrom` (`PORTAL` / `OFFICE_PHONE` / `OFFICE_WEB`), `type`, `description` (free text), `attachedPhotos` (S3 paths), `equipmentIds` (which devices), `status`, `isPaid` (computed from defaults + office override), `quotedAmount`, `reviewedByUserId`, `reviewedAt`, `linkedVisitId`, `createdAt`, `updatedAt`.

**Status enum**: `SUBMITTED` / `AUTO_APPROVED` / `APPROVED` / `REJECTED` / `SCHEDULED` (Visit created) / `COMPLETED` / `CANCELLED`.

**Lifecycle**:
```
free type    → SUBMITTED → AUTO_APPROVED → SCHEDULED (Visit auto-created) → COMPLETED
paid type    → SUBMITTED → (office review by STAFF+) → APPROVED → SCHEDULED → COMPLETED
                                                    ↘ REJECTED (with reason)
```

Customer sees real-time status in the portal (mockup screen 53). Each transition fires SMS to the submitter (`SMS_SERVICE_REQUEST_RECEIVED` on submit, `SMS_SERVICE_REQUEST_APPROVED` when scheduled, `SMS_SERVICE_REQUEST_COMPLETED` on completion).

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

### 9.1 Channels (v1) — confirmed 2026-05-26

- **In-app** — bell notification for office staff (new visit, customer call, payment received, etc.). Carry forward PMIS notification shell.
- **SMS** (eSMS.vn Brandname `SeoulAqua`, F.1 + F.4 + Q17 confirmed) — urgent/security/dunning-final/D-1 messages. 7 templates in `docs/DOCUMENT_TEMPLATES.md` §A. Phase 3.5 dev uses mock (`SMS_PROVIDER=mock`).
- **Transactional Email** (Resend, F.7 confirmed) — receipts, acknowledgments, early-stage reminders, summaries with PDF attachments. 9 templates in `docs/DOCUMENT_TEMPLATES.md` §B. Phase 3.5 dev uses mock (`EMAIL_PROVIDER=mock`). Sender `noreply@seoulaqua.com.vn` + Reply-To `cs@seoulaqua.com.vn` (A.14).
- **Operational Email** (vhost.vn Email Relay, F.2 confirmed) — tax invoice attachment delivery (Phase 6+) and future marketing campaigns. Same sender domain, different provider, different audit log.

**Per-channel opt-out (F.3 confirmed)**: `CustomerContact.smsOptOut` + `CustomerContact.emailOptOut` flags independent. **System messages (password reset, payment receipt) ignore opt-out** — always delivered.

### 9.2 Out of scope (v1)

- Push notifications to customer phones (no app yet)
- **Zalo OA + Zalo Mini App integration** — F.1 footnote: TODO for Phase 8+ as a richer alternative messaging channel and an alternative customer portal UI popular in Vietnam
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
- **Mobile-first screens** (customer portal): all portal pages (§11) — assume phone usage
- **Desktop-first screens** (office daily use): customer list w/ filters, contract creation wizard, payment reconciliation, scheduling calendar, reports, admin

Both responsive; the priorities just inform which breakpoint gets the polish.

---

## 11. Customer Portal (Phase 3.5)

A **mobile-first public-internet portal** at **`https://portal.seoulaqua.com.vn`** (subdomain confirmed by client A.10, 2026-05-26) for B2C and B2B customers. Each `CustomerContact` with `portalEnabled=true` (see §3.3.2) is a login. Authentication uses phone number + password (separate session table from staff).

### 11.1 Audience

- **B2C household members** — primarily checking next visit, filter due dates, paying or requesting service. Vietnamese-primary in practice.
- **B2B operations staff** — HR / facility / procurement people who book and track visits across many devices.
- **B2B contract signers** — Korean-speaking directors in many cases; less frequent users, but use the portal for contract overview + adding/removing OPS contacts when staff turnover.

### 11.2 Pages (initial scope — see mockup screens 47–58)

| Page | Path | Available to |
|---|---|---|
| Login | `/portal/login` | public |
| Force change password (first login + after office reset) | `/portal/change-password` | logged-in with `mustChangePassword=true` |
| Home / overview (next visit + filter due + outstanding amount) | `/portal` | all contacts |
| Equipment + filter cycle | `/portal/equipment` | all contacts |
| Visit history + scheduled visits | `/portal/visits` | all contacts |
| Submit service request | `/portal/requests/new` | all contacts |
| Service request status tracker | `/portal/requests` and `/portal/requests/:id` | all contacts (each sees own + visible to other contacts of same customer) |
| Manage Operations Contacts (add/edit/delete) | `/portal/contacts` | **CONTRACT_PARTY only** |
| Payment history + next billing | `/portal/payments` | all contacts |
| Profile + change password + language | `/portal/profile` | each on their own |

### 11.3 Sign-up flow

Automatic; not user-initiated. See §3.3.2 for the trigger + SMS sequence. There is no public "register" page in v1 — every customer account is provisioned by a contract activation or sale finalization. Office staff cannot disable the automatic SMS without disabling `portalEnabled=true` on the contact.

### 11.4 What customers CANNOT do (v1 out of scope)

- Pay online (no payment gateway integration — Phase 8+)
- Sign documents on the portal (signature is still on-site by technician)
- Initiate a contract (sale or rental still goes through office sales staff)
- Change `CONTRACT_PARTY` identity (legal — office only)
- Delete the only OPS_CONTACT and leave themselves without operational reach (UI prevents)

### 11.5 Cross-references

- Schema & auth fields: §3.3.2 + `docs/DATA_MODEL_NOTES.md` (`CustomerContact`, `CustomerSession`, `ServiceRequest`)
- SMS templates: `docs/DOCUMENT_TEMPLATES.md`
- Phase plan: `docs/PROJECT_PLAN.md` Phase 3.5
- Open questions: `docs/QUESTIONS.md` A.10–A.13, C.6, F.4–F.6

---

## 12. Non-Functional Requirements

| Requirement | Target |
|---|---|
| **Concurrent users (steady)** | ~10 office staff + ~30 technicians simultaneously typing into visits at end-of-day. Spikes to ~50 unique concurrent. |
| **Database size (year 1)** | Customers ~10K, Equipment ~30K, Visits ~150K (assuming 80 techs × 5 visits/day × 365), Payments ~150K. Conservatively < 5 GB. |
| **Storage (uploads, year 1)** | Photos (visits): 80 techs × 5 visits/day × 2 photos × 200 KB × 365 = ~117 GB/year. Signed-paper photos: similar. Use lifecycle: hot 3 months → archive 12 months → backup. |
| **Hosting** | Vercel (Next.js) + Supabase (Postgres) for v0; **vhost.vn migration confirmed (H.1, 2026-05-26)** before production launch. |
| **Region** | HCMC primary. Vietnamese Personal Data Protection law applies — vhost.vn satisfies data residency. |
| **Backup** | Supabase auto-backup (daily, 7-day retention). Plus weekly `pg_dump` archived to object storage. **Daily backup window VST 03:00 (H.3, 2026-05-26)**. |
| **Uptime target** | 99 % during business hours (Mon–Sat 08:00–18:00 VST). Acceptable downtime: <2 h scheduled maintenance per month, off-hours. |
| **PII handling** | Customer phone + address encrypted at rest (Postgres TDE / column-level encryption to be evaluated in Phase 1) |
| **Audit log retention** | **24 months (H.2 confirmed 2026-05-26)** — Vietnamese legal best practice |
| **Document retention (E.4 confirmed 2026-05-26)** | Contracts + Tax invoices: **10 years**; other documents (receipts, periodic check, work confirmation): **5 years**. Server cron deletes past horizon. |
| **Paper original disposal (E.5 confirmed)** | Digital archive + **1 year** then user decides; not auto-destroyed. |
| **Mobile offline tolerance** | **C.4 (2026-05-26)**: v1 ships **online-first**; offline queue + sync-on-reconnect deferred to Phase 7. |
| **Technician device targets (K.1 confirmed)** | **Android 8+ / iOS 14+**, **5-6 inch screen** design, **8MP+ camera** assumed. |

---

## 13. Open Questions

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

## 14. Glossary

See `.claude/CLAUDE.md` § "Domain Vocabulary" for the canonical KR / VI / EN term table.

---

## Change log

- **2026-05-26 (v0.4 latest)** — **Client answers applied** (50 questions, all answered; only A.5 filter compatibility data delivery pending 2026-05-29). Material additions:
  - §3.2 KH-code derivation rule (A.2: `8918` → `KH08918`)
  - §3.2.1 NEW Site model (A.4 + A.8) — Customer > Site > Equipment 3-level hierarchy
  - §3.3.1 Site-scoped OPS contacts; A.13 shared phone allowed; A.7 language fallback to Contract Party
  - §3.3.2 portal URL = `portal.seoulaqua.com.vn` (subdomain — A.10)
  - §4 Equipment: `siteId` + new status enum values (A.3: DEACTIVATED/TERMINATED preserve history); `ownership` field (B.3); §B.1 sale → maintenance transition note
  - §5.2 Contract code format B2C/B2B (B.2); Appendix `parentContractId` + `amendmentRevision` (B2B only, B.5); `monthlyMaintenanceFee` (B.4); `filterPolicy` JSON (E.2)
  - §6 Visit: `siteId`, `leadTechnicianId` + `collaboratorTechnicianIds[]` (K.3 multi-tech); §6.4.1 scheduler ranking with preferred tech + region (C.1, C.2); §6.4 map deferred (C.5)
  - §9 Notifications: SMS = eSMS.vn confirmed; transactional Email = Resend (F.7); operational Email = vhost.vn (F.2); opt-out per channel (F.3); Zalo TODO (F.1)
  - §11 portal URL update
  - §12 NFR: vhost.vn hosting (H.1), 24-month audit retention (H.2), 03:00 backup (H.3), 10y/5y document retention (E.4), 1y paper disposal (E.5), online-first PWA + Phase 7 offline (C.4), device targets (K.1)
- **2026-05-26 (v0.3)** — Customer portal moves IN-scope (§11 new, Phase 3.5). CustomerContact now 1:N for OPS (§3.3.1). Portal auth model §3.3.2 added (phone login + bcrypt + SMS-driven signup). ServiceRequest lifecycle §6.5 added. **Role model collapsed** to 3-tier (`ADMIN > MANAGER > STAFF`) + `TECHNICIAN` parallel + `CUSTOMER` external (§2.1). Q11 (role matrix) resolved inline. Sections renumbered: NFR §12, Open Questions §13, Glossary §14.
- **2026-05-26** — v0.2. Two-contact customer model added (§3.3.1).
- **2026-05-25** — v0.1 initial draft. Based on `reference/process/회사 운영 프로세스 종합 정리.pdf` + `프로세스 질의와 응답.pdf` + the 7 CSV samples + 10 form templates. All sections marked `[TBC]` await client answers to the corresponding `QUESTIONS.docx` items.
