# Funnel Sticky AM Row Fix — PresentationPage Slide 1

**Date:** 2026-03-30  
**File:** `artifacts/telkom-am-dashboard/src/features/performance/PresentationPage.tsx`  
**Function:** `renderAmTablesFS()`

## Problem

When an AM row is expanded in the funnel slide (slide 1, Full-Screen mode), the AM name row was embedded inside the **first phase's `<thead>`** at `position: sticky; top: fsFunnelTheadH`. Subsequent phase tables (F2, F3, etc.) also had their `<thead>` sticky at the **same `top` value**.

As the user scrolled, each phase's `<thead>` (containing only the "DAFTAR PROYEK Fx" row) would stick at `fsFunnelTheadH` and **visually overlap/displace the AM name row**, making the AM name disappear.

## Fix

Restructured the expanded AM rendering in `renderAmTablesFS()`:

1. **Outer wrapper changed** from `<React.Fragment>` → `<div>` so the sticky AM table's position is constrained to only that AM's content block.

2. **AM name row extracted** into its own dedicated sticky `<table>` (with `<tbody>`, not `<thead>`) placed **before** the phase loop:
   - `position: sticky; top: fsFunnelTheadH; zIndex: 16`
   - Box shadow added for visual separation

3. **Phase header `<thead>` offset down**: changed from `top: fsFunnelTheadH` → `top: fsFunnelTheadH + fsFunnelAmRowH; zIndex: 15`
   - `fsFunnelAmRowH` (default 49px, measured via `fsFunnelAmRowRef`) provides the exact gap

4. **AM name row removed** from the `phaseIdx === 0` conditional inside each phase thead (no longer needed there).

## Result

- AM name row always visible at the top while scrolling within any AM's expanded funnel content
- Phase headers ("DAFTAR PROYEK F1", "DAFTAR PROYEK F2", etc.) stack **below** the AM name row
- AM name correctly unsticks when the AM's content block scrolls completely out of view (correct behavior for next AM)
