# TypeSprout UI Guidelines

## Design Principles
- Friendly, minimal, distraction-free typing experience
- Large touch targets (≥ 44×44px), readable fonts, high contrast
- Respect prefers-reduced-motion; subtle animations only

## Color Tokens
- primary: #16a34a (green-600)
- secondary: #0ea5e9 (sky-500)
- accent: #f97316 (orange-500)
- success: #16a34a
- warning: #f59e0b
- danger: #ef4444
- surface: #ffffff / foreground: #111827
- muted: #6b7280
- border: #e5e7eb

## Radius & Elevation
- radius: sm=8, md=12, lg=16
- elevation.card: 0 1px 2px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04)

## Focus & Accessibility
- focus ring: 2px solid #38bdf8
- keyboard accessible; aria-live for realtime feedback

## Components
### Button
- Sizes: sm/md/lg; radius md=12
- Primary: bg primary, text white; hover: 4% darker; disabled: 50% opacity
- Outline: border primary; text primary; hover: bg primary/5%

### Card
- Padding 16–24; elevation.card; radius 12; border 1px

### Field
- Height 44px; radius 12; border; focus ring; label above, help text below

## Layout
- Mobile-first; content max-width 960px centered; spacing 8/12/16/24

## Typing Area
- Mono or semi-mono font optional; caret visible; error highlights unobtrusive

## Garden View
- SVG/Canvas; gentle sway; progress bar with stages; color-blind friendly palette
