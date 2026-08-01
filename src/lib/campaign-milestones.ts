/**
 * Patamares da CAMPANHA (não da pessoa). Linguagem no infinitivo, falando da
 * Campanha do Povo que Batalha — nunca em primeira pessoa.
 *
 * `{n}` é sempre trocado pelo número REAL de conexões da campanha.
 */
export type CampaignMilestone = {
  min: number;
  badge: string;
  headline: string;
  phrase: string;
};

export const CAMPAIGN_MILESTONES: CampaignMilestone[] = [
  {
    min: 0,
    badge: "Começar do zero",
    headline: "Começar a construir a base, uma conversa por vez.",
    phrase: "Começar do zero e não parar. Somar forças com a Campanha do Povo que Batalha.",
  },
  {
    min: 50,
    badge: "Construir base",
    headline: "Somar {n} conexões construídas pela campanha.",
    phrase: "Construir base de verdade: {n} conexões já somadas. Venha somar também.",
  },
  {
    min: 100,
    badge: "Multiplicar contatos",
    headline: "Multiplicar contatos: {n} conexões pela campanha.",
    phrase: "Multiplicar contatos e ampliar a rede: {n} conexões e contando.",
  },
  {
    min: 500,
    badge: "Ocupar cada rua",
    headline: "Ocupar cada rua: {n} conexões pela campanha.",
    phrase: "Ocupar cada rua, bater em cada porta: {n} conexões somadas até aqui.",
  },
  {
    min: 1000,
    badge: "Fortalecer a rede",
    headline: "Fortalecer a rede com {n} conexões.",
    phrase: "Fortalecer a rede: {n} conexões construídas por gente que batalha.",
  },
  {
    min: 5000,
    badge: "Organizar o povo",
    headline: "Organizar o povo: {n} conexões pela campanha.",
    phrase: "Organizar o povo, rua por rua: {n} conexões já somadas.",
  },
  {
    min: 10000,
    badge: "Fazer história",
    headline: "Fazer história com {n} conexões.",
    phrase: "Fazer história junto: {n} conexões construídas pela Campanha do Povo que Batalha.",
  },
];

export function campaignMilestoneFor(connections: number): CampaignMilestone {
  let found = CAMPAIGN_MILESTONES[0]!;
  for (const m of CAMPAIGN_MILESTONES) if (connections >= m.min) found = m;
  return found;
}

const nf = new Intl.NumberFormat("pt-BR");

/** Textos resolvidos com o número real da campanha. */
export function resolveCampaignMilestone(connections: number): {
  badge: string;
  headline: string;
  phrase: string;
} {
  const m = campaignMilestoneFor(connections);
  const fill = (t: string) => t.replaceAll("{n}", nf.format(connections));
  return {
    badge: m.min > 0 ? `Campanha · ${nf.format(m.min)}+` : `Campanha · ${m.badge}`,
    headline: fill(m.headline),
    phrase: fill(m.phrase),
  };
}
