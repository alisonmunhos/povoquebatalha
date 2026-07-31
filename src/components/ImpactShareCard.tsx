// Card visual 1080x1350 para compartilhar no WhatsApp (status/grupo).
// Só números agregados do próprio usuário — nenhum dado de contato aparece aqui.
import fistAsset from "@/assets/fist-alert.png.asset.json";
import { milestoneFor, weekMilestoneFor } from "@/lib/impact-milestones";
import type { WeekStatShape } from "@/lib/impact-week";
import type { ImpactStats } from "@/lib/impact-stats.functions";

export type ShareVariant = "total" | "day" | "week";

const PALETTE: Record<ShareVariant, { accent: string; badgeBg: string }> = {
  total: { accent: "#F0AA04", badgeBg: "#7B4B94" },
  day: { accent: "#F0AA04", badgeBg: "#16130F" },
  week: { accent: "#C79BE0", badgeBg: "#7B4B94" },
};

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
  const palette = PALETTE[variant];

  const value =
    variant === "total"
      ? stats.connections.total
      : variant === "day"
        ? stats.connections.today
        : theWeek.connections;

  const milestone = variant === "week" ? weekMilestoneFor(theWeek.connections) : milestoneFor(stats.connections.total);

  const headline =
    variant === "total"
      ? "Eu já me conectei com"
      : variant === "day"
        ? "Hoje eu me conectei com"
        : "Nesta semana eu me conectei com";

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
      style={{ width: 1080, height: 1350 }}
      className="flex flex-col justify-between overflow-hidden bg-[#16130F] p-16 text-[#F7F3EA]"
    >
      <div>
        <p
          className="text-3xl font-semibold uppercase tracking-[0.35em]"
          style={{ color: palette.accent }}
        >
          Povo que Batalha
        </p>
        <p className="mt-4 text-4xl text-[#F7F3EA]/70">
          {stats.displayName || "Agitador da campanha"}
        </p>
        {variant === "week" && (
          <p className="mt-2 text-3xl text-[#F7F3EA]/50">Semana de {theWeek.rangeLabel}</p>
        )}
      </div>

      <div>
        <p className="text-5xl text-[#F7F3EA]/80">{headline}</p>
        <p className="font-display text-[260px] leading-none" style={{ color: palette.accent }}>
          {value}
        </p>
        <p className="text-6xl font-semibold">pessoas</p>
        <p
          className="mt-8 inline-block rounded-full px-8 py-4 text-4xl font-semibold"
          style={{ backgroundColor: palette.badgeBg }}
        >
          {milestone.badge}
        </p>
      </div>

      <div className="flex items-end gap-4" style={{ height: 220 }}>
        {bars.map((d) => {
          const h = Math.round(((d.messages + d.contacts) / max) * 170);
          return (
            <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-3">
              <div
                style={{ height: Math.max(8, h), backgroundColor: palette.accent }}
                className="w-full rounded-t-lg"
              />
              <span className="text-2xl uppercase text-[#F7F3EA]/50">{d.label}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-8">
        <div className="space-y-2">
          <p className="text-4xl text-[#F7F3EA]/70">{footerNumbers}</p>
          <p className="max-w-[620px] text-3xl italic" style={{ color: palette.accent }}>
            {milestone.phrase}
          </p>
        </div>
        <img src={fistAsset.url} alt="" style={{ width: 220, height: 220 }} className="object-contain" />
      </div>
    </div>
  );
}
