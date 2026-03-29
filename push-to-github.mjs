#!/usr/bin/env node
// Push ke GitHub via REST API
// Mode 1: node push-to-github.mjs "pesan" file1 file2 ...  → push file spesifik
// Mode 2: node push-to-github.mjs "pesan"                  → push SEMUA file berubah (diff)
// Mode 3: CHANGED_ONLY=1 node push-to-github.mjs "pesan"  → hanya file yg berbeda SHA

import fs from "fs";
import path from "path";
import crypto from "crypto";

const TOKEN  = process.env.GITHUB_TOKEN;
const OWNER  = "portodit";
const REPO   = "LESAVI-SURAMADU";
const BRANCH = "master";
const BASE   = process.cwd();
const ARGS   = process.argv.slice(2);
const MSG    = ARGS[0] || "chore: update";
const FILES  = ARGS.slice(1); // file spesifik (opsional)

if (!TOKEN) { console.error("❌ GITHUB_TOKEN tidak ada"); process.exit(1); }

const GH = "https://api.github.com";
const H  = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
  "User-Agent": "LESAVI-push/4.0",
};

function gitBlobSha(buf) {
  const h = crypto.createHash("sha1");
  h.update(Buffer.from(`blob ${buf.length}\0`));
  h.update(buf);
  return h.digest("hex");
}

async function api(method, endpoint, body, retry = 5) {
  for (let a = 1; a <= retry; a++) {
    const res = await fetch(`${GH}${endpoint}`, {
      method, headers: H,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 403 || res.status === 429) {
      const wait = a * 20000;
      process.stdout.write(`\n   ⚠️  Rate limit (attempt ${a}), tunggu ${wait/1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`${method} ${endpoint} → ${res.status}: ${await res.text()}`);
    return res.json();
  }
  throw new Error("Gagal setelah max retry");
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Walk direktori source (skip node_modules, dist, dll)
const SKIP = new Set(["node_modules","dist",".git",".cache",".agents",".local","tmp","out-tsc",".expo",".expo-shared","coverage","attached_assets",".idea",".vscode"]);
const EXT  = new Set([".ts",".tsx",".js",".mjs",".cjs",".json",".toml",".md",".sh",".sql",".css",".html",".yaml",".yml",".txt",".gitignore",".npmrc",".nvmrc"]);
const ROOT = ["package.json","pnpm-lock.yaml","pnpm-workspace.yaml",".gitignore",".npmrc","replit.md","push-to-github.mjs","push-to-github.sh"];

function walk(dir, relBase, depth = 0) {
  const r = [];
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return r; }
  for (const e of ents) {
    const full = path.join(dir, e.name), rel = path.join(relBase, e.name).replace(/\\/g,"/");
    if (e.isDirectory()) {
      if (depth === 0 && !["artifacts","lib",".doc"].includes(e.name)) continue;
      if (depth >  0 && (SKIP.has(e.name) || e.name.startsWith("."))) continue;
      r.push(...walk(full, rel, depth + 1));
    } else if (EXT.has(path.extname(e.name))) r.push({ full, rel });
  }
  if (depth === 0) for (const n of ROOT) { const f = path.join(dir, n); if (fs.existsSync(f)) r.push({ full: f, rel: n }); }
  return r;
}

async function main() {
  const t0 = Date.now();

  // 1. Base commit + tree
  const bi = await api("GET", `/repos/${OWNER}/${REPO}/branches/${BRANCH}`);
  const baseCommit = bi.commit.sha;
  const baseTree   = bi.commit.commit.tree.sha;
  console.log(`📦 ${OWNER}/${REPO}@${BRANCH} — base: ${baseCommit.slice(0,8)}`);

  let toUpload;

  if (FILES.length > 0) {
    // Mode spesifik: push file yang disebutkan di args
    toUpload = FILES.map(f => {
      const full = path.resolve(BASE, f);
      const rel  = path.relative(BASE, full).replace(/\\/g, "/");
      if (!fs.existsSync(full)) throw new Error(`File tidak ditemukan: ${full}`);
      return { full, rel, content: fs.readFileSync(full) };
    });
    console.log(`📝 Mode: push ${toUpload.length} file spesifik`);
  } else {
    // Mode diff: bandingkan SHA dengan GitHub
    console.log("🔍 Mode diff: ambil tree dari GitHub...");
    const ghTree = await api("GET", `/repos/${OWNER}/${REPO}/git/trees/${baseTree}?recursive=1`);
    const ghMap  = new Map(ghTree.tree.filter(i => i.type==="blob").map(i => [i.path, i.sha]));
    const locals = walk(BASE, "");
    toUpload = locals.filter(({ full, rel }) => {
      const buf = fs.readFileSync(full);
      return gitBlobSha(buf) !== ghMap.get(rel);
    }).map(({ full, rel }) => ({ full, rel, content: fs.readFileSync(full) }));
    console.log(`📊 GH: ${ghMap.size} | Lokal: ${locals.length} | Berubah: ${toUpload.length}`);
  }

  if (toUpload.length === 0) { console.log("✅ Tidak ada perubahan."); return; }

  // 2. Buat blobs (1 per 1 dengan delay kecil)
  console.log(`🚀 Upload ${toUpload.length} blobs...`);
  const treeItems = [];
  for (let i = 0; i < toUpload.length; i++) {
    const { rel, content } = toUpload[i];
    const blob = await api("POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: content.includes(0) ? content.toString("base64") : content.toString("utf8"),
      encoding: content.includes(0) ? "base64" : "utf-8",
    });
    treeItems.push({ path: rel, mode: "100644", type: "blob", sha: blob.sha });
    process.stdout.write(`\r   [${i+1}/${toUpload.length}] ${rel.slice(-60)}`);
    if (i < toUpload.length - 1) await sleep(200);
  }
  console.log("\n   ✓ Semua blob selesai");

  // 3. Tree → Commit → Update ref
  const newTree   = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, { base_tree: baseTree, tree: treeItems });
  const now       = new Date().toISOString();
  const newCommit = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
    message: MSG, tree: newTree.sha, parents: [baseCommit],
    author: { name:"PORTODIT", email:"bliaditdev@gmail.com", date:now },
    committer: { name:"PORTODIT", email:"bliaditdev@gmail.com", date:now },
  });
  await api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: newCommit.sha, force: false });

  console.log(`\n✅ Push berhasil! (${((Date.now()-t0)/1000).toFixed(1)}s)`);
  console.log(`   "${MSG}"`);
  console.log(`   https://github.com/${OWNER}/${REPO}/commit/${newCommit.sha}`);
}

main().catch(e => { console.error("\n❌", e.message); process.exit(1); });
