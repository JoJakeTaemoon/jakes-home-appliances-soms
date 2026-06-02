# Seoul Aqua SOMS — User Manuals

End-user manuals organized by **user group** and language.

## Coverage (2026-06-02)

| User Group | Korean (ko) | Vietnamese (vi) | English |
|---|---|---|---|
| **Office** (ADMIN / MANAGER / STAFF) | ✅ [`ko/office.md`](ko/office.md) (1491 lines) | ✅ [`vi/office.md`](vi/office.md) (1491 lines) | — (not in v1 scope) |
| **Field** (TECHNICIAN) | ✅ [`ko/field.md`](ko/field.md) (989 lines) | ✅ [`vi/field.md`](vi/field.md) (989 lines) | — |
| **Customer** (CONTRACT_PARTY / OPS_CONTACT) | ✅ [`ko/customer.md`](ko/customer.md) (1083 lines) | ✅ [`vi/customer.md`](vi/customer.md) (1083 lines) | — |

Each manual covers the workflow overview (taken from [HOW_TO_USE.md](../HOW_TO_USE.md)) **plus** every screen and every common scenario for that user group.

## Generated PDFs

Same content rendered as pageless PDFs (single long page per document, optimized for on-screen reading) under [`pdf/`](pdf/):

- `pdf/office-ko.pdf` / `pdf/office-vi.pdf`
- `pdf/field-ko.pdf` / `pdf/field-vi.pdf`
- `pdf/customer-ko.pdf` / `pdf/customer-vi.pdf`

## Screenshots

UI screenshots used in the manuals live under [`screenshots/`](screenshots/) — one folder per user group (`office/`, `field/`, `customer/`). The screenshot pipeline is in `scripts/manuals/capture-screenshots.ts` and runs against a dev server with seeded data.

## Structure

- **Office manual** — Desktop-first. Sections cover login, customers, contracts, visits, service requests, payments, tax invoices, reports/audit, and system administration. Permission differences (ADMIN / MANAGER / STAFF) are highlighted throughout.
- **Field manual** — Mobile-first. Covers technician daily routine, the 6-step visit completion wizard, photo and signature capture, on-site payment collection, cash handover, and shared-tablet security.
- **Customer manual** — Mobile-first. Covers portal login, home screen, equipment, visit history, service requests, payments and transfers, tax invoices (B2B), contact management (CONTRACT_PARTY only), and safe usage rules.

## Reference (workflow docs)

The companion workflow references in `docs/`:

- [`USER_WORKFLOWS.md`](../USER_WORKFLOWS.md) — Technical workflow reference in English (43 Mermaid diagrams)
- [`HOW_TO_USE.md`](../HOW_TO_USE.md) — Plain-language scenario guide in Korean (12 diagrams)
