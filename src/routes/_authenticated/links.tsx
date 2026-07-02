import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LinkIcon, Copy, ExternalLink, Search } from "lucide-react";
import { listImportedContactsTokens } from "@/lib/duplicates.functions";
import { formatPhoneBR } from "@/lib/phone";

export const Route = createFileRoute("/_authenticated/links")({
  head: () => ({ meta: [{ title: "Links Públicos" }] }),
  component: LinksPage,
});

const ORIGEM_PRESETS = [
  "whatsapp_grupo_antigo",
  "site_campanha",
  "instagram",
  "evento_presencial",
  "qr_code_impresso",
  "lista_alicerce",
] as const;

function LinksPage() {
  const listFn = useServerFn(listImportedContactsTokens);
  const [origemPreset, setOrigemPreset] = useState<string>(ORIGEM_PRESETS[0]);
  const [origemCustom, setOrigemCustom] = useState("");
  const [search, setSearch] = useState("");

  const origem = origemCustom.trim() || origemPreset;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const links = useMemo(() => {
    const qp = origem ? `?origem=${encodeURIComponent(origem)}` : "";
    return [
      { key: "recadastro", label: "Recadastro completo", path: `/recadastro${qp}`, desc: "Formulário completo para apoiadores antigos." },
      { key: "inscrever", label: "Inscrição simples", path: `/inscrever${qp}`, desc: "Apenas nome + WhatsApp para lista de divulgação." },
    ];
  }, [origem]);

  const q = useQuery({
    queryKey: ["imported-tokens", search],
    queryFn: () => listFn({ data: { search, limit: 100 } }),
  });

  function copy(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl space-y-8">
      <header className="flex items-center gap-3">
        <LinkIcon className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Links Públicos</h1>
          <p className="text-sm text-muted-foreground">
            Gere links de recadastro e inscrição com origem rastreada e tokens individuais.
          </p>
        </div>
      </header>

      <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
        <div className="font-medium">URL pública do sistema</div>
        <div className="font-mono text-xs break-all bg-background border rounded p-2">{baseUrl || "—"}</div>
        <p className="text-xs text-muted-foreground">
          Use estes links para testar os formulários públicos em aba anônima ou enviar para pessoas de confiança.
          O painel administrativo continua privado e só pode ser acessado por usuários autorizados (rotas como
          <span className="font-mono"> /contatos</span>, <span className="font-mono">/importar</span> etc. exigem login).
        </p>
      </div>

      <section className="rounded-xl border p-5 bg-card space-y-3">
        <h2 className="font-semibold text-sm">Link do Módulo Território</h2>
        <div className="font-mono text-xs break-all bg-muted/40 border rounded p-2">
          {baseUrl ? `${baseUrl}/territorio` : "/territorio"}
        </div>
        <div className="flex gap-2">
          <button onClick={() => copy(`${baseUrl}/territorio`)} className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-muted">
            <Copy className="h-3 w-3" /> Copiar
          </button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Envie este link apenas para pessoas convidadas com papel <strong>Território</strong>.
          Após login, elas verão somente os contatos autorizados para seu escopo.
          No celular, ao abrir, use o menu do navegador → <em>Adicionar à tela inicial</em> para usar como app.
        </p>
      </section>


      <section className="border rounded-xl p-5 bg-card space-y-4">
        <h2 className="font-semibold text-sm">Origem do link (opcional)</h2>
        <p className="text-xs text-muted-foreground">
          Se preencher a origem, cada cadastro feito por esse link fica marcado com essa etiqueta —
          útil para saber depois de qual canal a pessoa veio (grupo antigo, panfleto, etc.).
          <strong> Se não quiser rastrear, deixe em branco e use o link limpo.</strong>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Preset</label>
            <select
              value={origemPreset}
              onChange={(e) => setOrigemPreset(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— nenhuma —</option>
              {ORIGEM_PRESETS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Origem personalizada (sobrescreve)</label>
            <input
              value={origemCustom}
              onChange={(e) => setOrigemCustom(e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase().slice(0, 60))}
              placeholder="ex: panfleto_outubro"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {links.map((l) => {
            const cleanUrl = `${baseUrl}${l.path.split("?")[0]}`;
            const fullUrl = `${baseUrl}${l.path}`;
            const hasOrigem = fullUrl !== cleanUrl;
            return (
              <div key={l.key} className="rounded-md border p-4 space-y-3 bg-background">
                <div>
                  <div className="font-medium text-sm">{l.label}</div>
                  <div className="text-xs text-muted-foreground">{l.desc}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide font-medium text-emerald-700">Link limpo (recomendado)</div>
                  <div className="font-mono text-xs break-all bg-emerald-50 border border-emerald-200 rounded p-2">{cleanUrl}</div>
                  <div className="flex gap-2">
                    <button onClick={() => copy(cleanUrl)} className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-muted">
                      <Copy className="h-3 w-3" /> Copiar
                    </button>
                    <a href={cleanUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-muted">
                      <ExternalLink className="h-3 w-3" /> Abrir
                    </a>
                  </div>
                </div>

                {hasOrigem && (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Com rastreamento de origem</div>
                    <div className="font-mono text-xs break-all bg-muted/40 rounded p-2">{fullUrl}</div>
                    <div className="flex gap-2">
                      <button onClick={() => copy(fullUrl)} className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-muted">
                        <Copy className="h-3 w-3" /> Copiar
                      </button>
                      <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-muted">
                        <ExternalLink className="h-3 w-3" /> Abrir
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="border rounded-xl p-5 bg-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Links individuais (recadastro de contatos importados)</h2>
          <div className="relative w-64">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome ou telefone…"
              className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs"
            />
          </div>
        </div>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Telefone</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 w-40">Ações</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Carregando…</td></tr>}
              {q.data?.rows.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Nenhum contato importado.</td></tr>}
              {q.data?.rows.map((c) => {
                const link = `${baseUrl}/recadastro?t=${c.recad_token}`;
                return (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-1.5 font-medium">{c.nome}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{formatPhoneBR(c.phone_e164)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{c.lifecycle_status}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1">
                        <button onClick={() => copy(link)} className="inline-flex items-center gap-1 text-[11px] rounded border px-2 py-0.5 hover:bg-muted">
                          <Copy className="h-3 w-3" /> Link
                        </button>
                        <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] rounded border px-2 py-0.5 hover:bg-muted">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
