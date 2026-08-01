import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats } from "@/lib/dashboard.functions";
import { Users, MessageCircle, Send, UserMinus, MapPin, MapPinOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard" }] }),
  component: Dashboard,
});

function Dashboard() {
  const fn = useServerFn(getDashboardStats);
  const { data } = useSuspenseQuery({ queryKey: ["dashboard"], queryFn: () => fn() });

  const cards = [
    { label: "Contatos", value: data.totalContatos, icon: Users, hint: `${data.novosNaSemana} novos esta semana` },
    { label: "Com consentimento", value: data.comConsentimento, icon: MessageCircle, hint: "podem receber WhatsApp" },
    { label: "Opt-out", value: data.optOut, icon: UserMinus, hint: "pediram para não receber" },
    { label: "Fora da base", value: data.arquivados, icon: Archive, hint: "arquivados: não entram no total" },
    { label: "Duplicidades a revisar", value: data.duplicidadesRevisar, icon: Copy, hint: "pares aguardando decisão" },
    { label: "Campanhas", value: data.totalCampanhas, icon: Send, hint: `${data.enviadasNaSemana} envios na semana` },
    { label: "Com geolocalização", value: data.comGeolocalizacao, icon: MapPin, hint: "aparecem no mapa" },
    { label: "Sem geolocalização", value: data.semGeolocalizacao, icon: MapPinOff, hint: "pendentes de geocode" },
    { label: "Campanhas em rascunho", value: data.campanhasRascunho, icon: Send, hint: "aguardando envio" },
    { label: "Campanhas em envio", value: data.campanhasEmEnvio, icon: Send, hint: "processando fila" },
  ];


  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Visão geral da base e dos disparos recentes.
      </p>
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="border rounded-xl p-5 bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{c.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{c.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 grid md:grid-cols-2 gap-4">
        <Link
          to="/contatos"
          className="border rounded-xl p-5 bg-card hover:shadow-sm transition-shadow"
        >
          <h3 className="font-semibold">Ver contatos</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Pesquise, filtre e edite os apoiadores cadastrados.
          </p>
        </Link>
        <Link
          to="/whatsapp"
          className="border rounded-xl p-5 bg-card hover:shadow-sm transition-shadow"
        >
          <h3 className="font-semibold">Conexão WhatsApp</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Conecte a instância Z-API, gere QR Code e teste envios.
          </p>
        </Link>
      </div>
    </div>
  );
}
