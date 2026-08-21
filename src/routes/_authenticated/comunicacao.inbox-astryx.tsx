import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AstryxInbox } from "@/components/inbox-astryx/AstryxInbox";

const inboxSearchSchema = z.object({
  contact: fallback(z.string().trim().max(50), "").default(""),
});

export const Route = createFileRoute("/_authenticated/comunicacao/inbox-astryx")({
  validateSearch: zodValidator(inboxSearchSchema),
  head: () => ({
    meta: [
      { title: "Inbox (piloto Astryx) — Comunicação" },
      { name: "description", content: "Piloto visual do Inbox usando os componentes de Chat do design system Astryx." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AstryxInbox />,
});
