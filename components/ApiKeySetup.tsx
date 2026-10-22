"use client";

import { useState } from "react";
import { AudioLines, Eye, EyeOff, HelpCircle, ArrowRight } from "lucide-react";
import { GlassCard, Button } from "@/components/ui";
import { HelpModal } from "@/components/HelpModal";
import { STORAGE_KEYS } from "@/lib/constants";

interface ApiKeySetupProps {
  onComplete: () => void;
}

function validateApiKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return "Please enter your API key.";
  if (!trimmed.startsWith("sk-")) return "API keys start with \"sk-\". Please check and try again.";
  if (trimmed.length < 20) return "That key looks too short. Please check and try again.";
  return null;
}

export function ApiKeySetup({ onComplete }: ApiKeySetupProps) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateApiKey(key);
    if (validationError) {
      setError(validationError);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.apiKey, key.trim());
    onComplete();
  };

  const handleChange = (value: string) => {
    setKey(value);
    if (error) setError(null);
  };

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-2 sm:px-4">
        <div className="w-full max-w-md space-y-6">
          {/* Logo and welcome text */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-500 mb-2">
              <AudioLines size={28} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">
              Turn your voice into text
            </h1>
            <p className="text-text-secondary text-base leading-relaxed">
              Record or upload audio and get instant transcriptions.
              Fast, private, and simple.
            </p>
          </div>

          {/* API key card */}
          <GlassCard className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">
                Enter your OpenAI API key
              </h2>
              <button
                onClick={() => setHelpOpen(true)}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-primary-500 hover:bg-primary-500/10 transition-colors"
                aria-label="How to get an API key"
              >
                <HelpCircle size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={key}
                  onChange={(e) => handleChange(e.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                  className={`w-full px-4 py-3 pr-11 rounded-xl bg-surface border text-sm text-text-primary placeholder:text-text-tertiary transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 ${
                    error
                      ? "border-error/50 focus:ring-error/30 focus:border-error"
                      : "border-surface-border"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-secondary transition-colors"
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {error && (
                <p className="text-sm text-error" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" size="lg" className="w-full">
                Get started
                <ArrowRight size={16} />
              </Button>
            </form>

            <button
              onClick={() => setHelpOpen(true)}
              className="text-sm text-primary-500 hover:text-primary-600 transition-colors"
            >
              How do I get an API key?
            </button>
          </GlassCard>

          <p className="text-xs text-text-tertiary text-center leading-relaxed">
            Your key is stored only in this browser. When you transcribe, it&apos;s
            relayed through our server to OpenAI and is never stored or logged.
          </p>
        </div>
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
