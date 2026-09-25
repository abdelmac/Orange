export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "orange-theme";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
export const THEME_COLORS = { light: "#f8f9fb", dark: "#101719" } as const;

export function themePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

// Static, trusted code only. It runs before paint; no user data is interpolated.
export const themeInitializationScript = `(() => {
  let preference = "system";
  try {
    const saved = localStorage.getItem("${THEME_STORAGE_KEY}");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch {}
  const dark = preference === "dark" || (preference === "system" && window.matchMedia("${THEME_MEDIA_QUERY}").matches);
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute("content", dark ? "${THEME_COLORS.dark}" : "${THEME_COLORS.light}"));
})();`;
