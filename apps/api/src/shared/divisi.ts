/** Expands LESA → ["DPS","DSS"], GOVT → ["DGS"], else → [d] */
export function expandDivisi(d: string): string[] {
  if (d === "LESA") return ["DPS", "DSS"];
  if (d === "GOVT") return ["DGS"];
  return [d];
}

/** Returns true if recordDivisi matches the selected filter */
export function matchesDivisi(
  recordDivisi: string | null | undefined,
  filter: string
): boolean {
  if (!filter || filter === "all") return true;
  return expandDivisi(filter).includes(recordDivisi ?? "");
}

/**
 * Performa-specific: LESA → ["DPS","DSS","DES"] karena DES adalah kode historis LESA di data performa.
 * GOVT → ["DGS"], else → [d].
 */
export function expandDivisiPerforma(d: string): string[] {
  if (d === "LESA") return ["DPS", "DSS", "DES"];
  if (d === "GOVT") return ["DGS"];
  return [d];
}

/** Returns true if recordDivisi matches the selected performa filter (LESA termasuk DES) */
export function matchesDivisiPerforma(
  recordDivisi: string | null | undefined,
  filter: string
): boolean {
  if (!filter || filter === "all") return true;
  return expandDivisiPerforma(filter).includes(recordDivisi ?? "");
}
