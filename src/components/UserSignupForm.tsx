// Formulário público de auto-cadastro de usuário do sistema — sem link mágico,
// sem expiração. Compartilhado entre /cadastro-agitador (papel fixo) e
// /cadastro-usuario (papel sugerido via link, escolhido pelo admin ao gerar o
// link). A conta cai em profiles.status='pendente_aprovacao' e só é ativada
// quando um admin aprova em "Usuários" → "Aguardando aprovação".
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Megaphone, CheckCircle2, MessageCircle } from "lucide-react";
import { useDeployRefresh } from "@/hooks/use-deploy-refresh";

type SuccessState = { whatsappPhone: string | null; nome: string };

export function UserSignupForm({
  endpoint, title, intro, waConfirmMessage, extraBody,
}: {
  endpoint: string;
  title: string;
  intro: string;
  waConfirmMessage: string;
  extraBody?: Record<string, unknown>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    const body = {
      nome: String(fd.get("nome") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      password,
      hp: String(fd.get("hp") ?? ""),
      ...extraBody,
    };
    setSubmitting(true);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error ?? "Erro ao enviar cadastro.");
      setSuccess({ whatsappPhone: json.whatsapp_phone ?? null, nome: body.nome });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar cadastro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center">
          <Link to="/" className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <span className="font-semibold">Campanha do Povo que Batalha</span>
          </Link>
        </div>
      </header>
      <main className="max-w-md mx-auto px-6 py-10">
        {success ? (
          <SuccessScreen state={success} waConfirmMessage={waConfirmMessage} />
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="mt-2 text-muted-foreground">{intro}</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4 bg-card border rounded-xl p-6">
              <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hidden" />
              <div>
                <label className="text-sm font-medium">Nome completo *</label>
                <input name="nome" required maxLength={120} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">WhatsApp (com DDD) *</label>
                <input name="phone" required placeholder="(11) 91234-5678" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">E-mail *</label>
                <input type="email" name="email" required maxLength={200} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Senha *</label>
                <input type="password" name="password" required minLength={8} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                <p className="text-[11px] text-muted-foreground mt-1">Mínimo 8 caracteres, com pelo menos uma letra e um número.</p>
              </div>
              <div>
                <label className="text-sm font-medium">Confirmar senha *</label>
                <input type="password" name="confirm" required minLength={8} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-primary text-primary-foreground py-2.5 font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {submitting ? "Enviando…" : "Enviar cadastro"}
              </button>
              <p className="text-[11px] text-muted-foreground">
                Ao enviar, você autoriza receber comunicações da campanha por WhatsApp relacionadas ao seu cadastro.
              </p>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

function SuccessScreen({ state, waConfirmMessage }: { state: SuccessState; waConfirmMessage: string }) {
  const numeroDigits = (state.whatsappPhone ?? "").replace(/\D+/g, "");
  const waMsg = encodeURIComponent(waConfirmMessage);
  const waUrl = numeroDigits ? `https://wa.me/${numeroDigits}?text=${waMsg}` : null;

  return (
    <div className="bg-card border rounded-xl p-6 space-y-5">
      <div className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="h-6 w-6" />
        <h1 className="text-xl font-semibold">Cadastro recebido!</h1>
      </div>
      <p className="text-sm">
        Obrigado, <strong>{state.nome}</strong>. Seu cadastro está em análise por um administrador.
        Você receberá uma mensagem no WhatsApp assim que for aprovado.
      </p>
      {waUrl && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <p className="text-sm text-emerald-900">
            <strong>Opcional:</strong> se quiser acelerar a aprovação, avise no WhatsApp da campanha.
            Este passo não é obrigatório.
          </p>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" /> Avisar no WhatsApp
          </a>
        </div>
      )}
      <Link to="/auth" className="inline-block text-sm text-primary hover:underline">
        Ir para a página de login →
      </Link>
    </div>
  );
}
