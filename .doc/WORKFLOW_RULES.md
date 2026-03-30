# Workflow Rules — LESAVI SURAMADU (Ringkasan Cepat)

> Untuk panduan lengkap → baca **[PROJECT_BRIEF.md](./PROJECT_BRIEF.md)**

---

## Repo GitHub (SATU-SATUNYA)

```
https://github.com/portodit/LESAVI-SURAMADU.git
branch: master | user: PORTODIT | token: env GITHUB_TOKEN
```

> Hanya repo ini. Tidak ada repo lain.

---

## Aturan Wajib Setiap Task Selesai

### 1. Push ke GitHub — WAJIB, langsung dikerjakan agent
```bash
# Push file spesifik (cepat 2–5 detik) ← selalu gunakan ini
node push-to-github.mjs "tipe: deskripsi" file1 file2 ...

# Push semua file berubah (jika tidak tahu file mana)
node push-to-github.mjs "tipe: deskripsi"
```

Format commit: `feat:` / `fix:` / `refactor:` / `docs:` / `chore:`

### 2. Suggest Redeploy — jika perubahan berdampak ke production
### 3. Update `replit.md` — jika ada perubahan arsitektur/fitur/dependency
### 4. Update `.doc/` — jika ada bugfix penting atau perubahan workflow

---

## Kenapa Git CLI Tidak Bisa?

Platform Replit **memblokir semua git command** (`git add`, `git commit`, `git push`, dll.) dari main agent. Solusinya: `push-to-github.mjs` yang push via **GitHub REST API** langsung — tidak menyentuh `.git` folder sama sekali.

Detail lengkap → [GITHUB_PUSH_GUIDE.md](./GITHUB_PUSH_GUIDE.md)

---

## Kredensial Cepat

| Item | Nilai |
|------|-------|
| Login NIK | `160203` / password `admin123` |
| Frontend port | `24930` · API port `8080` |
| GitHub repo | `https://github.com/portodit/LESAVI-SURAMADU.git` |
| Branch | `master` |
| Production | `https://lesa-vi.replit.app` |

---

## Dokumen di `.doc/`

| File | Isi |
|------|-----|
| **`PROJECT_BRIEF.md`** | **Master doc — baca ini dulu** |
| `GITHUB_PUSH_GUIDE.md` | Teknis push via REST API |
| `BUGFIX_BLANK_PAGE_IMPORT.md` | Brief bugfix blank page Import |
| `CHATBOT.md` | Panduan chatbot |
