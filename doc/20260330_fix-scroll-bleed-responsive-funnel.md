# Brief: Fix Scroll Bleed + Responsive FunnelSectionCard

**Tanggal:** 30 Maret 2026  
**Commit:** `671eae2d137c7d4d8febd6f088af8b5c5659e480`  
**File yang diubah:**
- `artifacts/telkom-am-dashboard/src/features/performance/PerformaPage.tsx`
- `artifacts/telkom-am-dashboard/src/features/performance/FunnelSectionCard.tsx`

---

## 1. Bug — Konten Tabel Menembus Sticky Header saat Scroll (Desktop)

### Masalah
Di halaman `/visualisasi/performa`, ketika pengguna scroll ke bawah pada tabel AM Performance Report, baris-baris tabel terlihat "menembus" atau muncul di balik sticky section header. Efek ini sangat terlihat di desktop dengan tabel panjang.

### Root Cause
Dua sticky element di PerformaPage menggunakan background semi-transparan:

| Element | Kelas lama |
|---|---|
| Section header (judul + search bar) | `sticky top-0 z-20 bg-card/95 backdrop-blur-sm` |
| Column header (NAMA AM, TARGET, dst.) | `sticky z-10` *(tanpa background)* |

- `bg-card/95` = opasitas 95% → konten tabel tetap tembus 5%
- `backdrop-blur-sm` memperparah efek karena blur justru membuat konten "kelihatan" (blur bikin background bening + efek kaca)
- Column header sticky tidak memiliki `bg-card` sama sekali → transparan penuh

### Solusi
```diff
- className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm px-4 py-3 ..."
+ className="sticky top-0 z-20 bg-card px-4 py-3 ..."

- className="overflow-x-hidden ... sticky z-10"
+ className="overflow-x-hidden ... sticky z-10 bg-card"
```
Background sekarang `bg-card` penuh (opasitas 100%), tidak ada efek blur.

---

## 2. Bug — FunnelSectionCard: Sticky Header Tidak Berfungsi dalam `overflow-x-auto`

### Masalah
FunnelSectionCard memiliki sticky column header yang dibungkus dalam `overflow-x-auto`. Ini adalah pola CSS yang tidak bisa bekerja:

> Elemen `position: sticky` tidak bisa "stick" ke viewport jika berada di dalam ancestor yang memiliki `overflow-x: auto`/`scroll`. Container overflow menciptakan scroll context baru, sehingga sticky hanya bekerja relatif terhadap container tersebut, bukan viewport halaman.

Akibatnya:
- Column header tidak benar-benar sticky saat scroll vertikal
- `bg-card/95` pada header menyebabkan konten tembus (sama seperti isu #1)
- Bisa muncul glitch visual pada beberapa browser

### Solusi
Restrukturisasi layout:

**Sebelum (struktur bermasalah):**
```html
<div class="overflow-x-auto">
  <div class="sticky top-0 z-20 bg-card/95">  <!-- BROKEN: sticky inside overflow -->
    <table><!-- column header --></table>
  </div>
  <div class="space-y-px"><!-- AM tables --></div>
</div>
```

**Sesudah (struktur bersih):**
```html
<div class="overflow-x-auto">
  <div style="min-width: 860px">
    <table><!-- column header, bukan sticky --></table>
    <div class="space-y-px"><!-- AM tables --></div>
  </div>
</div>
```

Column header kini menjadi bagian dari konten yang scroll secara horizontal bersama tabel AM. Tidak ada sticky di dalam overflow container, tidak ada z-index konflik, tidak ada glitch.

---

## Dampak Responsivitas

| Skenario | Sebelum | Sesudah |
|---|---|---|
| Desktop scroll — header bleed | ❌ Tembus | ✅ Solid |
| Desktop scroll — funnel header | ⚠️ Sticky broken | ✅ Terintegrasi |
| Mobile horizontal scroll funnel | ⚠️ Glitch sticky | ✅ Scroll mulus |
| Tablet / iPad performa tabel | ⚠️ Header tembus | ✅ Solid |

---

## Ringkasan Perubahan

| # | File | Perubahan |
|---|---|---|
| 1 | `PerformaPage.tsx` | `bg-card/95 backdrop-blur-sm` → `bg-card` pada section header |
| 2 | `PerformaPage.tsx` | Tambah `bg-card` pada column header sticky div |
| 3 | `FunnelSectionCard.tsx` | Hapus `sticky top-0 z-20 bg-card/95 backdrop-blur-sm` wrapper |
| 4 | `FunnelSectionCard.tsx` | Column header jadi bagian dari `overflow-x-auto` wrapper tunggal |
