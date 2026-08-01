// Tela "Meu Impacto" — retrospectiva pessoal do agitador, com cards, gráfico
// e imagem pronta para compartilhar no WhatsApp.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, Flame, Loader2, Share2, Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { getMyImpactStats } from "@/lib/impact-stats.functions";
import { milestoneFor, nextMilestone } from "@/lib/impact-milestones";
import { ImpactShareCard } from "@/components/ImpactShareCard";
import { elementToPngBlob, downloadBlob, sharePng } from "@/lib/share-image";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/meu-impacto")({
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
  const statsFn = useServerFn(getMyImpactStats);
  const q = useQuery({ queryKey: ["my-impact"], queryFn: () => statsFn(), retry: 1 });
  const shareRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [variant, setVariant] = useState<"total" | "day">("total");

  async function withBlob(kind: "share" | "download") {
    if (!shareRef.current || !q.data) return;
    setBusy(kind);
    try {
      const blob = await elementToPngBlob(shareRef.current);
      const filename = "meu-impacto-povo-que-batalha.png";
      if (kind === "download") {
        downloadBlob(blob, filename);
        toast.success("Imagem salva no seu aparelho.");
        return;
      }
      const total = variant === "total" ? q.data.connections.total : q.data.connections.today;
      const text =
        variant === "total"
          ? `Já me conectei com ${total} pessoas na campanha do Povo que Batalha! 💪`
          : `Hoje eu me conectei com ${total} pessoas na campanha do Povo que Batalha! 💪`;
      const r = await sharePng({ blob, filename, text });
      if (r === "downloaded") {
        toast.info("Imagem baixada. Anexe no WhatsApp que já abrimos pra você.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a imagem.");
    } finally {
      setBusy(null);
    }
  }

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
        <p className="mt-3 text-sm italic text-muted-foreground">{milestone.phrase}</p>

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
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="flex-1" disabled={busy !== null} onClick={() => void withBlob("share")}>
            {busy === "share" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="mr-2 h-4 w-4" />
            )}
            {variant === "total" ? "Compartilhar minha conquista" : "Compartilhar o dia de hoje"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void withBlob("download")}
          >
            {busy === "download" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Baixar imagem
          </Button>
        </div>
      </section>

      {/* Card de compartilhamento renderizado fora da tela, no tamanho real. */}
      <div aria-hidden className="pointer-events-none fixed left-[-4000px] top-0 opacity-0">
        <ImpactShareCard stats={s} innerRef={shareRef} variant={variant} />
      </div>

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
