#!/usr/bin/env bash
set -e

MSG="${1:-chore: update codebase}"
REPO_URL="https://PORTODIT:${GITHUB_TOKEN}@github.com/portodit/LESAVI-SURAMADU.git"

echo "=== Stage semua perubahan ==="
git add -A

echo "=== Commit: $MSG ==="
git -c user.email="bliaditdev@gmail.com" -c user.name="PORTODIT" commit -m "$MSG" --allow-empty

echo "=== Push ke GitHub (branch main) — tanpa remote config ==="
git push "$REPO_URL" HEAD:main

echo ""
echo "✅ Push berhasil! Cek: https://github.com/portodit/LESAVI-SURAMADU"
