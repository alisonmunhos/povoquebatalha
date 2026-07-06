import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { Megaphone, CheckCircle2, Loader2 } from "lucide-react";
import { useCepLookup, formatCep } from "@/hooks/use-cep";

export const Route = createFileRoute("/recadastro")({
  validateSearch: z.object({
    origem: z.string().max(80).optional(),
    t: z.string().uuid().optional(),
    ref: z.string().min(8).max(48).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Atualização de Apoiadores" },
      { name: "description", content: "Atualize seus dados para continuar recebendo comunicados da Campanha do Povo que Batalha." },
      { property: "og:title", content: "Atualização de Apoiadores" },
      { property: "og:description", content: "Confirme seus dados e receba comunicados pelo WhatsApp." },
    ],
  }),
  ssr: false,
  component: Recadastro,
});

const FORMAS_AJUDA_OPTS: Array<{ value: string; label: string }> = [
  { value: "panfletagem_banquinha", label: "Panfletagem / Banquinha" },
  { value: "compartilhar_whatsapp", label: "Compartilhar material no WhatsApp" },
  { value: "compartilhar_redes", label: "Compartilhar nas redes sociais" },
  { value: "participar_eventos", label: "Participar de eventos" },
  { value: "ajudar_organizacao", label: "Ajudar na organização" },
  { value: "mobilizar_bairro", label: "Mobilizar pessoas do bairro" },
  { value: "adesivar_carro", label: "Quero adesivar meu carro" },
  { value: "plaquinha_casa", label: "Quero colocar uma plaquinha na frente de casa" },
  { value: "receber_panfletos", label: "Receber panfletos e adesivos" },
  { value: "outro", label: "Outro" },
];

export function Recadastro() {
  const navigate = useNavigate();
  const { origem, t, ref } = Route.useSearch();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  // 'idle' — nada consultado ainda; 'ok' — lookup OK e usuário não alterou;
  // 'edited' — lookup OK mas usuário editou algum campo (rua/bairro/cidade/UF);
  // 'not_found' — CEP não retornou; 'manual' — usuário optou por preencher sem CEP.
  const [cepStatus, setCepStatus] = useState<"idle" | "ok" | "edited" | "not_found" | "manual">("idle");
  const [formasAjuda, setFormasAjuda] = useState<string[]>([]);
  const [coletivoAlicerce, setColetivoAlicerce] = useState<"sim" | "nao" | "">("");
  const [movSocial, setMovSocial] = useState<"sim" | "nao" | "">("");
  const cepHook = useCepLookup();
  const numeroRef = useRef<HTMLInputElement>(null);

  async function onCepChange(v: string) {
    const formatted = formatCep(v);
    setCep(formatted);
    const digits = formatted.replace(/\D/g, "");
    if (digits.length !== 8) {
      if (cepStatus !== "manual") setCepStatus("idle");
      return;
    }
    const res = await cepHook.lookup(digits);
    if (res) {
      if (res.endereco) setEndereco(res.endereco);
      if (res.bairro) setBairro(res.bairro);
      if (res.cidade) setCidade(res.cidade);
      if (res.uf) setUf(res.uf);
      setCepStatus("ok");
      numeroRef.current?.focus();
    } else {
      setCepStatus("not_found");
    }
  }

  // Marca como "edited" se o usuário mexer nos campos após um lookup OK.
  function markEdited() {
    if (cepStatus === "ok") setCepStatus("edited");
  }


  function toggleForma(v: string) {
    setFormasAjuda((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      nome: String(fd.get("nome") ?? ""),
      nome_social: String(fd.get("nome_social") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      email: String(fd.get("email") ?? ""),
      cep,
      endereco,
      numero,
      complemento,
      referencia: String(fd.get("referencia") ?? ""),
      bairro,
      cidade,
      uf,
      como_conheceu: String(fd.get("como_conheceu") ?? ""),
      profissao: String(fd.get("profissao") ?? ""),
      instituicao: String(fd.get("instituicao") ?? ""),
      coletivo_alicerce: coletivoAlicerce === "sim" ? true : coletivoAlicerce === "nao" ? false : undefined,
      participa_movimento_social: movSocial === "sim" ? true : movSocial === "nao" ? false : undefined,
      movimento_social_nome: movSocial === "sim" ? String(fd.get("movimento_social_nome") ?? "") : "",
      formas_ajuda: formasAjuda,
      formas_ajuda_outro: String(fd.get("formas_ajuda_outro") ?? ""),
      consentimento_whatsapp: fd.get("consentimento_whatsapp") === "on",
      origem_detalhe: origem ?? "",
      recad_token: t ?? "",
      ref_token: ref ?? "",
      hp: String(fd.get("hp") ?? ""),
    };
    setSubmitting(true);
    try {
      const r = await fetch("/api/public/forms/recadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error ?? "Erro ao enviar");
      navigate({ to: "/obrigado", search: { origem: "recadastro" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <span className="font-semibold">Campanha do Povo que Batalha</span>
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Atualização de Apoiadores</h1>
        <p className="mt-2 text-muted-foreground">
          Atualize seus dados para continuar recebendo comunicados e participar das ações da campanha.
          Suas informações são armazenadas de forma segura.
        </p>
        {t && (
          <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
            ✓ Identificamos seu cadastro anterior. Confirme seus dados abaixo.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-8 space-y-8 bg-card border rounded-xl p-6">
          <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hidden" />

          <section className="space-y-5">
            <h2 className="text-lg font-semibold border-b pb-2">Dados pessoais</h2>
            <Field label="Nome completo *" name="nome" required maxLength={120} />
            <Field label="Nome social / apelido" name="nome_social" maxLength={120} placeholder="Como prefere ser chamado(a)" />
            <Field label="WhatsApp (com DDD) *" name="phone" required placeholder="(11) 91234-5678" inputMode="tel" maxLength={20} />
            <Field label="E-mail" name="email" type="email" maxLength={255} />
            <Field label="Profissão / ocupação" name="profissao" maxLength={120} />
            <div>
              <Field label="Onde você trabalha?" name="instituicao" maxLength={240} />
              <p className="mt-1 text-xs text-muted-foreground">Ex: Escola Municipal Getúlio Vargas, Secretaria de Saúde, Mercado Central, Autônomo(a). Se for funcionário público, o nome do local (escola, posto de saúde, etc.) já é suficiente — não precisa saber o nome oficial do órgão.</p>
            </div>
          </section>

          <section className="space-y-5">
            <h2 className="text-lg font-semibold border-b pb-2">Endereço</h2>
            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <label className="text-sm font-medium flex items-center gap-2">
                  CEP {cepHook.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                </label>
                <input
                  value={cep}
                  onChange={(e) => onCepChange(e.target.value)}
                  placeholder="00000-000"
                  inputMode="numeric"
                  maxLength={9}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                {cepHook.error && <p className="text-xs text-amber-600 mt-1">{cepHook.error} — preencha manualmente</p>}
              </div>
              <Field label="UF" value={uf} onChange={(e) => { setUf(e.target.value.toUpperCase()); markEdited(); }} maxLength={2} placeholder="SP" />
            </div>

            {/* Feedback do CEP: card verde quando encontramos, amarelo quando falha */}
            {cepStatus === "ok" && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-emerald-900">Endereço encontrado pelo CEP</div>
                  <div className="text-emerald-800/80 text-xs mt-0.5">
                    Confira rua, bairro e cidade abaixo. Se algo estiver errado, é só editar.
                  </div>
                </div>
              </div>
            )}
            {cepStatus === "edited" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Você ajustou o endereço sugerido pelo CEP — vamos salvar os dados que você digitou.
              </div>
            )}
            {cepStatus === "not_found" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                CEP não encontrado. Sem problema — preencha o endereço manualmente abaixo. Seu cadastro será salvo normalmente.
              </div>
            )}

            <Field label="Endereço (rua/avenida)" value={endereco} onChange={(e) => { setEndereco(e.target.value); markEdited(); }} maxLength={240} />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-2">
                  Número
                  <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">Importante</span>
                </label>
                <input
                  ref={numeroRef}
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  maxLength={20}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  O número é essencial para localizar sua casa no mapa da campanha.
                </p>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Complemento</label>
                <input
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  maxLength={120}
                  placeholder="Apto, casa, bloco…"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <Field label="Bairro" value={bairro} onChange={(e) => { setBairro(e.target.value); markEdited(); }} maxLength={120} />
            <Field label="Cidade" value={cidade} onChange={(e) => { setCidade(e.target.value); markEdited(); }} maxLength={120} />
            <Field label="Ponto de referência" name="referencia" maxLength={240} placeholder="Próximo a..." />

            {/* Prévia final do endereço */}
            {(endereco || cidade) && (
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                  Endereço que será salvo
                </div>
                <div className="text-sm">
                  {[
                    [endereco, numero].filter(Boolean).join(", "),
                    complemento,
                    bairro,
                    [cidade, uf].filter(Boolean).join("/"),
                    cep,
                  ].filter(Boolean).join(" — ") || "—"}
                </div>
                {!numero && endereco && (
                  <div className="text-[11px] text-amber-700 mt-1">
                    ⚠ Sem número, sua localização no mapa vai ficar aproximada.
                  </div>
                )}
              </div>
            )}
          </section>


          <section className="space-y-5">
            <h2 className="text-lg font-semibold border-b pb-2">Participação na campanha</h2>
            <p className="text-sm text-muted-foreground">
              Essas informações ajudam a organização a chamar você para ações de acordo com sua disponibilidade e perfil.
            </p>
            <Field label="Como conheceu a campanha?" name="como_conheceu" maxLength={240} />

            <div>
              <label className="text-sm font-medium">Faz parte do Coletivo Alicerce?</label>
              <div className="mt-2 flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="coletivo_alicerce" checked={coletivoAlicerce === "sim"} onChange={() => setColetivoAlicerce("sim")} />
                  Sim
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="coletivo_alicerce" checked={coletivoAlicerce === "nao"} onChange={() => setColetivoAlicerce("nao")} />
                  Não
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Participa de algum movimento social?</label>
              <div className="mt-2 flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="mov_social" checked={movSocial === "sim"} onChange={() => setMovSocial("sim")} />
                  Sim
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="mov_social" checked={movSocial === "nao"} onChange={() => setMovSocial("nao")} />
                  Não
                </label>
              </div>
              {movSocial === "sim" && (
                <div className="mt-3">
                  <Field label="Qual movimento social?" name="movimento_social_nome" maxLength={160} />
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Como você pode ajudar?</label>
              <p className="text-xs text-muted-foreground mt-1">Selecione todas as opções que quiser.</p>
              <div className="mt-2 grid sm:grid-cols-2 gap-2">
                {FORMAS_AJUDA_OPTS.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={formasAjuda.includes(o.value)}
                      onChange={() => toggleForma(o.value)}
                      className="h-4 w-4"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              {formasAjuda.includes("outro") && (
                <div className="mt-3">
                  <Field label="Descreva como pode ajudar" name="formas_ajuda_outro" maxLength={240} />
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold border-b pb-2">Consentimento</h2>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="consentimento_whatsapp" required className="mt-1 h-4 w-4" />
              <span>Autorizo receber comunicações da campanha por WhatsApp e demais canais. Posso cancelar a qualquer momento respondendo "SAIR".</span>
            </label>
          </section>

          {error && <p className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-2">{error}</p>}

          <button type="submit" disabled={submitting} className="w-full rounded-md bg-primary text-primary-foreground py-2.5 font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {submitting ? "Enviando…" : "Confirmar atualização"}
          </button>
        </form>
      </main>
    </div>
  );
}

const Field = function Field({
  label, className, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; className?: string }) {
  return (
    <div className={className}>
      <label className="text-sm font-medium">{label}</label>
      <input {...props} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
    </div>
  );
};
