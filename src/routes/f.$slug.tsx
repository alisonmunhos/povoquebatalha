import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PublicFormRenderer } from "@/components/PublicFormRenderer";

export const Route = createFileRoute("/f/$slug")({
  validateSearch: z.object({
    ref: z.string().min(8).max(48).optional(),
    t: z.string().uuid().optional(),
  }),
  head: () => ({
    meta: [
      { name: "google", content: "notranslate" },
    ],
  }),
  ssr: false,
  component: FSlugPage,
});

function FSlugPage() {
  const { slug } = Route.useParams();
  const { ref, t } = Route.useSearch();
  return <PublicFormRenderer slug={slug} refToken={ref} recadToken={t} />;
}
