# Seoul Aqua SOMS — User Manuals

End-user manuals organized by **user group** and language.

## Coverage (2026-10-15 — full rewrite against the running app, every screenshot re-captured)

| User Group | Korean (ko) | Vietnamese (vi) | English |
|---|---|---|---|
| **Office** (ADMIN / MANAGER / STAFF) | ✅ [`ko/office.md`](ko/office.md) | ✅ [`vi/office.md`](vi/office.md) | — (not in v1 scope) |
| **Field** (TECHNICIAN) | ✅ [`ko/field.md`](ko/field.md) | ✅ [`vi/field.md`](vi/field.md) | — |
| **Customer** (CONTRACT_PARTY / OPS_CONTACT) | ✅ [`ko/customer.md`](ko/customer.md) | ✅ [`vi/customer.md`](vi/customer.md) | — |
| **Catalog upload** (ADMIN / MANAGER data prep) | ✅ [`ko/catalog-upload.md`](ko/catalog-upload.md) | ✅ [`vi/catalog-upload.md`](vi/catalog-upload.md) | — |

**2026-10-15 rewrite** — the manuals had drifted far from the product, so all three role manuals were rewritten from the code and the live screens rather than patched. Highlights:

| Manual | What changed |
|---|---|
| `office.md` | Real permission matrix (downward-only user management, MANAGER+ approvals), cron schedule in VST, actual sidebar, 판매원 as its own roster, 제품 유형 + multi-제품군 catalog, 포털 비밀번호 초기화, 알림 서식 / 알림 발송 내역 / 회사 정보 / 데이터 이관 (ADMIN), what SMS/email actually reach customers today, and Appendix E "what the screens can't do yet" |
| `field.md` | 5-step completion wizard (work · photos · signature photo · payment · review), 보유 현금 badge and 48h handover, 방문 전달사항 instead of calling customers, offline queue, known issues |
| `customer.md` | Single host `soms.seoulaqua.com.vn`, passwords read out by phone, 5-step service request, request messages and cancel, real home cards, contacts via 설정 → 연락처 관리 |
| `catalog-upload.md` | Menu names, 제품 유형 not in the CSV, editable 제품군 codes, stock adjustment location |

## Generated PDFs

Same content rendered as pageless PDFs (single long page per document, optimized for on-screen reading) under [`pdf/`](pdf/) — `npm run manuals:pdf`:

- `pdf/office-ko.pdf` / `pdf/office-vi.pdf`
- `pdf/field-ko.pdf` / `pdf/field-vi.pdf`
- `pdf/customer-ko.pdf` / `pdf/customer-vi.pdf`
- `pdf/catalog-upload-ko.pdf` / `pdf/catalog-upload-vi.pdf`

## Screenshots

UI screenshots live under [`screenshots/`](screenshots/) as `{ko,vi}/{office,field,customer}/NN-name.png`; each language manual references its own locale. They come from `scripts/manuals/capture-screenshots.ts` (`npm run manuals:screenshots`), run against a dev server on a freshly reset dev DB (`npm run db:reset:dev`). Each shot names the exact file the manual references and carries its own `prepare` step (open a tab, a modal, a dropdown, expand a row, walk the completion wizard) — labels are read from `src/messages/{locale}.json`, so the same step works in both languages. Re-take a subset with `SHOTS=name1,name2` and/or `LOCALES=vi`.

## Structure

- **Office manual** — Desktop-first. Login, customers, sales reps, equipment, contracts, visits, orders, service requests, payments, tax invoices, reports/audit, admin menus, scenarios, appendices (sidebar, documents, notification templates, status codes, current limitations).
- **Field manual** — Mobile-first. Daily routine, today / upcoming, visit detail, the 5-step completion wizard, cash on hand and handover, collaborators, per-type notes, offline, known issues.
- **Customer manual** — Mobile-first. Login and first-login password change, home, equipment, visits, service requests, payments, tax invoices (B2B), contacts, settings, notifications.

## Reference (workflow docs)

- [`USER_WORKFLOWS.md`](../USER_WORKFLOWS.md) — Technical workflow reference in English (Mermaid diagrams)
- [`HOW_TO_USE.md`](../HOW_TO_USE.md) — Plain-language scenario guide in Korean
