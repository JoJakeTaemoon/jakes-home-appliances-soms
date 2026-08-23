# Master-Detail Interaction Pattern — Unified Spec

> Status: design spec only (no app code changed by this document).
> Design tokens/components referenced: `.claude/skills/DESIGN.md` §2 (color), §4
> (Buttons, Inputs, Status chips, Tables), §5 (Layout — Master-detail state
> convention).

This spec unifies three master-detail surfaces in the office app under one
mental model: **the detail is either being looked at (조회), edited (수정),
or created (신규 등록) — never "always editable."**

| Pattern | Screen(s) | Current file |
|---|---|---|
| A — Side-by-side record workspace | Product catalog: 브랜드 · 제품군 · 모델 · 소모품 · 부속품 · 유무상(charges) | `src/app/o/[locale]/(dashboard)/admin/products/page.tsx` |
| B — Stacked list/detail | Customer detail → 장비 탭 | `src/components/equipment/equipment-master-detail.tsx` (+ `equipment-detail-panel.tsx`) |
| C — Role-sectioned table | 사용자 관리 | `src/app/o/[locale]/(dashboard)/admin/users/page.tsx` |

---

## Pattern A — Side-by-side record workspace (catalog, all 6 tabs)

**Confirmed decisions baked in:**
- The bottom `ActionBar` and `LegendFooter` (currently rendered in `ModelsTab` /
  `ConsumablesTab`) are **removed**. Mode-switch buttons ([신규등록][수정] /
  [저장][취소]) move **into the detail panel's own header**. List-level
  actions (검색, 엑셀, 보고서/CSV — 소모품 only) move to **the top of the list
  panel**.
- `SectionBadge` (①②③④ numbered chips) is kept, repurposed as headers inside
  each panel rather than as a whole-page legend target.
- Forms (`EquipmentModelForm`, inline `ConsumableForm`, and the brand/category/
  accessory/charge forms) stop being "always editable" — they gain a 조회
  (read-only) rendering mode.

### Wireframe — desktop 1280, 조회 state (record selected)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ 제품 카탈로그                                                                          │
│ [브랜드] [제품군] [모델] [소모품] [부속품] [유무상]                                     │
├───────────────────────────────────────┬──────────────────────────────────────────────┤
│ DETAIL PANEL — fixed (own overflow if  │ LIST PANEL — scrolls independently            │
│ content taller than the row height)    │                                                │
│ ┌─────────────────────────────────────┐│┌──────────────────────────────────────────────┐│
│ │① 모델 정보                 [조회]   │││③ [검색_______________] [검색] [엑셀] [보고서] ││
│ │                  [신규등록] [수정]  │││├──────────────────────────────────────────────┤│
│ ├─────────────────────────────────────┤││④(sticky) # 모델명 카테고리 브랜드 재고 판매가 ││
│ │② 모델명    PTS-2100                 │││├──────────────────────────────────────────────┤│
│ │  브랜드    Seoul Aqua                │││  1 PTS-2100  정수기  Seoul Aqua   42  1,200,000│ ← selected
│ │  카테고리   정수기                   │││  2 PTS-2200  정수기  Seoul Aqua   10    980,000│   (highlighted)
│ │  재고수량   42                       │││  3 …                                          │  (scrolls;
│ │  판매가    1,200,000                 │││  …                                            │   thead fixed)
│ │  ...                                 │││  20 …                                         │
│ └─────────────────────────────────────┘│└──────────────────────────────────────────────┘│
└───────────────────────────────────────┴──────────────────────────────────────────────┘
```

Header-only diffs for the other two states:

```
조회 (empty — nothing selected yet)     수정 중                          신규 등록
┌───────────────────────────┐          ┌───────────────────────────┐   ┌───────────────────────────┐
│① 모델 정보        [조회]  │          │① 모델 정보     [수정 중]  │   │① 모델 정보    [신규 등록] │
│              [신규등록]   │          │           [저장] [취소]   │   │          [저장] [취소]    │
├───────────────────────────┤          └───────────────────────────┘   └───────────────────────────┘
│ 목록에서 모델을 선택하거나 │
│ [신규등록]으로 시작하세요. │
└───────────────────────────┘
```

### State-transition table

| From | Trigger | To | Side effect |
|---|---|---|---|
| 조회 (empty) | click a list row | 조회 (loaded) | GET the record, render read-only |
| 조회 (loaded) | click a different list row | 조회 (loaded, new record) | swap displayed record; no confirm needed (조회 has no unsaved state) |
| 조회 (empty or loaded) | `[신규등록]` / **F2** | 신규 등록 | clear panel to a blank editable form; list selection cleared, list rows locked |
| 조회 (loaded) | `[수정]` / **F3** | 수정 중 | same record's fields become editable in place; list rows locked |
| 수정 중 | `[저장]` / **F5** | 조회 (loaded) | PATCH; success → reload record read-only; validation error → stay in 수정 중, inline error, focus first invalid field |
| 수정 중 | `[취소]` / **Esc** | 조회 (loaded) | discard edits, revert to last-loaded values, list unlocked |
| 신규 등록 | `[저장]` / **F5** | 조회 (loaded, new record) | POST; success → select + highlight the new row, load read-only |
| 신규 등록 | `[취소]` / **Esc** | 조회 (previous selection, or empty) | discard draft, restore prior selection, list unlocked |

**List lock rule:** while in 수정 중 / 신규 등록, list rows are `aria-disabled`
and visually dimmed (not clickable) — this forces an explicit 저장/취소 before
switching records, instead of silently discarding an edit mid-flight.

### Button sets per state

| State | Detail-header buttons | List rows |
|---|---|---|
| 조회 (empty) | `[신규등록]` | clickable |
| 조회 (loaded) | `[신규등록]` `[수정]` `[삭제]`* | clickable |
| 수정 중 | `[저장]` `[취소]` | locked/dimmed |
| 신규 등록 | `[저장]` `[취소]` | locked/dimmed |

\* `[삭제]` (soft-disable / `isActive=false`) is not a mode transition — it's
carried over from the current bottom bar's F4 action and stays a 조회-state
button, enabled only when a record is selected.

### Read-only field rendering (조회 vs 수정/신규)

Both modes render the field at the **same grid position** — no layout shift
when switching modes.

- **조회**: `<div class="bg-surface-sunken border border-border rounded px-3 h-9 flex items-center text-sm text-text-primary">{value}</div>` — static text, no focus ring, no cursor change. This is deliberately **not** a `disabled` input (see ARIA below).
- **수정 / 신규**: the real `<Input>` / `<Combobox>` / `<Textarea>` per DESIGN.md §4 (`bg-white border border-border rounded px-3 h-9 … focus:border-brand-blue-500`).
- Label above the field is identical in both modes (`text-xs font-medium text-text-secondary mb-1.5`).

### State badge

Pill next to the panel title (`SectionBadge` row), one of:

| State | Classes |
|---|---|
| 조회 | `bg-surface-sunken text-text-secondary rounded-full px-2.5 py-0.5 text-xs font-medium` |
| 수정 중 | `bg-status-warning-bg text-status-warning-text rounded-full px-2.5 py-0.5 text-xs font-medium` |
| 신규 등록 | `bg-brand-blue-50 text-brand-blue-700 rounded-full px-2.5 py-0.5 text-xs font-medium` |

### List-level actions placement

Top of the list panel (③ in the wireframe), above the sticky table header:
검색 input · `[검색]` · `[엑셀]` (모델/소모품/부속품) · `[보고서]` (소모품 only,
was F7). These replace the F6/F7 items that used to live in the bottom
`ActionBar`.

### Keyboard shortcuts

| Key | Action | Available when |
|---|---|---|
| **F2** | 신규등록 진입 | 조회 (always) |
| **F3** | 수정 진입 | 조회 + a record is selected |
| **F5** | 저장 | 수정 중 / 신규 등록 |
| **Esc** | 취소 | 수정 중 / 신규 등록 |
| F4 | 삭제(비활성화) — unchanged from today | 조회 + a record is selected |
| F10 | focus 검색 input — unchanged from today | any |

Bind via the existing `useHotkeys` hook (same mechanism `ActionBar` uses today),
scoped to the tab's mounted lifetime.

### ARIA

- Detail panel: `role="region" aria-label="{tab} 상세"`.
- State badge: wrap just the badge text in `aria-live="polite"` so mode changes
  are announced without re-announcing the whole panel.
- Read-only field: **not** `<input disabled>` (disabled controls are skipped
  by some AT and read as "dimmed," not "read-only"). Render as
  `<div role="text" aria-labelledby="{field-label-id}">{value}</div>`, with the
  visible `<label id="{field-label-id}">` pointing at it.
- Editable inputs keep normal `<label htmlFor>` association.
- List rows keep the existing `role="button" tabIndex={0}` pattern; add
  `aria-disabled="true"` (never plain `disabled`) when locked during 수정 중 /
  신규 등록, and keep `aria-current="true"` on the selected row.
- Tab order: state badge (not focusable) → header buttons, left to right as
  listed in the table above → list search → list rows.
- Focus management: entering 수정 중 / 신규 등록 moves focus to the first form
  field; 저장/취소 back to 조회 returns focus to the selected list row (or to
  `[신규등록]` if nothing is selected).

### Independent-scroll mechanics

```
Row wrapper:  grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-4
              lg:h-[calc(100vh-<header+tabs height>)] lg:min-h-0

Detail panel: min-h-0 overflow-y-auto rounded-2xl border border-border bg-white
              (scrolls only if its own content exceeds the row height —
              in practice it reads as "fixed" since forms are short)

List panel:   min-h-0 flex flex-col overflow-hidden rounded-2xl border border-border bg-white
                toolbar row:  shrink-0            (search + list actions)
                scroll region: flex-1 min-h-0 overflow-y-auto
                  <table><thead class="sticky top-0 z-10 bg-surface-sunken">…
```

`min-h-0` on every flex/grid ancestor is what lets the descendant
`overflow-y-auto` actually constrain instead of growing the row — this is the
standard flexbox/grid scroll-trap requirement, not optional.

Below `lg`, both panels stack and the page returns to normal document scroll
(independent-scroll is a desktop-only refinement — mobile/tablet office use is
"usable but cramped," consistent with DESIGN.md §9's desktop-first office
classification).

---

## Pattern B — Stacked list/detail (customer → 장비 탭)

**Scope note:** this pattern reuses the fixed-height / independent-scroll list
convention and the "no accordion, explicit select" rule from Pattern A. It
does **not** import Pattern A's inline 조회/수정/신규 field-editing machine —
equipment editing already goes through a dedicated modal
(`EquipmentEditModal`, opened via the existing `masterDetail.edit` action) and
a full detail page (`/o/equipment/[id]`); that separation is out of scope for
this round. For visual consistency, the detail section still shows a static
**[조회]** badge (equipment here is always displayed read-only; edit is an
explicit action that leaves this section).

### Wireframe — desktop 1280

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [검색_________________________]                    [사업장 ▾ 필터]         │
├────────────────────────────────────────────────────────────────────────────┤
│ (sticky) #  모델        시리얼      사업장    설치일       상태             │
├────────────────────────────────────────────────────────────────────────────┤
│  1  PTS-2100   SN-00231   본사      2024-03-11  ● 사용중                   │
│  2  PTS-2200   SN-00542   —        2024-05-02  ● 사용중                   │ ← selected (highlighted only)
│  3  …                                                                       │
│  ⋮  (fixed-height box, internal scroll, thead stays put; ~10 rows visible) │
│ 10  …                                                                       │
└────────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────────┐
│ 선택한 장비 상세 · PTS-2200 (SN-00542)   [조회]      [전체 화면 보기 ↗]     │
│ [기본정보][필터정보][서비스이력][수금내역][메모]                            │
│  (선택한 탭 내용 — 일반 문서 흐름, 여기부터는 페이지 스크롤 허용)           │
└────────────────────────────────────────────────────────────────────────────┘
```

### Empty state (nothing selected)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  장비를 선택하면 상세 정보가 여기에 표시됩니다.                             │
└────────────────────────────────────────────────────────────────────────────┘
```

The 5 tabs are **not rendered** in this state (not shown-disabled) — an empty
tab strip implies content exists yet is unreachable, which is worse than no
tabs at all.

### Layout mechanics

- List box: fixed height ≈ (row height × 10) + sticky-thead height. At the
  compact table density (`px-2 py-1.5`, `text-sm`) that's roughly `max-h-[24rem]`
  (≈384px) — treat the row count (10) as the tunable constant, not the pixel
  value.
- `<thead class="sticky top-0 z-10 bg-surface-sunken">` inside a
  `overflow-y-auto` body wrapper — same mechanism as Pattern A's list panel.
- Row click = **select + highlight only** (`bg-brand-blue-50` on the selected
  `<tr>`, consistent with the highlight class already used elsewhere). The
  current `.animate-expand-row` inline accordion is removed entirely; the
  detail section below is always present (as an empty-state placeholder or
  the 5-tab panel), never expanding/collapsing in place.
- Detail section sits in normal document flow below the fixed-height list —
  it is *not* height-constrained, since 서비스이력/수금내역 tab content can be
  long; the page scrolls normally past this point.

### Deep-link + back behavior (preserved, unchanged)

- Selecting a row still writes `?tab=equipment&equipmentId=…` to the URL
  (`router.replace(..., { scroll: false })`) so selection survives
  back/forward navigation — no change to this mechanism.
- `[전체 화면 보기 ↗]` still routes to `/o/equipment/[id]` (today's
  `masterDetail.detail` action); browser back returns to this stacked view
  with the same `equipmentId` still selected via the URL param.
- The existing guard that deselects a stale/foreign `equipmentId` (not in the
  current customer's list) stays as-is.

---

## Pattern C — Role-sectioned table (사용자 관리)

One `<table>`, grouped into **4 sections by role, in hierarchy order**:
관리자(ADMIN) → 매니저(MANAGER) → 직원(STAFF) → 기사(TECHNICIAN). No page-level
height constraint here — the table scrolls with the page as it does today;
only the grouping changes.

### Wireframe

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 사용자 관리                                              [+ 사용자 추가] │
├──────────────────────────────────────────────────────────────────────────┤
│ 이름       역할      전화번호        지역        상태     작업            │
├──────────────────────────────────────────────────────────────────────────┤
│ ▌ 관리자 (ADMIN) · 2명                                                    │ ← section header row
│ 김철수     관리자    010-1234-5678   HCMC-D1     활성     [수정][비활성화]│
│ 이영희     관리자    010-2345-6789   —           활성     [수정][비활성화]│
├──────────────────────────────────────────────────────────────────────────┤
│ ▌ 매니저 (MANAGER) · 1명                                                  │
│ 박민수     매니저    010-3456-7890   HCMC-D3     활성     [수정][비활성화]│
├──────────────────────────────────────────────────────────────────────────┤
│ ▌ 직원 (STAFF) · 0명                                                      │
│      이 역할에 해당하는 사용자가 없습니다.                                │ ← empty-section placeholder
├──────────────────────────────────────────────────────────────────────────┤
│ ▌ 기사 (TECHNICIAN) · 5명                                                 │
│ 강기사     기사      010-4567-8901   HCMC-D7     활성     [수정][비활성화]│
│ …                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Section-header row style

`<tr><td colSpan={6} class="bg-surface-sunken border-y border-border border-l-2 border-l-brand-blue-200 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">{역할명} ({ROLE}) · {count}명</td></tr>`

- `colSpan` matches the number of data columns (6 today: 이름/역할/전화번호/지역/상태/작업).
- The role column inside each row becomes redundant with the section header and
  may be dropped from the per-row cells, or kept for scan-ability when a user
  scrolls past a section header — keep it; it costs nothing and helps when the
  header has scrolled out of view.
- `border-l-2 border-l-brand-blue-200` is a subtle brand-accent marker, not a
  new chromatic family — reuses the existing brand-blue-200 token.

### Empty-section handling

Still render the section header (with `count` = 0) **plus one placeholder
row**: `<tr><td colSpan={6} class="px-4 py-3 text-sm text-text-tertiary italic">이 역할에 해당하는 사용자가 없습니다.</td></tr>`.
Never hide an empty section — the 4-section hierarchy should always be fully
visible so an admin can confirm "there really are zero TECHNICIAN accounts"
rather than wonder if the section merely didn't render.

---

## Candidate screens for later adoption (Pattern A) — not in this round

| Screen | Priority note |
|---|---|
| 고객 (Customer) | **High** — highest-traffic office screen; adopt first, it sets the template every other CRUD screen copies. |
| 계약 (Contract) | **High** — long-lived legal/financial fields benefit most from an explicit 조회 boundary that prevents accidental mid-review edits. |
| 수금 (Collection/Payment) | **High** — money-handling screens should have the clearest possible view/edit audit boundary. |
| 서비스요청 (Service Request) | **Medium** — already has an approval state machine (received/approved/rejected); the 조회/수정 badge should visually align with, not compete with, that SR-status badge. |
| 방문 (Visit) | **Medium** — mostly a scheduling queue; adopt once 고객 ships so the technician-assignment combobox patterns are already proven. |
| 판매(원) (Sale records) | **Low–Medium** — smaller record volume, lower daily edit frequency than contracts/payments. |
| 세금계산서 (Tax invoice) | **Low** — per `docs/DOCUMENT_TEMPLATES.md`, tax invoices are uploaded, not authored in-app; the edit surface is minimal (metadata only), so the payoff from a full 3-state machine is small. |
