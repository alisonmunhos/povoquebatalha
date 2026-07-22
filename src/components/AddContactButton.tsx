// Botão global "+ Adicionar contato".
// Duas ações por tipo (Cadastro completo / Receber informações):
// 1) Preencher agora → formulário progressivo:
//    Fase 1: Nome + WhatsApp → "Salvar rápido" (cria contato imediatamente, sem
//    disparar automação; a tela NÃO fecha).
//    Fase 2 (revelada após salvar): formas de ajuda (botões grandes), demais
//    campos da ficha, Coletivo Alicerce OBRIGATÓRIO. Ao salvar cadastro
//    completo dispara a mesma automação de confirmação do /recadastro.
// 2) Gerar link rastreável → comportamento anterior.
import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Copy, ExternalLink, MessageCircle, Loader2,
  ClipboardList, Megaphone, ArrowLeft, PencilLine, Link2, Check, CheckCircle2, QrCode,
} from "lucide-react";
import { toast } from "sonner";
import { createTrackedLink } from "@/lib/tracked-links.functions";
import { quickSaveContact, completeInlineContact } from "@/lib/inline-contact.functions";
import { generateQrDataUrl } from "@/lib/qr-code-browser";
import { useCepLookup, formatCep } from "@/hooks/use-cep";

type SourceModule =
  | "gestao_base" | "territorio" | "agitacao" | "mapa"
  | "inbox" | "ficha_contato" | "relacionamento" | "link_publico";

type FormType = "cadastro_completo" | "receber_informacoes";

function deriveModuleFromPath(path: string): SourceModule {
  if (path.startsWith("/agitacao")) return "agitacao";
  if (path.startsWith("/territorio")) return "territorio";
  if (path.startsWith("/mapa")) return "mapa";
  if (path.startsWith("/comunicacao") || path.startsWith("/inbox")) return "inbox";
  if (path.startsWith("/contatos/") && path.length > 10) return "ficha_contato";
  if (path.startsWith("/relacionamento")) return "relacionamento";
  if (path.startsWith("/links")) return "link_publico";
  return "gestao_base";
}

function moduleLabel(m: SourceModule): string {
  const map: Record<SourceModule, string> = {
    gestao_base: "Gestão da Base",
    territorio: "Território",
    agitacao: "Agitação",
    mapa: "Mapa",
    inbox: "Inbox",
    ficha_contato: "Ficha do contato",
    relacionamento: "Relacionamento",
    link_publico: "Links públicos",
  };
  return map[m];
}

// Mesmas opções de /recadastro (FORMAS_AJUDA_OPTS).
const FORMAS_AJUDA_OPTS: Array<{ value: string; label: string }> = [
  { value: "panfletagem_banquinha", label: "Panfletagem / Banquinha" },
  { value: "compartilhar_whatsapp", label: "Compartilhar material no WhatsApp" },
  { value: "compartilhar_redes", label: "Compartilhar nas redes sociais" },
  { value: "participar_eventos", label: "Participar de eventos" },
  { value: "ajudar_organizacao", label: "Ajudar na organização" },
  { value: "mobilizar_bairro", label: "Mobilizar pessoas do bairro" },
  { value: "adesivar_carro", label: "Quero adesivar meu carro" },
  { value: "plaquinha_casa", label: "Quero colocar uma plaquinha na frente de casa" },
  { value: "receber_panfletos", label: "Receber panfletos e adesivos" },
  { value: "outro", label: "Outro" },
];

type Props = { userName?: string | null; className?: string; compact?: boolean };

export function AddContactButton({ userName, className, compact }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size={compact ? "sm" : "default"}
        onClick={() => setOpen(true)}
        className={className}
      >
        <Plus className="h-4 w-4" />
        {compact ? "Adicionar" : "Adicionar contato"}
      </Button>
      {open && <AddContactModal userName={userName} onClose={() => setOpen(false)} />}
    </>
  );
}

type Step =
  | { kind: "choose_action" }
  | { kind: "fill" }
  | { kind: "choose_link_type" }
  | { kind: "link"; type: FormType; token: string };

function AddContactModal({ userName, onClose }: { userName?: string | null; onClose: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const module = deriveModuleFromPath(path);
  const create = useServerFn(createTrackedLink);

  const [step, setStep] = useState<Step>({ kind: "choose_action" });
  const [busy, setBusy] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");

  async function generateLink(type: FormType) {
    const label = linkLabel.trim();
    if (label.length < 2) {
      toast.error("Informe um nome para o link (ex.: Panfletagem praça central).");
      return;
    }
    setBusy(true);
    try {
      const r = await create({ data: { source_module: module, source_form_type: type, label } });
      setStep({ kind: "link", type, token: r.link.token });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar link");
    } finally {
      setBusy(false);
    }
  }

  const title = step.kind === "choose_action"
    ? "Adicionar contato"
    : step.kind === "fill"
      ? "Novo contato"
      : step.kind === "choose_link_type"
        ? "Gerar link — escolha o tipo"
        : "Link gerado";

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step.kind === "choose_action" && "Preencha na hora ou gere um link rastreável para a pessoa preencher sozinha."}
            {step.kind === "fill" && "Comece com nome e WhatsApp. Depois complete a ficha se quiser."}
            {step.kind === "choose_link_type" && "Escolha o formulário para onde o link vai apontar."}
            {step.kind === "link" && "Link rastreável — copie, abra ou envie por WhatsApp."}
          </DialogDescription>
        </DialogHeader>

        {step.kind === "choose_action" && (
          <>
            <div className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
              Registrado como criado por{" "}
              <strong className="text-foreground">{userName ?? "você"}</strong>
              {" · "}Origem: <strong className="text-foreground">{moduleLabel(module)}</strong>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-2">
              <ActionCard
                icon={<PencilLine className="h-5 w-5" />}
                title="Preencher agora"
                desc="Digite com a pessoa do lado. Salva na hora e permite completar a ficha depois."
                onClick={() => setStep({ kind: "fill" })}
              />
              <ActionCard
                icon={<Link2 className="h-5 w-5" />}
                title="Gerar link"
                desc="Envie por WhatsApp para a pessoa preencher sozinha."
                onClick={() => setStep({ kind: "choose_link_type" })}
              />
            </div>
          </>
        )}

        {step.kind === "choose_link_type" && (
          <div className="space-y-3">
            <Field label="Nome do link (obrigatório)" hint="Esse nome aparece nos filtros como ponto de rastreio — ex.: Reunião do bairro X.">
              <Input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Ex.: Panfletagem praça central"
                maxLength={120}
              />
            </Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <TypeCard
                icon={<ClipboardList className="h-6 w-6" />}
                title="Formulário de cadastro"
                desc="Ficha completa: dados pessoais, endereço e consentimento."
                busy={busy}
                onClick={() => generateLink("cadastro_completo")}
              />
              <TypeCard
                icon={<Megaphone className="h-6 w-6" />}
                title="Receber informações"
                desc="Formulário curto — nome, WhatsApp e cidade para receber comunicados."
                busy={busy}
                onClick={() => generateLink("receber_informacoes")}
              />
            </div>
            <BackButton onClick={() => setStep({ kind: "choose_action" })} />
          </div>
        )}

        {step.kind === "fill" && (
          <ProgressiveFillForm
            type="cadastro_completo"
            module={module}
            onBack={() => setStep({ kind: "choose_action" })}
            onDone={() => onClose()}
          />
        )}

        {step.kind === "link" && (
          <>
            <LinkResult
              url={(() => {
                const p = step.type === "cadastro_completo" ? "/atualizacao" : "/inscrever";
                return `${window.location.origin}${p}?ref=${step.token}`;
              })()}
            />
            <BackButton onClick={() => setStep({ kind: "choose_link_type" })} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TypeCard({
  icon, title, desc, busy, onClick,
}: { icon: React.ReactNode; title: string; desc: string; busy?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-left rounded-xl border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors p-4 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-2 text-primary">
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : icon}
      </div>
      <div className="mt-2 font-semibold text-sm">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
    </button>
  );
}

function ActionCard({
  icon, title, desc, busy, onClick,
}: { icon: React.ReactNode; title: string; desc: string; busy?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-left rounded-xl border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors p-4 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-2 text-primary">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
      </div>
      <div className="mt-2 font-semibold text-sm">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
    </button>
  );
}

function BackButton({ onClick, label = "Voltar" }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="mt-2">
      <ArrowLeft className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}

function ProgressiveFillForm({
  type, module, onBack, onDone,
}: { type: FormType; module: SourceModule; onBack: () => void; onDone: () => void }) {
  const quickFn = useServerFn(quickSaveContact);
  const completeFn = useServerFn(completeInlineContact);
  const cepHook = useCepLookup();

  // Fase 1
  const [nome, setNome] = useState("");
  const [phone, setPhone] = useState("");
  const [savingQuick, setSavingQuick] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);

  // Fase 2
  const [formasAjuda, setFormasAjuda] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [profissao, setProfissao] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [referencia, setReferencia] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [comoConheceu, setComoConheceu] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [coletivoAlicerce, setColetivoAlicerce] = useState<"" | "sim" | "nao">("");
  const [savingFull, setSavingFull] = useState(false);
  const [fullError, setFullError] = useState<string | null>(null);
  const fase2Ref = useRef<HTMLFormElement>(null);

  // O passo 2 (ficha completa) some no rodapé do modal depois de "Salvar
  // rápido" — sem rolar até ele, no celular parece que a tela não abriu.
  useEffect(() => {
    if (contactId) {
      fase2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [contactId]);

  function toggleForma(v: string) {
    setFormasAjuda((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  }

  async function onCepChange(v: string) {
    const formatted = formatCep(v);
    setCep(formatted);
    const digits = formatted.replace(/\D/g, "");
    if (digits.length !== 8) return;
    const res = await cepHook.lookup(digits);
    if (res) {
      if (res.endereco) setEndereco(res.endereco);
      if (res.bairro) setBairro(res.bairro);
      if (res.cidade) setCidade(res.cidade);
      if (res.uf) setUf(res.uf);
    }
  }

  async function saveQuick(e: React.FormEvent) {
    e.preventDefault();
    setQuickError(null);
    if (nome.trim().length < 2) { setQuickError("Digite o nome."); return; }
    if (phone.trim().length < 8) { setQuickError("Digite o WhatsApp com DDD."); return; }
    setSavingQuick(true);
    try {
      const r = await quickFn({ data: { source_module: module, form_type: type, nome: nome.trim(), phone: phone.trim() } });
      setContactId(r.contact_id);
      toast.success("Contato salvo. Complete os dados abaixo quando quiser.");
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSavingQuick(false);
    }
  }

  async function saveComplete(e: React.FormEvent) {
    e.preventDefault();
    setFullError(null);
    if (!contactId) { setFullError("Salve o contato antes."); return; }
    if (coletivoAlicerce === "") { setFullError("Informe se faz parte do Coletivo Alicerce."); return; }
    setSavingFull(true);
    try {
      await completeFn({
        data: {
          contact_id: contactId,
          source_module: module,
          form_type: type,
          nome: nome.trim(),
          phone: phone.trim(),
          email: email.trim(),
          profissao: profissao.trim(),
          cep: cep.trim(),
          endereco: endereco.trim(),
          numero: numero.trim(),
          complemento: complemento.trim(),
          referencia: referencia.trim(),
          bairro: bairro.trim(),
          cidade: cidade.trim(),
          uf: uf.trim(),
          como_conheceu: comoConheceu.trim(),
          observacoes: observacoes.trim(),
          formas_ajuda: formasAjuda,
          formas_ajuda_outro: "",
          coletivo_alicerce: coletivoAlicerce === "sim",
        },
      });
      toast.success("Cadastro completo salvo. Mensagem de confirmação enviada.");
      onDone();
    } catch (err) {
      setFullError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSavingFull(false);
    }
  }

  const savedQuick = !!contactId;

  return (
    <div className="space-y-6">
      {/* Fase 1 — Nome + WhatsApp + Salvar rápido */}
      <form onSubmit={saveQuick} className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Passo 1 — Dados básicos</div>
            <div className="text-xs text-muted-foreground">Salva na hora. Sem consentimento aqui: se completar depois, o WhatsApp de confirmação é disparado automaticamente.</div>
          </div>
          {savedQuick && <span className="text-emerald-700 text-xs inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Salvo</span>}
        </div>
        <Field label="Nome *">
          <Input required disabled={savedQuick} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field label="WhatsApp (com DDD) *">
          <Input required disabled={savedQuick} inputMode="tel" placeholder="(11) 91234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {quickError && <p className="text-sm text-destructive">{quickError}</p>}
        {!savedQuick && (
          <div className="flex justify-between gap-2 pt-1">
            <BackButton onClick={onBack} />
            <Button type="submit" disabled={savingQuick}>
              {savingQuick ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {savingQuick ? "Salvando…" : "Salvar rápido"}
            </Button>
          </div>
        )}
      </form>

      {/* Fase 2 — só após salvar */}
      {savedQuick && (
        <form ref={fase2Ref} onSubmit={saveComplete} className="space-y-5">
          {/* Formas de ajuda — botões grandes */}
          <section className="space-y-2">
            <div className="text-sm font-semibold">Como pode ajudar?</div>
            <div className="text-xs text-muted-foreground">Toque nas formas que fizerem sentido.</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {FORMAS_AJUDA_OPTS.map((o) => {
                const active = formasAjuda.includes(o.value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => toggleForma(o.value)}
                    className={`text-left rounded-lg border-2 px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-input bg-background hover:border-emerald-300 hover:bg-emerald-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {active && <Check className="h-4 w-4 shrink-0" />}
                      {o.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Ficha completa — mesmos campos da Gestão da Base */}
          <section className="space-y-3">
            <div className="text-sm font-semibold border-b pb-1">Dados adicionais</div>
            <Field label="E-mail">
              <Input type="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Profissão / ocupação">
              <Input maxLength={120} value={profissao} onChange={(e) => setProfissao(e.target.value)} />
            </Field>

            <div className="grid grid-cols-3 gap-2">
              <Field label={cepHook.loading ? "CEP (buscando…)" : "CEP"}>
                <Input maxLength={9} value={cep} inputMode="numeric" onChange={(e) => onCepChange(e.target.value)} />
              </Field>
              <Field label="UF">
                <Input maxLength={2} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} />
              </Field>
              <Field label="Cidade">
                <Input maxLength={120} value={cidade} onChange={(e) => setCidade(e.target.value)} />
              </Field>
            </div>
            <Field label="Bairro">
              <Input maxLength={120} value={bairro} onChange={(e) => setBairro(e.target.value)} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Endereço (rua)" className="col-span-2">
                <Input maxLength={240} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
              </Field>
              <Field label="Número">
                <Input maxLength={20} value={numero} onChange={(e) => setNumero(e.target.value)} />
              </Field>
            </div>
            <Field label="Complemento">
              <Input maxLength={120} value={complemento} onChange={(e) => setComplemento(e.target.value)} />
            </Field>
            <Field label="Ponto de referência">
              <Input maxLength={240} value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </Field>

            <Field label="Como conheceu a campanha?">
              <Input maxLength={240} value={comoConheceu} onChange={(e) => setComoConheceu(e.target.value)} />
            </Field>
            <Field label="Observações">
              <textarea
                rows={3}
                maxLength={2000}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
          </section>

          {/* Coletivo Alicerce — obrigatório */}
          <section className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 space-y-2">
            <div className="text-sm font-semibold text-amber-900">Faz parte do Coletivo Alicerce? *</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setColetivoAlicerce("sim")}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium border-2 ${
                  coletivoAlicerce === "sim"
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "bg-background border-input hover:border-emerald-300"
                }`}
              >Sim</button>
              <button
                type="button"
                onClick={() => setColetivoAlicerce("nao")}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium border-2 ${
                  coletivoAlicerce === "nao"
                    ? "bg-rose-600 border-rose-600 text-white"
                    : "bg-background border-input hover:border-rose-300"
                }`}
              >Não</button>
            </div>
          </section>

          {fullError && <p className="text-sm text-destructive">{fullError}</p>}
          <div className="flex justify-between gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onDone}>Fechar sem completar</Button>
            <Button type="submit" disabled={savingFull}>
              {savingFull ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {savingFull ? "Salvando…" : "Salvar cadastro completo"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p> : null}
      <div className="mt-1">{children}</div>
    </div>
  );
}

function LinkResult({ url }: { url: string }) {
  const waHref = `https://wa.me/?text=${encodeURIComponent(`Olá! Preenche seu cadastro por aqui, por favor:\n${url}`)}`;
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  async function loadQrCode() {
    setLoadingQr(true);
    try {
      const dataUrl = await generateQrDataUrl(url);
      setQrDataUrl(dataUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar QR code");
    } finally {
      setLoadingQr(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input readOnly value={url} className="font-mono text-xs" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copiado"); }}>
          <Copy className="h-3.5 w-3.5" /> Copiar
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Abrir
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={waHref} target="_blank" rel="noreferrer">
            <MessageCircle className="h-3.5 w-3.5" /> Compartilhar WhatsApp
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={loadQrCode} disabled={loadingQr}>
          {loadingQr ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
          {loadingQr ? "Gerando…" : "Gerar QR code"}
        </Button>
      </div>
      {qrDataUrl && (
        <div className="space-y-2">
          <img src={qrDataUrl} alt="QR code do link" className="w-40 h-40 border rounded-md" />
          <a href={qrDataUrl} download="qrcode-link.png" className="text-sm text-primary hover:underline block">Baixar PNG</a>
        </div>
      )}
    </div>
  );
}
