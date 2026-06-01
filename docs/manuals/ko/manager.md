# 매니저(MANAGER) 매뉴얼 — Seoul Aqua SOMS

> 본 매뉴얼은 2026-06-01 sprint 완료 시점 기준. MANAGER 는 ADMIN 의 거의 모든 권한을 가지지만 일부 권한(다른 ADMIN 사용자 편집, 시스템 단일 설정) 은 제한됩니다.

## 1. 로그인

ADMIN 과 동일 — `https://<도메인>/ko/login`. 본사 직원 그룹 URL.

## 2. MANAGER 권한 요약

| 기능 | ADMIN | MANAGER | STAFF |
|---|---|---|---|
| 감사 로그 보기 | ✅ | ✅ | ❌ (PR #9 이후) |
| 회사 정보 수정 | ✅ | **✅ (PR #10 이후 신규)** | ❌ |
| 알림 서식 수정 | ✅ | **✅ (PR #10 이후 신규)** | ❌ |
| 제품 카탈로그 (브랜드/제품군/모델/소모품/부속) | ✅ | ✅ | ❌ |
| CSV 카탈로그 업로드 | ✅ | ✅ | ❌ |
| 사용자 관리 | ✅ | ✅ (단, 다른 ADMIN 행 편집 불가) | ❌ |
| 가격 변경 | ✅ | ✅ | ❌ |
| 세금계산서 발행 | ✅ | ✅ | ❌ |
| 고객 비밀번호 리셋 | ✅ | ✅ | ❌ |

## 3. 감사 로그 활용

`/ko/reports/audit` — `docs/manuals/ko/admin.md` §3 참조.

MANAGER 가 ADMIN 의 변경 내역을 모니터링할 수 있습니다. 주요 audit action:

- `USER_UPDATE` / `USER_DISABLE` — 사용자 권한 변경
- `CONTRACT_STATE` — 계약 상태 전환 (DRAFT → PENDING → SIGNED → ACTIVE → CLOSED)
- `CONTRACT_AMEND` — 계약 수정/부록
- `PAYMENT_WRITE_OFF` — 미수금 손실 처리
- `VISIT_CHARGE_OVERRIDE` — **기사가 현장에서 청구금액 변경 (PR #13 신규)**
- `BRAND_*` / `PRODUCT_CATEGORY_*` / `CONSUMABLE_*` / `ACCESSORY_*` — 카탈로그 변경
- `NOTIFICATION_TEMPLATE_*` — 알림 템플릿 변경

## 4. 기사 청구금액 변경 (PR #13) 감독

기사가 visit-complete 시 사전 예상 금액과 다른 금액으로 청구하면 자동으로 `VISIT_CHARGE_OVERRIDE` 감사 로그가 생성됩니다.

### 운영 체크리스트
1. 매일/매주 감사 로그 페이지에서 action 필터에 `VISIT_CHARGE_OVERRIDE` 선택
2. 변경 전/후 금액 + 기사 입력 사유 검토
3. 사유가 모호/누락된 경우 해당 기사 + 고객으로 1:1 후속 (전화/면담)
4. 패턴이 보이는 기사 (예: 매번 할인) 는 별도 평가

### 사유 가이드
기사가 정상적으로 입력하는 사유 예시:
- "추가 부품 교체 (필터 2개 추가 → +300,000 VND)"
- "부분 수리 (인지된 결함 일부만 → -200,000 VND)"
- "영업 할인 (장기 고객 우대 → -150,000 VND)"

비정상 사유 (예: "확인 필요", "테스트", "?") 발견 시 해당 기사 교육 + 감사.

### B2B 세금계산서 영향
B2B 고객의 chargedAmount 가 변경된 경우 사후 세금계산서 재발행이 필요할 수 있습니다 (visit 이 B2B 계약과 연결된 경우). 현재는 자동 처리 안 됨 — MANAGER 가 office 에서 수동 reissue. 향후 자동화 follow-up 예정.

## 5. 회사 정보 + 알림 서식 수정

PR #10 이후 MANAGER 권한 확장. `docs/manuals/ko/admin.md` §4 참조.

수정 시 자동으로 `COMPANY_HQ_PHONE_UPDATE` / `COMPANY_TAX_INFO_UPDATE` / `NOTIFICATION_TEMPLATE_UPDATE` 감사 로그 기록됩니다.

## 6. 알려진 제약

- 다른 ADMIN 사용자 행을 편집 불가 (UI 비활성화 + 서버 가드 동시 적용)
- 시스템 환경 변수 / 인프라 변경 불가 (devops 영역)
- URL prefix 재배치 (phase 2) 진행 중 — 추후 모든 본사 페이지가 `/ko/o/*` prefix 로 이동, 매니저 모두 한 번 재로그인 필요
