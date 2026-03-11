"use client";

import { useState } from "react";
import { Sparkles, Coins } from "lucide-react";
import { useIsClient } from "@/lib/hooks";
import { MODELS, DEFAULT_MODEL, STORAGE_KEYS, type ModelId } from "@/lib/constants";

interface ModelSelectorProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
}

const MODEL_ICONS: Record<ModelId, typeof Sparkles> = {
  "gpt-4o-transcribe": Sparkles,
  "gpt-4o-mini-transcribe": Coins,
};

const MODEL_ORDER: ModelId[] = [
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
];

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const handleSelect = (id: ModelId) => {
    onChange(id);
    localStorage.setItem(STORAGE_KEYS.model, id);
  };

  return (
    <div className="space-y-2">
      <fieldset>
        <legend className="text-sm font-medium text-text-secondary mb-2">
          Transcription model
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup">
          {MODEL_ORDER.map((id) => {
            const model = MODELS[id];
            const Icon = MODEL_ICONS[id];
            const isSelected = value === id;

            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleSelect(id)}
                className={`relative flex flex-col items-start gap-1.5 p-3.5 rounded-xl border text-left transition-all duration-200 ease-smooth ${
                  isSelected
                    ? "border-primary-500 bg-primary-500/8 dark:bg-primary-500/12 shadow-sm"
                    : "border-surface-border bg-surface/50 hover:bg-surface hover:border-surface-border"
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <Icon
                    size={16}
                    className={
                      isSelected
                        ? "text-primary-500"
                        : "text-text-tertiary"
                    }
                  />
                  <span
                    className={`text-sm font-semibold ${
                      isSelected ? "text-primary-600 dark:text-primary-400" : "text-text-primary"
                    }`}
                  >
                    {model.label}
                  </span>
                </div>
                <span className="text-xs text-text-tertiary leading-snug">
                  {model.description}
                </span>
                <span className="text-xs text-text-tertiary font-mono">
                  {model.price}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

/**
 * Hook to manage model selection state with localStorage persistence.
 */
export function useModelSelection(): [ModelId, (model: ModelId) => void] {
  const isClient = useIsClient();
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [synced, setSynced] = useState(false);

  // State-adjustment: sync from localStorage once after hydration
  if (isClient && !synced) {
    setSynced(true);
    const stored = localStorage.getItem(STORAGE_KEYS.model);
    if (stored && stored in MODELS) {
      setModel(stored as ModelId);
    } else if (stored) {
      // Stale value (e.g. removed "whisper-1") — reset to default
      localStorage.setItem(STORAGE_KEYS.model, DEFAULT_MODEL);
    }
  }

  return [model, setModel];
}
