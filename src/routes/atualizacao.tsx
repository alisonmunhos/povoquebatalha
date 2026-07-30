// Alias público /atualizacao → mesmo formulário de /recadastro
// Mantém rota /recadastro para não quebrar QR codes/links antigos.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Recadastro } from "./recadastro";
import { shareMeta, canonical } from "@/lib/site-meta";

export const Route = createFileRoute("/atualizacao")({
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
        path: "/atualizacao",
      }),
      { name: "google", content: "notranslate" },
    ],
    links: canonical("/atualizacao"),
  }),
  ssr: false,
  component: Recadastro,
});
