// Alias público /atualizacao → mesmo formulário de /recadastro
// Mantém rota /recadastro para não quebrar QR codes/links antigos.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Recadastro } from "./recadastro";

export const Route = createFileRoute("/atualizacao")({
  validateSearch: z.object({
    origem: z.string().max(80).optional(),
    t: z.string().uuid().optional(),
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
