// Client-safe phone helpers.

export function onlyDigits(s: string): string {
  return (s ?? "").replace(/\D+/g, "");
}

/** Normalize BR phone to E.164 (+55DDDNNNNNNNN). Returns null if invalid. */
export function normalizePhoneBR(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = onlyDigits(input).replace(/^0+/, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
}

export function formatPhoneBR(input: string | null | undefined): string {
  const e = normalizePhoneBR(input ?? "");
  if (!e) return input ?? "";
  // +55DDDNNNNN-NNNN
  const rest = e.slice(3);
  const ddd = rest.slice(0, 2);
  const num = rest.slice(2);
  if (num.length === 9) return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  if (num.length === 8) return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  return e;
}
