"use client";
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("tiger-theme") as Theme | null;
    if (stored === "light" || stored === "dark") setThemeState(stored);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    localStorage.setItem("tiger-theme", t);
  };

  return { theme, setTheme };
}
