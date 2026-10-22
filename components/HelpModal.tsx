"use client";

import { ExternalLink } from "lucide-react";
import { Modal, Button } from "@/components/ui";

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const OPENAI_API_KEYS_URL = "https://platform.openai.com/api-keys";

export function HelpModal({ open, onClose }: HelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="How to get an API key">
      <div className="space-y-4">
        <p className="text-text-secondary text-sm leading-relaxed">
          To use Ramblr, you need an OpenAI API key. It&apos;s free to create an
          account, and transcription costs roughly{" "}
          <strong className="text-text-primary">
            6 cents for 10 minutes of audio
          </strong>{" "}
          (or as low as 3 cents with the budget model).
        </p>

        <ol className="space-y-3 text-sm text-text-secondary">
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-semibold">
              1
            </span>
            <span>
              Go to{" "}
              <a
                href={OPENAI_API_KEYS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-500 hover:text-primary-600 underline underline-offset-2"
              >
                OpenAI&apos;s platform
              </a>{" "}
              and create an account (or sign in if you already have one).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-semibold">
              2
            </span>
            <span>
              Once you&apos;re signed in, go to the{" "}
              <strong className="text-text-primary">API Keys</strong> section in
              your account settings.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-semibold">
              3
            </span>
            <span>
              Click{" "}
              <strong className="text-text-primary">
                &quot;Create new secret key&quot;
              </strong>
              , give it any name you like, and click create.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-semibold">
              4
            </span>
            <span>
              Copy the key (it starts with{" "}
              <code className="text-xs bg-surface px-1.5 py-0.5 rounded">
                sk-
              </code>
              ) and paste it into the field on this page.
            </span>
          </li>
        </ol>

        <div className="pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={() =>
              window.open(OPENAI_API_KEYS_URL, "_blank", "noopener,noreferrer")
            }
            className="w-full"
          >
            <ExternalLink size={16} />
            Open OpenAI API Keys
          </Button>
        </div>

        <p className="text-xs text-text-tertiary leading-relaxed">
          Your API key is stored only in this browser. When you transcribe,
          your key and audio are relayed through our server to OpenAI over
          HTTPS. Our server never stores or logs your key, audio, or
          transcripts.
        </p>
      </div>
    </Modal>
  );
}
