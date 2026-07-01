import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getZapiStatus, getZapiQr, disconnectZapi, testSendWhatsApp } from "@/lib/zapi.functions";
import { CheckCircle2, AlertCircle, QrCode, Send, RefreshCw, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Conexão Z-API" }] }),
  component: WhatsAppPage,
});

function WhatsAppPage() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getZapiStatus);
  const qrFn = useServerFn(getZapiQr);
  const disconnectFn = useServerFn(disconnectZapi);
  const testFn = useServerFn(testSendWhatsApp);

  const status = useSuspenseQuery({
    queryKey: ["zapi-status"],
    queryFn: () => statusFn(),
    refetchInterval: 8000,
  });

  const [showQr, setShowQr] = useState(false);
  const qr = useSuspenseQuery({
    queryKey: ["zapi-qr", showQr],
    queryFn: () => (showQr ? qrFn() : Promise.resolve(null)),
    refetchInterval: showQr ? 6000 : false,
  });

  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("Teste de envio da Campanha do Povo que Batalha.");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const s = status.data;
  const connected = s.configured && s.ok && s.status?.connected;

  return (
    <div className="p-6 md:p-10 max-w-4xl">
      <div className="flex items-center gap-3">
        <MessageCircle className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Conexão WhatsApp (Z-API)</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Mantenha a instância conectada para enviar e receber mensagens.
      </p>

      <div className="mt-8 grid md:grid-cols-2 gap-6">
        <section className="border rounded-xl p-6 bg-card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Status</h2>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["zapi-status"] })}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" /> Atualizar
            </button>
          </div>
          {!s.configured ? (
            <p className="mt-3 text-sm text-destructive">
              Z-API não configurada. Defina as variáveis de ambiente.
            </p>
          ) : !s.ok ? (
            <div className="mt-3 flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{s.error}</span>
            </div>
          ) : connected ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Conectado
              </div>
              {s.status?.smartphoneConnected !== undefined && (
                <div className="text-xs text-muted-foreground">
                  Smartphone: {s.status.smartphoneConnected ? "ok" : "desconectado"}
                </div>
              )}
              <button
                onClick={async () => {
                  if (!confirm("Desconectar o WhatsApp?")) return;
                  setBusy(true);
                  await disconnectFn();
                  setBusy(false);
                  qc.invalidateQueries({ queryKey: ["zapi-status"] });
                }}
                disabled={busy}
                className="text-xs rounded-md border border-destructive/30 text-destructive px-3 py-1.5 hover:bg-destructive/5 disabled:opacity-50"
              >
                Desconectar
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertCircle className="h-4 w-4" /> Desconectado
              </div>
              <button
                onClick={() => setShowQr((v) => !v)}
                className="text-sm rounded-md bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-2"
              >
                <QrCode className="h-4 w-4" />
                {showQr ? "Ocultar QR Code" : "Mostrar QR Code"}
              </button>
            </div>
          )}
        </section>

        <section className="border rounded-xl p-6 bg-card">
          <h2 className="font-semibold">Teste de envio</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Envie uma mensagem de teste para um número (com DDI).
          </p>
          <div className="mt-3 space-y-2">
            <input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="5511912345678"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={testMsg}
              onChange={(e) => setTestMsg(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              disabled={busy || !connected || !testPhone}
              onClick={async () => {
                setBusy(true);
                setTestResult(null);
                try {
                  await testFn({ data: { phone: testPhone, message: testMsg } });
                  setTestResult("Enviado!");
                } catch (e) {
                  setTestResult(e instanceof Error ? e.message : "Erro");
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {busy ? "Enviando…" : "Enviar teste"}
            </button>
            {testResult && <p className="text-xs">{testResult}</p>}
          </div>
        </section>
      </div>

      {showQr && (
        <section className="mt-6 border rounded-xl p-6 bg-card max-w-sm">
          <h2 className="font-semibold">QR Code</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho.
          </p>
          {qr.data?.ok && qr.data.image ? (
            <img
              src={qr.data.image}
              alt="QR Code Z-API"
              className="mt-3 w-full max-w-xs border rounded"
            />
          ) : qr.data && !qr.data.ok ? (
            <p className="mt-3 text-sm text-destructive">{qr.data.error}</p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>
          )}
        </section>
      )}

      <section className="mt-8 border rounded-xl p-6 bg-muted/30">
        <h2 className="font-semibold text-sm">Configuração de webhooks</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          No painel Z-API, configure cada evento apontando para a URL abaixo (substituindo o evento)
          com o token em query string. O token está salvo como secret <code>ZAPI_WEBHOOK_SECRET</code>.
        </p>
        <pre className="mt-3 text-xs bg-background border rounded p-3 overflow-x-auto">
{`https://<seu-projeto>.lovable.app/api/public/zapi/on-send?token=<ZAPI_WEBHOOK_SECRET>
                                               /on-delivery
                                               /on-read
                                               /on-receive
                                               /on-connect
                                               /on-disconnect`}
        </pre>
      </section>
    </div>
  );
}
