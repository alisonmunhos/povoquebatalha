// Botão global "+ Adicionar contato".
// Duas ações por tipo (Cadastro completo / Receber informações):
// 1) Preencher agora → formulário inline que cria o contato imediatamente com
//    source_user_id = usuário logado (aparece na lista de Agitação dele).
// 2) Gerar link rastreável → mesmo comportamento anterior (compartilhar via WhatsApp).
import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Copy, ExternalLink, MessageCircle, Loader2,
  ClipboardList, Megaphone, ArrowLeft, PencilLine, Link2, Check,
} from "lucide-react";
import { toast } from "sonner";
import { createTrackedLink } from "@/lib/tracked-links.functions";
import { createInlineContact } from "@/lib/inline-contact.functions";

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
  | { kind: "choose_type" }
  | { kind: "choose_action"; type: FormType }
  | { kind: "fill"; type: FormType }
  | { kind: "link"; type: FormType; token: string };

function AddContactModal({ userName, onClose }: { userName?: string | null; onClose: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const module = deriveModuleFromPath(path);
  const create = useServerFn(createTrackedLink);

  const [step, setStep] = useState<Step>({ kind: "choose_type" });
  const [busy, setBusy] = useState(false);

  async function generateLink(type: FormType) {
    setBusy(true);
    try {
      const r = await create({ data: { source_module: module, source_form_type: type } });
      setStep({ kind: "link", type, token: r.link.token });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar link");
    } finally {
      setBusy(false);
    }
  }

  const title = step.kind === "choose_type"
    ? "Adicionar contato"
    : step.kind === "choose_action"
      ? (step.type === "cadastro_completo" ? "Formulário de cadastro" : "Receber informações")
      : step.kind === "fill"
        ? "Preencher contato agora"
        : "Link gerado";

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step.kind === "choose_type" && "Escolha o tipo de cadastro. Você poderá preencher agora ou gerar um link para a pessoa preencher."}
            {step.kind === "choose_action" && "Preencha na hora ou envie um link rastreável para a pessoa preencher sozinha."}
            {step.kind === "fill" && "Os dados serão salvos e vinculados a você."}
            {step.kind === "link" && "Link rastreável — copie, abra ou envie por WhatsApp."}
          </DialogDescription>
        </DialogHeader>

        {step.kind === "choose_type" && (
          <>
            <div className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
              Registrado como criado por{" "}
              <strong className="text-foreground">{userName ?? "você"}</strong>
              {" · "}Origem: <strong className="text-foreground">{moduleLabel(module)}</strong>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-2">
              <TypeCard
                icon={<ClipboardList className="h-6 w-6" />}
                title="Formulário de cadastro"
                desc="Ficha completa: dados pessoais, endereço e consentimento."
                onClick={() => setStep({ kind: "choose_action", type: "cadastro_completo" })}
              />
              <TypeCard
                icon={<Megaphone className="h-6 w-6" />}
                title="Receber informações"
                desc="Formulário curto — nome, WhatsApp e cidade para receber comunicados."
                onClick={() => setStep({ kind: "choose_action", type: "receber_informacoes" })}
              />
            </div>
          </>
        )}

        {step.kind === "choose_action" && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <ActionCard
                icon={<PencilLine className="h-5 w-5" />}
                title="Preencher agora"
                desc="Digite os dados com a pessoa do lado. Salva imediatamente."
                onClick={() => setStep({ kind: "fill", type: step.type })}
              />
              <ActionCard
                icon={<Link2 className="h-5 w-5" />}
                title="Gerar link"
                desc="Envie por WhatsApp para a pessoa preencher sozinha."
                busy={busy}
                onClick={() => generateLink(step.type)}
              />
            </div>
            <BackButton onClick={() => setStep({ kind: "choose_type" })} />
          </div>
        )}

        {step.kind === "fill" && (
          <InlineFillForm
            type={step.type}
            module={module}
            onCancel={() => setStep({ kind: "choose_action", type: step.type })}
            onSaved={() => { toast.success("Contato salvo."); onClose(); }}
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
            <BackButton onClick={() => setStep({ kind: "choose_action", type: step.type })} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TypeCard({
  icon, title, desc, onClick,
}: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors p-4"
    >
      <div className="flex items-center gap-2 text-primary">{icon}</div>
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

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="mt-2">
      <ArrowLeft className="h-3.5 w-3.5" /> Voltar
    </Button>
  );
}

function InlineFillForm({
  type, module, onCancel, onSaved,
}: { type: FormType; module: SourceModule; onCancel: () => void; onSaved: () => void }) {
  const save = useServerFn(createInlineContact);
  const isFull = type === "cadastro_completo";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    nome: "", phone: "", email: "",
    cep: "", endereco: "", numero: "",
    bairro: "", cidade: "", uf: "",
    observacoes: "",
    consentimento_whatsapp: true,
  });

  function upd<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.consentimento_whatsapp) {
      setError("É preciso confirmar a autorização de contato por WhatsApp.");
      return;
    }
    setSubmitting(true);
    try {
      await save({
        data: {
          form_type: type,
          source_module: module,
          nome: f.nome.trim(),
          phone: f.phone.trim(),
          email: f.email.trim(),
          cidade: f.cidade.trim(),
          uf: f.uf.trim(),
          bairro: f.bairro.trim(),
          endereco: isFull ? f.endereco.trim() : "",
          numero: isFull ? f.numero.trim() : "",
          cep: isFull ? f.cep.trim() : "",
          observacoes: f.observacoes.trim(),
          consentimento_whatsapp: f.consentimento_whatsapp,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Nome *">
        <Input required maxLength={120} value={f.nome} onChange={(e) => upd("nome", e.target.value)} />
      </Field>
      <Field label="WhatsApp (com DDD) *">
        <Input required inputMode="tel" placeholder="(11) 91234-5678" value={f.phone} onChange={(e) => upd("phone", e.target.value)} />
      </Field>
      {isFull && (
        <Field label="E-mail">
          <Input type="email" value={f.email} onChange={(e) => upd("email", e.target.value)} />
        </Field>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Cidade" className="col-span-2">
          <Input maxLength={120} value={f.cidade} onChange={(e) => upd("cidade", e.target.value)} />
        </Field>
        <Field label="UF">
          <Input maxLength={2} value={f.uf} onChange={(e) => upd("uf", e.target.value.toUpperCase())} />
        </Field>
      </div>
      <Field label="Bairro">
        <Input maxLength={120} value={f.bairro} onChange={(e) => upd("bairro", e.target.value)} />
      </Field>
      {isFull && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Field label="CEP">
              <Input maxLength={12} value={f.cep} onChange={(e) => upd("cep", e.target.value)} />
            </Field>
            <Field label="Endereço" className="col-span-2">
              <Input maxLength={240} value={f.endereco} onChange={(e) => upd("endereco", e.target.value)} />
            </Field>
          </div>
          <Field label="Número">
            <Input maxLength={20} value={f.numero} onChange={(e) => upd("numero", e.target.value)} />
          </Field>
        </>
      )}
      <Field label="Observações">
        <textarea
          rows={2}
          maxLength={2000}
          value={f.observacoes}
          onChange={(e) => upd("observacoes", e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </Field>
      <label className="flex items-start gap-2 text-xs text-muted-foreground border rounded-md p-3 bg-muted/30">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={f.consentimento_whatsapp}
          onChange={(e) => upd("consentimento_whatsapp", e.target.checked)}
        />
        <span>
          A pessoa autoriza receber comunicações da campanha por WhatsApp
          (pode cancelar respondendo "SAIR").
        </span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-between gap-2 pt-1">
        <BackButton onClick={onCancel} />
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {submitting ? "Salvando…" : "Salvar contato"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function LinkResult({ url }: { url: string }) {
  const waHref = `https://wa.me/?text=${encodeURIComponent(`Olá! Preenche seu cadastro por aqui, por favor:\n${url}`)}`;
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
      </div>
    </div>
  );
}
