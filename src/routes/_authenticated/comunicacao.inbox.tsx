import { createFileRoute } from "@tanstack/react-router";
import { CommunicationInbox } from "@/components/CommunicationInbox";

export const Route = createFileRoute("/_authenticated/comunicacao/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Comunicação" }] }),
  component: () => <CommunicationInbox />,
});
