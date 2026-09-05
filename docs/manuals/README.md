# Jake's Home Appliances SOMS — User Manuals

End-user manuals organized by **user group** and language.

## Coverage (2026-07-11 — refreshed for the 4-step equipment-registration redesign)

| User Group | Korean (ko) | Vietnamese (vi) | English |
|---|---|---|---|
| **Office** (ADMIN / MANAGER / STAFF) | ✅ [`ko/office.md`](ko/office.md) (1020 lines) | ✅ [`vi/office.md`](vi/office.md) (1020 lines) | — (not in v1 scope) |
| **Field** (TECHNICIAN) | ✅ [`ko/field.md`](ko/field.md) | ✅ [`vi/field.md`](vi/field.md) | — |
| **Customer** (CONTRACT_PARTY / OPS_CONTACT) | ✅ [`ko/customer.md`](ko/customer.md) | ✅ [`vi/customer.md`](vi/customer.md) | — |

**2026-07-11 update** — Equipment-registration redesign (step wizards) + Vietnam 2025 administrative reform. Only `office.md` (ko + vi) changed; `field.md` / `customer.md` were unaffected (visit/read workflows only). Updated sections:

| Manual | Updated sections |
|---|---|
| `office.md` | §5.2 address entry (3-level → 2-level, no district, diacritic-insensitive search), §7.1 domain overview (5-step wizard, day-unit cycles), §7.4 bulk-register wizard rewritten (5 steps incl. **최종 확인 / final review**), §7.5 new single-register multi-line wizard, §8.4 new manual signed-contract PDF upload, scenario 5, Appendix A |

See [`../../change_log.md`](../../change_log.md) for the user-facing summary of this release.

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
