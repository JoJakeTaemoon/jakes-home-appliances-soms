# 클라이언트 질문 리스트 — Seoul Aqua SOMS

> **For client (Seoul Aqua):** 아래 질문에 답을 주시면 SPEC.md를 확정하고 Phase 1 개발을 시작할 수 있습니다. 시급한 항목(blocker)은 **★** 표시되어 있습니다. 답변이 없을 경우 추천 기본값으로 진행합니다.
>
> **For developers:** this is the markdown twin of `QUESTIONS.docx`. Keep both in sync — edit here, regenerate the docx via `scripts/generate-questions-docx.py`.

**Version:** v0.1 (2026-05-25)
**Total questions:** 37
**Blockers for Phase 0 → Phase 1:** Q1, Q11, Q14, Q24, Q33 (5 items)

---

## A. 고객 및 장비 코드 (Customer & Equipment coding)

### A.1 ★ 고객 코드 형식 / Customer code format
**Question (KO):** 신규 시스템에서 고객 코드는 `KH00001` 형식(KH + 5자리)으로 자동 생성됩니다. 이 형식 사용 OK인가요? 다른 prefix를 원하시면 알려주세요. (예: `SA00001`, `CUS00001`)

**Question (EN):** New system auto-generates customer codes as `KH00001` (KH + 5-digit sequence). Is this format OK? Alternate prefix preferred? (e.g., `SA00001`, `CUS00001`)

**Why it matters:** 모든 화면, 모든 문서, 모든 PDF에 노출되는 1차 식별자입니다.

**Blocks:** Phase 2 시작 (고객 마스터)

**Default if no answer:** `KH#####`

---

### A.2 ★ 기존 관리번호와의 매핑 / Legacy management number mapping
**Question (KO):** 현재 사용중인 관리번호(예: `8918`)는 신규 KH코드와 어떻게 매핑할까요?
- (a) KH코드 새로 생성, 기존 관리번호는 참조용 컬럼에 보관 — 추천
- (b) 기존 관리번호를 그대로 신규 KH코드로 변환 (예: `8918` → `KH08918`)
- (c) 기타

**Question (EN):** Existing management numbers (e.g., `8918`) — how to migrate to new KH codes?
- (a) Generate fresh KH codes, keep legacy number as reference column — recommended
- (b) Convert legacy number to KH directly (`8918` → `KH08918`)
- (c) Other

**Why it matters:** 9000+ 기존 고객 데이터 마이그레이션 정책.

**Blocks:** Phase 2

**Default if no answer:** (a) 신규 KH 발급 + `legacyCode` 컬럼 보존

---

### A.3 장비 코드 재사용 정책 / Equipment code reuse on retirement
**Question (KO):** 장비를 폐기/회수한 경우, 해당 장비 코드(예: `KH00001-3`)는 재사용해야 합니까, 아니면 영구 결번 처리합니까?

**Question (EN):** When a device is retired or returned, should the equipment code (`KH00001-3`) be reused for a future install, or permanently retired?

**Why it matters:** 이력 추적성 vs 코드 간결함의 trade-off.

**Blocks:** Phase 2

**Default if no answer:** 영구 결번 (이력 추적이 더 중요)

---

### A.4 한 고객이 여러 위치에 장비 / Multi-location B2B customer
**Question (KO):** 한 B2B 고객사가 여러 사업장(공장 A, 공장 B, 본사)에 장비를 보유한 경우, 어떻게 관리하시고 싶습니까?
- (a) 사업장별로 별도 고객 코드 (KH00001-본사, KH00002-공장A 등) — 현재 방식
- (b) 하나의 고객 코드 + 장비 단위에 "설치 위치(사업장)" 필드
- (c) 고객-사업장 계층 (Customer > Site > Equipment) — 가장 유연

**Question (EN):** A B2B customer with equipment at multiple sites (Plant A, Plant B, HQ) — how to model?
- (a) Separate customer code per site — current practice
- (b) One customer code + "install site" field on each Equipment
- (c) Hierarchical: Customer > Site > Equipment — most flexible

**Why it matters:** 64-device factory같은 큰 고객사 운영 방식에 영향.

**Blocks:** Phase 2 (스키마 결정)

**Default if no answer:** (b) — 단순함 + 위치 추적 모두 만족

---

### A.5 필터-장비 호환성 데이터 / Filter-equipment compatibility data
**Question (KO):** "어떤 필터가 어떤 장비에 사용 가능한지" 데이터를 곧 보내주시기로 하셨습니다. 예상 전달 시점이 언제인가요? Phase 5 (필터 라이프사이클)에 필요합니다.

**Question (EN):** You mentioned providing equipment-filter compatibility data soon. Expected delivery date? Needed for Phase 5 (filter lifecycle).

**Why it matters:** 자동 "내일 어떤 필터 가져가야 함" 알림 정확도.

**Blocks:** Phase 5

**Default if no answer:** Phase 5에 빈 호환표로 시작, 직원이 수기 입력

---

## B. 계약 및 라이프사이클 (Contract & lifecycle)

### B.1 판매 → 임대 → 유지관리 전환 / Sale-to-rental-to-maintenance conversion
**Question (KO):** 판매 고객이 나중에 임대 또는 유지관리 계약을 추가로 체결하는 경우가 있나요? 그 경우 같은 장비를 어떻게 처리하시나요?

**Question (EN):** Does a sale customer ever later sign a rental or maintenance contract? If so, how is the same device handled?

**Blocks:** Phase 3

**Default if no answer:** 판매 후 별도 유지관리 계약만 가능 (장비 소유권은 고객, 서비스만 회사)

---

### B.2 ★ 계약 코드 형식 / Contract code format
**Question (KO):** 계약서 번호 형식을 어떻게 잡을까요?
- (a) `HD-YYYY-####` (예: `HD-2026-00001`) — 추천
- (b) `2026/030325/DA-SHV` 형식 (현재 임대 계약서 sample에 보이는 형식)
- (c) 기타

**Question (EN):** Contract number format?
- (a) `HD-YYYY-####` (e.g., `HD-2026-00001`) — recommended
- (b) `2026/030325/DA-SHV` (current sample format)
- (c) Other

**Blocks:** Phase 3

**Default if no answer:** (a) — 정렬과 검색에 유리

---

### B.3 36개월 후 소유권 이전 기록 / Post-36-month ownership transfer record
**Question (KO):** 임대 36개월 완료 후 소유권이 고객에게 이전됩니다 (임대 계약서 §3-2). 이때 시스템에서:
- (a) 계약 status를 `COMPLETED` + 장비의 ownership 필드를 자동 변경
- (b) 별도 "소유권 이전 확인서" PDF 발행
- (c) (a) + (b) 둘 다

**Question (EN):** At end of 36-month rental, ownership transfers to customer (per §3-2). System should:
- (a) Auto-update contract status to `COMPLETED` + Equipment ownership
- (b) Issue separate "Ownership Transfer Confirmation" PDF
- (c) Both

**Blocks:** Phase 3

**Default if no answer:** (a) — 별도 문서 필요시 추후 추가

---

### B.4 ★ 계약 자동 갱신 정책 / Contract auto-renewal
**Question (KO):** 가정집 임대 계약서 §9에 "만료 1개월 전까지 해지 통지 없으면 자동으로 유지관리 계약으로 1년 자동 갱신"이라 적혀있습니다. 시스템에서 자동으로 처리할까요, 아니면 직원이 수동으로 확인 후 처리할까요?

**Question (EN):** §9 of B2C rental contract states auto-renewal as maintenance contract for 1 year if neither party terminates 1 month ahead. Auto-process or manual confirmation?

**Why it matters:** 자동 갱신은 빠르지만 단순 실수도 빨라짐.

**Blocks:** Phase 3 (계약 라이프사이클 로직)

**Default if no answer:** 직원 확인 후 1-click 갱신 (자동 알림 + 수동 액션)

---

### B.5 가격 변경 / Contract amendment policy
**Question (KO):** 계약 도중 가격 변경이 발생할 경우 어떻게 기록할까요?
- (a) 계약은 immutable — 새 계약 발행
- (b) 계약에 amendment 이력 (revision 1, 2, …) 추가
- (c) 가격 필드만 업데이트, 이력은 audit log에만

**Question (EN):** When contract pricing changes mid-term, how to record?
- (a) Immutable contracts — issue new contract
- (b) Add amendment history (revision 1, 2, …)
- (c) Update price field, history only in audit log

**Blocks:** Phase 3

**Default if no answer:** (b) — 법적 안전성 + 이력 가시성

---

## C. 방문, 일정, 기사 운영 (Visit, schedule, technician operations)

### C.1 기사 배정 알고리즘 / Technician assignment algorithm
**Question (KO):** 신규 방문 일정 발생시 기사 배정을:
- (a) 사무실이 수동 배정 (현재 방식)
- (b) 시스템이 자동 추천 (지역, 부하, 전문분야 기반) — 사무실이 확인 후 확정
- (c) 완전 자동

**Question (EN):** When a new visit is scheduled, technician assignment:
- (a) Manual by office (current)
- (b) System suggests (by region, load, specialty), office confirms — recommended
- (c) Fully automated

**Blocks:** Phase 4

**Default if no answer:** (b) — phased rollout가능 (먼저 수동, 그 다음 추천)

---

### C.2 기사별 담당 지역 / Technician territories
**Question (KO):** 기사는 특정 지역(군/구) 담당이 있나요? 아니면 모든 기사가 모든 지역 방문 가능?

**Question (EN):** Are technicians assigned territories (district), or any tech anywhere?

**Blocks:** Phase 4 (배정 로직 + UI)

**Default if no answer:** "선호 지역" 필드 (soft preference), 강제는 아님

---

### C.3 ★ 모바일 앱 vs PWA / Mobile app vs PWA
**Question (KO):** 기사용 모바일 인터페이스를:
- (a) PWA (브라우저 기반, 앱스토어 불필요) — 추천, 빠른 출시
- (b) 네이티브 앱 (iOS + Android) — Phase 7+ 별도 프로젝트

**Question (EN):** Technician mobile interface:
- (a) PWA (browser-based, no app store) — recommended for speed
- (b) Native app (iOS + Android) — Phase 7+ separate project

**Why it matters:** 네이티브 앱은 사진/서명/오프라인이 더 매끄럽지만 출시까지 3-6개월 추가.

**Blocks:** Phase 4

**Default if no answer:** (a) PWA — v1 빠른 출시

---

### C.4 오프라인 데이터 입력 / Offline data entry
**Question (KO):** 기사가 인터넷 없는 곳(지하 주차장 등)에서 작업할 때 데이터 입력이 가능해야 합니까?
- (a) 필수 (오프라인 입력 + 온라인 복귀 시 자동 sync)
- (b) 선택사항 (현재 작업 후 잠시 후 입력)
- (c) 인터넷 필수

**Question (EN):** Should technicians be able to enter data offline (basement, no signal)?
- (a) Required (offline entry + auto-sync when online)
- (b) Optional (enter later when reconnected)
- (c) Internet required

**Blocks:** Phase 4 (오프라인 큐 구현 vs 단순화)

**Default if no answer:** (b) — v1는 온라인 우선, Phase 7에서 오프라인 큐 추가 검토

---

### C.5 지도 / 동선 최적화 / Maps + route optimization
**Question (KO):** 기사 동선을 지도에 표시하고 최적 경로 추천하시고 싶으세요? 예/아니오, 그리고 어떤 지도 제공자 (Google Maps / Goong Maps / OpenStreetMap)?

**Question (EN):** Map view + route optimization for technician daily route? Yes/no, and which map provider?

**Why it matters:** Google Maps API 비용 vs Goong (Vietnam local, 더 저렴).

**Blocks:** Phase 4+ (선택 기능)

**Default if no answer:** v1는 지도 없이 지역 기준 정렬, Phase 4+에 Goong Maps 검토

---

## D. 결제 및 청구 (Payments & invoicing)

### D.1 베트남 전자 세금계산서 / Vietnamese e-invoice provider
**Question (KO):** 현재 어떤 베트남 전자세금계산서 솔루션을 사용중이신가요? 시스템과 직접 연동 원하시면 그 provider 알려주세요.
- Viettel SInvoice
- MISA
- VNPT eHoadon
- FPT eInvoice
- 기타: _______

**Question (EN):** Which Vietnamese e-invoice provider do you currently use? Which to integrate?

**Why it matters:** 직접 연동은 큰 작업 (~3주). v1는 외부 발행한 PDF 업로드로 시작.

**Blocks:** Phase 6 (선택), Phase 8 (필수)

**Default if no answer:** v1는 PDF 업로드만, Phase 8에서 Viettel SInvoice 통합 검토

---

### D.2 현금 인수인계 감사 / Cash handover audit trail
**Question (KO):** 기사가 현금 수금 후 본사 입금까지의 흐름을 어떻게 추적/감사하시고 싶으세요?
- 기사 수금 → 시스템에 입력
- 본사 입금 → 회계가 시스템에 매칭
- 차이가 있을 때 알림?

**Question (EN):** Cash collection by technician → office deposit. How to audit?

**Blocks:** Phase 6

**Default if no answer:** 3단계 (수금 → 사무실 수신 → 정산 매칭), 24시간 미입금 시 알림

---

### D.3 부분 납부 / Partial payment handling
**Question (KO):** 고객이 1회분(예: 560,000 VND) 중 일부만 납부하는 경우 발생합니까? 어떻게 처리하시나요?

**Question (EN):** Does a customer ever pay partial installment (e.g., 300K of 560K monthly)? How to handle?

**Blocks:** Phase 6 (Payment 스키마)

**Default if no answer:** 부분 납부 허용; 잔액은 다음 회차에 합산

---

### D.4 통화 표시 / Currency display
**Question (KO):** VND 단독으로 표시 OK인가요? USD / KRW도 함께 표시할 일이 있을까요?

**Question (EN):** Display VND only, or also show USD / KRW (e.g., for Korean management reporting)?

**Blocks:** Phase 1 (UI 기본 설정)

**Default if no answer:** VND 단독 — 환산은 보고서 export에서

---

### D.5 세금계산서 불필요 B2B 고객 처리 / B2B no-invoice flow
**Question (KO):** 일부 B2B 고객은 세금계산서 발행이 필요없다고 하셨습니다. 시스템에서 어떻게 구분하고 어떻게 처리하나요?

**Question (EN):** Some B2B customers don't need a tax invoice. How to flag and handle?

**Blocks:** Phase 6

**Default if no answer:** Customer record에 `requiresTaxInvoice: boolean` 필드, 청구 화면에서 분기

---

## E. 문서 및 서명 (Documents & signatures)

### E.1 ★ 서명 메커니즘 / Signature mechanism
**Question (KO):** v1에서 고객 서명을 어떻게 받을까요?
- (a) 사진 촬영 (현재 종이 서명을 기사가 사진 찍어 업로드) — 추천, 빠른 출시
- (b) 태블릿 터치 서명 (Phase 7에 도입)

**Question (EN):** v1 customer signature mechanism?
- (a) Photo of paper signature — recommended
- (b) Tablet touch signature — Phase 7

**Why it matters:** (b)는 ~2주 추가 작업.

**Blocks:** Phase 3

**Default if no answer:** (a) — v1 빠른 출시

---

### E.2 정기 점검 확인서 — 필터 무료 표시 / B2B periodic check filter free
**Question (KO):** B2B 정기 점검 확인서에 단가가 없는 이유는 임대 계약상 필터가 무료라서 인가요? 다른 이유가 있나요?

**Question (EN):** B2B periodic check form shows no unit price — is this because filters are free under rental? Other reason?

**Blocks:** Phase 3 (문서 템플릿 정확도)

**Default if no answer:** 임대 무료라고 가정

---

### E.3 정기 점검 확인서 — 내부 필터 기록 / B2B internal filter record
**Question (KO):** B2B 정기 점검 확인서에 필터 종류와 수량이 보이지 않습니다. 내부적으로는 어떻게 기록하시나요?

**Question (EN):** B2B periodic check doesn't show filter type/quantity to customer. How recorded internally?

**Blocks:** Phase 5 (필터 이력)

**Default if no answer:** PartReplacement 테이블에만 기록, 고객 문서엔 미표시

---

### E.4 문서 보관 기간 / Document retention period
**Question (KO):** 계약서, 영수증, 점검표 등 문서를 몇 년 보관해야 합니까? (베트남 법규 + 회사 내부 정책)

**Question (EN):** Document retention period (Vietnamese law + internal policy)?

**Blocks:** Phase 3 (storage lifecycle 정책)

**Default if no answer:** 7년 (베트남 계약법 시효 + 안전 여유)

---

### E.5 종이 원본 폐기 시점 / Paper original disposal
**Question (KO):** 디지털 사본이 보관되면 종이 원본은 언제부터 폐기 가능한가요?

**Question (EN):** Once digital archive exists, when can paper originals be shredded?

**Blocks:** Phase 3 (운영 정책)

**Default if no answer:** 디지털 보관 + 1년 후 폐기 (실제 폐기는 사용자 결정)

---

## F. 알림 및 고객 접점 (Notifications & customer touch)

### F.1 ★ SMS 제공자 / SMS provider
**Question (KO):** 베트남에서 어떤 SMS 게이트웨이를 사용하시나요? 또는 새로 선택해야 하나요?
- eSMS.vn (베트남 로컬, 저렴)
- FPT SMS
- Twilio Vietnam
- VNPT SMS
- 기타: ___________

**Question (EN):** Which Vietnamese SMS gateway are you using or want to use?

**Blocks:** Phase 7

**Default if no answer:** eSMS.vn — 베트남 시장 가장 보편적

---

### F.2 이메일 전송 / Email sender
**Question (KO):** B2B 세금계산서 + 향후 마케팅 이메일 전송용 솔루션은?
- vhost.vn Email Relay (저렴)
- SendGrid / Mailgun (글로벌)
- AWS SES (저렴, 설정 복잡)
- 기타: ___________

**Question (EN):** Email provider for B2B invoice + future marketing?

**Blocks:** Phase 7

**Default if no answer:** SendGrid — 영문 + 베트남어 모두 안정적

---

### F.3 알림 거부 / Notification opt-out
**Question (KO):** 고객이 SMS/email 수신 거부할 수 있어야 합니까? 어느 범위까지?

**Question (EN):** Can customers opt-out of SMS/email? At what granularity?

**Blocks:** Phase 7

**Default if no answer:** Yes, 채널별 opt-out (SMS off / email off 독립) + 시스템 알림(예: 결제 영수증)은 항상 전송

---

## G. 향후 고객 포털 (Customer portal — future)

### G.1 고객 포털 활성화 시점 / Customer portal activation
**Question (KO):** B2C / B2B 고객 포털은 언제쯤 활성화 원하시나요?
- (a) v1 출시 후 6개월 (Phase 8)
- (b) v1 출시 후 12개월
- (c) 미정 — 일단 내부 운영 안정화 우선

**Question (EN):** When to activate customer portal?
- (a) 6 months post-v1 (Phase 8)
- (b) 12 months post-v1
- (c) TBD — internal stabilization first

**Blocks:** None (Phase 1-7 영향 없음; 설계 단계에서만 고려)

**Default if no answer:** (c) — 내부 운영이 잘 돌아가야 외부 공개 의미

---

### G.2 B2C vs B2B 포털 차이 / B2C vs B2B portal differences
**Question (KO):** B2C 포털과 B2B 포털의 기능 차이는?
- B2C: 본인 계약 조회, 방문 예약, 결제 이력
- B2B: 위 + 회사 전체 장비 list, 부서별 다운로드, 세금계산서 다운로드

**Question (EN):** B2C portal vs B2B portal feature difference?

**Blocks:** Phase 8

**Default if no answer:** 위와 같은 분리

---

### G.3 포털 결제 / Portal payment
**Question (KO):** 향후 고객이 포털에서 직접 결제 (VNPay / MoMo / VietQR 등) 가능하게 할 계획이 있나요?

**Question (EN):** Future: direct online payment via portal (VNPay / MoMo / VietQR)?

**Blocks:** Phase 8+

**Default if no answer:** 미결정; 결정 시 별도 phase

---

## H. 호스팅 및 컴플라이언스 (Hosting & compliance)

### H.1 데이터 잔류 요구사항 / Data residency requirement
**Question (KO):** 베트남 개인정보보호법 또는 회사 정책으로 인해 데이터가 **반드시 베트남 내**에 저장되어야 합니까?
- (a) 베트남 필수 — vhost.vn 호스팅
- (b) Singapore / 한국 OK — Vercel + Supabase Singapore region OK
- (c) 모름 — 추후 확인

**Question (EN):** Data residency requirement (Vietnamese PDP law)?
- (a) Vietnam-only — vhost.vn
- (b) Singapore / Korea OK — Vercel + Supabase
- (c) Unknown — confirm later

**Blocks:** Phase 1

**Default if no answer:** (b) — 빠른 출시. 후에 (a) 필요시 vhost.vn migration plan 발동

---

### H.2 감사 로그 보관 / Audit log retention
**Question (KO):** 시스템 사용 감사 로그(누가 언제 무엇을 했는지)는 몇 년 보관해야 합니까?

**Question (EN):** Audit log retention period?

**Blocks:** None (default OK)

**Default if no answer:** 24개월 (베트남 best practice)

---

### H.3 백업 윈도우 / Backup window
**Question (KO):** 매일 백업이 진행되는 시간대 선호가 있나요? (서비스 영향 최소 시간)

**Question (EN):** Daily backup time-of-day preference?

**Blocks:** Phase 1

**Default if no answer:** VST 03:00 (새벽) — 서비스 트래픽 최소

---

## I. 브랜딩 및 로고 (Logo & branding)

### I.1 로고 고해상도 / 벡터 파일 / Logo high-res / vector
**Question (KO):** Seoul Aqua 로고의 벡터 파일(SVG / AI / EPS) 또는 더 큰 해상도 PNG가 있으신가요? 현재 첨부된 .jpg는 2560×706 픽셀입니다.

**Question (EN):** Do you have vector (SVG/AI/EPS) or higher-res PNG version of the logo? Current attachment is 2560×706 .jpg.

**Why it matters:** 사이드바, 모바일 splash, PDF 헤더 등에서 선명한 렌더링.

**Blocks:** Phase 1 (UI polish)

**Default if no answer:** 현재 .jpg를 1024×283로 트림 + SVG 재구성 (단, 폰트 라이선스 이슈 가능)

---

### I.2 ★ 브랜드 블루 색상 확정 / Brand blue hex confirmation
**Question (KO):** 로고에서 추출한 브랜드 블루 hex는 **`#0071BD`** (Pantone 285C 계열)입니다. 이 색상 사용 OK인가요? 회사가 공식 브랜드 가이드에 다른 hex 값을 정해두셨다면 알려주세요.

**Question (EN):** Brand blue extracted from logo: **`#0071BD`** (Pantone 285C family). OK to use? If official brand guideline specifies different hex, please share.

**Why it matters:** 모든 primary CTA, 링크, 포커스 링에 사용됨.

**Blocks:** Phase 1 (design tokens)

**Default if no answer:** `#0071BD` 사용

---

## J. 운영 데이터 마이그레이션 (Operational data migration)

### J.1 이력 데이터 컷오버 / Historical cutover plan
**Question (KO):** 현재 스프레드시트의 모든 이력(고객, 계약, 방문, 필터 교체, 수금)을 신규 시스템으로 마이그레이션 원하시나요? 아니면 신규 데이터부터 시작?
- (a) 전체 이력 마이그레이션 (~9000 고객 + 수만 건 이력)
- (b) 신규 데이터부터 시작, 이력은 기존 스프레드시트로 조회
- (c) 활성 고객만 마이그레이션, 비활성은 archive

**Question (EN):** Migrate all spreadsheet history to new system?
- (a) Full migration (~9K customers + tens of thousands of events)
- (b) New data only; query history in old spreadsheet
- (c) Active customers only, archive inactive

**Blocks:** Phase 2

**Default if no answer:** (c) — 활성 고객만, 비활성은 별도 보관

---

### J.2 중복 고객 제거 / Customer deduplication
**Question (KO):** 7개 CSV 파일에 같은 고객이 여러 번 등장합니다 (관리번호 다르지만 이름 같은 경우 등). 중복 제거 정책은?
- (a) 시스템이 자동 dedup 시도 (이름 + 전화번호 매칭)
- (b) 사람이 수동으로 검증 후 마이그레이션
- (c) 일단 그대로 import, 운영 중 발견 시 수동 병합

**Question (EN):** Customer dedup across 7 CSVs?
- (a) Auto-dedup (match by name + phone)
- (b) Manual validation before import
- (c) Import as-is, merge manually later

**Blocks:** Phase 2

**Default if no answer:** (a) + (b) — 자동 매칭한 후 사람 검토

---

### J.3 마이그레이션 검증 담당 / Migration validation owner
**Question (KO):** 마이그레이션 후 데이터 정확성 검증은 누가 담당하시나요? (랜덤 샘플 비교, 총 건수 확인 등)

**Question (EN):** Who validates migrated data accuracy (random sample comparison, count verification)?

**Blocks:** Phase 2

**Default if no answer:** Seoul Aqua 사무실 매니저 1명 + 개발팀 함께 진행

---

## K. (기타 추가) 기사 모바일 운영

### K.1 기사용 디바이스 / Technician device standard
**Question (KO):** 기사가 사용할 디바이스(스마트폰)에 표준이 있나요? Android vs iOS, 화면 크기, 카메라 해상도 등.

**Question (EN):** Standard technician device? Android/iOS, screen size, camera spec?

**Blocks:** Phase 4 (UI 최적화 우선순위)

**Default if no answer:** Android 8+ / iOS 14+, 5-6인치 화면 기준 디자인, 카메라 8MP+ 가정

---

### K.2 기사 인증 / Technician authentication
**Question (KO):** 기사는 어떻게 로그인하나요? (이메일+비밀번호 / 사번 / 전화번호)

**Question (EN):** Technician login: email+password / employee number / phone?

**Blocks:** Phase 1

**Default if no answer:** 사번(또는 전화번호) + 비밀번호 — 이메일이 없을 수 있음

---

### K.3 동시 작업 시 누가 책임 / Multi-tech accountability
**Question (KO):** 한 사이트에 기사 2명이 동시에 작업 시, 누가 "주 책임자"인가요? 결제, 서명, 보고서는 누가 처리?

**Question (EN):** When 2 techs work same site simultaneously, who's the "primary"? Who handles payment, signature, report?

**Blocks:** Phase 4

**Default if no answer:** 한 명을 `leadTechnicianId`로 지정; 나머지는 협업자

---

## 답변 양식 / Response format

각 질문 ID에 답을 적어주세요:

```
A.1: KH##### OK
A.2: (a) 신규 KH 발급
A.3: 영구 결번
...
```

답변 후 회신:
- Email: (담당자 이메일)
- 또는 직접 답변 파일을 `reference/`에 첨부

답변이 어려운 질문이 있다면 "TBD" + 사유 적어주세요. 그 항목은 시스템이 default로 진행되고, 추후 변경 가능합니다.

---

## Change log

- **2026-05-25** — v0.1 initial question set. 37 questions across 11 sections.
