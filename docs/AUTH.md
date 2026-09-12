# AUTH — 3-Realm Authentication Architecture

**Status**: Phase 1 머지됨 (PR #12 / 2026-06-01). Phase 2 (URL prefix 재배치, page tree mv, E2E coverage ≥90%) 진행 중.

## 개요

Jake's Home Appliances SOMS 사용자는 3개 그룹으로 분리되며 각자 **별도 인증 realm** 을 사용한다.

| 그룹 | 역할 | JWT audience | Cookie 이름 | API path | Provider |
|---|---|---|---|---|---|
| 본사 직원 | ADMIN, MANAGER, STAFF | `staff` *(향후 `office` rename)* | `accessToken`, `refreshToken` | `/api/auth/*` | `AuthProvider` *(향후 `OfficeAuthProvider`)* |
| 현장 직원 | TECHNICIAN | `field` | `fieldAccessToken`, `fieldRefreshToken` | `/api/auth/field/*` | `FieldAuthProvider` |
| 고객 | CustomerContact (CONTRACT_PARTY + OPS_CONTACT) | `customer` | `customerAccessToken`, `customerRefreshToken` | `/api/portal/auth/*` *(향후 `/api/auth/customer/*` rename)* | `CustomerAuthProvider` |

> **Rename 진행 중**: 위 표의 *(향후 …)* 항목은 plan 의 D2/D4 (URL prefix 재배치) 완료 후 적용된다. 현재 코드는 phase 1 의 점진 마이그레이션 상태.

## 동시 로그인

세 그룹은 **같은 브라우저의 다른 탭/창에서 동시 로그인 가능**. 보장하는 메커니즘:

- **쿠키 이름이 realm 별로 다름** → 한 응답이 다른 realm 쿠키를 덮어쓰지 않음
- **sessionStorage namespace 가 realm 별로 다름** (`soms_user`/`soms_access` / `soms_field_*` / `soms_portal_*`) → 한 탭이 다른 realm 의 user/access 토큰을 덮어쓰지 않음
- **AuthProvider 가 realm 별로 다른 namespace 만 read/write** → context 충돌 없음

## Cross-realm 차단

각 realm 은 본인 role 외에는 거부한다.

- `/api/auth/field/login` 에서 ADMIN/MANAGER/STAFF 자격 제출 → **409 ROLE_MISMATCH** + `{ suggestedRealm: "office", suggestedUrl: "/{locale}/o/login" }` 반환
- mobile login form 이 409 응답 받으면 amber 안내 + "본사 직원 로그인으로 이동" 버튼 (phone pre-fill)
- *(Phase 2 예정)* office `/api/auth/login` 에서 TECHNICIAN 자격 제출 → 대칭적 409 + suggested `/f/login` redirect
- 미들웨어가 path × cookie 매트릭스로 cross-realm 침범 차단 — office cookie 만으로 `/mobile/*` 진입 불가, field cookie 만으로 office path 진입 불가

## 미들웨어 path × cookie 매트릭스

`src/middleware.ts` 의 분기 (현재 path 기준 — Phase 2 에 `/o/*` `/f/*` root 로 재배치):

| `pathAfterLocale` | Realm | 요구 쿠키 | 누락 시 redirect |
|---|---|---|---|
| `/portal/login`, `/portal/forgot-password` | (public) | — | — |
| `/portal/*` | customer | `customerRefreshToken` | `/{locale}/portal/login` |
| `/mobile/login` | (public) | — | — |
| `/mobile/*` | field | `fieldRefreshToken` | `/{locale}/mobile/login` |
| `/login` | (public) | — | — |
| 그 외 | office | `refreshToken` | `/{locale}/login` |

미들웨어는 쿠키 존재만 확인. **audience claim 의 실제 검증**은 route handler 의 `requireAuth(realm)` 에서 수행 — leaked office 토큰이 field route 에 그대로 사용되어도 audience 불일치로 401.

## DB 공유 / 격리

- User + Session + LoginAttempt 는 staff/field realm **공유** (한 User 행 하나가 두 realm 의 lockout window 공유). 한 사용자의 5번 실패가 양쪽 모두 잠금 → race / 우회 회피.
- `CustomerContact` + `CustomerSession` 은 customer realm 전용 — 별도 테이블.
- `field-realm.hydrateFromAccessToken` / `hydrateFromSessionId` 는 user role 이 `TECHNICIAN` 이 아니면 null 반환 (드리프트 방어: TECHNICIAN → STAFF 승급 후 field cookie 가 그대로 작동하지 않음).

## Phase 2 TODO

- [ ] URL prefix 재배치 — office 트리 `/o/*`, field `/f/*`, customer root `/`
- [ ] `aud='staff'` → `aud='office'` rename (callsite ~50-80)
- [ ] `accessToken`/`refreshToken` → `officeAccessToken`/`officeRefreshToken` rename
- [ ] `AuthProvider` → `OfficeAuthProvider`, `soms_user`/`soms_access` → `soms_office_*`
- [ ] `/api/portal/auth/*` → `/api/auth/customer/*` rename
- [ ] office + customer login form 의 cross-realm 409 UI (현재 field 만)
- [ ] page tree git mv: `(auth)/login` → `o/login`, `(dashboard)/**` → `o/**`, `mobile/**` → `f/**`, `portal/**` → `(customer)/**`
- [ ] 광범위 href / router.push / fetch URL grep + 갱신 (50-80 파일)
- [ ] 사이드바 + 모바일 nav + portal nav hrefs 갱신
- [ ] E2E coverage 인프라 (c8 + Playwright) + 시나리오 10종 + ≥ 90% 임계
- [ ] SMS/Email 템플릿 의 `portal.jakeshomeappliances.com.vn` → 새 path URL 전환 (별도 PR; VI SMS 2-seg → 1-seg, 월 ~440K-890K VND 절감 예상)

## 관련 PR

- **#9** — Humanize audit log view, Admin/Manager only
- **#10** — Manager unlock for admin pages + data-driven sidebar role filter
- **#12** — 3-realm auth split phase 1 (field cookie + realm + middleware matrix)
