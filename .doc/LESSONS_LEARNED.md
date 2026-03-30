# Lessons Learned — Kesalahan Agent Tanpa Brief

> Dokumen ini mencatat kesalahan nyata yang pernah terjadi akibat **tidak adanya dokumentasi** di folder `.doc/` sebelum agent memulai kerja. Tujuannya agar kesalahan yang sama tidak terulang.

---

## 1. Push ke Folder `artifacts/` di GitHub (Salah Path)

**Tanggal**: 29 Maret 2026  
**Dampak**: Folder baru `artifacts/` muncul di repo GitHub yang seharusnya tidak ada  
**Commit cleanup**: `4aca7752`

### Apa yang terjadi?
Agent meng-upload file perubahan langsung menggunakan path lokal Replit (`artifacts/telkom-am-dashboard/...`) ke GitHub, tanpa tahu bahwa struktur folder GitHub **berbeda** dengan struktur Replit.

Akibatnya, GitHub punya dua versi file yang sama:
- `apps/dashboard/src/features/import/ImportPage.tsx` ← benar (lama)
- `artifacts/telkom-am-dashboard/src/features/import/ImportPage.tsx` ← **salah (baru)**

### Kenapa bisa terjadi?
Tidak ada brief yang menjelaskan bahwa:
- Replit menyebut folder proyek sebagai `artifacts/`
- GitHub repo menyebutnya `apps/`
- Mapping ini harus dilakukan secara eksplisit

### Perbaikan yang dilakukan
1. Script `push-to-github.mjs` diupdate dengan fungsi `remapPath()` yang otomatis:
   - `artifacts/api-server/` → `apps/api/`
   - `artifacts/telkom-am-dashboard/` → `apps/dashboard/`
   - `lib/` → `packages/`
2. File yang salah dihapus dari GitHub via Tree API (`sha: null`)
3. Aturan path mapping dicatat di `PROJECT_BRIEF.md`

### Aturan sekarang
> Selalu gunakan `push-to-github.mjs` — jangan pernah push manual dengan path `artifacts/` atau `lib/` langsung.

---

## 2. Blank Page di Production (Missing Import)

**Tanggal**: 29 Maret 2026  
**Dampak**: Halaman `/import` blank sepenuhnya di production  
**Detail**: lihat [BUGFIX_BLANK_PAGE_IMPORT.md](./BUGFIX_BLANK_PAGE_IMPORT.md)

### Apa yang terjadi?
Icon `CheckSquare2` dan `Square` dipakai di JSX tapi tidak ada di import statement. Di development (Vite HMR) tidak crash, tapi di production bundle React throw error → seluruh tree unmount → halaman blank.

### Kenapa bisa terjadi?
Tidak ada brief yang menjelaskan bahwa production menggunakan bundler yang lebih strict dan **TypeScript tidak type-check saat build**. Agent tidak sadar bahwa missing import yang "aman" di dev bisa fatal di production.

### Pelajaran
- Setiap kali ada halaman blank di production → curiga missing import dulu
- Cek: `grep -n "NamaIcon" file.tsx` vs `grep -n "import.*lucide" file.tsx`

---

## Checklist yang Harus Ada di `.doc/` Sebelum Agent Mulai Kerja

Tanpa dokumen-dokumen berikut, agent **sangat mungkin** membuat kesalahan:

| Dokumen | Kenapa Penting |
|---------|----------------|
| `PROJECT_BRIEF.md` | Identitas proyek, repo, branch, mapping folder |
| `WORKFLOW_RULES.md` | Cara push, format commit, aturan deploy |
| `GITHUB_PUSH_GUIDE.md` | Kenapa git CLI tidak bisa, cara kerja REST API push |

### Risiko Tanpa Brief

| Tanpa Brief Ini | Kemungkinan Kesalahan |
|----------------|----------------------|
| Tanpa `PROJECT_BRIEF.md` | Push ke repo salah, branch salah, path folder salah |
| Tanpa path mapping | File masuk ke folder yang tidak ada di struktur repo asli |
| Tanpa workflow rules | Lupa push setelah task, commit message tidak konsisten |
| Tanpa deployment info | Tidak sadar perubahan perlu redeploy, debug di dev padahal bug di prod |
