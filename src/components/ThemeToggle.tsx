"use client";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("tiger-theme");
    const initial = stored === "light" ? "light" : "dark";
    setTheme(initial);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("tiger-theme", next);
  };

  return (
    <button
      onClick={toggle}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      style={{
        padding: "6px 10px",
        background: "none",
        border: "none",
        color: "var(--color-text-faint)",
        fontSize: "14px",
        cursor: "pointer",
        lineHeight: 1,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
