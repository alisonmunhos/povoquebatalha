import { useState, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Upload, FileText, Image as ImageIcon, X, Send, Save, Calendar, MessageSquareText, Users, ArrowRight, ArrowLeft } from "lucide-react";
import {
  getAudienceStats, signCampaignMediaUpload, createCampaignFromSelection,
  startCampaign, listCampaigns,
} from "@/lib/campaigns.functions";
import { listMessageTemplates } from "@/lib/messages.functions";
import { supabase } from "@/integrations/supabase/client";
import type { CrmFilters } from "@/lib/crm-filters";

type Source = { ids: string[]; filters?: never } | { filters: Partial<CrmFilters>; ids?: never };
type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Audience source: either explicit IDs or the active filter set. */
  source: Source;
  labelSelecao: string; // e.g. "12 selecionados" ou "todos do filtro atual"
};

const VARIABLES = ["nome", "primeiro_nome", "cidade", "bairro", "link_atualizacao", "link_inscricao"];

function personalize(tpl: string, c: { nome?: string | null; cidade?: string | null; bairro?: string | null }) {
  const primeiro = (c.nome ?? "").trim().split(/\s+/)[0] ?? "";
  return tpl
    .replaceAll("{{nome}}", c.nome ?? "")
    .replaceAll("{{primeiro_nome}}", primeiro)
    .replaceAll("{{cidade}}", c.cidade ?? "")
    .replaceAll("{{bairro}}", c.bairro ?? "")
    .replaceAll("{{link_atualizacao}}", `${typeof window !== "undefined" ? window.location.origin : ""}/atualizacao`)
    .replaceAll("{{link_inscricao}}", `${typeof window !== "undefined" ? window.location.origin : ""}/inscrever`);
}

export function SendWhatsAppWizard({ open, onOpenChange, source, labelSelecao }: Props) {
  const navigate = useNavigate();
  const audienceFn = useServerFn(getAudienceStats);
  const signFn = useServerFn(signCampaignMediaUpload);
  const createFn = useServerFn(createCampaignFromSelection);
  const startFn = useServerFn(startCampaign);
  const templatesFn = useServerFn(listMessageTemplates);
  const campaignsFn = useServerFn(listCampaigns);

  const [step, setStep] = useState(1);
  const [nomeCampanha, setNomeCampanha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [saveAsTemplate, setSaveAsTemplate] = useState<{ enabled: boolean; title: string }>({ enabled: false, title: "" });
  const [file, setFile] = useState<File | null>(null);
  const [uploadInfo, setUploadInfo] = useState<{ path: string; filename: string; mime: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [schedule, setSchedule] = useState<string>("");
  const [delayMin, setDelayMin] = useState(3000);
  const [delayMax, setDelayMax] = useState(8000);
  const [submitting, setSubmitting] = useState(false);

  const audienceQ = useQuery({
    queryKey: ["audience-stats", source],
    queryFn: () => audienceFn({ data: source }),
    enabled: open,
  });
  const templatesQ = useQuery({ queryKey: ["message-templates"], queryFn: () => templatesFn(), enabled: open });
  const prevCampsQ = useQuery({ queryKey: ["campaigns"], queryFn: () => campaignsFn(), enabled: open });

  useEffect(() => {
    if (!open) {
      setStep(1); setNomeCampanha(""); setMensagem(""); setTemplateId("");
      setSaveAsTemplate({ enabled: false, title: "" });
      setFile(null); setUploadInfo(null); setSchedule("");
      setDelayMin(3000); setDelayMax(8000);
    }
  }, [open]);

  const tipo: "text" | "image" | "document" = useMemo(() => {
    if (!uploadInfo) return "text";
    if (uploadInfo.mime === "application/pdf") return "document";
    return "image";
  }, [uploadInfo]);

  const previewText = useMemo(() => {
    const first = audienceQ.data?.amostra?.[0];
    if (!first) return mensagem;
    return personalize(mensagem, first);
  }, [mensagem, audienceQ.data]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = (templatesQ.data ?? []).find((x) => x.id === id);
    if (t) { setMensagem(t.body); if (!nomeCampanha) setNomeCampanha(t.title); }
  }
  function applyCampaignBody(id: string) {
    const c = prevCampsQ.data?.rows.find((x) => x.id === id);
    if (!c) return;
    // fetch template of that campaign lazily — just use its name suggestion
    if (!nomeCampanha) setNomeCampanha(`${c.nome} (cópia)`);
  }

  async function onPickFile(f: File | null) {
    setFile(f); setUploadInfo(null);
    if (!f) return;
    const okTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];
    if (!okTypes.includes(f.type)) { toast.error("Envie PNG, JPG, WEBP ou PDF."); return; }
    if (f.size > 15 * 1024 * 1024) { toast.error("Máx. 15MB."); return; }
    setUploading(true);
    try {
      const s = await signFn({ data: { filename: f.name, contentType: f.type } });
      const up = await supabase.storage.from("campaign-media").uploadToSignedUrl(s.path, s.token, f, {
        contentType: f.type, upsert: true,
      });
      if (up.error) throw up.error;
      setUploadInfo({ path: s.path, filename: s.filename, mime: f.type });
      toast.success("Anexo enviado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setUploading(false); }
  }

  async function submit(mode: "draft" | "sendNow" | "schedule") {
    if (!nomeCampanha.trim()) return toast.error("Dê um nome à campanha.");
    if (!mensagem.trim()) return toast.error("Escreva a mensagem.");
    if (mode === "schedule" && !schedule) return toast.error("Defina data/hora para agendar.");
    if (!audienceQ.data?.aptos) return toast.error("Nenhum contato apto.");

    setSubmitting(true);
    try {
      const payload = {
        nome: nomeCampanha.trim(),
        ids: source.ids,
        filters: source.filters,
        template_id: templateId || null,
        mensagem_template: mensagem,
        tipo,
        midia_path: uploadInfo?.path ?? null,
        midia_filename: uploadInfo?.filename ?? null,
        midia_mime: uploadInfo?.mime ?? null,
        agendado_para: mode === "schedule" ? new Date(schedule).toISOString() : null,
        delay_min_ms: delayMin,
        delay_max_ms: delayMax,
        save_as_template: saveAsTemplate.enabled && saveAsTemplate.title.trim()
          ? { title: saveAsTemplate.title.trim() } : undefined,
      };
      const r = await createFn({ data: payload });
      if (mode === "sendNow") {
        await startFn({ data: { id: r.id } });
        toast.success(`Campanha criada e enviando para ${r.total} contatos`);
      } else if (mode === "schedule") {
        toast.success(`Campanha agendada para ${r.total} contatos`);
      } else {
        toast.success(`Rascunho criado com ${r.total} destinatários`);
      }
      onOpenChange(false);
      navigate({ to: "/campanhas/$id", params: { id: r.id } });
    } catch (e) { toast.error((e as Error).message); }
    finally { setSubmitting(false); }
  }

  const aud = audienceQ.data;
  const canNext1 = (aud?.aptos ?? 0) > 0;
  const canNext2 = mensagem.trim().length > 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" /> Enviar WhatsApp — Passo {step} de 6
          </DialogTitle>
        </DialogHeader>

        {/* PASSO 1 — PÚBLICO */}
        {step === 1 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4" /> Público — {labelSelecao}</div>
            {audienceQ.isLoading && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Verificando…</div>}
            {aud && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <Stat label="Selecionados / no filtro" value={aud.total} tone="neutral" />
                <Stat label="Aptos para envio" value={aud.aptos} tone="ok" />
                <Stat label="Sem consentimento" value={aud.semConsent} tone="warn" />
                <Stat label="Opt-out (não enviar)" value={aud.optOut} tone="warn" />
                <Stat label="Arquivados" value={aud.arquivados} tone="warn" />
                <Stat label="Sem telefone válido" value={aud.semTelefone} tone="warn" />
              </div>
            )}
            <p className="text-xs text-muted-foreground">Apenas os <b>aptos</b> receberão mensagens. Contatos sem consentimento, opt-out ou arquivados são ignorados por padrão.</p>
          </section>
        )}

        {/* PASSO 2 — MENSAGEM */}
        {step === 2 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium"><MessageSquareText className="h-4 w-4" /> Mensagem</div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Usar mensagem salva</Label>
                <select value={templateId} onChange={(e) => applyTemplate(e.target.value)} className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="">— nova mensagem —</option>
                  <optgroup label="Respostas prontas">
                    {(templatesQ.data ?? []).filter((t) => t.kind === "quick_reply").map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </optgroup>
                  <optgroup label="Mensagens do sistema">
                    {(templatesQ.data ?? []).filter((t) => t.kind === "system").map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </optgroup>
                </select>
              </div>
              <div>
                <Label className="text-xs">Ou copiar de campanha anterior</Label>
                <select onChange={(e) => e.target.value && applyCampaignBody(e.target.value)} className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="">— escolher —</option>
                  {(prevCampsQ.data?.rows ?? []).slice(0, 30).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            <Textarea rows={8} placeholder="Digite a mensagem. Use {{primeiro_nome}}, {{cidade}}, {{link_atualizacao}}…" value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
            <div className="flex flex-wrap gap-1">
              {VARIABLES.map((v) => (
                <button key={v} type="button" onClick={() => setMensagem((m) => m + ` {{${v}}}`)} className="text-[11px] px-2 py-1 rounded bg-muted hover:bg-accent">{`{{${v}}}`}</button>
              ))}
            </div>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={saveAsTemplate.enabled} onChange={(e) => setSaveAsTemplate({ ...saveAsTemplate, enabled: e.target.checked })} className="mt-0.5" />
              <span>Salvar este texto como <b>Resposta pronta</b> reutilizável</span>
            </label>
            {saveAsTemplate.enabled && (
              <Input placeholder="Nome da mensagem salva" value={saveAsTemplate.title} onChange={(e) => setSaveAsTemplate({ ...saveAsTemplate, title: e.target.value })} />
            )}
          </section>
        )}

        {/* PASSO 3 — PERSONALIZAÇÃO / PRÉVIA */}
        {step === 3 && (
          <section className="space-y-3">
            <div className="text-sm font-medium">Prévia personalizada</div>
            {aud?.amostra?.length ? (
              <div className="space-y-2">
                {aud.amostra.map((c) => (
                  <div key={c.id} className="border rounded p-3 bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-1">Para {c.nome} — {c.phone_e164}</div>
                    <div className="text-sm whitespace-pre-wrap">{personalize(mensagem, c)}</div>
                  </div>
                ))}
              </div>
            ) : <div className="text-sm text-muted-foreground">Sem contatos para prévia.</div>}
            <div className="text-xs text-muted-foreground">Variáveis não preenchidas ficam em branco no envio.</div>
          </section>
        )}

        {/* PASSO 4 — ANEXO */}
        {step === 4 && (
          <section className="space-y-3">
            <div className="text-sm font-medium">Anexo (opcional)</div>
            <p className="text-xs text-muted-foreground">Envie PNG, JPG, WEBP ou PDF. A imagem/PDF é anexada à mesma mensagem enviada aos contatos.</p>
            {!uploadInfo && (
              <label className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/40">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm">Clique para escolher um arquivo</span>
                <span className="text-xs text-muted-foreground">Máx. 15MB</span>
                <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
            {uploading && <div className="text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</div>}
            {uploadInfo && (
              <div className="border rounded p-3 flex items-center justify-between bg-emerald-50">
                <div className="flex items-center gap-2 text-sm">
                  {uploadInfo.mime === "application/pdf" ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                  <span className="font-medium">{uploadInfo.filename}</span>
                  <Badge variant="outline">{uploadInfo.mime}</Badge>
                </div>
                <button onClick={() => { setUploadInfo(null); setFile(null); }} className="p-1 hover:bg-white rounded"><X className="h-4 w-4" /></button>
              </div>
            )}
            {file && !uploadInfo && !uploading && <div className="text-xs text-red-600">Falha no upload — tente novamente.</div>}
          </section>
        )}

        {/* PASSO 5 — CAMPANHA / AGENDAMENTO */}
        {step === 5 && (
          <section className="space-y-4">
            <div className="text-sm font-medium">Dados da campanha</div>
            <div>
              <Label className="text-xs">Nome da campanha</Label>
              <Input value={nomeCampanha} onChange={(e) => setNomeCampanha(e.target.value)} placeholder="Ex.: Convite evento 15/mar — Porto Alegre" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Agendamento (opcional)</Label>
                <Input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Delay mín. (ms)</Label>
                <Input type="number" value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Delay máx. (ms)</Label>
                <Input type="number" value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">O delay aleatório entre envios reduz risco de bloqueio na Z-API.</p>
          </section>
        )}

        {/* PASSO 6 — CONFIRMAÇÃO */}
        {step === 6 && (
          <section className="space-y-3">
            <div className="text-sm font-medium">Confirmação</div>
            <div className="border rounded p-3 space-y-2 bg-muted/30 text-sm">
              <div><b>Nome:</b> {nomeCampanha || <span className="text-red-600">(faltando)</span>}</div>
              <div><b>Aptos:</b> {aud?.aptos ?? 0} — <b>Ignorados:</b> {(aud?.total ?? 0) - (aud?.aptos ?? 0)}</div>
              <div><b>Anexo:</b> {uploadInfo?.filename ?? "—"}</div>
              <div><b>Agendamento:</b> {schedule ? new Date(schedule).toLocaleString("pt-BR") : "—"}</div>
              <div className="mt-2">
                <b>Mensagem (prévia):</b>
                <div className="border rounded bg-background p-2 whitespace-pre-wrap mt-1">{previewText || mensagem}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Envios já executados não podem ser desfeitos. Você poderá pausar ou cancelar depois na tela da campanha.</p>
          </section>
        )}

        <DialogFooter className="flex flex-wrap gap-2 justify-between">
          <div className="flex gap-2">
            {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {step < 6 && (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
              >
                Próximo <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {step === 6 && (
              <>
                <Button variant="outline" onClick={() => submit("draft")} disabled={submitting}><Save className="h-4 w-4 mr-1" /> Salvar rascunho</Button>
                {schedule && <Button variant="secondary" onClick={() => submit("schedule")} disabled={submitting}><Calendar className="h-4 w-4 mr-1" /> Agendar</Button>}
                <Button onClick={() => submit("sendNow")} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />} Enviar agora
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "neutral" }) {
  const cls = tone === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : tone === "warn" ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-muted border-border text-foreground";
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide">{label}</div>
    </div>
  );
}

// Prevent unused import warnings
void z;
