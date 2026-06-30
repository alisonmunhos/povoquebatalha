import { useState } from "react";

export type CepLookup = {
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

export function useCepLookup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function lookup(rawCep: string): Promise<CepLookup | null> {
    const cep = (rawCep ?? "").replace(/\D/g, "");
    if (cep.length !== 8) return null;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/cep/${cep}`);
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error ?? "CEP não encontrado");
        return null;
      }
      return j.data as CepLookup;
    } catch {
      setError("Não foi possível consultar o CEP agora");
      return null;
    } finally {
      setLoading(false);
    }
  }
  return { lookup, loading, error };
}

export function formatCep(value: string): string {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
