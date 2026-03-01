"use client";

import { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";

interface TabGroupProps<T extends string> {
  tabs: { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
}

export function TabGroup<T extends string>({
  tabs,
  active,
  onChange,
}: TabGroupProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeIndex = tabs.findIndex((t) => t.value === active);
    const activeButton = container.children[activeIndex + 1] as
      | HTMLElement
      | undefined; // +1 for the indicator div

    if (activeButton) {
      setIndicator({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      });
    }
  }, [active, tabs]);

  // Arrow key navigation (standard ARIA tab pattern)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = tabs.findIndex((t) => t.value === active);
      let nextIndex: number | null = null;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (e.key === "Home") {
        nextIndex = 0;
      } else if (e.key === "End") {
        nextIndex = tabs.length - 1;
      }

      if (nextIndex !== null) {
        e.preventDefault();
        onChange(tabs[nextIndex].value);
        // Focus the newly activated tab
        const container = containerRef.current;
        const button = container?.children[nextIndex + 1] as
          | HTMLElement
          | undefined;
        button?.focus();
      }
    },
    [active, tabs, onChange],
  );

  return (
    <div
      ref={containerRef}
      className="relative inline-flex glass rounded-xl p-1 gap-1"
      role="tablist"
      onKeyDown={handleKeyDown}
    >
      {/* Sliding indicator */}
      <div
        className="absolute top-1 bottom-1 rounded-lg bg-primary-500/15 dark:bg-primary-400/20 transition-all duration-300 ease-spring"
        style={{ left: indicator.left, width: indicator.width }}
        aria-hidden="true"
      />

      {tabs.map((tab) => (
        <button
          key={tab.value}
          id={`tab-${tab.value}`}
          role="tab"
          aria-selected={active === tab.value}
          aria-controls={`tabpanel-${tab.value}`}
          tabIndex={active === tab.value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          className={`relative z-10 px-5 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
            active === tab.value
              ? "text-primary-600 dark:text-primary-400"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
