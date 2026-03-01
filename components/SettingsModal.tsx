"use client";

import { useState } from "react";
import { Eye, EyeOff, Trash2, Save } from "lucide-react";
import { Modal, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { STORAGE_KEYS } from "@/lib/constants";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onApiKeyCleared: () => void;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 5) + "•".repeat(Math.min(key.length - 9, 30)) + key.slice(-4);
}

function validateApiKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return "Please enter your API key.";
  if (!trimmed.startsWith("sk-"))
    return 'API keys start with "sk-". Please check and try again.';
  if (trimmed.length < 20)
    return "That key looks too short. Please check and try again.";
  return null;
}

export function SettingsModal({
  open,
  onClose,
  onApiKeyCleared,
}: SettingsModalProps) {
  const { toast } = useToast();
  const [currentKey, setCurrentKey] = useState("");
  const [newKey, setNewKey] = useState("");
  const [showNewKey, setShowNewKey] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  // State-adjustment: reset form state when modal opens
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCurrentKey(localStorage.getItem(STORAGE_KEYS.apiKey) || "");
      setNewKey("");
      setShowNewKey(false);
      setIsEditing(false);
      setError(null);
      setConfirmClear(false);
    }
  }

  const handleSaveNewKey = () => {
    const validationError = validateApiKey(newKey);
    if (validationError) {
      setError(validationError);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.apiKey, newKey.trim());
    setCurrentKey(newKey.trim());
    setNewKey("");
    setIsEditing(false);
    setError(null);
    toast("API key updated.", "success");
  };

  const handleClearKey = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.apiKey);
    onClose();
    onApiKeyCleared();
  };

  const handleNewKeyChange = (value: string) => {
    setNewKey(value);
    if (error) setError(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="space-y-5">
        {/* Current key display */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary">
            Current API key
          </label>
          <div className="px-4 py-3 rounded-xl bg-surface border border-surface-border text-sm text-text-secondary font-mono tracking-wide">
            {maskKey(currentKey)}
          </div>
        </div>

        {/* Edit key */}
        {!isEditing ? (
          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsEditing(true)}
            className="w-full"
          >
            Change API key
          </Button>
        ) : (
          <div className="space-y-3">
            <label className="text-sm font-medium text-text-primary">
              New API key
            </label>
            <div className="relative">
              <input
                type={showNewKey ? "text" : "password"}
                value={newKey}
                onChange={(e) => handleNewKeyChange(e.target.value)}
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
                onClick={() => setShowNewKey(!showNewKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-secondary transition-colors"
                aria-label={showNewKey ? "Hide API key" : "Show API key"}
              >
                {showNewKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && (
              <p className="text-sm text-error" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={handleSaveNewKey}
                className="flex-1"
              >
                <Save size={16} />
                Save
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setIsEditing(false);
                  setNewKey("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-surface-border" />

        {/* Clear key */}
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="md"
            onClick={handleClearKey}
            className={`w-full ${confirmClear ? "text-error hover:text-error" : "text-text-secondary"}`}
          >
            <Trash2 size={16} />
            {confirmClear
              ? "Are you sure? Click again to remove"
              : "Remove API key"}
          </Button>
          {confirmClear && (
            <p className="text-xs text-text-tertiary text-center">
              This will sign you out and you&apos;ll need to re-enter your key.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
