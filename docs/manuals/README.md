# Seoul Aqua SOMS — User Manuals

End-user manuals organized by role and language.

## Status (2026-06-01)

| Role | ko | en | vi |
|---|---|---|---|
| Admin | ✅ `ko/admin.md` | ⏳ TODO | ⏳ TODO |
| Manager | ✅ `ko/manager.md` | ⏳ TODO | ⏳ TODO |
| Staff | ✅ `ko/staff.md` | ⏳ TODO | ⏳ TODO |
| Technician | ✅ `ko/technician.md` | ⏳ TODO | ⏳ TODO |
| Customer | ✅ `ko/customer.md` | ⏳ TODO | ⏳ TODO |

**en / vi mirrors are deferred** to a follow-up PR — this initial set was written in Korean only to keep the doc PR within a manageable scope. Once the ko base manuals are reviewed and any structural revisions land, en + vi translations follow.

## Coverage

These manuals reflect the 2026-06-01 sprint (PR #9–#13):

- **PR #9** — Humanize audit log (Admin/Manager only) → `admin.md` §3, `manager.md` §3
- **PR #10** — Manager权한 확장 + 사이드바 role filter → `admin.md` §4, `manager.md` §2, `staff.md` §2
- **PR #11** — Receipt PDF dual-copy + tear line + ₫ blank-fill → `technician.md` §3, `customer.md` §4
- **PR #12** — 3-realm auth (TECHNICIAN field cookie 분리) → `technician.md` §1, `customer.md` §1
- **PR #13** — Technician charge-override on visit-complete → `technician.md` §3, `manager.md` §4

Base coverage (pre-2026-06-01) for unchanged features (customer list, contract workflow, equipment install, payment reconcile, etc.) is **not yet written** — these initial manuals focus on the new/changed features for stakeholder review. The base content will be back-filled in a follow-up phase.

## Cross-references

- `docs/AUTH.md` — 3-realm architecture deep dive
- `docs/SPEC.md` §change log — release-by-release decision trail
- `docs/PROCESS_NOTES.md` — distilled business processes
- `.claude/skills/DESIGN.md` — design system reference
