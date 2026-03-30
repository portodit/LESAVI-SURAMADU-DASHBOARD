# ActivityPage: KPI Target Cache Key Fix

**Date**: 2026-03-30  
**Task**: Fix ActivityPage showing stale KPI target after user updates it in Pengaturan  

## Root Cause

ActivityPage fetched settings using `queryKey: ["settings-kpi"]` while PengaturanPage saves settings and invalidates `queryKey: ["settings"]`. These were two different React Query cache keys, so changes made in Pengaturan never propagated to ActivityPage — it held onto its own stale cached value (30) indefinitely (staleTime: 300,000ms = 5 minutes).

## Fix

**File**: `artifacts/telkom-am-dashboard/src/features/activity/ActivityPage.tsx`

- Changed `queryKey: ["settings-kpi"]` → `queryKey: ["settings"]`
- Changed `staleTime: 300_000` → `staleTime: 0`

Both pages now share the same cache entry. When PengaturanPage calls `qc.invalidateQueries({ queryKey: ["settings"] })` after saving, ActivityPage automatically refetches and picks up the new `kpiActivityDefault` value.

## Scroll Bleed (ActivityPage)

The scroll bleed on ActivityPage sticky header ("Monitoring KPI Aktivitas") was already resolved by the prior `layout.tsx` fix that removed the `y: 6` transform from the page entrance animation. The sticky header itself already had `bg-card` (fully opaque background).
