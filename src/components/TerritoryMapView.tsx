import { Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listMapContacts, getMapContactDetail, listMapFacets } from "@/lib/map.functions";
import { getGeocodingStats, runGeocodingBatch, regeocodeOne } from "@/lib/geocoding.functions";
import { sendDirectMessage, listQuickReplies } from "@/lib/inbox.functions";
import { logTerritoryAction, resetTerritoryContact } from "@/lib/territory-logs.functions";
import { TerritoryContactLogDrawer } from "@/components/TerritoryContactLogDrawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { toast } from "sonner";
import {
  RefreshCw, AlertTriangle, X, Send, ExternalLink, LocateFixed, ChevronDown,
  Copy, Navigation, MessageCircle, CheckCircle2, UserX, StickyNote, RotateCcw,
  History, Plus, Minus, Maximize2, Minimize2, Phone, MapPin, Crosshair,
} from "lucide-react";

type Precision = "exato" | "rua" | "cep" | "cidade";
const PRECISION_LABEL: Record<Precision, string> = {
  exato: "Endereço exato",
  rua: "Na rua (número não confirmado)",
  cep: "Aproximado pelo CEP",
  cidade: "Só cidade/bairro",
};

// ---------- Deep links / helpers ----------
function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildAddressString(c: {
  endereco?: string | null; numero?: string | null; complemento?: string | null;
  bairro?: string | null; cidade?: string | null; uf?: string | null; cep?: string | null;
}): string {
  const parts: string[] = [];
  if (c.endereco) parts.push(c.endereco + (c.numero ? `, ${c.numero}` : ""));
  if (c.complemento) parts.push(c.complemento);
  if (c.bairro) parts.push(c.bairro);
  const cityUf = [c.cidade, c.uf].filter(Boolean).join("/");
  if (cityUf) parts.push(cityUf);
  if (c.cep) parts.push(`CEP ${c.cep}`);
  return parts.join(" — ");
}

function googleMapsUrl(lat: number | null | undefined, lng: number | null | undefined, address: string, label?: string | null) {
  if (lat != null && lng != null) {
    if (isMobile()) {
      // geo: abre app de mapas nativo (Android/iOS Google Maps/Waze/Apple Maps)
      const q = encodeURIComponent(label ? `${lat},${lng}(${label})` : `${lat},${lng}`);
      return `geo:${lat},${lng}?q=${q}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function googleMapsDirectionsUrl(lat: number | null | undefined, lng: number | null | undefined, address: string) {
  const dest = lat != null && lng != null ? `${lat},${lng}` : address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

async function copyToClipboard(text: string, successMsg = "Copiado!") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMsg);
  } catch {
    toast.error("Não foi possível copiar.");
  }
}

// ---------- Pin color por status ----------
const ACTION_COLORS: Record<string, { bg: string; ring: string; label: string }> = {
  contato_realizado: { bg: "#10b981", ring: "#065f46", label: "Contato feito" },
  nao_encontrado: { bg: "#f59e0b", ring: "#92400e", label: "Não encontrado" },
  observacao: { bg: "#0ea5e9", ring: "#075985", label: "Observação" },
  whatsapp_aberto: { bg: "#22c55e", ring: "#166534", label: "WhatsApp aberto" },
  pediu_atualizacao: { bg: "#8b5cf6", ring: "#5b21b6", label: "Pediu atualização" },
};
const DEFAULT_PIN = { bg: "#64748b", ring: "#1e293b", label: "Não abordado" };

function pinSvg(color: { bg: string; ring: string }, precision: Precision | null): string {
  // Camada 2 (precisão): borda branca / tracejada / opacidade / ? sobreposto
  const isExact = precision === "exato";
  const isStreet = precision === "rua";
  const isCep = precision === "cep";
  const isCity = precision === "cidade" || precision == null;
  const fillOpacity = isCity ? 0.55 : 1;
  const outerStroke = isExact ? "#ffffff" : isStreet ? "#ffffff" : "#ffffff";
  const outerWidth = isExact ? 2.5 : 1.8;
  const dash = isExact ? "" : `stroke-dasharray="2.5 2"`;
  const questionMark = (isCep || isCity)
    ? `<circle cx="22" cy="6" r="5" fill="#f59e0b" stroke="#ffffff" stroke-width="1"/><text x="22" y="9" text-anchor="middle" font-size="8" font-weight="700" fill="#ffffff" font-family="system-ui">?</text>`
    : "";
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
  <path fill="${color.bg}" fill-opacity="${fillOpacity}" stroke="${outerStroke}" stroke-width="${outerWidth}" ${dash}
    d="M14 1.5C7.4 1.5 2 6.7 2 13.1c0 8.9 11 20.4 11.5 20.9.3.3.7.3 1 0C15 33.5 26 22 26 13.1 26 6.7 20.6 1.5 14 1.5z"/>
  <path fill="none" stroke="${color.ring}" stroke-width="0.8" fill-opacity="${fillOpacity}"
    d="M14 1.5C7.4 1.5 2 6.7 2 13.1c0 8.9 11 20.4 11.5 20.9.3.3.7.3 1 0C15 33.5 26 22 26 13.1 26 6.7 20.6 1.5 14 1.5z"/>
  <circle cx="14" cy="13" r="4.5" fill="#ffffff" fill-opacity="${isCity ? 0.6 : 0.9}"/>
  ${questionMark}
</svg>`.trim();
}

// ---------- Component ----------
export function TerritoryMapView() {
  const listFn = useServerFn(listMapContacts);
  const statsFn = useServerFn(getGeocodingStats);
  const facetsFn = useServerFn(listMapFacets);
  const runFn = useServerFn(runGeocodingBatch);
  const qc = useQueryClient();

  const [filters, setFilters] = useState<{ cidades?: string[]; bairros?: string[]; tipo_contato?: string; consent?: "sim" | "nao"; onlyExact?: boolean }>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stats = useSuspenseQuery({ queryKey: ["geocode-stats"], queryFn: () => statsFn() });
  const facets = useSuspenseQuery({ queryKey: ["map-facets"], queryFn: () => facetsFn() });
  const contacts = useSuspenseQuery({
    queryKey: ["map-contacts", filters],
    queryFn: () => listFn({ data: { cidades: filters.cidades, bairros: filters.bairros, tipo_contato: filters.tipo_contato, consent: filters.consent } }),
  });

  const runBatch = useMutation({
    mutationFn: () => runFn({ data: { limit: 15 } }),
    onSuccess: (r) => {
      toast.success(`Geocode: ${r.ok} exatos, ${r.aprox} aproximados, ${r.fail} sem sucesso (${r.cached} em cache).`);
      qc.invalidateQueries({ queryKey: ["geocode-stats"] });
      qc.invalidateQueries({ queryKey: ["map-contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runImprecise = useMutation({
    mutationFn: () => runFn({ data: { limit: 20, onlyImprecise: true } }),
    onSuccess: (r) => {
      toast.success(`Refino: ${r.ok} agora exatos, ${r.aprox} ainda aproximados, ${r.fail} sem sucesso.`);
      qc.invalidateQueries({ queryKey: ["geocode-stats"] });
      qc.invalidateQueries({ queryKey: ["map-contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeFilterCount =
    (filters.cidades?.length ?? 0) +
    (filters.bairros?.length ?? 0) +
    (filters.tipo_contato ? 1 : 0) +
    (filters.consent ? 1 : 0) +
    (filters.onlyExact ? 1 : 0);

  const visibleRows = useMemo(
    () => filters.onlyExact
      ? contacts.data.rows.filter((r) => r.geocoding_precision === "exato")
      : contacts.data.rows,
    [contacts.data.rows, filters.onlyExact],
  );
  const pinCount = visibleRows.length;
  const semCoord = stats.data.pendente + stats.data.erro + stats.data.semEndereco;
  const imprecisos = stats.data.rua + stats.data.cep + stats.data.cidade;

  return (
    <div className="flex flex-col md:flex-row w-full">
      <div className="flex-1 min-w-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-3">
          <Stat label="Exatos" value={stats.data.exato} tone="ok" />
          <Stat label="Na rua" value={stats.data.rua} tone="warn" />
          <Stat label="Aprox. (CEP)" value={stats.data.cep} tone="warn" />
          <Stat label="Só cidade" value={stats.data.cidade} tone="warn" />
          <Stat label="Pendente" value={stats.data.pendente} />
          <Stat label="Sem endereço" value={stats.data.semEndereco} />
        </div>

        {(stats.data.pendente + stats.data.erro > 0 || imprecisos > 0) && (
          <div className="mb-3 p-3 border rounded-md bg-amber-50 text-amber-900 flex flex-col sm:flex-row sm:items-start gap-2">
            <div className="flex items-start gap-2 flex-1 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                {stats.data.pendente + stats.data.erro > 0 && (
                  <div>{stats.data.pendente + stats.data.erro} sem coordenada — o mapa só mostra quem já foi geolocalizado.</div>
                )}
                {imprecisos > 0 && (
                  <div>{imprecisos} contato(s) com endereço completo, mas pin ainda impreciso. Rode o refino para tentar achar a casa exata.</div>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              {stats.data.pendente + stats.data.erro > 0 && (
                <Button size="sm" onClick={() => runBatch.mutate()} disabled={runBatch.isPending}>
                  <RefreshCw className={`h-3 w-3 mr-1 ${runBatch.isPending ? "animate-spin" : ""}`} />
                  Geocodificar pendentes
                </Button>
              )}
              {imprecisos > 0 && (
                <Button size="sm" variant="outline" onClick={() => runImprecise.mutate()} disabled={runImprecise.isPending}>
                  <Crosshair className={`h-3 w-3 mr-1 ${runImprecise.isPending ? "animate-spin" : ""}`} />
                  Refinar imprecisos
                </Button>
              )}
            </div>
          </div>
        )}

        <details className="mb-3 rounded-lg border bg-card group" open={typeof window !== "undefined" && window.innerWidth >= 768}>
          <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between text-sm font-medium select-none">
            <span className="inline-flex items-center gap-2">
              Filtros
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">{activeFilterCount}</span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 p-3 pt-0">
            <MultiSelectFilter
              options={
                filters.cidades?.length
                  ? filters.cidades.flatMap((c) => facets.data.bairrosPorCidade[c] ?? [])
                  : facets.data.bairros
              }
              value={filters.bairros ?? []}
              onChange={(v) => setFilters((f) => ({ ...f, bairros: v.length ? v : undefined }))}
              placeholder="Bairro (todos)"
              emptyText="Sem bairros."
            />
            <MultiSelectFilter
              options={facets.data.cidades}
              value={filters.cidades ?? []}
              onChange={(v) => setFilters((f) => ({ ...f, cidades: v.length ? v : undefined, bairros: undefined }))}
              placeholder="Cidade (todas)"
              emptyText="Sem cidades."
            />
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
            <label className="col-span-full sm:col-span-2 md:col-span-4 inline-flex items-center gap-2 text-sm px-1 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters.onlyExact}
                onChange={(e) => setFilters((f) => ({ ...f, onlyExact: e.target.checked || undefined }))}
                className="h-4 w-4"
              />
              <span>Mostrar apenas endereços <b>exatos</b> (ideal para entrega de material)</span>
            </label>
          </div>
        </details>

        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>
            <b className="text-foreground">{pinCount}</b> pin(s) no mapa
            {semCoord > 0 && <span> · {semCoord} sem coordenada</span>}
          </span>
          <span className="hidden md:inline">Clique num pin para ver o contato</span>
          <span className="md:hidden">Toque num pin</span>
        </div>

        <LeafletMap rows={visibleRows} selectedId={selectedId} onSelect={setSelectedId} hasPanel={!!selectedId} />
      </div>

      {selectedId && (
        <MapDetailPanel contactId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const toneClass = tone === "ok" ? "border-emerald-300 bg-emerald-50/60"
    : tone === "warn" ? "border-amber-300 bg-amber-50/60" : "bg-card";
  return (
    <div className={`border rounded-lg p-3 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

type Row = {
  id: string; nome: string | null; phone_e164: string | null; bairro: string | null;
  cidade: string | null; profissao: string | null; tipo_contato: string | null;
  formas_ajuda: unknown; consentimento_whatsapp: boolean | null; latitude: number | null; longitude: number | null;
  tags: string[]; last_action: { action: string; created_at: string } | null;
  geocoding_precision: Precision | null;
};

// ---------- Leaflet Map ----------
const VIEW_STORAGE_KEY = "territorio:mapa:view";

function LeafletMap({ rows, selectedId, onSelect, hasPanel }: { rows: Row[]; selectedId: string | null; onSelect: (id: string) => void; hasPanel: boolean }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const clusterRef = useRef<import("leaflet").LayerGroup | null>(null);
  const markerByIdRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const didInitialFitRef = useRef<boolean>(false);
  const rowsSignatureRef = useRef<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const hintTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  const userMarkerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const userAccuracyRef = useRef<import("leaflet").Circle | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [locateMode, setLocateMode] = useState<"off" | "once" | "follow">("off");
  const [locating, setLocating] = useState(false);

  // Init map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mapDivRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      await import("leaflet/dist/leaflet.css");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");
      if (cancelled) return;

      const iconRetina = (await import("leaflet/dist/images/marker-icon-2x.png")).default as unknown as string;
      const iconUrl = (await import("leaflet/dist/images/marker-icon.png")).default as unknown as string;
      const shadowUrl = (await import("leaflet/dist/images/marker-shadow.png")).default as unknown as string;
      (L.Icon.Default as unknown as { mergeOptions: (o: Record<string, string>) => void }).mergeOptions({
        iconRetinaUrl: iconRetina, iconUrl, shadowUrl,
      });

      // Recuperar última posição do usuário
      let initialCenter: [number, number] = [-14.235, -51.9253];
      let initialZoom = 4;
      try {
        const raw = localStorage.getItem(VIEW_STORAGE_KEY);
        if (raw) {
          const v = JSON.parse(raw);
          if (typeof v.lat === "number" && typeof v.lng === "number" && typeof v.zoom === "number") {
            initialCenter = [v.lat, v.lng];
            initialZoom = v.zoom;
            didInitialFitRef.current = true;
          }
        }
      } catch { /* noop */ }

      const map = L.map(mapDivRef.current, {
        preferCanvas: true,
        zoomControl: false,
        scrollWheelZoom: false, // ativado sob demanda com Ctrl/pinça
        doubleClickZoom: true,
        touchZoom: true,
        tapTolerance: 25,
        bounceAtZoomLimits: false,
        worldCopyJump: true,
      }).setView(initialCenter, initialZoom);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
        keepBuffer: 4,
      }).addTo(map);

      const cluster = (L as unknown as {
        markerClusterGroup: (opts?: Record<string, unknown>) => import("leaflet").LayerGroup;
      }).markerClusterGroup({
        chunkedLoading: true,
        chunkInterval: 100,
        maxClusterRadius: 55,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
      });
      (map as unknown as { addLayer: (l: import("leaflet").LayerGroup) => void }).addLayer(cluster);

      // Scroll wheel — só com Ctrl no desktop, mostra hint quando o usuário tenta scroll normal
      const container = map.getContainer();
      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          // Deixa o Leaflet processar
          if (!map.scrollWheelZoom.enabled()) map.scrollWheelZoom.enable();
          return;
        }
        // Desativa e mostra hint
        if (map.scrollWheelZoom.enabled()) map.scrollWheelZoom.disable();
        setShowScrollHint(true);
        if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = window.setTimeout(() => setShowScrollHint(false), 1400);
      };
      container.addEventListener("wheel", onWheel, { passive: true });

      // Persistir view ao mover/zoom
      const saveView = () => {
        try {
          const c = map.getCenter();
          localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
        } catch { /* noop */ }
      };
      map.on("moveend", saveView);
      map.on("zoomend", saveView);

      mapRef.current = map;
      clusterRef.current = cluster;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    };
  }, []);

  // Render markers (colored by last_action)
  useEffect(() => {
    (async () => {
      if (!mapRef.current || !clusterRef.current || !ready) return;
      const L = (await import("leaflet")).default;
      const withCoord = rows.filter((r) => r.latitude != null && r.longitude != null);
      const signature = withCoord.map((r) => `${r.id}:${r.latitude},${r.longitude}:${r.last_action?.action ?? ""}:${r.geocoding_precision ?? ""}`).join("|");
      if (signature === rowsSignatureRef.current) return;
      rowsSignatureRef.current = signature;

      const cluster = clusterRef.current as unknown as {
        clearLayers: () => void;
        addLayers: (m: import("leaflet").Marker[]) => void;
      };
      cluster.clearLayers();
      markerByIdRef.current.clear();

      const markers = withCoord.map((r) => {
        const color = r.last_action ? (ACTION_COLORS[r.last_action.action] ?? DEFAULT_PIN) : DEFAULT_PIN;
        const icon = L.divIcon({
          html: pinSvg(color, r.geocoding_precision),
          className: "custom-pin",
          iconSize: [28, 36],
          iconAnchor: [14, 34],
          popupAnchor: [0, -30],
        });
        const m = L.marker([r.latitude!, r.longitude!], { icon });
        const bairroTxt = r.bairro ? ` — ${r.bairro}` : "";
        const precTxt = r.geocoding_precision && r.geocoding_precision !== "exato"
          ? `<br/><span style="opacity:.75">${PRECISION_LABEL[r.geocoding_precision]}</span>` : "";
        m.bindTooltip(`<b>${escapeHtml(r.nome ?? "(sem nome)")}</b>${escapeHtml(bairroTxt)}${precTxt}`, { direction: "top", offset: [0, -28], className: "leaflet-tooltip-pin" });
        m.on("click", () => onSelect(r.id));
        markerByIdRef.current.set(r.id, m);
        return m;
      });
      cluster.addLayers(markers);

      if (!didInitialFitRef.current && withCoord.length) {
        const bounds = L.latLngBounds(withCoord.map((r) => [r.latitude!, r.longitude!]));
        mapRef.current.fitBounds(bounds.pad(0.2));
        didInitialFitRef.current = true;
      }
    })();
  }, [rows, onSelect, ready]);

  // Center on selected marker with vertical offset if panel is visible on mobile
  useEffect(() => {
    if (!mapRef.current || !selectedId) return;
    const marker = markerByIdRef.current.get(selectedId);
    if (!marker) return;
    const latLng = marker.getLatLng();
    const map = mapRef.current;
    const targetZoom = Math.max(map.getZoom(), 16);
    // No mobile o bottom sheet ocupa a metade inferior: desloca o alvo para cima
    if (typeof window !== "undefined" && window.innerWidth < 768 && hasPanel) {
      const p = map.project(latLng, targetZoom);
      p.y -= map.getSize().y * 0.22;
      const newCenter = map.unproject(p, targetZoom);
      map.setView(newCenter, targetZoom, { animate: true });
    } else {
      map.setView(latLng, targetZoom, { animate: true });
    }
  }, [selectedId, hasPanel]);

  // Fullscreen bookkeeping
  useEffect(() => {
    function onChange() {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      window.setTimeout(() => { mapRef.current?.invalidateSize(); }, 200);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  const updateUserPosition = useCallback(async (lat: number, lng: number, accuracy: number, center: boolean) => {
    if (!mapRef.current) return;
    const L = (await import("leaflet")).default;
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.circleMarker([lat, lng], {
        radius: 8, color: "#ffffff", weight: 3, fillColor: "#2563eb", fillOpacity: 1,
      }).addTo(mapRef.current);
      userMarkerRef.current.bindTooltip("Você está aqui");
    } else {
      userMarkerRef.current.setLatLng([lat, lng]);
    }
    if (!userAccuracyRef.current) {
      userAccuracyRef.current = L.circle([lat, lng], {
        radius: accuracy, color: "#2563eb", weight: 1, fillColor: "#3b82f6", fillOpacity: 0.12,
      }).addTo(mapRef.current);
    } else {
      userAccuracyRef.current.setLatLng([lat, lng]);
      userAccuracyRef.current.setRadius(accuracy);
    }
    if (center) mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 16), { animate: true });
  }, []);

  const stopLocate = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setLocateMode("off");
    if (mapRef.current && userMarkerRef.current) {
      mapRef.current.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }
    if (mapRef.current && userAccuracyRef.current) {
      mapRef.current.removeLayer(userAccuracyRef.current);
      userAccuracyRef.current = null;
    }
  }, []);

  async function handleLocate() {
    if (!navigator.geolocation) { toast.error("Geolocalização não disponível neste dispositivo."); return; }
    if (locateMode === "off") {
      const inIframe = typeof window !== "undefined" && window.self !== window.top;
      if (inIframe) {
        toast.error("A localização é bloqueada dentro do preview. Abra o app em uma aba nova para autorizar.", {
          action: { label: "Abrir em nova aba", onClick: () => window.open(window.location.href, "_blank", "noopener") },
          duration: 8000,
        });
        return;
      }
      try {
        if (navigator.permissions && (navigator.permissions as unknown as { query: (o: { name: string }) => Promise<PermissionStatus> }).query) {
          const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
          if (status.state === "denied") {
            toast.error("Localização bloqueada nas configurações do site. Clique no cadeado ao lado da URL → Permissões → Localização → Permitir, e recarregue a página.", { duration: 10000 });
            return;
          }
        }
      } catch { /* noop */ }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setLocating(false); setLocateMode("once");
          await updateUserPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? 30, true);
        },
        (err) => {
          setLocating(false);
          if (err.code === err.PERMISSION_DENIED) toast.error("Permissão negada. Clique no cadeado ao lado da URL, autorize a Localização e tente novamente.", { duration: 8000 });
          else if (err.code === err.POSITION_UNAVAILABLE) toast.error("Localização indisponível. Ative o GPS/Wi-Fi e tente novamente.");
          else if (err.code === err.TIMEOUT) toast.error("Tempo esgotado ao obter localização. Tente novamente em um local com melhor sinal.");
          else toast.error("Não foi possível obter sua localização.");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
      return;
    }
    if (locateMode === "once") {
      setLocateMode("follow");
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (pos) => await updateUserPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? 30, true),
        (err) => { if (err.code === err.PERMISSION_DENIED) { toast.error("Permissão de localização foi revogada."); stopLocate(); } },
        { enableHighAccuracy: true, maximumAge: 3000 },
      );
      toast.success("Seguindo sua localização em tempo real.");
      return;
    }
    stopLocate();
  }

  async function toggleFullscreen() {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await wrapperRef.current.requestFullscreen();
  }

  function zoomIn() { mapRef.current?.zoomIn(); }
  function zoomOut() { mapRef.current?.zoomOut(); }
  function fitAll() {
    if (!mapRef.current || !rows.length) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const withCoord = rows.filter((r) => r.latitude != null && r.longitude != null);
      if (!withCoord.length) return;
      const bounds = L.latLngBounds(withCoord.map((r) => [r.latitude!, r.longitude!]));
      mapRef.current!.fitBounds(bounds.pad(0.2));
    })();
  }

  const locateBtnClass =
    locateMode === "follow" ? "bg-blue-600 text-white border-blue-700 animate-pulse"
      : locateMode === "once" ? "bg-blue-600 text-white border-blue-700"
      : "bg-card hover:bg-muted";
  const locateTitle =
    locateMode === "off" ? "Centralizar na minha localização"
      : locateMode === "once" ? "Toque de novo para seguir em tempo real"
      : "Toque para parar de seguir";

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full ${isFullscreen ? "h-screen bg-background" : "h-[65vh] md:h-[70vh] min-h-[380px]"} rounded-lg border overflow-hidden`}
      style={{ cursor: "grab" }}
    >
      <div ref={mapDivRef} className="absolute inset-0" />

      {/* Legenda */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-card/95 backdrop-blur border rounded-md px-2 py-1.5 text-[10px] shadow-sm hidden sm:flex items-center gap-2 flex-wrap max-w-[200px]">
        {Object.entries({ nao: DEFAULT_PIN, ...ACTION_COLORS }).slice(0, 4).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: c.bg, borderColor: c.ring }} />
            {c.label}
          </span>
        ))}
      </div>

      {/* Controles top-right */}
      <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-1">
        <button type="button" onClick={zoomIn} title="Aproximar" className="h-9 w-9 bg-card border rounded-md shadow-sm hover:bg-muted flex items-center justify-center">
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={zoomOut} title="Afastar" className="h-9 w-9 bg-card border rounded-md shadow-sm hover:bg-muted flex items-center justify-center">
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" onClick={fitAll} title="Enquadrar todos os pins" className="h-9 w-9 bg-card border rounded-md shadow-sm hover:bg-muted flex items-center justify-center">
          <MapPin className="h-4 w-4" />
        </button>
        <button type="button" onClick={toggleFullscreen} title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"} className="h-9 w-9 bg-card border rounded-md shadow-sm hover:bg-muted flex items-center justify-center">
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* GPS */}
      <button
        type="button"
        onClick={handleLocate}
        disabled={locating}
        aria-label={locateTitle}
        title={locateTitle}
        className={`absolute bottom-4 right-3 z-[1000] h-12 w-12 rounded-full border shadow-lg flex items-center justify-center transition-colors disabled:opacity-70 ${locateBtnClass}`}
      >
        {locating ? <RefreshCw className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
      </button>

      {/* Scroll hint desktop */}
      {showScrollHint && (
        <div className="absolute inset-0 z-[1001] flex items-center justify-center pointer-events-none">
          <div className="bg-black/70 text-white text-sm px-4 py-2 rounded-md shadow-lg animate-in fade-in">
            Use <kbd className="px-1.5 py-0.5 rounded bg-white/20 mx-1">Ctrl</kbd> + scroll para dar zoom
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// ---------- Contact detail panel ----------
function MapDetailPanel({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const detailFn = useServerFn(getMapContactDetail);
  const quickFn = useServerFn(listQuickReplies);
  const sendFn = useServerFn(sendDirectMessage);
  const logFn = useServerFn(logTerritoryAction);
  const resetFn = useServerFn(resetTerritoryContact);
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ["map-detail", contactId],
    queryFn: () => detailFn({ data: { id: contactId } }),
  });
  const quickReplies = useQuery({ queryKey: ["quick-replies"], queryFn: () => quickFn() });

  const [message, setMessage] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [showSend, setShowSend] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const invalidateAfterField = () => {
    qc.invalidateQueries({ queryKey: ["map-contacts"] });
    qc.invalidateQueries({ queryKey: ["map-detail", contactId] });
    qc.invalidateQueries({ queryKey: ["territory-contacts"] });
    qc.invalidateQueries({ queryKey: ["territory-contact-logs"] });
    qc.invalidateQueries({ queryKey: ["territory-summary-today"] });
  };

  const send = useMutation({
    mutationFn: () => sendFn({ data: { contact_id: contactId, message, origem: "mapa", template_id: templateId || undefined } }),
    onSuccess: () => { toast.success("Mensagem enviada."); setMessage(""); setTemplateId(""); setShowSend(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const logField = useMutation({
    mutationFn: (v: { action: "contato_realizado" | "nao_encontrado" | "observacao" | "whatsapp_aberto"; note?: string }) =>
      logFn({ data: { contactId, action: v.action, note: v.note } }),
    onSuccess: (_, v) => {
      if (v.action === "contato_realizado") toast.success("Contato registrado");
      else if (v.action === "nao_encontrado") toast.success("Marcado como não encontrado");
      else if (v.action === "observacao") toast.success("Observação salva");
      setNoteText(""); setShowNote(false);
      invalidateAfterField();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: () => resetFn({ data: { contactId } }),
    onSuccess: () => { toast.success("Contato voltou para 'Ainda não abordado'."); invalidateAfterField(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const regeocodeFn = useServerFn(regeocodeOne);
  const regeocodeMut = useMutation({
    mutationFn: () => regeocodeFn({ data: { contactId } }),
    onSuccess: (r) => {
      const label = r.precision ? PRECISION_LABEL[r.precision as Precision] : "sem sucesso";
      toast.success(`Refino concluído: ${label}.`);
      invalidateAfterField();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ESC fecha (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Swipe-down para fechar (mobile)
  const sheetRef = useRef<HTMLElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragDelta = useRef<number>(0);
  function onHandleTouchStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY; dragDelta.current = 0; }
  function onHandleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current == null || !sheetRef.current) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) { dragDelta.current = dy; sheetRef.current.style.transform = `translateY(${dy}px)`; }
  }
  function onHandleTouchEnd() {
    if (!sheetRef.current) return;
    if (dragDelta.current > 90) { onClose(); }
    else sheetRef.current.style.transform = "";
    dragStartY.current = null; dragDelta.current = 0;
  }

  const c = detail.data?.contact;
  const lastAction = detail.data?.last_action ?? null;
  const address = useMemo(() => c ? buildAddressString(c) : "", [c]);

  const rawPhone = c?.phone_e164?.replace(/\D/g, "") ?? "";
  const canWa = !!rawPhone && !c?.opt_out_at;
  const waHref = `https://wa.me/${rawPhone}${c?.nome ? `?text=${encodeURIComponent(`Olá ${c.nome.split(" ")[0]}, `)}` : ""}`;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="md:hidden fixed inset-0 bg-black/40 z-[1100]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        ref={sheetRef}
        className="fixed md:static bottom-0 inset-x-0 md:inset-auto z-[1101] md:z-auto w-full md:w-[400px] shrink-0 border-t md:border-t-0 md:border-l bg-card overflow-hidden max-h-[85vh] md:max-h-none rounded-t-2xl md:rounded-none shadow-2xl md:shadow-none animate-in slide-in-from-bottom md:slide-in-from-right md:flex md:flex-col md:h-full transition-transform"
        style={{ willChange: "transform" }}
      >
        {/* Handle mobile */}
        <div
          className="md:hidden flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <span className="block h-1.5 w-10 rounded-full bg-muted-foreground/40" />
        </div>

        <div className="px-4 pb-3 pt-1 md:pt-4 border-b flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-base truncate">{c?.nome ?? "Carregando…"}</div>
            {lastAction && (
              <div className="text-[11px] mt-0.5">
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: (ACTION_COLORS[lastAction.action] ?? DEFAULT_PIN).bg + "22", color: (ACTION_COLORS[lastAction.action] ?? DEFAULT_PIN).ring }}
                >
                  {(ACTION_COLORS[lastAction.action] ?? DEFAULT_PIN).label} · {new Date(lastAction.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted shrink-0" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 max-h-[calc(85vh-4rem)] md:max-h-none">
          {detail.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}

          {c && (
            <div className="p-4 space-y-4">
              {/* Badges */}
              <div className="flex flex-wrap gap-1">
                {c.tipo_contato && <span className="px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary">{c.tipo_contato}</span>}
                {c.profissao && <span className="px-2 py-0.5 rounded-full text-[11px] bg-muted">{c.profissao}</span>}
                {c.consentimento_whatsapp && <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-100 text-emerald-700">WhatsApp OK</span>}
                {c.opt_out_at && <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-700">opt-out</span>}
                {c.lifecycle_status === "importado_aguardando_recadastro" && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-700">recadastro</span>
                )}
                {(detail.data?.tags ?? []).map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-700">{t}</span>
                ))}
              </div>

              {/* Telefone */}
              {c.phone_e164 && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono">{c.phone_e164}</span>
                  <button
                    onClick={() => copyToClipboard(c.phone_e164!, "Telefone copiado")}
                    className="ml-auto p-1 rounded hover:bg-muted"
                    aria-label="Copiar telefone"
                    title="Copiar telefone"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Endereço */}
              <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-sm leading-snug flex-1 min-w-0">
                    {c.endereco ? (
                      <>
                        <div>{c.endereco}{c.numero ? `, ${c.numero}` : ""}</div>
                        {c.complemento && <div className="text-xs text-muted-foreground">{c.complemento}</div>}
                        <div className="text-xs text-muted-foreground">
                          {[c.bairro, c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade].filter(Boolean).join(" · ")}
                        </div>
                        {c.cep && <div className="text-xs text-muted-foreground">CEP {c.cep}</div>}
                      </>
                    ) : (
                      <div className="text-muted-foreground">
                        {[c.bairro, c.cidade, c.uf].filter(Boolean).join(" · ") || "Sem endereço"}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => copyToClipboard(address || [c.bairro, c.cidade, c.uf].filter(Boolean).join(", "), "Endereço copiado")}
                    className="h-9 rounded-md border bg-background text-xs inline-flex items-center justify-center gap-1 hover:bg-muted"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </button>
                  <a
                    href={googleMapsUrl(c.latitude, c.longitude, address, c.nome)}
                    target="_blank" rel="noreferrer"
                    className="h-9 rounded-md border bg-background text-xs inline-flex items-center justify-center gap-1 hover:bg-muted"
                    title={isMobile() ? "Abrir no app de mapas" : "Abrir no Google Maps"}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Maps
                  </a>
                  <a
                    href={googleMapsDirectionsUrl(c.latitude, c.longitude, address)}
                    target="_blank" rel="noreferrer"
                    className="h-9 rounded-md bg-primary text-primary-foreground text-xs inline-flex items-center justify-center gap-1 hover:opacity-90"
                    title="Traçar rota até aqui"
                  >
                    <Navigation className="h-3.5 w-3.5" /> Rota
                  </a>
                </div>
                <PrecisionBadge
                  precision={(c as { geocoding_precision?: Precision | null }).geocoding_precision ?? null}
                  onRefine={() => regeocodeMut.mutate()}
                  loading={regeocodeMut.isPending}
                  hasFullAddress={!!(c.endereco && c.numero && c.cidade)}
                />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ação de campo</div>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={canWa ? waHref : undefined}
                    onClick={() => { if (canWa) logField.mutate({ action: "whatsapp_aberto" }); }}
                    target="_blank" rel="noreferrer"
                    aria-disabled={!canWa}
                    className={`h-11 rounded-md inline-flex items-center justify-center gap-1.5 text-sm font-medium ${
                      canWa ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-muted text-muted-foreground pointer-events-none"
                    }`}
                  >
                    <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
                  </a>
                  <button
                    disabled={logField.isPending}
                    onClick={() => logField.mutate({ action: "contato_realizado" })}
                    className="h-11 rounded-md inline-flex items-center justify-center gap-1.5 text-sm font-medium border hover:bg-accent disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Contato feito
                  </button>
                  <button
                    disabled={logField.isPending}
                    onClick={() => logField.mutate({ action: "nao_encontrado" })}
                    className="h-10 rounded-md inline-flex items-center justify-center gap-1.5 text-xs font-medium border hover:bg-accent disabled:opacity-60"
                  >
                    <UserX className="h-3.5 w-3.5" /> Não encontrado
                  </button>
                  <button
                    onClick={() => { setShowNote((v) => !v); setNoteText(""); }}
                    className="h-10 rounded-md inline-flex items-center justify-center gap-1.5 text-xs font-medium border hover:bg-accent"
                  >
                    <StickyNote className="h-3.5 w-3.5" /> {showNote ? "Cancelar" : "Observação"}
                  </button>
                </div>

                {showNote && (
                  <div className="space-y-2">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      maxLength={500}
                      rows={2}
                      placeholder="Anote algo curto sobre este contato…"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowNote(false)} className="h-9 px-3 rounded-md border text-xs">Cancelar</button>
                      <button
                        disabled={!noteText.trim() || logField.isPending}
                        onClick={() => logField.mutate({ action: "observacao", note: noteText.trim() })}
                        className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => setShowHistory(true)}
                    className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border hover:bg-muted"
                  >
                    <History className="h-3.5 w-3.5" /> Ver histórico
                  </button>
                  {lastAction && (
                    <button
                      disabled={resetMut.isPending}
                      onClick={() => {
                        if (window.confirm("Voltar este contato para 'Ainda não abordado'? Isso apaga o histórico de campo (as observações são mantidas).")) {
                          resetMut.mutate();
                        }
                      }}
                      className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:underline disabled:opacity-60"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Voltar para "Não abordado"
                    </button>
                  )}
                </div>
              </div>

              {/* Timeline curta */}
              {detail.data && detail.data.timeline.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Últimas interações</div>
                  <ul className="space-y-1 text-xs">
                    {detail.data.timeline.slice(0, 3).map((t, i) => (
                      <li key={i} className="flex justify-between gap-2 border-b pb-1">
                        <span className="truncate">
                          <b>{(ACTION_COLORS[t.action] ?? DEFAULT_PIN).label}</b>
                          {t.note && <span className="text-muted-foreground"> — {t.note}</span>}
                        </span>
                        <span className="text-muted-foreground shrink-0">{new Date(t.created_at).toLocaleDateString("pt-BR")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ficha completa */}
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Link
                  to="/contatos/$id"
                  params={{ id: contactId }}
                  className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-md border hover:bg-muted"
                >
                  Abrir ficha completa <ExternalLink className="h-3 w-3" />
                </Link>
                {!c.opt_out_at && c.phone_e164 && !showSend && (
                  <button
                    onClick={() => setShowSend(true)}
                    className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-md border hover:bg-muted"
                  >
                    <Send className="h-3 w-3" /> Envio rápido pelo app
                  </button>
                )}
              </div>

              {/* Envio rápido (colapsável) */}
              {!c.opt_out_at && c.phone_e164 && showSend && (
                <div className="border-t pt-4 space-y-2">
                  <div className="text-sm font-semibold flex items-center gap-1"><Send className="h-3.5 w-3.5" /> Envio rápido</div>
                  <select
                    className="w-full border rounded-md h-9 px-2 text-sm bg-background"
                    value={templateId}
                    onChange={(e) => {
                      setTemplateId(e.target.value);
                      const t = (quickReplies.data ?? []).find((q) => q.id === e.target.value);
                      if (t) setMessage(t.body);
                    }}
                  >
                    <option value="">Escolher template (opcional)</option>
                    {(quickReplies.data ?? []).map((q) => (
                      <option key={q.id} value={q.id}>{q.title}</option>
                    ))}
                  </select>
                  <Textarea
                    rows={4}
                    placeholder="Escreva a mensagem…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <Button size="sm" className="w-full" disabled={!message.trim() || send.isPending} onClick={() => send.mutate()}>
                    {send.isPending ? "Enviando…" : "Enviar WhatsApp"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Suporta variáveis: {"{{nome}}"}, {"{{primeiro_nome}}"}, {"{{cidade}}"}, {"{{bairro}}"}.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {c && (
        <TerritoryContactLogDrawer
          contact={{
            id: c.id,
            nome: c.nome,
            phone_e164: c.phone_e164,
            bairro: c.bairro,
            cidade: c.cidade,
            uf: c.uf,
          }}
          open={showHistory}
          onOpenChange={(o) => setShowHistory(o)}
        />
      )}
    </>
  );
}
