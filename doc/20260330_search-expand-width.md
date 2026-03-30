# Search Bar — Expand Width + All-Keyword Search

**Date:** 2026-03-30  
**Files changed:**
- `artifacts/telkom-am-dashboard/src/features/funnel/FunnelPage.tsx`
- `artifacts/telkom-am-dashboard/src/features/performance/PerformaPage.tsx`
- `artifacts/telkom-am-dashboard/src/features/performance/PresentationPage.tsx`

---

## Changes per page

### Sales Funnel (`/funnel` + `/presentation` slide 1)

| | Before | After |
|---|---|---|
| Width (main bar) | `w-60` / `w-48` | `w-80` / `w-72` |
| Width (per-group bar) | `w-36` / `w-32` | `w-52` / `w-52` |
| Placeholder | "Cari proyek / pelanggan / LOP ID…" | "Cari AM, LOP ID, proyek, pelanggan, kategori…" |
| Search fields | `judulProyek, pelanggan, lopid, namaAm` | + `kategoriKontrak, divisi, segmen, nikAm` |

### Sales Activity (`/presentation` slide 2 + ActivityPage)

| | Before | After |
|---|---|---|
| Width | `min-w-[140px]` | `min-w-[220px]` |
| Placeholder | "Cari nama AM…" | "Cari AM, tipe, label, pelanggan, catatan…" |
| Search fields (slide 2) | AM nama only | + `activityType, label, caName, activityNotes, picName` |
| Search fields (ActivityPage) | Already comprehensive | No change needed |

### AM Performance (`/performance` + `/presentation` slide 0)

| | Before | After |
|---|---|---|
| Width | `w-52` | `w-72` |
| Placeholder | "Cari AM atau pelanggan…" | "Cari AM, NIK, divisi, pelanggan, NIP…" |
| Search fields | `namaAm, namaCustomer` | + `nik, divisi, customer NIP` |

---

## Search expansion logic notes

- The funnel `search` state is shared between the main toolbar and each per-divisi group toolbar — expanding the haystack in `filteredLops` automatically applies to both.
- The activity slide filter now mirrors ActivityPage: if AM name matches OR any activity matches, the AM row is shown.
- The performance filter now also expands when search matches customer NIP.
