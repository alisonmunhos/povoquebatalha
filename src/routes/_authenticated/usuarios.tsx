import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { listUsers, inviteUser, deleteUser, setUserRole } from "@/lib/users.functions";
import { listUserScopes, addScope, removeScope } from "@/lib/territory.functions";
import { UserPlus, Trash2, ShieldCheck, MapPin, Plus, X } from "lucide-react";

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
};

function UsuariosPage() {
  const fetchList = useServerFn(listUsers);
  const invite = useServerFn(inviteUser);
  const remove = useServerFn(deleteUser);
  const updateRole = useServerFn(setUserRole);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "operador" | "leitor" | "vrm" | "territorio">("operador");
  const [expandedScopes, setExpandedScopes] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchList();
      setRows(r.users as Row[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    setErr(null);
    try {
      await invite({
        data: { email, role, redirectOrigin: window.location.origin },
      });
      setMsg(`Convite enviado para ${email}.`);
      setEmail("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao enviar convite.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string, mail: string) {
    if (!confirm(`Remover acesso de ${mail}? Esta ação não pode ser desfeita.`)) return;
    try {
      await remove({ data: { userId: id } });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao remover.");
    }
  }

  async function onRoleChange(id: string, newRole: "admin" | "operador" | "leitor") {
    try {
      await updateRole({ data: { userId: id, role: newRole } });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao alterar papel.");
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Usuários do painel
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          O cadastro público está desabilitado. Novos acessos só por convite.
        </p>
      </header>

      <section className="border rounded-xl p-5 bg-card">
        <h2 className="font-semibold flex items-center gap-2 mb-3">
          <UserPlus className="h-4 w-4" /> Convidar novo usuário
        </h2>
        <form onSubmit={onInvite} className="grid sm:grid-cols-[1fr_180px_auto] gap-3">
          <input
            type="email"
            required
            placeholder="email@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="admin">Admin</option>
            <option value="operador">Operador</option>
            <option value="vrm">VRM (Relacionamento)</option>
            <option value="territorio">Território</option>
            <option value="leitor">Leitor</option>
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Enviar convite"}
          </button>
        </form>
        {msg && <p className="mt-3 text-sm text-emerald-600">{msg}</p>}
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </section>

      <section className="border rounded-xl bg-card overflow-hidden">
        <div className="px-5 py-3 border-b text-sm font-semibold">
          Usuários ({rows.length})
        </div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : rows.length === 0 ? (
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
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const currentRole = (u.roles[0] ?? "leitor") as
                    | "admin" | "operador" | "leitor" | "vrm" | "territorio";
                  const pending = !u.confirmed_at;
                  const showScopes = currentRole === "territorio" || currentRole === "leitor";
                  const expanded = expandedScopes === u.id;
                  return (
                    <>
                      <tr key={u.id} className="border-t">
                        <td className="px-4 py-2">{u.email}</td>
                        <td className="px-4 py-2">
                          <select
                            value={currentRole}
                            onChange={(e) =>
                              onRoleChange(u.id, e.target.value as typeof currentRole)
                            }
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                          >
                            <option value="admin">Admin</option>
                            <option value="operador">Operador</option>
                            <option value="vrm">VRM</option>
                            <option value="territorio">Território</option>
                            <option value="leitor">Leitor</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          {pending ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              Convite pendente
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              Ativo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {u.last_sign_in_at
                            ? new Date(u.last_sign_in_at).toLocaleString("pt-BR")
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                          {showScopes && (
                            <button
                              onClick={() => setExpandedScopes(expanded ? null : u.id)}
                              className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                            >
                              <MapPin className="h-3.5 w-3.5" /> {expanded ? "Fechar" : "Escopos"}
                            </button>
                          )}
                          <button
                            onClick={() => onDelete(u.id, u.email)}
                            className="text-destructive hover:underline inline-flex items-center gap-1 text-xs"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remover
                          </button>
                        </td>
                      </tr>
                      {expanded && showScopes && (
                        <tr>
                          <td colSpan={5} className="px-4 py-3 bg-muted/30">
                            <ScopesEditor userId={u.id} />
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
    </div>
  );
}
