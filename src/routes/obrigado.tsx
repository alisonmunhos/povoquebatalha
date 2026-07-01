import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2, Megaphone } from "lucide-react";

export const Route = createFileRoute("/obrigado")({
  validateSearch: z.object({ origem: z.enum(["recadastro", "inscricao"]).optional() }),
  head: () => ({
    meta: [
      { title: "Obrigado!" },
      { name: "description", content: "Atualização recebida com sucesso." },
    ],
  }),
  ssr: false,
  component: Obrigado,
});

function Obrigado() {
  const { origem } = Route.useSearch();
  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      <header className="border-b bg-background">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center">
          <Link to="/" className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <span className="font-semibold">Campanha do Povo que Batalha</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md text-center bg-card border rounded-xl p-8">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
          <h1 className="mt-4 text-2xl font-bold">Tudo certo!</h1>
          <p className="mt-2 text-muted-foreground">
            {origem === "recadastro"
              ? "Sua atualização foi concluída. Em breve você receberá uma mensagem de confirmação no WhatsApp."
              : "Sua inscrição foi confirmada. Em breve você começará a receber novidades pelo WhatsApp."}
          </p>
          <p className="mt-6 text-xs text-muted-foreground">
            Para cancelar a qualquer momento, responda <strong>SAIR</strong> em qualquer mensagem.
          </p>
        </div>
      </main>
    </div>
  );
}
