# Database Seeder — LESA VI Witel Suramadu

Dokumen ini menjelaskan semua seeder yang tersedia, isi datanya, dan cara menjalankannya.

---

## Gambaran Umum

Seeder adalah script yang mengisi database dengan data awal. Seeder LESA VI terbagi dalam **5 modul** sesuai domain data:

| Modul | Tabel | Jumlah Data | Sumber |
|---|---|---|---|
| `accounts` | `account_managers`, `admin_users` | 13 AM + 1 Manager + 1 Officer + 1 Admin | Hard-coded |
| `funnel-targets` | `sales_funnel_target` | 2 target (DPS + DSS 2026) | Hard-coded |
| `performance` | `performance_data` | 132 record (snapshot Mar 2026) | `data/performance.json` |
| `activity` | `sales_activity` | 719 record (snapshot Mar 2026) | `data/activity.json` |
| `funnel` | `sales_funnel` | 8.696 LoP (snapshot Mar 2026) | `data/funnel.json` |

---

## Struktur File

```
artifacts/api-server/
├── build-seeds.mjs               # Build script untuk mengkompilasi seeder
├── src/
│   └── seeds/
│       ├── index.ts              # Entry point utama (runner semua modul)
│       ├── seed-accounts.ts      # Seeder akun (AM, Manager, Officer, Admin)
│       ├── seed-funnel-targets.ts # Seeder target Sales Funnel
│       ├── seed-performance.ts   # Seeder data Performa AM
│       ├── seed-activity.ts      # Seeder data Sales Activity
│       ├── seed-funnel.ts        # Seeder data Sales Funnel
│       └── data/
│           ├── performance.json  # Snapshot performance_data (132 baris)
│           ├── activity.json     # Snapshot sales_activity (719 baris)
│           └── funnel.json       # Snapshot sales_funnel (8.696 baris)
└── dist-seeds/                   # Output build (generated, jangan diedit)
```

---

## Cara Menjalankan Seeder

Semua perintah dijalankan dari **root folder project**.

### 1. Seed semua data (aman, skip duplikat)

```bash
pnpm --filter @workspace/api-server run seed
```

Menjalankan semua modul secara berurutan. Data yang sudah ada **tidak akan dihapus** (skip duplikat berdasarkan unique key). Gunakan ini untuk:
- Setup environment baru
- Mengisi data yang mungkin belum ada

### 2. Seed semua data dengan reset (hapus dulu)

```bash
pnpm --filter @workspace/api-server run seed:truncate
```

**Perhatian:** Perintah ini akan **menghapus semua data** di tabel target sebelum mengisi ulang. Gunakan hanya jika ingin reset penuh ke kondisi snapshot.

### 3. Seed per modul

```bash
# Hanya akun (AM, Manager, Officer, Admin)
pnpm --filter @workspace/api-server run seed:accounts

# Hanya target Sales Funnel
pnpm --filter @workspace/api-server run seed:funnel-targets

# Hanya data Performa AM
pnpm --filter @workspace/api-server run seed:performance

# Hanya data Sales Activity
pnpm --filter @workspace/api-server run seed:activity

# Hanya data Sales Funnel (LoP)
pnpm --filter @workspace/api-server run seed:funnel
```

### 4. Truncate + seed modul tertentu

Tambahkan argumen `--truncate` langsung setelah build:

```bash
pnpm --filter @workspace/api-server run seed:build
node artifacts/api-server/dist-seeds/index.mjs activity --truncate
```

---

## Detail Setiap Modul

### `accounts` — Akun Pengguna

**File:** `src/seeds/seed-accounts.ts`

Mengisi dua tabel:

**`account_managers`** — 15 baris:
- 13 Account Manager (tipe LESA: DPS & DSS)
- 1 Manager (NIK 850099 — Reni Wulansari)
- 1 Officer (NIK 160203 — Admin Officer, login via email)

> Password Officer disimpan dalam bentuk bcrypt hash. Login menggunakan email `bliaditdev@gmail.com`.

**`admin_users`** — 1 baris:
- Admin sistem (email `bliaditdev@gmail.com`)

Strategi konflik: `onConflictDoUpdate` berdasarkan `nik` (upsert). Jika NIK sudah ada, field utama (nama, divisi, aktif) diperbarui.

---

### `funnel-targets` — Target Sales Funnel

**File:** `src/seeds/seed-funnel-targets.ts`

Target penerimaan revenue tahunan 2026 per divisi:

| Divisi | Target Full HO | Target HO |
|---|---|---|
| DPS | Rp 97.076.000.000 | Rp 70.257.000.000 |
| DSS | Rp 73.780.000.000 | Rp 60.048.000.000 |

Strategi: skip jika data sudah ada (kecuali `--truncate`).

---

### `performance` — Data Performa AM

**File:** `src/seeds/seed-performance.ts`  
**Data:** `src/seeds/data/performance.json`

- 132 record dari tabel `performance_data`
- Snapshot: Maret 2026
- Divisi: DES (data legacy; dashboard memetakan DES → DPS+DSS menggunakan `matchesDivisiPerforma`)
- Field: target/real per komponen (reguler, sustain, scaling, NGTMA), ach_rate, rank, dll.
- Insert dilakukan dalam batch 50 baris

---

### `activity` — Data Sales Activity

**File:** `src/seeds/seed-activity.ts`  
**Data:** `src/seeds/data/activity.json`

- 719 record dari tabel `sales_activity`
- Snapshot: Maret 2026
- Field: NIK AM, nama pelanggan (ca_name), jenis aktivitas, tanggal, PIC, catatan, dll.
- Unik berdasarkan `(nik, createdat_activity)` — duplikat di-skip otomatis (`onConflictDoNothing`)
- Insert dilakukan dalam batch 100 baris

---

### `funnel` — Data Sales Funnel (LoP)

**File:** `src/seeds/seed-funnel.ts`  
**Data:** `src/seeds/data/funnel.json`

- 8.696 record dari tabel `sales_funnel`
- Snapshot: Maret 2026
- Field: lopid, judul proyek, pelanggan, nilai proyek, divisi, status funnel (F1–F5), proses, AM yang handle, dll.
- Insert dilakukan dalam batch 200 baris
- Karena tidak ada unique constraint pada lopid, gunakan `--truncate` untuk menghindari duplikasi jika dijalankan ulang

---

## Memperbarui Data Seed

Jika ingin mengeksport ulang data terbaru dari database ke file JSON seed, jalankan dari root project:

```bash
# Export performance_data
psql "$DATABASE_URL" -t -c "SELECT json_agg(row_to_json(t)) FROM (SELECT nik, nama_am, divisi, witel_am, level_am, tahun, bulan, target_revenue, real_revenue, target_reguler, real_reguler, target_sustain, real_sustain, target_scaling, real_scaling, target_ngtma, real_ngtma, ach_rate, ach_rate_ytd, rank_ach, status_warna, komponen_detail, snapshot_date FROM performance_data ORDER BY tahun, bulan, nik) t;" > artifacts/api-server/src/seeds/data/performance.json

# Export sales_funnel
psql "$DATABASE_URL" -t -c "SELECT json_agg(row_to_json(t)) FROM (SELECT lopid, judul_proyek, pelanggan, nilai_proyek, divisi, segmen, witel, status_f, proses, status_proyek, kategori_kontrak, estimate_bulan, nama_am, nik_am, report_date, created_date, snapshot_date FROM sales_funnel ORDER BY snapshot_date, lopid) t;" > artifacts/api-server/src/seeds/data/funnel.json
```

Untuk `activity.json`, gunakan psql COPY + sanitasi karakter khusus (lihat catatan teknis di bawah).

---

## Catatan Teknis

- Seeder menggunakan **Drizzle ORM** yang sama dengan API server, sehingga type-safe dan konsisten dengan schema.
- Data JSON di folder `data/` adalah snapshot per **Maret 2026**. Data ini tidak otomatis terupdate; harus dieksport ulang secara manual.
- `activity.json` mungkin mengandung karakter backslash (`\`) di field `pic_phone` yang perlu sanitasi saat export ulang via psql.
- `sales_funnel` tidak memiliki unique constraint pada `lopid`, sehingga menjalankan seeder berulang **tanpa** `--truncate` akan menghasilkan duplikasi data. Selalu gunakan `--truncate` jika ingin reset ulang.
- Seeder dijalankan secara **sekuensial** (satu per satu), bukan paralel, untuk menghindari deadlock.
- Build output ada di `dist-seeds/` dan tidak perlu dicommit ke git (sudah ada di `.gitignore`).
