import { createFileRoute } from "@tanstack/react-router";
import { CommunicationTabs } from "@/components/CommunicationTabs";
import { useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getZapiStatus, getZapiQr, disconnectZapi, testSendWhatsApp, getInstanceSettings, setInstanceInboundEnabled, getWebhookDiagnostics } from "@/lib/zapi.functions";
import { CheckCircle2, AlertCircle, QrCode, Send, RefreshCw, MessageCircle, Copy, Inbox as InboxIcon } from "lucide-react";

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
  const settingsFn = useServerFn(getInstanceSettings);
  const setInboundFn = useServerFn(setInstanceInboundEnabled);

  const settings = useSuspenseQuery({
    queryKey: ["zapi-instance-settings"],
    queryFn: () => settingsFn(),
  });

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
    <div className="-mx-6 md:-mx-10 -mt-6 md:-mt-10 mb-6"><CommunicationTabs /></div>
      
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

      <section className="mt-6 border rounded-xl p-6 bg-card">
        <h2 className="font-semibold">Recebimento de mensagens (Inbox)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Quando <b>ligado</b>, mensagens iniciadas por terceiros (inclusive de números que não estão na base) aparecem no Inbox e o contato é criado/mesclado automaticamente. Quando <b>desligado</b>, o sistema só mostra conversas iniciadas por você.
        </p>
        <label className="mt-3 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.data.inbound_to_inbox_enabled}
            disabled={busy}
            onChange={async (e) => {
              const enabled = e.target.checked;
              setBusy(true);
              try {
                await setInboundFn({ data: { enabled } });
                qc.invalidateQueries({ queryKey: ["zapi-instance-settings"] });
              } finally { setBusy(false); }
            }}
            className="h-5 w-5"
          />
          <span className="text-sm font-medium">
            {settings.data.inbound_to_inbox_enabled ? "Ligado — recebendo mensagens no Inbox" : "Desligado — Inbox só mostra conversas iniciadas por você"}
          </span>
        </label>
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          <b>Dica sobre teste com seu número:</b> a Z-API está pareada com o seu WhatsApp; mensagens enviadas por ela saem do seu número. Você <b>não</b> recebe no seu próprio celular — quem recebe é o destinatário. Para conferir, peça a alguém confirmar o recebimento.
        </p>
      </section>

      <WebhookDiagnosticsSection />
    </div>
  );
}

function WebhookDiagnosticsSection() {
  const diagFn = useServerFn(getWebhookDiagnostics);
  const q = useQuery({
    queryKey: ["zapi-webhook-diag"],
    queryFn: () => diagFn(),
    refetchInterval: 20000,
  });

  const d = q.data;
  const noEvents = d && !d.last_event;
  const staleReceive =
    d?.last_receive && Date.now() - new Date(d.last_receive.received_at).getTime() > 24 * 3600 * 1000;

  return (
    <section className="mt-8 border rounded-xl p-6 bg-card">
      <div className="flex items-center gap-2">
        <InboxIcon className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Webhooks Z-API — configuração e diagnóstico</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Cole cada URL abaixo no evento correspondente do painel da Z-API (menu Webhooks). Sem isso, o Inbox não recebe mensagens.
      </p>

      {q.isLoading && <p className="mt-4 text-sm text-muted-foreground">Carregando diagnóstico…</p>}

      {d && (
        <>
          <div className="mt-4 grid gap-2">
            {d.urls.map((u) => (
              <div key={u.event} className="flex items-center gap-2 border rounded-md p-2 bg-background">
                <div className="w-40 shrink-0 text-xs font-mono text-muted-foreground">{u.event}</div>
                <input
                  readOnly
                  value={u.url}
                  className="flex-1 text-xs font-mono px-2 py-1 rounded border bg-muted/40"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(u.url);
                      toast.success("URL copiada");
                    } catch { toast.error("Não foi possível copiar"); }
                  }}
                  className="text-xs inline-flex items-center gap-1 px-2 py-1 border rounded-md hover:bg-muted"
                >
                  <Copy className="h-3 w-3" /> Copiar
                </button>
              </div>
            ))}
          </div>

          {!d.has_secret && (
            <p className="mt-3 text-xs text-destructive">Secret <code>ZAPI_WEBHOOK_SECRET</code> ausente — defina em Segredos.</p>
          )}

          <div className="mt-5 grid md:grid-cols-3 gap-3 text-xs">
            <div className="border rounded-md p-3 bg-background">
              <div className="font-semibold mb-1">Último evento recebido</div>
              {d.last_event ? (
                <>
                  <div className="font-mono">{d.last_event.evento}</div>
                  <div className="text-muted-foreground">{fmt(d.last_event.received_at)}</div>
                </>
              ) : (
                <div className="text-destructive">Nenhum ainda — webhooks não configurados na Z-API.</div>
              )}
            </div>
            <div className="border rounded-md p-3 bg-background">
              <div className="font-semibold mb-1">Última mensagem recebida (on-receive)</div>
              {d.last_receive ? (
                <>
                  <div className="text-muted-foreground">{fmt(d.last_receive.received_at)}</div>
                  {staleReceive && <div className="text-amber-700 mt-1">Nenhuma nas últimas 24 h.</div>}
                </>
              ) : (
                <div className="text-amber-700">Nenhuma recebida ainda.</div>
              )}
            </div>
            <div className="border rounded-md p-3 bg-background">
              <div className="font-semibold mb-1">Instância</div>
              <div className="text-muted-foreground">Status: {d.instance?.status ?? "—"}</div>
              <div className="text-muted-foreground">Número: {d.instance?.numero_conectado ?? "—"}</div>
              <div className="text-muted-foreground">Último ping: {d.instance?.last_ping ? fmt(d.instance.last_ping) : "—"}</div>
            </div>
          </div>

          {d.last_error && (
            <div className="mt-3 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
              Último erro: <b>{d.last_error.evento}</b> — {d.last_error.erro} <span className="text-muted-foreground">({fmt(d.last_error.received_at)})</span>
            </div>
          )}

          {noEvents && (
            <div className="mt-4 text-xs bg-amber-50 border border-amber-200 rounded p-3 text-amber-900">
              <b>Nenhum webhook chegou ainda.</b> Passo a passo:
              <ol className="list-decimal ml-5 mt-1 space-y-0.5">
                <li>Abra o painel da Z-API → sua instância → menu <b>Webhooks</b>.</li>
                <li>Cole cada URL acima no evento correspondente e salve.</li>
                <li>Envie uma mensagem do seu celular pareado para o número conectado.</li>
                <li>Volte aqui e clique em <i>Atualizar</i>.</li>
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function fmt(iso: string) {
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}
