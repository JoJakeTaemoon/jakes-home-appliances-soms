# Seoul Aqua SOMS — User Manuals

End-user manuals organized by **user group** and language.

## Coverage (2026-06-03 — refreshed for Phase 6 visit deep-dive)

| User Group | Korean (ko) | Vietnamese (vi) | English |
|---|---|---|---|
| **Office** (ADMIN / MANAGER / STAFF) | ✅ [`ko/office.md`](ko/office.md) (1638 lines) | ✅ [`vi/office.md`](vi/office.md) (1638 lines) | — (not in v1 scope) |
| **Field** (TECHNICIAN) | ✅ [`ko/field.md`](ko/field.md) (1003 lines) | ✅ [`vi/field.md`](vi/field.md) (1003 lines) | — |
| **Customer** (CONTRACT_PARTY / OPS_CONTACT) | ✅ [`ko/customer.md`](ko/customer.md) (1098 lines) | ✅ [`vi/customer.md`](vi/customer.md) (1098 lines) | — |

**Phase 6 update (2026-06-03)** — Visit-management deep dive added 6 distinct visit documents, the **"오늘의 배정"** board, the **"일괄 인쇄"** view, the **방문 지참 서류 발급 카드**, and mobile **서명 받을 서류** previews. Updated sections:

| Manual | New sections |
|---|---|
| `office.md` | §4.4 sidebar (2 new entries), §7.2 unassigned tab, §7.8 schedule board, §7.9 document issuance, §7.10 bulk print, scenarios 15–17, Appendix A 3 new menu rows |
| `field.md` | §4.1 sign-required badge on today card, §5.1 mobile signature-doc preview section |
| `customer.md` | §7.4 — list of paper documents the customer will receive at each visit type |

Each manual covers the workflow overview (taken from [HOW_TO_USE.md](../HOW_TO_USE.md)) **plus** every screen and every common scenario for that user group.

## Generated PDFs

Same content rendered as pageless PDFs (single long page per document, optimized for on-screen reading) under [`pdf/`](pdf/):

- `pdf/office-ko.pdf` / `pdf/office-vi.pdf`
- `pdf/field-ko.pdf` / `pdf/field-vi.pdf`
- `pdf/customer-ko.pdf` / `pdf/customer-vi.pdf`

## Screenshots

UI screenshots used in the manuals live under [`screenshots/`](screenshots/), organized **per locale × per user group** (`{ko,vi}/{office,field,customer}/`). Each language manual references its own locale-specific PNGs so the screenshots match the manual's UI language. The screenshot pipeline is in `scripts/manuals/capture-screenshots.ts` and runs each user group twice (once per locale) against a dev server with seeded data. The Phase 6 bulk-print shot (`office/19-visits-print.png`) is captured with a real `date` + `technicianId` query string resolved at runtime so the preview shows a populated per-tech bundle.

## Structure

- **Office manual** — Desktop-first. Sections cover login, customers, contracts, visits, service requests, payments, tax invoices, reports/audit, and system administration. Permission differences (ADMIN / MANAGER / STAFF) are highlighted throughout.
- **Field manual** — Mobile-first. Covers technician daily routine, the 6-step visit completion wizard, photo and signature capture, on-site payment collection, cash handover, and shared-tablet security.
- **Customer manual** — Mobile-first. Covers portal login, home screen, equipment, visit history, service requests, payments and transfers, tax invoices (B2B), contact management (CONTRACT_PARTY only), and safe usage rules.

## Reference (workflow docs)

The companion workflow references in `docs/`:

- [`USER_WORKFLOWS.md`](../USER_WORKFLOWS.md) — Technical workflow reference in English (43 Mermaid diagrams)
- [`HOW_TO_USE.md`](../HOW_TO_USE.md) — Plain-language scenario guide in Korean (12 diagrams)
