# 관리자(ADMIN) 매뉴얼 — Seoul Aqua SOMS

> 본 매뉴얼은 2026-06-01 sprint 완료 시점 기준입니다. 본사 직원(`/login`) 으로 로그인한 ADMIN 사용자가 사용 가능한 기능을 정리합니다. 신규/변경 기능 위주이며, 기존 매뉴얼은 phase 별로 보강 예정입니다.

## 1. 로그인

- URL: `https://<도메인>/ko/login`
- ID: 등록된 username 또는 전화번호
- 비밀번호: 관리자 발급 비밀번호 (최초 로그인 시 변경 강제)
- 5회 실패 시 15분 자동 잠금. 잠긴 계정은 다른 관리자가 풀거나 잠금 해제 시간 대기.

⚠️ **그룹별 로그인 URL 분리**: 현장 직원(기사)은 `/ko/mobile/login` 에서, 고객은 `/ko/portal/login` 에서 로그인합니다. 본사 직원 ID 로 mobile/portal 페이지에 로그인 시도 시 "본사 직원 로그인으로 이동" 안내 + 자동 이동 버튼이 표시됩니다.

## 2. 사이드바 메뉴 구조

ADMIN 은 모든 메뉴를 봅니다:
- 대시보드, 고객, 장비, 계약, 방문, 서비스 요청, 수금, 세금계산서, 보고서
- **관리자** 그룹: 감사 로그, 제품 카탈로그, 사용자 관리, 회사 정보, 알림 서식

MANAGER 는 같은 메뉴를 보지만 일부 작업(예: 사용자 권한 변경)이 제한됩니다. STAFF/TECHNICIAN 은 사이드바 자체에 관리자 그룹이 표시되지 않습니다.

## 3. 감사 로그 (Audit Log)

**경로**: 사이드바 → 관리자 → 감사 로그 (`/ko/reports/audit`)

ADMIN + MANAGER 만 접근 가능. STAFF/TECHNICIAN 진입 시 "관리자 또는 매니저 권한이 필요합니다" 화면.

### 화면 구성
- **필터**: entityType 드롭다운, action 드롭다운(엔티티별 그룹화), 작성자, 날짜 범위, 자유 검색어
- **목록**: 한 줄 자연어 문장 형태로 표시. 예: "홍길동(관리자)이 김철수(고객) 정보를 수정했습니다."
- **상세 drawer**: 행 클릭 시 사이드 패널 — 변경된 필드만 비교 표(예: `선호 기사: 없음 → 박기사`), 시각/IP/UA 메타, 접이식 "기술 정보" 섹션에 raw action 코드 + entityType + cuid

### 민감 정보 마스킹
`passwordHash`, `refreshTokenHash`, `*Token`, `*Secret` 등의 필드는 자동으로 `••••` 로 표시됩니다. UI, JSON 응답, CSV 다운로드 모두 동일.

### 미등록 action 코드
신규 기능이 추가되었지만 카탈로그(`src/lib/audit/labels.ts`) 에 라벨이 등록되지 않은 경우 `(미등록)` 태그가 표시됩니다. 개발자에게 보고하면 카탈로그 추가됩니다.

### CSV 다운로드
필터 적용 상태에서 우측 상단 "CSV 다운로드" 버튼 — 동일 redact 적용된 raw 컬럼 형식.

## 4. 회사 정보 + 알림 서식 (Manager 도 수정 가능)

- **회사 정보** (`/ko/admin/company-contact`): HQ 전화 + 세무 정보 (법인명/주소/대표/MST). 60초 캐시 후 모든 SMS/이메일 + 계약서/세금계산서 PDF 에 반영.
- **알림 서식** (`/ko/admin/notification-templates`): DB 오버라이드 + 파일 디폴트. 각 (templateCode × locale) 행을 편집/되돌리기.

⚠️ Phase 4 이전엔 ADMIN-only 였습니다. 현재는 MANAGER 도 수정 가능 (PR #10).

## 5. 사용자 관리

`/ko/admin/users` — ADMIN + MANAGER 접근. 단, MANAGER 는 다른 ADMIN 행을 만질 수 없음 (UI 비활성화).

## 6. 기사 청구금액 변경 모니터링 (PR #13)

기사가 현장에서 visit-complete 시 예상 금액과 다른 금액으로 청구하면 `VISIT_CHARGE_OVERRIDE` 감사 로그가 자동 기록됩니다. 감사 로그 페이지에서:
- entityType 필터에 `Visit` 선택
- action 필터에 `VISIT_CHARGE_OVERRIDE` 선택

상세 drawer 에서 변경 전/후 금액 + 기사가 입력한 사유 확인. 사유가 의심스러우면 해당 기사 + 고객 으로 후속 조사.

## 7. 알려진 제약

- **URL prefix 재배치 진행 중** (phase 2): 향후 본사 직원 페이지가 `/ko/o/*` 로, 현장 직원이 `/ko/f/*` 로, 고객이 root `/ko/...` 로 이동합니다. 머지 시 본사 직원 모두 한 번 재로그인 필요 (쿠키 이름 변경).
- **매뉴얼 영어/베트남어 미러는 별도 PR** — 현재 ko 만 작성됨.
