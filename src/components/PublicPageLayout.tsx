import { Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import type { ReactNode } from "react";

export function PublicPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/20" translate="no">
      <header className="border-b bg-background">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center">
          <Link to="/" className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <span className="font-semibold">Campanha do Povo que Batalha</span>
          </Link>
        </div>
      </header>
      <main className="max-w-md mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
