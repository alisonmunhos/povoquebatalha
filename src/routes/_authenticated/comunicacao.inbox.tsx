import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { CommunicationInbox } from "@/components/CommunicationInbox";

const inboxSearchSchema = z.object({
  contact: fallback(z.string().trim().max(50), "").default(""),
});

export const Route = createFileRoute("/_authenticated/comunicacao/inbox")({
  validateSearch: zodValidator(inboxSearchSchema),
  head: () => ({ meta: [{ title: "Inbox — Comunicação" }] }),
  component: () => <CommunicationInbox />,
});
