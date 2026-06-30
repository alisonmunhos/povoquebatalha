// Server-only helpers for decoding CSV bytes with PT-BR aware encoding detection.

export type SupportedEncoding = "auto" | "utf-8" | "utf-8-bom" | "iso-8859-1" | "windows-1252";

// Windows-1252 specific overrides for 0x80-0x9F (range that differs from ISO-8859-1).
const CP1252_OVERRIDES: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

function decodeSingleByte(bytes: Uint8Array, cp1252: boolean): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (cp1252 && CP1252_OVERRIDES[b] !== undefined) {
      out += String.fromCodePoint(CP1252_OVERRIDES[b]);
    } else {
      out += String.fromCodePoint(b);
    }
  }
  return out;
}

function tryUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Heuristic: count occurrences of typical PT-BR mojibake sequences (Ã+letter, Ã§). */
function mojibakeScore(s: string): number {
  const matches = s.match(/Ã[\u0080-\u00ff]/g);
  return matches ? matches.length : 0;
}

export function decodeBytes(bytes: Uint8Array, encoding: SupportedEncoding = "auto"): {
  text: string;
  used: Exclude<SupportedEncoding, "auto">;
} {
  // Strip UTF-8 BOM
  let body = bytes;
  let hasBom = false;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    body = bytes.subarray(3);
    hasBom = true;
  }

  if (encoding === "utf-8" || encoding === "utf-8-bom") {
    return { text: new TextDecoder("utf-8").decode(body), used: hasBom ? "utf-8-bom" : "utf-8" };
  }
  if (encoding === "iso-8859-1") {
    return { text: decodeSingleByte(body, false), used: "iso-8859-1" };
  }
  if (encoding === "windows-1252") {
    return { text: decodeSingleByte(body, true), used: "windows-1252" };
  }

  // auto detection
  if (hasBom) {
    return { text: new TextDecoder("utf-8").decode(body), used: "utf-8-bom" };
  }
  const utf8 = tryUtf8(body);
  if (utf8 !== null && mojibakeScore(utf8) === 0) {
    return { text: utf8, used: "utf-8" };
  }
  // Fall back to Windows-1252 (superset of ISO-8859-1 for typical Excel-BR exports)
  return { text: decodeSingleByte(body, true), used: "windows-1252" };
}
