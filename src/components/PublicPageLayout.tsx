import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";

export function PublicPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background" translate="no">
      <header className="border-b-2 border-foreground bg-secondary text-secondary-foreground">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark className="h-6 w-6" />
            <span className="font-display text-lg tracking-wide">Povo que Batalha</span>
          </Link>
        </div>
      </header>
      <main className="max-w-md mx-auto px-6 py-10">{children}</main>
    </div>
  );
}

