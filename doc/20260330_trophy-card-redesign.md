# TrophyCard Redesign — Slide 0 Performance

**Date:** 2026-03-30

## Changes

### File
`apps/dashboard/src/features/performance/PresentationPage.tsx` — `TrophyCard` component (lines 70–130)

### Before
- Title: `text-xs font-black uppercase tracking-widest` (too small)
- Subtitle: plain `text-[10px] font-medium` inline text
- Percentage: `text-3xl font-bold`
- AM name: `text-sm font-bold`
- REAL/TARGET boxes: plain rounded-md with border/20 border, generic bg-background/40

### After
- **Left accent color strip** (`w-1.5` gradient bar) — gold for CM card, blue-indigo for YTD card
- **Title**: `text-[13px] font-black uppercase tracking-wider` — larger and bolder
- **Subtitle**: pill badge — `rounded-full border px-2 py-0.5 text-[10px] font-bold` with scheme-matched bg/border/text colors
- **AM name**: `font-black text-[15px] uppercase tracking-wide` — larger and bolder
- **Percentage**: `text-5xl font-black tabular-nums` — up from `text-3xl font-bold`
- **REAL/TARGET boxes**: scheme-colored `bg/border` with `font-black` labels and values
- **Trophy emoji**: scaled up `text-3xl`
- **Scheme object** extended with `strip`, `badge`, `statBg`, `statLabel` fields per color

## Visual Hierarchy
card → strip → title + badge → name → **giant %** → real/target
