"use client";

import { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useIsClient } from "@/lib/hooks";
import { STORAGE_KEYS } from "@/lib/constants";

export function ThemeToggle() {
  const isClient = useIsClient();

  if (!isClient) {
    // Fixed-size placeholder to avoid layout shift during hydration
    return <div className="w-9 h-9 rounded-lg" aria-hidden="true" />;
  }

  return <ThemeToggleClient />;
}

function ThemeToggleClient() {
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark"),
  );

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(STORAGE_KEYS.theme, next ? "dark" : "light");
  };

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
