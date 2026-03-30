import { ensureDefaultSeed } from "./seed";

export async function ensureFullSeed(): Promise<void> {
  await ensureDefaultSeed();
}
