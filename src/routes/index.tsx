import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, Users, Send, Megaphone as MegaphoneIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campanha do Povo que Batalha" },
      {
        name: "description",
        content:
          "Plataforma para recadastrar apoiadores, organizar contatos e disparar campanhas de WhatsApp em massa com controle.",
      },
      { property: "og:title", content: "Campanha do Povo que Batalha da Campanha" },
      {
        property: "og:description",
        content: "Recadastro de apoiadores, CRM, segmentação e campanhas de WhatsApp.",
      },
    ],
  }),
  ssr: false,
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <span className="font-semibold">Campanha do Povo que Batalha</span>
          </div>
          <Link
            to="/auth"
            className="text-sm rounded-md border px-3 py-1.5 hover:bg-accent transition-colors"
          >
            Entrar
          </Link>
        </div>
      </header>
      <section className="max-w-5xl mx-auto px-6 py-20">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight max-w-3xl">
          Organize sua base e mobilize apoiadores pelo WhatsApp.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
          Recadastre apoiadores antigos, capte novos contatos e dispare campanhas segmentadas com
          controle de fila e histórico.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/recadastro"
            className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:bg-primary/90"
          >
            Formulário de recadastro
          </Link>
          <Link
            to="/inscrever"
            className="rounded-md border px-5 py-2.5 font-medium hover:bg-accent"
          >
            Quero receber informações
          </Link>
        </div>
        <div className="mt-16 grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Users,
              title: "CRM de apoiadores",
              text: "Importe planilhas, normalize telefones, deduplique contatos e segmente por tag, cidade e perfil.",
            },
            {
              icon: Send,
              title: "Campanhas de WhatsApp",
              text: "Crie mensagens personalizadas, pré-visualize, agende e dispare em fila com delay anti-spam.",
            },
            {
              icon: MegaphoneIcon,
              title: "Mobilização real",
              text: "Acompanhe entrega, leitura, respostas e opt-outs. Tudo registrado por contato e campanha.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="border rounded-xl p-5 bg-card">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
