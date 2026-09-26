import { createFileRoute } from "@tanstack/react-router";
import { canonical, shareMeta, SITE_URL } from "@/lib/site-meta";

const TITLE = "Principais Ações do Mandato de Karen Santos";
const DESCRIPTION = "Material da Campanha do Povo que Batalha";
const PATH = "/materiais/principais-acoes-do-mandato";
const SLICE_COUNT = 20;
const SLICE_WIDTH = 892;
const SLICE_HEIGHT = 1500;

export const Route = createFileRoute("/materiais/principais-acoes-do-mandato")({
  head: () => ({
    meta: shareMeta({
      title: `${TITLE} — Campanha do Povo que Batalha`,
      description: DESCRIPTION,
      path: PATH,
      image: `${SITE_URL}/feed/preview.jpg`,
    }),
    links: canonical(PATH),
  }),
  component: CampaignMaterialPage,
});

function CampaignMaterialPage() {
  return (
    <main className="min-h-screen bg-background" translate="no">
      <h1 className="sr-only">{TITLE}</h1>
      <div className="mx-auto w-full max-w-[892px]" aria-label={TITLE}>
        {Array.from({ length: SLICE_COUNT }, (_, index) => {
          const number = String(index + 1).padStart(2, "0");
          return (
            <img
              key={number}
              src={`/feed/fatia-${number}.webp`}
              alt={index === 0 ? TITLE : ""}
              width={SLICE_WIDTH}
              height={SLICE_HEIGHT}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          );
        })}
      </div>
    </main>
  );
}