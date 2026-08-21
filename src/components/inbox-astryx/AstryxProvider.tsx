import type { ReactNode } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

import "@/styles/astryx.css";

/**
 * Provider de tema do Astryx, restrito ao piloto do Inbox.
 * Se algum dia o piloto for promovido, este provider pode subir para o __root.
 */
export function AstryxProvider({ children }: { children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="light">
      {children}
    </Theme>
  );
}
