# 대량 장비 등록/설치 — 4단계 위저드 재설계 (설계문서)

- **날짜**: 2026-07-08
- **대상 화면**: `/o/{locale}/equipment/bulk-register`
- **파일**: `src/app/o/[locale]/(dashboard)/equipment/bulk-register/page.tsx` (현재 1043줄, 3단계)
- **상태**: 설계 확정 (스키마 변경 승인됨)

## 1. 목표

기존 3단계(`info → list → confirm`) 대량 등록 화면을 **4단계**로 재구성한다:

```
1. 고객 선택  →  2. 장비 정보  →  3. 판매 방식  →  4. 서비스 구성
```

판매방식별 계약 필드, 모델 소모품 기반 서비스 구성(정기점검 + 필터 테이블), 수동 계약서 업로드를 추가한다. 이를 위해 주기 단위를 **개월 → 일**로 전환하고 가격/계약 컬럼을 보강한다.

## 2. 확정된 결정 (해소된 갈림길)

| # | 결정 |
|---|------|
| 주기 단위 | **전면 일(day) 단위 전환**. 기존 개월값은 마이그레이션에서 `× 30`으로 변환 |
| 설치 방문 | **장비별 INSTALLATION 방문 자동생성 + 기사 배정 유지** (스텝2에 기사 선택) |
| 판매가 필드 | `Equipment.salePrice` **신규 분리** (기존 `monthlyFee` 재활용 폐기). `monthlyFee`는 임대료/관리비 전용 |
| 매출/계약가 집계 | **보증금 제외**, **월 임대료(×기간) + 판매가 합산**. 설치비는 판매계약 총액에 1회성 포함 |
| 판매+유지보수 | **계약 2건** 생성 (판매계약 optional + 유지보수계약) |
| 개월→일 계수 | **30 고정** |
| 관리번호 | 스펙의 "장비 관리번호" = `assetCode`. 자동/직접입력. `serialNumber`는 기존대로 자동 백그라운드 생성 |
| 신규 고객 등록 | 위저드 내 **인라인 모달** |
| 시리얼 모드 | 기존 `excel`/`paste` 제거, `auto`/`manual`만 |
| 설치일 | 배치 공통 1개 (행별 날짜 폐기) |
| 계약번호 | `contractNumber @unique` **직접입력** 허용 (자동번호를 기본 제안, 덮어쓰기 가능, 중복검사) |
| 계약서 override | `TaxInvoice.pdfStorageKey` 패턴 복제 — 업로드본 우선, 없으면 자동 렌더 |
| 단일 등록(`register`) | **동일 4스텝 위저드**로 재설계. 스텝2 = 여러 모델 라인 추가, 스텝3·4 = **라인별** 판매방식·서비스구성 |

## 3. 스키마 변경 (Phase 0)

### 3.1 주기 개월 → 일 (기존값 `× 30` 변환)

| 모델 | 변경 |
|------|------|
| `Consumable` | `replaceEveryMonths → replaceEveryDays`, `cleanEveryMonths → cleanEveryDays` |
| `EquipmentModel` | `inspectionEveryMonths → inspectionEveryDays` |
| `Equipment` | `customInspectionCycle`(개월→일), `customMaintenanceCycle`(개월→일) |
| `EquipmentConsumable` | `replaceEveryMonths → replaceEveryDays` |

**파급(일 기준으로 갱신)**: `src/components/equipment/service-config-table.tsx`, `GET /api/equipment/[id]/service-config`, 필터만기 크론, `prisma/seed.ts`, 관련 validator(`equipmentConsumable.ts` 등)·PDF·알림 템플릿. 다음예정일 계산 = `최근교체일 + N일`.

### 3.2 가격 필드

- `Equipment.installFee Decimal?` **신규** — 설치비(판매)
- `Equipment.salePrice Decimal?` **신규** — 판매단가. 기존에 `monthlyFee`를 판매가로 재활용하던 `equipment/register` 라우트도 `salePrice`로 이관
- `Equipment.monthlyFee` — 임대료(RENTAL)/관리비(MAINTENANCE) 전용으로 의미 정리 (SALE이면 null)

### 3.3 계약

- `Contract.pdfStorageKey String?` + `Contract.pdfUploadedAt DateTime?` **신규** (업로드 override)
- `contractNumber` — 스키마 그대로. 라우트/validator가 클라이언트 제공 번호를 수용(없으면 `allocateContractCode` 자동)

### 3.4 매출/계약가 집계 규칙

- `Contract.totalContractValue` = (RENTAL) `Σ(월임대료 × termMonths)` / (SALE) `Σ 판매가 + Σ 설치비` / (MAINTENANCE) `Σ(월관리비)` — **보증금 제외**
- `Contract.deposit` = `Σ 보증금` (RENTAL만, 집계엔 미포함)
- `Contract.monthlyMaintenanceFee` = `Σ monthlyFee` (임대료/관리비 합 캐시)

## 4. API 변경 (Phase 1)

### 4.1 `POST /api/equipment/bulk-register` 확장
`src/lib/validators/equipment.ts`의 `bulkRegisterEquipmentSchema` + `route.ts` 확장:
- `serviceConfig`: `{ inspectionCycleDays?: number, filters: Array<{ consumableId?, customName?, quantity, useCycleDays }> }` — **UI에 실제 연결** (라우트엔 이미 `filterOverrides → EquipmentConsumable` 생성 로직 존재)
- 수동 `contractNumber?`, 판매방식별: `deposit`/`monthlyRent`/`termMonths`(RENTAL), `salePrice`/`installFee`/`hasContract`/`managementType`(SALE), `monthlyMaintenanceFee`(MAINTENANCE)
- SALE + `managementType=유지보수` → 판매계약(optional) + **유지보수 계약** 동시 생성 (계약 2건)
- 장비별 `installFee`/`salePrice`, `customInspectionCycle`(일), `EquipmentConsumable`(consumableId·quantity·`replaceEveryDays`=사용주기) 저장

### 4.2 신규 엔드포인트
- `GET /api/equipment-models/[id]/consumables` — 모델 기본 소모품 구성 (`ConsumableOnModel` + `Consumable`): `구분(category)·제품명·replaceEveryDays·기본수량`. (현 모델 API는 소모품 미포함)
- `POST /api/contracts/[id]/pdf/upload` (multipart, MANAGER+) — `pdfStorageKey` 저장
- `GET /api/contracts/[id]/pdf` 수정 — 업로드본 우선, 없으면 렌더

## 5. 4단계 위저드 (Phase 2)

### 스텝 1 — 고객 선택
첨부 "고객검색.png" 레이아웃. 좌/우 2단.
- **좌 검색**: 검색기준 드롭다운(고객명/고객번호/담당자/연락처) + 검색어 → 결과 테이블(고객번호·고객명·담당자·연락처·주소) + 라디오 선택. 서버 `GET /api/customers?q=` 사용(이미 고객번호/명/**운영담당자명·연락처**/사이트주소 검색 지원)
- **우 상세**: 담당자·주소·연락처·이메일·고객구분·보유장비수·계약수·다음점검예정·메모
- **+ 신규 고객 등록** → 인라인 모달(`NewCustomerModal`), 등록 후 자동 선택

### 스텝 2 — 장비 정보
- 모델(브랜드/제품군 필터, 단일 선택) · 수량 · 설치일(배치 공통, 기본 오늘) · **담당 기사**(설치방문 배정)
- 관리번호 방식: `자동생성`/`직접입력` (자동시 미리보기 표시) → `assetCode`
- (사이트 보유 고객) 설치 위치(Site) · 설치 메모(현장기사 노출)

### 스텝 3 — 판매 방식
라디오(렌탈/판매/유지보수) → 방식별 섹션. 금액은 공용 `NumberInput variant="money"`(₫, ▲▼ 1000동 스텝).
- **렌탈**: 계약번호(직접) · 계약일(기본 오늘) · 계약기간(월, 기본 36) · 보증금 · 월임대료
- **판매**: 계약여부 있음/없음(기본 없음) → 있음시 [계약번호·계약일] / 판매단가(기본=모델 판매가∥0) · 설치비(기본 0) · 관리방식 `self-managed`/`유지보수 계약 등록`(기본 self) → 유지보수시 유지보수 섹션 노출
- **유지보수**: 계약번호(직접) · 계약일(기본 오늘) · 월관리비(1대/1회, 기본 0)

### 스텝 4 — 서비스 구성
- 선택 장비 표시(스텝2 결과)
- **정기점검 주기**: 일단위(기본 30). **판매 + self-managed면 비활성화**
- **필터구성 테이블** (첨부 "필터구성.png"): 스텝2 모델의 소모품 로드 → 행 추가/제거. 열:
  - 구분(category) · 제품명 · **교체주기(일, 기준=모델값, read-only)** · **사용주기(일, 편집, 기본=교체주기)** · 수량(기본=모델 기본수량) · 최근교체일(=설치일, read-only) · 다음예정일(=설치일 + 사용주기, 계산)
- 제출 → 장비별 `EquipmentConsumable`(consumableId·quantity·replaceEveryDays=사용주기) + `customInspectionCycle`(일)

### 제출 동작 (기존 유지 + 확장)
1건의 `$transaction`: N개 `Equipment` → 장비별 `EquipmentConsumable` → 장비별 `INSTALLATION` 방문(기사 배정) → 판매방식별 계약(들) + `ContractEquipment` → 감사로그. 완료 후 계약 상세 or 고객 장비탭으로 이동.

### 스텝별 변형 — 단일 등록 화면 (`equipment/register`)
같은 4스텝 위저드 셸·공용 컴포넌트를 재사용하되 **여러 모델을 한 번에** 넣는 성격을 반영:
- **스텝1 고객 선택**: 동일
- **스텝2 장비 정보**: 단일 모델 대신 **모델 라인 여러 개 추가**(라인 = 모델 + 수량 + 관리번호 방식 + (사이트 고객시) 설치 위치). 설치일·담당 기사는 배치 공통 or 라인별(기본 공통)
- **스텝3 판매 방식**: **라인별** 판매방식 섹션(아코디언/라인 탭). 라인마다 렌탈/판매/유지보수 + 방식별 필드 독립
- **스텝4 서비스 구성**: **라인별** 정기점검 + 필터 테이블(각 라인 모델의 소모품 로드)
- 제출: 라인별로 `Equipment×수량` + 서비스구성 + 계약을 생성(라인들이 한 고객·한 트랜잭션). 계약 묶음 규칙은 기존 `register` 라우트의 `pickContractType`/라인 병합 로직을 신 필드에 맞춰 확장

## 6. 계약서 수동 업로드 (Phase 3)
- 위저드 확인부에 "계약서 PDF 업로드(자동생성 대체)" 선택 파일 → 제출시 생성된 계약에 첨부(계약 생성 후 업로드)
- `src/components/contracts/contract-actions.tsx`에 업로드 버튼 → 언제든 교체
- 서빙: 업로드본 있으면 그것, 없으면 자동 렌더

## 7. 컴포넌트 추출
현재 두 위저드(`bulk-register`, `register`)에 인라인 중복된 것들을 공용화:
- `Stepper` (현재 인라인) → `src/components/ui/stepper.tsx`
- `CustomerSearchSelect` (검색+결과+상세) — 신규
- `ModelPicker` (브랜드/제품군 필터 + 모델) — 추출
- `ServiceConfigEditor` (정기점검 + 필터 테이블, 등록 전용/편집 가능) — 신규 (기존 `ServiceConfigTable`은 등록 후 전용이라 별개)
- `NewCustomerModal` — 신규
- `ServiceMethodSection` (렌탈/판매/유지보수 + 방식별 필드) — 신규, bulk는 배치 1개·register는 라인별 반복
- 금액 입력은 로컬 `MoneyInput` 폐기 → 공용 `NumberInput variant="money"`

위 컴포넌트는 **bulk·register 두 위저드가 공유**. 차이는 스텝2(단일모델×N vs 멀티라인)와 스텝3·4의 적용 단위(배치 vs 라인별)뿐.

## 8. 구현 순서
- **Phase 0**: 스키마 + 마이그레이션(일 전환·installFee/salePrice·계약 컬럼) + 기존 월기반 readers 갱신
- **Phase 1**: API(bulk-register 확장·모델 소모품 엔드포인트·계약 업로드)
- **Phase 2**: 위저드 UI + 공용 컴포넌트 추출
  - **2a** 공용 컴포넌트 + `bulk-register`(동일모델×N)
  - **2b** `register`(멀티라인, 스텝3·4 라인별) — 2a 컴포넌트 재사용
- **Phase 3**: 계약서 업로드 override(위저드 + 계약 상세)

각 Phase는 프로젝트 TDD 파이프라인(RED → 구현 → GREEN → review → qa)을 따른다.

## 9. 비목표 (Out of scope)
- 계약서 PDF 템플릿 내용 변경
- 지역/지도 기반 기사 자동배정 (Phase 7+ TODO)

## 10. 미해결 질문
- 없음 (스펙 + 3.2절 결정으로 모두 해소)
