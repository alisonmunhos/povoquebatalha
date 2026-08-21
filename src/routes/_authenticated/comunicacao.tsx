import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CommunicationTabs } from "@/components/CommunicationTabs";

export const Route = createFileRoute("/_authenticated/comunicacao")({
  head: () => ({ meta: [{ title: "Comunicação — Povo que Batalha" }] }),
  component: CommunicationLayout,
});

function CommunicationLayout() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <CommunicationTabs />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
