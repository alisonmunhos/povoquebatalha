import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { PublicFormRenderer } from "@/components/PublicFormRenderer";
import { shareMeta, canonical } from "@/lib/site-meta";

export const Route = createFileRoute("/recadastro")({
  validateSearch: z.object({
    origem: z.string().max(80).optional(),
    t: z.string().uuid().optional(),
    ref: z.string().min(8).max(48).optional(),
  }),
  head: () => ({
    meta: [
      ...shareMeta({
        title: "Atualização de Apoiadores",
        description:
          "Atualize seus dados para continuar recebendo comunicados da Campanha do Povo que Batalha.",
        path: "/recadastro",
      }),
      { name: "google", content: "notranslate" },
    ],
    links: canonical("/recadastro"),
  }),
  ssr: false,
  component: Recadastro,
});

export function Recadastro() {
  // strict: false porque este componente também é renderizado sob /atualizacao
  // (atualizacao.tsx reaproveita Recadastro como component) — Route.useSearch()
  // exigiria estar exatamente na rota /recadastro e quebra nesse outro contexto.
  const { t, ref } = useSearch({ strict: false }) as { t?: string; ref?: string };
  return <PublicFormRenderer slug="recadastro-fixo" refToken={ref} recadToken={t} />;
}
