# Setup Dashboard Preview Artifact — 2026-03-31

## Request
Dashboard LESAVI tidak muncul di preview pane Replit — yang tampil adalah Canvas (mockup-sandbox). Perlu setup artifact registration agar frontend dashboard bisa dipreview.

## Root Cause

Dashboard `artifacts/telkom-am-dashboard/` sudah ada di filesystem tapi belum terdaftar sebagai artifact Replit. Tanpa registrasi artifact, Replit tidak tahu cara menjalankan atau mempreviewa folder tersebut.

Artifact yang terdaftar sebelumnya:
- Canvas (mockup-sandbox) — kind: design, preview path: `/__mockup`
- API Server — kind: api, preview path: `/api`

Dashboard tidak ada dalam daftar.

## Solusi

### 1. Backup kode LESAVI
Karena `createArtifact` gagal jika folder sudah ada, kode LESAVI di-backup dulu ke `/tmp/lesavi-dashboard-backup/`.

### 2. Daftarkan artifact
```javascript
createArtifact({
    artifactType: "react-vite",
    slug: "telkom-am-dashboard", 
    previewPath: "/",
    title: "LESAVI Dashboard"
})
// Result: port 24930 dialokasikan
```

Artifact.toml yang dihasilkan:
```toml
kind = "web"
previewPath = "/"
title = "LESAVI Dashboard"
localPort = 24930
BASE_PATH = "/"
PORT = "24930"
```

### 3. Restore kode LESAVI
Kode dari backup dikopi kembali ke `artifacts/telkom-am-dashboard/`, sementara `artifact.toml` yang baru dari langkah 2 dipertahankan.

### 4. pnpm install & Start workflow
```bash
pnpm install
# workflow "artifacts/telkom-am-dashboard: web" distart
```

## Hasil

Dashboard berhasil berjalan:
```
VITE v7.3.1 ready in 270ms
Local: http://localhost:24930/
```

API Server juga aktif menangani request:
```
GET /api/auth/me → 401 (expected — user belum login)
```

Semua 3 workflow running:
| Workflow | Port | Status |
|---|---|---|
| API Server | 8080 | ✓ Running |
| Dashboard | 24930 | ✓ Running |
| Mockup Canvas | 8081 | ✓ Running |

Dashboard sekarang muncul sebagai preview utama di Replit (previewPath = `/`).

## Catatan Teknis
- `verifyAndReplaceArtifactToml` tidak bisa dipakai untuk membuat artifact baru (hanya update yang sudah ada)
- Solusinya: backup kode → hapus folder → createArtifact → restore kode → pertahankan artifact.toml
- Port 24930 dialokasikan otomatis oleh sistem Replit
