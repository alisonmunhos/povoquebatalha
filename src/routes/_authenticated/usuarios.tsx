import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import {
  listUsers,
  inviteUser,
  deleteUser,
  setUserRole,
  setUserStatus,
  resendInvite,
  generateInviteLink,
  generatePasswordResetLink,
  sendPasswordResetEmail,
  listAccessAudit,
  listPendingApprovals,
  approvePendingAgitador,
  rejectPendingAgitador,
} from "@/lib/users.functions";
import {
  UserPlus,
  Trash2,
  ShieldCheck,
  RefreshCw,
  Ban,
  Play,
  KeyRound,
  Copy,
  X,
  Link as LinkIcon,
  Info,
  CheckCircle2,
  UserMinus,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Campanha do Povo que Batalha" }] }),
  component: UsuariosPage,
});

type Row = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed_at: string | null;
  invited_at: string | null;
  roles: string[];
  status: "ativo" | "suspenso" | "revogado" | "pendente_aprovacao";
  derived_status:
    | "ativo"
    | "convite_pendente"
    | "convite_expirado"
    | "suspenso"
    | "revogado"
    | "pendente_aprovacao";
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  operador: "Operador",
  vrm: "VRM",
  comunicacao: "Comunicação",
  agitador: "Agitador",
  leitor: "Leitor",
};

type InviteRole = "admin" | "operador" | "leitor" | "vrm" | "agitador" | "comunicacao";

type PendingRow = { id: string; email: string; full_name: string | null; created_at: string; phone: string | null };

type InviteModal = { email: string; role: string; link: string | null };
type ResetModal = { email: string; userId: string };

function UsuariosPage() {
  const fetchList = useServerFn(listUsers);
  const invite = useServerFn(inviteUser);
  const remove = useServerFn(deleteUser);
  const updateRole = useServerFn(setUserRole);
  const setStatus = useServerFn(setUserStatus);
  const resend = useServerFn(resendInvite);
  const genLink = useServerFn(generateInviteLink);
  const genResetLink = useServerFn(generatePasswordResetLink);
  const emailReset = useServerFn(sendPasswordResetEmail);
  const audit = useServerFn(listAccessAudit);
  const fetchPending = useServerFn(listPendingApprovals);
  const approve = useServerFn(approvePendingAgitador);
  const reject = useServerFn(rejectPendingAgitador);

  const [rows, setRows] = useState<Row[]>([]);
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<InviteRole>("operador");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteModal, setInviteModal] = useState<InviteModal | null>(null);
  const [resetModal, setResetModal] = useState<ResetModal | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [auditRows, setAuditRows] = useState<{ id: string; event: string; created_at: string; meta: Record<string, unknown>; target_user_id: string | null; actor_id: string | null }[]>([]);
  const [origin, setOrigin] = useState<string>("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const agitadorSignupUrl = origin ? `${origin}/cadastro-agitador` : "";
  const agitadorSignupMessage = `Olá! Quero te convidar para ser agitador(a) voluntário(a) da Campanha do Povo que Batalha. É rápido: preencha seus dados no link abaixo e um administrador libera seu acesso.\n\n${agitadorSignupUrl}`;

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchList();
      setRows(r.users as Row[]);
      const a = await audit();
      setAuditRows(a.rows as typeof auditRows);
      const p = await fetchPending();
      setPendingRows(p.rows as PendingRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true); setMsg(null); setErr(null);
    try {
      const trimmedName = fullName.trim();
      const r = await invite({ data: { email, role, redirectOrigin: window.location.origin, full_name: trimmedName || null } });
      setInviteModal({ email: r.email ?? email, role: r.role ?? role, link: r.actionLink ?? null });
      setEmail("");
      setFullName("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao enviar convite.");
    } finally { setSubmitting(false); }
  }

  async function act(fn: () => Promise<unknown>, msg?: string) {
    try {
      await fn();
      if (msg) setMsg(msg);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro.");
    }
  }

  async function openReset(u: Row) {
    setResetModal({ email: u.email, userId: u.id });
    setResetLink(null);
  }

  async function doGenerateResetLink() {
    if (!resetModal) return;
    setResetBusy(true);
    try {
      const r = await genResetLink({ data: { userId: resetModal.userId, redirectOrigin: window.location.origin } });
      setResetLink(r.url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao gerar link.");
    } finally { setResetBusy(false); }
  }

  async function doSendResetEmail() {
    if (!resetModal) return;
    setResetBusy(true);
    try {
      await emailReset({ data: { userId: resetModal.userId, redirectOrigin: window.location.origin } });
      setMsg(`E-mail de redefinição enviado para ${resetModal.email}.`);
      setResetModal(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao enviar e-mail.");
    } finally { setResetBusy(false); }
  }

  const ativos = rows.filter((r) => r.derived_status === "ativo" || r.derived_status === "suspenso" || r.derived_status === "revogado");
  const pendentes = rows.filter((r) => r.derived_status === "convite_pendente" || r.derived_status === "convite_expirado");
  const aprovacaoPendente = pendingRows.length;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Central de acesso
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastro público desabilitado. Novos acessos apenas por convite.
          </p>
        </div>
        <Link
          to="/usuarios/papeis"
          className="text-sm inline-flex items-center gap-1 px-3 py-2 rounded-md border hover:bg-muted"
        >
          Ver papéis e permissões →
        </Link>
      </header>

      <section className="border rounded-xl p-5 bg-card">
        <h2 className="font-semibold flex items-center gap-2 mb-3">
          <UserPlus className="h-4 w-4" /> Convidar novo usuário
        </h2>
        <form onSubmit={onInvite} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome completo (recomendado)</label>
              <input
                type="text" placeholder="Ex: Maria da Silva"
                value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-10"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">E-mail *</label>
              <input
                type="email" required placeholder="email@exemplo.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-10"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <select
              value={role} onChange={(e) => setRole(e.target.value as InviteRole)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm h-10"
            >
              <option value="admin">Admin</option>
              <option value="operador">Operador</option>
              <option value="vrm">VRM (Relacionamento)</option>
              <option value="comunicacao">Comunicação</option>
              <option value="agitador">Agitador</option>
              <option value="leitor">Leitor</option>
            </select>
            <button type="submit" disabled={submitting}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 h-10">
              {submitting ? "Enviando…" : "Enviar convite"}
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted-foreground flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Preencher o nome ajuda a manter a ficha do contato correta. Sem nome, usamos o e-mail como identificação inicial. Um link direto também é gerado caso o e-mail não chegue.
        </p>
        {msg && <p className="mt-3 text-sm text-emerald-600">{msg}</p>}
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </section>

      {/* Link fixo de auto-cadastro de agitador */}
      <section className="border rounded-xl p-5 bg-card">
        <h2 className="font-semibold flex items-center gap-2 mb-1">
          <LinkIcon className="h-4 w-4" /> Link de auto-cadastro de agitador
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Link <b>fixo e reutilizável</b> — pode compartilhar com quantas pessoas quiser. Todo cadastro feito por aqui cai na aba <b>Aguardando aprovação</b> acima, para você liberar o acesso manualmente.
        </p>
        {agitadorSignupUrl ? (
          <>
            <LinkBox url={agitadorSignupUrl} />
            <div className="flex gap-2 flex-wrap mt-2">
              <CopyButton
                text={agitadorSignupUrl}
                label="Copiar link"
                onDone={() => setMsg("Link copiado.")}
              />
              <CopyButton
                text={agitadorSignupMessage}
                label="Copiar mensagem pronta"
                onDone={() => setMsg("Mensagem copiada.")}
              />
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        )}
      </section>



      {/* Guia rápido de ações */}
      <section className="border rounded-xl p-4 bg-muted/30 text-xs text-muted-foreground">
        <div className="font-medium text-foreground mb-2 flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Diferença entre as ações</div>
        <ul className="space-y-1.5">
          <li><b className="text-amber-700">Suspender</b> — bloqueia login temporariamente. Papel e histórico preservados. Reversível a qualquer momento.</li>
          <li><b className="text-rose-700">Revogar acesso</b> — remove todos os papéis. Conta e histórico ficam preservados, mas a pessoa perde acesso ao painel. Reversível dando novo papel.</li>
          <li><b className="text-destructive">Excluir conta</b> — remove permanentemente o usuário, seus papéis e o histórico de acesso. A ação não pode ser desfeita: você pode convidar o mesmo e-mail novamente, mas será uma conta nova, sem o histórico anterior.</li>
        </ul>
      </section>

      <Tabs defaultValue="ativos" className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="ativos">Ativos ({ativos.length})</TabsTrigger>
          <TabsTrigger value="aprovacao">
            Aguardando aprovação
            {aprovacaoPendente > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-1.5">
                {aprovacaoPendente}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pendentes">Convites pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="aprovacao">
          <section className="border rounded-xl bg-card overflow-hidden">
            {pendingRows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Nenhum cadastro aguardando aprovação.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-4 py-2">Nome</th>
                      <th className="px-4 py-2">E-mail</th>
                      <th className="px-4 py-2">WhatsApp</th>
                      <th className="px-4 py-2">Cadastrado em</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRows.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="px-4 py-2">{p.full_name ?? "—"}</td>
                        <td className="px-4 py-2 max-w-[220px] truncate" title={p.email}>{p.email}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{p.phone ?? "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(p.created_at).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                          <button
                            onClick={() => act(() => approve({ data: { userId: p.id } }), `${p.full_name ?? p.email} aprovado(a) como agitador.`)}
                            className="text-emerald-700 hover:underline inline-flex items-center gap-1 text-xs"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
                          </button>
                          <button
                            onClick={() => {
                              const first = prompt(`REJEITAR o cadastro de ${p.full_name ?? p.email}?\n\nA conta será apagada permanentemente. Esta ação não pode ser desfeita.\n\nDigite REJEITAR para confirmar.`);
                              if (first !== "REJEITAR") return;
                              act(() => reject({ data: { userId: p.id } }), "Cadastro rejeitado.");
                            }}
                            className="text-destructive hover:underline inline-flex items-center gap-1 text-xs"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Rejeitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="ativos">
          <section className="border rounded-xl bg-card overflow-hidden">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
            ) : ativos.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Nenhum usuário.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-4 py-2">E-mail</th>
                      <th className="px-4 py-2">Papel</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Último acesso</th>
                      <th className="px-4 py-2">Criado</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ativos.map((u) => {
                      const currentRole = (u.roles[0] ?? "leitor") as InviteRole;
                      return (
                        <tr key={u.id} className="border-t">
                          <td className="px-4 py-2 max-w-[220px] truncate" title={u.email}>{u.email}</td>
                          <td className="px-4 py-2">
                            <select
                              value={currentRole}
                              onChange={(e) => act(() => updateRole({ data: { userId: u.id, role: e.target.value as typeof currentRole } }))}
                              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                            >
                              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2"><StatusPill status={u.derived_status} /></td>
                          <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : "—"}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(u.created_at).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                            <button
                              onClick={() => openReset(u)}
                              title="Gerar link ou enviar e-mail para o usuário redefinir a senha"
                              className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                            >
                              <KeyRound className="h-3.5 w-3.5" /> Redefinir senha
                            </button>
                            {u.status === "ativo" ? (
                              <button
                                onClick={() => act(() => setStatus({ data: { userId: u.id, status: "suspenso" } }), "Acesso suspenso.")}
                                title="Bloqueia login temporariamente. Reversível."
                                className="text-amber-700 hover:underline inline-flex items-center gap-1 text-xs"
                              >
                                <Ban className="h-3.5 w-3.5" /> Suspender
                              </button>
                            ) : (
                              <button
                                onClick={() => act(() => setStatus({ data: { userId: u.id, status: "ativo" } }), "Acesso reativado.")}
                                className="text-emerald-700 hover:underline inline-flex items-center gap-1 text-xs"
                              >
                                <Play className="h-3.5 w-3.5" /> Reativar
                              </button>
                            )}
                            {u.status !== "revogado" && (
                              <button
                                onClick={() => {
                                  if (!confirm(`Revogar acesso de ${u.email}?\n\nTodos os papéis serão removidos. A conta e o histórico ficam preservados. Você pode reativar depois dando um novo papel.`)) return;
                                  act(() => setStatus({ data: { userId: u.id, status: "revogado" } }), "Acesso revogado.");
                                }}
                                title="Remove todos os papéis. Conta preservada. Reversível dando novo papel."
                                className="text-rose-700 hover:underline inline-flex items-center gap-1 text-xs"
                              >
                                <UserMinus className="h-3.5 w-3.5" /> Revogar acesso
                              </button>
                            )}
                            <button
                              onClick={() => {
                                const first = prompt(`EXCLUIR permanentemente a conta ${u.email}?\n\nEsta ação NÃO é reversível.\n\nDigite EXCLUIR para confirmar.`);
                                if (first !== "EXCLUIR") return;
                                act(() => remove({ data: { userId: u.id } }), "Conta excluída.");
                              }}
                              title="Apaga o usuário definitivamente. Permite reconvidar o mesmo e-mail."
                              className="text-destructive hover:underline inline-flex items-center gap-1 text-xs"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Excluir
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="pendentes">
          <section className="border rounded-xl bg-card overflow-hidden">
            {pendentes.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Nenhum convite pendente.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-4 py-2">E-mail</th>
                      <th className="px-4 py-2">Papel</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Convidado em</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendentes.map((u) => (
                      <tr key={u.id} className="border-t">
                        <td className="px-4 py-2 max-w-[220px] truncate">{u.email}</td>
                        <td className="px-4 py-2 text-xs">{ROLE_LABEL[u.roles[0] ?? "leitor"] ?? "—"}</td>
                        <td className="px-4 py-2"><StatusPill status={u.derived_status} /></td>
                        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {u.invited_at ? new Date(u.invited_at).toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                          <button
                            onClick={async () => {
                              try {
                                const r = await genLink({ data: { userId: u.id, redirectOrigin: window.location.origin } });
                                if (r.url) setInviteModal({ email: u.email, role: u.roles[0] ?? "leitor", link: r.url });
                              } catch (e) { alert(e instanceof Error ? e.message : "Erro."); }
                            }}
                            className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                            title="Gera um novo link direto para copiar/enviar"
                          >
                            <LinkIcon className="h-3.5 w-3.5" /> Gerar novo link
                          </button>
                          <button
                            onClick={() => act(() => resend({ data: { userId: u.id, redirectOrigin: window.location.origin } }), "Convite reenviado por e-mail.")}
                            className="text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1 text-xs"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Reenviar por e-mail
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm(`Cancelar o convite de ${u.email}? A conta será apagada.`)) return;
                              act(() => remove({ data: { userId: u.id } }), "Convite cancelado.");
                            }}
                            className="text-destructive hover:underline inline-flex items-center gap-1 text-xs"
                          >
                            <X className="h-3.5 w-3.5" /> Cancelar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="auditoria">
          <section className="border rounded-xl bg-card overflow-hidden">
            {auditRows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Sem eventos registrados.</div>
            ) : (
              <ul className="divide-y">
                {auditRows.map((a) => (
                  <li key={a.id} className="p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{a.event}</span>
                      <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                    {Object.keys(a.meta ?? {}).length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground truncate">{JSON.stringify(a.meta)}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
      </Tabs>

      {/* Modal de convite / link gerado */}
      {inviteModal && (
        <Modal onClose={() => setInviteModal(null)} title="Convite pronto">
          <p className="text-sm">
            Convite gerado para <b>{inviteModal.email}</b> como <b>{ROLE_LABEL[inviteModal.role] ?? inviteModal.role}</b>.
          </p>
          <p className="text-xs text-muted-foreground">
            Tentamos enviar por e-mail, mas caso não chegue, copie o link abaixo e envie manualmente por WhatsApp. O link expira em 7 dias.
          </p>
          {inviteModal.link ? (
            <>
              <LinkBox url={inviteModal.link} />
              <div className="flex gap-2 flex-wrap">
                <CopyButton
                  text={inviteModal.link}
                  label="Copiar link"
                  onDone={() => setMsg("Link copiado.")}
                />
                <CopyButton
                  text={`Olá! Você foi convidado para a Central da Campanha do Povo que Batalha. Clique no link abaixo para criar sua senha e acessar:\n\n${inviteModal.link}\n\nO link expira em 7 dias.`}
                  label="Copiar mensagem pronta"
                  onDone={() => setMsg("Mensagem copiada.")}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-amber-700">Não foi possível gerar o link automaticamente. Use "Gerar novo link" na lista de pendentes.</p>
          )}
        </Modal>
      )}

      {/* Modal de reset de senha */}
      {resetModal && (
        <Modal onClose={() => { setResetModal(null); setResetLink(null); }} title="Redefinir senha">
          <p className="text-sm">
            Para <b>{resetModal.email}</b>. Escolha como enviar:
          </p>
          {!resetLink ? (
            <div className="grid sm:grid-cols-2 gap-2">
              <button
                disabled={resetBusy}
                onClick={doGenerateResetLink}
                className="rounded-md border p-3 text-left hover:bg-muted disabled:opacity-50"
              >
                <div className="font-medium text-sm flex items-center gap-1.5"><LinkIcon className="h-4 w-4" /> Gerar link (recomendado)</div>
                <div className="text-xs text-muted-foreground mt-1">Cria uma URL única para você copiar e enviar por WhatsApp. Não depende do e-mail chegar.</div>
              </button>
              <button
                disabled={resetBusy}
                onClick={doSendResetEmail}
                className="rounded-md border p-3 text-left hover:bg-muted disabled:opacity-50"
              >
                <div className="font-medium text-sm flex items-center gap-1.5"><RefreshCw className="h-4 w-4" /> Enviar por e-mail</div>
                <div className="text-xs text-muted-foreground mt-1">Envia o link automaticamente para o e-mail do usuário. Pode não chegar em alguns provedores.</div>
              </button>
            </div>
          ) : (
            <>
              <LinkBox url={resetLink} />
              <div className="flex gap-2 flex-wrap">
                <CopyButton text={resetLink} label="Copiar link" onDone={() => setMsg("Link copiado.")} />
                <CopyButton
                  text={`Olá! Aqui está seu link para redefinir a senha na Central da Campanha:\n\n${resetLink}\n\nAbra o link, defina uma nova senha e você entrará automaticamente.`}
                  label="Copiar mensagem pronta"
                  onDone={() => setMsg("Mensagem copiada.")}
                />
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Row["derived_status"] }) {
  const map: Record<Row["derived_status"], { label: string; cls: string }> = {
    ativo: { label: "Ativo", cls: "bg-emerald-100 text-emerald-800" },
    convite_pendente: { label: "Convite pendente", cls: "bg-amber-100 text-amber-800" },
    convite_expirado: { label: "Convite expirado", cls: "bg-orange-100 text-orange-800" },
    suspenso: { label: "Suspenso", cls: "bg-yellow-100 text-yellow-800" },
    revogado: { label: "Revogado", cls: "bg-rose-100 text-rose-800" },
    pendente_aprovacao: { label: "Aguardando aprovação", cls: "bg-amber-100 text-amber-800" },
  };
  const s = map[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border rounded-xl shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LinkBox({ url }: { url: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2 text-xs font-mono break-all select-all">{url}</div>
  );
}

function CopyButton({ text, label, onDone }: { text: string; label: string; onDone?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          onDone?.();
          setTimeout(() => setCopied(false), 2000);
        } catch {
          alert("Não foi possível copiar. Selecione o texto manualmente.");
        }
      }}
      className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:bg-primary/90 inline-flex items-center gap-1.5"
    >
      {copied ? <><CheckCircle2 className="h-3.5 w-3.5" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> {label}</>}
    </button>
  );
}
