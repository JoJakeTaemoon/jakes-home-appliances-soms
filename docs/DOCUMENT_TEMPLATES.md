# DOCUMENT TEMPLATES — Paper Forms → Digital Flow

> Catalog of every paper form Seoul Aqua uses today, where it's used, and what its digital replacement looks like in SOMS.

Source PDFs live in `reference/forms/`. The 10 forms map to ~6 logical digital documents in v1.

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

| Scenario | Customer type | Documents issued (v1) | Signed by | Office gets back |
|---|---|---|---|---|
| New rental contract — install day | B2C | `RENTAL_CONTRACT_B2C` + `PERIODIC_CHECK_B2C` (with first visit) | Customer | Next day (technician) |
| New rental contract — install day | B2B | `RENTAL_CONTRACT_B2B` + `DELIVERY_SLIP_B2B` | Customer (multiple signers) | Post (contract) + next day (delivery slip) |
| New sale | B2C / B2B | `DELIVERY_RECEIPT` | Customer | Next day (technician) |
| Periodic visit (rental) | B2C | `PERIODIC_CHECK_B2C` | Customer | Next day |
| Periodic visit (rental) | B2B | `PERIODIC_CHECK_B2B` + separate `TAX_INVOICE_RECEIPT` (from office) | Customer-staff (on doc) | Post or hand-back |
| Ad-hoc service / repair / relocation | Any | `WORK_CONFIRMATION` | Customer | Next day |
| Monthly invoicing | B2B | `TAX_INVOICE_RECEIPT` (emailed) | n/a (digital) | Bank transfer reference |

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

- **2026-05-25** — v0.1 initial catalog. All 10 PDFs in `reference/forms/` mapped. Open items propagated to `QUESTIONS.docx` for client confirmation.
