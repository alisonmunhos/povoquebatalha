// Server-side CEP lookup with ViaCEP -> BrasilAPI fallback.
export type CepData = {
  cep: string;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  provider: "viacep" | "brasilapi";
};

export async function lookupCep(rawCep: string): Promise<CepData | null> {
  const cep = (rawCep ?? "").replace(/\D/g, "");
  if (cep.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: "application/json" },
    });
    if (r.ok) {
      const j = (await r.json()) as Record<string, string> & { erro?: boolean };
      if (!j.erro) {
        return {
          cep,
          endereco: j.logradouro || null,
          bairro: j.bairro || null,
          cidade: j.localidade || null,
          uf: (j.uf || null)?.toUpperCase() ?? null,
          provider: "viacep",
        };
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
      headers: { Accept: "application/json" },
    });
    if (r.ok) {
      const j = (await r.json()) as Record<string, string>;
      return {
        cep,
        endereco: j.street || null,
        bairro: j.neighborhood || null,
        cidade: j.city || null,
        uf: (j.state || null)?.toUpperCase() ?? null,
        provider: "brasilapi",
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  provider: string;
  status: "encontrado" | "aproximado" | "erro";
};

export async function geocodeAddress(parts: {
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}): Promise<GeocodeResult | null> {
  const street = [parts.endereco, parts.numero].filter(Boolean).join(", ").trim();
  const q = [street, parts.bairro, parts.cidade, parts.uf, parts.cep, "Brasil"]
    .filter(Boolean)
    .join(", ");
  if (!q || (!parts.cidade && !parts.cep)) return null;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("addressdetails", "0");
    const r = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "central-mobilizacao/1.0 (contato via app)",
      },
    });
    if (!r.ok) return { latitude: 0, longitude: 0, provider: "nominatim", status: "erro" };
    const arr = (await r.json()) as Array<{ lat: string; lon: string; class?: string }>;
    if (!arr.length) return null;
    const hit = arr[0];
    const lat = parseFloat(hit.lat);
    const lon = parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const status: GeocodeResult["status"] = street ? "encontrado" : "aproximado";
    return { latitude: lat, longitude: lon, provider: "nominatim", status };
  } catch {
    return { latitude: 0, longitude: 0, provider: "nominatim", status: "erro" };
  }
}
