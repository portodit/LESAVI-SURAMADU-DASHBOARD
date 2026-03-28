/**
 * Build script untuk seed scripts.
 * Menggunakan esbuild yang sama dengan build utama.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { rm, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const seedsSrcDir = path.resolve(artifactDir, "src/seeds");
const seedsOutDir = path.resolve(artifactDir, "dist-seeds");
const seedsDataSrc = path.resolve(seedsSrcDir, "data");
const seedsDataDst = path.resolve(seedsOutDir, "data");

async function buildSeeds() {
  await rm(seedsOutDir, { recursive: true, force: true });
  await mkdir(seedsOutDir, { recursive: true });

  await esbuild({
    entryPoints: [path.resolve(seedsSrcDir, "index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: seedsOutDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: [
      "*.node", "pg-native",
    ],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  // Copy data JSON files ke dist-seeds/data/
  if (existsSync(seedsDataSrc)) {
    await mkdir(seedsDataDst, { recursive: true });
    const dataFiles = ["performance.json", "activity.json", "funnel.json"];
    for (const f of dataFiles) {
      const src = path.resolve(seedsDataSrc, f);
      if (existsSync(src)) {
        await copyFile(src, path.resolve(seedsDataDst, f));
        console.log(`  Copied data/${f}`);
      }
    }
  }

  console.log("\n✓ Seeds built to dist-seeds/");
}

buildSeeds().catch((err) => {
  console.error(err);
  process.exit(1);
});
