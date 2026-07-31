// Card visual 1080x1350 para compartilhar no WhatsApp (status/grupo).
// Só números agregados do próprio usuário — nenhum dado de contato aparece aqui.
import fistAsset from "@/assets/fist-alert.png.asset.json";
import { milestoneFor } from "@/lib/impact-milestones";
import type { ImpactStats } from "@/lib/impact-stats.functions";

export function ImpactShareCard({
  stats,
  innerRef,
}: {
  stats: ImpactStats;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const milestone = milestoneFor(stats.connections.total);
  const max = Math.max(1, ...stats.daily.map((d) => d.messages + d.contacts));

  return (
    <div
      ref={innerRef}
      style={{ width: 1080, height: 1350 }}
      className="flex flex-col justify-between overflow-hidden bg-[#16130F] p-16 text-[#F7F3EA]"
    >
      <div>
        <p className="text-3xl font-semibold uppercase tracking-[0.35em] text-[#F0AA04]">
          Povo que Batalha
        </p>
        <p className="mt-4 text-4xl text-[#F7F3EA]/70">
          {stats.displayName || "Agitador da campanha"}
        </p>
      </div>

      <div>
        <p className="text-5xl text-[#F7F3EA]/80">Eu já me conectei com</p>
        <p className="font-display text-[260px] leading-none text-[#F0AA04]">
          {stats.connections.total}
        </p>
        <p className="text-6xl font-semibold">pessoas</p>
        <p className="mt-8 inline-block rounded-full bg-[#7B4B94] px-8 py-4 text-4xl font-semibold">
          {milestone.badge}
        </p>
      </div>

      <div className="flex items-end gap-4" style={{ height: 220 }}>
        {stats.daily.map((d) => {
          const h = Math.round(((d.messages + d.contacts) / max) * 170);
          return (
            <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-3">
              <div
                style={{ height: Math.max(8, h) }}
                className="w-full rounded-t-lg bg-[#F0AA04]"
              />
              <span className="text-2xl uppercase text-[#F7F3EA]/50">{d.label}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-8">
        <div className="space-y-2">
          <p className="text-4xl text-[#F7F3EA]/70">
            {stats.messages.total} mensagens · {stats.contacts.total} cadastros
          </p>
          <p className="max-w-[620px] text-3xl italic text-[#F0AA04]">{milestone.phrase}</p>
        </div>
        <img src={fistAsset.url} alt="" style={{ width: 220, height: 220 }} className="object-contain" />
      </div>
    </div>
  );
}
