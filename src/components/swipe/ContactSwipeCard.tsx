// Card central da triagem: nome em destaque, profissão, local de trabalho,
// tags, selo Alicerce e o bloco de observação (leitura obrigatória).
import { Briefcase, Building2, MapPin, MessageSquarePlus, Star } from "lucide-react";
import type { TriageContact } from "@/lib/segment-triage.functions";
import type { SwipeDirection } from "@/hooks/use-swipe-gesture";

const HINT_LABEL: Record<SwipeDirection, string> = {
  left: "Arquivar",
  right: "Manter",
  down: "Pular",
};

const HINT_CLASS: Record<SwipeDirection, string> = {
  left: "border-destructive text-destructive",
  right: "border-emerald-500 text-emerald-600",
  down: "border-[#7B4B94] text-[#7B4B94]",
};

export function ContactSwipeCard({
  contact,
  delta,
  dragging,
  hint,
  onAddNote,
  handlers,
  behind,
}: {
  contact: TriageContact;
  delta?: { x: number; y: number };
  dragging?: boolean;
  hint?: SwipeDirection | null;
  onAddNote?: () => void;
  handlers?: React.HTMLAttributes<HTMLElement>;
  /** Card de trás (pré-render), sem gesto e levemente reduzido. */
  behind?: boolean;
}) {
  const d = delta ?? { x: 0, y: 0 };
  const rot = behind ? 0 : d.x / 22;
  const style: React.CSSProperties = behind
    ? { transform: "scale(0.96) translateY(10px)", opacity: 0.6 }
    : {
        transform: `translate3d(${d.x}px, ${d.y}px, 0) rotate(${rot}deg)`,
        transition: dragging ? "none" : "transform 180ms ease-out",
        touchAction: "none",
      };

  const obs = contact.ultima_observacao?.note ?? contact.observacoes ?? null;

  return (
    <article
      {...(behind ? {} : handlers)}
      style={style}
      className={`absolute inset-0 flex flex-col overflow-hidden rounded-3xl border bg-card shadow-punch ${
        behind ? "pointer-events-none" : ""
      }`}
      aria-hidden={behind ? true : undefined}
    >
      {!behind && hint && (
        <div
          className={`pointer-events-none absolute right-4 top-4 z-10 rounded-full border-2 bg-background/90 px-3 py-1 text-xs font-black uppercase ${HINT_CLASS[hint]}`}
        >
          {HINT_LABEL[hint]}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden px-5 pt-6">
        <h2 className="text-2xl font-black leading-tight">{contact.nome}</h2>
        {contact.nome_social && (
          <p className="mt-0.5 text-sm text-muted-foreground">Nome social: {contact.nome_social}</p>
        )}

        <div className="mt-4 space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">{contact.profissao || "Profissão não informada"}</span>
          </p>
          <p className="flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">{contact.instituicao || "Local de trabalho não informado"}</span>
          </p>
          {(contact.cidade || contact.bairro) && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">
                {[contact.bairro, contact.cidade, contact.uf].filter(Boolean).join(" · ")}
              </span>
            </p>
          )}
        </div>

        {contact.coletivo_alicerce && (
          <span className="mt-4 inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
            <Star className="h-3.5 w-3.5" /> Coletivo Alicerce
          </span>
        )}

        {contact.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {contact.tags.map((t) => (
              <span
                key={t.id}
                className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                style={{ borderColor: t.cor, color: t.cor }}
              >
                {t.nome}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 rounded-2xl border bg-muted/40 p-3" data-no-swipe>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Observação</p>
          <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm">
            {obs || <span className="text-muted-foreground">Sem observação registrada.</span>}
          </div>
          {contact.ultima_observacao && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Registrada em {new Date(contact.ultima_observacao.created_at).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
      </div>

      {!behind && (
        <div className="shrink-0 border-t p-3" data-no-swipe>
          <button
            type="button"
            onClick={onAddNote}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-2.5 text-sm font-bold hover:bg-muted"
          >
            <MessageSquarePlus className="h-4 w-4" /> Nova observação
          </button>
        </div>
      )}
    </article>
  );
}
