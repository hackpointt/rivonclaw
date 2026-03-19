/** Locale-aware brand name for the Electron main process. */
const BRAND: Record<string, string> = {
  zh: "爪爪",
  en: "RivonClaw",
};

/** Get the brand name for the given locale. */
export function brandName(locale: string): string {
  return BRAND[locale] ?? BRAND.en;
}
