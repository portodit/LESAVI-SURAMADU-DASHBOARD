# Fix: `month_subs` Import + `DIVISI_OPTIONS` Runtime Error

**Tanggal**: 2026-03-31  
**Commit**: [5edb121](https://github.com/portodit/LESAVI-SURAMADU/commit/5edb12161d0e04e724c6097bd2004ff1f036f38a)

## Masalah

### 1. `month_subs` selalu NULL (4350 baris)
Seluruh baris `sales_funnel` memiliki `month_subs = NULL` meskipun kolom tersebut ada di spreadsheet dengan nilai valid (1, 12, 24, 36, dll).

**Root cause**: `importFunnel` di `gdrive/importer.ts` tidak menyertakan field `monthSubs` maupun `createdDate` dalam mapping `toInsert` — dua field itu tertinggal saat kode awalnya ditulis.

### 2. `DIVISI_OPTIONS is not defined` (runtime error)
`EmbedPerforma` dan `EmbedFunnel` di `PresentationPage.tsx` menggunakan `DIVISI_OPTIONS` tapi yang diimport hanya `DIVISI_OPTIONS_WITH_ALL`.

## Perbaikan

### `gdrive/importer.ts` — tambah `monthSubs` + `createdDate` ke `toInsert`:
```ts
monthSubs: typeof row.monthSubs === "number" && row.monthSubs !== 0
  ? row.monthSubs
  : (row.monthSubs != null && row.monthSubs !== 0
      ? (parseInt(String(row.monthSubs), 10) || null)
      : null),
nikAm: safeStr(am?.nik) || safeStr(row.nikAm) || safeStr(row.nik),
createdDate: safeStr(row.createdDate),
```

### `excel.ts` — tambah fallback nama kolom di `cleanFunnelRows`:
```ts
monthSubs: r.month_subs != null ? ...
  : r["Month Subs"] != null ? ...
  : r.rencana_durasi_kontrak != null ? ...
  : r["Rencana Durasi Kontrak"] != null ? ...
  : null,
```

### `PresentationPage.tsx` — fix import:
```ts
import { matchesDivisiPerforma, DIVISI_OPTIONS, DIVISI_OPTIONS_WITH_ALL, divisiFilterLabel }
  from "@/shared/lib/divisi";
```

## Re-import Data

Setelah fix, snapshot funnel 2026-03 di-re-import dari Google Drive:
- **ImportId**: 11 (ganti 10 yang buggy)
- **Total rows**: 4350
- **Dengan `month_subs`**: 3167 baris (1183 null = memang kosong di source)
- **Distribusi**: 1–120 bulan, paling banyak 12 bulan (2124 baris)

