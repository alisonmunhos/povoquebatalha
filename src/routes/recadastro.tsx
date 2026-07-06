import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PublicFormRenderer } from "@/components/PublicFormRenderer";

export const Route = createFileRoute("/recadastro")({
  validateSearch: z.object({
    origem: z.string().max(80).optional(),
    t: z.string().uuid().optional(),
    ref: z.string().min(8).max(48).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Atualização de Apoiadores" },
      { name: "description", content: "Atualize seus dados para continuar recebendo comunicados da Campanha do Povo que Batalha." },
      { property: "og:title", content: "Atualização de Apoiadores" },
      { property: "og:description", content: "Confirme seus dados e receba comunicados pelo WhatsApp." },
    ],
  }),
  ssr: false,
  component: Recadastro,
});

export function Recadastro() {
  const { t, ref } = Route.useSearch();
  return <PublicFormRenderer slug="recadastro-fixo" refToken={ref} recadToken={t} />;
}
