import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { PublicPageLayout } from "@/components/PublicPageLayout";
import { PdfDocumentViewer } from "@/components/PdfDocumentViewer";
import { Button } from "@/components/ui/button";
import { shareMeta, canonical } from "@/lib/site-meta";

function formatSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const Route = createFileRoute("/termos/$slug")({
  head: ({ params }) => ({
    meta: shareMeta({
      title: `${formatSlug(params.slug)} — Campanha do Povo que Batalha`,
      description: "Termos e políticas da Campanha do Povo que Batalha.",
      path: `/termos/${params.slug}`,
    }),
    links: canonical(`/termos/${params.slug}`),
  }),
  ssr: false,
  component: TermosPage,
});

type LegalPage = {
  slug: string;
  title: string;
  content: string;
  pdf_url?: string | null;
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

  const hasPdf = Boolean(page?.pdf_url);

  return (
    <PublicPageLayout wide={hasPdf}>
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
      ) : page.pdf_url ? (
        <article className="space-y-5">
          <h1 className="px-2 text-3xl font-bold tracking-tight sm:px-0">{page.title}</h1>
          <PdfDocumentViewer url={page.pdf_url} title={page.title} />
          <div className="px-2 pb-[max(0px,env(safe-area-inset-bottom))] sm:px-0">
            <Button asChild size="lg" className="w-full">
              <a href={page.pdf_url} target="_blank" rel="noopener noreferrer">
                <Download /> Baixar PDF
              </a>
            </Button>
          </div>
        </article>
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
