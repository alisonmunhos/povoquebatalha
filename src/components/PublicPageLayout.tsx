import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/utils";

export function PublicPageLayout({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
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
      <main
        className={cn(
          "mx-auto py-10",
          wide ? "w-full max-w-[900px] px-2 sm:px-6" : "max-w-md px-6",
        )}
      >
        {children}
      </main>
    </div>
  );
}

