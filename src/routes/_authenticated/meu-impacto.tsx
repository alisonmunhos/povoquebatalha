// Tela "Meu Impacto" — retrospectiva pessoal do agitador, com cards, gráfico
// e imagem pronta para compartilhar no WhatsApp.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Flame, Loader2, Sparkles } from "lucide-react";
import { AgitacaoNav } from "@/components/AgitacaoNav";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { getMyImpactStats, getImpactStatsForUser } from "@/lib/impact-stats.functions";
import { milestoneFor, nextMilestone, resolveMilestone } from "@/lib/impact-milestones";
import { ShareCardActions } from "@/components/impact/ShareCardActions";
import { Button } from "@/components/ui/button";


export const Route = createFileRoute("/_authenticated/meu-impacto")({
  // ?userId= permite que a equipe (admin/vrm/operador) veja a MESMA tela de
  // outra pessoa. A checagem de permissão acontece no servidor.
  validateSearch: (search: Record<string, unknown>) => ({
    userId: typeof search["userId"] === "string" ? (search["userId"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Meu Impacto — Povo que Batalha" },
      {
        name: "description",
        content: "Veja quantas pessoas você já alcançou na campanha e compartilhe sua conquista.",
      },
    ],
  }),
  component: MyImpactPage,
});

function MyImpactPage() {
  const { userId } = Route.useSearch();
  const mineFn = useServerFn(getMyImpactStats);
  const otherFn = useServerFn(getImpactStatsForUser);
  const q = useQuery({
    queryKey: ["my-impact", userId ?? "me"],
    queryFn: () => (userId ? otherFn({ data: { userId } }) : mineFn()),
    retry: 1,
  });
  const [variant, setVariant] = useState<"total" | "day">("total");



  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando seus números…
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">Não foi possível carregar seus números.</p>
          <Button className="mt-3" variant="outline" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const s = q.data;
  const milestone = milestoneFor(s.connections.total);
  const next = nextMilestone(s.connections.total);
  const claimPercent =
    s.missions.openClaimTotal > 0
      ? Math.round((s.missions.sentInOpenClaim / s.missions.openClaimTotal) * 100)
      : null;
  const missionPercent =
    s.missions.total > 0 ? Math.round((s.missions.concluded / s.missions.total) * 100) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <AgitacaoNav title="Meu impacto" />


      {/* Destaque principal */}
      <section className="rounded-2xl border bg-card p-5 text-center shadow-punch">
        <p className="text-sm text-muted-foreground">Você já se conectou com</p>
        <p className="font-display text-6xl leading-none text-primary">{s.connections.total}</p>
        <p className="text-lg font-semibold">pessoas</p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> {milestone.badge}
        </p>
        <p className="mt-3 text-base font-semibold">{milestone.headline}</p>
        <p className="mt-1 text-sm italic text-muted-foreground">{milestone.phrase}</p>


        {next && (
          <div className="mt-4 text-left">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Próxima meta: {next.target} pessoas</span>
              <span>{next.percent}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${next.percent}%` }} />
            </div>
          </div>
        )}

        {s.streakDays > 1 && (
          <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-orange-600">
            <Flame className="h-3.5 w-3.5" /> {s.streakDays} dias seguidos em ação
          </p>
        )}
      </section>

      {/* Cards de números */}
      <section className="grid grid-cols-2 gap-2">
        <StatCard label="Mensagens hoje" value={s.messages.today} tone="primary" />
        <StatCard label="Mensagens no total" value={s.messages.total} />
        <StatCard label="Cadastros hoje" value={s.contacts.today} tone="primary" />
        <StatCard label="Cadastros no total" value={s.contacts.total} />
      </section>

      {/* Percentuais */}
      {(claimPercent !== null || missionPercent !== null) && (
        <section className="grid gap-2 sm:grid-cols-2">
          {claimPercent !== null && (
            <ProgressCard
              label="Sua leva atual"
              percent={claimPercent}
              detail={`${s.missions.sentInOpenClaim} de ${s.missions.openClaimTotal} enviados`}
            />
          )}
          {missionPercent !== null && (
            <ProgressCard
              label="Suas missões"
              percent={missionPercent}
              detail={`${s.missions.concluded} de ${s.missions.total} concluídas`}
            />
          )}
        </section>
      )}

      {/* Gráfico dos últimos 7 dias */}
      <section className="rounded-xl border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Últimos 7 dias</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={s.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="messages" name="Mensagens" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="contacts" name="Cadastros" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Compartilhar */}
      <section className="space-y-2 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Compartilhar sua conquista</h2>
        <p className="text-xs text-muted-foreground">
          Gera uma imagem com os seus números — sem mostrar nome ou telefone de ninguém da base.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant={variant === "total" ? "default" : "outline"}
            onClick={() => setVariant("total")}
          >
            Conquista geral
          </Button>
          <Button
            size="sm"
            variant={variant === "day" ? "default" : "outline"}
            onClick={() => setVariant("day")}
          >
            Conquista de hoje
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/minha-semana">Conquista da semana</Link>
          </Button>
        </div>
        <ShareCardActions
          stats={s}
          variant={variant}
          shareLabel={variant === "total" ? "Compartilhar minha conquista" : "Compartilhar o dia de hoje"}
          shareText={
            variant === "total"
              ? `Já me conectei com ${s.connections.total} pessoas na campanha do Povo que Batalha! 💪`
              : `Hoje eu me conectei com ${s.connections.today} pessoas na campanha do Povo que Batalha! 💪`
          }
        />
      </section>


    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "primary" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "primary" ? "bg-primary/10 border-primary/30" : "bg-card"}`}>
      <div className="font-display text-3xl leading-none">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function ProgressCard({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-display text-xl">{percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
