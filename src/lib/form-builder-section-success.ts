/** Tri-estado de override por seção: null = seguir padrão do formulário. */
export type SectionOverride = boolean | null | undefined;

export type TriStateChoice = "default" | "on" | "off";

export function triStateFromOverride(value: SectionOverride): TriStateChoice {
  if (value === true) return "on";
  if (value === false) return "off";
  return "default";
}

export function overrideFromTriState(choice: TriStateChoice): boolean | null {
  if (choice === "on") return true;
  if (choice === "off") return false;
  return null;
}

export function effectiveBoolean(override: SectionOverride, formDefault: boolean): boolean {
  if (override === true) return true;
  if (override === false) return false;
  return formDefault;
}

export function onOffLabel(enabled: boolean): string {
  return enabled ? "ligado" : "desligado";
}
