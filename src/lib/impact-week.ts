/**
 * Janela da semana de conquista (fuso da campanha).
 * A semana começa na meia-noite que vira sexta para sábado (sábado 00:00)
 * e termina exatamente 7 dias depois. A notificação sai no sábado de manhã,
 * falando da semana que acabou de fechar.
 * Client-safe: usado na tela, no card e no job do servidor.
 */
export const IMPACT_TZ = "America/Sao_Paulo";

/**
 * Só conta como "cadastro feito por essa pessoa" o que veio de captação real.
 * Importação em massa e atualizações de ficha não entram.
 */
export const QUALIFYING_SOURCE_EVENTS = [
  "contato_criado",
  "inscricao_simples",
  "cadastro_completo",
] as const;

/** Chave de dia (YYYY-MM-DD) no fuso da campanha. */
export function dayKeyOf(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IMPACT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function keyToUtcNoon(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

export function addDaysToKey(key: string, days: number): string {
  const d = keyToUtcNoon(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado */
export function weekdayOfKey(key: string): number {
  return keyToUtcNoon(key).getUTCDay();
}

/** Sábado mais recente (inclusive) em relação ao dia informado. */
export function weekStartKeyFor(dayKey: string): string {
  const wd = weekdayOfKey(dayKey); // sábado = 6
  const back = (wd + 1) % 7; // sábado -> 0, domingo -> 1, ... sexta -> 6
  return addDaysToKey(dayKey, -back);
}

export function weekDayKeys(startKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(startKey, i));
}

/** Último dia da semana (sexta-feira). */
export function weekEndKey(startKey: string): string {
  return addDaysToKey(startKey, 6);
}

/** Chave estável da semana, usada para não enviar a mesma notificação duas vezes. */
export function weekKey(startKey: string): string {
  return startKey;
}

const shortDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
});

export function formatWeekRange(startKey: string): string {
  if (!startKey) return "";
  return `${shortDate.format(keyToUtcNoon(startKey))} a ${shortDate.format(keyToUtcNoon(weekEndKey(startKey)))}`;
}

const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" });

export function weekdayLabel(key: string): string {
  return weekdayFmt.format(keyToUtcNoon(key)).replace(".", "").slice(0, 3);
}

/** Semana atual (em curso) e semana fechada, a partir de "agora". */
export function weekWindows(now: Date = new Date()): {
  currentStart: string;
  closedStart: string;
  beforeClosedStart: string;
} {
  const today = dayKeyOf(now);
  const currentStart = weekStartKeyFor(today);
  return {
    currentStart,
    closedStart: addDaysToKey(currentStart, -7),
    beforeClosedStart: addDaysToKey(currentStart, -14),
  };
}

export type WeekStatShape = {
  startKey: string;
  endKey: string;
  rangeLabel: string;
  messages: number;
  contacts: number;
  connections: number;
  daily: Array<{ day: string; label: string; messages: number; contacts: number }>;
  activeDays: number;
};

/** Monta o recorte da semana a partir dos mapas de contagem por dia. */
export function buildWeekStat(
  startKey: string,
  messagesByDay: Map<string, number>,
  contactsByDay: Map<string, number>,
): WeekStatShape {
  const daily = weekDayKeys(startKey).map((day) => ({
    day,
    label: weekdayLabel(day),
    messages: messagesByDay.get(day) ?? 0,
    contacts: contactsByDay.get(day) ?? 0,
  }));
  const messages = daily.reduce((a, d) => a + d.messages, 0);
  const contacts = daily.reduce((a, d) => a + d.contacts, 0);
  return {
    startKey,
    endKey: weekEndKey(startKey),
    rangeLabel: formatWeekRange(startKey),
    messages,
    contacts,
    connections: messages + contacts,
    daily,
    activeDays: daily.filter((d) => d.messages + d.contacts > 0).length,
  };
}
