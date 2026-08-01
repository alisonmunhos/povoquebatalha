// Cartão 1080x1350 da JORNADA DA CAMPANHA (soma de todos).
// Paleta invertida em relação ao cartão pessoal: fundo amarelo, tinta escura.
// Linguagem sempre no infinitivo, falando da campanha — nunca em 1ª pessoa.
import appIcon from "@/assets/app-icon-squircle.png.asset.json";
import { resolveCampaignMilestone } from "@/lib/campaign-milestones";
import type { CampaignJourney } from "@/lib/campaign-journey.functions";

export const CAMPAIGN_CARD_BG = "#F0AA04"; // Primary Yellow 500
const INK = "#16130F"; // Ink 900
const INK_SOFT = "#4A3F2E";
const BADGE_BG = "#7B4B94"; // Accent Purple 500

const nf = new Intl.NumberFormat("pt-BR");

export function CampaignShareCard({
  data,
  periodoLabel,
  innerRef,
}: {
  data: CampaignJourney;
  periodoLabel: string;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const milestone = resolveCampaignMilestone(data.conexoes);
  const bars = data.daily ?? [];
  const max = Math.max(1, ...bars.map((d) => d.mensagens + d.cadastros));

  const plural = (n: number, one: string, many: string) =>
    `${nf.format(n)} ${n === 1 ? one : many}`;

  return (
    <div
      ref={innerRef}
      style={{ width: 1080, height: 1350, backgroundColor: CAMPAIGN_CARD_BG, position: "relative" }}
      className="flex flex-col justify-between overflow-hidden p-16"
    >
      {/* Punho + raios, na área vazia à direita */}
      <div
        style={{ position: "absolute", right: 56, top: 430, width: 360, height: 360, pointerEvents: "none" }}
      >
        <svg viewBox="0 0 360 360" width={360} height={360} style={{ position: "absolute", inset: 0 }} aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => {
            const angle = (i * 360) / 16;
            const long = i % 2 === 0;
            return (
              <line
                key={i}
                x1={180}
                y1={180}
                x2={180}
                y2={long ? 8 : 44}
                stroke={INK}
                strokeWidth={long ? 6 : 4}
                strokeLinecap="round"
                opacity={long ? 0.4 : 0.22}
                transform={`rotate(${angle} 180 180)`}
              />
            );
          })}
        </svg>
        <img
          src={appIcon.url}
          alt=""
          width={216}
          height={216}
          style={{ position: "absolute", left: 72, top: 72, width: 216, height: 216, objectFit: "contain" }}
        />
      </div>

      {/* Kicker + período + headline */}
      <div style={{ position: "relative" }}>
        <p className="text-3xl font-semibold uppercase" style={{ color: INK_SOFT, letterSpacing: "0.34em" }}>
          Campanha do Povo que Batalha
        </p>
        <p className="mt-6 text-4xl font-semibold" style={{ color: INK_SOFT }}>
          Jornada da campanha · {periodoLabel}
        </p>
        <p className="mt-8 max-w-[620px] text-5xl font-bold leading-tight" style={{ color: INK }}>
          {milestone.headline}
        </p>
      </div>

      {/* Número gigante + unidade + selo */}
      <div style={{ position: "relative" }}>
        <p className="font-display uppercase" style={{ color: INK, fontSize: 300, lineHeight: 0.85 }}>
          {nf.format(data.conexoes)}
        </p>
        <p className="mt-2 text-6xl font-bold" style={{ color: INK_SOFT }}>
          {data.conexoes === 1 ? "conexão" : "conexões"}
        </p>
        <p
          className="mt-10 inline-block rounded-full px-10 py-5 text-4xl font-bold shadow-punch"
          style={{ backgroundColor: BADGE_BG, color: "#FFFFFF", border: `2px solid ${INK}` }}
        >
          {milestone.badge}
        </p>
      </div>

      {/* Gráfico discreto dos 7 dias + rodapé */}
      <div style={{ position: "relative" }}>
        {bars.length > 0 && (
          <div className="flex items-end gap-4" style={{ height: 120 }}>
            {bars.map((d) => {
              const h = Math.round(((d.mensagens + d.cadastros) / max) * 96);
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-2">
                  <div
                    style={{ height: Math.max(6, h), backgroundColor: INK, opacity: 0.8 }}
                    className="w-full"
                  />
                  <span className="text-2xl uppercase" style={{ color: INK_SOFT }}>
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-3xl" style={{ color: INK_SOFT }}>
          {plural(data.mensagens, "mensagem enviada em missões", "mensagens enviadas em missões")} ·{" "}
          {plural(data.cadastros, "cadastro novo", "cadastros novos")}
        </p>
        <p className="mt-2 text-2xl" style={{ color: INK_SOFT }}>
          Sem contar contatos importados.
        </p>

        <p className="mt-4 max-w-[720px] text-left text-4xl italic leading-snug" style={{ color: INK }}>
          {milestone.phrase}
        </p>
      </div>
    </div>
  );
}
