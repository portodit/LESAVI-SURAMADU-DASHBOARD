# Fix: Corporate Customer Sub-table Memenuhi Lebar Penuh

**Tanggal**: 2026-03-31  
**Commit**: [1a7f60b](https://github.com/portodit/LESAVI-SURAMADU/commit/1a7f60b08ff2814e5428045bd94ee7d94d21c9df)

## Masalah

Di slide Performa AM (`/presentasi` slide 1), saat baris AM di-expand muncul list corporate customer. Kolom detail customer (#, PELANGGAN/NIP, DIVISI, TARGET, REAL, ACH%, PROPORSI) berhenti di kolom PROPORSI dan ada ruang kosong besar di sisi kanan.

**Root cause**: Customer sub-table menggunakan `PerfColGroup` (8 kolom). Header dan data rows berakhir dengan `<th colSpan={2} />` / `<td colSpan={2} />` yang menyebabkan kolom PROPORSI tidak mengisi sisa ruang. Dengan tabel layout fixed dan `width: 100%`, `colSpan={2}` hanya mengambil 1-2 kolom yang sudah di-define, sisanya kosong.

## Perbaikan

Hapus `<th colSpan={2}/>` dan `<td colSpan={2}/>`, ganti dengan `colSpan` dinamis pada kolom **Proporsi**:

```tsx
// Header
<th colSpan={filterDivisi === "LESA" ? 2 : 3}>Proporsi</th>

// Data rows
<td colSpan={filterDivisi === "LESA" ? 2 : 3}>
  {/* progress bar + persen */}
</td>
```

**Logika colSpan**:
- `filterDivisi === "LESA"` (kolom Divisi tampil): 7 kolom dipakai → Proporsi colSpan=**2** (mengisi col 7-8)  
- Filter divisi spesifik (tanpa kolom Divisi): 6 kolom dipakai → Proporsi colSpan=**3** (mengisi col 6-7-8)

Total kolom selalu = 8 = lebar penuh tabel.
