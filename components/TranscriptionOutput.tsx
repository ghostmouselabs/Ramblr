"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  Download,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import { GlassCard, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import type { TranscriptionResult } from "@/lib/transcribe";

interface TranscriptionOutputProps {
  results: TranscriptionResult[];
  onReset: () => void;
}

export function TranscriptionOutput({
  results,
  onReset,
}: TranscriptionOutputProps) {
  if (results.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">
          {results.length === 1 ? "Transcription" : "Transcriptions"}
        </h2>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw size={14} />
          Start over
        </Button>
      </div>

      {results.length === 1 ? (
        <SingleResult result={results[0]} />
      ) : (
        <div className="space-y-3">
          {results.map((result, i) => (
            <CollapsibleResult key={`${result.fileName}-${i}`} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single transcription result ───────────────────────────────

function SingleResult({ result }: { result: TranscriptionResult }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    toast("Copied to clipboard.", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([result.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stripExtension(result.fileName)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="primary" size="sm" onClick={handleCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied!" : "Copy"}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDownload}>
          <Download size={14} />
          Download .txt
        </Button>
      </div>
      <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
        {result.text || (
          <span className="text-text-tertiary italic">
            No speech detected in this audio.
          </span>
        )}
      </div>
    </GlassCard>
  );
}

// ── Collapsible result for batch transcriptions ───────────────

function CollapsibleResult({ result }: { result: TranscriptionResult }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    toast("Copied to clipboard.", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([result.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stripExtension(result.fileName)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <GlassCard className="space-y-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-primary truncate">
          {result.fileName}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors"
            aria-label={`Copy transcription of ${result.fileName}`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors"
            aria-label={`Download transcription of ${result.fileName}`}
          >
            <Download size={14} />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronUp size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="pt-3 mt-3 border-t border-surface-border text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words max-h-[40vh] overflow-y-auto">
          {result.text || (
            <span className="text-text-tertiary italic">
              No speech detected in this audio.
            </span>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function stripExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}
