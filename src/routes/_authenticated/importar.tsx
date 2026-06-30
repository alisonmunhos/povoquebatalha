import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, type ChangeEvent } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  parseUpload,
  commitImport,
  listImports,
  FIELD_KEYS,
  type FieldKey,
} from "@/lib/imports.functions";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({ meta: [{ title: "Importar contatos" }] }),
  component: ImportarPage,
});

const FIELD_LABELS: Record<FieldKey, string> = {
  ignore: "— Ignorar —",
  nome: "Nome",
  phone_raw: "Telefone",
  email: "E-mail",
  cidade: "Cidade",
  uf: "UF",
  cep: "CEP",
  endereco: "Endereço",
  numero: "Número",
  bairro: "Bairro",
  observacoes: "Observações",
};

type ParseResult = {
  importId: string;
  headers: string[];
  mapping: Record<string, FieldKey>;
  total: number;
  sample: Record<string, string>[];
};

function ImportarPage() {
  const parseFn = useServerFn(parseUpload);
  const commitFn = useServerFn(commitImport);
  const listFn = useServerFn(listImports);
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<"idle" | "uploading" | "mapping" | "committing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [consent, setConsent] = useState(true);
  const [result, setResult] = useState<{
    criados: number;
    atualizados: number;
    duplicados: number;
    erros: number;
  } | null>(null);

  const history = useQuery({
    queryKey: ["imports-history"],
    queryFn: () => listFn(),
  });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setStage("uploading");
    try {
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabase.storage.from("imports").upload(path, file);
      if (up.error) throw new Error(up.error.message);
      const res = (await parseFn({
        data: { filePath: path, fileName: file.name },
      })) as ParseResult;
      setParsed(res);
      setMapping(res.mapping);
      setStage("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar arquivo.");
      setStage("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onCommit() {
    if (!parsed) return;
    const usedKeys = Object.values(mapping);
    if (!usedKeys.includes("nome") || !usedKeys.includes("phone_raw")) {
      setError("É obrigatório mapear pelo menos Nome e Telefone.");
      return;
    }
    setError(null);
    setStage("committing");
    try {
      const r = await commitFn({
        data: {
          importId: parsed.importId,
          mapping,
          consentimentoWhatsapp: consent,
        },
      });
      setResult(r);
      setStage("done");
      history.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar.");
      setStage("mapping");
    }
  }

  function reset() {
    setStage("idle");
    setParsed(null);
    setMapping({});
    setResult(null);
    setError(null);
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl space-y-6">
      <header className="flex items-center gap-3">
        <Upload className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Importar contatos</h1>
          <p className="text-sm text-muted-foreground">
            CSV ou XLSX. Normalizamos telefones automaticamente e deduplicamos por número.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex gap-2 items-start">
          <AlertCircle className="h-4 w-4 mt-0.5" /> {error}
        </div>
      )}

      {stage === "idle" && (
        <label className="block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:bg-muted/30 transition">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={onFile}
          />
          <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <div className="font-medium">Clique para selecionar arquivo</div>
          <div className="text-xs text-muted-foreground mt-1">CSV, XLSX ou XLS — até 20MB</div>
        </label>
      )}

      {stage === "uploading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Enviando e analisando arquivo…
        </div>
      )}

      {stage === "mapping" && parsed && (
        <section className="space-y-5">
          <div className="rounded-md bg-muted/40 px-4 py-2 text-sm">
            <strong>{parsed.total}</strong> linhas detectadas. Confira o mapeamento abaixo.
          </div>

          <div className="border rounded-xl overflow-hidden bg-card">
            <div className="px-4 py-3 border-b text-sm font-semibold">Mapeamento de colunas</div>
            <div className="divide-y">
              {parsed.headers.map((h) => (
                <div key={h} className="grid grid-cols-[1fr_auto_220px] items-center gap-3 px-4 py-2">
                  <div className="text-sm font-medium truncate">{h}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                    {parsed.sample.slice(0, 2).map((r) => r[h]).filter(Boolean).join(" • ") || "—"}
                  </div>
                  <select
                    value={mapping[h] ?? "ignore"}
                    onChange={(e) =>
                      setMapping({ ...mapping, [h]: e.target.value as FieldKey })
                    }
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    {FIELD_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {FIELD_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Marcar todos como tendo consentido com mensagens via WhatsApp
          </label>

          <div className="flex gap-2">
            <button
              onClick={onCommit}
              disabled={stage !== "mapping"}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              Importar {parsed.total} linhas
            </button>
            <button
              onClick={reset}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      {stage === "committing" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Processando contatos. Isso pode levar alguns minutos…
        </div>
      )}

      {stage === "done" && result && (
        <section className="border rounded-xl p-6 bg-card space-y-4">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Importação concluída</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Criados" value={result.criados} tone="emerald" />
            <Stat label="Atualizados" value={result.atualizados} tone="blue" />
            <Stat label="Duplicados" value={result.duplicados} tone="amber" />
            <Stat label="Erros" value={result.erros} tone="rose" />
          </div>
          <button
            onClick={reset}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            Importar outro arquivo
          </button>
        </section>
      )}

      <section className="border rounded-xl bg-card overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-semibold">Histórico</div>
        {history.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : (history.data?.rows.length ?? 0) === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhuma importação ainda.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase">
              <tr>
                <th className="px-4 py-2">Arquivo</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Criados</th>
                <th className="px-4 py-2">Duplic.</th>
                <th className="px-4 py-2">Erros</th>
                <th className="px-4 py-2">Quando</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2 truncate max-w-[260px]">{r.file_name}</td>
                  <td className="px-4 py-2">{r.status}</td>
                  <td className="px-4 py-2">{r.total}</td>
                  <td className="px-4 py-2 text-emerald-600">{r.criados}</td>
                  <td className="px-4 py-2 text-amber-600">{r.duplicados}</td>
                  <td className="px-4 py-2 text-rose-600">{r.erros}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "blue" | "amber" | "rose";
}) {
  const toneCls = {
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
  }[tone];
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
