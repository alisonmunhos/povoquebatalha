import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PublicFormRenderer } from "@/components/PublicFormRenderer";

export const Route = createFileRoute("/inscrever")({
  validateSearch: z.object({ origem: z.string().max(80).optional(), ref: z.string().min(8).max(48).optional() }),
  head: () => ({
    meta: [
      { title: "Quero receber informações da campanha" },
      { name: "description", content: "Inscreva-se para receber notícias da campanha pelo WhatsApp." },
      { name: "google", content: "notranslate" },
    ],
  }),
  ssr: false,
  component: Inscrever,
});

function Inscrever() {
  const { ref } = Route.useSearch();
  return <PublicFormRenderer slug="inscrever-fixo" refToken={ref} />;
}
