// Tela "Minha semana" — conquista da semana fechada, separada da conquista geral.
// Visual roxo, com gráfico da semana e imagem pronta pra compartilhar.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, Share2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { getMyImpactStats } from "@/lib/impact-stats.functions";
import { weekMilestoneFor } from "@/lib/impact-milestones";
import { ImpactShareCard } from "@/components/ImpactShareCard";
import { elementToPngBlob, downloadBlob, sharePng } from "@/lib/share-image";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/minha-semana")({
  head: () => ({
    meta: [
      { title: "Minha semana — Povo que Batalha" },
      {
        name: "description",
        content: "Sua conquista da semana na campanha: mensagens, cadastros e imagem pra compartilhar.",
      },
    ],
  }),
  component: MyWeekPage,
});

type Scope = "closed" | "current";

function MyWeekPage() {
  const statsFn = useServerFn(getMyImpactStats);
  const q = useQuery({ queryKey: ["my-impact"], queryFn: () => statsFn(), retry: 1 });
  const shareRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [scope, setScope] = useState<Scope>("closed");

  const week = useMemo(() => {
    if (!q.data) return null;
    return scope === "closed" ? q.data.weeks.closed : q.data.weeks.current;
  }, [q.data, scope]);

  async function withBlob(kind: "share" | "download") {
    if (!shareRef.current || !q.data || !week) return;
    setBusy(kind);
    try {
      const blob = await elementToPngBlob(shareRef.current);
      const filename = "minha-semana-povo-que-batalha.png";
      if (kind === "download") {
        downloadBlob(blob, filename);
        toast.success("Imagem salva no seu aparelho.");
        return;
      }
      const text = `Minha semana no Povo que Batalha: ${week.connections} pessoas alcançadas! 💜💪`;
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
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando sua semana…
      </div>
    );
  }

  if (q.isError || !q.data || !week) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">Não foi possível carregar sua semana.</p>
          <Button className="mt-3" variant="outline" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const s = q.data;
  const badge = weekMilestoneFor(week.connections);
  const previous = scope === "closed" ? s.weeks.beforeClosed : s.weeks.closed;
  const diff = week.connections - previous.connections;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Link
          to="/agitacao"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
          aria-label="Voltar para Agitação"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-display text-2xl">Minha semana</h1>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={scope === "closed" ? "default" : "outline"}
          onClick={() => setScope("closed")}
        >
          Semana que fechou
        </Button>
        <Button
          size="sm"
          variant={scope === "current" ? "default" : "outline"}
          onClick={() => setScope("current")}
        >
          Semana em curso
        </Button>
      </div>

      <section
        className="rounded-2xl border p-5 text-center shadow-punch"
        style={{ backgroundColor: "#7B4B94", color: "#F7F3EA", borderColor: "#7B4B94" }}
      >
        <p className="text-sm opacity-80">De {week.rangeLabel}, você se conectou com</p>
        <p className="font-display text-6xl leading-none">{week.connections}</p>
        <p className="text-lg font-semibold">pessoas</p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5" /> {badge.badge}
        </p>
        <p className="mt-3 text-sm italic opacity-90">{badge.phrase}</p>
        <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium opacity-90">
          {diff >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {diff === 0
            ? "Mesmo ritmo da semana anterior"
            : diff > 0
              ? `${diff} a mais que na semana anterior`
              : `${Math.abs(diff)} a menos que na semana anterior`}
        </p>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <WeekCard label="Mensagens" value={week.messages} />
        <WeekCard label="Cadastros" value={week.contacts} />
        <WeekCard label="Dias em ação" value={week.activeDays} />
      </section>

      <section className="rounded-xl border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Dia por dia (sábado a sexta)</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={week.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval={0} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="messages" name="Mensagens" fill="#7B4B94" radius={[4, 4, 0, 0]} />
              <Bar dataKey="contacts" name="Cadastros" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Compartilhar minha semana</h2>
        <p className="text-xs text-muted-foreground">
          Gera uma imagem roxa com os números da semana — sem mostrar nome ou telefone de ninguém.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="flex-1" disabled={busy !== null} onClick={() => void withBlob("share")}>
            {busy === "share" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="mr-2 h-4 w-4" />
            )}
            Compartilhar minha semana
          </Button>
          <Button size="lg" variant="outline" disabled={busy !== null} onClick={() => void withBlob("download")}>
            {busy === "download" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Baixar imagem
          </Button>
        </div>
        <Link to="/meu-impacto" className="inline-block pt-1 text-xs text-muted-foreground underline">
          Ver minha conquista geral
        </Link>
      </section>

      <div aria-hidden className="pointer-events-none fixed left-[-4000px] top-0 opacity-0">
        <ImpactShareCard stats={s} innerRef={shareRef} variant="week" week={week} />
      </div>
    </div>
  );
}

function WeekCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <div className="font-display text-3xl leading-none">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
