# DOCUMENT TEMPLATES — Paper Forms → Digital Flow

> Catalog of every paper form Seoul Aqua uses today, where it's used, and what its digital replacement looks like in SOMS.

Source PDFs live in `reference/forms/`. The 10 forms map to ~6 logical digital documents in v1.

> **Two-contact routing rule** (SPEC §3.3.1): each customer has a `CONTRACT_PARTY` (계약 주체, signatory) and an `OPS_CONTACT` (관리 주체, day-to-day) with independent languages. Every PDF / SMS / email below specifies which contact's language drives the render and which contact's channel receives it. See the workflow summary at the end for the full matrix.

---

## Form catalog

### 1. `임대 계약서.pdf` — B2B Rental Contract

| Aspect | Detail |
|---|---|
| Used when | New B2B rental contract |
| Whom | B2B customer |
| Languages | Korean + Vietnamese side by side (bilingual) |
| Pages | ~9 |
| Signed by | Customer (manager), Seoul Aqua (Mr. CHOI ONE HO) |
| Return path | Customer signs → courier (EMS) back to Seoul Aqua HQ — sometimes 1-2 weeks delay |
| Digital replacement (SOMS) | `Document` kind = `RENTAL_CONTRACT_B2B`. Server-rendered PDF from Contract data. Photo-of-signed-paper uploaded at install; physical original tracked via `physicalReceivedAt` |
| Fields | Customer name, address, MST (tax code), contact, equipment table (model, qty, monthly fee, term, location), filter replacement cycle table, 13 clauses of Ts&Cs |
| Open items | Pricing same across customers? Per Q&A: "주로 동일하는데 동일하지 않을 경우도 있습니다" → editable per contract. B2B contracts CAN be amended per customer; B2C cannot. |

### 2. `가정집 임대 계약서.pdf` — B2C Rental Contract

| Aspect | Detail |
|---|---|
| Used when | New B2C rental contract |
| Whom | B2C customer (가정집) |
| Languages | Korean + Vietnamese bilingual |
| Pages | ~8 |
| Signed by | Customer (individual, with CCCD / Passport #), Seoul Aqua |
| Return path | Technician brings signed copy back next day to office |
| Digital replacement | `Document` kind = `RENTAL_CONTRACT_B2C`. Same flow as B2B but never amended (per client) |
| Fields | Customer name, CCCD/Passport number + issue date + place, address, equipment table, filter cycle, 13 clauses (with §9 auto-renewal-as-maintenance) |
| Differences from B2B contract | Adds §9 auto-conversion to Maintenance after 36 months if neither party terminates 1 month ahead; B2C never amended |

### 3. `출고서.pdf` — B2B Delivery Slip

| Aspect | Detail |
|---|---|
| Used when | Initial delivery of equipment to a B2B customer (sale OR rental) |
| Whom | B2B customer recipient at install |
| Languages | Vietnamese (Mẫu số 02-VT — standard Vietnamese government form) |
| Pages | 1 |
| Signed by | Phụ Trách (manager), Người giao hàng (deliverer), Người nhận hàng (recipient), Thủ kho (warehouse) — 4 signatures |
| Return path | Multiple copies — one to customer, one returned to office same/next day |
| Digital replacement | `Document` kind = `DELIVERY_SLIP_B2B`. Standard MoF form; pre-filled with customer + items. PDF signed digitally OR photo-of-paper |
| Fields | Customer name + address + contact + phone, items list (name, unit, qty requested, qty actually issued), reason for issue (e.g., "bán cho K/H"), note (payment terms) |
| Critical note | Vietnamese government form — format dictated by `QĐ số 48/2006/QĐ-BTC`. Format must match exactly OR be replaced by an e-invoice (Phase 6+). |

### 4. `납품서 (영수증 겸용).pdf` — Universal Delivery + Receipt

| Aspect | Detail |
|---|---|
| Used when | **Universal — both B2C and B2B sale** (per client Q&A: "시스템에 적용하면 납품서 (영수증 겸용)만 사용하시면 될 것 같습니다") |
| Whom | Any customer at sale time |
| Languages | Korean + Vietnamese bilingual |
| Pages | 1 |
| Signed by | Customer (recipient/payer), staff (giver/receiver), warehouse |
| Return path | Tech brings back next day (B2C) or courier (B2B) |
| Digital replacement | `Document` kind = `DELIVERY_RECEIPT` — the v1 default for ALL sales (sale = single transaction with both delivery and payment receipt). Pre-filled from sale transaction. |
| Fields | Customer name, address, tax code (B2B), date, payment method (현금/카드 - cash/card/transfer), itemized list (name in 품명/Tên Hàng, quantity, unit price 단가, total 합계), grand total, signatures |
| Replaces in new system | `판매 영수증 (출고서 겸용) - 가정집` and the per-item `출고서` for sale flow. (B2B may still need `출고서` for warehouse-control compliance; verify with client.) |

### 5. `판매 영수증 (출고서 겸용) - 가정집.pdf` — B2C Sale Receipt

| Aspect | Detail |
|---|---|
| Used when | B2C sale of any product (one-time purchase, including loose filters/parts) |
| Whom | B2C customer |
| Languages | Korean + Vietnamese bilingual (with logo on top) |
| Pages | 1 (duplicate on same page — customer copy + office copy) |
| Signed by | Customer (확인), staff (담당자) |
| Return path | Tech brings office copy next day |
| Digital replacement | `Document` kind = `SALE_RECEIPT_B2C`. **Per client, in the new system this is collapsed into `DELIVERY_RECEIPT`** above. Keeping separate enum for back-compat only. |
| Fields | Customer name, address, bank account info, date, total, itemized line items (filter packs, etc.), grand total |
| Note | Sample shows it being used for filter bundle sales — e.g., 6.8M VND filter set. |

### 6. `정기 정검표 - 가정집.pdf` — B2C Periodic Inspection / Receipt

| Aspect | Detail |
|---|---|
| Used when | Each B2C periodic visit (rental customer monthly visit) — combines inspection report + payment receipt |
| Whom | B2C rental customer |
| Languages | Korean + Vietnamese bilingual, with Seoul Aqua logo |
| Pages | 1 (duplicate — tech copy + customer copy) |
| Signed by | Customer (사인 + 성함), technician (담당자) |
| Return path | Tech brings customer copy back next day |
| Digital replacement | `Document` kind = `PERIODIC_CHECK_B2C`. Pre-filled with: equipment list for that customer + filters due for replacement + this month's rent. After visit: actual changes + amount collected captured into Visit + PartReplacement + Payment, then PDF re-rendered with signature |
| Fields | Customer name + address + bank info, install date, visit date, **rental + filter charge totals**, line items (model, work content like "4월 임대료" / "PP 필터", quantity, unit price, total), outstanding balance (미납금), grand total, signatures |
| Note | This is the only doc that ties **inspection + filter change + payment receipt** all together. Volume: ~80 techs × 50 visits/week = ~4000/week. Server-render performance matters. |

### 7. `정기 점검 확인서 (고객사용).pdf` — B2B Periodic Inspection Confirmation

| Aspect | Detail |
|---|---|
| Used when | Each B2B periodic visit |
| Whom | B2B customer |
| Languages | Vietnamese (with Seoul Aqua logo) |
| Pages | 2 |
| Signed by | Technician (KỸ THUẬT VIÊN), Customer (XÁC NHẬN KHÁCH HÀNG) |
| Return path | B2B customer-staff signs on site; sometimes sent to office by post |
| Digital replacement | `Document` kind = `PERIODIC_CHECK_B2C`. Sample shows a single B2B customer with **64 devices** across multiple buildings (2A, 2B, 2C, 2D, R&D, Building, Lectra, MRO, KTX, Nhà ăn). Listed per device + location |
| Fields | Customer name + address + phone, date, table of all devices serviced: STT (#), Vị trí (location), Mã số (equipment code), SL (qty), Model, Nội dung công việc (work content e.g. "Bảo trì, vệ sinh máy - Thay lọc 3,4"), Ghi chú (notes); total at bottom; signatures |
| Critical | **No prices.** Per client Q&A. B2B payment is via separate tax invoice issued by office after. |
| Open items | Q&A Q2 ("are filters listed because they're free?") and Q3 ("how is internally-replaced filter recorded?") were **unanswered** by the client. → Captured as `QUESTIONS.docx` items E.2 and E.3. |

### 8. `물품 주문서.pdf` — Internal Purchase Order

| Aspect | Detail |
|---|---|
| Used when | Seoul Aqua office orders parts from a vendor/supplier |
| Whom | **Vendor (NOT customer)** — per client Q&A: "이건 회사에서 상품을 주문/오더 할 때 직원들이 사용하는 양식입니다. 고객과 상관이 없습니다." |
| Languages | Vietnamese (with logo) |
| Pages | 1 |
| Signed by | NGƯỜI LẬP (creator), NGƯỜI KIỂM TRA (checker), QUẢN LÝ (manager), GIÁM ĐỐC (director) — 4-step internal approval |
| Return path | N/A — internal doc; vendor confirms via XÁC NHẬN CỦA NHÀ CUNG CẤP block |
| Digital replacement | `Document` kind = `PURCHASE_ORDER`. **Admin-only**, not customer-facing. Out of scope for v1 phases 1-7 — likely Phase 8 or later. Listed here only for completeness so technicians don't get confused if they see one. |
| Fields | Vendor name + address + MST, PO number, date, currency, payment terms (3 checkboxes: prepay / deposit / pay-on-delivery), delivery time, items (name, code, unit, qty, unit price, total, note), VAT calc, grand total, address for delivery, 4 signatures |

### 9. `작업확인서.pdf` — Ad-hoc Service Work Confirmation

| Aspect | Detail |
|---|---|
| Used when | Any **ad-hoc service** — repair, relocation, paid filter change, troubleshooting (B2C and B2B both) |
| Whom | Any customer when an unplanned/non-periodic visit happens |
| Languages | Korean + Vietnamese bilingual |
| Pages | 1 (duplicate on same page — customer + office) |
| Signed by | Customer (확인자) |
| Return path | Tech brings office copy back next day |
| Digital replacement | `Document` kind = `WORK_CONFIRMATION`. Generated when a Visit's type = REPAIR / RELOCATION / OTHER. Pre-filled with customer + equipment + arrival time |
| Fields | 현장명 (site), 장비명 (equipment model), 기사명 (tech name), 작업시간 (오전 / 오후 time), 작업내용 (free-text), 교체부품 (parts replaced), 수량, signature |
| Note | The simplest of the forms — quick free-text. Optimized for fast on-site completion. |

### 10. (Implicit) Tax Invoice — `세금계산서` — referenced but not provided

| Aspect | Detail |
|---|---|
| Used when | Office issues monthly invoice for B2B rental + maintenance customers |
| Whom | B2B customer who needs Vietnamese tax invoice (hóa đơn GTGT) |
| Current process | Office uses **separate external program** (per client Q&A "별도의 세금계산서 프로그램 사용 중") to generate compliant Vietnamese e-invoices |
| Digital replacement (v1) | Office uploads externally-generated e-invoice PDF into Payment record. `Document` kind = `TAX_INVOICE_RECEIPT` linking to Payment. |
| Digital replacement (Phase 8+) | Direct integration with Vietnamese e-invoice provider (Viettel SInvoice / MISA / VNPT / FPT). Question `D.1` in `QUESTIONS.docx` |

---

## Document workflow summary

> **2026-06-03 update (Phase 6 visit deep-dive)** — `DocumentKind` enum extended to carry **6 active visit-document kinds** plus 2 deprecated aliases. Office issues each document manually after the visit is scheduled with a `leadTechnicianId`. See §0 below for the auto-suggestion matrix and issuance policy.

| Scenario | Customer type | Visit-document recommended (Phase 6) | Signed by | Doc language source | Office gets back |
|---|---|---|---|---|---|
| New rental contract — install day | B2C | **`DELIVERY_RECEIPT`** (장비 인수증) + Contract PDF carried alongside | **Contract Party** | Contract Party lang (contract) + Ops Contact lang (delivery receipt) | Next day (technician) |
| New sale — install day | B2C | **`SALE_RECEIPT_B2C`** (영수증 겸 인수증) | **Contract Party** | Ops Contact lang | Next day |
| New install — any contract type | B2B | **`DELIVERY_SLIP_B2B`** (Mẫu 02-VT phiếu xuất kho) + Contract PDF | **Contract Party** (manager) + warehouse + 인계자/작업자 | Contract Party lang | Post (contract) + next day (delivery slip) |
| Periodic visit | B2C | **`PERIODIC_CHECK_B2C`** (정기 점검표 — 영수증 겸) | Whoever's home (Ops Contact preferred) | **Ops Contact lang** | Next day |
| Periodic visit | B2B | **`PERIODIC_CHECK_B2B`** (정기 점검 확인서 — 가격 없음) + separate `TAX_INVOICE_RECEIPT` (from office) | Ops Contact-staff on site | Periodic check → **Ops Contact lang** · Tax invoice → **Contract Party lang** + billingEmail | Post or hand-back |
| Ad-hoc service / repair / relocation / filter swap / payment-only / other | Any | **`WORK_CONFIRMATION`** (작업확인서) | Ops Contact (or whoever signs) | **Ops Contact lang** | Next day |
| Monthly invoicing | B2B | `TAX_INVOICE_RECEIPT` (emailed) | n/a (digital) | **Contract Party lang** → Customer.billingEmail | Bank transfer reference |
| Visit reminder SMS (auto) | Any | SMS only (no PDF) | n/a | **Ops Contact lang** → Ops Contact.phone1 | n/a |
| Overdue dunning notice | Any | Email + SMS | n/a | Each in **its own** contact's language | n/a |

### 0. Visit-document auto-suggestion matrix (Phase 6 — 2026-06-03)

`src/lib/visits/document-suggest.ts → suggestVisitDocumentKind()`:

| `Visit.type` | `Customer.type` | `Contract.type` (latest active) | → DocumentKind |
|---|---|---|---|
| INSTALLATION | B2C | RENTAL | `DELIVERY_RECEIPT` |
| INSTALLATION | B2C | SALE | `SALE_RECEIPT_B2C` |
| INSTALLATION | B2B | * | `DELIVERY_SLIP_B2B` |
| PERIODIC_INSPECTION | B2C | * | `PERIODIC_CHECK_B2C` |
| PERIODIC_INSPECTION | B2B | * | `PERIODIC_CHECK_B2B` |
| REPAIR / FILTER_REPLACEMENT / RELOCATION / PAYMENT_COLLECTION / OTHER | * | * | `WORK_CONFIRMATION` |

### 0.1 Issuance policy (D3 — 2026-06-03)

`src/lib/visits/document-policy.ts → canIssueVisitDocument()` gate:

- ✅ Issuable: `state ∈ { SCHEDULED, IN_PROGRESS, COMPLETED, RESCHEDULED }` AND `leadTechnicianId` is set
- 🚫 Blocked `VISIT_UNASSIGNED`: `state = SUGGESTED`, or scheduled without a lead tech
- 🚫 Blocked `VISIT_CANCELLED`: `state = CANCELLED`
- 🚫 Blocked `VISIT_FAILED`: `state = FAILED_NO_SHOW`

Issuance is **always manual** (office STAFF+ clicks "발급" on the visit detail). Re-issuance is allowed at any time on issuable states — the previous PDF is archived (`renderer.persistWithArchive`) and a new version is generated. Both the issue and the reissue write `DOCUMENT_ISSUED` / `DOCUMENT_REISSUED` rows to the audit log with `before/after = { kind, version }`.

### 0.2 Layout rules (Phase 6)

- VI primary + KO secondary, stacked via the shared `<Bi>` component (`primary / secondary`)
- Single-line section titles: `Khách hàng / 고객`, `Phí dịch vụ / 청구 항목`, `Nội dung bảo trì / 점검 작업 내역`, `Danh sách thiết bị bảo trì / 점검 장비 목록`
- Single-line headers: `SEOUL AQUA · CÔNG TY TNHH MTV TM&DV ĐẠI Á (Seoul Aqua)`
- Watermark = company logo (200×200 pt, opacity 0.07), positioned **inside each copy block** so it survives the tear line
- Signature blocks bottom-aligned via `marginTop: auto`; when vertical space is tight the spacer collapses
- All tear-line docs MUST fit on one A4 sheet — 1-page compaction applied uniformly across padding, font sizes, sign-row heights
- `PERIODIC_CHECK_B2B` exception: ≤4 devices = 1 page, 5–10 devices = 2 pages (page 1 = customer copy, page 2 = company copy). 11+ devices is follow-up.
- `WORK_CONFIRMATION` is 2 identical pages (1=customer, 2=company) instead of 1-page tear; the layout has a 2-column visit + customer header.

### 0.3 Bulk-print (Track 4 — 2026-06-03)

`/o/{locale}/visits/print?date=YYYY-MM-DD&technicianId=<id>` — backend merges the day's per-tech bundle into a single PDF via `pdf-lib`. The page renders an `<iframe>` of that merged PDF plus a "PDF 새 탭에서 인쇄" button. For each visit:

- If `visit.type = INSTALLATION`, the **actual contract PDF** (the same file the `/o/contracts/[id]` page shows, served from `getLatestPdf({kind:'CONTRACT'})`) is appended twice (customer copy + company copy) **before** the visit document. The technician hand-carries both.
- The visit's suggested or already-issued document follows.
- Visits without an issued document trigger **auto-issuance** at print time.

TECHNICIAN can also reach an equivalent mobile view at `/f/{locale}/visits/print?date=...` scoped to their own lead visits.

---

## Digital workflow per document (v1)

```
[Visit scheduled/ contract created]
       ↓
[System pre-fills PDF template with data from Customer + Contract + Equipment + Visit]
       ↓
[Technician opens PDF on phone at customer site]
       ↓
[Customer signs:
   v1 default: technician photographs the signed paper page
   v2 (Phase 7): customer signs on tablet (touch signature)]
       ↓
[Photo / signature uploaded to S3, linked to Document record]
       ↓
[Document status: AWAITING_PHYSICAL (B2B contracts) or COMPLETE (B2C visits where paper handed off)]
       ↓
[When physical paper arrives at office: officer marks `physicalReceivedAt` → status COMPLETE]
       ↓
[Document searchable, downloadable, attached to customer profile forever]
```

---

## Signature mechanism trade-off

| Approach | Effort | UX | Legal Vietnamese acceptance |
|---|---|---|---|
| **Photo-of-paper** (v1 default) | 3 days | Familiar paper-signing flow; tech just takes a photo of the signed page | Strong — matches current practice |
| **Tablet e-signature** (v2 / Phase 7) | 2 weeks | Customer signs on tablet screen with finger; PDF embeds signature image | Vietnamese law accepts; client confirmation needed (`E.1`) |

**Recommendation:** ship v1 with photo-of-paper. Upgrade to tablet e-sig in Phase 7 once customer base is comfortable with the digital workflow.

---

## Document storage policy

- Generated PDFs: S3 / Supabase Storage path `documents/generated/{customerCode}/{documentKind}/{YYYY}/{MM}/{docId}.pdf`
- Signed images / scanned papers: `documents/signed/{customerCode}/{documentKind}/{YYYY}/{MM}/{docId}-sig.{jpg|pdf}`
- Retention: 7 years (Vietnamese statute of limitations on contracts) — `[TBC — Q15]`
- Lifecycle: hot 6 months, archive 12 months+, backup after 24 months (carries over from PMIS pattern; details TBC for Seoul Aqua scale)

---

## Notification template catalog — SMS + Email (Phase 3.5)

Templates will be rendered server-side from `src/lib/sms/templates.ts` and `src/lib/email/templates.ts` (Phase 3.5 implementation). Each has a KO + VI + EN variant; the recipient's `CustomerContact.language` selects which is sent. Variables in `{braces}` are interpolated at send time.

> **Constants assumed below**:
> - **Brand prefix (SMS)**: `[SeoulAqua] ` (12 chars incl. trailing space) — eSMS Brandname
> - **Portal URL**: `portal.seoulaqua.com.vn` (**23 chars** — client answer A.10 2026-05-26 selected subdomain over root URL; this raises SMS A.3 VI from 1-seg to 2-seg, +712K VND/mo cost regression)
> - **HQ phone placeholder**: `028-1234-5678` (13 chars)
> - **HQ email placeholder**: `cs@seoulaqua.com.vn` (CS), `noreply@seoulaqua.com.vn` (system) — see Q A.14
> - **Date format**: KO/EN `YYYY-MM-DD`, VI `DD/MM/YYYY` (per `locale_date_formats` memory)
> - **Month format**: KO/EN `YYYY-MM`, VI `T{MM}/{YYYY}` (VN shorthand)

### Channel strategy — SMS vs Email

Two-channel notification system: SMS for time-sensitive / security / dunning-final-stage; Email for receipts / acknowledgments / early advance notices / detailed summaries. Decision recorded 2026-05-26 to reduce SMS volume by ~50% and avoid customer fatigue.

| Criterion | → SMS | → Email |
|---|---|---|
| Time sensitivity | ≤24h action needed | >7 days advance notice |
| Security/credentials | ✓ (always) | ✓ defense-in-depth backup |
| Escalation stage | Final notice (D+30, D-7) | Early/middle stages (D+7, D+14, D-60, D-30) |
| Content complexity | <140 chars body | Multi-paragraph, tables, attachments |
| Cost per message | ~830 VND/seg (Big 3) | ~$0 (Resend free tier) |
| Reach | Even no-internet phones | Requires email + connectivity |

**Channel matrix (10 logical events → SMS / Email / both):**

| # | Event | SMS | Email | Note |
|---|---|:-:|:-:|---|
| 1 | Portal welcome (credentials) | ✓ | ✓ | Hybrid — SMS short, email long-form welcome |
| 2 | Password reset | ✓ | — | Security urgency; phone is the login ID |
| 3 | Visit reminder D-1 | ✓ | — | Action required tomorrow |
| 4 | Filter due in 14 days | — | ✓ | 14-day buffer; not urgent |
| 5 | Service-request received (ack) | — | ✓ | Pure acknowledgment |
| 6 | Service-request approved (paid) | ✓ | ✓ | Both — SMS for date/price, email for itemized breakdown |
| 6 | Service-request approved (free) | — | ✓ | Email only (no financial commitment) |
| 7 | Service-request rejected | ✓ | — | Customer waiting — must reach fast |
| 8 | Visit completed + work confirmation | — | ✓ | Receipt with PDF attachment |
| 9 | Payment overdue D+7 | — | ✓ | Friendly first reminder |
| 9 | Payment overdue D+14 | — | ✓ | Firmer second reminder |
| 9 | Payment overdue D+30 | ✓ | — | Final SMS escalation |
| 10 | Contract renewal D-60 | — | ✓ | Options comparison email |
| 10 | Contract renewal D-30 | — | ✓ | Action prompt email |
| 10 | Contract renewal D-7 | ✓ | — | Final SMS notice |

**Channel fallback policy**:
- `CustomerContact.email` is empty → email-only templates fall back to compressed SMS body using §A formulations
- `CustomerContact.phone1` is empty → SMS-only templates fall back to email (less time-sensitive form)
- Both empty → log error to admin dashboard; require office to update contact

---

## §A — SMS templates (urgent / time-sensitive)

7 templates sent through eSMS.vn Brandname `SeoulAqua` (CSKH / SmsType=2). All bodies have been validated against the 70 chars/segment Unicode limit (or 67 chars/seg multi-part). The eSMS Brandname application form at `docs/SMS_BRANDNAME_APPLICATION.md` contains the VI bodies submitted for telecom approval.

### SMS encoding reference

- **Unicode SMS** (any non-ASCII char — KO Hangul or VI diacritics): **70 chars/segment** (single SMS) or **67 chars/segment** (multi-part, 3 chars used for UDH header → 2-seg max = 134 chars, 3-seg max = 201 chars)
- **GSM-7 SMS** (plain ASCII): 160 chars/segment — applies to EN body without special chars; EN versions below typically fit in 1 GSM-7 segment even when KO/VI need 2 Unicode segments

### Hybrid strategy (Option C) — segment budget per SMS template

| # | Template | KO seg | VI seg | EN | Strategy |
|---|---|:-:|:-:|:-:|---|
| 1 | `SMS_PORTAL_WELCOME` | 2 | 2 | 1 (GSM-7) | 2-seg allowed — multi-variable account credentials |
| 2 | `SMS_PASSWORD_RESET` | 2 | 2 | 1 (GSM-7) | 2-seg allowed — security info + fallback contact |
| 3 | `SMS_VISIT_REMINDER` | **1** | **2** ⚠️ | 1 (GSM-7) | KO stays 1-seg (69 chars); **VI bumps to 2-seg (77 chars) after A.10 subdomain decision** — only template that regressed; ~+712K VND/mo |
| 6 | `SMS_SR_APPROVED` | 2 | 2 | 1 (GSM-7) | 2-seg allowed — financial commitment |
| 7 | `SMS_SR_REJECTED` | **1** | **1** | 1 (GSM-7) | Compressed to 1-seg (no URL needed — uses `hq_phone` instead, unaffected by URL change) |
| 9 | `SMS_PAYMENT_OVERDUE_FINAL` | 2 | 2 | 1 (GSM-7) | 2-seg allowed — D+30 final escalation |
| 10 | `SMS_CONTRACT_RENEWAL_FINAL` | 2 | 2 | 1 (GSM-7) | 2-seg allowed — D-7 final rental-expiry notice |

All char counts below verified against realistic substitutions: `{name}` = `김철수` (3) / `Nguyễn Văn A` (12); `{phone}` = `0901234567` (10); `{pwd}` = `K7m3Px9Qrt` (10); `{url}` = `portal.seoulaqua.com.vn` (**23**); `{date}` = `2026-06-15` / `15/06/2026` (10); `{req_no}` = `SR-2026-0042` (12); `{amount}` = `1,500,000` (9); `{hq_phone}` = `028-1234-5678` (13).

---

### A.1. `SMS_PORTAL_WELCOME` — sign-up (2-seg)

Sent automatically when a `CustomerContact` is first provisioned (contract activation or sale finalization, or new OPS contact added later).

| Lang | Template body | Sample char count |
|---|---|---:|
| KO | `[SeoulAqua] {name}님 환영합니다. 포털: {url} · ID: {phone} · 임시PW: {pwd}. 첫 로그인 시 비밀번호를 변경하세요.` | **109** |
| VI | `[SeoulAqua] Chào {name}. Cổng KH: {url} · ID: {phone} · MK tạm: {pwd}. Đổi MK khi đăng nhập đầu.` | **128** |
| EN | `[SeoulAqua] Welcome {name}. Portal: {url} · ID: {phone} · Temp PW: {pwd}. Change PW on first login.` | ~122 |

### A.2. `SMS_PASSWORD_RESET` — office-initiated reset (2-seg)

Sent when MANAGER+ clicks "비밀번호 초기화" on customer detail screen. Generates a new 10-char password and queues this SMS.

| Lang | Template body | Sample char count |
|---|---|---:|
| KO | `[SeoulAqua] {name}님 비밀번호 초기화. 새 PW: {pwd} · 접속 {url}. 본인 요청이 아닌 경우 {hq_phone}` | **100** |
| VI | `[SeoulAqua] MK của {name} đã đặt lại. MK mới: {pwd} · {url}. Không phải bạn? LH {hq_phone}` | **122** |
| EN | `[SeoulAqua] {name}, password reset. New PW: {pwd} · {url}. If not you: {hq_phone}` | ~107 |

### A.3. `SMS_VISIT_REMINDER` — D-1 visit alert (KO: 1-seg, VI: 2-seg ⚠️ after A.10)

Cron at 19:00 the day before any scheduled visit. Sent to primary OPS_CONTACT (or CONTRACT_PARTY if no OPS).

| Lang | Template body | Sample char count |
|---|---|---:|
| KO | `[SeoulAqua] {date} {time}, {technician} 기사 방문({service}). 변경 {url}` | **69** ✅ (still 1-seg) |
| VI | `[SeoulAqua] {date} {time}, {technician} đến ({service}). Đổi {url}` | **77** ⚠️ (now 2-seg, was 70) |
| EN | `[SeoulAqua] {date} {time}, {technician} visit ({service}). {url}` | ~82 (GSM-7, 1-seg) |

> ⚠️ **A.10 cost regression**: switching `{url}` from root `seoulaqua.com.vn` (16 chars) → subdomain `portal.seoulaqua.com.vn` (23 chars) added 7 chars and pushed VI body across the 70-char 1-seg boundary. KO body remains under the limit (69 chars). This single template change accounts for ~+712K VND/mo in SMS cost. See §A § Routing rule recap monthly cost block for the revised total.

### A.6. `SMS_SR_APPROVED` — paid request approved + visit scheduled (2-seg)

Sent ONLY for paid requests when office STAFF+ transitions a `ServiceRequest` to `APPROVED`. (Free requests skip SMS entirely — email §B.3 only.) Companion detailed email at §B.3 is sent alongside this SMS for paid requests.

| Lang | Template body | Sample char count |
|---|---|---:|
| KO | `[SeoulAqua] 요청 #{req_no} 승인. 비용 {amount}₫ · 방문 {date}. 동의 {url}` | **90** |
| VI | `[SeoulAqua] YC #{req_no} duyệt. Chi phí: {amount}đ · Hẹn: {date}. XN: {url}` | **101** |
| EN | `[SeoulAqua] Request #{req_no} approved. Cost: {amount} VND · Visit: {date}. Confirm: {url}` | ~117 |

### A.7. `SMS_SR_REJECTED` — request denied (1-seg, no URL)

Sent when office STAFF+ marks a request `REJECTED`. URL omitted since the request lifecycle ends; HQ phone provided for follow-up.

| Lang | Template body | Sample char count |
|---|---|---:|
| KO | `[SeoulAqua] 요청 #{req_no} 반려. 사유: {reason}. 문의 {hq_phone}` | **61** ✅ |
| VI | `[SeoulAqua] YC #{req_no} từ chối. Lý do: {reason}. LH {hq_phone}` | **63** ✅ |
| EN | `[SeoulAqua] Request #{req_no} declined. Reason: {reason}. Contact {hq_phone}` | ~95 (GSM-7) |

### A.9. `SMS_PAYMENT_OVERDUE_FINAL` — D+30 final escalation (2-seg)

Cron at D+30 after invoice due date. (D+7 and D+14 are email-only at §B.5.) Sent to CONTRACT_PARTY (in their language) AND all OPS_CONTACTs (in their respective languages).

| Lang | Template body | Sample char count |
|---|---|---:|
| KO | `[SeoulAqua] {name}님 {month} 임대료 {amount}₫ 미납. 결제 {url} 또는 {hq_phone}` | **91** |
| VI | `[SeoulAqua] {name}, phí thuê {month} {amount}đ chưa TT. TT: {url} hoặc {hq_phone}` | **111** |
| EN | `[SeoulAqua] {name}, {month} rental {amount} VND overdue. Pay {url} or {hq_phone}` | ~107 (GSM-7) |

### A.10. `SMS_CONTRACT_RENEWAL_FINAL` — D-7 final notice (2-seg)

Cron at D-7 before `Contract.endDate` (36-month rental). (D-60 and D-30 are email-only at §B.6.) Offers ownership-transfer or maintenance-plan transition as last reminder. Sent to CONTRACT_PARTY only.

| Lang | Template body | Sample char count |
|---|---|---:|
| KO | `[SeoulAqua] {name}님 임대 만료 {date} (잔여 {days}일). 소유권 이전 또는 유지관리 {url} / {hq_phone}` | **101** |
| VI | `[SeoulAqua] {name}, HĐ thuê hết hạn {date} (còn {days} ngày). Chuyển SH/bảo trì: {url} / {hq_phone}` | **124** |
| EN | `[SeoulAqua] {name}, rental ends {date} ({days} days left). Transfer/maintenance: {url} / {hq_phone}` | ~122 (GSM-7) |

---

## §B — Email templates (non-urgent / detailed)

8 email templates (some with multiple D-stage variants) sent through `src/lib/email/provider.ts` (provider TBD — see Q F.7). Plain-text bodies below; HTML rendering deferred to Phase 3.5 implementation (will use same plain text + a shared `<EmailLayout>` template).

### Email constants

- **From**: `Seoul Aqua <noreply@seoulaqua.com.vn>` (system) or `Seoul Aqua <cs@seoulaqua.com.vn>` (customer-replyable)
- **Reply-To**: `cs@seoulaqua.com.vn` (CS team inbox)
- **Subject prefix**: `[Seoul Aqua]` (matches SMS brand for visual consistency)
- **Body charset**: UTF-8
- **No character limit** (vs SMS) — bodies aim for ~150–500 words for readability
- **DKIM / SPF / DMARC**: required for `portal.seoulaqua.com.vn` sender domain — see Q A.14

### B.1. `EMAIL_PORTAL_WELCOME` — long-form sign-up companion

- **Trigger**: same as `SMS_PORTAL_WELCOME` (A.1) — fires alongside the SMS when contact has email set
- **Recipient**: the contact themselves
- **CTA**: `https://portal.seoulaqua.com.vn` (root → portal login)

**Subject:**

| Lang | Subject |
|---|---|
| KO | `[Seoul Aqua] 고객 포털 가입을 환영합니다 — 로그인 정보 안내` |
| VI | `[Seoul Aqua] Chào mừng đến cổng khách hàng — Thông tin đăng nhập` |
| EN | `[Seoul Aqua] Welcome to your customer portal — Login info` |

**Body (KO):**

```
{name}님 안녕하세요,

Seoul Aqua를 선택해주셔서 감사합니다. 고객 포털 계정이 개설되었습니다.

▸ 포털 주소: https://portal.seoulaqua.com.vn
▸ 로그인 아이디: {phone}
▸ 임시 비밀번호: {pwd}

첫 로그인 시 비밀번호 변경을 요청합니다 (보안상 필수).

포털에서 이용 가능한 서비스:
• 장비 이력 및 다음 점검 일정 확인
• 필터 교체 주기 모니터링
• 서비스 요청 제출 (정기점검 / 고장 / 교체 / 이전설치)
• 결제 이력 및 청구서 다운로드

문의: {hq_phone} / cs@seoulaqua.com.vn

Seoul Aqua 고객지원팀
```

**Body (VI):**

```
Kính chào {name},

Cảm ơn quý khách đã chọn Seoul Aqua. Tài khoản cổng khách hàng đã được kích hoạt.

▸ Địa chỉ cổng: https://portal.seoulaqua.com.vn
▸ Tên đăng nhập: {phone}
▸ Mật khẩu tạm: {pwd}

Vui lòng đổi mật khẩu khi đăng nhập lần đầu (yêu cầu bảo mật).

Dịch vụ qua cổng:
• Xem lịch sử thiết bị và lịch bảo trì sắp tới
• Theo dõi chu kỳ thay lõi lọc
• Gửi yêu cầu dịch vụ (bảo trì / báo lỗi / thay thế / di dời)
• Lịch sử thanh toán và tải hóa đơn

Liên hệ: {hq_phone} / cs@seoulaqua.com.vn

Đội ngũ CSKH Seoul Aqua
```

**Body (EN):**

```
Dear {name},

Thank you for choosing Seoul Aqua. Your customer portal account has been activated.

▸ Portal URL: https://portal.seoulaqua.com.vn
▸ Login ID: {phone}
▸ Temporary password: {pwd}

Please change your password on first login (required for security).

What you can do in the portal:
• View equipment history and upcoming visit schedule
• Monitor filter replacement cycles
• Submit service requests (inspection / fault / replacement / relocation)
• Access payment history and download invoices

Contact: {hq_phone} / cs@seoulaqua.com.vn

Seoul Aqua Customer Support
```

### B.2. `EMAIL_FILTER_DUE_SOON` — D-14 filter replacement notice

- **Trigger**: cron D-14 before computed filter next-replacement date
- **Recipient**: primary OPS_CONTACT (CC CONTRACT_PARTY)
- **CTA**: `https://portal.seoulaqua.com.vn/equipment/{equipment_id}/book-visit`

**Subject:**

| Lang | Subject |
|---|---|
| KO | `[Seoul Aqua] {equipment} 필터 교체 시기 안내 ({days}일 후)` |
| VI | `[Seoul Aqua] Đến hạn thay lõi lọc — {equipment} (còn {days} ngày)` |
| EN | `[Seoul Aqua] Filter replacement due in {days} days — {equipment}` |

**Body (KO):**

```
{name}님,

귀하의 {equipment}의 필터가 {days}일 후 교체 시기에 도달합니다.

▸ 권장 교체일: {date}
▸ 임대 고객: 무상 교체
▸ 판매/유지관리 고객: 부품비용 별도 (포털에서 견적 확인)

방문 예약: https://portal.seoulaqua.com.vn

기사 방문 일정은 D-3일까지 확정 SMS로 안내드립니다.

문의: {hq_phone}
```

**Body (VI):**

```
Kính chào {name},

Lõi lọc của thiết bị {equipment} sẽ đến hạn thay trong {days} ngày tới.

▸ Ngày khuyến nghị: {date}
▸ Khách thuê: thay miễn phí
▸ Khách mua / bảo trì: phí vật tư riêng (xem báo giá tại cổng)

Đặt lịch: https://portal.seoulaqua.com.vn

Lịch KTV sẽ được xác nhận qua SMS trước 3 ngày.

Liên hệ: {hq_phone}
```

**Body (EN):**

```
Dear {name},

The filter on your {equipment} is due for replacement in {days} days.

▸ Recommended date: {date}
▸ Rental customers: replaced free of charge
▸ Sale/Maintenance customers: parts billed separately (see portal for quote)

Book a visit: https://portal.seoulaqua.com.vn

Technician schedule will be confirmed via SMS 3 days prior.

Contact: {hq_phone}
```

### B.3. `EMAIL_SR_RECEIVED` — service-request acknowledgment

- **Trigger**: `ServiceRequest.status` ← `SUBMITTED`
- **Recipient**: the submitting CustomerContact
- **CTA**: `https://portal.seoulaqua.com.vn/requests/{req_no}`

**Subject:**

| Lang | Subject |
|---|---|
| KO | `[Seoul Aqua] 서비스 요청 접수 #{req_no}` |
| VI | `[Seoul Aqua] Đã nhận yêu cầu dịch vụ #{req_no}` |
| EN | `[Seoul Aqua] Service request #{req_no} received` |

**Body (KO):**

```
{name}님,

서비스 요청이 접수되었습니다.

▸ 요청 번호: #{req_no}
▸ 유형: {type}
▸ 접수 시간: {received_at}
▸ 예상 회신: 1영업일 내

요청 내용 확인: https://portal.seoulaqua.com.vn/requests/{req_no}

무상 요청(정기점검 등)은 자동으로 방문 일정이 잡힙니다.
유상 요청은 사무실 검토 후 견적과 함께 회신드립니다.

문의: {hq_phone}
```

**Body (VI):**

```
Kính chào {name},

Yêu cầu dịch vụ đã được tiếp nhận.

▸ Số yêu cầu: #{req_no}
▸ Loại: {type}
▸ Thời gian nhận: {received_at}
▸ Phản hồi dự kiến: trong 1 ngày làm việc

Theo dõi: https://portal.seoulaqua.com.vn/requests/{req_no}

Yêu cầu miễn phí (bảo trì định kỳ...) sẽ được xếp lịch tự động.
Yêu cầu có phí sẽ được xét duyệt và báo giá từ văn phòng.

Liên hệ: {hq_phone}
```

**Body (EN):**

```
Dear {name},

We have received your service request.

▸ Request number: #{req_no}
▸ Type: {type}
▸ Received: {received_at}
▸ Expected response: within 1 business day

Track: https://portal.seoulaqua.com.vn/requests/{req_no}

Free requests (periodic inspection, etc.) will be scheduled automatically.
Paid requests will receive a quote and approval from the office.

Contact: {hq_phone}
```

### B.4. `EMAIL_SR_APPROVED` — detailed approval companion to SMS A.6

- **Trigger**: `ServiceRequest.status` ← `APPROVED` (paid) or `AUTO_APPROVED` (free)
- **Recipient**: submitter + CONTRACT_PARTY (if paid)
- **CTA**: `https://portal.seoulaqua.com.vn/requests/{req_no}`

**Subject:**

| Lang | Subject |
|---|---|
| KO | `[Seoul Aqua] 요청 #{req_no} 승인 — 견적 및 방문 일정` |
| VI | `[Seoul Aqua] Yêu cầu #{req_no} đã duyệt — Báo giá + lịch` |
| EN | `[Seoul Aqua] Request #{req_no} approved — Quote + visit schedule` |

**Body (KO):**

```
{name}님,

서비스 요청이 승인되었습니다.

▸ 요청 번호: #{req_no}
▸ 유형: {type}
▸ 견적 (세부):
{itemized_table}
▸ 합계: {amount}₫ (VAT 10% 포함)
▸ 방문 예정일: {date} {time}
▸ 담당 기사: {technician}

승인 / 거절: https://portal.seoulaqua.com.vn/requests/{req_no}

24시간 내 응답이 없으면 일정대로 진행됩니다.

문의: {hq_phone}
```

**Body (VI):**

```
Kính chào {name},

Yêu cầu dịch vụ đã được duyệt.

▸ Số yêu cầu: #{req_no}
▸ Loại: {type}
▸ Báo giá (chi tiết):
{itemized_table}
▸ Tổng: {amount}đ (đã VAT 10%)
▸ Ngày hẹn: {date} {time}
▸ KTV phụ trách: {technician}

Đồng ý / Từ chối: https://portal.seoulaqua.com.vn/requests/{req_no}

Nếu không phản hồi trong 24h, chúng tôi sẽ tiến hành theo lịch.

Liên hệ: {hq_phone}
```

**Body (EN):**

```
Dear {name},

Your service request has been approved.

▸ Request number: #{req_no}
▸ Type: {type}
▸ Itemized quote:
{itemized_table}
▸ Total: {amount} VND (incl. 10% VAT)
▸ Scheduled: {date} {time}
▸ Technician: {technician}

Confirm / Decline: https://portal.seoulaqua.com.vn/requests/{req_no}

If no response within 24h, we'll proceed as scheduled.

Contact: {hq_phone}
```

### B.5. `EMAIL_VISIT_COMPLETED` — work confirmation with PDF attachment

- **Trigger**: technician marks `Visit.status = COMPLETED`
- **Recipient**: primary OPS_CONTACT + CONTRACT_PARTY
- **Attachment**: `work-confirmation-{visit_no}.pdf` (signed scan)
- **CTA**: `https://portal.seoulaqua.com.vn/equipment`

**Subject:**

| Lang | Subject |
|---|---|
| KO | `[Seoul Aqua] {date} 방문 완료 — 작업확인서 (#{visit_no})` |
| VI | `[Seoul Aqua] Hoàn tất ngày {date} — Phiếu công việc (#{visit_no})` |
| EN | `[Seoul Aqua] Visit completed {date} — Work confirmation (#{visit_no})` |

**Body (KO):**

```
{name}님,

오늘 방문 작업이 완료되었습니다. 서명된 작업확인서를 첨부합니다.

▸ 방문 번호: #{visit_no}
▸ 일시: {date} {time}
▸ 담당 기사: {technician}
▸ 작업 내역: {summary}
▸ 교체 부품: {parts_replaced}
▸ 다음 점검 예정일: {next_date}

▸ 첨부: 작업확인서.pdf (서명본)

장비 상세 확인: https://portal.seoulaqua.com.vn/equipment

이번 방문에 대한 피드백은 1주일 내 SMS로 안내드립니다.

문의: {hq_phone}
```

**Body (VI):**

```
Kính chào {name},

Lượt thăm hôm nay đã hoàn tất. Phiếu công việc đã ký kèm theo.

▸ Số phiếu: #{visit_no}
▸ Thời gian: {date} {time}
▸ KTV: {technician}
▸ Hạng mục: {summary}
▸ Phụ tùng đã thay: {parts_replaced}
▸ Lượt kế dự kiến: {next_date}

▸ Đính kèm: Phieu-cong-viec.pdf (đã ký)

Xem chi tiết thiết bị: https://portal.seoulaqua.com.vn/equipment

Chúng tôi sẽ gửi SMS đánh giá trong 1 tuần tới.

Liên hệ: {hq_phone}
```

**Body (EN):**

```
Dear {name},

Today's visit has been completed. Signed work confirmation is attached.

▸ Visit number: #{visit_no}
▸ Time: {date} {time}
▸ Technician: {technician}
▸ Work performed: {summary}
▸ Parts replaced: {parts_replaced}
▸ Next visit scheduled: {next_date}

▸ Attachment: work-confirmation.pdf (signed)

View equipment details: https://portal.seoulaqua.com.vn/equipment

A satisfaction survey SMS will follow within 1 week.

Contact: {hq_phone}
```

### B.6. `EMAIL_PAYMENT_OVERDUE_D7` — friendly first reminder

- **Trigger**: cron D+7 after `Invoice.dueDate`
- **Recipient**: CONTRACT_PARTY + all OPS_CONTACTs (CC)
- **CTA**: `https://portal.seoulaqua.com.vn/payments`

**Subject:**

| Lang | Subject |
|---|---|
| KO | `[Seoul Aqua] {month} 임대료 결제 안내` |
| VI | `[Seoul Aqua] Nhắc thanh toán phí thuê {month}` |
| EN | `[Seoul Aqua] Reminder — {month} rental payment` |

**Body (KO):**

```
{name}님 안녕하세요,

{month} 임대료가 아직 결제되지 않았습니다.

▸ 청구 금액: {amount}₫ (VAT 포함)
▸ 청구일: {invoice_date}
▸ 결제 기한: {due_date} (7일 지남)

결제 방법:
• 포털 온라인: https://portal.seoulaqua.com.vn/payments
• 은행 송금: {bank_info}
• 기사 방문 시 현금/카드 (다음 방문일: {next_visit})

이미 결제하셨다면 본 메일을 무시해주세요 (시스템 반영 1~2일 소요).

문의: {hq_phone} / accounts@seoulaqua.com.vn
```

**Body (VI):**

```
Kính chào {name},

Phí thuê tháng {month} của quý khách chưa được thanh toán.

▸ Số tiền: {amount}đ (đã VAT)
▸ Ngày lập HĐ: {invoice_date}
▸ Hạn TT: {due_date} (đã quá 7 ngày)

Phương thức TT:
• Online qua cổng: https://portal.seoulaqua.com.vn/payments
• Chuyển khoản: {bank_info}
• Tiền mặt/thẻ khi KTV đến (lượt kế: {next_visit})

Nếu đã TT, xin vui lòng bỏ qua email này (cập nhật hệ thống mất 1-2 ngày).

Liên hệ: {hq_phone} / accounts@seoulaqua.com.vn
```

**Body (EN):**

```
Dear {name},

Your {month} rental fee remains unpaid.

▸ Amount: {amount} VND (incl. VAT)
▸ Invoice date: {invoice_date}
▸ Due date: {due_date} (7 days overdue)

Payment options:
• Online via portal: https://portal.seoulaqua.com.vn/payments
• Bank transfer: {bank_info}
• Cash/card during technician visit (next visit: {next_visit})

If already paid, please disregard (system updates take 1-2 days).

Contact: {hq_phone} / accounts@seoulaqua.com.vn
```

### B.7. `EMAIL_PAYMENT_OVERDUE_D14` — firmer second reminder

- **Trigger**: cron D+14 after `Invoice.dueDate`
- **Recipient**: CONTRACT_PARTY + all OPS_CONTACTs (CC)
- **CTA**: `https://portal.seoulaqua.com.vn/payments`

**Subject:**

| Lang | Subject |
|---|---|
| KO | `[Seoul Aqua] {month} 미수금 안내 (2차)` |
| VI | `[Seoul Aqua] Phí thuê {month} chưa TT (Lần 2)` |
| EN | `[Seoul Aqua] Second reminder — {month} payment outstanding` |

**Body (KO):**

```
{name}님,

{month} 임대료가 결제 기한을 14일 초과했습니다.

▸ 청구 금액: {amount}₫
▸ 지연 일수: 14일
▸ 누적 연체이자 (해당 시): {late_fee}₫

▸ 다음 안내는 D+30 SMS로 진행되며, 서비스 중단 가능성이 있습니다.

즉시 결제: https://portal.seoulaqua.com.vn/payments
문의: {hq_phone}
```

**Body (VI):**

```
Kính chào {name},

Phí thuê tháng {month} đã quá hạn 14 ngày.

▸ Số tiền: {amount}đ
▸ Quá hạn: 14 ngày
▸ Phí trễ (nếu có): {late_fee}đ

▸ Thông báo kế tiếp sẽ là SMS vào D+30, có thể bị ngưng dịch vụ.

TT ngay: https://portal.seoulaqua.com.vn/payments
Liên hệ: {hq_phone}
```

**Body (EN):**

```
Dear {name},

Your {month} rental payment is now 14 days overdue.

▸ Amount: {amount} VND
▸ Overdue: 14 days
▸ Late fee (if applicable): {late_fee} VND

▸ Next notice will be via SMS at D+30, with potential service interruption.

Pay now: https://portal.seoulaqua.com.vn/payments
Contact: {hq_phone}
```

### B.8. `EMAIL_CONTRACT_RENEWAL_D60` — options comparison

- **Trigger**: cron D-60 before `Contract.endDate` (36-month rental)
- **Recipient**: CONTRACT_PARTY only
- **CTA**: `https://portal.seoulaqua.com.vn/contracts/{contract_no}/renewal`

**Subject:**

| Lang | Subject |
|---|---|
| KO | `[Seoul Aqua] 임대 계약 만료 안내 (60일 전) — 옵션 비교` |
| VI | `[Seoul Aqua] HĐ thuê sắp hết hạn (còn 60 ngày) — So sánh phương án` |
| EN | `[Seoul Aqua] Rental contract ending in 60 days — Options` |

**Body (KO):**

```
{name}님,

36개월 임대 계약이 60일 후 만료됩니다.

▸ 만료일: {date}
▸ 잔여: 60일
▸ 현재 임대 중: {equipment_list}

만료 후 3가지 옵션:

| 옵션 | 비용 | 비고 |
|---|---|---|
| 1. 소유권 이전 | 무료 | 장비 그대로 자가 소유 |
| 2. 유지관리 계약 | 월 {maintenance_fee}₫ | 무상 점검·필터 교체 지속 |
| 3. 계약 종료 | — | 장비 회수 (회수비 별도) |

각 옵션의 세부 사항은 포털에서 확인하실 수 있습니다.

옵션 선택: https://portal.seoulaqua.com.vn/contracts/renewal
문의: {hq_phone}

D-30 시점에 결정 안내 이메일이, D-7 시점에 SMS 최종 알림이 발송됩니다.
```

**Body (VI):**

```
Kính chào {name},

Hợp đồng thuê 36 tháng sẽ hết hạn trong 60 ngày tới.

▸ Ngày hết hạn: {date}
▸ Còn lại: 60 ngày
▸ Thiết bị đang thuê: {equipment_list}

3 phương án sau khi hết hạn:

| Phương án | Chi phí | Ghi chú |
|---|---|---|
| 1. Chuyển quyền sở hữu | Miễn phí | Sở hữu thiết bị |
| 2. Hợp đồng bảo trì | {maintenance_fee}đ/tháng | Bảo trì + thay lõi miễn phí |
| 3. Kết thúc HĐ | — | Thu hồi thiết bị (có phí thu hồi) |

Chi tiết từng phương án xem tại cổng khách hàng.

Chọn phương án: https://portal.seoulaqua.com.vn/contracts/renewal
Liên hệ: {hq_phone}

Email nhắc quyết định sẽ gửi vào D-30, SMS cuối cùng vào D-7.
```

**Body (EN):**

```
Dear {name},

Your 36-month rental contract will end in 60 days.

▸ End date: {date}
▸ Remaining: 60 days
▸ Equipment under rental: {equipment_list}

Three options after expiry:

| Option | Cost | Notes |
|---|---|---|
| 1. Ownership transfer | Free | Keep equipment as your own |
| 2. Maintenance contract | {maintenance_fee} VND/mo | Continued inspection + filter changes |
| 3. End contract | — | Equipment retrieval (retrieval fee applies) |

Details on each option are in the portal.

Choose: https://portal.seoulaqua.com.vn/contracts/renewal
Contact: {hq_phone}

Reminder email at D-30, final SMS at D-7.
```

### B.9. `EMAIL_CONTRACT_RENEWAL_D30` — action prompt

- **Trigger**: cron D-30 before `Contract.endDate`, sent only if customer hasn't selected an option yet
- **Recipient**: CONTRACT_PARTY only
- **CTA**: `https://portal.seoulaqua.com.vn/contracts/{contract_no}/renewal`

**Subject:**

| Lang | Subject |
|---|---|
| KO | `[Seoul Aqua] 임대 만료 임박 (D-30) — 결정 부탁드립니다` |
| VI | `[Seoul Aqua] HĐ thuê còn 30 ngày — Quyết định` |
| EN | `[Seoul Aqua] 30 days to rental expiry — please decide` |

**Body (KO):**

```
{name}님,

임대 계약 만료까지 30일 남았습니다. 아직 옵션을 선택하지 않으셨습니다.

▸ 만료일: {date}
▸ 미선택 시 기본값: 옵션 3 (계약 종료, 회수비 부과)

지금 선택: https://portal.seoulaqua.com.vn/contracts/renewal

회수비를 피하시려면 옵션 1 (소유권 이전) 또는 옵션 2 (유지관리)를 D-7 이전에 선택해주세요.

D-7 시점에 SMS 최종 안내가 발송됩니다.

문의: {hq_phone}
```

**Body (VI):**

```
Kính chào {name},

Còn 30 ngày để chọn phương án sau khi hết hạn HĐ thuê. Quý khách chưa chọn.

▸ Ngày hết hạn: {date}
▸ Mặc định nếu không chọn: PA 3 (Kết thúc HĐ, có phí thu hồi)

Chọn ngay: https://portal.seoulaqua.com.vn/contracts/renewal

Để tránh phí thu hồi, chọn PA 1 (Chuyển SH) hoặc PA 2 (Bảo trì) trước D-7.

SMS nhắc cuối sẽ gửi vào D-7.

Liên hệ: {hq_phone}
```

**Body (EN):**

```
Dear {name},

30 days remaining to choose your post-rental option. You haven't selected yet.

▸ End date: {date}
▸ Default if no selection: Option 3 (End contract, retrieval fee applies)

Select now: https://portal.seoulaqua.com.vn/contracts/renewal

To avoid retrieval fee, choose Option 1 (Transfer) or Option 2 (Maintenance) before D-7.

Final SMS will be sent at D-7.

Contact: {hq_phone}
```

### Additional email variables (beyond SMS dictionary)

These supplementary variables apply only to email templates:

| Variable | Description | Example |
|---|---|---|
| `{type}` | ServiceRequest type, full name | `정기점검` / `Bảo trì định kỳ` / `Periodic inspection` |
| `{received_at}` | Submission timestamp (locale) | `2026-06-15 14:32` / `15/06/2026 14:32` |
| `{itemized_table}` | Multi-line breakdown of parts/labor | (server-generated; see implementation note) |
| `{visit_no}` | Visit reference number | `V-2026-0857` |
| `{parts_replaced}` | List of parts changed | `Filter PP, Filter UF, Filter PCB` |
| `{invoice_date}` | Invoice issue date | `2026-04-01` / `01/04/2026` |
| `{due_date}` | Invoice due date | `2026-04-15` / `15/04/2026` |
| `{late_fee}` | Late fee amount | `150,000` |
| `{bank_info}` | Bank account string | `Vietcombank · 1234567890 · CTY ĐẠI Á` |
| `{next_visit}` | Next scheduled visit date | `2026-05-10` / `10/05/2026` |
| `{equipment_list}` | Multi-line equipment under rental | (server-generated) |
| `{maintenance_fee}` | Monthly maintenance fee after rental | `350,000` |
| `{contract_no}` | Contract reference | `C-2024-0125` |

---

## §C — Channel selection rule + fallback policy

Implementation in `src/lib/notifications/router.ts` (Phase 3.5) selects channel per template + per recipient contact info:

```
function chooseChannels(template, contact) {
  const channels = []
  if (template.smsAllowed && contact.phone1) channels.push('SMS')
  if (template.emailAllowed && contact.email) channels.push('EMAIL')

  // Fallback rules
  if (channels.length === 0) {
    if (template.smsAllowed && contact.email) channels.push('EMAIL')      // SMS-only → email backup
    else if (template.emailAllowed && contact.phone1) channels.push('SMS') // Email-only → SMS backup (uses abbreviated body)
  }

  if (channels.length === 0) {
    logAdminError(`Contact ${contact.id} has neither phone nor email; cannot deliver ${template.code}`)
  }
  return channels
}
```

**Per-template channel flags:**

| Template | smsAllowed | emailAllowed | Hybrid? |
|---|:-:|:-:|:-:|
| A.1 `SMS_PORTAL_WELCOME` + B.1 `EMAIL_PORTAL_WELCOME` | ✓ | ✓ | ✓ (both sent) |
| A.2 `SMS_PASSWORD_RESET` | ✓ | — (security via SMS only) | — |
| A.3 `SMS_VISIT_REMINDER` | ✓ | — | — |
| B.2 `EMAIL_FILTER_DUE_SOON` | — | ✓ | — |
| B.3 `EMAIL_SR_RECEIVED` | — | ✓ | — |
| A.6 `SMS_SR_APPROVED` + B.4 `EMAIL_SR_APPROVED` | ✓ paid only | ✓ | ✓ for paid; B.4 only for free |
| A.7 `SMS_SR_REJECTED` | ✓ | — | — |
| B.5 `EMAIL_VISIT_COMPLETED` | — | ✓ | — |
| B.6 `EMAIL_PAYMENT_OVERDUE_D7` | — | ✓ | — |
| B.7 `EMAIL_PAYMENT_OVERDUE_D14` | — | ✓ | — |
| A.9 `SMS_PAYMENT_OVERDUE_FINAL` (D+30) | ✓ | — | — |
| B.8 `EMAIL_CONTRACT_RENEWAL_D60` | — | ✓ | — |
| B.9 `EMAIL_CONTRACT_RENEWAL_D30` | — | ✓ | — |
| A.10 `SMS_CONTRACT_RENEWAL_FINAL` (D-7) | ✓ | — | — |

> **Note**: PASSWORD_RESET is intentionally SMS-only. Even if email is set, password reset is a security event tied to the phone-number login ID — sending it to email would be a security regression (an attacker who has email-only access shouldn't get the new password).

---

### Variable dictionary (canonical)

Implementation in `src/lib/sms/templates.ts` will use these exact keys. eSMS Brandname application uses the same keys but converted to `<<key>>` notation (see `docs/SMS_BRANDNAME_APPLICATION.md` §5).

| Variable | Description | Max length | KO example | VI example | EN example |
|---|---|---:|---|---|---|
| `{name}` | Customer contact name | 30 | `김철수` | `Nguyễn Văn A` | `John Kim` |
| `{phone}` | Phone (login ID, no spaces) | 11 | `0901234567` | `0901234567` | `0901234567` |
| `{pwd}` | Auto-generated 10-char password | 10 | `K7m3Px9Qrt` | `K7m3Px9Qrt` | `K7m3Px9Qrt` |
| `{url}` | Portal URL (always `portal.seoulaqua.com.vn`) | 16 | `portal.seoulaqua.com.vn` | `portal.seoulaqua.com.vn` | `portal.seoulaqua.com.vn` |
| `{hq_phone}` | HQ contact number | 13 | `028-1234-5678` | `028-1234-5678` | `028-1234-5678` |
| `{date}` | Date in locale format | 10 | `2026-06-15` | `15/06/2026` | `2026-06-15` |
| `{time}` | Time (24h, HH:MM) | 5 | `14:00` | `14:00` | `14:00` |
| `{technician}` | Technician name | 30 | `이기사` | `Lê Văn B` | `Le Van B` |
| `{service}` | Service type, short | 15 | `정기점검` | `Bảo trì` | `Inspection` |
| `{equipment}` | Equipment description + model | 20 | `정수기 PTS-2100` | `máy lọc PTS-2100` | `Purifier PTS-2100` |
| `{req_no}` | ServiceRequest reference number | 15 | `SR-2026-0042` | `SR-2026-0042` | `SR-2026-0042` |
| `{amount}` | VND amount (thousand-sep, no symbol) | 12 | `1,500,000` | `1,500,000` | `1,500,000` |
| `{summary}` | Work summary, short | 30 | `필터 3종 교체` | `Thay 3 lõi lọc` | `3 filters replaced` |
| `{next_date}` | Next visit date (locale format) | 10 | `2026-08-15` | `15/08/2026` | `2026-08-15` |
| `{reason}` | Rejection / decline reason | 40 | `보증기간 외` | `Hết bảo hành` | `Out of warranty` |
| `{month}` | Month identifier (locale format) | 8 | `2026-04` | `T04/2026` | `2026-04` |
| `{days}` | Days remaining (integer) | 3 | `14` | `14` | `14` |

### Routing rule recap (channel-aware)

| # | Template code | Channel | Recipient | Trigger | Volume (est.) |
|---|---|:-:|---|---|---:|
| 1 | `SMS_PORTAL_WELCOME` + `EMAIL_PORTAL_WELCOME` | SMS+Email | the contact | Contract/sale activation, new OPS added | ~50/mo |
| 2 | `SMS_PASSWORD_RESET` | SMS | the contact | MANAGER+ resets | ~10/mo |
| 3 | `SMS_VISIT_REMINDER` | SMS | primary OPS (fallback CONTRACT_PARTY) | cron D-1 19:00 | **~900/mo** |
| 4 | `EMAIL_FILTER_DUE_SOON` | Email | primary OPS (CC CONTRACT_PARTY) | cron D-14 filter cycle | ~200/mo |
| 5 | `EMAIL_SR_RECEIVED` | Email | the submitter | `ServiceRequest` ← `SUBMITTED` | ~300/mo |
| 6 | `SMS_SR_APPROVED` + `EMAIL_SR_APPROVED` (paid) | SMS+Email | submitter + CONTRACT_PARTY | `ServiceRequest` ← `APPROVED` (paid) | ~250/mo |
| 6 | `EMAIL_SR_APPROVED` only (free) | Email | submitter | `ServiceRequest` ← `AUTO_APPROVED` (free) | ~50/mo |
| 7 | `SMS_SR_REJECTED` | SMS | the submitter | `ServiceRequest` ← `REJECTED` | ~10/mo |
| 8 | `EMAIL_VISIT_COMPLETED` | Email | primary OPS + CONTRACT_PARTY | `Visit.status` ← `COMPLETED` | ~900/mo |
| 9 | `EMAIL_PAYMENT_OVERDUE_D7` | Email | CONTRACT_PARTY + OPS (CC) | cron D+7 | ~40/mo |
| 9 | `EMAIL_PAYMENT_OVERDUE_D14` | Email | CONTRACT_PARTY + OPS (CC) | cron D+14 | ~30/mo |
| 9 | `SMS_PAYMENT_OVERDUE_FINAL` | SMS | CONTRACT_PARTY + OPS | cron D+30 (final) | ~20/mo |
| 10 | `EMAIL_CONTRACT_RENEWAL_D60` | Email | CONTRACT_PARTY only | cron D-60 | ~10/mo |
| 10 | `EMAIL_CONTRACT_RENEWAL_D30` | Email | CONTRACT_PARTY only | cron D-30 (if not yet decided) | ~7/mo |
| 10 | `SMS_CONTRACT_RENEWAL_FINAL` | SMS | CONTRACT_PARTY only | cron D-7 (final) | ~5/mo |

**Monthly cost estimate (verified eSMS pricing: 830 VND/segment Brandname Unicode CSKH for "Other Business" category, incl. 10% VAT, Big 3 carriers):**

> Revised 2026-05-26 after client A.10 portal-URL decision (`portal.seoulaqua.com.vn` subdomain pushes A.3 VI 1-seg → 2-seg). Bucket changes: A.3 KO stays 1-seg, A.3 VI joins 2-seg group.

VI:KO:EN traffic mix assumed 80%:15%:5% for visit-reminder volume.

| Channel | Items | Volume × cost | Subtotal |
|---|---|---|---:|
| **SMS** 1-seg (A.3 KO + EN + A.7) | A.3 KO ~135 + A.3 EN ~45 + A.7 ~10 = ~190 | 190 × 830 | **158K VND** |
| **SMS** 2-seg (A.1, A.2, A.6, A.9, A.10 + A.3 VI) | Welcome 50 + reset 10 + SR_approved 250 + Overdue_final 20 + Renewal_final 5 + **A.3 VI ~720** = 1,055 | 1,055 × 1,660 | **1.75M VND** |
| **eSMS Brandname maintenance** (4 networks: Viettel/Mobifone/Vinaphone/Vietnamobile @ 50K/mo each; Gmobile free) | — | — | **200K VND** |
| **Email** (Resend free tier @ ~1,560 msgs/mo, well within 100K/mo free) | All B templates | — | **~0 VND** |
| **Total** | ~2,805 messages | | **≈ 2.11M VND/mo (≈ ₩114K)** |

> **Cost regression breakdown**:
> - vs previous estimate with root URL `seoulaqua.com.vn` (1.51M VND/mo): **+600K VND/mo** for the A.3 VI 1→2 seg flip (720 msgs × 830 VND extra segment)
> - vs original all-SMS design (3.98M VND/mo): still **~47% savings** through the 2-channel split
> First-month onboarding spike (Portal Welcome wave) may add 200–400K VND in the first month only.
>
> See `docs/SMS_BRANDNAME_APPLICATION.md` §8 for the full carrier × business-category pricing table and the cost-reduction options (including short-domain registration as a future option that could undo this regression).

### Vietnamese abbreviations used in compressed bodies

These are common in Vietnamese CSKH SMS; if eSMS or any carrier flags them as ambiguous during Brandname review, we have unabbreviated fallback bodies (each adds +1 segment) ready in `SMS_BRANDNAME_APPLICATION.md` §4 fallback notes.

| Abbreviation | Full term | Used in |
|---|---|---|
| `MK` | Mật khẩu (password) | #1, #2 |
| `KH` | Khách hàng (customer) | #1 |
| `YC` | Yêu cầu (request) | #5, #6, #7 |
| `TT` | Thanh toán (payment) | #9 |
| `HĐ` | Hợp đồng (contract) | #10 |
| `SH` | Sở hữu (ownership) | #10 |
| `LH` | Liên hệ (contact) | #7 |
| `XN` | Xác nhận (confirm) | #6 |
| `KTV` | Kỹ thuật viên (technician) | (avoided in current bodies — kept here for fallback) |

### Implementation note (Phase 3.5)

These canonical bodies are the source of truth for `src/lib/sms/templates.ts` (SMS §A) and `src/lib/email/templates.ts` (Email §B). The implementation will:

1. Export typed enums `SmsTemplate` (7 codes) and `EmailTemplate` (9 codes) matching this catalog exactly.
2. Use `next-intl` `formatDateTime()` to convert ISO dates → locale display format (VI `dd/MM/yyyy`, KO/EN `yyyy-MM-dd`); `formatNumber()` for VND amounts with thousand separators.
3. Read `CustomerContact.language` to select KO / VI / EN body at send time.
4. **Notification router** `src/lib/notifications/router.ts` chooses SMS / Email / both per template + per contact's available channels (`phone1`, `email`) using the rule in §C. Hybrid templates (e.g., #1 PORTAL_WELCOME) send both channels when both are present.
5. **Provider factory pattern (mock-first, 2026-05-26)**: `src/lib/sms/index.ts` and `src/lib/email/index.ts` each export a factory that reads `SMS_PROVIDER` / `EMAIL_PROVIDER` env vars and returns either:
   - **Mock** (default in dev/staging) — `src/lib/sms/mock-client.ts` / `src/lib/email/mock-provider.ts`: console-logs the rendered body and writes `SmsLog` / `EmailLog` with `provider='mock'`, `providerMessageId='mock-{nanoid}'`, `status='MOCKED'`. Same template + variable interpolation pipeline as production; only the network call is replaced.
   - **Real** (production after F.4 / F.7 / A.14 land) — `src/lib/sms/esms-client.ts` (eSMS REST, ApiKey/SecretKey, SmsType=2, Brandname=`SeoulAqua`) / `src/lib/email/resend-client.ts` (Resend API).
6. Log every send into `SmsLog` (sms-specific fields incl. `segments`, `provider`) or `EmailLog` (email-specific fields, attachment URLs, bounce/complaint webhooks, `provider`).

Provider switching is **env-only** — same code path, same DB schema, same admin UI (mocked sends show a `MOCKED` badge in the "Notifications sent" dashboard). This unblocks Phase 3.5 development from the 2-3 week eSMS Brandname registration lead-time.

See `docs/SMS_BRANDNAME_APPLICATION.md` for the client-facing eSMS Brandname application form (covers only the 7 SMS templates in §A; email templates do not require third-party registration since `portal.seoulaqua.com.vn` will be set up with DKIM/SPF/DMARC for direct sending — see Q A.14). The Brandname form is no longer Phase-3.5-blocking; submit when production launch date is known.

---

## Open form items captured in `QUESTIONS.docx`

| Form | Question ID | Question |
|---|---|---|
| 정기 점검 확인서 (B2B) | E.2 | Filter list shown without price — is this because filters are free under contract? |
| 정기 점검 확인서 (B2B) | E.3 | How are internally-replaced filter types/quantities recorded if the customer-facing form doesn't show them? |
| Tax invoice | D.1 | Which Vietnamese e-invoice provider for direct integration? (Viettel SInvoice / MISA / VNPT / FPT) |
| Tax invoice | D.5 | Some B2B customers don't need tax invoice — what triggers the no-invoice path? |
| Signature mechanism | E.1 | v1 photo-of-paper OK, or invest in tablet e-sig from start? |
| Document retention | E.4 | Confirm 7-year retention vs 5 vs 10 |
| Paper disposal | E.5 | When can paper originals be shredded after digital archive? |

---

## Change log

- **2026-05-26 (v0.7 latest)** — **Client answer A.10 applied**: portal URL changed from root `seoulaqua.com.vn` (16 chars) to **subdomain `portal.seoulaqua.com.vn` (23 chars)**. All SMS body samples and char counts recomputed (+7 chars per URL-containing template). `SMS_VISIT_REMINDER` VI bumps 70→77 chars → 1-seg→2-seg (only template that crossed a boundary). Monthly cost revised from ~1.51M → ~2.11M VND/mo. All other templates remain in 2-seg band (no further regressions).
- **2026-05-26 (v0.6)** — **Mock-first provider pattern** added to implementation note. `src/lib/sms/index.ts` + `src/lib/email/index.ts` factories read `SMS_PROVIDER` / `EMAIL_PROVIDER` env to choose between `mock-*` (default, dev/staging) and `esms-client` / `resend-client` (production). Mock writes to `SmsLog` / `EmailLog` with `status='MOCKED'`. Phase 3.5 dev no longer blocks on eSMS Brandname 2-3 week approval.
- **2026-05-26 (v0.5)** — **Two-channel notification system** introduced: §A SMS (7 urgent templates) + §B Email (9 templates incl. multi-stage variants) + §C channel selection rule. Templates split by urgency (security/credentials/dunning-final/D-1 → SMS; receipts/early-notices/summaries → Email). Verified eSMS pricing (830 VND/seg, +50K/mo per network maintenance) applied. Revised monthly cost from ~3.98M VND/mo (all-SMS) → ~1.51M VND/mo (2-channel) — 62% reduction. `EmailLog` model + email provider integration added to Phase 3.5 scope.
- **2026-05-26 (later)** — v0.4. SMS template catalog finalized: expanded from 7 → 10 templates with Option C hybrid (1-seg vs 2-seg), char-count verification per language under realistic substitutions, canonical variable dictionary, and Phase 3.5 implementation note. Production domain locked to `portal.seoulaqua.com.vn`. VI date format `DD/MM/YYYY`, KO/EN ISO `YYYY-MM-DD`. Companion file `docs/SMS_BRANDNAME_APPLICATION.md` created for eSMS Brandname registration.
- **2026-05-26** — v0.3. Initial SMS template catalog (7 templates × KO/VI/EN). Workflow summary table now shows per-doc language source (CONTRACT_PARTY vs OPS_CONTACT).
- **2026-05-25** — v0.1 initial catalog. All 10 PDFs in `reference/forms/` mapped. Open items propagated to `QUESTIONS.docx` for client confirmation.
