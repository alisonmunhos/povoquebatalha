import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/opt-out/$token")({
  head: () => ({
    meta: [
      { title: "Cancelar comunicações" },
      { name: "description", content: "Cancele o envio de mensagens." },
    ],
  }),
  ssr: false,
  component: OptOut,
});

function OptOut() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState<string>("");
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/public/forms/opt-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setStatus("ok");
        } else {
          setStatus("error");
          setMsg(j.error ?? "Token inválido");
        }
      })
      .catch(() => {
        setStatus("error");
        setMsg("Erro de conexão");
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 px-6">
      <div className="max-w-sm w-full bg-card border rounded-xl p-8 text-center">
        <Megaphone className="h-8 w-8 text-primary mx-auto" />
        {status === "loading" && <p className="mt-4">Processando…</p>}
        {status === "ok" && (
          <>
            <h1 className="mt-4 text-xl font-semibold">Você foi descadastrado(a)</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Não enviaremos mais mensagens desta campanha para o seu número.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="mt-4 text-xl font-semibold">Link inválido</h1>
            <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Voltar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
