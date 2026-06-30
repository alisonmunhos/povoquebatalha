import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, type ChangeEvent } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, AlertCircle, RefreshCw, Download, Undo2, Trash2, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  parseUpload,
  buildPreview,
  commitImport,
  listImports,
  FIELD_KEYS,
  type FieldKey,
  type EncodingOption,
} from "@/lib/imports.functions";
import {
  getUndoPreview,
  exportBackupCsv,
  undoImport,
  deleteImportFile,
} from "@/lib/imports-undo.functions";
import { formatPhoneBR, type PhoneStatus } from "@/lib/phone";

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

const ENCODING_LABELS: Record<EncodingOption, string> = {
  auto: "Detectar automaticamente",
  "utf-8": "UTF-8",
  "utf-8-bom": "UTF-8 com BOM",
  "iso-8859-1": "ISO-8859-1 (Latin-1)",
  "windows-1252": "Windows-1252 (Excel BR)",
};

const STATUS_COLORS: Record<PhoneStatus, string> = {
  valido: "bg-emerald-100 text-emerald-700 border-emerald-200",
  precisa_revisao: "bg-amber-100 text-amber-700 border-amber-200",
  sem_nono_digito: "bg-amber-100 text-amber-700 border-amber-200",
  sem_ddd: "bg-orange-100 text-orange-700 border-orange-200",
  invalido: "bg-rose-100 text-rose-700 border-rose-200",
  duplicado_possivel: "bg-blue-100 text-blue-700 border-blue-200",
};

type ParseResult = Awaited<ReturnType<typeof parseUpload>>;
type PreviewResult = Awaited<ReturnType<typeof buildPreview>>;

function ImportarPage() {
  const parseFn = useServerFn(parseUpload);
  const previewFn = useServerFn(buildPreview);
  const commitFn = useServerFn(commitImport);
  const listFn = useServerFn(listImports);
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<"idle" | "uploading" | "mapping" | "previewing" | "review" | "committing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [encoding, setEncoding] = useState<EncodingOption>("auto");
  const [defaultDdd, setDefaultDdd] = useState("");
  const [tipo, setTipo] = useState("apoiador");
  const [consent, setConsent] = useState(true);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof commitImport>> | null>(null);

  const history = useQuery({ queryKey: ["imports-history"], queryFn: () => listFn() });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setPreview(null);
    setStage("uploading");
    try {
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabase.storage.from("imports").upload(path, file);
      if (up.error) throw new Error(up.error.message);
      const res = await parseFn({ data: { filePath: path, fileName: file.name, encoding, defaultDdd: defaultDdd || null } });
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

  function onReparseEncoding(nextEncoding: EncodingOption) {
    // O encoding final é aplicado quando o usuário gera a prévia.
    // Mostramos um aviso para clicar em "Gerar prévia" para recalcular.
    setEncoding(nextEncoding);
  }

  async function onBuildPreview() {
    if (!parsed) return;
    const usedKeys = Object.values(mapping);
    if (!usedKeys.includes("nome") || !usedKeys.includes("phone_raw")) {
      setError("É obrigatório mapear pelo menos Nome e Telefone.");
      return;
    }
    setError(null);
    setStage("previewing");
    try {
      const p = await previewFn({ data: { importId: parsed.importId, encoding, defaultDdd: defaultDdd || null, mapping } });
      setPreview(p);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar prévia.");
      setStage("mapping");
    }
  }

  async function onCommit(strategy: "all" | "valid_only" | "mark_review") {
    if (!parsed) return;
    setError(null);
    setStage("committing");
    try {
      const r = await commitFn({ data: { importId: parsed.importId, strategy, consentimentoWhatsapp: consent, tipo } });
      setResult(r);
      setStage("done");
      history.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar.");
      setStage("review");
    }
  }

  function reset() {
    setStage("idle");
    setParsed(null);
    setMapping({});
    setPreview(null);
    setResult(null);
    setError(null);
    setEncoding("auto");
    setDefaultDdd("");
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-6">
      <header className="flex items-center gap-3">
        <Upload className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Importar contatos</h1>
          <p className="text-sm text-muted-foreground">
            CSV ou XLSX. Suporta UTF-8 e Windows-1252 (Excel BR). Normaliza telefones e detecta duplicidades.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex gap-2 items-start">
          <AlertCircle className="h-4 w-4 mt-0.5" /> {error}
        </div>
      )}

      {stage === "idle" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Encoding (CSV)</label>
              <select
                value={encoding}
                onChange={(e) => setEncoding(e.target.value as EncodingOption)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {(Object.entries(ENCODING_LABELS) as [EncodingOption, string][]).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">DDD padrão (opcional)</label>
              <input
                value={defaultDdd}
                onChange={(e) => setDefaultDdd(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="Ex: 51"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tipo de contato</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="apoiador">Apoiador (base antiga)</option>
                <option value="lista_divulgacao">Lista de divulgação</option>
                <option value="voluntario">Voluntário</option>
              </select>
            </div>
          </div>
          <label className="block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:bg-muted/30 transition">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFile} />
            <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <div className="font-medium">Clique para selecionar arquivo</div>
            <div className="text-xs text-muted-foreground mt-1">CSV, XLSX ou XLS — até 20MB</div>
          </label>
        </div>
      )}

      {stage === "uploading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Enviando e analisando arquivo…
        </div>
      )}

      {stage === "mapping" && parsed && (
        <section className="space-y-5">
          <div className="rounded-md bg-muted/40 px-4 py-3 text-sm flex flex-wrap items-center gap-4">
            <span><strong>{parsed.total}</strong> linhas detectadas</span>
            <span className="text-muted-foreground">Encoding usado: <strong>{parsed.usedEncoding}</strong></span>
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-xs">Trocar encoding:</label>
              <select
                value={encoding}
                onChange={(e) => onReparseEncoding(e.target.value as EncodingOption)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              >
                {(Object.entries(ENCODING_LABELS) as [EncodingOption, string][]).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border rounded-xl overflow-hidden bg-card">
            <div className="px-4 py-3 border-b text-sm font-semibold">Prévia dos dados (verifique acentos)</div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>{parsed.headers.map((h) => <th key={h} className="text-left px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {parsed.sample.map((row, i) => (
                    <tr key={i} className="border-t">
                      {parsed.headers.map((h) => <td key={h} className="px-3 py-1.5 whitespace-nowrap">{String(row[h] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                    onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as FieldKey })}
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    {FIELD_KEYS.map((k) => <option key={k} value={k}>{FIELD_LABELS[k]}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">DDD padrão (para telefones sem DDD)</label>
              <input
                value={defaultDdd}
                onChange={(e) => setDefaultDdd(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="Ex: 51"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm mt-5">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Marcar todos como tendo consentido com mensagens via WhatsApp
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={onBuildPreview} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">
              Gerar prévia de importação
            </button>
            <button onClick={reset} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          </div>
        </section>
      )}

      {stage === "previewing" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Normalizando telefones e procurando duplicidades…
        </div>
      )}

      {stage === "review" && preview && (
        <section className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <Stat label="Total" value={preview.stats.total} tone="blue" />
            <Stat label="Válidos" value={preview.stats.validos} tone="emerald" />
            <Stat label="Precisa revisão" value={preview.stats.precisa_revisao} tone="amber" />
            <Stat label="Inválidos" value={preview.stats.invalidos} tone="rose" />
            <Stat label="Duplicidades" value={preview.stats.duplicados} tone="blue" />
          </div>

          <div className="border rounded-xl overflow-hidden bg-card">
            <div className="px-4 py-3 border-b text-sm font-semibold flex items-center justify-between">
              <span>Revisão (até 200 linhas exibidas)</span>
              <button onClick={onBuildPreview} className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                <RefreshCw className="h-3 w-3" /> Recalcular
              </button>
            </div>
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Linha</th>
                    <th className="text-left px-3 py-2">Nome</th>
                    <th className="text-left px-3 py-2">Telefone original</th>
                    <th className="text-left px-3 py-2">Normalizado</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Duplicidade</th>
                    <th className="text-left px-3 py-2">Problemas</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r) => (
                    <tr key={r.linha} className="border-t">
                      <td className="px-3 py-1.5 text-muted-foreground">{r.linha}</td>
                      <td className="px-3 py-1.5 font-medium">{r.nome ?? <span className="text-rose-600">—</span>}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.phone.phone_original || "—"}</td>
                      <td className="px-3 py-1.5 tabular-nums">{formatPhoneBR(r.phone.phone_e164) || "—"}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${STATUS_COLORS[r.phone.phone_status]}`}>
                          {r.phone.phone_status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        {r.dup ? (
                          <span className="text-blue-700">
                            {r.dup.match === "forte" ? "↻ Atualiza" : `⚠ ${r.dup.match}`}: {r.dup.nome}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-rose-600">{r.problemas.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => onCommit("valid_only")} className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700">
              Importar apenas válidos ({preview.stats.validos + preview.stats.duplicados})
            </button>
            <button onClick={() => onCommit("mark_review")} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">
              Importar todos e marcar problemáticos para revisão
            </button>
            <button onClick={() => onCommit("all")} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
              Importar tudo (forçar)
            </button>
            <button onClick={() => setStage("mapping")} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
              Voltar
            </button>
            <button onClick={reset} className="rounded-md border border-destructive/30 text-destructive px-4 py-2 text-sm hover:bg-destructive/10">
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
            <Stat label="Duplicidades" value={result.duplicados} tone="amber" />
            <Stat label="Erros" value={result.erros} tone="rose" />
          </div>
          <button onClick={reset} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">
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
                  <td className="px-4 py-2 text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "blue" | "amber" | "rose" }) {
  const toneCls = { emerald: "text-emerald-600", blue: "text-blue-600", amber: "text-amber-600", rose: "text-rose-600" }[tone];
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
