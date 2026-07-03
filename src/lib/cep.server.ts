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

// ---------- Geocoding com cascata + validação de precisão ----------

export type GeocodingPrecision = "exato" | "rua" | "cep" | "cidade";

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  provider: string;
  status: "encontrado" | "aproximado" | "erro";
  precision: GeocodingPrecision | null;
  match_score: number; // 0..1
};

const UA = "central-mobilizacao/1.0 (contato via app)";

function normalizeStreet(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\s*(r\.?|rua|av\.?|avenida|tv\.?|travessa|al\.?|alameda|pc\.?|praca|estr\.?|estrada|rod\.?|rodovia)\s+/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function streetSimilar(a: string, b: string): boolean {
  const na = normalizeStreet(a);
  const nb = normalizeStreet(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function houseNumberMatches(requested: string | null | undefined, returned: string | null | undefined): boolean {
  const r = (requested ?? "").replace(/\D/g, "");
  const g = (returned ?? "").trim();
  if (!r || !g) return false;
  // pode vir range "1000-1100" ou "1011"
  const rangeMatch = g.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const [_, from, to] = rangeMatch;
    const n = parseInt(r, 10);
    return n >= parseInt(from, 10) && n <= parseInt(to, 10);
  }
  return g.replace(/\D/g, "") === r;
}

type NominatimHit = {
  lat: string;
  lon: string;
  class?: string;
  type?: string;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
  };
};

async function nominatimStructured(parts: {
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}): Promise<NominatimHit[] | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  const street = [parts.endereco, parts.numero].filter(Boolean).join(" ").trim();
  if (street) url.searchParams.set("street", street);
  if (parts.cidade) url.searchParams.set("city", parts.cidade);
  if (parts.uf) url.searchParams.set("state", parts.uf);
  if (parts.cep) url.searchParams.set("postalcode", parts.cep.replace(/\D/g, ""));
  url.searchParams.set("country", "Brasil");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "br");
  try {
    const r = await fetch(url.toString(), { headers: { Accept: "application/json", "User-Agent": UA } });
    if (!r.ok) return null;
    return (await r.json()) as NominatimHit[];
  } catch {
    return null;
  }
}

async function nominatimFree(q: string): Promise<NominatimHit[] | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "br");
  try {
    const r = await fetch(url.toString(), { headers: { Accept: "application/json", "User-Agent": UA } });
    if (!r.ok) return null;
    return (await r.json()) as NominatimHit[];
  } catch {
    return null;
  }
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    postcode?: string;
    osm_key?: string;
    osm_value?: string;
  };
};

async function photon(q: string): Promise<PhotonFeature[] | null> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "pt");
  try {
    const r = await fetch(url.toString(), { headers: { Accept: "application/json", "User-Agent": UA } });
    if (!r.ok) return null;
    const j = (await r.json()) as { features?: PhotonFeature[] };
    return j.features ?? [];
  } catch {
    return null;
  }
}

export async function geocodeAddress(parts: {
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}): Promise<GeocodeResult | null> {
  const requestedStreet = parts.endereco ?? "";
  const requestedNumber = parts.numero ?? "";
  const requestedCity = parts.cidade ?? "";
  const hasStreet = !!requestedStreet.trim();
  const hasCity = !!requestedCity.trim();
  const hasCep = !!(parts.cep ?? "").replace(/\D/g, "");

  if (!hasCity && !hasCep) return null;

  // ---------- 1) Nominatim estruturado ----------
  if (hasStreet) {
    const hits = await nominatimStructured(parts);
    if (hits && hits.length) {
      // Ordena: com house_number que bate primeiro
      const scored = hits.map((h) => {
        const numOk = houseNumberMatches(requestedNumber, h.address?.house_number);
        const streetOk = streetSimilar(requestedStreet, h.address?.road ?? "");
        let precision: GeocodingPrecision = "cidade";
        let score = 0.3;
        if (numOk && streetOk) { precision = "exato"; score = 1; }
        else if (streetOk) { precision = "rua"; score = 0.6; }
        else if (h.address?.postcode && parts.cep && h.address.postcode.replace(/\D/g, "") === parts.cep.replace(/\D/g, "")) { precision = "cep"; score = 0.4; }
        return { h, precision, score };
      }).sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (best.precision === "exato") {
        return {
          latitude: parseFloat(best.h.lat),
          longitude: parseFloat(best.h.lon),
          provider: "nominatim-structured",
          status: "encontrado",
          precision: "exato",
          match_score: 1,
        };
      }
      // Guarda melhor tentativa OSM para depois; tentar Photon antes de aceitar "rua"
      const nominatimBest = best;

      // ---------- 2) Photon (bom para housenumber em cidades pequenas) ----------
      const q = [requestedStreet, requestedNumber, parts.bairro, requestedCity, parts.uf].filter(Boolean).join(", ");
      const p = await photon(q);
      if (p && p.length) {
        const pScored = p
          .filter((f) => {
            const city = f.properties.city ?? "";
            return !requestedCity || streetSimilar(city, requestedCity) || city.toLowerCase().includes(requestedCity.toLowerCase());
          })
          .map((f) => {
            const numOk = houseNumberMatches(requestedNumber, f.properties.housenumber);
            const streetOk = streetSimilar(requestedStreet, f.properties.street ?? "");
            let precision: GeocodingPrecision = "cidade";
            let score = 0.3;
            if (numOk && streetOk) { precision = "exato"; score = 1; }
            else if (streetOk) { precision = "rua"; score = 0.6; }
            return { f, precision, score };
          })
          .sort((a, b) => b.score - a.score);
        const pBest = pScored[0];
        if (pBest && pBest.precision === "exato") {
          const [lon, lat] = pBest.f.geometry.coordinates;
          return {
            latitude: lat, longitude: lon,
            provider: "photon",
            status: "encontrado",
            precision: "exato",
            match_score: 1,
          };
        }
      }

      // Nem nominatim nem photon acharam número; usa o melhor OSM disponível
      return {
        latitude: parseFloat(nominatimBest.h.lat),
        longitude: parseFloat(nominatimBest.h.lon),
        provider: "nominatim-structured",
        status: "aproximado",
        precision: nominatimBest.precision,
        match_score: nominatimBest.score,
      };
    }
  }

  // ---------- 3) Fallback: busca livre ----------
  const q = [
    [requestedStreet, requestedNumber].filter(Boolean).join(", "),
    parts.bairro, requestedCity, parts.uf, parts.cep, "Brasil",
  ].filter(Boolean).join(", ");
  const free = await nominatimFree(q);
  if (free && free.length) {
    const h = free[0];
    const numOk = hasStreet && houseNumberMatches(requestedNumber, h.address?.house_number);
    const streetOk = hasStreet && streetSimilar(requestedStreet, h.address?.road ?? "");
    let precision: GeocodingPrecision = hasStreet ? "rua" : hasCep ? "cep" : "cidade";
    let score = 0.4;
    if (numOk && streetOk) { precision = "exato"; score = 1; }
    else if (streetOk) { precision = "rua"; score = 0.6; }
    return {
      latitude: parseFloat(h.lat),
      longitude: parseFloat(h.lon),
      provider: "nominatim-free",
      status: precision === "exato" ? "encontrado" : "aproximado",
      precision,
      match_score: score,
    };
  }

  // ---------- 4) Fallback só CEP ----------
  if (hasCep) {
    const cepQ = `${parts.cep}, Brasil`;
    const c = await nominatimFree(cepQ);
    if (c && c.length) {
      return {
        latitude: parseFloat(c[0].lat),
        longitude: parseFloat(c[0].lon),
        provider: "nominatim-cep",
        status: "aproximado",
        precision: "cep",
        match_score: 0.35,
      };
    }
  }

  return { latitude: 0, longitude: 0, provider: "nominatim", status: "erro", precision: null, match_score: 0 };
}
