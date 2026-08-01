// Card visual 1080x1350 para compartilhar no WhatsApp (status/grupo).
// Só números agregados de UM usuário — nenhum dado de contato aparece aqui.
import fistMark from "@/assets/fist-mark-transparent.png";
import { milestoneFor, weekMilestoneFor, resolveMilestone } from "@/lib/impact-milestones";

import type { WeekStatShape } from "@/lib/impact-week";
import type { ImpactStats } from "@/lib/impact-stats-types";

export type ShareVariant = "total" | "day" | "week";

/** Paleta fixa do cartão (adesivo de cartaz, sem gradiente e sem blur). */
export const CARD_BG = "#2E1F38"; // Accent Purple 700 escuro
const ACCENT = "#F0AA04"; // Primary Yellow 500
const BADGE_BG = "#7B4B94"; // Accent Purple 500
const SUPPORT = "#CFC6BE"; // Ink Neutrals 300
const SUPPORT_SOFT = "#A79E97";

export function ImpactShareCard({
  stats,
  innerRef,
  variant = "total",
  week,
}: {
  stats: ImpactStats;
  innerRef?: React.Ref<HTMLDivElement>;
  variant?: ShareVariant;
  week?: WeekStatShape;
}) {
  const theWeek = week ?? stats.weeks.closed;

  const value =
    variant === "total"
      ? stats.connections.total
      : variant === "day"
        ? stats.connections.today
        : theWeek.connections;

  const milestone =
    variant === "week" ? weekMilestoneFor(theWeek.connections) : milestoneFor(stats.connections.total);

  const headline =
    variant === "total"
      ? milestone.headline
      : variant === "day"
        ? "Hoje eu me conectei com"
        : "Nesta semana eu me conectei com";

  const unitWord = variant === "total" ? "conexões" : "pessoas";

  const bars = variant === "week" ? theWeek.daily : stats.daily;
  const max = Math.max(1, ...bars.map((d) => d.messages + d.contacts));

  const footerNumbers =
    variant === "total"
      ? `${stats.messages.total} mensagens · ${stats.contacts.total} cadastros`
      : variant === "day"
        ? `${stats.messages.today} mensagens · ${stats.contacts.today} cadastros hoje`
        : `${theWeek.messages} mensagens · ${theWeek.contacts} cadastros`;

  return (
    <div
      ref={innerRef}
      style={{ width: 1080, height: 1350, backgroundColor: CARD_BG, position: "relative" }}
      className="flex flex-col justify-between overflow-hidden p-16"
    >
      {/* Marca d'água do punho — discreta, canto inferior direito */}
      <img
        src={fistSilhouette}
        alt=""
        width={512}
        height={512}
        style={{
          position: "absolute",
          right: 40,
          bottom: 40,
          width: 260,
          height: 260,
          opacity: 0.5,
          objectFit: "contain",
        }}
      />

      {/* 1-3: kicker, nome, headline de reflexão */}
      <div style={{ position: "relative" }}>
        <p
          className="text-3xl font-semibold uppercase"
          style={{ color: SUPPORT_SOFT, letterSpacing: "0.42em" }}
        >
          Povo que Batalha
        </p>
        <p className="mt-6 text-4xl font-semibold" style={{ color: SUPPORT }}>
          {stats.displayName || "Agitador da campanha"}
        </p>
        {variant === "week" && (
          <p className="mt-2 text-3xl" style={{ color: SUPPORT_SOFT }}>
            Semana de {theWeek.rangeLabel}
          </p>
        )}
        <p className="mt-8 max-w-[820px] text-5xl font-bold leading-tight" style={{ color: ACCENT }}>
          {headline}
        </p>
      </div>

      {/* 4-6: número gigante, unidade e badge do patamar */}
      <div style={{ position: "relative" }}>
        <p
          className="font-display uppercase"
          style={{ color: ACCENT, fontSize: 300, lineHeight: 0.85 }}
        >
          {value}
        </p>
        <p className="mt-2 text-6xl font-bold" style={{ color: SUPPORT }}>
          {unitWord}
        </p>
        <p
          className="mt-10 inline-block rounded-full px-10 py-5 text-4xl font-bold shadow-punch"
          style={{ backgroundColor: BADGE_BG, color: "#FFFFFF", border: `2px solid #16130F` }}
        >
          {milestone.badge}
        </p>
      </div>

      {/* 7: mini gráfico discreto dos 7 dias + rodapé de stats */}
      <div style={{ position: "relative" }}>
        <div className="flex items-end gap-4" style={{ height: 120 }}>
          {bars.map((d) => {
            const h = Math.round(((d.messages + d.contacts) / max) * 96);
            return (
              <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-2">
                <div
                  style={{ height: Math.max(6, h), backgroundColor: ACCENT, opacity: 0.75 }}
                  className="w-full"
                />
                <span className="text-2xl uppercase" style={{ color: SUPPORT_SOFT }}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-3xl" style={{ color: SUPPORT_SOFT }}>
          {footerNumbers}
        </p>

        {/* 8: frase de compartilhamento */}
        <p
          className="mt-4 max-w-[720px] text-left text-4xl italic leading-snug"
          style={{ color: ACCENT }}
        >
          {milestone.phrase}
        </p>
      </div>
    </div>
  );
}
