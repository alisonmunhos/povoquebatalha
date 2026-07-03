import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/usuarios/papeis")({
  head: () => ({ meta: [{ title: "Papéis e permissões" }] }),
  component: PapeisPage,
});

type Row = {
  papel: string;
  cor: string;
  descricao: string;
  base: string;
  comunicacao: string;
  territorio: string;
  config: string;
};

const ROWS: Row[] = [
  {
    papel: "Admin",
    cor: "bg-rose-100 text-rose-800",
    descricao: "Controle total do sistema. Deve ser dado com moderação.",
    base: "Ler, editar, importar, exportar, mesclar e excluir definitivamente contatos.",
    comunicacao: "Todas as ações: inbox, envios individuais, campanhas em massa, automações, templates.",
    territorio: "Vê todo o mapa e todos os contatos, sem restrição geográfica.",
    config: "Gerencia usuários, papéis, escopos territoriais, integrações (Z-API), secrets e domínio.",
  },
  {
    papel: "Operador",
    cor: "bg-blue-100 text-blue-800",
    descricao: "Braço direito operacional. Executa quase tudo, menos administrar contas ou apagar dados.",
    base: "Ler, editar, importar, arquivar, mesclar e exportar. Não exclui definitivamente.",
    comunicacao: "Envia campanhas, cria/edita templates e automações, opera o inbox.",
    territorio: "Vê todo o mapa.",
    config: "—",
  },
  {
    papel: "VRM (Relacionamento)",
    cor: "bg-emerald-100 text-emerald-800",
    descricao: "Foco em construir relacionamento 1:1 com apoiadores. Cuida do inbox e da ficha.",
    base: "Lê tudo, edita ficha (tags, notas, status de relacionamento). Não importa, não exporta, não exclui.",
    comunicacao: "Inbox completo, envios individuais e uso de templates existentes. Não dispara campanhas em massa nem edita templates.",
    territorio: "Consulta o mapa; sem ações de campo em lote.",
    config: "—",
  },
  {
    papel: "Comunicação",
    cor: "bg-violet-100 text-violet-800",
    descricao: "Time de mensageria e conteúdo. Cria e envia campanhas, sem mexer na base.",
    base: "Só leitura (para segmentar e prever alcance).",
    comunicacao: "Cria/edita campanhas, templates e automações. Usa inbox.",
    territorio: "—",
    config: "—",
  },
  {
    papel: "Território",
    cor: "bg-amber-100 text-amber-800",
    descricao: "Militante de campo, atua em uma região específica. Otimizado para celular.",
    base: "Só vê contatos dentro do seu escopo (bairro/UF configurado). Edita notas e status básicos.",
    comunicacao: "Abre WhatsApp e registra ações de campo (contato feito, não encontrado, observação). Sem inbox global nem campanhas.",
    territorio: "Home do usuário. Vê o mapa e a lista da sua região.",
    config: "—",
  },
  {
    papel: "Leitor",
    cor: "bg-slate-100 text-slate-800",
    descricao: "Acesso apenas para acompanhar sem interferir. Bom para observadores, apoiadores institucionais.",
    base: "Só leitura.",
    comunicacao: "Só leitura do inbox e do histórico de campanhas.",
    territorio: "Só leitura do mapa.",
    config: "—",
  },
];

function PapeisPage() {
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Papéis e permissões
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          O que cada papel pode fazer no sistema. Ao convidar alguém em{" "}
          <Link to="/usuarios" className="underline">Central de acesso</Link>, escolha o papel usando esta referência.
        </p>
      </header>

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex items-start gap-2 text-sm">
        <Info className="h-4 w-4 text-blue-600 mt-0.5" />
        <div>
          <p className="text-blue-900">
            Os papéis são cumulativos por prioridade: se alguém tiver mais de um papel, o de maior privilégio prevalece
            (Admin &gt; Operador &gt; Comunicação &gt; VRM &gt; Território &gt; Leitor).
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {ROWS.map((r) => (
          <section key={r.papel} className="border rounded-xl bg-card overflow-hidden">
            <header className="px-5 py-3 border-b flex items-center gap-3 bg-muted/30">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${r.cor}`}>{r.papel}</span>
              <span className="text-sm text-muted-foreground">{r.descricao}</span>
            </header>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x">
              <Cell title="Base de contatos" body={r.base} />
              <Cell title="Comunicação" body={r.comunicacao} />
              <Cell title="Território" body={r.territorio} />
              <Cell title="Configuração" body={r.config} />
            </div>
          </section>
        ))}
      </div>

      <footer className="text-xs text-muted-foreground border-t pt-4">
        <p>
          <strong>Regra de segurança:</strong> a interface esconde botões que o papel não pode usar,
          mas todas as ações sensíveis também são validadas no servidor. Excluir contatos, gerir usuários e
          alterar integrações exigem papel de <strong>Admin</strong>, mesmo se alguém tentar contornar a interface.
        </p>
      </footer>
    </div>
  );
}

function Cell({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <p className="text-sm mt-1 leading-relaxed">{body}</p>
    </div>
  );
}
