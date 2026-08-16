import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PublicFormRenderer } from "@/components/PublicFormRenderer";
import { getFormMeta } from "@/lib/form-meta.functions";
import { getRequestOrigin } from "@/lib/site-origin.functions";
import { shareMeta, canonical, SITE_URL } from "@/lib/site-meta";

export const Route = createFileRoute("/f/$slug")({
  validateSearch: z.object({
    ref: z.string().min(8).max(48).optional(),
    t: z.string().uuid().optional(),
    s: z.string().uuid().optional(),
  }),
  // "data-only": o loader roda no servidor (garantindo as meta tags para a
  // prévia do link no WhatsApp), mas a página é renderizada no cliente.
  ssr: "data-only",
  loader: async ({ params }) => {
    const [meta, origin] = await Promise.all([
      getFormMeta({ data: { slug: params.slug } }),
      getRequestOrigin(),
    ]);
    return { meta, origin };
  },
  head: ({ params, loaderData }) => {
    const title = loaderData?.meta?.title ?? "Campanha do Povo que Batalha";
    const description =
      loaderData?.meta?.description ??
      "Preencha o formulário e faça parte da Campanha do Povo que Batalha.";
    const path = `/f/${params.slug}`;
    const origin = loaderData?.origin ?? SITE_URL;
    const imageVersion = loaderData?.meta?.imageVersion
      ? `?v=${encodeURIComponent(loaderData.meta.imageVersion)}`
      : "";
    const image = loaderData?.meta?.hasHeaderImage
      ? `${origin}/api/public/forms/${params.slug}/og-image${imageVersion}`
      : undefined;
    return {
      meta: [
        ...shareMeta({ title, description, path, ...(image ? { image } : {}) }),
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
