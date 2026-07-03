import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createQuickContactFromConversation } from "@/lib/communication.functions";
import { useCepLookup, formatCep } from "@/hooks/use-cep";

type Props = {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  suggestedNome?: string | null;
  originPhone?: string | null;
  onCreated: (contactId: string) => void;
};

function isLid(v?: string | null): boolean {
  return Boolean(v && /@lid$/i.test(v));
}

export function QuickContactFromInboxDialog({
  open, onClose, conversationId, suggestedNome, originPhone, onCreated,
}: Props) {
  const originIsLid = isLid(originPhone);
  const suggestedPhone = originPhone && !originIsLid ? originPhone : "";

  const [nome, setNome] = useState("");
  const [nomeSocial, setNomeSocial] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [referencia, setReferencia] = useState("");
  const [profissao, setProfissao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [consentimento, setConsentimento] = useState(false);
  const cepHook = useCepLookup();

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setNome((suggestedNome ?? "").trim());
      setNomeSocial("");
      setPhone(suggestedPhone);
      setEmail("");
      setCep(""); setEndereco(""); setNumero(""); setComplemento("");
      setBairro(""); setCidade(""); setUf(""); setReferencia("");
      setProfissao(""); setObservacoes(""); setConsentimento(false);
    }
  }, [open, suggestedNome, suggestedPhone]);

  const createFn = useServerFn(createQuickContactFromConversation);
  const createMut = useMutation({
    mutationFn: () => createFn({
      data: {
        conversation_id: conversationId,
        nome: nome.trim(),
        nome_social: nomeSocial.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        cep: cep.replace(/\D/g, "") || undefined,
        endereco: endereco.trim() || undefined,
        numero: numero.trim() || undefined,
        complemento: complemento.trim() || undefined,
        referencia: referencia.trim() || undefined,
        bairro: bairro.trim() || undefined,
        cidade: cidade.trim() || undefined,
        uf: uf.trim() || undefined,
        profissao: profissao.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
        consentimento_whatsapp: consentimento,
      },
    }),
    onSuccess: (res) => {
      toast.success("Contato salvo");
      onCreated(res.contact_id);
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  async function onCepChange(v: string) {
    const formatted = formatCep(v);
    setCep(formatted);
    const digits = formatted.replace(/\D/g, "");
    if (digits.length !== 8) return;
    const res = await cepHook.lookup(digits);
    if (res) {
      if (res.endereco) setEndereco(res.endereco);
      if (res.bairro) setBairro(res.bairro);
      if (res.cidade) setCidade(res.cidade);
      if (res.uf) setUf(res.uf);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-background rounded-lg shadow-lg"
      >
        <div className="sticky top-0 bg-background border-b px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <div>
              <div className="font-semibold text-sm">Salvar como contato</div>
              <div className="text-xs text-muted-foreground">
                Preencha o que souber agora. Só o nome é obrigatório — o resto pode ser completado depois.
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {originIsLid && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Esta conversa chegou como <span className="font-mono">{originPhone}</span> (identificador anônimo do WhatsApp).
              O telefone real não veio no evento — se você souber, digite abaixo. Sem telefone válido,
              não será possível responder até que o contato mande mensagem de um número real ou você edite a ficha depois.
            </div>
          )}
          {!originIsLid && originPhone && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
              Telefone identificado na conversa: <span className="font-mono">{originPhone}</span>
            </div>
          )}

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados pessoais</h3>
            <Field label="Nome completo *" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required />
            <Field label="Nome social / apelido" value={nomeSocial} onChange={(e) => setNomeSocial(e.target.value)} maxLength={120} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="WhatsApp (com DDD)" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 91234-5678" inputMode="tel" maxLength={20} />
              <Field label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} type="email" maxLength={255} />
            </div>
            <Field label="Profissão / ocupação" value={profissao} onChange={(e) => setProfissao(e.target.value)} maxLength={120} />
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Endereço</h3>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="text-xs font-medium flex items-center gap-2">
                  CEP {cepHook.loading && <Loader2 className="h-3 w-3 animate-spin" />}
                </label>
                <input
                  value={cep}
                  onChange={(e) => onCepChange(e.target.value)}
                  placeholder="00000-000"
                  inputMode="numeric"
                  maxLength={9}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
              <Field label="UF" value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2} placeholder="SP" />
            </div>
            <Field label="Endereço (rua/avenida)" value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={240} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Número" value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={20} inputMode="numeric" />
              <div className="col-span-2">
                <Field label="Complemento" value={complemento} onChange={(e) => setComplemento(e.target.value)} maxLength={120} placeholder="Apto, casa, bloco…" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={120} />
              <Field label="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={120} />
            </div>
            <Field label="Ponto de referência" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={240} placeholder="Próximo a…" />
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observações do atendimento</h3>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Anote qualquer informação relevante coletada nesta conversa."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
            />
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>O contato autorizou receber comunicações da campanha por WhatsApp.</span>
            </label>
          </section>
        </div>

        <div className="sticky bottom-0 bg-background border-t px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md border hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={() => createMut.mutate()}
            disabled={!nome.trim() || createMut.isPending}
            className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-40 inline-flex items-center gap-2"
          >
            {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar contato e vincular
          </button>
        </div>
      </div>
    </div>
  );
}

const Field = function Field({
  label, className, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium">{label}</label>
      <input {...props} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
    </div>
  );
};
