# Filter Status Aktif AM — Integrasi dengan Visualisasi Data

**Tanggal:** 2026-03-31

## Latar Belakang

Dashboard memiliki fitur toggle aktif/nonaktif per AM di halaman Manajemen Akun (`/manajemen-akun`). Namun sebelumnya:
1. Toggle tersebut juga muncul pada baris OFFICER dan MANAGER, padahal kedua role ini **tidak pernah muncul** di data Performa AM, Sales Funnel, dan Sales Activity.
2. Visualisasi data (`/presentation` dan dashboard) **tidak menghormati status aktif** — AM yang dinonaktifkan tetap muncul di semua tampilan.

## Aturan Sistem (setelah perbaikan ini)

> Sistem **tidak menyajikan semua AM dari master data**, melainkan hanya menampilkan AM yang:
> - Memiliki `role = "AM"` (bukan OFFICER/MANAGER)
> - Memiliki `aktif = true`

Role OFFICER dan MANAGER tidak relevan untuk visualisasi karena mereka tidak memiliki LOP, performance data, maupun aktivitas lapangan.

## Perubahan

### 1. API: `/api/public/am`
**File:** `artifacts/api-server/src/features/performance/publicRoutes.ts`

**Sebelum:** Mengembalikan SEMUA anggota dari database tanpa filter.

**Sesudah:** Hanya mengembalikan `aktif=true && role="AM"`.

Digunakan oleh `PresentationLoginPage.tsx` untuk menampilkan daftar AM yang dapat dipilih saat login ke halaman presentasi.

### 2. API: `/api/public/performance`
**File:** `artifacts/api-server/src/features/performance/publicRoutes.ts`

**Sebelum:** Mengembalikan semua performance data dari snapshot yang dipilih, termasuk data AM yang sudah dinonaktifkan.

**Sesudah:**
- Ambil set NIK aktif dari `accountManagersTable` (`aktif=true && role="AM"`)
- Filter performance data: hanya baris yang `nik`-nya ada di set aktif yang dikembalikan ke frontend

Ini memperbaiki tampilan "13 AM" di pie chart Distribusi Pencapaian Target — sekarang hanya menampilkan AM yang aktif.

### 3. API: `/api/public/funnel`
**File:** `artifacts/api-server/src/features/funnel/publicRoutes.ts`

Sudah benar sejak sebelumnya — LOPs difilter dengan `activeNikSet` (aktif=true && role=AM) di baris:
```ts
allLops = allLops.filter(l => l.nikAm && activeNikSet.has(l.nikAm));
```

### 4. API: `/api/public/activity`
**File:** `artifacts/api-server/src/features/activity/publicRoutes.ts`

Sudah benar sejak sebelumnya:
```ts
const registeredAms = ams.filter(a => a.aktif && a.role === "AM");
```

### 5. Frontend: Manajemen Akun — toggle status
**File:** `artifacts/telkom-am-dashboard/src/features/am/ManajemenAmPage.tsx`

**Sebelum:** Kolom "Status Aktif" menampilkan toggle (atau teks Aktif/Nonaktif) untuk **semua** role termasuk OFFICER dan MANAGER.

**Sesudah:** Kolom "Status Aktif" hanya tampil untuk role `AM`. Baris OFFICER dan MANAGER menampilkan `—` di kolom tersebut, karena:
- Officer dan Manager tidak muncul di halaman Performa AM, Sales Funnel, dan Sales Activity
- Status aktif mereka tidak berpengaruh pada visualisasi manapun

## Alur Lengkap

```
Manajemen Akun (/manajemen-akun)
  └── Toggle aktif/nonaktif (hanya untuk role=AM)
        ↓ ubah field `aktif` di DB
        ↓
API Backend (filter aktif=true && role=AM)
  ├── /api/public/am          → daftar AM untuk login presentasi
  ├── /api/public/performance → data performa (pie chart, tabel)
  ├── /api/public/funnel      → data LOP (sudah benar sebelumnya)
  └── /api/public/activity    → data aktivitas (sudah benar sebelumnya)
        ↓
Frontend (hanya tampilkan AM aktif)
  ├── PerformanceSlide → jumlah AM sesuai yang aktif
  ├── FunnelSlide      → LOP hanya dari AM aktif
  └── ActivitySlide    → aktivitas hanya dari AM aktif
```
