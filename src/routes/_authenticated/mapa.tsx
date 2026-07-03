import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { listMapContacts, getMapContactDetail } from "@/lib/map.functions";
import { getGeocodingStats, runGeocodingBatch } from "@/lib/geocoding.functions";
import { sendDirectMessage, listQuickReplies } from "@/lib/inbox.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MapPin, RefreshCw, AlertTriangle, X, Send, ExternalLink } from "lucide-react";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    <div className="flex h-[calc(100vh-0px)] w-full">
      <div className="flex-1 min-w-0 p-4 md:p-6 overflow-y-auto">
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

        <div className="text-xs text-muted-foreground mb-2">
          {contacts.data.rows.length} pin(s) no mapa • Clique num pin para abrir o painel lateral
        </div>

        <LeafletMap rows={contacts.data.rows} onSelect={setSelectedId} />
      </div>

      {selectedId && (
        <MapDetailPanel contactId={selectedId} onClose={() => setSelectedId(null)} />
      )}
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

function LeafletMap({ rows, onSelect }: { rows: Row[]; onSelect: (id: string) => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const clusterRef = useRef<import("leaflet").LayerGroup | null>(null);
  const didInitialFitRef = useRef<boolean>(false);
  const rowsSignatureRef = useRef<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 1) Inicializa o mapa uma vez.
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

      const map = L.map(mapDivRef.current, { preferCanvas: true }).setView([-14.235, -51.9253], 4);
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
        maxClusterRadius: 60,
      });
      (map as unknown as { addLayer: (l: import("leaflet").LayerGroup) => void }).addLayer(cluster);

      mapRef.current = map;
      clusterRef.current = cluster;
    })();
    return () => { cancelled = true; };
  }, []);

  // 2) Atualiza marcadores quando 'rows' mudar (sem recriar o mapa).
  useEffect(() => {
    (async () => {
      if (!mapRef.current || !clusterRef.current) return;
      const L = (await import("leaflet")).default;
      const withCoord = rows.filter((r) => r.latitude != null && r.longitude != null);
      const signature = withCoord.map((r) => `${r.id}:${r.latitude},${r.longitude}`).join("|");
      if (signature === rowsSignatureRef.current) return;
      rowsSignatureRef.current = signature;

      const cluster = clusterRef.current as unknown as {
        clearLayers: () => void;
        addLayers: (m: import("leaflet").Marker[]) => void;
      };
      cluster.clearLayers();
      const markers = withCoord.map((r) => {
        const m = L.marker([r.latitude!, r.longitude!]);
        m.bindTooltip(r.nome ?? "(sem nome)");
        m.on("click", () => onSelect(r.id));
        return m;
      });
      cluster.addLayers(markers);

      // fitBounds só no primeiro carregamento válido — não interrompe zoom manual do usuário.
      if (!didInitialFitRef.current && withCoord.length) {
        const bounds = L.latLngBounds(withCoord.map((r) => [r.latitude!, r.longitude!]));
        mapRef.current.fitBounds(bounds.pad(0.2));
        didInitialFitRef.current = true;
      }
    })();
  }, [rows, onSelect]);

  // 3) Fullscreen — corrige tamanho do Leaflet ao entrar/sair.
  useEffect(() => {
    function onChange() {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      window.setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 200);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await wrapperRef.current.requestFullscreen();
    }
  }

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full ${isFullscreen ? "h-screen bg-background" : "h-[70vh]"} rounded-lg border overflow-hidden`}
    >
      <div ref={mapDivRef} className="absolute inset-0" />
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute top-2 right-2 z-[1000] bg-card border rounded-md px-2 py-1.5 text-xs shadow-sm hover:bg-muted"
        title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
      >
        {isFullscreen ? "Sair da tela cheia" : "⛶ Tela cheia"}
      </button>
    </div>
  );
}

function MapDetailPanel({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const detailFn = useServerFn(getMapContactDetail);
  const quickFn = useServerFn(listQuickReplies);
  const sendFn = useServerFn(sendDirectMessage);

  const detail = useQuery({
    queryKey: ["map-detail", contactId],
    queryFn: () => detailFn({ data: { id: contactId } }),
  });
  const quickReplies = useQuery({ queryKey: ["quick-replies"], queryFn: () => quickFn() });

  const [message, setMessage] = useState("");
  const [templateId, setTemplateId] = useState<string>("");

  const send = useMutation({
    mutationFn: () => sendFn({ data: { contact_id: contactId, message, origem: "mapa", template_id: templateId || undefined } }),
    onSuccess: () => { toast.success("Mensagem enviada."); setMessage(""); setTemplateId(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = detail.data?.contact;

  return (
    <aside className="w-full md:w-[380px] shrink-0 border-l bg-card overflow-y-auto h-screen sticky top-0">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="font-semibold truncate">{c?.nome ?? "Carregando…"}</div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>

      {detail.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}

      {c && (
        <div className="p-4 space-y-4">
          <div className="text-sm space-y-1">
            <div className="text-muted-foreground">{[c.bairro, c.cidade, c.uf].filter(Boolean).join(" • ")}</div>
            {c.endereco_completo && <div className="text-xs text-muted-foreground">{c.endereco_completo}</div>}
            {c.phone_e164 && <div className="font-mono text-xs">{c.phone_e164}</div>}
          </div>

          <div className="flex flex-wrap gap-1">
            {c.tipo_contato && <span className="px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary">{c.tipo_contato}</span>}
            {c.profissao && <span className="px-2 py-0.5 rounded-full text-[11px] bg-muted">{c.profissao}</span>}
            {c.consentimento_whatsapp && <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-100 text-emerald-700">WhatsApp OK</span>}
            {c.opt_out_at && <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-700">opt-out</span>}
            {(detail.data?.tags ?? []).map((t) => (
              <span key={t} className="px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-700">{t}</span>
            ))}
          </div>

          {detail.data && detail.data.timeline.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Últimas interações</div>
              <ul className="space-y-1 text-xs">
                {detail.data.timeline.map((t, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b pb-1">
                    <span>{t.action}</span>
                    <span className="text-muted-foreground">{new Date(t.created_at).toLocaleDateString("pt-BR")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Link
              to="/contatos/$id"
              params={{ id: contactId }}
              className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-md border hover:bg-muted"
            >
              Abrir ficha <ExternalLink className="h-3 w-3" />
            </Link>
            {c.phone_e164 && !c.opt_out_at && (
              <a
                href={`https://wa.me/${c.phone_e164.replace(/\D/g, "")}`}
                target="_blank" rel="noreferrer"
                className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-md border hover:bg-muted"
              >
                Abrir no WhatsApp
              </a>
            )}
          </div>

          {!c.opt_out_at && c.phone_e164 && (
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
              <Button
                size="sm"
                className="w-full"
                disabled={!message.trim() || send.isPending}
                onClick={() => send.mutate()}
              >
                {send.isPending ? "Enviando…" : "Enviar WhatsApp"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Suporta variáveis: {"{{nome}}"}, {"{{primeiro_nome}}"}, {"{{cidade}}"}, {"{{bairro}}"}.
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
