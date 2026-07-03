// Botão global "+ Adicionar contato".
// Gera um link rastreável (tracked_form_links) e mostra 2 cards:
// - Formulário de cadastro (source_form_type=cadastro_completo, rota /atualizacao?ref=TOKEN)
// - Receber informações (source_form_type=receber_informacoes, rota /inscrever?ref=TOKEN)
import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Copy, ExternalLink, MessageCircle, Loader2, ClipboardList, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { createTrackedLink } from "@/lib/tracked-links.functions";

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

function AddContactModal({ userName, onClose }: { userName?: string | null; onClose: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const module = deriveModuleFromPath(path);
  const create = useServerFn(createTrackedLink);

  const [busy, setBusy] = useState<FormType | null>(null);
  const [selected, setSelected] = useState<{ token: string; type: FormType } | null>(null);

  async function generate(type: FormType) {
    setBusy(type);
    try {
      const r = await create({ data: { source_module: module, source_form_type: type } });
      setSelected({ token: r.link.token, type });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar link");
    } finally {
      setBusy(null);
    }
  }

  const publicPath = selected
    ? selected.type === "cadastro_completo" ? "/atualizacao" : "/inscrever"
    : "";
  const publicUrl = selected
    ? `${window.location.origin}${publicPath}?ref=${selected.token}`
    : "";

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Adicionar contato</DialogTitle>
          <DialogDescription>
            Gere um link rastreável para o contato preencher os dados. Vamos registrar quem captou e por qual módulo.
          </DialogDescription>
        </DialogHeader>

        {!selected && (
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
                desc="Ficha completa: dados pessoais, endereço, participação e consentimento."
                busy={busy === "cadastro_completo"}
                onClick={() => generate("cadastro_completo")}
              />
              <TypeCard
                icon={<Megaphone className="h-6 w-6" />}
                title="Receber informações"
                desc="Formulário curto — só nome, WhatsApp e cidade para receber comunicados."
                busy={busy === "receber_informacoes"}
                onClick={() => generate("receber_informacoes")}
              />
            </div>
          </>
        )}

        {selected && (
          <LinkResult url={publicUrl} onBack={() => setSelected(null)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TypeCard({
  icon, title, desc, busy, onClick,
}: { icon: React.ReactNode; title: string; desc: string; busy: boolean; onClick: () => void }) {
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

function LinkResult({ url, onBack }: { url: string; onBack: () => void }) {
  const waHref = `https://wa.me/?text=${encodeURIComponent(`Olá! Preenche seu cadastro por aqui, por favor:\n${url}`)}`;
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">Link rastreável gerado — pode copiar, abrir ou enviar por WhatsApp.</div>
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
        <Button variant="ghost" size="sm" onClick={onBack}>Gerar outro</Button>
      </div>
    </div>
  );
}
