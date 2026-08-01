// Tipos de "Meu Impacto" — client-safe, compartilhados entre a server fn,
// o helper server-only e os componentes de UI.

export type WeekStat = {
  startKey: string;
  endKey: string;
  rangeLabel: string;
  messages: number;
  contacts: number;
  connections: number;
  daily: Array<{ day: string; label: string; messages: number; contacts: number }>;
  activeDays: number;
};

export type ImpactStats = {
  displayName: string;
  connections: { total: number; today: number };
  messages: { total: number; today: number };
  contacts: { total: number; today: number };
  missions: {
    total: number;
    concluded: number;
    openTasks: number;
    sentInOpenClaim: number;
    openClaimTotal: number;
  };
  daily: Array<{ day: string; label: string; messages: number; contacts: number }>;
  streakDays: number;
  since: string | null;
  /** Semana em curso, semana fechada e a anterior a ela (para comparação). */
  weeks: { current: WeekStat; closed: WeekStat; beforeClosed: WeekStat };
};
