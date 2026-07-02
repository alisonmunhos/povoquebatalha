import { createFileRoute, Link } from "@tanstack/react-router";
import { CommunicationTabs } from "@/components/CommunicationTabs";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listCampaigns } from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Calendar as CalIcon, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({ meta: [{ title: "Calendário de campanhas" }] }),
  component: CalendarioPage,
});

const statusColors: Record<string, string> = {
  draft: "bg-slate-200 text-slate-700",
  scheduled: "bg-blue-200 text-blue-800",
  running: "bg-emerald-200 text-emerald-800",
  paused: "bg-amber-200 text-amber-800",
  done: "bg-slate-300 text-slate-700",
  canceled: "bg-red-200 text-red-800",
};

function CalendarioPage() {
  const listFn = useServerFn(listCampaigns);
  const { data } = useSuspenseQuery({ queryKey: ["campaigns"], queryFn: () => listFn() });
  const [ref, setRef] = useState(() => new Date());

  const monthData = useMemo(() => {
    const year = ref.getFullYear();
    const month = ref.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: Date | null }> = [];
    for (let i = 0; i < startDay; i++) cells.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d) });
    return { cells, year, month, monthName: first.toLocaleString("pt-BR", { month: "long" }) };
  }, [ref]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, typeof data.rows> = {};
    for (const c of data.rows) {
      const dt = c.agendado_para ? new Date(c.agendado_para) : new Date(c.created_at);
      const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      (map[key] ??= []).push(c);
    }
    return map;
  }, [data.rows]);

  return (
    <div className="p-6 md:p-10 max-w-6xl">
    <div className="-mx-6 md:-mx-10 -mt-6 md:-mt-10 mb-6"><CommunicationTabs /></div>
      
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <CalIcon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Calendário de campanhas</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[160px] text-center font-semibold capitalize">{monthData.monthName} {monthData.year}</div>
          <Button variant="ghost" size="icon" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setRef(new Date())}>Hoje</Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground mb-1">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="p-2 text-center font-medium">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthData.cells.map((cell, i) => {
          if (!cell.date) return <div key={i} className="min-h-[110px] bg-muted/20 rounded" />;
          const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`;
          const events = eventsByDay[key] ?? [];
          const isToday = new Date().toDateString() === cell.date.toDateString();
          return (
            <div key={i} className={`min-h-[110px] border rounded p-1 bg-card ${isToday ? "ring-2 ring-primary" : ""}`}>
              <div className="text-xs font-medium mb-1">{cell.date.getDate()}</div>
              <div className="space-y-1">
                {events.slice(0, 3).map((c) => (
                  <Link
                    key={c.id}
                    to="/campanhas/$id"
                    params={{ id: c.id }}
                    className={`block text-[10px] px-1 py-0.5 rounded truncate ${statusColors[c.status] ?? ""}`}
                    title={c.nome}
                  >
                    {c.nome}
                  </Link>
                ))}
                {events.length > 3 && <div className="text-[10px] text-muted-foreground">+{events.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
