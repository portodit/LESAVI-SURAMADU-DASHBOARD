# ActivityPage KPI Target & Sticky Bleed Fix — 2026-03-30

## Issues
1. **KPI target shows 30 despite setting updated to 25** — The TARGET column and progress bar in ActivityPage always showed 30 regardless of what was saved in Pengaturan > KPI Default.
2. **Sticky bleed in Monitoring KPI Aktivitas section** — Table body rows appeared above the sticky section header on scroll (same gap issue as PerformaPage, already fixed by layout.tsx padding fix in the previous task).

## Root Cause — KPI Target

`ActivityPage.tsx` line 782 (existing AMs with activity data):
```js
// BEFORE (broken):
return { ...existing, activities: acts, kpiTarget: existing.kpiTarget * effectiveMonths };

// existing.kpiTarget comes from API → am.kpiActivity column in DB → DB default = 30
// kpiActivityDefault from settings was NEVER applied to AMs that already had activity data
```

The API at `activity/routes.ts` line 91 calculates: `kpiTarget: am.kpiActivity ?? kpiDefault`.  
The issue: every AM has `kpiActivity = 30` from the DB column default (`.default(30)`), so the `?? kpiDefault` fallback **never fires** — `am.kpiActivity` is always non-null.

Line 784 (AMs without activity) already correctly used `settingsKpi * effectiveMonths`, but line 782 did not.

## Fix

**`artifacts/telkom-am-dashboard/src/features/activity/ActivityPage.tsx` line 782:**
```js
// AFTER (fixed):
return { ...existing, activities: acts, kpiTarget: settingsKpi * effectiveMonths };
```
Now both paths (AM with or without activity data) use `settingsKpi` — the global KPI default from Pengaturan settings. This makes the setting actually take effect everywhere: TARGET column, progress bar percentage, sisa count, and status badge.

## Sticky Bleed
Covered by the layout.tsx fix from the prior task (scroll container `pt-0`, content `pt-4 md:pt-6`). No additional change needed.

## Where to Set KPI
Pengaturan page → "Notifikasi & KPI" section → "KPI Kunjungan Default per AM (per bulan)" input → Save.
