import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { listMapContacts } from "@/lib/map.functions";
import { getGeocodingStats, runGeocodingBatch } from "@/lib/geocoding.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MapPin, RefreshCw, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({ meta: [{ title: "Mapa de contatos" }] }),
  component: MapaPage,
});

function MapaPage() {
  const listFn = useServerFn(listMapContacts);
  const statsFn = useServerFn(getGeocodingStats);
  const runFn = useServerFn(runGeocodingBatch);
  const qc = useQueryClient();

  const [filters, setFilters] = useState<{ cidade?: string; bairro?: string; tipo_contato?: string; consent?: "sim" | "nao" }>({});

  const stats = useSuspenseQuery({ queryKey: ["geocode-stats"], queryFn: () => statsFn() });
  const contacts = useSuspenseQuery({
    queryKey: ["map-contacts", filters],
    queryFn: () => listFn({ data: filters }),
  });

  const runBatch = useMutation({
    mutationFn: () => runFn({ data: { limit: 15 } }),
    onSuccess: (r) => {
      toast.success(`Geocode: ${r.ok} localizados, ${r.aprox} aproximados, ${r.fail} falha (${r.cached} em cache)`);
      qc.invalidateQueries({ queryKey: ["geocode-stats"] });
      qc.invalidateQueries({ queryKey: ["map-contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-8 max-w-[1600px]">
      <div className="flex items-center gap-3 mb-4">
        <MapPin className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Mapa de contatos</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <Stat label="Com coordenada" value={stats.data.comCoordenada} />
        <Stat label="Pendente" value={stats.data.pendente} />
        <Stat label="Aproximado" value={stats.data.aproximado} />
        <Stat label="Erro" value={stats.data.erro} />
        <Stat label="Sem endereço" value={stats.data.semEndereco} />
      </div>

      {stats.data.pendente + stats.data.erro > 0 && (
        <div className="mb-4 p-3 border rounded-md bg-amber-50 text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div className="flex-1 text-sm">
            {stats.data.pendente + stats.data.erro} contato(s) sem coordenada. O mapa exibe apenas os geocodificados.
          </div>
          <Button size="sm" onClick={() => runBatch.mutate()} disabled={runBatch.isPending}>
            <RefreshCw className={`h-3 w-3 mr-1 ${runBatch.isPending ? "animate-spin" : ""}`} />
            Atualizar geolocalização (lote)
          </Button>
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <Input placeholder="Cidade" value={filters.cidade ?? ""} onChange={(e) => setFilters((f) => ({ ...f, cidade: e.target.value || undefined }))} />
        <Input placeholder="Bairro" value={filters.bairro ?? ""} onChange={(e) => setFilters((f) => ({ ...f, bairro: e.target.value || undefined }))} />
        <select className="border rounded-md px-2 h-9 text-sm bg-background" value={filters.tipo_contato ?? ""} onChange={(e) => setFilters((f) => ({ ...f, tipo_contato: e.target.value || undefined }))}>
          <option value="">Todos os tipos</option>
          <option value="apoiador">Apoiador</option>
          <option value="militante">Militante</option>
          <option value="lideranca">Liderança</option>
          <option value="eleitor">Eleitor</option>
        </select>
        <select className="border rounded-md px-2 h-9 text-sm bg-background" value={filters.consent ?? ""} onChange={(e) => setFilters((f) => ({ ...f, consent: (e.target.value || undefined) as "sim" | "nao" | undefined }))}>
          <option value="">Todos os consentimentos</option>
          <option value="sim">Com consentimento</option>
          <option value="nao">Sem consentimento</option>
        </select>
      </div>

      <div className="text-xs text-muted-foreground mb-2">{contacts.data.rows.length} pin(s) no mapa</div>

      <LeafletMap rows={contacts.data.rows} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

type Row = {
  id: string; nome: string | null; phone_e164: string | null; bairro: string | null;
  cidade: string | null; profissao: string | null; tipo_contato: string | null;
  formas_ajuda: unknown; consentimento_whatsapp: boolean | null; latitude: number | null; longitude: number | null;
  tags: string[];
};

function LeafletMap({ rows }: { rows: Row[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  const center = useMemo(() => {
    const withCoord = rows.filter((r) => r.latitude != null && r.longitude != null);
    if (!withCoord.length) return { lat: -14.235, lng: -51.9253, zoom: 4 };
    const lat = withCoord.reduce((s, r) => s + (r.latitude ?? 0), 0) / withCoord.length;
    const lng = withCoord.reduce((s, r) => s + (r.longitude ?? 0), 0) / withCoord.length;
    return { lat, lng, zoom: 11 };
  }, [rows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ref.current) return;
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      await import("leaflet/dist/leaflet.css");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");
      if (cancelled) return;

      // Fix default icon paths
      const iconRetina = (await import("leaflet/dist/images/marker-icon-2x.png")).default as unknown as string;
      const iconUrl = (await import("leaflet/dist/images/marker-icon.png")).default as unknown as string;
      const shadowUrl = (await import("leaflet/dist/images/marker-shadow.png")).default as unknown as string;
      (L.Icon.Default as unknown as { mergeOptions: (o: Record<string, string>) => void }).mergeOptions({
        iconRetinaUrl: iconRetina, iconUrl, shadowUrl,
      });

      if (!mapRef.current) {
        mapRef.current = L.map(ref.current).setView([center.lat, center.lng], center.zoom);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      if (layerRef.current) {
        mapRef.current.removeLayer(layerRef.current);
      }
      const cluster = (L as unknown as { markerClusterGroup: () => import("leaflet").LayerGroup }).markerClusterGroup();
      rows.forEach((r) => {
        if (r.latitude == null || r.longitude == null) return;
        const marker = L.marker([r.latitude, r.longitude]);
        const tagsHtml = r.tags.length ? `<div style="margin-top:4px"><b>Tags:</b> ${r.tags.join(", ")}</div>` : "";
        const ajuda = Array.isArray(r.formas_ajuda) ? (r.formas_ajuda as string[]).join(", ") : "";
        const wa = r.phone_e164 ? `https://wa.me/${r.phone_e164.replace(/\D/g, "")}` : null;
        const html = `
          <div style="min-width:220px;font-size:13px">
            <div style="font-weight:600;font-size:14px">${r.nome ?? "(sem nome)"}</div>
            <div style="color:#666">${r.bairro ?? ""}${r.bairro && r.cidade ? " • " : ""}${r.cidade ?? ""}</div>
            ${r.profissao ? `<div><b>Profissão:</b> ${r.profissao}</div>` : ""}
            ${r.tipo_contato ? `<div><b>Tipo:</b> ${r.tipo_contato}</div>` : ""}
            ${ajuda ? `<div><b>Ajuda:</b> ${ajuda}</div>` : ""}
            ${tagsHtml}
            <div style="margin-top:6px"><b>WhatsApp:</b> ${r.consentimento_whatsapp ? "✅" : "—"}</div>
            <div style="margin-top:8px;display:flex;gap:8px">
              <a href="/contatos/${r.id}" style="color:#2563eb;text-decoration:underline">Ver ficha</a>
              ${wa ? `<a href="${wa}" target="_blank" rel="noreferrer" style="color:#16a34a;text-decoration:underline">WhatsApp</a>` : ""}
            </div>
          </div>`;
        marker.bindPopup(html);
        (cluster as unknown as { addLayer: (m: import("leaflet").Marker) => void }).addLayer(marker);
      });
      (mapRef.current as unknown as { addLayer: (l: import("leaflet").LayerGroup) => void }).addLayer(cluster);
      layerRef.current = cluster;

      if (rows.length) {
        const withCoord = rows.filter((r) => r.latitude != null && r.longitude != null);
        if (withCoord.length) {
          const bounds = L.latLngBounds(withCoord.map((r) => [r.latitude!, r.longitude!]));
          mapRef.current.fitBounds(bounds.pad(0.2));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [rows, center.lat, center.lng, center.zoom]);

  return <div ref={ref} className="w-full h-[70vh] rounded-lg border" />;
}
