# PROCESS NOTES — Seoul Aqua Operations

> Distilled from `reference/process/회사 운영 프로세스 종합 정리.pdf` (canonical business narrative) and `reference/process/프로세스 질의와 응답.pdf` (round-1 Q&A with the client). This document is the single place an engineer or agent should read before designing a feature — so the source PDFs don't need re-reading every time.

---

## 1. Company at a glance

**Seoul Aqua (CÔNG TY TNHH MTV TM&DV ĐẠI Á)** sells and services household water-treatment + air-quality products in Vietnam. Three sales modes × multiple product families.

### Product families

| Category | Examples | Service intensity |
|---|---|---|
| 정수기 (Water purifier) | PTS-2100, PTS-4001T, SA-7000, CHESSY RO | High — periodic filter changes, the company's core product |
| 비데 (Bidet seat) | SA-J430, SA-J830 | Medium — filter every few months, occasional repair |
| 공기청정기 (Air purifier) | AC-700 20in series | Medium — HEPA + PP filter changes |
| 제습기 (Dehumidifier) | (catalog only) | Low — sale only |
| 생활 필터 (Lifestyle filters) | Shower / lavabo / washing-machine filters | Low — sale only, no service |
| 산업/가정용 정수 시스템 (Industrial/home water systems) | FSM-150, KM-2500 | High — periodic service |

### Sales modes

| Mode | Code | Description |
|---|---|---|
| 제품 판매 (Sale) | `SALE` | Customer pays once, owns immediately. Optional separate maintenance contract. |
| 렌탈 (Rental) | `RENTAL` | 36-month contract, monthly fee, ownership transfers at end. Includes periodic visits + free filter changes. |
| 유지관리 (Maintenance) | `MAINTENANCE` | Post-rental conversion OR sale customer signs up OR third-party device. Periodic visit + filter replacement, monthly billing. |
| 필터/소모품 교체 (Filter / consumable replacement) | (transaction, not a contract) | Ad-hoc charge for replacement parts. |

> 정기 점검 (Periodic inspection) and 렌탈 (Rental) overlap heavily — every rental includes monthly or bi-monthly inspection. Maintenance customers also get periodic visits but billed separately.

---

## 2. Operational characteristics (per process PDF §2)

| Aspect | Reality |
|---|---|
| Customer structure | 1 customer can have many devices (B2B sites: 50–200 devices common; B2C: 1–5 typical) |
| Equipment management | Per-device maintenance / filter-change / repair history needed |
| Contract types | Sale / rental / maintenance mixed in one customer relationship is normal |
| Customer types | B2C (가정집) and B2B (회사) operate very differently — scheduling, signing, payment all diverge |
| Technician role | Maintenance, cleaning, filter change, repair, **on-site cash collection** |
| CS management | Filter-change due-date communication + customer relationship management needed |

---

## 3. The core problem (process PDF §3.1)

Currently managed **per device, not per customer**. A customer with 10 devices means:

- 10 separate management codes in the spreadsheet
- Same customer searched, updated, and printed-for 10 times per visit
- 10 separate filter-due date entries to track
- Repeated data entry, high risk of missed entries

**Stated impact:**

> 동일 고객 통합 관리 어려움 / 유지보수 일정 확인 불편 / 필터 교체 이력 관리 비효율 / 계약 및 고객 이력 확인 어려움 / 반복 입력 업무 과다 발생

### What they want (PDF §3.2)

**Customer-centric integrated management.**

- One customer code: `KH00001`
- Per device: child codes auto-generated `KH00001-1`, `KH00001-2`, ...
- Search a customer once → see all devices, contracts, visits, payments
- Update many devices' filter changes in **one screen** after one visit

---

## 4. Equipment-management policy (PDF §4)

### 4.1 Devices that NEED per-equipment tracking

| Family | Why |
|---|---|
| 정수기 / 비데 / 공기청정기 / 제습기 / 정수 시스템 | Periodic maintenance, filter cycle, repair history, can be rented or maintained under contract |

→ Per-equipment code (`KH#####-N`) required.

### 4.2 Things that DON'T need per-item tracking

| Family | Why |
|---|---|
| 샤워 필터 / 세면대 필터 / 세탁기 필터 / 카트리지 / 기타 소모품 | Buy once, no service, no contract |

→ Only **purchase/replacement history** needed, no device code.

---

## 5. Sales-mode rules

### 5.1 Sale customers (PDF §5.1)

| Operational feature | Even without service contract, needed |
|---|---|
| Customer bought outright | Filter-change cycle reminder still expected (CS retention) |
| Mix of warranty + non-warranty products | Track latest replacement date, calculate next replacement, send alert |
| Field collection | None (paid at sale) |

### 5.2 Rental customers (PDF §5.2)

| Feature | Rule |
|---|---|
| Company installs device + rents it | Standard 36 months |
| Maintenance frequency | **Monthly** or **every 2 months** depending on contract |
| Filter changes | All filters free during rental |
| Total installments | 36 |
| End of contract | Ownership transfers to customer; optional maintenance contract follow-on |
| Early termination during mandatory 24-month period | 50 % of remaining months × monthly fee penalty |

### 5.3 Maintenance customers (PDF §5.3)

Three entry paths:

1. Post-rental contract conversion (most common)
2. Sale customer requests it
3. Third-party device (not bought from Seoul Aqua) — service-only contract

---

## 6. Payment & collection rules (PDF §5.4 — IMPORTANT)

This section drove the system design more than any other. Memorize it.

### 6.1 In theory

Rental customers should be billed monthly based on actual usage period.

### 6.2 In practice

Most B2C customers pay **at the moment the technician visits**, regardless of which calendar month the visit falls in. Schedules slip, visits move, but the cash is collected on the actual visit.

### 6.3 Three real examples from the PDF

**Example 1** — visit slips, payment slips with it:

| Original | Reality |
|---|---|
| Scheduled visit: May 20 | Customer asks for early-June visit |
| Original billing target: May rent | Technician visits early June, collects **May's rent** at that visit |

→ Visit date ≠ billing month ≠ actual collection date.

**Example 2** — back on schedule:

| Original | Reality |
|---|---|
| End of June: visit happens | Customer pays June rent |

→ Schedule self-corrects when customer doesn't push further deferral. But may slip again next month if customer requests July deferral.

**Example 3** — two installments collected at once:

| Event | Detail |
|---|---|
| May visit didn't happen | Customer rescheduled |
| Actual visit | June 20 |
| At that visit: collect both May rent AND June rent | Two installments collected at one visit |

→ The system must support **multiple installments per visit-payment**.

### 6.4 Contract-end calculation rule

> 계약 종료일 계산 시 실제 수금 완료 회차 기준 반영 필요. 단순 날짜 기준 종료가 아니라 실제 완료된 결제 회차 기준으로 잔여 계약 계산 필요.

**Contract end date is computed from the count of installments actually paid, not from the calendar.** If a 36-month rental has had 4 months of payment slippage, it runs 40 calendar months until the 36th installment is collected.

---

## 7. Technician operations (PDF §6)

### 7.1 Daily duties

- Maintenance / cleaning / filter change / repair
- **Cash collection from B2C customers**

### 7.2 System needs

- See today's visit list
- Enter work results
- Enter replaced parts
- Mark visit complete
- See incomplete-visit list

### 7.3 Cycle-management complexity

| Item | Variability |
|---|---|
| Filter replacement cycle | Different per filter type |
| Visit cycle | Different per customer (1× monthly OR 1× / 2 months) |
| After change | Update "latest replacement date" + auto-compute "next due date" |

### 7.4 Current pain (PDF §6.3) — biggest one

> 현재는 장비별 개별 관리 방식으로 운영되고 있기 때문에 유지보수 완료 후 관리 업무에 많은 시간이 소요되고 있습니다.

For each visited customer, the office staff currently must individually edit:

- Visit date
- Maintenance history
- Filter-change history
- Next-replacement scheduled date
- Payment status
- Collection status

**Per device.** A customer with 10 devices = 10 repeats.

→ The desired solution: customer-centric view + **multi-device bulk update on one screen**.

---

## 8. Schedule operations (PDF §6.4)

### 8.1 Technician-headcount-driven capacity

| Metric | Example |
|---|---|
| Technicians | 3 |
| Daily processing capacity | ~30 visits |
| Today's planned visits | 40 |

→ Today's 40 can't all be served; system must support **overflow + reschedule**.

System must consider:

- Technician headcount
- Daily processable count
- Regional travel route
- Actual completable count

### 8.2 Customer-driven schedule changes (very frequent)

Real-world events:

- Customer absent (`고객 부재`)
- Customer request (`고객 요청`)
- Time change
- Schedule deferral

Examples from the PDF: "내일 와주세요", "이번 주는 어렵습니다", "오후에만 가능합니다".

### 8.3 Visit status enum needed

- 방문 예정 / SCHEDULED
- 완료 / COMPLETED
- 고객 요청 연기 / DEFERRED_BY_CUSTOMER
- 고객 부재 / CUSTOMER_NO_SHOW
- 일정 변경 / RESCHEDULED
- 취소 / CANCELLED
- 재방문 필요 / NEEDS_REVISIT

### 8.4 Auto-rebalancing

When a customer can't be served today, the system should help **reassign to a different day** automatically (or at least make the manual rebalance fast for the dispatcher).

### 8.5 Roles in the desired workflow

| Actor | Workflow |
|---|---|
| Technician | Works from "today's visit list" |
| Manager (dispatcher) | Sees full schedule overview, sees incomplete visits, can rebalance |

---

## 8.6 Two-contact model — Contract Party vs Operations Contact

Real-world observation that drove a domain-model addition: **the person who signs the contract is often NOT the person who confirms visit schedules or receives SMS.**

### Examples

| Customer type | Contract Party (계약 주체) | Operations Contact (관리 주체) |
|---|---|---|
| B2B medium factory | Korean director, signs all contracts, uses Korean | Vietnamese HR / admin staffer, fields SMS, books visits, uses Vietnamese |
| B2B small Vietnamese SME | Vietnamese owner, signs contracts in Vietnamese | Same person (single contact) |
| B2C — couple where wife handles vendors | Korean husband, name on contract, uses Korean | Vietnamese wife, books visits, uses Vietnamese |
| B2C — single person | Same person on both sides | Same person |

### What it means operationally

| Channel | Who receives | What language |
|---|---|---|
| Contract PDF (signing) | Contract Party | Contract Party's language |
| Tax invoice (B2B) | Contract Party (billing email) | Contract Party's language |
| Visit reminder SMS | Ops Contact | Ops Contact's language |
| Visit-reschedule SMS | Ops Contact | Ops Contact's language |
| Periodic-check receipt PDF | Ops Contact | Ops Contact's language |
| Mobile "call customer" button (default) | Ops Contact | (voice call) |
| Overdue dunning notice | Both (CC) | Each in their own language |

The system enforces this routing automatically. Without this split, Korean-language SMS reminders would land on a Vietnamese-only staffer's phone and be ignored — the #1 driver of "customer no-show" in the current spreadsheet workflow.

→ Stored as one `CONTRACT_PARTY` + 0..N `OPS_CONTACT` rows per Customer. If the same person plays both roles, the OPS row is omitted (CONTRACT_PARTY carries both roles' channels until office adds OPS later). See `docs/DATA_MODEL_NOTES.md` §1 and mockup screen 12 for the full schema and form.

## 8.7 Multi-site customers — Customer > Site > Equipment (NEW 2026-05-26, A.4 + A.8)

For larger B2B customers (factory complexes, multi-building enterprises), the **Customer > Site > Equipment** 3-level hierarchy supports per-site addresses, equipment lists, and Ops contacts.

**B2C**: typically no Sites. Equipment and contacts attach directly to Customer; `Customer.addressFull` is the install address. A B2C customer can opt-in to multiple Sites (rare — e.g., a household with summer/winter homes).

**B2B**: typically 1+ Sites. The B2B factory example with 64 devices spread across HQ + 4 plants + R&D building becomes:

```
Customer "Shinhan Vina" (shortcode: SHV)
  ├── Site "HQ"           (addressFull, region, Ops contact: corporate facilities mgr)
  ├── Site "Plant 2A"     (addressFull, region, Ops contact: 2A floor manager)
  ├── Site "Plant 2B"     (addressFull, region, Ops contact: 2B floor manager)
  ├── Site "R&D Building" (...)
  ├── Site "Lectra"       (...)
  └── Site "Kitchen"      (...)
```

Each Site has its own `addressFull` (overrides Customer.addressFull when set), `region` (for scheduling region match), and Ops contacts (`scope='SITE'`). CONTRACT_PARTY is always organization-level (`scope='CUSTOMER'`).

**Operational implications:**
- Visit scheduling: Visits attach to a Site (when one exists). Visit reminder SMS goes to that Site's Ops contact first, then falls back to Customer-level Ops, then to CONTRACT_PARTY.
- Equipment list: customer detail page groups equipment by Site for B2B (vs flat list for B2C).
- Periodic check reports: include the Site name + address rather than just the customer name.

## 8.8 Technician scheduling rules (C.1 + C.2 + C.5, 2026-05-26)

When a new visit needs a technician, the system **auto-recommends** a candidate; office confirms with one click (per client answer C.1 (b)).

Ranking signals, in priority order:

1. **Per-customer preferred technician** (`Customer.preferredTechnicianId`, C.2 client answer 2026-05-26) — if set AND available that day, top of the candidate list. Especially valuable for B2C customers who built rapport with a specific tech.
2. **Region match** — technician's `preferredRegion` overlaps with `Customer.preferredRegion` or `Site.region`. Soft preference, not enforced.
3. **Daily load balance** — fewer visits already scheduled that day = higher priority.

Office can always override with any active technician. Preferred fields are soft hints, never hard constraints.

**Map view**: deferred per C.5 client answer. v1 uses region-grouped sort in the daily roster only. Map provider decision (Goong Maps vs Google Maps) is a Phase 7+ TODO.

---

## 9. B2C vs B2B differences (PDF §6.5)

### 9.1 B2C / 가정집

**Time appointment REQUIRED.** Office calls customer in advance to coordinate exact time window.

Examples:
- 오전 가능 / morning OK
- 오후 가능 / afternoon OK
- 특정 시간 요청 / specific-time request

System must show **appointment time slot** on technician's roster:

| Customer | District | Scheduled time | Status |
|---|---|---|---|
| 김 OO | 7군 | 09:00 | 확인됨 |
| 박 OO | 투득 | 10:30 | 미확인 |
| 이 OO | 빈탄 | 14:00 | — |

Technician moves through the day **in time order**.

### 9.2 B2B / 회사

Detailed time appointments NOT required, but **visit-date assignment is required**.

| Need | Detail |
|---|---|
| Date | Yes |
| Technician assignment | Yes |
| Daily work list | Yes |
| Time slot | No (day-level OK) |

System shows:

| Company | District | Visit date | Assigned tech | Status |
|---|---|---|---|---|

B2B emphasis: **batch by region, optimize technician route.**

---

## 10. Visit confirmation flow — B2C (PDF §6.6)

5-step process; **always pre-coordinated**.

1. **Generate inspection-due customer list** (e.g., periodic-inspection due, filter-change due)
2. **Office staff calls customer** to confirm date + time window
3. **Lock the visit date + time**
4. **Assign to technician** — appears on their roster
5. **After visit, log results** — work content, filter replacement, payment status, special notes, next-visit info

---

## 11. Large B2B site handling (PDF §6.7) — IMPORTANT

Some B2B customers have 20 / 50 / 100 / 200 devices on one site. Examples from the sample data:

- A factory with **64 devices** across multiple buildings (`정기 점검 확인서` sample)
- Office complexes with dozens of water purifiers in pantries + bathrooms

### 11.1 Operational reality

- **Can't be done in one day.** 2–3 days or more.
- **"1 customer = 1 day's work" pattern does NOT apply.**

### 11.2 System needs

1. **Work-job model:** start date / planned end date / progress state
2. **Partial completion:** "Today 10 of 30, tomorrow 10, day-after the rest"
3. **Progress tracking:** total devices / completed devices / progress %

---

## 12. Multi-technician parallel work (PDF §6.8)

For large or rush jobs, **multiple technicians work the same site simultaneously**.

| Site | Duration | Technicians |
|---|---|---|
| Factory A | 2 days | 2 techs |

### System needs

1. **Multi-technician assignment**
2. **Per-tech work partition** — by device range or by zone ("Tech 1: floors 1–3, Tech 2: floors 4–6")
3. **Per-tech progress visibility**
4. **Combined-progress rollup**

---

## 13. Document workflow per customer type (PDF §7)

> **2026-06-03 Phase 6 update** — Document kinds are now 6 distinct visit documents (see `docs/DOCUMENT_TEMPLATES.md` §0 for the auto-suggestion matrix and §0.1 for the issuance policy gate). The B2C "정기점검 + 영수증" combo is now `PERIODIC_CHECK_B2C`; the B2B "유지보수 확인서 without prices" is now `PERIODIC_CHECK_B2B`. Office issues each manually after the visit gets a `leadTechnicianId`.

### 13.1 B2C / 가정집

| Aspect | Detail |
|---|---|
| Technician role | Direct visit + on-site cash collection |
| Documents used | `DELIVERY_RECEIPT` (rental install), `SALE_RECEIPT_B2C` (sale install), `PERIODIC_CHECK_B2C` (periodic — includes receipt), `WORK_CONFIRMATION` (other) |
| After visit | Customer signs the printed paper; technician photographs the signed page |
| Document return | Technician brings paper back next business day to office |

### 13.2 B2B / 회사

| Aspect | Detail |
|---|---|
| Technician role | Visit, log work, get customer-staff signature |
| Documents used | `DELIVERY_SLIP_B2B` (install — Mẫu 02-VT), `PERIODIC_CHECK_B2B` (periodic — work-content + parts; **no unit price, no total, no payment info**), `WORK_CONFIRMATION` (other) |
| Up-sell during visit | Allowed — extra filters / consumables; recorded on the same doc |
| Accounting | Office issues separate **tax invoice** later; customer pays per invoice schedule |
| Document return | Sometimes by post (especially contract originals — manager signs at HQ, then courier) |

### 13.3 Document return (PDF Q&A "공통 질문")

| Customer | Typical return path |
|---|---|
| Local B2C | Tech home from job site → next morning at office, delivers paper |
| Remote technicians | Monthly bundle, hand-deliver or EMS |
| B2B contract original | Sent by EMS / courier after manager signature |

---

## 14. System-construction priorities (PDF §8)

This is what the client explicitly said matters MOST.

> 본 시스템은 단순 장비 관리 프로그램이 아니라, 실제 현장 운영 기준으로:
> 입력 속도 / 작업 효율성 / 유지보수 처리 속도 / 기술팀 업무 편의성 / 고객 관리 효율성

Especially:

1. **Repetitive input minimization** ← #1 priority
2. **Integrated search** ← one search returns all related data
3. **Multi-equipment bulk processing** ← the "10-device customer" pain killer
4. **Fast on-site input after visit** ← mobile-first

---

## 15. System construction goals (PDF §9)

Stated goals (for traceability — every one of these maps to a SPEC.md success criterion):

- Customer & equipment integrated management
- Automatic maintenance schedule management
- Filter replacement schedule management
- CS strengthening
- Technician efficiency improvement
- Zero-miss visit management
- Contract & history integrated management
- Repetitive input minimization
- Future business expansion support

---

## 16. Form-level clarifications from Q&A round 1 (`프로세스 질의와 응답.pdf`)

These are direct answers from the client; they collapse what would otherwise be open questions.

### B2C path

| Step | Confirmed |
|---|---|
| **One-time sale** | `납품서 (영수증 겸용)` used — single doc on visit + payment |
| **Ad-hoc service (B2C / B2B)** | `물품 주문서` is NOT customer-facing — it's the internal PO. Customer-facing: `작업확인서` |
| **Initial install (rental B2C)** | `임대 계약서` + `정기 점검표` issued together; customer signs both on install |
| **Initial install (sale B2C)** | `판매 영수증 (출고서 겸용) - 가정집` issued — one doc covers it |
| **Payments (any B2C doc)** | Cash collected with the doc; technician deposits at office **same or next day** |
| **Periodic visit (rental B2C)** | `정기 점검표 - 가정집` issued monthly |
| **Ad-hoc repair / filter change (rental B2C)** | `물품 주문서` IS NOT IT (corrected) — use `작업확인서` |

### B2B path

| Step | Confirmed |
|---|---|
| **Initial rental contract** | `임대 계약서` — same as B2C but different form (`임대 계약서.pdf`) |
| **Initial install** | `출고서` issued + signed by recipient |
| **Payments** | Seoul Aqua issues invoice; customer pays by bank transfer; cash sometimes too |
| **Periodic visit (rental B2B)** | `정기 점검 확인서 (고객사용)` issued — work content + parts changed, **no prices**. Customer-staff signs. |
| **Ad-hoc service (B2B)** | `작업확인서` |

### Filter / inventory

| Item | Confirmed |
|---|---|
| `물품 주문서` audience | **Internal only** — used by office to order from suppliers. Customer / technician never sees it. |
| `납품서` and `판매 영수증` and `출고서` mapping | "Sale = 납품서 (영수증 겸용)" is the canonical universal slip. `판매 영수증` and `출고서` are legacy variants — in the new system, **use 납품서 (영수증 겸용) only** for sale. |

### Periodic inspection doc — open items

The B2B `정기 점검 확인서 (고객사용)` has **unanswered Q&A items**:

- Q2 unanswered: "filter listed because all replacements are free?"
- Q3 unanswered: "how is the internally-changed filter type/quantity recorded?"

→ These propagate forward as open `QUESTIONS.docx` items (section E).

### Contract amendments

- B2C contract: never amended (per client answer to template Q4)
- B2B contract: amended on a per-customer basis; office handles ad-hoc
- Same-model pricing: usually identical across customers, occasionally varies

### Periodic frequency choices

- Currently 2 valid frequencies: **monthly** OR **every 2 months** per contract

---

## 17. Customer Portal Workflow (Phase 3.5 — NEW 2026-05-26)

The customer portal is a mobile-first PWA where CustomerContacts log in to self-serve. See SPEC §11 for scope and `docs/mockups/index.html` screens 47–58 for the UI. This section captures the operational flows that touch both office and customer sides.

### 17.1 Sign-up flow (automatic)

1. Office staff finalizes a contract or sale.
2. `Contract.status` transitions to `ACTIVE` (or `DELIVERY_RECEIPT` is finalized).
3. Trigger fires — for each `CustomerContact` of this customer with `phone1` set and `portalEnabled=false`:
   - Generate 10-char random password (no ambiguous chars).
   - Bcrypt-hash → `passwordHash`. Set `mustChangePassword=true`, `portalEnabled=true`, `signupSmsSentAt=now()`.
   - Queue `SMS_PORTAL_WELCOME` template, rendered in the contact's `language`, to `phone1`.
4. SMS arrives on customer's phone with portal URL + initial password.
5. Customer taps URL → portal login page.
6. Customer logs in with `phone1 + initial password`.
7. Portal forces password change (mustChangePassword screen) before any other page renders.
8. Customer sets new password → `mustChangePassword=false`, `lastLoginAt` updated.

> Office staff cannot disable the welcome SMS for a specific contact except by setting `portalEnabled=false` (which then blocks login entirely). Opt-out is granular per channel via `smsOptIn` for non-onboarding SMS; the welcome SMS is treated as transactional and always sent.

### 17.2 Portal use — typical visit cycle

| Day | Customer action | System reaction |
|---|---|---|
| Day -3 | Portal home shows "다음 방문: 5/27" | SMS reminder sent at T-24h |
| Day 0 | Tech visits, completes work | Visit status → COMPLETED; customer sees update in portal next refresh |
| Day +1 | Portal payments screen shows receipt + next billing | — |

### 17.3 Service request flow

Customer flow (mockup screen 52):
1. Portal "+ 서비스 요청" button → type selector (6 types from SPEC §6.5)
2. Customer picks affected equipment, writes description, optionally attaches photos
3. Submit → `ServiceRequest.status = SUBMITTED`, SMS `SMS_SERVICE_REQUEST_RECEIVED` sent back

Free types (`INSPECTION` / `CONSULTATION` / warranty `FAULT_REPORT`):
4a. System auto-transitions to `AUTO_APPROVED` → `SCHEDULED` (Visit row created, technician TBD by office)
5a. SMS `SMS_SERVICE_REQUEST_APPROVED` sent with proposed date

Paid types (`RELOCATION` / `PART_REPLACEMENT` / out-of-warranty `FAULT_REPORT`):
4b. Office (any STAFF+) sees it in `/admin/service-requests` inbox (mockup screen 57)
5b. Staff reviews, sets `quotedAmount`, transitions to `APPROVED` (or `REJECTED` with reason)
6b. Approved → Visit auto-created → SMS `SMS_SERVICE_REQUEST_APPROVED` with date + price
6c. Rejected → SMS to customer with reason

### 17.4 Multi-OPS_CONTACT management

A `CONTRACT_PARTY` logs into the portal and can:
- Add a new OPS_CONTACT (name, title, phone, language). System sends `SMS_PORTAL_WELCOME` to the new contact's phone immediately.
- Edit an existing OPS_CONTACT (only their profile fields — not the auth state).
- Delete an OPS_CONTACT (which sets `portalEnabled=false` and revokes their sessions). If the deleted contact was `isPrimary`, CONTRACT_PARTY must designate a new primary OR the system auto-promotes the most recently-active OPS.
- Toggle `isPrimary` on one of the OPS_CONTACTs.

Office (MANAGER+) can do the same from the office app. CONTRACT_PARTY identity itself is editable only by MANAGER+.

### 17.5 Password reset (office-driven)

Trigger: customer calls office "I lost my password" OR office detects suspicious lockout.

1. MANAGER+ opens the customer detail → contact card → "비밀번호 초기화" button (mockup screen 58)
2. Confirmation modal: "정말 초기화? 새 SMS가 발송됩니다."
3. On confirm — system generates new 10-char password, bcrypt-hashes, sets `mustChangePassword=true`, queues `SMS_PASSWORD_RESET` template, writes audit log.
4. (Optional, per Q F.5) Revoke existing CustomerSession rows — default v1 behavior is **keep existing sessions valid** since the user can simply log out from active session.
5. Customer receives SMS; logs in with new password; portal forces another password change.

### 17.6 Lockout (default policy until Q F.6 confirms)

- 5 consecutive failed logins → `lockedUntil = now() + 15 min`
- After lock expires, counter resets on first success
- Office can manually clear lock from customer detail (sets `lockedUntil=null` + `failedLoginCount=0`)

### 17.7 Notification channel selection — SMS vs Email (2026-05-26)

전송 채널은 **메시지 유형 + 긴급도 + 고객 컨택트 정보 가용성**에 따라 자동 선택됩니다. 설계 의도: 비-시급성 알림은 이메일로 보내고 SMS는 시급성·보안성 알림에만 사용 → SMS 비용 ~60% 절감 + 고객 SMS 피로도 감소.

**채널 분류 (10개 알림 유형):**

| 알림 유형 | 채널 | 이유 |
|---|---|---|
| 포털 가입 안내 (credentials) | **SMS + Email** (hybrid) | 보안 (SMS) + 장문 안내 (Email) |
| 비밀번호 초기화 | **SMS only** | 보안 (전화번호 = 로그인 ID) |
| 방문 D-1 알림 | **SMS only** | 즉시 행동 필요 |
| 필터 교체 D-14 안내 | **Email only** | 14일 여유, 정보성 |
| 서비스 요청 접수 확인 | **Email only** | 단순 확인 |
| 서비스 요청 승인 (유료) | **SMS + Email** | SMS = 비용+일정 / Email = 상세 견적 |
| 서비스 요청 승인 (무상) | **Email only** | 비용 약속 없음 |
| 서비스 요청 반려 | **SMS only** | 고객 대기 중 — 즉시 전달 |
| 방문 완료 + 작업확인서 | **Email only** | PDF 첨부, 사후 영수증 |
| 미수금 D+7 / D+14 | **Email only** | 1-2차 정중한 안내 |
| 미수금 D+30 | **SMS only** | 최종 escalation |
| 계약 만료 D-60 / D-30 | **Email only** | 사전 안내, 옵션 비교 |
| 계약 만료 D-7 | **SMS only** | 최종 알림 |

**Fallback 규칙:**
- `CustomerContact.email`이 비어있으면 → email-only 알림은 SMS (압축형 본문)로 fallback
- `CustomerContact.phone1`이 비어있으면 → SMS-only 알림은 email로 fallback (덜 시급한 형태)
- 둘 다 비어있으면 → admin 대시보드에 오류 로그 (사무실이 컨택트 정보 보완 필요)

구현: `src/lib/notifications/router.ts` — 각 템플릿이 `smsAllowed`/`emailAllowed` 플래그 선언, 라우터가 컨택트의 가용 채널과 매칭. 자세한 매트릭스 + 본문은 `docs/DOCUMENT_TEMPLATES.md` §A/§B/§C 참조.

**포털 URL (A.10 client answer 2026-05-26)**: 포털은 서브도메인 **`portal.seoulaqua.com.vn`** 에서 운영. 회사 메인 도메인 `seoulaqua.com.vn`은 마케팅 사이트 + 사무실 앱 + 이메일 발신자용으로 유지. 이 결정으로 SMS URL이 16자 → 23자로 증가하여 `SMS_VISIT_REMINDER` VI가 1-seg에서 2-seg로 늘어남 (+712K VND/월 비용 증가).

**Mock-first 개발 환경 (2026-05-26 결정)**: Dev/staging에서는 SMS/Email 모두 **mock provider**가 기본값. `SMS_PROVIDER=mock` + `EMAIL_PROVIDER=mock` 환경에서는:
- 실제 외부 발송 없음 — 콘솔에 로그 + `SmsLog`/`EmailLog` 테이블에 `status='MOCKED'`로 기록
- 변수 치환·언어 선택·채널 라우팅 등 모든 파이프라인은 production과 동일
- 어드민 "Notifications sent" 대시보드에서 `MOCKED` 배지로 구분 표시
- 전체 알림 flow를 외부 서비스 의존 없이 end-to-end 테스트 가능

**Production 전환**: eSMS Brandname 승인 (F.4) + Resend 가입 (F.7) + DKIM/SPF (A.14)가 모두 준비되면 production 환경에서만 env 변경:
- `SMS_PROVIDER=esms` + `ESMS_API_KEY` / `ESMS_SECRET_KEY` / `ESMS_BRANDNAME=SeoulAqua`
- `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` / `EMAIL_FROM=noreply@seoulaqua.com.vn`

코드 재배포만 하면 자동으로 실제 발송 모드로 전환 — 코드 수정 불필요.

---

## 18. Things explicitly NOT in the company today (gaps)

These are the gaps the system can FILL or MUST AVOID assuming. Updated 2026-05-26 — items struck through are no longer gaps thanks to Phase 3.5.

- **No CRM** today — partially filled (customer portal + service requests are the first CRM-shaped surface)
- ~~**No customer portal**~~ — **Phase 3.5 ships v1**
- ~~**No SMS / email automation**~~ — **Phase 3.5 ships two-channel notification: SMS (eSMS.vn) for urgent + Email (Resend) for non-urgent**. Dev/staging uses mock providers (logged to console + DB) — production swaps via env var when credentials land. See §17.7 for channel selection rule + mock-first dev workflow.
- **No e-invoice integration** (tax invoices issued from a separate external program)
- **No mobile technician app** — they use printed daily lists today
- **No real inventory system** — filter master exists but stock count "현재 관리를 안 해 맞지 않음" (per the CSV note)
- **No filter-equipment compatibility data** — coming soon per client

---

## 19. Vocabulary (KR ↔ VI ↔ EN)

See `.claude/CLAUDE.md` § "Domain Vocabulary" for the canonical table — that's the source-of-truth for naming inside the codebase, UI strings, and i18n keys.

---

## Change log

- **2026-06-03** — v0.4. §13.1/§13.2 updated for Phase 6 visit-document kinds (`DELIVERY_RECEIPT`, `SALE_RECEIPT_B2C`, `DELIVERY_SLIP_B2B`, `PERIODIC_CHECK_B2C`, `PERIODIC_CHECK_B2B`, `WORK_CONFIRMATION`). Detailed matrix + issuance policy live in `docs/DOCUMENT_TEMPLATES.md` §0/§0.1; Office "오늘의 배정" board + bulk-print landed at `/o/{locale}/schedule-board` and `/o/{locale}/visits/print` (see `docs/USER_WORKFLOWS.md` §8.6/§8.7).
- **2026-05-26** — v0.3. §17 (Customer Portal Workflow) added — sign-up flow, service request flow, multi-OPS management, password reset, lockout. §18 (gaps) updated — portal + SMS no longer gaps. §19 was §18 (Vocabulary).
- **2026-05-26** — v0.2. §8.6 (two-contact model) added.
- **2026-05-25** — v0.1 distillation. Source: `reference/process/*.pdf` (both files). All quotations marked with `> ` come verbatim from the PDFs (in original Korean). Cross-references to `SPEC.md` and `QUESTIONS.docx` noted inline.
