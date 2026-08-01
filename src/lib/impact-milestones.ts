/**
 * Frases de reconhecimento por faixa de conexões — o "toque retrospectiva".
 * Client-safe: usado tanto na tela quanto no card de compartilhamento.
 *
 * - `badge`: nome do patamar (pill roxo do cartão)
 * - `headline`: frase de reflexão que aparece acima do número gigante
 * - `phrase`: frase de compartilhamento (itálico amarelo, rodapé do cartão)
 */
export type Milestone = { min: number; badge: string; headline: string; phrase: string };

/** Camada 1 — conquista geral (acumulada). */
export const IMPACT_MILESTONES: Milestone[] = [
  {
    min: 0,
    badge: "Primeiros passos",
    headline: "Estou começando a construir minha rede de conexões.",
    phrase: "Estou começando a construir minha rede de conexões pela campanha.",
  },
  {
    min: 5,
    badge: "Primeiras conexões",
    headline: "Comecei a construir minha rede de conexões pela campanha.",
    phrase: "Comecei a construir minha rede de conexões pela campanha.",
  },
  {
    min: 10,
    badge: "Presença firme",
    headline: "Já conectei com 10 pessoas.",
    phrase: "Já conectei com 10 pessoas. Cada conversa fortalece nossa rede.",
  },
  {
    min: 25,
    badge: "Construindo pontes",
    headline: "Já conectei 25 pessoas à nossa rede.",
    phrase: "Já conectei 25 pessoas à nossa rede. Vem fazer parte também.",
  },
  {
    min: 50,
    badge: "Rede em movimento",
    headline: "50 conexões!",
    phrase:
      "50 conexões! Muitas conversas começaram a partir daqui — nossa rede está em movimento.",
  },
  {
    min: 100,
    badge: "Multiplicando conexões",
    headline: "Cheguei a 100 conexões.",
    phrase:
      "Cheguei a 100 conexões. Toda conversa aproxima mais gente da nossa luta — Venha somar.",
  },
  {
    min: 250,
    badge: "Fortalecendo a base",
    headline: "250 pessoas conectadas.",
    phrase: "250 pessoas conectadas. Cada uma fortalece nossa organização.",
  },
  {
    min: 500,
    badge: "Rede fortalecida",
    headline: "500 conexões construídas.",
    phrase:
      "500 conexões construídas. Nossa rede é mais forte a cada pessoa que se junta — Construa as suas conexões também!",
  },
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

/**
 * Faixas próprias da conquista da SEMANA (Camada 2) — separadas das conquistas
 * gerais para que uma não interfira na outra. Nomenclatura mantida como está.
 */
export const WEEK_MILESTONES: Milestone[] = [
  {
    min: 0,
    badge: "Semana de descanso",
    headline: "Semana parada. A próxima é sua.",
    phrase: "Semana parada. A próxima é sua.",
  },
  {
    min: 1,
    badge: "Semana na ativa",
    headline: "Você não deixou a semana passar em branco.",
    phrase: "Você não deixou a semana passar em branco.",
  },
  {
    min: 5,
    badge: "Semana firme",
    headline: "Semana de conversa em dia. Segue o corre.",
    phrase: "Semana de conversa em dia. Segue o corre.",
  },
  {
    min: 15,
    badge: "Semana pesada",
    headline: "Semana pesada! Você fez a campanha andar.",
    phrase: "Semana pesada! Você fez a campanha andar.",
  },
  {
    min: 30,
    badge: "Semana histórica",
    headline: "Semana histórica. Isso é organização de verdade.",
    phrase: "Semana histórica. Isso é organização de verdade.",
  },
  {
    min: 60,
    badge: "Semana lendária",
    headline: "Semana lendária. Você puxou a campanha nas costas.",
    phrase: "Semana lendária. Você puxou a campanha nas costas.",
  },
];

export function weekMilestoneFor(connections: number): Milestone {
  let found = WEEK_MILESTONES[0]!;
  for (const m of WEEK_MILESTONES) if (connections >= m.min) found = m;
  return found;
}
