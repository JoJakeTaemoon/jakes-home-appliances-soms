# Design System — Seoul Aqua SOMS

> **Inspired by Intercom's design system**, adapted for Seoul Aqua's brand identity. Intercom's warmth + professionalism + tactile interactions are the structural reference; the primary accent is swapped from Intercom orange to Seoul Aqua brand blue.
>
> Reference: [Intercom design system](https://www.intercom.com/) — observed pattern: warm off-white canvas, sharp 4 px borders, monospace uppercase labels, `scale(1.1)` primary CTA hover.

## 1. Visual Theme & Atmosphere

Seoul Aqua SOMS feels **bright, calm, and trustworthy** — the visual equivalent of clean drinking water served in a well-lit office. The brand identity is anchored by the blue Seoul Aqua wordmark; the UI lets that blue carry meaning (primary actions, links, focus) without flooding the screen with colour. Surfaces are a warm off-white (not pure grey) so screens feel inviting to a customer-service mindset, not an industrial dashboard.

The aesthetic supports four very different audiences in one product:
- **Field technicians** working on a phone with one hand, in good or bad light, needing big tap targets and one-glance status reads.
- **Office staff** scanning long tables, juggling many records, demanding density without noise.
- **Management** reviewing reports — wanting confidence-conveying calm, not chartjunk.
- **(Future) customers** opening a portal once a quarter — they need to feel cared-for, not interrogated by a form.

**Key characteristics:**

- Warm off-white canvas (`#fafaf7`), white card surfaces (`#ffffff`)
- Brand blue (`#0071BD`) as the **only** chromatic accent — used for primary CTAs, links, focus rings, selected states, and the sidebar logo block
- Sharp 4 px (`rounded`) borders for cards / inputs / pills; full pill (`rounded-full`) for chips and small badges; 8 px (`rounded-lg`) for modals
- Subtle border + tiny shadow for depth — no big drop shadows
- Hover on primary CTA: `transform: scale(1.02)` over 150 ms — gives the click a tactile feel (Intercom's signature)
- Tabular numerals (`font-variant-numeric: tabular-nums`) on every count, date, phone number, amount
- Mobile-first interactive elements: 44 px minimum touch target on `< md`

## 2. Color Palette

### Brand (the only chromatic family)

Source: extracted from `reference/brand/Seoul Aqua Logo.jpg` — the dominant logo blue is `#0071BD` (4523 pixel cluster, n=3820 at exact pixel). This is the **Primary Brand Blue**.

| Token | Hex | Where to use |
|---|---|---|
| `--brand-blue-50` | `#E6F1F9` | Subtle hover surface, selected row background, info-banner fill |
| `--brand-blue-100` | `#C2DDF0` | Disabled primary-button surface, badge background for "in progress" / "active" |
| `--brand-blue-200` | `#94C1E3` | Pressed-state surface, focus-ring outer halo |
| `--brand-blue-500` | `#0071BD` | **Primary** — buttons, links, focused borders, sidebar logo backdrop |
| `--brand-blue-600` | `#005C9A` | Primary button hover, link hover |
| `--brand-blue-700` | `#00477A` | Primary button pressed, dark text on light blue surfaces |
| `--brand-blue-900` | `#002A4D` | Reserved — header text on white when extra weight needed |

### Neutral text scale (off-white canvas)

| Token | Hex | Where to use |
|---|---|---|
| `--canvas` | `#fafaf7` | Page background (warm off-white, NOT pure grey) |
| `--surface` | `#ffffff` | Card / panel / modal surface |
| `--surface-hover` | `#f5f5f0` | Card hover, list-row hover |
| `--surface-sunken` | `#f0efe9` | Section background, table header fill |
| `--text-primary` | `#1a1a1a` | Headings, body text on white |
| `--text-secondary` | `#525252` | Helper text, label, secondary info |
| `--text-tertiary` | `#737373` | Captions, metadata, timestamps |
| `--text-placeholder` | `#a3a3a3` | Placeholder text, disabled labels, empty-state hints |
| `--border` | `#e7e5e0` | Hairline borders (warmer than pure grey), oat-tone |
| `--border-strong` | `#d4d0c7` | Emphasized borders on cards that need to read as "container" |

### Status colors

| Status | Token | Bg | Text | Accent |
|---|---|---|---|---|
| Success | `--status-success` | `#dcfce7` | `#166534` | `#16a34a` |
| Warning | `--status-warning` | `#fef9c3` | `#854d0e` | `#eab308` |
| Error | `--status-error` | `#fee2e2` | `#991b1b` | `#dc2626` |
| Info | `--status-info` | `#E6F1F9` (= brand-blue-50) | `#00477A` (= brand-blue-700) | `#0071BD` (= brand-blue-500) |

> Info reuses brand blue — that's intentional. Info-banners shouldn't compete with the brand; they should feel like the brand telling you something.

### Dark sidebar palette

The sidebar is a brand surface — it carries the logo and the navigation.

| Token | Hex | Where to use |
|---|---|---|
| `--sidebar-bg` | `#003356` | Sidebar background (deep brand blue) |
| `--sidebar-logo-bg` | `#0071BD` | Logo block backdrop (so the white logo pops) |
| `--sidebar-nav-rest` | `#a8c3da` | Nav item text default (mid blue-grey on dark) |
| `--sidebar-nav-hover-bg` | `#005C9A` | Nav item hover surface |
| `--sidebar-nav-active-bg` | `#005C9A` | Nav item active surface |
| `--sidebar-nav-active-text` | `#ffffff` | Active nav item text |
| `--sidebar-group-label` | `#6B8FAC` | Group heading text (small caps) |

## 3. Typography

### Font stack

- **Latin / Vietnamese / numbers:** `Inter, ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Segoe UI", sans-serif`
- **Korean:** `"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`
- **Combined (default `--font-sans`):** `"Pretendard Variable", Inter, ui-sans-serif, system-ui, sans-serif`
- **Monospace labels (rarely used, only for codes / IDs / IDs / timestamps):** `"JetBrains Mono", "SF Mono", Menlo, monospace`

Pretendard is self-hosted at `/public/fonts/PretendardVariable.woff2` (copied from PMIS where it was proven). Inter loads via `next/font/google`.

The Seoul Aqua wordmark itself has a soft, friendly rounded sans-serif character. Pretendard's geometric roundness echoes that on display text without licensing the wordmark font.

### Type scale

| Role | Tailwind | Size | Weight | Tracking | Use |
|---|---|---|---|---|---|
| Display | `text-4xl font-semibold tracking-tight` | 36 px | 600 | -0.02 em | Hero on marketing pages or empty states |
| Page title (h1) | `text-3xl font-semibold tracking-tight` | 30 px | 600 | -0.01 em | Top of every dashboard page |
| Section title (h2) | `text-xl font-medium` | 20 px | 500 | 0 | Section heads inside a page |
| Card title (h3) | `text-base font-medium` | 16 px | 500 | 0 | Card heads, table groups |
| Body | (default) | 16 px | 400 | 0 | Reading text, table cells |
| Compact body | `text-sm` | 14 px | 400 | 0 | Dense tables, helper text |
| Caption | `text-xs` | 12 px | 400 | 0 | Metadata, timestamps |
| Label (uppercase) | `text-[10px] font-medium tracking-wider uppercase` | 10 px | 500 | +0.05 em | Small labels above KPIs and form sections |

### Principles

- **Three weights only**: 400 (body), 500 (UI / labels / titles), 600 (hero + page title).
- **Tabular numerals everywhere a number lives in a column** — KPI cards, table cells, money, counts, phone numbers. Use Tailwind's `tabular-nums`.
- **Korean + Latin + Vietnamese mix is the default** — avoid weight-sensitive metrics that look fine in one script but break another. Pretendard handles all three well; don't override `font-feature-settings` unless you really mean it.

## 4. Components

### Buttons

**Primary (filled, brand blue)**

```
bg-brand-blue-500 text-white
px-4 h-10 rounded
text-sm font-medium
hover:bg-brand-blue-600 hover:scale-[1.02] transition-transform duration-150
active:scale-100 active:bg-brand-blue-700
focus-visible:ring-2 focus-visible:ring-brand-blue-200 focus-visible:ring-offset-2
disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
```

- The `scale(1.02)` hover is the signature Intercom-derived tactile cue. It's subtle but you'll feel it. Reduced-motion users see no scale; honor `prefers-reduced-motion`.
- On mobile (`< md`), height bumps to `h-11` (44 px touch target).

**Secondary (outlined)**

```
bg-white border border-text-primary text-text-primary
px-4 h-10 rounded
text-sm font-medium
hover:bg-surface-hover
focus-visible:ring-2 focus-visible:ring-brand-blue-200 focus-visible:ring-offset-2
```

**Ghost / tertiary**

```
text-text-secondary
px-3 h-9 rounded
text-sm
hover:bg-surface-hover hover:text-text-primary
```

**Danger**

Same shape as Primary but `bg-status-error-accent` (`#dc2626`) and slightly more conservative hover (no scale).

### Cards and containers

- Default card: `bg-white border border-border rounded p-4 space-y-3`
- Elevated card (floating panel, modal): add `shadow-md` with brand-blue-tinted shadow: `shadow-[0_4px_12px_rgba(0,113,189,0.08)]`
- Stat / KPI card: `bg-white border border-border rounded p-5` with `text-3xl font-semibold tabular-nums` for the number
- Hover on clickable card: `hover:border-brand-blue-200 hover:bg-surface-hover`

### Inputs and forms

- Default: `bg-white border border-border rounded px-3 h-10 text-sm text-text-primary outline-none placeholder:text-text-placeholder hover:border-border-strong focus:border-brand-blue-500 focus:ring-2 focus:ring-brand-blue-200`
- Mobile: bump to `h-11`
- Number inputs: **always** use `<NumberInput>` from `src/components/ui/number-input.tsx` — never raw `<input type="number">` (cleared-input bug)
- Custom dropdowns: full `<button>` trigger styled like input, panel `rounded-lg shadow-md`. No native `<select>` per UI Rule. Searchable when options > 5.
- Labels: above field, `text-xs font-medium text-text-secondary mb-1.5`
- Helper text: below field, `text-xs text-text-tertiary mt-1`
- Error text: below field, `text-xs text-status-error-text mt-1`

### Navigation (sidebar)

- Dark `bg-sidebar-bg`, fixed `w-64` on `lg+`, slide-out hamburger on `< lg`
- Logo block at top: `bg-sidebar-logo-bg` with the white Seoul Aqua logo inside, height 64 px
- Group headings: `text-[10px] font-medium uppercase tracking-wider text-sidebar-group-label px-3 pb-2 pt-4`
- Nav item: `flex items-center gap-3 px-3 h-10 rounded text-sm text-sidebar-nav-rest hover:bg-sidebar-nav-hover-bg hover:text-white`. On `< md` → `h-11 min-h-[44px]`.
- Active item: `bg-sidebar-nav-active-bg text-white font-medium`
- User pill at sidebar bottom: avatar + name + role, truncate-on-overflow

### Status chips / badges

Pill, brand-blue or status family.

- Active / success: `bg-status-success-bg text-status-success-text rounded-full px-2.5 py-0.5 text-xs`
- Pending / warning: `bg-status-warning-bg text-status-warning-text rounded-full px-2.5 py-0.5 text-xs`
- Inactive / error: `bg-status-error-bg text-status-error-text rounded-full px-2.5 py-0.5 text-xs`
- Brand badge (e.g., "B2C" / "B2B"): `bg-brand-blue-50 text-brand-blue-700 rounded-full px-2.5 py-0.5 text-xs font-medium`

### Tables

Desktop: standard `<table>` with `bg-surface-sunken` thead, `border-border` row dividers, `hover:bg-surface-hover` on rows.

Mobile (`< md`): **card stack pattern** — `<table className="hidden md:table">` + `<ul className="md:hidden divide-y divide-border">`. Carry forward the PMIS pattern. Carry forward the touch-target rule (44 px CTA inside each card).

### Modals

- Backdrop: `bg-black/40 backdrop-blur-sm`
- Panel: `bg-white rounded-lg shadow-xl max-w-md p-6` (mobile: `max-w-[calc(100vw-2rem)]`)
- Sticky footer for actions: secondary (cancel) left, primary right
- ESC to close, click backdrop to close, focus trap

### Empty states

`text-sm text-text-tertiary italic` placeholder; if actionable, primary button with the create-CTA.

## 5. Layout Principles

### Spacing scale

Base 4 px. Common values: 4, 8, 12, 16, 20, 24, 32, 40, 48 (Tailwind 1, 2, 3, 4, 5, 6, 8, 10, 12). Major sections `space-y-8`; within cards `space-y-3` or `space-y-4`.

### Grid

- Sidebar: fixed 256 px on `lg+`, slide-out on `< lg`
- Content: `p-6` on `lg+`, `p-4` on `< md`
- Max content width: not enforced; pages flow edge-to-edge inside sidebar

### Border radius

- `rounded` (4 px) — buttons, inputs, cards, badges (the Intercom sharpness)
- `rounded-lg` (8 px) — modals, dropdown panels, info-banners
- `rounded-full` — chips, pills, status badges, avatars
- Avoid `rounded-xl`+ except on photographic content (e.g., logo block)

### Border vs shadow

- Borders are the primary structural divider: `border border-border` is the universal hairline
- Shadows are only used for **floating** elements (modals, popovers, sticky bottom bars on mobile). Use brand-blue-tinted shadow: `shadow-[0_4px_12px_rgba(0,113,189,0.08)]`

## 6. Iconography

- **Lucide React** (`lucide-react`) — same as MegaDnC PMIS, proven set
- Default `strokeWidth={1.5}` for calm aesthetic; `strokeWidth={2}` for emphasis (active nav, error indicators)
- Default size `size-4` (16 px) inline, `size-5` (20 px) nav, `size-6` (24 px) page-title

## 7. Motion

- Primary CTA hover: `transform: scale(1.02)` over 150 ms (Intercom signature) — **gated on `prefers-reduced-motion: no-preference`**
- Card hover: 100 ms color transition only, no scale
- Modal enter: 200 ms fade-in + 8 px translate-up
- All other transitions: 150 ms with `ease-out` default
- **No** rotating spinners as primary loading — use skeleton blocks (`bg-surface-sunken animate-pulse rounded`)

## 8. Do's and Don'ts

### Do
- Use `rounded` (4 px) on most interactive controls; `rounded-full` on chips
- Use brand blue **only** for primary actions, links, focus, selected states, sidebar
- Add `tabular-nums` to every number in a column
- Honour `prefers-reduced-motion` (no scale, no fade)
- Touch targets 44 px on `< md`
- Use the existing severity-tint palette only when the surface communicates a state

### Don't
- Don't introduce a second chromatic accent (no green CTAs, no orange highlights — except status colours used for status)
- Don't use big shadows as decoration — only as floating-element depth cue
- Don't use weight 700 — stop at 600
- Don't use native `<select>` / `<dialog>` / `confirm()` / `alert()` — custom only (per CLAUDE.md UI Rule)
- Don't put the brand blue on disabled buttons — use grey
- Don't put the scale-hover on secondary or destructive buttons — only on the brand primary CTA
- Don't use Pretendard for body if a screen is going to render heavy Vietnamese text — Inter handles diacritics more cleanly; let `--font-sans` fall through

## 9. Responsive

| Breakpoint | Width | Sidebar | Tables | Touch targets |
|---|---|---|---|---|
| `sm` | 640 px | Hamburger | Card stack | 44 px |
| `md` | 768 px | Hamburger | Card stack | 44 px |
| `lg` | 1024 px | Fixed 256 px | Table | 36 px desktop OK |
| `xl` | 1280 px | Fixed 256 px | Table | 36 px |
| `2xl` | 1536 px | Fixed 256 px | Table | 36 px |

**Mobile-first screens (technician):** visit-completion, payment-collection, document signing, photo upload, filter-change confirmation. These must be designed phone-first; desktop is a side benefit.

**Desktop-first screens (office):** customer list with filters, contract creation, payment reconciliation, reporting dashboards, scheduled-job admin. Phone usable but cramped is acceptable.

## 10. Accessibility

- All interactive elements have visible focus ring (`focus-visible:ring-2 ring-brand-blue-200 ring-offset-2`)
- All form fields have associated `<label>` (visually or via `aria-label`)
- Colour contrast: brand-blue-500 on white = WCAG AA (4.59:1); brand-blue-500 on canvas-cream = also AA. Text colour scales above meet AA on white.
- Skip-to-content link at the top of every page
- Keyboard: every flow completable without a mouse
- Locale-aware date pickers — `<html lang>` synced to active locale (carry forward PMIS `<LangSyncer>`)

## 11. Brand Voice (UI Copy)

- Be **direct and warm** — "고객 만들기" not "신규 고객 등록 절차 시작". Vietnamese: "Tạo khách hàng". English: "Add customer". Match Intercom's "Fin" voice — calm, capable, slightly friendly.
- Use the customer's name when known. ("안녕하세요, Hương님" / "Hi Hương" / "Xin chào Hương").
- Errors are descriptive, not blamey. ("이 전화번호는 이미 등록되어 있습니다 — 기존 고객 보기" not "Error 409: phone already exists").
- Empty states have personality. ("아직 방문 기록이 없습니다. 첫 방문을 추가해 보세요." not "No data").

## 12. Open Items (for future passes)

- **Dark mode:** deferred to a later phase. The token system supports it (just remap canvas/surface), but field-tech low-light testing should drive when this lands.
- **Marketing site:** if Seoul Aqua wants a customer-facing landing page, the brand blue + warm cream system should extend cleanly with photography. Hold for Phase 8+.
- **Brand-blue accessibility on coloured photography:** if drinking-water photography is used as hero imagery (e.g., for customer-facing portal), check brand-blue overlay contrast per-photo.

## Change log

- **2026-05-25** — v0.1 — Initial design system. Intercom-frame adopted; primary accent set to Seoul Aqua brand blue `#0071BD` (extracted from `reference/brand/Seoul Aqua Logo.jpg`, dominant cluster n=3820). Mirrors MegaDnC PMIS DESIGN.md structure for familiarity but rebuilt content for the warm + tactile feel.
