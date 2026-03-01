"use client";

import { AlertTriangle } from "lucide-react";
import { useIsClient } from "@/lib/hooks";
import { ERRORS } from "@/lib/errors";

/**
 * Detects whether the browser supports the required audio APIs
 * and renders a persistent warning banner if not.
 */
export function BrowserCheck() {
  const isClient = useIsClient();

  if (!isClient) return null;

  const hasMediaRecorder = typeof MediaRecorder !== "undefined";
  const hasGetUserMedia = !!navigator.mediaDevices?.getUserMedia;

  if (hasMediaRecorder && hasGetUserMedia) return null;

  return (
    <div
      className="glass rounded-xl px-4 py-3 flex items-start gap-3 border-error/30"
      role="alert"
    >
      <AlertTriangle
        size={18}
        className="text-error shrink-0 mt-0.5"
      />
      <p className="text-sm text-text-primary">
        {ERRORS.unsupportedBrowser}
      </p>
    </div>
  );
}
