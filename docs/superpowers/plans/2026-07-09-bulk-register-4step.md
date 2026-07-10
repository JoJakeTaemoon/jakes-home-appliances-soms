# 대량/단일 장비 등록 4단계 재설계 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 장비 등록(`bulk-register` 동일모델×N, `register` 멀티라인)을 4단계 위저드(고객→장비→판매방식→서비스구성)로 재설계하고, 주기를 일 단위로 전환하며, 수동 계약서 업로드를 추가한다.

**Architecture:** 공용 컴포넌트(Stepper·CustomerSearchSelect·ModelPicker·ServiceMethodSection·ServiceConfigEditor·NewCustomerModal)를 두 위저드가 공유. 가격/서비스는 `Equipment`에 저장, 계약은 배치/라인별 묶음. 주기는 DB 전면 일(day) 단위.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma v7(@prisma/adapter-pg), Zod, TanStack Query, next-intl, Vitest.

**설계문서:** `docs/superpowers/specs/2026-07-08-bulk-equipment-registration-4step-design.md` (본 계획의 근거)

## Global Constraints

- API 응답 포맷 `{ success, data?, error?, pagination? }`
- 모든 사용자 문자열은 `useTranslations()` (ko/vi/en) — 하드코딩 금지
- Zod 스키마는 `src/lib/validators/`에서 프론트+API 공유
- 금액 입력은 공용 `src/components/ui/number-input.tsx` (`variant="money"`, 1000동 스텝)
- 마이그레이션은 손수 작성(RENAME/UPDATE 포함), `prisma migrate dev` 자동생성으로 rename을 drop+add 시키지 말 것
- `db:reset` 프로덕션 금지 — 검증은 `db:reset:dev`
- 개월→일 변환 계수 = **30** 고정

## Phase 로드맵 (각 Phase = 독립 테스트가능 증분)

- **Phase 0 — 스키마 + 일 단위 전환** ← *본 문서에서 완전 상세화*
- **Phase 1 — API** (bulk-register 확장·모델 소모품 엔드포인트·계약 업로드 라우트) — Phase 0 머지 후 자체 bite-sized 계획
- **Phase 2a — 공용 컴포넌트 + bulk 위저드**
- **Phase 2b — register 위저드 (멀티라인, 스텝3·4 라인별)**
- **Phase 3 — 계약서 수동 업로드 override**

> Phase 1~3은 §"Subsequent Phases"에 파일·인터페이스·산출물 수준으로 확정하고, 각 Phase 착수 직전 이 문서에 bite-sized task로 확장한다(선행 Phase의 실제 결과 반영).

---

# Phase 0 — 스키마 + 주기 일 단위 전환

**산출물:** DB·코드·시드·i18n이 전면 일(day) 단위. `installFee`/`salePrice`/계약 PDF 컬럼 추가(미사용). 기존 유지보수/서비스구성/크론 기능이 일 기준으로 정상 동작.

**영향 파일 (grep 확정, `src/generated/` 제외):** schema.prisma, seed.ts(168), admin/products/page.tsx(23), api/equipment/[id]/filter-history(14), api/equipment/[id]/service-config(12), validators/product.ts(11), f/visits/[id]/page.tsx(9), lib/visits/suggest.ts(8), validators/equipment.ts(7), validators/equipmentConsumable.ts(6), cron/filter-due-reminder.ts(6), forms/equipment-model-form.tsx(6), api/admin/products/export-catalog(6), api/admin/products/consumables/[id](5), api/equipment/[id]/consumables/[consumableLinkId](5), equipment-detail-content.tsx(4), contracts/new/page.tsx(4), api/equipment/bulk-register(4), api/admin/products/import-catalog(4), service-config-table.tsx(3), equipment/[id]/page.tsx(3), api/equipment/[id]/route.ts(3), + 9개 파일(≤2). i18n: ko/vi/en.json.

**필드 rename (unit 명시):**
| 모델 | 기존 | 신규 |
|------|------|------|
| Consumable | `replaceEveryMonths` | `replaceEveryDays` |
| Consumable | `cleanEveryMonths` | `cleanEveryDays` |
| EquipmentModel | `inspectionEveryMonths` | `inspectionEveryDays` |
| Equipment | `customInspectionCycle` | `customInspectionCycleDays` |
| Equipment | `customMaintenanceCycle` | `customMaintenanceCycleDays` |
| EquipmentConsumable | `replaceEveryMonths` | `replaceEveryDays` |

**신규 컬럼:** `Equipment.installFee Decimal? @db.Decimal(14,2)`, `Equipment.salePrice Decimal? @db.Decimal(14,2)`, `Contract.pdfStorageKey String?`, `Contract.pdfUploadedAt DateTime?`.

---

### Task 0.1: 일 단위 due-date 계산 유틸 + 회귀 테스트 (RED→GREEN)

가장 리스크 큰 "로직"은 다음예정일 = 최근교체일 + N일 계산이다. 먼저 순수 유틸로 못박고 테스트를 남긴다.

**Files:**
- Create: `src/lib/equipment/cycle.ts`
- Test: `__tests__/unit/lib/equipment/cycle.test.ts`

**Interfaces:**
- Produces: `addDays(iso: string, days: number): string` (YYYY-MM-DD in→out, UTC), `nextDueDate(lastReplacedISO: string, cycleDays: number): string`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// __tests__/unit/lib/equipment/cycle.test.ts
import { describe, it, expect } from "vitest";
import { addDays, nextDueDate } from "@/lib/equipment/cycle";

describe("cycle", () => {
  it("adds days across month/year boundaries", () => {
    expect(addDays("2026-01-01", 90)).toBe("2026-04-01");
    expect(addDays("2026-12-01", 365)).toBe("2027-12-01");
  });
  it("nextDueDate = lastReplaced + cycleDays", () => {
    expect(nextDueDate("2026-07-09", 120)).toBe("2026-11-06");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run __tests__/unit/lib/equipment/cycle.test.ts` → FAIL(모듈 없음)

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/equipment/cycle.ts
/** UTC 기준 YYYY-MM-DD 에 days 를 더한다. DST/타임존 영향 없음. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** 최근교체일 + 주기(일) = 다음 예정일. */
export function nextDueDate(lastReplacedISO: string, cycleDays: number): string {
  return addDays(lastReplacedISO, cycleDays);
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run __tests__/unit/lib/equipment/cycle.test.ts` → PASS

- [ ] **Step 5: 커밋** — `git add src/lib/equipment/cycle.ts __tests__/unit/lib/equipment/cycle.test.ts && git commit -m "feat(equipment): day-based cycle date util"`

---

### Task 0.2: Prisma 스키마 rename + 신규 컬럼

**Files:**
- Modify: `prisma/schema.prisma` (Consumable ~480-505, EquipmentModel ~432-473, Equipment ~618-713, EquipmentConsumable ~836-859, Contract ~890-952)

**Interfaces:**
- Produces: Prisma 모델 필드명 `replaceEveryDays`/`cleanEveryDays`/`inspectionEveryDays`/`customInspectionCycleDays`/`customMaintenanceCycleDays`, 신규 `Equipment.installFee`/`salePrice`, `Contract.pdfStorageKey`/`pdfUploadedAt`

- [ ] **Step 1: 필드 rename** — 위 표대로 5개 필드명을 schema.prisma에서 변경(주석의 "개월"→"일"). 예:

```prisma
// Consumable
replaceEveryDays Int? // 교체 주기(일). null이면 교체형 아님
cleanEveryDays   Int? // 세척 주기(일)
// EquipmentModel
inspectionEveryDays Int? // 정기점검 주기(일)
// Equipment
customInspectionCycleDays Int? // 장비별 정기점검 주기(일) — 모델값 override
customMaintenanceCycleDays Int? // off-catalog 유지보수 주기(일)
// EquipmentConsumable
replaceEveryDays Int? // 장비별 교체 주기(일) — 카탈로그 override
```

- [ ] **Step 2: 신규 컬럼 추가**

```prisma
// Equipment (deposit/monthlyFee 인접)
installFee Decimal? @db.Decimal(14, 2) // 설치비(판매)
salePrice  Decimal? @db.Decimal(14, 2) // 판매단가(SALE); monthlyFee는 임대료/관리비 전용
// Contract (pdf 관련)
pdfStorageKey  String?   // 수동 업로드 계약서 — 있으면 자동렌더 대체
pdfUploadedAt  DateTime?
```

- [ ] **Step 3: 포맷 검증** — Run: `npx prisma format && npx prisma validate` → 성공

- [ ] **Step 4: 커밋** — `git add prisma/schema.prisma && git commit -m "feat(schema): day-unit cycle fields + installFee/salePrice + contract pdf columns"`

---

### Task 0.3: 마이그레이션 SQL (RENAME + ×30 + ADD)

**Files:**
- Create: `prisma/migrations/<ts>_cycles_to_days_and_pricing/migration.sql`

- [ ] **Step 1: 마이그레이션 폴더+SQL 작성** (타임스탬프는 `date +%Y%m%d%H%M%S`)

```sql
-- 주기 개월→일 (기존값 × 30), 신규 가격/계약 PDF 컬럼
ALTER TABLE "Consumable" RENAME COLUMN "replaceEveryMonths" TO "replaceEveryDays";
ALTER TABLE "Consumable" RENAME COLUMN "cleanEveryMonths" TO "cleanEveryDays";
UPDATE "Consumable" SET "replaceEveryDays" = "replaceEveryDays" * 30 WHERE "replaceEveryDays" IS NOT NULL;
UPDATE "Consumable" SET "cleanEveryDays" = "cleanEveryDays" * 30 WHERE "cleanEveryDays" IS NOT NULL;

ALTER TABLE "EquipmentModel" RENAME COLUMN "inspectionEveryMonths" TO "inspectionEveryDays";
UPDATE "EquipmentModel" SET "inspectionEveryDays" = "inspectionEveryDays" * 30 WHERE "inspectionEveryDays" IS NOT NULL;

ALTER TABLE "Equipment" RENAME COLUMN "customInspectionCycle" TO "customInspectionCycleDays";
ALTER TABLE "Equipment" RENAME COLUMN "customMaintenanceCycle" TO "customMaintenanceCycleDays";
UPDATE "Equipment" SET "customInspectionCycleDays" = "customInspectionCycleDays" * 30 WHERE "customInspectionCycleDays" IS NOT NULL;
UPDATE "Equipment" SET "customMaintenanceCycleDays" = "customMaintenanceCycleDays" * 30 WHERE "customMaintenanceCycleDays" IS NOT NULL;

ALTER TABLE "EquipmentConsumable" RENAME COLUMN "replaceEveryMonths" TO "replaceEveryDays";
UPDATE "EquipmentConsumable" SET "replaceEveryDays" = "replaceEveryDays" * 30 WHERE "replaceEveryDays" IS NOT NULL;

ALTER TABLE "Equipment" ADD COLUMN "installFee" DECIMAL(14,2);
ALTER TABLE "Equipment" ADD COLUMN "salePrice" DECIMAL(14,2);
ALTER TABLE "Contract" ADD COLUMN "pdfStorageKey" TEXT;
ALTER TABLE "Contract" ADD COLUMN "pdfUploadedAt" TIMESTAMP(3);
```

- [ ] **Step 2: 적용 + 클라이언트 재생성** — Run: `dotenv -e .env.dev -o -- npx prisma migrate deploy && npx prisma generate` → 성공, 드리프트 없음

- [ ] **Step 3: 컬럼 확인** — Run: `dotenv -e .env.dev -o -- npx tsx -e "import {prisma} from '@/lib/prisma'; ..."` 또는 psql `\d "Consumable"` → `replaceEveryDays` 존재, `*Months` 없음

- [ ] **Step 4: 커밋** — `git add prisma/migrations && git commit -m "feat(db): migrate cycles to days (×30) + pricing/pdf columns"`

---

### Task 0.4: 코드 필드 참조 rename (tsc 게이트)

Prisma 클라이언트가 재생성되면 구 필드명 참조는 전부 타입 에러가 난다. 이를 나침반 삼아 전 파일 rename.

**Files (Modify):** 위 "영향 파일" 목록 중 seed·i18n 제외 전부 (api/*, components/*, lib/*, app/* 페이지)

- [ ] **Step 1: 기계적 rename** — 각 구필드→신필드로 치환(스크립트 또는 편집). 단, **display 로직/라벨/숫자 리터럴은 Task 0.5–0.6에서 별도 처리**하니 여기선 식별자만.

```bash
# 예시(검토 후 적용): 식별자 전역 치환
grep -rl "replaceEveryMonths" src --include="*.ts" --include="*.tsx" | grep -v generated \
  | xargs sed -i '' 's/replaceEveryMonths/replaceEveryDays/g'
# cleanEveryMonths→cleanEveryDays, inspectionEveryMonths→inspectionEveryDays,
# customInspectionCycle→customInspectionCycleDays, customMaintenanceCycle→customMaintenanceCycleDays 동일
```

- [ ] **Step 2: 타입체크** — Run: `npx tsc --noEmit -p tsconfig.json` → 구필드 관련 에러 0 (남으면 해당 파일 수기 수정)

- [ ] **Step 3: 커밋** — `git commit -am "refactor: rename cycle fields to *Days across code"`

---

### Task 0.5: 시드 값 일 단위로 변환

`seed.ts`의 주기 리터럴(개월 값)을 일(×30)로. 필드명은 Task 0.4에서 이미 바뀜 → 여기선 **숫자**만.

**Files:** Modify `prisma/seed.ts`

- [ ] **Step 1: 값 변환** — `replaceEveryDays: 6`(옛 6개월)류를 `180`으로. 각 소모품/모델/장비 주기 리터럴을 ×30. (검토 리스트: consumable replace/clean, model inspection, equipment custom* — grep로 위치 확인)

- [ ] **Step 2: 시드 실행** — Run: `npm run db:reset:dev` → 완료(에러 없음)

- [ ] **Step 3: 값 확인** — 시드된 Consumable의 `replaceEveryDays`가 90/180/365 등 일 값인지 psql 또는 앱에서 확인

- [ ] **Step 4: 커밋** — `git commit -am "chore(seed): cycle values in days"`

---

### Task 0.6a: 주기 due-date **로직** 일 단위 전환 (+ 회귀 테스트)

Task 0.2–0.4 리뷰에서 발견: 5개 파일이 day-값(×30 마이그레이션 후)을 **월 기반 날짜 계산**에 넣어 **~30배 오류**. 이 로직들을 일 기반으로 고치고, 월-계산이면 실패하는 회귀 테스트를 남긴다.
**주의:** 날짜 **포맷터**(`getMonth()+1` → DD/MM/YYYY), 계약 **term×30일**, 달력 네비게이션 addMonths(`visits-calendar-view`), `contracts/renewal`·`workflow`의 term 월계산은 **정당한 월 로직 → 손대지 말 것**.

**Files (Modify):**
- `src/lib/visits/suggest.ts:134` — `addMonths(baseline, cycleMonths)` → 일 가산. `cycleMonths` 지역명 `cycleDays`로. Date 기반 일 가산은 `src/lib/contracts/pause-period.ts`의 `addDays(base: Date, days): Date` 재사용(import). suggest의 export `addMonths`가 cycle 외 용도로 안 쓰이면 제거.
- `src/lib/cron/filter-due-reminder.ts:160` — `addMonths(baseline, cycle)`(cycle=replace/cleanEveryDays) → `addDays(baseline, cycle)` (import 교체)
- `src/app/api/equipment/[id]/service-config/route.ts:136,301` — 로컬 `addMonths`로 `effectiveInspectionCycle`/`effectiveCycleMonths`(둘 다 일 값) 계산 → 일 가산. `effectiveCycleMonths`→`effectiveCycleDays`. (위저드 ServiceConfigEditor가 미러링하는 원본 표)
- `src/app/api/equipment/[id]/filter-history/route.ts:199,245` — 로컬 `addMonths(baseline, cycle)` → 일 가산
- `src/app/[locale]/dashboard-client.tsx:162,218` — `MS_PER_MONTH=30*일ms`; `cycleMs = cycleMonths * MS_PER_MONTH` → `MS_PER_DAY=24*60*60*1000`; `cycleMs = cycleDays * MS_PER_DAY`. 지역명 `cycleDays`로.

- [ ] **Step 1: 회귀 테스트(RED)** — `src/lib/visits/suggest.ts`의 due-date 산출을 검증. 365일 주기가 월계산이면 크게 틀리는 케이스로 못박음:

```ts
// __tests__/unit/lib/visits/suggest-cycle.test.ts (또는 기존 suggest 테스트에 추가)
import { describe, it, expect } from "vitest";
import { addDays } from "@/lib/contracts/pause-period";
describe("cycle due-date is day-based", () => {
  it("365-day cycle adds 365 days, not 365 months", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const due = addDays(base, 365);
    expect(due.toISOString().slice(0, 10)).toBe("2027-01-01"); // 월계산이면 ~2056년
  });
});
```
(suggest의 nextDueAt 계산이 순수 추출 가능하면 그걸 직접 테스트; 아니면 위 util-레벨 회귀로 일 가산 사용을 고정)

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run __tests__/unit/lib/visits/suggest-cycle.test.ts` → 파일 미존재/import 실패시 우선 작성 확인

- [ ] **Step 3: 5개 파일 일 가산으로 수정** (위 Files 목록대로)

- [ ] **Step 4: 통과 + 타입체크** — Run: `npx vitest run __tests__/unit/lib/visits` → PASS; `npx tsc --noEmit -p tsconfig.json` → 0. 기존 service-config/filter-due 관련 테스트도 실행해 회귀 없음 확인.

- [ ] **Step 5: 커밋** — `git commit -am "fix(equipment): cycle due-dates use day math (not months) after day migration"`

---

### Task 0.6b: i18n 라벨 일 단위

**Files:** Modify `src/messages/{ko,vi,en}.json`, `src/app/f/[locale]/visits/[id]/page.tsx`(everyMonths 표시), `src/components/forms/equipment-model-form.tsx`, `src/app/o/[locale]/(dashboard)/admin/products/page.tsx`, `src/app/o/[locale]/(dashboard)/contracts/new/page.tsx`(customMaintenanceCycle 라벨)

- [ ] **Step 1: 메시지 키** — `everyMonths`→`everyDays`("{n}일마다"/"mỗi {n} ngày"/"every {n} days"), `cycleMonths`/`cycleValue`/`inspectionEveryMonths`/`external.customMaintenanceCycle` 라벨의 "개월/월/months"→"일/ngày/days". 키 rename 시 `t(...)` 참조처 동반 수정. (Task 0.2–0.4에서 의도적으로 남겨둔 `inspectionEveryMonths`·`external.customMaintenanceCycle` 메시지 키도 여기서 정리)

- [ ] **Step 2: 라벨 사용처** — `everyMonths` 표시(visits/[id]), 폼 라벨(equipment-model-form, admin/products, contracts/new) 문구를 일 기준으로.

- [ ] **Step 3: 타입체크 + 테스트** — Run: `npx tsc --noEmit` → 0; `npx vitest run` → 통과

- [ ] **Step 4: 커밋** — `git commit -am "i18n: cycle labels in days"`

---

### Task 0.7: Phase 0 검증 (전체 게이트)

- [ ] **Step 1: 전체 타입체크** — Run: `npx tsc --noEmit -p tsconfig.json` → 0
- [ ] **Step 2: 전체 테스트** — Run: `npm test` → 통과 (특히 service-config/filter-due 관련)
- [ ] **Step 3: 서비스구성 due-date 수동 확인** — 시드 장비 상세 → 필터 다음예정일 = 설치일 + (일)주기 인지 확인
- [ ] **Step 4: 리셋+시드 E2E** — Run: `npm run db:reset:dev` → 완료
- [ ] **Step 5: 필터만기 크론 스모크** — Run: `dotenv -e .env.dev -o -- npx tsx src/lib/cron/filter-due-reminder.ts`(또는 해당 실행경로) → 에러 없음, 일 기준 만기 산출
- [ ] **Step 6: Phase 0 브랜치 푸시 + PR** (선택) — CI green 후 머지

---

# Subsequent Phases (착수 직전 bite-sized 확장)

# Phase 1 — API (branch `feat/bulk-register-phase1`)

**산출물:** 새 위저드(Phase 2)가 호출할 API 완비 — 모델 소모품 조회, 판매방식별 계약 필드·수동 계약번호·salePrice/installFee·SALE+유지보수 2계약·serviceConfig 처리, register 라인별 확장, 계약서 PDF 업로드 override. UI 없이 통합테스트로 검증.

**재사용 지점 (조사 확정):**
- 계약번호: `allocateContractCode(input): string` (`src/lib/contracts/code.ts:99`, 순수·P2002는 호출자 처리). 계약 생성은 inline `tx.contract.create`(register/route.ts:193 패턴) 유지 — `ContractWorkflow.create`는 자체 장비생성이라 부적합.
- MANAGER+ 게이트: `ContractWorkflow.access.canRegeneratePdf(role)` (isManagerPlus).
- 업로드: multipart 패턴 `tax-invoices/route.ts:114-143`; 디스크쓰기 미러 `src/lib/tax-invoices/operations.ts:88-102`(storageKey=`path.relative(cwd, fullPath)`).
- 계약 PDF: `renderPdf({kind:"CONTRACT",...})`, `GET contracts/[id]/pdf`는 `getLatestPdf`→렌더. `Contract.pdfStorageKey`/`pdfUploadedAt`는 **Phase 0에서 이미 존재**.
- 모델 소모품 쿼리: `service-config/route.ts:52-71` 미러. `ConsumableOnModel.quantity`(기본수량), `Consumable`엔 `nameKo/Vi/En·replaceEveryDays·cleanEveryDays·cleanOnEveryVisit·retailPrice`. **Consumable에 category 없음** → "구분"은 Phase 2 UI에서 고정 라벨로 처리(API는 미반환).
- 통합테스트 하네스: `__tests__/integration/contracts/contract-flow.test.ts`의 `beforeAll` 시드 + `buildReq`/`readJson` 복제(real dev DB, node project).

---

### Task 1.1: `GET /api/equipment-models/[id]/consumables`

**Files:** Create `src/app/api/equipment-models/[id]/consumables/route.ts`; Test `__tests__/integration/equipment/model-consumables.test.ts`

**Interfaces — Produces:** `{ success:true, data: Array<{ consumableId:string, sku:string, name:{ko,vi,en}, replaceEveryDays:number|null, cleanEveryDays:number|null, cleanOnEveryVisit:boolean, defaultQuantity:number, retailPrice:string|number }> }`. 미존재 모델 → 404.

- [ ] **Step 1: 통합테스트(RED)** — contract-flow 하네스 복제. 시드: 모델 M + Consumable C(replaceEveryDays=180) + ConsumableOnModel(M,C,quantity=2). STAFF 토큰으로 `GET /api/equipment-models/{M}/consumables` → 200, `data[0]` = `{consumableId:C, replaceEveryDays:180, defaultQuantity:2}`. 없는 id → 404.
- [ ] **Step 2: 실패 확인** — Run: `npx vitest run __tests__/integration/equipment/model-consumables.test.ts`
- [ ] **Step 3: 구현** — `requireAuth`+`canManageEquipment`. `prisma.consumableOnModel.findMany({ where:{modelId}, select:{ quantity, consumable:{ select:{ id, sku, nameKo, nameVi, nameEn, replaceEveryDays, cleanEveryDays, cleanOnEveryVisit, retailPrice } } } })`. 모델 존재 확인(없으면 NotFoundError). map → produces 형태(`defaultQuantity`=row.quantity).
- [ ] **Step 4: 통과** — 위 vitest → PASS
- [ ] **Step 5: 커밋**

---

### Task 1.2: validator 확장 (`src/lib/validators/equipment.ts`)

**Files:** Modify `src/lib/validators/equipment.ts`; Test `__tests__/unit/lib/validators/equipment.test.ts`

**Interfaces — Produces (schema 필드):**
- 공용 `serviceConfigSchema`: `{ inspectionCycleDays?: int 1..3600, filters: Array<{ consumableId?:string, customName?:string, quantity:int 1..99, useCycleDays:int 1..3600 }> }` — filter는 `consumableId` XOR `customName`(superRefine); `customName`이면 `useCycleDays` 필수. (기존 `serviceConfig.inspectionCycleMonths`(validator ~201)를 `inspectionCycleDays`로 rename.)
- `bulkRegisterEquipmentSchema`에 추가: `contractNumber?: string(trim,1..60)`, `salePrice?`, `installFee?`, `monthlyRent?`, `monthlyMaintenanceFee?` (money: `z.coerce.number().min(0)`), `hasContract?: boolean`(SALE), `serviceConfig?: serviceConfigSchema`. (기존 `deposit`/`monthlyFee`/`contractTermMonths`/`createContract` 유지.)
- `registerLineSchema`에 추가: `salePrice?`, `installFee?`, `serviceConfig?`; 최상위에 `contractNumber?`.

- [ ] **Step 1: 테스트(RED)** — 케이스: (a) filter에 consumableId+customName 동시 → invalid; (b) customName만 + useCycleDays 없음 → invalid; (c) consumableId+quantity+useCycleDays=180 → valid; (d) inspectionCycleDays=3600 valid / 3601 invalid; (e) rental payload(deposit+monthlyRent+termMonths) valid; (f) sale payload(salePrice+installFee+hasContract) valid.
- [ ] **Step 2: 실패 확인** — Run: `npx vitest run __tests__/unit/lib/validators/equipment.test.ts`
- [ ] **Step 3: 구현** — 위 스키마 추가/rename.
- [ ] **Step 4: 통과 + tsc** — vitest PASS; `npx tsc --noEmit` 0 (route가 아직 신필드 안 읽어도 OK — optional).
- [ ] **Step 5: 커밋**

---

### Task 1.3: `POST /api/equipment/bulk-register` 확장

**Files:** Modify `src/app/api/equipment/bulk-register/route.ts`; Test `__tests__/integration/equipment/bulk-register.test.ts`

**동작 규칙:**
- Equipment.create에 `salePrice: data.salePrice ?? null`, `installFee: data.installFee ?? null` 추가. `monthlyFee`는 임대료/관리비(SALE이면 null). `customInspectionCycleDays` = `data.serviceConfig?.inspectionCycleDays ?? data.customInspectionCycleDays ?? null`.
- serviceConfig.filters → 장비별 `tx.equipmentConsumable.create({ consumableId?|customName?, quantity, replaceEveryDays: f.useCycleDays })`.
- **계약가 집계(보증금 제외)**: RENTAL `totalContractValue = Σ(monthlyRent × termMonths)`, deposit=Σdeposit(별도, 집계 미포함); SALE `totalContractValue = Σ(salePrice) + Σ(installFee)`; MAINTENANCE `Σ(monthlyMaintenanceFee)`. `monthlyMaintenanceFee`(계약)=Σ 월 임대료/관리비.
- **수동 계약번호**: `data.contractNumber` 있으면 그 값으로 create; P2002 → `ValidationError("계약번호 중복")`(자동 -N 안 함). 없으면 기존 `allocateContractCode`+retry.
- **SALE + managementType='FULL_SERVICE'(유지보수 등록)**: SALE 계약(`hasContract`일 때) + **MAINTENANCE 계약** 2건 생성(각 ContractEquipment 동일 장비들). SALE+self-managed면 계약 0~1건(hasContract).

- [ ] **Step 1: 통합테스트(RED)** — 시나리오별 결과 검증: (a) RENTAL: 장비 N + 방문 N + 계약 1(deposit=Σ, totalValue=Σrent×term); (b) SALE+self-managed+hasContract=false: 계약 0, 장비 salePrice/installFee 세팅; (c) SALE+hasContract+유지보수관리: 계약 2(SALE+MAINTENANCE); (d) 수동 contractNumber 중복 → 400; (e) serviceConfig.filters → EquipmentConsumable(replaceEveryDays=useCycleDays) 생성.
- [ ] **Step 2: 실패 확인** — vitest
- [ ] **Step 3: 구현** — 위 규칙대로 route 확장(집계·2계약·수동번호·serviceConfig·salePrice/installFee).
- [ ] **Step 4: 통과 + tsc** — vitest PASS; tsc 0
- [ ] **Step 5: 커밋**

---

### Task 1.4: `register` 라우트 라인별 확장

**Files:** Modify `src/app/api/equipment/register/route.ts` + `registerLineSchema`(1.2 완료분); Test `__tests__/integration/equipment/register.test.ts`

**동작:** 라인별 `salePrice`/`installFee`를 Equipment에 저장(SALE 가격 = salePrice, `line.monthlyFee` 재활용 폐기). serviceConfig 라인별 EquipmentConsumable. 최상위 수동 `contractNumber`(있으면 사용·중복 400). `pickContractType`+집계는 보증금 제외 규칙 반영. (라인들이 한 고객·한 트랜잭션·계약 1건 — 기존 구조 유지, 신필드만.)

- [ ] **Step 1: 통합테스트(RED)** — 2라인(렌탈+판매) → 장비 각 수량, 계약 1(type=RENTAL via pickContractType), 판매라인 salePrice/installFee 세팅, 렌탈라인 deposit/monthlyFee.
- [ ] **Step 2: 실패 확인** — vitest
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 + tsc**
- [ ] **Step 5: 커밋**

---

### Task 1.5: 계약서 PDF 업로드 override

**Files:** Create `src/app/api/contracts/[id]/pdf/upload/route.ts`; Modify `src/app/api/contracts/[id]/pdf/route.ts`; (선택) `src/lib/contracts/pdf-upload.ts`(storeContractPdf 헬퍼); Test `__tests__/integration/contracts/pdf-upload.test.ts`

**동작:**
- `POST .../pdf/upload` (multipart, `canRegeneratePdf`=MANAGER+): file(Blob, application/pdf, ≤10MB) → `uploads/contracts/{contractId}/{ts}-signed.pdf` 기록(미러 operations.ts:88-102), `contract.update({ pdfStorageKey, pdfUploadedAt: <고정 시각 인자 or now via route> })`. (주의: 워크플로우 스크립트가 아닌 실제 라우트이므로 `new Date()` 사용 가능.)
- `GET .../pdf`: 상단에서 contract 로드 → `pdfStorageKey` 있으면 절대경로 resolve 후 그 파일 스트리밍(렌더 스킵); 없으면 기존 `getLatestPdf`/`renderPdf` 경로.

- [ ] **Step 1: 통합테스트(RED)** — MANAGER 토큰으로 PDF 업로드 → 200 + `pdfStorageKey` set. 이후 `GET /pdf` → 업로드본 바이트 반환(Content-Type application/pdf). STAFF 업로드 → 403. 업로드 없는 계약 `GET /pdf` → 렌더 경로(200).
- [ ] **Step 2: 실패 확인** — vitest
- [ ] **Step 3: 구현** — 업로드 라우트 + GET override.
- [ ] **Step 4: 통과 + tsc**
- [ ] **Step 5: 커밋**

---

### Task 1.6: Phase 1 검증 게이트
- [ ] `npx tsc --noEmit` 0 · `npm test` 통과 · `npm run db:reset:dev` 정상

## Phase 2a — 공용 컴포넌트 + bulk 위저드

**Task 2a.1** `src/components/ui/stepper.tsx` 추출(현 인라인 Stepper)
**Task 2a.2** `src/components/equipment/customer-search-select.tsx` (검색기준+결과테이블+상세패널, 서버 `q` 검색) + `NewCustomerModal`
**Task 2a.3** `src/components/equipment/model-picker.tsx` (브랜드/제품군 필터+모델)
**Task 2a.4** `src/components/equipment/service-method-section.tsx` (렌탈/판매/유지보수 + 방식별 필드, NumberInput money)
**Task 2a.5** `src/components/equipment/service-config-editor.tsx` (정기점검 일 + 필터테이블: 구분/제품명/교체주기(기준)/사용주기(편집)/수량/최근교체일/다음예정일 — `nextDueDate` 사용, 모델 소모품 로드)
**Task 2a.6** `bulk-register/page.tsx` 재구성: 4스텝(고객→장비→판매방식→서비스구성), 공용 컴포넌트 조립, 관리번호 자동/직접, 설치일 공통, 기사 배정, excel/paste 제거
- Test(Playwright): 고객검색→모델→수량→관리번호자동→렌탈 계약필드→필터 사용주기 편집→제출→장비/방문/계약 생성 확인

## Phase 2b — register 위저드 (멀티라인)

**Task 2b.1** `register/page.tsx` 4스텝화: 스텝2 모델 라인 배열, 스텝3·4 라인별(아코디언). Phase 2a 컴포넌트 재사용, `ServiceMethodSection`/`ServiceConfigEditor`를 라인별 반복
- Test(Playwright): 2개 모델 라인(렌탈+판매) 등록 → 라인별 계약·서비스구성 생성

## Phase 3 — 계약서 업로드

**Task 3.1** `contract-actions.tsx` 업로드 버튼 + 위저드 확인부 파일첨부(제출 후 계약에 업로드)
- Test: 업로드 후 `GET /pdf`가 업로드본 반환, 없으면 자동렌더

---

## Self-Review (Phase 0)

- **Spec coverage:** §3.1 일전환(Task 0.2–0.6) ✓, §3.2 installFee/salePrice(0.2–0.3) ✓, §3.3 계약 pdf 컬럼(0.2–0.3) ✓. Phase1~3는 §4·5·6을 Subsequent에 매핑 ✓
- **Placeholder scan:** Phase 0 태스크에 TBD 없음; Subsequent는 의도적으로 상위 수준(착수 시 확장 명시) ✓
- **Type consistency:** 신필드명 `replaceEveryDays`/`inspectionEveryDays`/`customInspectionCycleDays`/`customMaintenanceCycleDays` 전 태스크 일치, `nextDueDate` 시그니처 0.1 정의→2a.5 소비 일치 ✓
