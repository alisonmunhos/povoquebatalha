import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PublicPageLayout } from "@/components/PublicPageLayout";

export const Route = createFileRoute("/termos/$slug")({
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} — Campanha do Povo que Batalha` }],
  }),
  ssr: false,
  component: TermosPage,
});

type LegalPage = {
  slug: string;
  title: string;
  content: string;
  updated_at: string;
};

function TermosPage() {
  const { slug } = Route.useParams();
  const [page, setPage] = useState<LegalPage | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/public/legal-pages/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) {
          setPage(null);
          return;
        }
        setPage(json.page as LegalPage);
      })
      .catch(() => setPage(null));
  }, [slug]);

  return (
    <PublicPageLayout>
      {page === undefined ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : page === null ? (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">Página não encontrada</h1>
          <p className="text-sm text-muted-foreground">Este conteúdo não existe ou foi removido.</p>
          <Link to="/" className="text-sm text-primary hover:underline">
            Voltar ao início
          </Link>
        </div>
      ) : (
        <article className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
          <div className="bg-card border rounded-xl p-6 text-sm leading-relaxed whitespace-pre-wrap">
            {page.content}
          </div>
        </article>
      )}
    </PublicPageLayout>
  );
}
