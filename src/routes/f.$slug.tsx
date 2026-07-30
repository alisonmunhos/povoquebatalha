import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PublicFormRenderer } from "@/components/PublicFormRenderer";
import { getFormMeta } from "@/lib/form-meta.functions";
import { shareMeta, canonical } from "@/lib/site-meta";

export const Route = createFileRoute("/f/$slug")({
  validateSearch: z.object({
    ref: z.string().min(8).max(48).optional(),
    t: z.string().uuid().optional(),
    s: z.string().uuid().optional(),
  }),
  // "data-only": o loader roda no servidor (garantindo as meta tags para a
  // prévia do link no WhatsApp), mas a página é renderizada no cliente.
  ssr: "data-only",
  loader: async ({ params }) => ({
    meta: await getFormMeta({ data: { slug: params.slug } }),
  }),
  head: ({ params, loaderData }) => {
    const title = loaderData?.meta?.title ?? "Campanha do Povo que Batalha";
    const description =
      loaderData?.meta?.description ??
      "Preencha o formulário e faça parte da Campanha do Povo que Batalha.";
    const path = `/f/${params.slug}`;
    return {
      meta: [
        ...shareMeta({ title, description, path }),
        { name: "google", content: "notranslate" },
      ],
      links: canonical(path),
    };
  },
  component: FSlugPage,
});

function FSlugPage() {
  const { slug } = Route.useParams();
  const { ref, t, s } = Route.useSearch();
  return <PublicFormRenderer slug={slug} refToken={ref} recadToken={t} startSectionId={s} />;
}
