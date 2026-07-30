/**
 * Constantes usadas nas meta tags de pré-visualização de link
 * (WhatsApp, Telegram, Facebook, X).
 *
 * Os robôs de prévia não executam JavaScript e exigem URLs absolutas,
 * por isso o domínio publicado fica fixo aqui.
 */
export const SITE_URL = "https://povoquebatalha.lovable.app";

/** Imagem de compartilhamento padrão (1200x630) com a identidade atual. */
export const OG_DEFAULT_IMAGE = `${SITE_URL}/og-default.png`;

export const SITE_NAME = "Campanha do Povo que Batalha";

type MetaTag = Record<string, string>;

/**
 * Monta o conjunto padrão de meta tags de compartilhamento de uma página.
 * Use apenas em rotas folha — nunca no __root (senão sobrescreve as capas
 * próprias de eventos e missões).
 */
export function shareMeta(options: {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: string;
}): MetaTag[] {
  const image = options.image ?? OG_DEFAULT_IMAGE;
  const url = `${SITE_URL}${options.path}`;
  return [
    { title: options.title },
    { name: "description", content: options.description },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: options.title },
    { property: "og:description", content: options.description },
    { property: "og:type", content: options.type ?? "website" },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: options.title },
    { name: "twitter:description", content: options.description },
    { name: "twitter:image", content: image },
  ];
}

export function canonical(path: string) {
  return [{ rel: "canonical", href: `${SITE_URL}${path}` }];
}
