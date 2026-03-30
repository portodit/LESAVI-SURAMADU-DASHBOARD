# Bugfix: Halaman Import Blank Saat Klik "Cek File di Drive"

**Tanggal ditemukan**: 29 Maret 2026  
**Status**: ✅ Fixed & deployed  
**Commit**: `c9cd146`

---

## Gejala

Di production (`lesa-vi.replit.app`), setiap kali user klik tombol **"Cek File di Drive"** di halaman `/import`, seluruh halaman langsung **blank/putih** — sidebar, header, semua menghilang. Di environment development tidak ada masalah sama sekali.

---

## Penyebab

`CheckSquare2` dan `Square` (dari library `lucide-react`) digunakan di dalam JSX halaman Import untuk menampilkan icon checkbox multi-select file Drive, tetapi **tidak dicantumkan di import statement**.

```tsx
// ❌ Sebelum — hanya ada sampai sini
import {
  ...
  ListChecks, Terminal
} from "lucide-react";

// Tapi dipakai di JSX:
<CheckSquare2 className="w-3.5 h-3.5 text-primary" />  // ← undefined!
<Square className="w-3.5 h-3.5 text-muted-foreground" />  // ← undefined!
```

---

## Kenapa Hanya Terjadi di Production?

| Kondisi | Development | Production |
|---------|-------------|------------|
| Vite build mode | Dev server (HMR, toleran) | Bundle + minify |
| Icon tidak diimport | Diabaikan / warning | `undefined` di runtime |
| React render `<undefined />` | Tidak crash keras | `React.createElement(undefined)` → **throw** |
| Tanpa ErrorBoundary | — | Seluruh React tree unmount = blank page |

Vite **tidak melakukan type-check** saat build — hanya transpile. Jadi TypeScript tidak menangkap error ini dan build tetap berhasil, tapi runtime di production crash.

---

## Solusi

Tambahkan `CheckSquare2` dan `Square` ke import di `ImportPage.tsx`:

```tsx
// ✅ Sesudah
import {
  ...
  ListChecks, Terminal, CheckSquare2, Square
} from "lucide-react";
```

**File**: `artifacts/telkom-am-dashboard/src/features/import/ImportPage.tsx` baris 18

---

## Pelajaran

Setiap kali ada **halaman yang blank di production tapi normal di development**, langkah diagnosis pertama:

1. Cek deployment logs untuk request error (400/500)
2. Cari komponen/icon yang **dipakai di JSX tapi tidak diimport**
3. Tambahkan **ErrorBoundary** di level App agar blank page tidak terjadi lagi

### Cara Cepat Cek Missing Import
```bash
grep -n "CheckSquare2\|Square\|SomeIcon" src/features/SomePage.tsx
grep -n "import.*lucide" src/features/SomePage.tsx
```
Bandingkan — jika nama icon ada di JSX tapi tidak ada di import block, itu bug.

---

## File yang Diubah

- `artifacts/telkom-am-dashboard/src/features/import/ImportPage.tsx`
