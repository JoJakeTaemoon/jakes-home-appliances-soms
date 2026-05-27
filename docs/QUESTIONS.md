# 클라이언트 질문 리스트 — Seoul Aqua SOMS

> **For client (Seoul Aqua):** 아래 질문에 답을 주시면 SPEC.md를 확정하고 Phase 1 개발을 시작할 수 있습니다. 시급한 항목(blocker)은 **★** 표시되어 있습니다. 답변이 없을 경우 추천 기본값으로 진행합니다.
>
> **For developers:** this is the markdown twin of `QUESTIONS.docx`. Keep both in sync — edit here, regenerate the docx via `scripts/generate-questions-docx.py`.

**Version:** v0.5 (2026-05-26 — client answers received)
**Total questions:** 50 (all 50 answered by client via `reference/answers.txt`; A.5 filter data delivery pending 2026-05-29)
**Blockers for Phase 0 → Phase 1:** ✅ ALL RESOLVED (A.1, A.6, C.3, E.1, H.1, I.2)
**Blockers for Phase 2 → Phase 3.5 dev-start:** ✅ ALL RESOLVED (A.10, A.11, C.6)
**Production-launch blockers:** ✅ ALL RESOLVED (F.4, F.7, A.14, F.1=Q17)
**Pending (non-blocking):** A.5 (filter-equipment compatibility data delivery 2026-05-29 evening)

> **2026-05-26 — Client answers received**: All blockers resolved. Notable material changes from default plan:
> - **A.4 + A.8**: Customer > Site > Equipment 3-level hierarchy (was 2-level) — see `docs/DATA_MODEL_NOTES.md` Site model
> - **A.10**: Portal at subdomain `portal.seoulaqua.com.vn` (was: root URL) — adds +7 chars per SMS, pushes A.3 VI to 2-seg, +712K VND/mo
> - **B.2**: Contract code format B2C `HD-YYYYmmDD/SA-KH####`, B2B `HD-YYYYmmDD/SA-{shortcode}` + B2B appendix support
> - **K.3**: Multi-tech visits — `leadTechnicianId` + `collaboratorTechnicianIds[]`
> - **C.2**: `preferredTechnicianId` + `preferredRegion` per customer
> - **F.1**: Zalo OA + Zalo Mini App TODO in Phase 8+
> - **D.5**: ALL B2B customers need tax invoice (was: some don't); PDF upload warning-only

---

## A. 고객 및 장비 코드 (Customer & Equipment coding)

### A.1 ★ 고객 코드 형식 / Customer code format
**Question (KO):** 신규 시스템에서 고객 코드는 `KH00001` 형식(KH + 5자리)으로 자동 생성됩니다. 이 형식 사용 OK인가요? 다른 prefix를 원하시면 알려주세요. (예: `SA00001`, `CUS00001`)

**Question (EN):** New system auto-generates customer codes as `KH00001` (KH + 5-digit sequence). Is this format OK? Alternate prefix preferred? (e.g., `SA00001`, `CUS00001`)

**Why it matters:** 모든 화면, 모든 문서, 모든 PDF에 노출되는 1차 식별자입니다.

**Blocks:** Phase 2 시작 (고객 마스터)

**Default if no answer:** `KH#####`

**Status (2026-05-26):** ✅ RESOLVED — 형식 사용 OK (`KH#####`)

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

**Status (2026-05-26):** ✅ RESOLVED — (b) 기존 관리번호를 그대로 신규 KH코드로 변환 (예: `8918` → `KH08918`). 마이그레이션 스크립트는 `KH0` + 기존번호(zero-padded to match KH##### width) 방식.

---

### A.3 장비 코드 재사용 정책 / Equipment code reuse on retirement
**Question (KO):** 장비를 폐기/회수한 경우, 해당 장비 코드(예: `KH00001-3`)는 재사용해야 합니까, 아니면 영구 결번 처리합니까?

**Question (EN):** When a device is retired or returned, should the equipment code (`KH00001-3`) be reused for a future install, or permanently retired?

**Why it matters:** 이력 추적성 vs 코드 간결함의 trade-off.

**Blocks:** Phase 2

**Default if no answer:** 영구 결번 (이력 추적이 더 중요)

**Status (2026-05-26):** ✅ RESOLVED — 삭제(결번) 처리하지 않고 장비 상태를 "해지/비활성화"로 변경. 코드와 모든 이력 보존. Equipment.status에 `DEACTIVATED` 또는 `TERMINATED` 추가.

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

**Status (2026-05-26):** ✅ RESOLVED — (c) **Customer > Site > Equipment 계층 모델 채택**. 고객에 따라 Site를 만들거나 수정/제거 가능. B2C는 Site 없이도 가능 (optional). B2B는 Site별로 별도 주소 + Ops Contact + 장비. 신규 `Site` Prisma 모델 추가 — A.8과 연계.

---

### A.5 필터-장비 호환성 데이터 / Filter-equipment compatibility data
**Question (KO):** "어떤 필터가 어떤 장비에 사용 가능한지" 데이터를 곧 보내주시기로 하셨습니다. 예상 전달 시점이 언제인가요? Phase 5 (필터 라이프사이클)에 필요합니다.

**Question (EN):** You mentioned providing equipment-filter compatibility data soon. Expected delivery date? Needed for Phase 5 (filter lifecycle).

**Why it matters:** 자동 "내일 어떤 필터 가져가야 함" 알림 정확도.

**Blocks:** Phase 5

**Default if no answer:** Phase 5에 빈 호환표로 시작, 직원이 수기 입력

**Status (2026-05-26):** ⏳ PARTIAL — **2026-05-29 저녁 전달 예정**. Phase 5 시작 전에 데이터 도착하면 호환표 사전 입력; 도착 지연 시 default(빈 호환표)로 시작.

---

### A.6 ★ 고객 두-컨택트 모델 확인 / Two-contact model confirmation
**Question (KO):** 한 고객(B2B 회사 또는 B2C 가정집)에 대해 시스템은 두 개의 컨택트를 분리해서 저장합니다:

| 역할 | 용도 | 받는 문서/알림 |
|---|---|---|
| **계약 주체** (서명자) | 계약서 서명, 법적 통보, 세금계산서 수신 | 계약서 PDF, 세금계산서, 법적 통보 |
| **관리 주체** (운영 담당) | 방문 일정 확정, SMS, 일상 커뮤니케이션 | 방문 SMS, 영수증, 정기점검표 |

각 컨택트는 **독립적인 이름·전화·이메일·사용 언어** 를 가집니다. 같은 사람일 경우 "동일" 체크박스로 표시합니다.

이 모델 적용 OK인가요? 또는 다른 역할(예: "결제 담당" 별도 분리)이 필요하신가요?

**Question (EN):** For each customer (B2B company or B2C household), the system stores two separate contacts with independent name, phone, email, language. Contract documents/legal notice go to the Contract Party; visit SMS/operational notices go to the Ops Contact. OK to adopt? Any additional role needed (e.g., separate billing contact)?

**Why it matters:** 도메인 모델의 핵심. SMS 베트남어로 갈지 한국어로 갈지가 이 분리에 달려 있음.

**Blocks:** Phase 2 (Customer 마스터 스키마)

**Default if no answer:** 두 역할 (Contract Party + Ops Contact)로 진행

**Status (2026-05-26):** ✅ RESOLVED — 두-컨택트 모델 OK. CONTRACT_PARTY + 0..N OPS_CONTACT (이전 결정과 일치).

---

### A.7 컨택트 언어 fallback 규칙 / Contact language fallback
**Question (KO):** 관리 주체(Ops Contact)의 언어 정보가 누락된 경우 SMS는 어떤 언어로 보낼까요?
- (a) 계약 주체의 언어 사용
- (b) 시스템 기본 언어 (베트남어)
- (c) 고객의 도시(`addressCity`)에서 유추 (HCM/Hanoi → vi, 기타 → vi)

**Question (EN):** If Ops Contact language is missing, which language for SMS?
- (a) Fall back to Contract Party language
- (b) System default (Vietnamese)
- (c) Infer from customer city

**Why it matters:** 마이그레이션 시 ~9000 고객의 언어 데이터가 없으므로 fallback 규칙 필요.

**Blocks:** Phase 2 (import script)

**Default if no answer:** (b) — 베트남어 fallback (가장 많은 고객층)

**Status (2026-05-26):** ✅ RESOLVED — (a) **계약 주체의 언어 사용**. Ops Contact 언어 누락 시 Contract Party의 `language` 필드로 fallback.

---

### A.8 B2B 다중 사이트의 컨택트 / Multiple ops contacts per B2B site
**Question (KO):** 한 B2B 고객사가 여러 사업장(공장 A, 공장 B, 본사)을 가질 때, **사업장별로 다른 관리 주체**가 필요할 수 있습니다. 시스템은 이를 어떻게 처리할까요?
- (a) v1 — 고객사 단위로 단일 Ops Contact만 (사업장별 분리는 Phase 8+)
- (b) v1부터 사이트 모델(Customer > Site)에 Ops Contact 분리 — A.4와 연계
- (c) 한 고객사에 Ops Contact 여러 개 (Site 없이 N:1)

**Question (EN):** A B2B customer with multiple sites may need a different Ops Contact per site. v1 strategy?
- (a) v1 — single Ops Contact per customer; site-level split is Phase 8+
- (b) Site model from day 1 (linked to A.4 hierarchical option)
- (c) Multiple Ops Contacts on one customer

**Blocks:** Phase 2 (스키마 결정 · A.4와 함께)

**Default if no answer:** (a) v1 단일 — 운영 관찰 후 Phase 8+에 확장

**Status (2026-05-26):** ✅ RESOLVED — (b) **v1부터 사이트 모델(Customer > Site)에 Ops Contact 분리**. A.4 결정과 연계. CustomerContact에 `siteId?` 필드 + `scope` enum (CUSTOMER | SITE) 추가.

---

### A.9 마이그레이션 시 두번째 컨택트 데이터 / Secondary contact from legacy CSV
**Question (KO):** 기존 `고객관리대장`의 `고객정보` 필드에 가끔 "MR.K", "JUNG KI HUN" 같은 두 번째 사람 이름이 있습니다. 마이그레이션 시:
- (a) 자동으로 Ops Contact로 등록 (전화는 비워두고 사무실이 추후 보강)
- (b) 임포트 후 사무실이 수동으로 검토하여 분류
- (c) 무시 (단일 컨택트로 import, 신규 등록 시부터 분리)

**Question (EN):** Legacy `고객정보` field sometimes carries a secondary name. On migration:
- (a) Auto-create as Ops Contact (phone blank, office fills later)
- (b) Import unclassified; office reviews
- (c) Ignore (single-contact import for legacy, two-contact only for new customers)

**Blocks:** Phase 2 (import script)

**Default if no answer:** (b) — 자동 분류는 오류 가능, 사람 검토 후 확정

**Status (2026-05-26):** ✅ RESOLVED — (a) **자동으로 Ops Contact로 등록**, 전화는 비워두고 사무실이 추후 보강.

---

### A.10 ★ 고객 포털 URL / 도메인 / Portal URL & domain
**Question (KO):** 회사 도메인은 `seoulaqua.com.vn` 확정. 고객 포털 URL은 어떻게 잡을까요?
- (a) **루트 URL `seoulaqua.com.vn`** — SMS 글자수 가장 짧음 (16자), 로그인 안된 사용자는 자동으로 `/portal` 리다이렉트 — **현 SMS 템플릿 가정**
- (b) 별도 서브도메인 `portal.seoulaqua.com.vn` (23자, 4자 길어짐 → 일부 1-seg 템플릿이 2-seg로 늘어남)
- (c) 동일 도메인 + 경로 `seoulaqua.com.vn/portal/*` (23자, b와 동일 길이)
- (d) 짧은 도메인 신규 등록 (예: `sa.com.vn` 9자) — 도메인 등록비 + 1~2주 추가 소요

URL이 SMS에 들어가므로 짧을수록 좋고, Brandname 등록 후 변경 시 재심사가 필요합니다.

**Question (EN):** Company domain confirmed as `seoulaqua.com.vn`. Portal URL choice? (a) root URL `seoulaqua.com.vn` with auto-redirect to `/portal` (shortest, current SMS template assumption), (b) subdomain `portal.seoulaqua.com.vn`, (c) path `seoulaqua.com.vn/portal/*`, (d) separate short domain (`sa.com.vn` etc., extra registration). URL goes into SMS — keep it short and avoid future changes since Brandname re-approval is required after URL changes.

**Blocks:** Phase 3.5 (SMS template + DNS 설정 + eSMS Brandname 신청서 확정)

**Default if no answer:** (a) `seoulaqua.com.vn` root with redirect — 이미 모든 SMS 본문 + `docs/SMS_BRANDNAME_APPLICATION.md` 에 반영됨

**Status (2026-05-26):** ✅ RESOLVED — **(b) 별도 서브도메인 `portal.seoulaqua.com.vn` 선택**. ⚠️ **비용 영향**: URL이 16자 → 23자 (+7자)로 늘어나 `SMS_VISIT_REMINDER` VI가 70자 → 77자가 되어 1-seg → 2-seg로 증가. 월 ~720 VI 방문 알림 × 989 VND/seg = **+712K VND/월 (≈ ₩38K/월, 8.5M VND/년)** 비용 증가. 모든 SMS 본문 + 비용 추정 재계산 필요. (사용자가 원본 답변에 `portal.seoulaqua.vn`로 표기했으나 회사 도메인 `seoulaqua.com.vn` 기준으로 `portal.seoulaqua.com.vn` 적용.)

---

### A.11 ★ 비밀번호 정책 / Password policy
**Question (KO):** 고객 포털 비밀번호 정책:

| 항목 | 권장 | 대안 |
|---|---|---|
| 최소 길이 | 8자 | 10 / 12 |
| 영문 + 숫자 의무 | Yes | 영문만 / 숫자만 |
| 특수문자 의무 | No (모바일 입력 부담) | Yes |
| 만료 주기 | 없음 | 90일 / 180일 |
| 과거 N개 재사용 금지 | 없음 | 3 / 5 |

베트남 일반 사용자 대상 — 너무 엄격하면 적응 어려움.

**Question (EN):** Customer portal password policy — recommended: 8 chars min, alphanumeric, no expiry. Confirm or specify.

**Blocks:** Phase 3.5

**Default if no answer:** 권장 표 그대로 — 8자 영문+숫자, 만료 없음

**Status (2026-05-26):** ✅ RESOLVED — **권장 표 그대로** 채택: 8자 최소, 영문+숫자, 특수문자 X, 만료 없음, 재사용 금지 없음.

---

### A.12 OTP-only 로그인 / OTP-only login as alternative
**Question (KO):** 비밀번호 대신 매번 SMS OTP로 로그인하는 옵션도 제공할까요?
- (a) 비밀번호만 (v1) — SMS는 가입+초기화 때만 — 추천
- (b) 비밀번호 OR OTP — 사용자 선택
- (c) OTP만 — 비밀번호 자체 없음 (베트남 일부 앱이 이렇게 함)

**Question (EN):** Add OTP-only login (SMS code each login) as alternative to password?

**Blocks:** Phase 3.5 (UI + SMS volume 영향)

**Default if no answer:** (a) — 비밀번호만, OTP는 Phase 8+

**Status (2026-05-26):** ✅ RESOLVED — (a) **비밀번호만 (v1)** — SMS는 가입+초기화 때만. OTP-only는 Phase 8+ TODO.

---

### A.13 동일 휴대폰 공유 컨택트 / Shared phone contacts
**Question (KO):** 한 회사가 대표 전화 1개를 여러 직원이 공유 사용하는 경우 (예: 본사 안내데스크 전화). 시스템에서 두 명의 CustomerContact가 같은 `phone1`을 가질 수 있습니다.
- (a) 한 사람에게만 `portalEnabled=true` 부여 (나머지는 office가 비활성) — 추천
- (b) 동일 번호 두 명 모두 로그인 가능 (SMS는 한쪽 명의로만, 충돌 가능)
- (c) 동일 phone1 등록 차단 (저장 시 에러)

**Question (EN):** When two CustomerContacts share the same phone1 (company switchboard), how to handle?

**Blocks:** Phase 3.5 (validation 로직)

**Default if no answer:** (a) — 사무실이 결정

**Status (2026-05-26):** ✅ RESOLVED — **(b) 동일 번호 두 명 모두 로그인 가능** (SMS는 한쪽 명의로만, 충돌 가능). `@@unique([phone1])` 제약 없음. CustomerContact.phone1에 중복 허용. (이전 결정 (a)에서 변경됨.)

---

### A.14 ★ 이메일 발신 도메인 / Email sender domain & DKIM/SPF
**Question (KO):** 고객 응대 이메일 (영수증, 작업확인서, 미수금 안내 등)을 `seoulaqua.com.vn`에서 직접 발송하려면 DNS 설정이 필요합니다:
- (a) `noreply@seoulaqua.com.vn` (시스템 발송) + `cs@seoulaqua.com.vn` (Reply-To, CS팀 인박스) — **권장**
- (b) `info@seoulaqua.com.vn` 단일 (단순화, 하지만 CS 응대 vs 시스템 자동 발송 구분이 안됨)
- (c) 별도 도메인 (예: `mail.seoulaqua.com.vn`) — 권장 X (브랜드 분산)

**필수 인프라 설정 (1일 작업):**
- SPF 레코드: `v=spf1 include:_spf.{provider}.com -all`
- DKIM 키 등록 (provider별 발급 키를 DNS TXT에 추가)
- DMARC 정책: `v=DMARC1; p=quarantine; rua=mailto:dmarc@seoulaqua.com.vn`
- (선택) BIMI 로고 표시 — 마케팅 효과, Gmail/Yahoo 지원

**Question (EN):** Email sender domain setup for `seoulaqua.com.vn`? Recommend (a) `noreply@` for system + `cs@` for Reply-To. DKIM/SPF/DMARC required (1-day infra task).

**Blocks:** Production launch only — Phase 3.5 dev proceeds against mock email provider; DKIM/SPF/DMARC setup is a 1-day infra task before flipping `EMAIL_PROVIDER=resend` (2026-05-26 decision)

**Default if no answer:** (a) — `noreply@seoulaqua.com.vn` (system) + `cs@seoulaqua.com.vn` (Reply-To)

**Status (2026-05-26):** ✅ RESOLVED — (a) **`noreply@seoulaqua.com.vn` (시스템 발송) + `cs@seoulaqua.com.vn` (Reply-To)** 권장 채택.

---

## B. 계약 및 라이프사이클 (Contract & lifecycle)

### B.1 판매 → 임대 → 유지관리 전환 / Sale-to-rental-to-maintenance conversion
**Question (KO):** 판매 고객이 나중에 임대 또는 유지관리 계약을 추가로 체결하는 경우가 있나요? 그 경우 같은 장비를 어떻게 처리하시나요?

**Question (EN):** Does a sale customer ever later sign a rental or maintenance contract? If so, how is the same device handled?

**Blocks:** Phase 3

**Default if no answer:** 판매 후 별도 유지관리 계약만 가능 (장비 소유권은 고객, 서비스만 회사)

**Status (2026-05-26):** ✅ RESOLVED — 판매 후 별도 유지관리 계약 가능. **추가 임대 시**: 신규 장비 코드 발급. **기존 구매 제품에 유지관리 추가 시**: 기존 장비 관리 코드 그대로 재사용 + `Equipment.status`를 "유지관리" 상태로 추가. 즉 한 장비가 SALE → MAINTENANCE로 전이 가능 (이력 보존).

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

**Status (2026-05-26):** ✅ RESOLVED — **신규 계약 코드 형식**:
- **B2C 고객**: `HD-YYYYmmDD/SA-KH####` (예: `HD-20260526/SA-KH0001`)
- **B2B 고객**: `HD-YYYYmmDD/SA-{고객사약어}` (예: `HD-20260526/SA-SHV`)
- **B2B Appendix 지원**: 일부 기업은 신규 설치 시마다 새 계약서 발행, 다른 기업은 기존 계약에 부록서/변경 계약(Appendix)으로 설치 수량만 추가. 시스템에서 `Contract.parentContractId` + `Contract.amendmentRevision` 필드로 양쪽 모두 지원.

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

**Status (2026-05-26):** ✅ RESOLVED — (a) **`Contract.status=COMPLETED` + `Equipment.ownership` 자동 변경**. 별도 PDF 불필요.

---

### B.4 ★ 계약 자동 갱신 정책 / Contract auto-renewal
**Question (KO):** 가정집 임대 계약서 §9에 "만료 1개월 전까지 해지 통지 없으면 자동으로 유지관리 계약으로 1년 자동 갱신"이라 적혀있습니다. 시스템에서 자동으로 처리할까요, 아니면 직원이 수동으로 확인 후 처리할까요?

**Question (EN):** §9 of B2C rental contract states auto-renewal as maintenance contract for 1 year if neither party terminates 1 month ahead. Auto-process or manual confirmation?

**Why it matters:** 자동 갱신은 빠르지만 단순 실수도 빨라짐.

**Blocks:** Phase 3 (계약 라이프사이클 로직)

**Default if no answer:** 직원 확인 후 1-click 갱신 (자동 알림 + 수동 액션)

**Status (2026-05-26):** ✅ RESOLVED — **직원 확인 후 1-click 갱신** (자동 알림 + 수동 액션). 초기 임대료와 달리 **월 관리비 (유지관리 비용) 단가 조정 필요** — 갱신 시 새 가격 입력 UI 필요.

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

**Status (2026-05-26):** ✅ RESOLVED — **고객 유형별 분리 정책**:
- **B2C 고객**: (c) 가격 필드만 업데이트, 이력은 audit log
- **B2B 고객**: (b) amendment 이력 추가 (revision 1, 2, ...) — `Contract.amendmentRevision` 필드 활용

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

**Status (2026-05-26):** ✅ RESOLVED — (b) **시스템 자동 추천 + 사무실 확인**.

---

### C.2 기사별 담당 지역 / Technician territories
**Question (KO):** 기사는 특정 지역(군/구) 담당이 있나요? 아니면 모든 기사가 모든 지역 방문 가능?

**Question (EN):** Are technicians assigned territories (district), or any tech anywhere?

**Blocks:** Phase 4 (배정 로직 + UI)

**Default if no answer:** "선호 지역" 필드 (soft preference), 강제는 아님

**Status (2026-05-26):** ✅ RESOLVED — **"선호 지역" 필드 (soft preference) 방식** + **고객별 지정 기사 설정** 추가: 특정 가정집 고객이 선호하는 기사를 직접 지정. `Customer.preferredTechnicianId?` + `Customer.preferredRegion?` 필드 추가. 스케줄링 시 해당 기사가 최우선 추천.

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

**Status (2026-05-26):** ✅ RESOLVED — (a) **PWA** (브라우저 기반, 앱스토어 불필요).

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

**Status (2026-05-26):** ✅ RESOLVED — (b) **v1는 온라인 우선, Phase 7에서 오프라인 큐 추가 검토**.

---

### C.5 지도 / 동선 최적화 / Maps + route optimization
**Question (KO):** 기사 동선을 지도에 표시하고 최적 경로 추천하시고 싶으세요? 예/아니오, 그리고 어떤 지도 제공자 (Google Maps / Goong Maps / OpenStreetMap)?

**Question (EN):** Map view + route optimization for technician daily route? Yes/no, and which map provider?

**Why it matters:** Google Maps API 비용 vs Goong (Vietnam local, 더 저렴).

**Blocks:** Phase 4+ (선택 기능)

**Default if no answer:** v1는 지도 없이 지역 기준 정렬, Phase 4+에 Goong Maps 검토

**Status (2026-05-26):** ✅ RESOLVED — **v1는 지도 없이 지역 기준 정렬**, 추후 재검토를 위해 **TODO** 남겨둘 것 (PROJECT_PLAN.md Phase 7+).

---

### C.6 ★ 서비스 요청 유형 / Service request type list
**Question (KO):** 고객 포털에서 제출 가능한 서비스 요청 유형을 SPEC §6.5에 7개로 정의했습니다 — OK인지 확인하시고, 추가 유형이 있으면 알려주세요. 각 유형별 유료/무료 기본값도 확인 필요:

| 유형 | 기본 |
|---|---|
| INSPECTION (점검) | 무료 |
| CONSULTATION (상담) | 무료 |
| FAULT_REPORT (고장 신고) | 보증/임대 → 무료 · 그 외 → 유료 |
| FILTER_REPLACEMENT_AD_HOC (필터 임시 교체) | 임대 → 무료 · 판매 → 유료 |
| PART_REPLACEMENT (부품 교체) | 유료 |
| RELOCATION (이전 설치) | 유료 |
| OTHER (기타) | 수동 분류 |

**Question (EN):** Service request types in SPEC §6.5 (7 types). Confirm the list + paid/free defaults; add missing types.

**Blocks:** Phase 3.5 (서비스 요청 UI + 라우팅 로직)

**Default if no answer:** 위 표 그대로 적용

**Status (2026-05-26):** ✅ RESOLVED — 7개 유형 + 유료/무료 기본값 모두 OK. **단, `PART_REPLACEMENT` (부품 교체)와 `RELOCATION` (이전 설치)는 상황에 따라 무료도 될 수 있음** — 사무실 review 시 case-by-case 결정 가능. `ServiceRequest.isPaid`는 type default + office override.

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

**Status (2026-05-26):** ✅ RESOLVED — **Viettel SInvoice** 사용 중. v1은 **PDF 업로드만**, Viettel SInvoice 통합 검토는 Phase 8+ **TODO**.

---

### D.2 현금 인수인계 감사 / Cash handover audit trail
**Question (KO):** 기사가 현금 수금 후 본사 입금까지의 흐름을 어떻게 추적/감사하시고 싶으세요?
- 기사 수금 → 시스템에 입력
- 본사 입금 → 회계가 시스템에 매칭
- 차이가 있을 때 알림?

**Question (EN):** Cash collection by technician → office deposit. How to audit?

**Blocks:** Phase 6

**Default if no answer:** 3단계 (수금 → 사무실 수신 → 정산 매칭), 24시간 미입금 시 알림

**Status (2026-05-26):** ✅ RESOLVED — **3단계 (수금 → 사무실 수신 → 정산 매칭)**, **48시간 미입금 시 알림** (default 24시간에서 변경).

---

### D.3 부분 납부 / Partial payment handling
**Question (KO):** 고객이 1회분(예: 560,000 VND) 중 일부만 납부하는 경우 발생합니까? 어떻게 처리하시나요?

**Question (EN):** Does a customer ever pay partial installment (e.g., 300K of 560K monthly)? How to handle?

**Blocks:** Phase 6 (Payment 스키마)

**Default if no answer:** 부분 납부 허용; 잔액은 다음 회차에 합산

**Status (2026-05-26):** ✅ RESOLVED — **부분 납부 허용, 잔액은 다음 회차에 합산** (default 그대로).

---

### D.4 통화 표시 / Currency display
**Question (KO):** VND 단독으로 표시 OK인가요? USD / KRW도 함께 표시할 일이 있을까요?

**Question (EN):** Display VND only, or also show USD / KRW (e.g., for Korean management reporting)?

**Blocks:** Phase 1 (UI 기본 설정)

**Default if no answer:** VND 단독 — 환산은 보고서 export에서

**Status (2026-05-26):** ✅ RESOLVED — **VND 단독** (default 그대로).

---

### D.5 세금계산서 불필요 B2B 고객 처리 / B2B no-invoice flow
**Question (KO):** 일부 B2B 고객은 세금계산서 발행이 필요없다고 하셨습니다. 시스템에서 어떻게 구분하고 어떻게 처리하나요?

**Question (EN):** Some B2B customers don't need a tax invoice. How to flag and handle?

**Blocks:** Phase 6

**Default if no answer:** Customer record에 `requiresTaxInvoice: boolean` 필드, 청구 화면에서 분기

**Status (2026-05-26):** ✅ RESOLVED — **정정**: 모든 B2B 고객이 세금계산서 필요. `Customer.requiresTaxInvoice` 필드 불필요 (B2B = 항상 필요). 단, **D.1의 PDF 업로드는 강제하지 않음 (경고 표시만)** — 사무실이 발행 지연/누락 가능성에 대비.

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

**Status (2026-05-26):** ✅ RESOLVED — (a) **사진 촬영** (현재 종이 서명을 기사가 사진 찍어 업로드). 태블릿 터치 서명은 추후 검토 **TODO**.

---

### E.2 정기 점검 확인서 — 필터 무료 표시 / B2B periodic check filter free
**Question (KO):** B2B 정기 점검 확인서에 단가가 없는 이유는 임대 계약상 필터가 무료라서 인가요? 다른 이유가 있나요?

**Question (EN):** B2B periodic check form shows no unit price — is this because filters are free under rental? Other reason?

**Blocks:** Phase 3 (문서 템플릿 정확도)

**Default if no answer:** 임대 무료라고 가정

**Status (2026-05-26):** ✅ RESOLVED — **임대의 기본은 무료**이나 **특정 계약에서 예외 존재**:
- 일부 임대 계약은 필터 교환을 포함하지 않아 유료
- 몇몇 필터는 무료, 특정 필터는 유료인 경우도 있음
- `ContractFilterPolicy` 또는 `Contract.includesFilter: Json` 필드로 세부 규칙 정의 필요

---

### E.3 정기 점검 확인서 — 내부 필터 기록 / B2B internal filter record
**Question (KO):** B2B 정기 점검 확인서에 필터 종류와 수량이 보이지 않습니다. 내부적으로는 어떻게 기록하시나요?

**Question (EN):** B2B periodic check doesn't show filter type/quantity to customer. How recorded internally?

**Blocks:** Phase 5 (필터 이력)

**Default if no answer:** PartReplacement 테이블에만 기록, 고객 문서엔 미표시

**Status (2026-05-26):** ✅ RESOLVED — **조정 필요**. B2B 정기 점검 확인서 form fields: **설치 위치, 장비 관리 번호, 장비 모델명, 수량, 작업 내용, 비고(기사 작성)**만 있으면 OK. `PERIODIC_CHECK_B2B` PDF 템플릿 단순화.

---

### E.4 문서 보관 기간 / Document retention period
**Question (KO):** 계약서, 영수증, 점검표 등 문서를 몇 년 보관해야 합니까? (베트남 법규 + 회사 내부 정책)

**Question (EN):** Document retention period (Vietnamese law + internal policy)?

**Blocks:** Phase 3 (storage lifecycle 정책)

**Default if no answer:** 7년 (베트남 계약법 시효 + 안전 여유)

**Status (2026-05-26):** ✅ RESOLVED — **계약서 및 세금계산서: 10년, 그 외 기타 서류 (영수증, 정기 점검표 등): 약 5년**. Document.kind에 따라 retention 분기.

---

### E.5 종이 원본 폐기 시점 / Paper original disposal
**Question (KO):** 디지털 사본이 보관되면 종이 원본은 언제부터 폐기 가능한가요?

**Question (EN):** Once digital archive exists, when can paper originals be shredded?

**Blocks:** Phase 3 (운영 정책)

**Default if no answer:** 디지털 보관 + 1년 후 폐기 (실제 폐기는 사용자 결정)

**Status (2026-05-26):** ✅ RESOLVED — **디지털 보관 + 1년 후 폐기** (실제 폐기는 사용자 결정).

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

**Blocks:** Production launch only — Phase 3.5 dev uses mock SMS provider (`SMS_PROVIDER=mock`); this question must be resolved before flipping to `SMS_PROVIDER=esms` for live customer SMS (2026-05-26 mock-first decision)

**Default if no answer:** eSMS.vn — 베트남 시장 가장 보편적

**Status (2026-05-26):** ✅ RESOLVED — **eSMS.vn 확정**. 추가로 **Zalo 메시지 전송 및 Zalo Mini App 인터페이스**도 향후 검토 — Phase 8+ TODO로 기록.

---

### F.2 이메일 전송 / Email sender
**Question (KO):** B2B 세금계산서 + 향후 마케팅 이메일 전송용 솔루션은?
<!-- portfolio:drop-start -->
- vhost.vn Email Relay (저렴)
<!-- portfolio:drop-end -->
- SendGrid / Mailgun (글로벌)
- AWS SES (저렴, 설정 복잡)
- 기타: ___________

**Question (EN):** Email provider for B2B invoice + future marketing?

**Blocks:** Phase 7

**Default if no answer:** SendGrid — 영문 + 베트남어 모두 안정적

<!-- portfolio:drop-start -->
**Status (2026-05-26):** ✅ RESOLVED — **vhost.vn Email Relay**. (F.7 Resend와는 별도 — F.7은 거래성 알림용 Resend, F.2는 세금계산서 첨부/마케팅용 vhost.vn Email Relay. 두 채널 분리.)
<!-- portfolio:drop-end -->
<!-- portfolio:add-start
**Status:** ✅ RESOLVED — **Resend** (single ESP covers both transactional and operational; no secondary rail).
portfolio:add-end -->

---

### F.3 알림 거부 / Notification opt-out
**Question (KO):** 고객이 SMS/email 수신 거부할 수 있어야 합니까? 어느 범위까지?

**Question (EN):** Can customers opt-out of SMS/email? At what granularity?

**Blocks:** Phase 7

**Default if no answer:** Yes, 채널별 opt-out (SMS off / email off 독립) + 시스템 알림(예: 결제 영수증, 비밀번호 초기화)은 항상 전송

**Status (2026-05-26):** ✅ RESOLVED — **Yes, 채널별 opt-out** (SMS off / email off 독립) + **시스템 알림 (결제 영수증, 비밀번호 초기화)은 항상 전송** (default 그대로). CustomerContact에 `smsOptOut: boolean` + `emailOptOut: boolean` 필드 추가.

---

### F.4 ★ SMS 발신자 ID / Brand name / SMS Sender ID
**Question (KO):** 베트남 SMS는 발신자에 brand-name이 등록되어야 합니다 (`Seoul Aqua` 등). 등록 절차:
- eSMS.vn 계정 + 사업자등록증 + 서류 → 약 **2-3주 소요**
- 등록 안 되면 임시로 6자리 숫자 발신번호 사용 가능 (스팸 필터 위험 큼)

확정 발신자 brand 이름은? (예: `SeoulAqua`, `SOMS`, `DAI A`)
**서두르세요** — Phase 3.5 시작 전 등록이 완료되어 있어야 합니다.

**Volume (revised 2026-05-26 with SMS/Email channel split)**: ~1,245 SMS/월 (이전 추정 ~2,695 대비 53% 감소). 비-시급성 알림 (영수증·요약·D+7/D+14 미수금 안내·D-60/D-30 계약갱신)은 이메일로 전환됨. 세부: `docs/DOCUMENT_TEMPLATES.md` §A + §C.

**Question (EN):** Vietnamese SMS requires registered brand-name sender ID (~2-3 weeks at eSMS.vn). Confirm brand name. **Phase 3.5 dev no longer blocks on this** — SMS sending uses mock provider (`SMS_PROVIDER=mock`) during dev/staging. Register before production go-live. Volume revised down to ~1,245 SMS/mo after channel split with email.

**Blocks:** Production launch only — Phase 3.5 dev proceeds with mock SMS provider (2026-05-26 decision)

**Default if no answer:** `SeoulAqua` (영문, 등록은 production launch 일정에 맞춰 진행)

**Status (2026-05-26):** ✅ RESOLVED — **`SeoulAqua` 확정** (영문, 등록 진행 즉시 시작 가능).

---

### F.5 비밀번호 초기화 시 기존 세션 처리 / Session handling on password reset
**Question (KO):** 본사가 고객 비밀번호를 초기화하면 해당 고객이 이미 로그인한 다른 기기의 세션은:
- (a) 그대로 유지 — 다음 로그인 시 새 비밀번호 필요 — 추천 (단순)
- (b) 모두 강제 로그아웃 — 보안 강화

**Question (EN):** When office resets a customer password, existing active sessions:
- (a) Keep valid; new password only needed on next login — recommended
- (b) Force logout all sessions immediately

**Blocks:** Phase 3.5

**Default if no answer:** (a) — 단순함

**Status (2026-05-26):** ✅ RESOLVED — (a) **그대로 유지 — 다음 로그인 시 새 비밀번호 필요** (default 그대로).

---

### F.6 계정 잠금 정책 / Account lockout policy
**Question (KO):** 비밀번호 N회 연속 실패 시:
- (a) 5회 실패 → 15분 잠금 → 자동 해제 — 추천
- (b) 5회 실패 → 사무실 호출만 해제 가능
- (c) 잠금 없음 (rate-limit만)

**Question (EN):** Lockout after consecutive failures:
- (a) 5 fails → 15 min auto-lockout — recommended
- (b) 5 fails → office must unlock
- (c) No lockout, rate-limit only

**Blocks:** Phase 3.5

**Default if no answer:** (a) — 균형

**Status (2026-05-26):** ✅ RESOLVED — (a) **5회 실패 → 15분 잠금 → 자동 해제** (default 그대로).

---

### F.7 ★ 이메일 제공자 / Email provider
**Question (KO):** 거래성 이메일 발송 제공자를 선택해주세요 (영수증, 작업확인서, 미수금 1-2차 안내, 계약갱신 안내 등 — 월 ~1,560건):
- (a) **Resend** — 권장. 100K msgs/월 무료 (Seoul Aqua 충분), 개발자 친화 API, EU/VN reach 양호, DKIM 자동
- (b) AWS SES — 가장 저렴 ($0.10/1000), 그러나 sandbox 해제 + AWS 계정 필요
- (c) SendGrid (Twilio) — 100건/일 무료, 그 이상은 유료. SMS 제공사(Twilio)와 동일 vendor 통합 가능
- (d) Postmark — transactional 전문, $15/월부터. 베트남 도달률 우수
- (e) Mailgun — 100건/일 무료, 그 이상 $35/월부터

베트남 통신사 SMS와 다르게 이메일은 통신사 승인이 필요 없습니다. DNS 설정 (DKIM/SPF/DMARC, 1일 작업) + provider 가입 (즉시) → 즉시 발송 가능.

**Question (EN):** Email provider for transactional sends (~1,560 msgs/mo)?
- (a) **Resend** — recommended (100K/mo free tier covers Seoul Aqua, developer-friendly, good VN reach)
- (b) AWS SES — cheapest but requires sandbox lift
- (c) SendGrid — Twilio vendor synergy if SMS later switches to Twilio
- (d) Postmark — transactional specialist
- (e) Mailgun — alternative

**Blocks:** Production launch only — Phase 3.5 dev proceeds with mock email provider (`EMAIL_PROVIDER=mock`); 1-day setup once chosen, env flip at launch (2026-05-26 decision)

**Default if no answer:** (a) Resend — 가장 적합

<!-- portfolio:drop-start -->
**Status (2026-05-26):** ✅ RESOLVED — (a) **Resend** 채택 (transactional). F.2 vhost.vn은 별도 (세금계산서/마케팅).
<!-- portfolio:drop-end -->
<!-- portfolio:add-start
**Status:** ✅ RESOLVED — (a) **Resend** 채택 (transactional + operational, 단일 ESP).
portfolio:add-end -->

---

## G. 고객 포털 확장 (Portal v2 — future, Phase 8+)

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

**Status (2026-05-26):** ✅ RESOLVED — (c) **미정 — 일단 내부 운영 안정화 우선**. TODO로 기록.

---

### G.2 B2C vs B2B 포털 차이 / B2C vs B2B portal differences
**Question (KO):** B2C 포털과 B2B 포털의 기능 차이는?
- B2C: 본인 계약 조회, 방문 예약, 결제 이력
- B2B: 위 + 회사 전체 장비 list, 부서별 다운로드, 세금계산서 다운로드

**Question (EN):** B2C portal vs B2B portal feature difference?

**Blocks:** Phase 8

**Default if no answer:** 위와 같은 분리

**Status (2026-05-26):** ✅ RESOLVED — **B2C**: 본인 계약 조회, 방문 예약, 결제 이력, **계약주체 변경**. **B2B**: B2C + 회사 전체 장비 list, **입금확인 요청, 세금계산서 요청, 세금계산서 다운로드**.

---

### G.3 포털 결제 / Portal payment
**Question (KO):** 향후 고객이 포털에서 직접 결제 (VNPay / MoMo / VietQR 등) 가능하게 할 계획이 있나요?

**Question (EN):** Future: direct online payment via portal (VNPay / MoMo / VietQR)?

**Blocks:** Phase 8+

**Default if no answer:** 미결정; 결정 시 별도 phase

**Status (2026-05-26):** ✅ RESOLVED — **미결정**, 결정 시 별도 phase로 진행.

---

## H. 호스팅 및 컴플라이언스 (Hosting & compliance)

### H.1 데이터 잔류 요구사항 / Data residency requirement
**Question (KO):** 베트남 개인정보보호법 또는 회사 정책으로 인해 데이터가 **반드시 베트남 내**에 저장되어야 합니까?
<!-- portfolio:drop-start -->
- (a) 베트남 필수 — vhost.vn 호스팅
<!-- portfolio:drop-end -->
- (b) Singapore / 한국 OK — Vercel + Supabase Singapore region OK
- (c) 모름 — 추후 확인

**Question (EN):** Data residency requirement (Vietnamese PDP law)?
<!-- portfolio:drop-start -->
- (a) Vietnam-only — vhost.vn
<!-- portfolio:drop-end -->
- (b) Singapore / Korea OK — Vercel + Supabase
- (c) Unknown — confirm later

**Blocks:** Phase 1

<!-- portfolio:drop-start -->
**Default if no answer:** (b) — 빠른 출시. 후에 (a) 필요시 vhost.vn migration plan 발동
<!-- portfolio:drop-end -->
<!-- portfolio:add-start
**Default if no answer:** (b) — Vercel + Supabase 단일 production 운영.
portfolio:add-end -->

<!-- portfolio:drop-start -->
**Status (2026-05-26):** ✅ RESOLVED — (a) **vhost.vn 호스팅 확정**. v0 Vercel+Supabase 출시 후 vhost.vn migration 계획 발동.
<!-- portfolio:drop-end -->
<!-- portfolio:add-start
**Status:** ✅ RESOLVED — Vercel + Supabase production. No migration planned.
portfolio:add-end -->

---

### H.2 감사 로그 보관 / Audit log retention
**Question (KO):** 시스템 사용 감사 로그(누가 언제 무엇을 했는지)는 몇 년 보관해야 합니까?

**Question (EN):** Audit log retention period?

**Blocks:** None (default OK)

**Default if no answer:** 24개월 (베트남 best practice)

**Status (2026-05-26):** ✅ RESOLVED — **24개월** 채택 (default 그대로).

---

### H.3 백업 윈도우 / Backup window
**Question (KO):** 매일 백업이 진행되는 시간대 선호가 있나요? (서비스 영향 최소 시간)

**Question (EN):** Daily backup time-of-day preference?

**Blocks:** Phase 1

**Default if no answer:** VST 03:00 (새벽) — 서비스 트래픽 최소

**Status (2026-05-26):** ✅ RESOLVED — **VST 03:00 (새벽)** (default 그대로).

---

## I. 브랜딩 및 로고 (Logo & branding)

### I.1 로고 고해상도 / 벡터 파일 / Logo high-res / vector
**Question (KO):** Seoul Aqua 로고의 벡터 파일(SVG / AI / EPS) 또는 더 큰 해상도 PNG가 있으신가요? 현재 첨부된 .jpg는 2560×706 픽셀입니다.

**Question (EN):** Do you have vector (SVG/AI/EPS) or higher-res PNG version of the logo? Current attachment is 2560×706 .jpg.

**Why it matters:** 사이드바, 모바일 splash, PDF 헤더 등에서 선명한 렌더링.

**Blocks:** Phase 1 (UI polish)

**Default if no answer:** 현재 .jpg를 1024×283로 트림 + SVG 재구성 (단, 폰트 라이선스 이슈 가능)

**Status (2026-05-26):** ✅ RESOLVED — 파일 전달 완료:
- 고해상도 PNG (3492 × 817): `reference/brand/SeoulAqua_Logo_0071BD_Pantone 285C-01.png`
- AI 벡터 파일: `reference/brand/SeoulAqua_Logo_0071BD_Pantone 285C.ai`

---

### I.2 ★ 브랜드 블루 색상 확정 / Brand blue hex confirmation
**Question (KO):** 로고에서 추출한 브랜드 블루 hex는 **`#0071BD`** (Pantone 285C 계열)입니다. 이 색상 사용 OK인가요? 회사가 공식 브랜드 가이드에 다른 hex 값을 정해두셨다면 알려주세요.

**Question (EN):** Brand blue extracted from logo: **`#0071BD`** (Pantone 285C family). OK to use? If official brand guideline specifies different hex, please share.

**Why it matters:** 모든 primary CTA, 링크, 포커스 링에 사용됨.

**Blocks:** Phase 1 (design tokens)

**Default if no answer:** `#0071BD` 사용

**Status (2026-05-26):** ✅ RESOLVED — **`#0071BD` 사용 OK** (Pantone 285C, default 그대로).

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

**Status (2026-05-26):** ✅ RESOLVED — (a) **전체 이력 마이그레이션** (~9000 고객 + 수만 건 이력). default (c)에서 변경됨.

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

**Status (2026-05-26):** ✅ RESOLVED — (a) + (b) **자동 매칭 + 사람 검토** (default 그대로).

---

### J.3 마이그레이션 검증 담당 / Migration validation owner
**Question (KO):** 마이그레이션 후 데이터 정확성 검증은 누가 담당하시나요? (랜덤 샘플 비교, 총 건수 확인 등)

**Question (EN):** Who validates migrated data accuracy (random sample comparison, count verification)?

**Blocks:** Phase 2

**Default if no answer:** Seoul Aqua 사무실 매니저 1명 + 개발팀 함께 진행

**Status (2026-05-26):** ✅ RESOLVED — **Seoul Aqua 사무실 매니저 1명 + 개발팀** 함께 진행 (default 그대로).

---

## K. (기타 추가) 기사 모바일 운영

### K.1 기사용 디바이스 / Technician device standard
**Question (KO):** 기사가 사용할 디바이스(스마트폰)에 표준이 있나요? Android vs iOS, 화면 크기, 카메라 해상도 등.

**Question (EN):** Standard technician device? Android/iOS, screen size, camera spec?

**Blocks:** Phase 4 (UI 최적화 우선순위)

**Default if no answer:** Android 8+ / iOS 14+, 5-6인치 화면 기준 디자인, 카메라 8MP+ 가정

**Status (2026-05-26):** ✅ RESOLVED — **Android 8+ / iOS 14+, 5-6인치 화면 기준, 8MP+ 카메라** (default 그대로).

---

### K.2 기사 인증 / Technician authentication
**Question (KO):** 기사는 어떻게 로그인하나요? (이메일+비밀번호 / 사번 / 전화번호)

**Question (EN):** Technician login: email+password / employee number / phone?

**Blocks:** Phase 1

**Default if no answer:** 사번(또는 전화번호) + 비밀번호 — 이메일이 없을 수 있음

**Status (2026-05-26):** ✅ RESOLVED — **전화번호 + 비밀번호** 채택.

---

### K.3 동시 작업 시 누가 책임 / Multi-tech accountability
**Question (KO):** 한 사이트에 기사 2명이 동시에 작업 시, 누가 "주 책임자"인가요? 결제, 서명, 보고서는 누가 처리?

**Question (EN):** When 2 techs work same site simultaneously, who's the "primary"? Who handles payment, signature, report?

**Blocks:** Phase 4

**Default if no answer:** 한 명을 `leadTechnicianId`로 지정; 나머지는 협업자

**Status (2026-05-26):** ✅ RESOLVED — **한 명을 `leadTechnicianId`로 지정; 나머지는 협업자** (default 그대로). `Visit.leadTechnicianId` (필수) + `Visit.collaboratorTechnicianIds[]` (옵션) 모델. 결제·서명·보고서 = lead tech.

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

- **2026-05-26 (v0.5 latest)** — **클라이언트 답변 수신** (`reference/answers.txt`). 50개 질문 전부 답변; A.5만 PARTIAL (2026-05-29 데이터 도착 예정). 주요 material 변경:
  - **A.4 + A.8**: Customer > Site > Equipment 3-level 계층 모델 채택
  - **A.10**: 포털 URL `portal.seoulaqua.com.vn` 서브도메인 (이전 결정 root URL에서 변경) → SMS 비용 +712K VND/월 영향
  - **B.2**: 신규 계약 코드 형식 B2C `HD-YYYYmmDD/SA-KH####`, B2B `HD-YYYYmmDD/SA-{shortcode}` + B2B Appendix 지원
  - **B.5**: B2C 가격 단순 업데이트, B2B amendment revisions
  - **C.2**: `preferredTechnicianId` + `preferredRegion` per customer
  - **K.3**: Multi-tech `leadTechnicianId` + `collaboratorTechnicianIds[]`
  - **F.1**: eSMS.vn + **Zalo OA + Mini App TODO** (Phase 8+)
<!-- portfolio:drop-start -->
  - **F.2 vs F.7**: 이메일 dual-rail — F.7 Resend (transactional) + F.2 vhost.vn (세금계산서 첨부/마케팅)
<!-- portfolio:drop-end -->
<!-- portfolio:add-start
  - **F.7**: 이메일 단일 ESP — Resend (transactional + operational)
portfolio:add-end -->
  - **D.5**: 모든 B2B 세금계산서 필요 (이전 변경)
  - **A.13**: 동일 phone1 두 명 모두 로그인 가능 (변경)
  - **J.1**: 전체 9000+ 고객 이력 마이그레이션
<!-- portfolio:drop-start -->
  - **H.1**: vhost.vn 호스팅 확정
<!-- portfolio:drop-end -->
<!-- portfolio:add-start
  - **H.1**: Vercel + Supabase production
portfolio:add-end -->
- **2026-05-26 (v0.4)** — Mock-first 결정. F.4 / F.7 / A.14 / Q17 (=F.1) 4개 항목을 "Phase 3.5 blocker"에서 "Production-launch blocker"로 강등. Phase 3.5 개발은 `SMS_PROVIDER=mock` + `EMAIL_PROVIDER=mock` 환경에서 진행, 실제 발송 자격증명(eSMS ApiKey, Resend API key, DKIM 키)이 확보된 시점에 env-only 전환. Phase 3.5 dev-start blockers는 A.10 / A.11 / C.6 3건으로 축소.
- **2026-05-26** — v0.3 고객 포털 / SMS / 비밀번호 정책 추가. A.10 (포털 URL, blocker), A.11 (비밀번호 정책, blocker), A.12 (OTP 옵션), A.13 (공유 번호), C.6 (서비스 요청 유형, blocker), F.4 (SMS 발신자 ID, lead-time blocker), F.5 (세션 처리), F.6 (잠금 정책). Q17 (SMS provider) Phase 7→3.5 이전. 총 49건. **Q11 (역할 권한 매트릭스)는 SPEC §2.1에서 인라인 해결 — 3-tier (`ADMIN/MANAGER/STAFF`) + `TECHNICIAN` 모델 채택.**
- **2026-05-26** — v0.2 두-컨택트 모델 추가. A.6 (모델 확인, blocker), A.7 (언어 fallback), A.8 (B2B 다중 사이트), A.9 (마이그레이션 시 보조 컨택트). 총 41건.
- **2026-05-25** — v0.1 initial question set. 37 questions across 11 sections.
