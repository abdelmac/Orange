"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import {
  THEME_COLORS,
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  themePreference,
  type ThemePreference,
} from "@/lib/theme";

const THEME_EVENT = "orange:theme-change";
const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
} | null>(null);

function currentPreference() {
  return themePreference(document.documentElement.dataset.themePreference);
}

function applyTheme(preference: ThemePreference) {
  const resolved =
    preference === "system"
      ? window.matchMedia(THEME_MEDIA_QUERY).matches
        ? "dark"
        : "light"
      : preference;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", THEME_COLORS[resolved]);
  });
  window.dispatchEvent(new Event(THEME_EVENT));
}

function setPreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The current page still works when browser storage is unavailable.
  }
  applyTheme(preference);
}

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore(subscribe, currentPreference, () => "system" as const);

  useEffect(() => {
    const media = window.matchMedia(THEME_MEDIA_QUERY);
    const onSystemChange = () => applyTheme(currentPreference());
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        applyTheme(themePreference(event.newValue));
      }
    };
    // Also synchronizes metadata after hydration, including statically rendered pages.
    onSystemChange();
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("Thème indisponible");
  return theme;
}
