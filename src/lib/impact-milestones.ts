/**
 * Frases de reconhecimento por faixa de conexões — o "toque retrospectiva".
 * Client-safe: usado tanto na tela quanto no card de compartilhamento.
 */
export type Milestone = { min: number; badge: string; phrase: string };

export const IMPACT_MILESTONES: Milestone[] = [
  { min: 0, badge: "Primeiros passos", phrase: "Toda batalha começa com a primeira conversa." },
  { min: 1, badge: "Na rua", phrase: "Você já começou. Cada pessoa conta." },
  { min: 10, badge: "Agitador de bairro", phrase: "10 pessoas alcançadas. A conversa já está circulando." },
  { min: 50, badge: "Força de campo", phrase: "50 pessoas! Você é presença firme na campanha." },
  { min: 100, badge: "Referência da quebrada", phrase: "100 pessoas conectadas. Isso é organização de verdade." },
  { min: 250, badge: "Liderança popular", phrase: "250 pessoas! Você move gente que move gente." },
  { min: 500, badge: "Lenda do Povo que Batalha", phrase: "500 pessoas. Você é história dessa campanha." },
];

export function milestoneFor(connections: number): Milestone {
  let found = IMPACT_MILESTONES[0]!;
  for (const m of IMPACT_MILESTONES) if (connections >= m.min) found = m;
  return found;
}

/** Próxima meta e progresso (%) até ela — para a barra de avanço. */
export function nextMilestone(connections: number): { target: number; percent: number } | null {
  const next = IMPACT_MILESTONES.find((m) => m.min > connections);
  if (!next) return null;
  const prev = milestoneFor(connections).min;
  const span = next.min - prev || 1;
  return { target: next.min, percent: Math.min(100, Math.round(((connections - prev) / span) * 100)) };
}
