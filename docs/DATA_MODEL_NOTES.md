# DATA MODEL NOTES — Seoul Aqua SOMS

> Each provided client CSV mapped to a candidate Prisma model. Use this to scaffold `prisma/schema.prisma` in Phase 1/2.

**Important:** all CSVs are encoded in **CP949 (Korean Windows codepage)** — UTF-8 decoder on the Mac shows mojibake (`¼ø¹ø` instead of `순번`). The import script must declare encoding `cp949` (or `euc-kr` fallback) when reading.

---

## 1. `고객관리대장-26-05-21.csv` → `Customer` model

22 rows visible. Header (decoded):

```
순번, 선택, 관리번호, 등록일자, 고객명, 고객정보, 담당자, 고객분류, 고객호칭, 소개처,
기타사항, 제품번호, E-Mail, 정수기모델명, 메모사항, 모터명, 관리방법,
전화번호#1, 전화번호#2, 문자, 휴대폰#1, 휴대폰#2, 우편, 행정주소, 상세주소,
약도#1, 약도#2, 참고#1, 참고#2, 판매방식, 판매일자, 마감일자, 총미수금, 고객고유번호
```

### Field mapping

| CSV column | Prisma field | Notes |
|---|---|---|
| 순번 | (drop) | Display-only sequence; we use UUID + KH##### code |
| 선택 | (drop) | UI selection marker |
| **관리번호** | `legacyCode` | The existing sequential management number (e.g. `8918`); preserved for migration cross-reference |
| 등록일자 | `createdAt` | Parse YYYY.MM.DD → DateTime |
| **고객명** | `name` | Person (B2C) or company (B2B) name |
| 고객정보 | `notes` (partial) | Often blank; sometimes "MR.K", "JUNG KI HUN" etc. — secondary contact |
| 담당자 | `salesRepName` | Office staff who closed the deal; later resolved to User.id |
| **고객분류** | `type` | "가정집" → `B2C`, "회사" → `B2B`. Enum values exist in CSV. |
| 고객호칭 | (drop) | Title / honorific — encoded but typically blank in samples |
| 소개처 | `referredBy` | Free text; analytics-only |
| 기타사항 | `notes` | Free text |
| 제품번호 | (drop) | Equipment identifier — moves to Equipment table |
| E-Mail | `email` | Often blank |
| **정수기모델명** | (drop here, moves to Equipment.modelCode) | This is per-device, not per-customer |
| 메모사항 | `notes` | Free text |
| 모터명 | (drop) | Likely a device-spec field; verify with client |
| **관리방법** | (informational) | Values seen: "승인", "해지", "재계약" — looks like contract status, NOT customer-level. Moves to Contract.status. |
| 전화번호#1, #2 | `phoneOffice1`, `phoneOffice2` | Landline-style |
| 문자 | (drop) | SMS-OK flag? Often blank |
| **휴대폰#1, #2** | `phoneMobile1`, `phoneMobile2` | Primary contact channel |
| 우편 | (drop) | Postal code; often blank |
| **행정주소** | `addressCity` / `addressDistrict` | City + district name (e.g. "HCMC") |
| **상세주소** | `addressFull` | Street + building |
| 약도#1, #2 | (drop) | Memo-style "near X cafe" — not useful |
| 참고#1, #2 | (drop) | Misc memo |
| **판매방식** | `defaultContractType` (informational) | Values: "sale", "rent", "rent", "free", "main", "Huy" — DRIVES contract creation but lives in Contract |
| 판매일자 | (informational) | First contract start date — moves to Contract.startDate |
| 마감일자 | (drop) | Often blank or `.  .  ` — not load-bearing |
| **총미수금** | `totalReceivable` (denormalized, refreshed nightly) | Outstanding receivable — derived, not a stored field on Customer |
| **고객고유번호** | `legacyUuid` | Format: `YYMMDD-HHMMSS-XXXXXX` — a timestamp-based unique ID. Keep for migration trace. |

### New fields not in CSV

| Field | Source |
|---|---|
| `code` | Auto-generated `KH#####` at create time |
| `taxCode` | B2B only (Vietnamese MST) — not in CSV; collected at contract sign |
| `isActive` | Default `true`; deactivate replaces deletion |
| `createdBy` / `updatedBy` | User.id |

### Discriminator inference rules (for import)

- If `고객분류 == "회사"` → `type = B2B`
- If `고객분류 == "가정집"` → `type = B2C`
- If `고객분류 ∈ {"KHAC", "VN", "HQ", "HU", "GER"}` → these aren't customer types, these are **nationality codes** mixed into the same column. Treat as B2B if customer name contains `CO`, `TNHH`, `CTY`, `CT TNHH`, `LTD`, otherwise B2C. Capture original value into `nationality` field.

### Sample volumes

Sample shows 22 customers but the legacy `관리번호` reaches **8918** — that's ~8900 historical customer rows to import. Schema must scale.

---

## 2. `정수기등록-26-05-21.csv` → `EquipmentModel` model

77 rows. Header (decoded):

```
순번, 정수기 모델명, 현재고, 소비자가, 지정점가, 입고가, 메모장, 정수기고유번호, 자료위치
```

### Field mapping

| CSV column | Prisma field | Notes |
|---|---|---|
| 순번 | (drop) | Display |
| **정수기 모델명** | `modelCode` | Primary identifier (e.g., `PTS-2100`, `SA-J430`, `AC-700 20in (III)`) |
| **현재고** | (drop — stale) | "현재고" but values are mostly `0`; client noted stock isn't maintained |
| 소비자가 | `defaultSalePrice` | VND consumer price (mostly `0` in sample — populated later by office) |
| 지정점가 | `dealerPrice` | Reseller price (mostly `0`) |
| 입고가 | `costPrice` | Wholesale cost (mostly `0`) |
| 메모장 | `notes` | Free text |
| **정수기고유번호** | `legacyUuid` | Migration trace |
| 자료위치 | (drop) | Internal pointer in old system |

### New fields not in CSV

| Field | Source |
|---|---|
| `category` | Inferred from `modelCode` prefix or assigned manually: `PTS-*` / `KJ-*` / `KH-*` → `WATER_PURIFIER`; `SA-J*` → `BIDET`; `AC-*` → `AIR_PURIFIER`; `FSM-*` → `INDUSTRIAL_SYSTEM`; `JBS*` / `CS-CF*` → `LIFESTYLE_FILTER`; `CHESSY*` / `CHP-*` → `RO_SYSTEM` |
| `defaultRentPrice` | VND/month — not in CSV; populated by office (typical rental rates from sample contracts: 500K-650K VND/month) |
| `manufacturer` | optional |
| `displayName` | Human-readable customer-facing name |
| `isActive` | Default `true` |
| `compatibleParts` | M:N with `Part` — data coming from client (`[TBC — Q4]`) |

### Categorization sample (informed guesses, must validate)

| modelCode pattern | Likely category |
|---|---|
| PTS-*, KJ-*, KH-*, KM-*, KW-*, P-*, PQ-*, SA-3205F, SA-7000, SA-5000, SA-8000, SA-J430 (BIDET — see below), VI-1000 | Water purifier / Bidet — disambiguate by inspection |
| AC-700 *, AD-1615A, AIR700, AP-* | Air purifier |
| SA-J430, SA-J830 | Bidet |
| FSM-100, FSM-150, FSM-200, FSM-300, FSM-30 | Industrial / commercial water systems |
| HB-220, HM-914EC, HDI-250000 | Specialty / hot-water heaters |
| JBS, JB-S, CS-CF, JBS-CSCF | Lifestyle filters |
| CHESSY Á¤¼ö±â (RO), CHP-* | RO consumer systems |
| CWP-330, CA-5000W, CA-7000W* | Coolers / dispensers |
| MR-02, DAB-190, DXTH120-NEK, GDB-1800, G-7000 | Other appliances |

→ Office to confirm category-per-model during Phase 2 import (`[TBC — Q5]`).

---

## 3. `필터관리-26-05-21.csv` → `Part` model

99 rows. Header:

```
순번, 필터약명, 필터명(상세제품명), 현재고, 안전재고, 소비자가, 지정점가, 교환주기, 일/개월, 품절, 필터고유번호, 자료위치
```

### Field mapping

| CSV column | Prisma field | Notes |
|---|---|---|
| 순번 | (drop) | |
| **필터약명** | `partCode` | Short identifier (e.g., `PRE 9"`, `UF 11"`, `SED 9"`, `PP 20"`, `CTO 10"`) |
| **필터명(상세제품명)** | `displayName` | Full descriptive name |
| **현재고** | `currentStock` | Some values are negative (e.g., `-3973` for POST 11") — accounting drift; **reset all to 0 on import**, real counting starts fresh |
| **안전재고** | `safetyStock` | Always `0` in sample; populated by office later |
| 소비자가 | `defaultSalePrice` | Mostly `0` |
| 지정점가 | `dealerPrice` | Mostly `0` |
| **교환주기** | `replacementCycle` | Numeric value paired with unit field |
| **일/개월** | `replacementCycleUnit` | "일" (days) or "개월" (months) — convert all to days on import |
| 품절 | (drop) | "Sold out" flag — not maintained |
| **필터고유번호** | `legacyUuid` | Migration trace |
| 자료위치 | (drop) | |

### New fields not in CSV

| Field | Source |
|---|---|
| `category` | Inferred: `FILTER` (most), `CONSUMABLE` (BOM RO, RESIN, BON INOX, etc.), `ACCESSORY` (TAP, VOI, PIPE, etc.) |
| `compatibleModels` | M:N with `EquipmentModel` — coming from client |
| `isActive` | Default `true` |
| `manufacturer` | optional |

### Filter category split (sample)

| Type | Examples |
|---|---|
| Sediment / sediment-like | `SED 9"`, `SED 11"`, `SEDM1`, `GSEDM1`, `SEDºñµ¥` (bidet sediment) |
| Pre-carbon | `PRE 9"`, `PRE 11"`, `PREB` |
| UF membrane | `UF 9"`, `UF 11"`, `UF MEM`, `UFA` |
| Post-carbon | `POST 9"`, `POST 11"`, `POST BL` |
| Activated carbon | `Carbon Filter`, `CTO 10"`, `CTO 20"`, `CTO-BIG` |
| PP filters | `PP 10"`, `PP 20"`, `PP 30"`, `PP-FC`, `PP-Big`, `PP 0.2 Micron`, `PP 1um`, `PP5um20` |
| RO membranes | `RO 4040`, `RO 8040`, `RO 400`, `RO-05`, `RO-100`, `ROFILTER` |
| Specialty | `Nano Filter`, `S/Khuan` (sterilizing), `Antin`, `Inno`, `T33`, `Option`, `Deode` |
| Bidet-specific | `SEDºñµ¥`, `JBS`, `CS-CF`, `JBS-CSCF` |
| Other consumables | `Adapter`, `BOM RO` (pump), `BON INOX`, `RESIN`, `Hot Tap`, `Cold Tap`, `Pipe 6mm`, etc. |
| Inspection (not a part) | `Á¡°Ë` — "inspection" — count of inspections done; treat as transaction-only |
| Pre-rinse / heater | `ÇÁ¸®` (pre-filter for CA-7000), `ÇìÆÄ` (HEPA for CA-7000), `Å»Ãë` (deodorize) |

→ The "Á¡°Ë" (inspection) "part" with current-stock `-20027` confirms inspections are logged as filter-events today. In the new system, **inspections are a Visit attribute, not a Part transaction**.

---

## 4. `필터교환이력-26-05-21.csv` → `PartReplacement` model

25 rows in sample (single customer). Header:

```
순번, 교환일자, 필터명, 교환금액, 수량, 담당기사, 참고사항1, 참고사항2,
필터고유번호, 거래고유번호, 개인고유번호
```

### Field mapping

| CSV column | Prisma field | Notes |
|---|---|---|
| 순번 | (drop) | |
| **교환일자** | `replacedAt` | Date — YYYY.MM.DD |
| **필터명** | (drop — resolve via FK) | Use `filterUuid` → `Part.id` |
| **교환금액** | `amount` | VND; mostly `0` for rental customers (free filter changes) |
| **수량** | `quantity` | Always `1` in sample |
| **담당기사** | `technicianName` (legacy) | Free-text technician name; resolve to `User.id` on import |
| 참고사항1, 2 | `notes` | Free-text |
| **필터고유번호** | (FK lookup) | → `Part.legacyUuid` → `partId` |
| **거래고유번호** | `legacyTransactionUuid` | Cross-reference to `월별입출고내역` |
| **개인고유번호** | (FK lookup) | → `Customer.legacyUuid` → `customerId` |

### Inferred relationships

- `PartReplacement` BELONGS_TO `Customer`
- `PartReplacement` BELONGS_TO `Part`
- `PartReplacement` may BELONG_TO `Equipment` (which device of this customer's was the part installed in?) — **not in CSV**, must derive or capture at change time
- `PartReplacement` BELONGS_TO `Visit` (which visit performed the change?) — **not in CSV**, capture at change time

### Volume estimate

If 1 customer = 25 replacements over ~16 months, and there are ~9000 customers: very rough upper bound ~150K rows historical. Many B2C will have far fewer; B2B with 50+ devices will have hundreds each. **DB index on `(customerId, replacedAt)` mandatory.**

---

## 5. `필터교환대상-26-05-21.csv` → DERIVED VIEW, not a stored table

515 rows in sample (entire upcoming-replacements list). Header:

```
순번, 선택, 관리번호, 등록일자, 고객명, 고객정보, 담당자, 고객분류, 고객호칭, 소개처, 기타사항,
제품번호, E-Mail, 정수기모델명, 최근필터, 최근교환일, 잔여일, 메모사항, 모터명, 관리방법,
전화번호#1, 전화번호#2, 문자, 휴대폰#1, 휴대폰#2, 우편, 행정주소, 상세주소, 약도#1, 약도#2,
참고#1, 참고#2, 판매방식, 판매일자, 고객고유번호
```

This is a **computed view** for the day's scheduling team:

- `최근필터` (latest filter type)
- `최근교환일` (latest replacement date)
- `잔여일` (days remaining until next due) — **the key computed field**

### Implementation

Build as a SQL view OR materialized view OR background-computed daily snapshot:

```sql
-- conceptual
SELECT
  c.id AS customerId,
  c.code, c.name, c.type, c.addressFull,
  c.phoneMobile1,
  e.id AS equipmentId,
  e.code AS equipmentCode,
  p.id AS partId, p.partCode, p.displayName,
  pr.replacedAt AS lastReplacedAt,
  (pr.replacedAt + (p.replacementCycleDays || ' days')::interval)::date AS dueDate,
  ((pr.replacedAt + (p.replacementCycleDays || ' days')::interval)::date - CURRENT_DATE)::int AS daysRemaining
FROM Customer c
JOIN Equipment e ON e.customerId = c.id
JOIN EquipmentPartCompat epc ON epc.equipmentModelId = e.modelId
JOIN Part p ON p.id = epc.partId
LEFT JOIN LATERAL (
  SELECT replacedAt FROM PartReplacement
  WHERE customerId = c.id AND equipmentId = e.id AND partId = p.id
  ORDER BY replacedAt DESC LIMIT 1
) pr ON true
WHERE c.isActive = true
ORDER BY daysRemaining ASC;
```

→ This view powers the daily-roster page, the overdue-alert widget, and the SMS reminder cron.

### Volume

For ~9000 customers × avg 3 equipment × avg 5 filter types = ~135K rows. Refresh nightly or on-write.

---

## 6. `월별입출고내역-26-05-21.csv` → `Movement` model + `Visit` synthesis

Large file — sample header:

```
순번, 선택, 거래일시, 구분, 필터약명, 단가, 수량, 금액, 관리번호, 거래처명, 거래처정보,
접수자명, 참고사항1, 참고사항2, 필터고유번호, 거래고유번호, 고객고유번호, 업체구분
```

### Two distinct row types

| `구분` value | Meaning | Maps to |
|---|---|---|
| 교환 (replacement) | Filter / part swap during visit | `PartReplacement` (already covered) |
| 점검 (inspection) | Visit done but no part actually replaced | `Visit` with empty `PartReplacement` |
| 출고 (outbound) | Sale or rental delivery | `Movement` (type = `OUTBOUND_SALE` / `OUTBOUND_RENTAL`) |
| 입고 (inbound) | Stock received from vendor | `Movement` (type = `INBOUND`) |
| 반납 (return) | Rental device returned | `Movement` (type = `RETURN`) |

### Movement model fields

| Field | Source |
|---|---|
| `id` | UUID |
| `transactionDate` | parsed from `거래일시` |
| `type` | enum from `구분` |
| `partId` | FK via `필터고유번호` (when applicable) |
| `equipmentModelId` | FK (when applicable) |
| `quantity`, `unitPrice`, `amount` | from CSV |
| `customerId` | FK via `고객고유번호` (when applicable) |
| `vendorName` (legacy) | from `거래처명` for inbound from vendor |
| `processedByName` | from `접수자명` — staff who logged it |
| `notes` | from `참고사항1, 2` |
| `legacyTransactionUuid` | from `거래고유번호` |
| `customerCategory` | from `업체구분` (B2B vs B2C tag) |

### Important: inspections in this file = Visits

The 교환 + 점검 rows together describe the historical visit log. On import:

- Group by `(customerId, transactionDate)` → synthesize one `Visit` per group
- All 교환 rows in the group → `PartReplacement` linked to that synthesized Visit
- All 점검 rows in the group → the Visit's `inspectionPerformed = true`

This is how we reconstruct ~years of visit history without a Visit table in the source.

### Volume

Sample shows ~700 rows for ~2 months → ~4K rows/month → ~50K/year. Cumulative historical might be ~200K. Index on `(customerId, transactionDate DESC)` and `(transactionDate, type)`.

---

## 7. `고객 수금정보.csv` → `Payment` model

21 rows in sample (one customer's rental history). Header:

```
순번, 처리일자, 해당년월, 수납, 구분, 금액, 납부자번호, 참고사항, 은행명, 계좌번호, 예금주명, 자료위치
```

### Field mapping

| CSV column | Prisma field | Notes |
|---|---|---|
| 순번 | (drop) | |
| **처리일자** | `collectedAt` | YYYY.MM.DD |
| **해당년월** | `coveredMonth` | YYYY.MM — which installment this covers |
| 수납 | `transactionDirection` | "수금" (collection) — always inbound in this CSV |
| **구분** | `method` (partial) | "현금기타" → `CASH_AT_VISIT` ; "계좌이체" → `BANK_TRANSFER`; "세금계산서" → `B2B_EINVOICE` |
| **금액** | `amount` | VND |
| 납부자번호 | (drop) | Often the management number `관리번호` — derive from join |
| **참고사항** | `notes` | e.g., "방문수금" (collected on visit) |
| 은행명 | `bankName` | for BANK_TRANSFER only |
| 계좌번호 | `bankAccountNumber` | for BANK_TRANSFER only |
| 예금주명 | `bankAccountHolder` | for BANK_TRANSFER only |
| 자료위치 | (drop) | |

### New fields not in CSV

| Field | Source |
|---|---|
| `id` | UUID |
| `customerId` | FK via join on `납부자번호 = Customer.legacyCode` |
| `contractId` | FK — derive: customer's active contract at `coveredMonth` |
| `installmentNumber` | derive: count of payments for this contract up to and including this date |
| `collectedByUserId` | technician (if `notes == '방문수금'`); otherwise office staff |
| `officeReceivedAt` | not in CSV — synthesize as `collectedAt + 1 day` for CASH_AT_VISIT |
| `status` | All historic payments imported as `RECONCILED` |
| `visitId` | optional — link to Visit on `collectedAt` for the same customer |

### Sample insight

The 21-row sample shows the **same customer (4-1T model)** paid 21 monthly installments totalling 12,760,000 VND between 2024.07 and 2026.03 — i.e., 21 months of rent at 560K VND/mo + 1,000K extra (likely deposit refund / first-month adjustment). All cash, all "방문수금".

---

## 8. Schema sketch (high-level)

Here's the v0 Prisma schema sketch. Phase 1 should build only the `User / Role / Session` triad; Phase 2 adds `Customer / EquipmentModel / Equipment / Part`; Phase 3 adds `Contract / Document`; Phase 4 adds `Visit`; Phase 5 adds `PartReplacement`; Phase 6 adds `Payment / Movement`.

```prisma
// === Phase 1 (Foundation) ===
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  name          String
  phone         String?
  role          Role     @relation(fields: [roleId], references: [id])
  roleId        String
  language      String   @default("ko")
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  sessions      Session[]
  auditLogs     AuditLog[]
}

model Role {
  id            String   @id @default(uuid())
  name          String   @unique  // ADMIN / OFFICE_MANAGER / SALES / TECHNICIAN / ACCOUNTANT / CUSTOMER
  permissions   Json
  users         User[]
}

model Session {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  refreshToken  String   @unique
  expiresAt     DateTime
  createdAt     DateTime @default(now())
}

model AuditLog {
  id            String   @id @default(uuid())
  userId        String?
  user          User?    @relation(fields: [userId], references: [id])
  action        String   // LOGIN, CREATE, UPDATE, DELETE, etc.
  resource      String   // customer, contract, visit, payment, etc.
  resourceId    String?
  detail        Json?
  ipAddress     String?
  createdAt     DateTime @default(now())
  @@index([userId, createdAt])
  @@index([resource, createdAt])
}

// === Phase 2 (Customer + Equipment) ===
enum CustomerType { B2C B2B }

model Customer {
  id            String   @id @default(uuid())
  code          String   @unique  // KH00001
  legacyCode    String?  @unique  // 8918
  legacyUuid    String?  // YYMMDD-HHMMSS-XXXXXX
  type          CustomerType
  name          String
  displayName   String?
  taxCode       String?  // B2B only
  nationality   String?  // KHAC / VN / HQ / etc.
  phoneOffice1  String?
  phoneMobile1  String?
  phoneMobile2  String?
  email         String?
  addressCity   String?
  addressDistrict String?
  addressFull   String
  salesRepName  String?  // pre-normalization; replace with FK in Phase 1.5
  referredBy    String?
  notes         String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  createdById   String?
  updatedById   String?
  equipments    Equipment[]
  contracts     Contract[]
  visits        Visit[]
  payments      Payment[]
  @@index([name])
  @@index([type, isActive])
}

enum EquipmentCategory {
  WATER_PURIFIER BIDET AIR_PURIFIER DEHUMIDIFIER
  INDUSTRIAL_SYSTEM RO_SYSTEM LIFESTYLE_FILTER OTHER
}

model EquipmentModel {
  id              String  @id @default(uuid())
  modelCode       String  @unique
  category        EquipmentCategory
  displayName     String
  manufacturer    String?
  description     String?
  defaultSalePrice  Int?  // VND
  defaultRentPrice  Int?  // VND/month
  dealerPrice     Int?
  costPrice       Int?
  notes           String?
  legacyUuid      String? @unique
  isActive        Boolean @default(true)
  equipments      Equipment[]
  compatibleParts EquipmentPart[]
}

model Equipment {
  id              String   @id @default(uuid())
  code            String   @unique  // KH00001-1
  customer        Customer @relation(fields: [customerId], references: [id])
  customerId      String
  model           EquipmentModel @relation(fields: [modelId], references: [id])
  modelId         String
  serialNumber    String?
  installLocation String?  // "주방", "회사 1층 휴게실"
  installedAt     DateTime?
  installedByUserId String?
  contractId      String?  // FK to Contract (added in Phase 3)
  status          EquipmentStatus @default(ACTIVE)
  notes           String?
  partReplacements PartReplacement[]
  @@index([customerId])
}

enum EquipmentStatus { ACTIVE RELOCATED RETIRED RETURNED }

enum PartCategory { FILTER CONSUMABLE ACCESSORY }

model Part {
  id              String   @id @default(uuid())
  partCode        String   // PRE 9", UF 11", etc.
  displayName     String
  category        PartCategory
  replacementCycleDays Int?  // converted from CSV's days-or-months
  defaultSalePrice  Int?
  dealerPrice     Int?
  currentStock    Int      @default(0)  // RESET on import
  safetyStock     Int      @default(0)
  manufacturer    String?
  legacyUuid      String?  @unique
  isActive        Boolean  @default(true)
  partReplacements PartReplacement[]
  compatibleModels EquipmentPart[]
}

model EquipmentPart {
  equipmentModel    EquipmentModel @relation(fields: [equipmentModelId], references: [id])
  equipmentModelId  String
  part              Part @relation(fields: [partId], references: [id])
  partId            String
  @@id([equipmentModelId, partId])
}

// === Phase 3 (Contracts + Documents) ===
enum ContractType { SALE RENTAL MAINTENANCE }
enum ContractStatus { DRAFT ACTIVE OVERDUE COMPLETED TERMINATED_EARLY }
enum InspectionFrequency { MONTHLY BIMONTHLY }

model Contract {
  id              String   @id @default(uuid())
  code            String   @unique  // HD-2026-00001
  customer        Customer @relation(fields: [customerId], references: [id])
  customerId      String
  type            ContractType
  status          ContractStatus @default(DRAFT)
  startDate       DateTime
  endDate         DateTime?  // computed
  termMonths      Int?       // 36 for rental
  mandatoryMonths Int?       // 24 for rental
  inspectionFrequency InspectionFrequency?
  monthlyFee      Int?
  totalSalePrice  Int?
  depositAmount   Int        @default(0)
  signedAt        DateTime?
  signedBy        String?
  paidInstallments Int       @default(0)
  terminationReason String?
  documentPdfPath String?
  notes           String?
  equipments      Equipment[]
  payments        Payment[]
  visits          Visit[]
  documents       Document[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum DocumentKind {
  RENTAL_CONTRACT_B2C RENTAL_CONTRACT_B2B
  DELIVERY_RECEIPT  // 납품서 (영수증 겸용) - universal
  SALE_RECEIPT_B2C  // 판매 영수증 (출고서 겸용) - 가정집
  DELIVERY_SLIP_B2B // 출고서
  PERIODIC_CHECK_B2C // 정기 정검표 - 가정집
  PERIODIC_CHECK_B2B // 정기 점검 확인서
  WORK_CONFIRMATION  // 작업확인서
  TAX_INVOICE_RECEIPT
}

model Document {
  id              String   @id @default(uuid())
  kind            DocumentKind
  contract        Contract? @relation(fields: [contractId], references: [id])
  contractId      String?
  visit           Visit?   @relation(fields: [visitId], references: [id])
  visitId         String?
  customer        Customer? @relation(fields: [customerId], references: [id])
  customerId      String?
  generatedPdfPath String
  signedImagePath String?  // photo-of-paper OR tablet e-sig
  physicalReceivedAt DateTime?  // when paper original arrives at office
  createdAt       DateTime @default(now())
}

// === Phase 4 (Visits + Schedule) ===
enum VisitType {
  INSTALLATION PERIODIC REPAIR RELOCATION RETRIEVAL OTHER
}
enum VisitStatus {
  SCHEDULED CONFIRMED IN_PROGRESS COMPLETED
  RESCHEDULED CANCELLED CUSTOMER_NO_SHOW NEEDS_REVISIT
}

model Visit {
  id              String   @id @default(uuid())
  customer        Customer @relation(fields: [customerId], references: [id])
  customerId      String
  contract        Contract? @relation(fields: [contractId], references: [id])
  contractId      String?
  type            VisitType
  scheduledDate   DateTime
  scheduledTimeWindow String?  // "09:00-11:00" or "오전"
  status          VisitStatus @default(SCHEDULED)
  completedAt     DateTime?
  notes           String?
  rescheduledFromVisitId String?
  rescheduleReason String?
  parentJobId     String?  // for multi-day big-site work
  signatureCustomerPath String?
  signatureTechnicianPath String?
  attachedPhotoPaths String[]  // S3 keys
  assignedTechnicians VisitTechnician[]
  equipmentItems  VisitEquipment[]
  partReplacements PartReplacement[]
  payments        Payment[]
  documents       Document[]
  @@index([scheduledDate, status])
  @@index([customerId, scheduledDate])
}

model VisitTechnician {
  visitId         String
  technicianId    String
  partition       String?  // "floors 1-3"
  visit           Visit @relation(fields: [visitId], references: [id])
  technician      User  @relation(fields: [technicianId], references: [id])
  @@id([visitId, technicianId])
}

model VisitEquipment {
  visitId         String
  equipmentId     String
  inspectionPerformed Boolean @default(false)
  notes           String?
  visit           Visit @relation(fields: [visitId], references: [id])
  equipment       Equipment @relation(fields: [equipmentId], references: [id])
  @@id([visitId, equipmentId])
}

// === Phase 5 (Service history) ===
model PartReplacement {
  id              String   @id @default(uuid())
  customer        Customer @relation(fields: [customerId], references: [id])
  customerId      String
  equipment       Equipment? @relation(fields: [equipmentId], references: [id])
  equipmentId     String?
  part            Part @relation(fields: [partId], references: [id])
  partId          String
  visit           Visit? @relation(fields: [visitId], references: [id])
  visitId         String?
  replacedAt      DateTime
  quantity        Int @default(1)
  amount          Int @default(0)  // VND; 0 for rental
  technicianId    String?
  notes           String?
  legacyTransactionUuid String?
  createdAt       DateTime @default(now())
  @@index([customerId, replacedAt])
  @@index([equipmentId, partId, replacedAt])
}

// === Phase 6 (Payments + Movements) ===
enum PaymentMethod {
  CASH_AT_VISIT BANK_TRANSFER B2B_EINVOICE B2B_NO_INVOICE
}
enum PaymentStatus {
  PENDING RECEIVED RECONCILED BOUNCED WAIVED
}

model Payment {
  id              String   @id @default(uuid())
  customer        Customer @relation(fields: [customerId], references: [id])
  customerId      String
  contract        Contract? @relation(fields: [contractId], references: [id])
  contractId      String?
  visit           Visit? @relation(fields: [visitId], references: [id])
  visitId         String?
  installmentNumber Int?
  coveredMonth    String?  // YYYY-MM
  amount          Int
  method          PaymentMethod
  status          PaymentStatus @default(PENDING)
  collectedAt     DateTime?
  collectedByUserId String?
  officeReceivedAt DateTime?
  officeReceivedByUserId String?
  reconciledAt    DateTime?
  reconciledByUserId String?
  bankName        String?
  bankAccountNumber String?
  bankAccountHolder String?
  invoicePdfPath  String?
  transferReference String?
  notes           String?
  createdAt       DateTime @default(now())
  @@index([customerId, collectedAt])
}

enum MovementType {
  INBOUND  // stock received from vendor
  OUTBOUND_SALE
  OUTBOUND_RENTAL
  RETURN   // rental device returned
  ADJUSTMENT
}

model Movement {
  id              String   @id @default(uuid())
  transactionDate DateTime
  type            MovementType
  partId          String?
  equipmentModelId String?
  quantity        Int
  unitPrice       Int?
  amount          Int?
  customerId      String?
  vendorName      String?
  processedByUserId String?
  notes           String?
  legacyTransactionUuid String?
  createdAt       DateTime @default(now())
  @@index([transactionDate, type])
}
```

---

## 9. Migration script outline (Phase 2)

Will live in `scripts/import-from-csv.ts`. Steps:

1. **Open CSVs with `iconv-lite` decoded as cp949 → utf-8**
2. **Pass 1 — Parts** (from `필터관리`): insert all 99, generating UUID. Build map `legacyUuid → partId`.
3. **Pass 2 — Equipment models** (from `정수기등록`): insert all 77. Build map `legacyUuid → modelId`. Categorization heuristic per §2 above.
4. **Pass 3 — Customers** (from `고객관리대장`): insert all ~9000, generate `KH#####` sequentially. Build map `legacyUuid → customerId` and `legacyCode → customerId`.
5. **Pass 4 — Equipment** (synthesized from `고객관리대장.정수기모델명` + `제품번호` columns): one Equipment per (customer, model, distinct product number). Generate `KH#####-N` codes per customer.
6. **Pass 5 — Movements** (from `월별입출고내역`): insert all rows as Movement, mapping `구분` to MovementType. Skip rows whose `구분` is `교환` or `점검` (those become PartReplacement/Visit).
7. **Pass 6 — Visits** (synthesized from `월별입출고내역` grouping): group by `(customerId, transactionDate)` for 교환+점검 rows; one Visit per group; mark inspectionPerformed=true if any 점검 row present.
8. **Pass 7 — PartReplacements** (from `월별입출고내역` 교환 rows + dedicated `필터교환이력` CSV): insert linked to Visit + Customer + Part.
9. **Pass 8 — Payments** (from `고객 수금정보`): insert, link to Customer via legacy code, derive contract & installment.
10. **Validation** — row counts in vs out match; every Customer has a `KH#####`; every Equipment has a customer; every PartReplacement has a valid customer+part FK; print summary.

Idempotency: re-runnable by detecting existing `legacyUuid` and skipping duplicates.

---

## 10. Volume estimates (consolidated)

| Entity | Year-1 estimate | Source |
|---|---|---|
| Customer | ~10K (after import + new acquisitions) | Existing CSV reaches `관리번호 8918` |
| EquipmentModel | ~80 | CSV: 77 |
| Equipment | ~30K | 10K customers × avg 3 devices |
| Part | ~100 | CSV: 99 |
| Visit | ~150K | 80 techs × 5 visits/day × 250 working days × historical multiplier |
| PartReplacement | ~200K | Visits × avg 1.5 parts changed |
| Movement | ~250K (inbound + outbound + adjustments) | Sample extrapolation |
| Payment | ~150K | Roughly 1 per visit + bank transfers |

Total DB size estimate (year 1, before attachments): **~3-5 GB**.

Attachments (photos, signed papers, PDFs): **~150 GB/year** at projected scale.

---

## Change log

- **2026-05-25** — v0.1 initial data model derived from 7 client CSVs. All field mappings inferred from sample content; field-by-field client validation captured in `QUESTIONS.docx` section J (data migration). Schema sketch is provisional — Phase 1 implementation will refine.
