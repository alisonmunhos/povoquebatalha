import fistAsset from "@/assets/logo-mark-fist.png.asset.json";

type Props = {
  className?: string;
  alt?: string;
};

export function BrandMark({ className = "h-6 w-6", alt = "Povo que Batalha" }: Props) {
  return <img src={fistAsset.url} alt={alt} className={className} loading="eager" decoding="async" />;
}
