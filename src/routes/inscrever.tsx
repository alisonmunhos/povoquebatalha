import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PublicFormRenderer } from "@/components/PublicFormRenderer";
import { shareMeta, canonical } from "@/lib/site-meta";

export const Route = createFileRoute("/inscrever")({
  validateSearch: z.object({ origem: z.string().max(80).optional(), ref: z.string().min(8).max(48).optional() }),
  head: () => ({
    meta: [
      ...shareMeta({
        title: "Quero receber informações da campanha",
        description: "Inscreva-se para receber notícias da Campanha do Povo que Batalha pelo WhatsApp.",
        path: "/inscrever",
      }),
      { name: "google", content: "notranslate" },
    ],
    links: canonical("/inscrever"),
  }),
  ssr: false,
  component: Inscrever,
});

function Inscrever() {
  const { ref } = Route.useSearch();
  return <PublicFormRenderer slug="inscrever-fixo" refToken={ref} />;
}
