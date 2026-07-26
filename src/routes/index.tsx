import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone } from "lucide-react";
import { InstallAppButton } from "@/components/InstallAppButton";

const MAIN_SECTIONED_FORM_SLUG = "seja-um-apoiador-a-da-campanha-do-povo-que-batalha";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campanha do Povo que Batalha" },
      {
        name: "description",
        content:
          "Faça parte da Campanha do Povo que Batalha. Cadastre-se e receba as próximas ações.",
      },
      { property: "og:title", content: "Campanha do Povo que Batalha" },
      {
        property: "og:description",
        content: "Faça parte da Campanha do Povo que Batalha. Cadastre-se e receba as próximas ações.",
      },
    ],
  }),
  ssr: false,
  component: Landing,
});

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

type BrowserKind = "chrome-android" | "safari-ios" | "firefox" | "edge" | "chrome-desktop" | "samsung" | "other";

function detectBrowser(): BrowserKind {
  if (typeof window === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  if (isIOS) return "safari-ios";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg\//i.test(ua)) return "edge";
  if (/Firefox\//i.test(ua)) return "firefox";
  if (/Android/i.test(ua) && /Chrome\//i.test(ua)) return "chrome-android";
  if (/Chrome\//i.test(ua)) return "chrome-desktop";
  return "other";
}

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
            className="text-sm rounded-md bg-primary text-primary-foreground px-4 py-1.5 font-medium hover:bg-primary/90 transition-colors"
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
          Faça parte da Campanha do Povo que Batalha. Cadastre-se, receba as próximas ações
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/f/$slug"
            params={{ slug: MAIN_SECTIONED_FORM_SLUG }}
            className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:bg-primary/90"
          >
            Participar da campanha
          </Link>
        </div>
        <div className="mt-10 border-2 border-primary/40 rounded-xl p-5 bg-card max-w-xl shadow-punch">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Megaphone className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-base">Instalar o app no seu celular</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Acesse mais rápido pela tela inicial e receba alertas das próximas ações.
              </p>
              <div className="mt-3">
                <InstallAppButton variant="card" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

