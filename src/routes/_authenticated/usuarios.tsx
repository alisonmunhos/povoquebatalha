import { createFileRoute } from "@tanstack/react-router";
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
  listAccessAudit,
} from "@/lib/users.functions";
import { listUserScopes, addScope, removeScope } from "@/lib/territory.functions";
import { UserPlus, Trash2, ShieldCheck, MapPin, Plus, X, Link as LinkIcon, RefreshCw, Ban, Play } from "lucide-react";
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
  status: "ativo" | "suspenso" | "revogado";
  derived_status:
    | "ativo"
    | "convite_pendente"
    | "convite_expirado"
    | "suspenso"
    | "revogado";
  scope_count: number;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  operador: "Operador",
  vrm: "VRM",
  territorio: "Território",
  leitor: "Leitor",
};

function UsuariosPage() {
  const fetchList = useServerFn(listUsers);
  const invite = useServerFn(inviteUser);
  const remove = useServerFn(deleteUser);
  const updateRole = useServerFn(setUserRole);
  const setStatus = useServerFn(setUserStatus);
  const resend = useServerFn(resendInvite);
  const genLink = useServerFn(generateInviteLink);
  const audit = useServerFn(listAccessAudit);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "operador" | "leitor" | "vrm" | "territorio">("operador");
  const [expandedScopes, setExpandedScopes] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<{ id: string; event: string; created_at: string; meta: Record<string, unknown>; target_user_id: string | null; actor_id: string | null }[]>([]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchList();
      setRows(r.users as Row[]);
      const a = await audit();
      setAuditRows(a.rows as typeof auditRows);
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
      await invite({ data: { email, role, redirectOrigin: window.location.origin } });
      setMsg(`Convite enviado para ${email}.`);
      setEmail("");
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

  const ativos = rows.filter((r) => r.derived_status === "ativo" || r.derived_status === "suspenso" || r.derived_status === "revogado");
  const pendentes = rows.filter((r) => r.derived_status === "convite_pendente" || r.derived_status === "convite_expirado");

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Central de acesso
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cadastro público desabilitado. Novos acessos apenas por convite.
        </p>
      </header>

      <section className="border rounded-xl p-5 bg-card">
        <h2 className="font-semibold flex items-center gap-2 mb-3">
          <UserPlus className="h-4 w-4" /> Convidar novo usuário
        </h2>
        <form onSubmit={onInvite} className="grid sm:grid-cols-[1fr_180px_auto] gap-3">
          <input
            type="email" required placeholder="email@exemplo.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm h-10"
          />
          <select
            value={role} onChange={(e) => setRole(e.target.value as typeof role)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm h-10"
          >
            <option value="admin">Admin</option>
            <option value="operador">Operador</option>
            <option value="vrm">VRM (Relacionamento)</option>
            <option value="territorio">Território</option>
            <option value="leitor">Leitor</option>
          </select>
          <button type="submit" disabled={submitting}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 h-10">
            {submitting ? "Enviando…" : "Enviar convite"}
          </button>
        </form>
        {msg && <p className="mt-3 text-sm text-emerald-600">{msg}</p>}
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </section>

      <Tabs defaultValue="ativos" className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="ativos">Ativos ({ativos.length})</TabsTrigger>
          <TabsTrigger value="pendentes">Convites pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

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
                      <th className="px-4 py-2">Escopo</th>
                      <th className="px-4 py-2">Último acesso</th>
                      <th className="px-4 py-2">Criado</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ativos.map((u) => {
                      const currentRole = (u.roles[0] ?? "leitor") as
                        | "admin" | "operador" | "leitor" | "vrm" | "territorio";
                      const showScopes = currentRole === "territorio" || currentRole === "leitor";
                      const expanded = expandedScopes === u.id;
                      return (
                        <>
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
                            <td className="px-4 py-2 text-xs">{showScopes ? (u.scope_count > 0 ? `${u.scope_count} regra(s)` : "sem escopo") : "—"}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                              {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : "—"}
                            </td>
                            <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(u.created_at).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-4 py-2 text-right whitespace-nowrap space-x-2">
                              {showScopes && (
                                <button onClick={() => setExpandedScopes(expanded ? null : u.id)}
                                  className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                                  <MapPin className="h-3.5 w-3.5" /> {expanded ? "Fechar" : "Escopos"}
                                </button>
                              )}
                              {u.status === "ativo" ? (
                                <button onClick={() => act(() => setStatus({ data: { userId: u.id, status: "suspenso" } }), "Acesso suspenso.")}
                                  className="text-amber-700 hover:underline inline-flex items-center gap-1 text-xs">
                                  <Ban className="h-3.5 w-3.5" /> Suspender
                                </button>
                              ) : (
                                <button onClick={() => act(() => setStatus({ data: { userId: u.id, status: "ativo" } }), "Acesso reativado.")}
                                  className="text-emerald-700 hover:underline inline-flex items-center gap-1 text-xs">
                                  <Play className="h-3.5 w-3.5" /> Reativar
                                </button>
                              )}
                              {u.status !== "revogado" && (
                                <button onClick={() => {
                                  if (!confirm(`Revogar acesso de ${u.email}? Todas as permissões serão removidas.`)) return;
                                  act(() => setStatus({ data: { userId: u.id, status: "revogado" } }), "Acesso revogado.");
                                }}
                                  className="text-destructive hover:underline inline-flex items-center gap-1 text-xs">
                                  <Trash2 className="h-3.5 w-3.5" /> Revogar
                                </button>
                              )}
                            </td>
                          </tr>
                          {expanded && showScopes && (
                            <tr>
                              <td colSpan={7} className="px-4 py-3 bg-muted/30">
                                <ScopesEditor userId={u.id} onChange={load} />
                              </td>
                            </tr>
                          )}
                        </>
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
                        <td className="px-4 py-2 text-right whitespace-nowrap space-x-2">
                          <button onClick={() => act(() => resend({ data: { userId: u.id, redirectOrigin: window.location.origin } }), "Convite reenviado.")}
                            className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                            <RefreshCw className="h-3.5 w-3.5" /> Reenviar
                          </button>
                          <button onClick={async () => {
                            try {
                              const r = await genLink({ data: { userId: u.id, redirectOrigin: window.location.origin } });
                              if (r.url) {
                                await navigator.clipboard.writeText(r.url);
                                setMsg("Link copiado.");
                              }
                            } catch (e) { alert(e instanceof Error ? e.message : "Erro."); }
                          }}
                            className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                            <LinkIcon className="h-3.5 w-3.5" /> Copiar link
                          </button>
                          <button onClick={() => {
                            if (!confirm(`Cancelar o convite de ${u.email}? A conta será apagada.`)) return;
                            act(() => remove({ data: { userId: u.id } }), "Convite cancelado.");
                          }}
                            className="text-destructive hover:underline inline-flex items-center gap-1 text-xs">
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
  };
  const s = map[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

type Scope = { id: string; uf: string | null; cidade: string | null; bairro: string | null };
function ScopesEditor({ userId, onChange }: { userId: string; onChange?: () => void }) {
  const listFn = useServerFn(listUserScopes);
  const addFn = useServerFn(addScope);
  const removeFn = useServerFn(removeScope);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [uf, setUf] = useState(""); const [cidade, setCidade] = useState(""); const [bairro, setBairro] = useState("");
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { const r = await listFn({ data: { userId } }); setScopes(r as Scope[]); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  async function add() {
    if (!uf && !cidade && !bairro) return alert("Informe ao menos UF, cidade ou bairro.");
    setSaving(true);
    try {
      await addFn({ data: { userId, uf: uf.trim().toUpperCase() || null, cidade: cidade.trim() || null, bairro: bairro.trim() || null } });
      setUf(""); setCidade(""); setBairro("");
      await load(); onChange?.();
    } catch (e) { alert(e instanceof Error ? e.message : "Erro."); }
    finally { setSaving(false); }
  }
  async function del(id: string) {
    try { await removeFn({ data: { id } }); await load(); onChange?.(); }
    catch (e) { alert(e instanceof Error ? e.message : "Erro."); }
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Escopos territoriais deste usuário
      </div>
      {loading ? (<div className="text-xs text-muted-foreground">Carregando…</div>)
      : scopes.length === 0 ? (<div className="text-xs text-muted-foreground">Sem escopos — o usuário não verá nenhum contato.</div>)
      : (
        <div className="flex flex-wrap gap-2">
          {scopes.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-2 rounded-full bg-background border px-2 py-1 text-xs">
              {[s.bairro, s.cidade, s.uf].filter(Boolean).join(" / ") || "(vazio)"}
              <button onClick={() => del(s.id)} className="text-destructive hover:opacity-70" title="Remover">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[70px_1fr_1fr_auto] gap-2 items-center">
        <input value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} placeholder="UF"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs uppercase" />
        <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
        <input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Bairro"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
        <button onClick={add} disabled={saving}
          className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1">
          <Plus className="h-3 w-3" /> Adicionar
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Deixe campos em branco para "todos". Ex.: só UF = todo o estado.
      </p>
    </div>
  );
}
