# URL Scheme

Canonical URL structure for Seoul Aqua SOMS. All routing, auth, and
realm-isolation behavior MUST conform to this document. Any divergence
in code or documentation is a bug.

> Status: **proposed** (target state). The codebase still uses the legacy
> tree (`(auth)` / `(dashboard)` / `/mobile/*` / `/portal/*`); migration
> to this scheme is tracked separately. See `docs/AUTH.md` for the realm
> isolation primitives that already exist.

---

## 1. Shape

```
{protocol}://{host}/{group}/{locale}/{path}
```

Each segment is optional in the ways spelled out below; the rest are
positional.

| Segment | Required | Allowed values | Notes |
|---|---|---|---|
| `protocol` | yes | `http` / `https` | dev uses `http`, prod uses `https` |
| `host` | yes | `localhost:3000`, `seoulaqua.com.vn`, ... | dev / prod host pair |
| `group` | conditional | `o` / `f` / *(omitted)* | user-group prefix — see §2 |
| `locale` | optional | `en` / `ko` / `vi` | omitted → `en` (silent, no redirect) — see §3 |
| `path` | optional | feature path (e.g. `dashboard`, `visits/123`) | empty → group home |

---

## 2. User group prefix

Exactly one user group per request. The prefix is the **first path
segment** after the host and uniquely identifies the realm.

| Group | Prefix | Roles | Realm name |
|---|---|---|---|
| Office (HQ) | `o` | `ADMIN`, `MANAGER`, `STAFF` | `office` |
| Field (mobile) | `f` | `TECHNICIAN` | `field` |
| Customer (portal) | *(none)* | `CustomerContact` | `customer` |

### 2.1 Resolution rule

Pseudocode for the middleware:

```ts
const segments = pathname.split("/").filter(Boolean);
const first = segments[0];

if (first === "o") return { group: "office", rest: segments.slice(1) };
if (first === "f") return { group: "field",  rest: segments.slice(1) };
return                  { group: "customer", rest: segments };
```

Customer has no prefix; everything that does not start with `o/` or `f/`
is customer-realm. This means **`o` and `f` are reserved top-level
segments** — no customer-realm path may collide with them.

### 2.2 Examples

```
http://localhost:3000/o/en/dashboard          → office, en, /dashboard
http://localhost:3000/o/ko/customers/42       → office, ko, /customers/42
http://localhost:3000/f/vi/today              → field,  vi, /today
http://localhost:3000/en/equipment            → customer, en, /equipment
http://localhost:3000/                        → customer, en, /        (home)
```

---

## 3. Locale

Three locales: `en`, `ko`, `vi`. **`en` is the silent default.**

### 3.1 Resolution rule

After the group prefix is removed, look at the next segment:

- If it equals `en`, `ko`, or `vi` → that is the locale, consume the
  segment.
- Otherwise → locale is `en`, **do not consume** the segment, **do not
  redirect**.

```ts
const LOCALES = ["en", "ko", "vi"] as const;
const next = rest[0];
const locale = LOCALES.includes(next) ? next : "en";
const path = LOCALES.includes(next) ? rest.slice(1) : rest;
```

### 3.2 No-redirect rule

A request that omits the locale **must be served as `en` in place** —
the URL the user sees does not change. This is a deliberate departure
from next-intl's `localePrefix: "always"` default.

Rationale:
- External links and shared URLs stay short and don't grow a locale
  segment on first click.
- Browser back/forward history doesn't accumulate redirect entries.
- Bots and link-checkers see one canonical URL per resource for the
  default locale.

### 3.3 Examples

| URL | Group | Locale | Path | Notes |
|---|---|---|---|---|
| `/o/dashboard` | office | en | `/dashboard` | locale omitted → en |
| `/o/en/dashboard` | office | en | `/dashboard` | explicit en |
| `/o/ko/dashboard` | office | ko | `/dashboard` | |
| `/f/today` | field | en | `/today` | |
| `/f/vi/today` | field | vi | `/today` | |
| `/equipment` | customer | en | `/equipment` | |
| `/ko/equipment` | customer | ko | `/equipment` | |
| `/` | customer | en | `/` | customer home |

### 3.4 Collisions

Because the locale is optional, a path's first segment must never equal
`en`, `ko`, or `vi`. Concretely:

- No feature route may be named `/en`, `/ko`, `/vi`, `/o/en`, `/o/ko`,
  `/o/vi`, `/f/en`, `/f/ko`, `/f/vi`.
- Translators, code-gen, and route-defining devs are responsible for
  this. The middleware does not disambiguate.

---

## 4. Reserved top-level segments

Customer realm has no prefix, so its top-level path namespace is shared
with the framework. These are reserved and may NOT be used as customer
feature paths:

| Reserved | Reason |
|---|---|
| `/o`, `/o/...` | office realm |
| `/f`, `/f/...` | field realm |
| `/en`, `/ko`, `/vi` | locale segments |
| `/api/...` | API routes |
| `/_next/...` | Next.js internals |
| `/favicon.ico`, `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | well-known files |
| `/static/...`, `/public/...` | static assets |

Anything else under `/` is customer realm.

---

## 5. Realm isolation

URL prefix is the **only** thing that determines which realm processes
the request. Each realm has its own cookie, JWT audience, and session
storage namespace — they do not cross.

| Realm | URL prefix | Refresh cookie | JWT `aud` | sessionStorage namespace |
|---|---|---|---|---|
| office | `/o/...` | `officeRefreshToken` | `office` | `soms_office_*` |
| field | `/f/...` | `fieldRefreshToken` | `field` | `soms_field_*` |
| customer | `/` (no prefix) | `customerRefreshToken` | `customer` | `soms_customer_*` |

> Current code uses different names (`refreshToken` / `staff` / `soms_user`
> for office, `soms_portal_*` for customer). The migration to this scheme
> will rename them; backward-compat shims are explicitly NOT planned —
> all users re-login once.

A request hitting `/o/...` is authenticated only by the `officeRefreshToken`
cookie. A `fieldRefreshToken` or `customerRefreshToken` on the same
request is ignored by the office realm.

### 5.1 Simultaneous logins

Because the three cookie names and the three sessionStorage namespaces
are disjoint, the same browser may hold all three sessions at once. The
expected operator flow is one browser window per realm.

### 5.2 Cross-realm login attempts

If a user submits credentials to the wrong realm's login endpoint (e.g.
a TECHNICIAN submits to `/o/login`), the server returns `409 ROLE_MISMATCH`
with `{ suggestedRealm, suggestedUrl }`. The login form renders an
inline link to the correct realm's login page.

---

## 6. API URLs

API routes are not realm-prefixed by URL — they are realm-bound by
which `hydrateFromAccessToken` they call. The grouping in the path is
for engineering organization only.

| Path | Realm bound |
|---|---|
| `/api/auth/office/*` | office |
| `/api/auth/field/*` | field |
| `/api/auth/customer/*` | customer |
| `/api/mobile/*` | field (used by field UI) |
| `/api/portal/*` | customer (used by customer UI) |
| `/api/*` (everything else) | office (used by office UI) |

The API never accepts a cross-realm token. A request to `/api/mobile/*`
with an office access token returns `401`.

---

## 7. Examples — full URLs

Local dev (`http://localhost:3000`):

| User group | Page | URL |
|---|---|---|
| Office | login | `http://localhost:3000/o/login` |
| Office | dashboard | `http://localhost:3000/o/dashboard` |
| Office | dashboard (Korean) | `http://localhost:3000/o/ko/dashboard` |
| Office | customer #42 | `http://localhost:3000/o/customers/42` |
| Office | admin | `http://localhost:3000/o/admin` |
| Office | audit log | `http://localhost:3000/o/reports/audit` |
| Field | login | `http://localhost:3000/f/login` |
| Field | today | `http://localhost:3000/f/today` |
| Field | today (Vietnamese) | `http://localhost:3000/f/vi/today` |
| Field | visit detail | `http://localhost:3000/f/visits/abc123` |
| Field | profile | `http://localhost:3000/f/profile` |
| Customer | home | `http://localhost:3000/` |
| Customer | login | `http://localhost:3000/login` |
| Customer | login (Vietnamese) | `http://localhost:3000/vi/login` |
| Customer | equipment | `http://localhost:3000/equipment` |
| Customer | service request | `http://localhost:3000/requests/new` |

Production (`https://soms.seoulaqua.com.vn`) — substitute the host:

```
https://soms.seoulaqua.com.vn/o/dashboard
https://soms.seoulaqua.com.vn/f/today
https://soms.seoulaqua.com.vn/equipment
```

The customer realm shares the bare host with the application root, by
design — the customer is the primary public audience.

---

## 8. Non-goals

- **Subdomains.** Earlier drafts considered `portal.seoulaqua.com.vn`;
  rejected (no wildcard cert / DNS overhead, customer-portal-as-PWA
  works fine on a path).
- **Per-realm hosts.** All three realms share the same host; only the
  path discriminates.
- **Implicit role-based redirect after login.** Each realm's login posts
  to its own endpoint and routes to its own home; the system does not
  guess a user's group and redirect on the bare host.

---

## 9. Change log

| Date | Change |
|---|---|
| 2026-06-02 | Initial draft. URL scheme proposed; migration not yet started. |
