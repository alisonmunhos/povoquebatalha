// Faixa de topo do painel do admin: a jornada da campanha toda somada.
import { Users, Send, Flame } from "lucide-react";
import type { CampaignJourney } from "@/lib/campaign-journey.functions";
import { CampaignShareCard, CAMPAIGN_CARD_BG } from "@/components/CampaignShareCard";
import { ShareImageActions } from "@/components/share/ShareImageActions";
import { resolveCampaignMilestone } from "@/lib/campaign-milestones";
import { SITE_URL } from "@/lib/site-meta";

const nf = new Intl.NumberFormat("pt-BR");

export function CampaignJourneyPanel({
  data,
  periodoLabel,
}: {
  data: CampaignJourney;
  periodoLabel: string;
}) {
  const milestone = resolveCampaignMilestone(data.conexoes);
  const shareText = [
    `Jornada da Campanha do Povo que Batalha · ${periodoLabel}`,
    `${nf.format(data.conexoes)} conexões · ${nf.format(data.mensagens)} mensagens enviadas em missões · ${nf.format(data.cadastros)} cadastros novos`,
    milestone.phrase,
    SITE_URL,
  ].join("\n");

  return (
    <section className="rounded-lg border-2 bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Jornada da campanha</h2>
        <span className="text-xs text-muted-foreground">{periodoLabel}</span>
      </div>


      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Flame className="h-4 w-4" /> Conexões
          </div>
          <p className="text-3xl font-semibold leading-tight">{nf.format(data.conexoes)}</p>
          <p className="text-xs text-muted-foreground">Cadastros novos + mensagens enviadas.</p>
        </div>
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-4 w-4" /> Cadastros novos
          </div>
          <p className="text-3xl font-semibold leading-tight">{nf.format(data.cadastros)}</p>
          <p className="text-xs text-muted-foreground">
            {nf.format(data.cadastrosFormulario)} por formulário público ·{" "}
            {nf.format(data.cadastrosManuais)} pelo botão adicionar
          </p>
        </div>
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Send className="h-4 w-4" /> Mensagens enviadas
          </div>
          <p className="text-3xl font-semibold leading-tight">{nf.format(data.mensagens)}</p>
          <p className="text-xs text-muted-foreground">
            Envios confirmados pelos agitadores nas missões.
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Contatos importados em massa não entram nesta conta ({nf.format(data.importadosIgnorados)}{" "}
        no período). Contam apenas quem chegou por formulário público ou foi cadastrado no botão
        adicionar.
      </p>

      <div className="border-t pt-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          Cartão da campanha para compartilhar em grupos e redes. Só números somados — nenhum dado
          de contato aparece na imagem.
        </p>
        <ShareImageActions
          card={(ref) => (
            <CampaignShareCard data={data} periodoLabel={periodoLabel} innerRef={ref} />
          )}
          shareText={shareText}
          filename="jornada-da-campanha-povo-que-batalha.png"
          backgroundColor={CAMPAIGN_CARD_BG}
          shareLabel="Compartilhar cartão da campanha"
          preview
        />
      </div>
    </section>

  );
}
