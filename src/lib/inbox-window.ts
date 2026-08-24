/**
 * Janela de 24h do WhatsApp (regra da Meta): texto livre só chega até 24h depois
 * da ÚLTIMA mensagem enviada pela pessoa. Enviar template não abre a janela —
 * só a resposta dela abre. Helpers compartilhados entre servidor e interface.
 */
export const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Abaixo disso a conversa entra na fila de urgência ("Expirando"). */
export const EXPIRING_MS = 4 * 60 * 60 * 1000;

export type WindowState = {
  open: boolean;
  /** Milissegundos restantes (0 quando fechada). */
  remainingMs: number;
  expiring: boolean;
  /** Texto curto pra selo: "faltam 3h", "faltam 25min" ou "fora da janela". */
  label: string;
};

export function windowState(lastInboundAt: string | number | null | undefined, now = Date.now()): WindowState {
  const t = typeof lastInboundAt === "number"
    ? lastInboundAt
    : lastInboundAt ? new Date(lastInboundAt).getTime() : 0;
  if (!t || !Number.isFinite(t)) {
    return { open: false, remainingMs: 0, expiring: false, label: "fora da janela" };
  }
  const remainingMs = t + WINDOW_MS - now;
  if (remainingMs <= 0) {
    return { open: false, remainingMs: 0, expiring: false, label: "fora da janela" };
  }
  return {
    open: true,
    remainingMs,
    expiring: remainingMs <= EXPIRING_MS,
    label: `faltam ${formatRemaining(remainingMs)}`,
  };
}

export function formatRemaining(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  if (h < 6 && rest > 0) return `${h}h${String(rest).padStart(2, "0")}`;
  return `${h}h`;
}

/** Hora local (pt-BR) em que a janela fecha — usado nos avisos. */
export function windowClosesAtLabel(lastInboundAt: string | null | undefined): string | null {
  if (!lastInboundAt) return null;
  const t = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(t)) return null;
  try {
    return new Date(t + WINDOW_MS).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return null;
  }
}
