# Presentation Slide 2: Revert Sales Funnel Table ke Struktur Semula

**Date**: 2026-03-30  
**Task**: Kembalikan tabel Sales Funnel di slide 2 (/presentation) ke tampilan sebelumnya, sambil mempertahankan update gauge state cards dan filter section

## Root Cause

Lima commit sebelumnya (`e8a2e8c` → `e017232`) mengganti struktur tabel Sales Funnel dari **per-fase tables** ke **per-AM tables** dengan perubahan berikut:
1. Ref measurement diganti dari `fsFunnelAmRowRef` ke `fsFunnelToolbarRef`
2. Menghapus independent scroll container (`overflow-auto` + `maxHeight`)  
3. `renderAmTablesFS` ditulis ulang menjadi 1 tabel per AM (AM row di `<thead>`, fase di `<tbody>`)
4. Border AM expanded diganti dari slate ke merah (#dc2626)
5. Sticky column header `top` berubah mengikuti toolbar height (`fsFunnelToolbarH`)

Akibatnya tabel kehilangan contained scroll, AM/fase rows tidak lagi sticky dengan benar di dalam scroll box, dan tampilan visual berubah signifikan.

## Fix

**File**: `artifacts/telkom-am-dashboard/src/features/performance/PresentationPage.tsx`

Empat perubahan dikembalikan:

1. **Ref measurement** — `fsFunnelToolbarRef`/`fsFunnelToolbarH`/`amTheadHeights` dihapus, `fsFunnelAmRowRef`/`fsFunnelAmRowH` dikembalikan
2. **renderAmTablesFS** — dikembalikan ke per-fase tables: collapsed AM = 1 tabel, expanded AM = N tabel per fase (masing-masing dengan 2-baris `<thead>` sticky: AM row + fase row)  
3. **Table scroll container** — dikembalikan ke `overflow-auto` + `maxHeight:"calc(100svh - 210px)"` agar tabel punya scroll box sendiri
4. **Column header sticky** — `top` dikembalikan ke `0` (relatif terhadap scroll box tabel, bukan page)

## Yang Dipertahankan

- Gauge state cards di FunnelSlide tidak disentuh
- Filter section (navbarFilterBar + split view panel) tidak disentuh
- Semua perubahan di slide lain tidak disentuh
