export const DIVISI_OPTIONS = [
  { value: "LESA", label: "LESA" },
  { value: "GOVT", label: "GOVT" },
  { value: "DPS",  label: "DPS" },
  { value: "DSS",  label: "DSS" },
];

export const DIVISI_OPTIONS_WITH_ALL = [
  { value: "LESA", label: "LESA" },
  { value: "GOVT", label: "GOVT" },
  { value: "DPS",  label: "DPS" },
  { value: "DSS",  label: "DSS" },
  { value: "all",  label: "Semua Divisi" },
];

export const DEFAULT_DIVISI = "LESA";

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

/** Human-readable label for a divisi filter value */
export function divisiFilterLabel(d: string): string {
  if (d === "LESA") return "LESA";
  if (d === "GOVT") return "GOVT";
  if (!d || d === "all") return "Semua Divisi";
  return d;
}
