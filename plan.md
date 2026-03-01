 Ramblr — Implementation Plan                                                                                                                                                     
                                                        
 Context

 Building a greenfield web app for audio transcription. Users record or upload audio, it gets transcribed via OpenAI's API. No backend, no auth, no database. Users provide their
  own OpenAI API key. Deployed on Vercel.

 Key constraints: Vercel 4.5MB body limit (chunk to <3.5MB), ffmpeg.wasm single-threaded (no COEP/COOP), Next.js 16.1 with Turbopack (ffmpeg loaded from CDN to avoid bundler
 issues).

 ---
 Build Order (9 Phases)

 Phase 0: Scaffolding

 - npx create-next-app@latest . --typescript --tailwind --app --turbopack --src-dir=false --import-alias="@/*"
 - Install deps: lucide-react, @ffmpeg/ffmpeg@0.12.6, @ffmpeg/util@0.12.1
 - Delete dummy file, clean boilerplate
 - Create directory structure: components/, components/ui/, lib/
 - Create lib/constants.ts (model definitions, size limits, CDN URLs)
 - Create lib/logger.ts (dev-only console gating)
 - Minimal next.config.ts (no special headers needed)

 Phase 1: Design System & Layout Shell

 - app/globals.css: Tailwind v4 CSS-first config
   - @import "tailwindcss" + @custom-variant dark (&:where(.dark, .dark *)) for class-based dark mode
   - @theme block with oklch color tokens (primary indigo, glass surfaces, record red, text colors)
   - Gradient mesh background (lavender/blue/pink in light, deep navy variants in dark)
   - .glass utility class (semi-transparent white, backdrop-blur, soft shadow)
 - app/layout.tsx: DM Sans via next/font/google, metadata ("Ramblr"), inline dark mode script to prevent flash
 - UI primitives (components/ui/): GlassCard, Button (primary/secondary/danger/ghost variants), Modal (portal-based), Toast (context provider, auto-dismiss), TabGroup (animated
 underline)
 - components/ThemeToggle.tsx: Sun/Moon icons, localStorage persistence, system preference respect
 - app/page.tsx: Layout shell — sticky glass header (logo, settings, theme toggle), centered max-w-3xl main area, Record/Upload tabs, output area below

 Phase 2: API Key Management

 - components/ApiKeySetup.tsx: First-visit welcome screen in glass card. Password input with show/hide. Basic validation (sk- prefix, min length). Saves to
 localStorage('ramblr-api-key').
 - components/HelpModal.tsx: Plain-language numbered steps for getting an OpenAI key. Direct link to platform.openai.com/api-keys. Friendly, non-technical tone.
 - Settings modal: Gear icon in header opens modal to view (masked)/replace/clear API key.

 Phase 3: Model Selector & API Route

 - components/ModelSelector.tsx: Three radio-style cards — "Best Quality" (gpt-4o-transcribe), "Budget-Friendly" (gpt-4o-mini-transcribe), "Classic — No Length Limit"
 (whisper-1). Helper text with pricing. Persists to localStorage.
 - app/api/transcribe/route.ts: POST handler. Accepts multipart form data (file + api_key + model). Validates all three fields. Forwards to OpenAI POST /v1/audio/transcriptions
 with response_format: text. Returns { text }. Never logs the key. Maps error status codes through.
 - lib/transcribe.ts: Client-side orchestrator. transcribeChunk() sends one chunk to /api/transcribe. transcribeChunks() sends all sequentially with progress callback. Error
 messages mapped from HTTP status codes (401 → key issue, 429 → rate limit, etc).

 Phase 4: Upload & Basic Transcription (First Working E2E)

 - components/AudioUploader.tsx: Drag-and-drop zone + click-to-browse. Multi-file support. File list with name, size, remove button. "Transcribe All" button.
 - components/TranscriptionOutput.tsx: Glass card with transcribed text. Copy to clipboard (navigator.clipboard + toast confirmation). Download as .txt. Per-file results for
 batch. "New Recording" / "Upload Another" reset button.
 - components/ProgressIndicator.tsx: Spinner for single file, "Chunk X of Y" for multi-chunk, per-file status for batch.
 - At this point: working app for files under 3.5MB.

 Phase 5: ffmpeg.wasm Chunking

 - lib/audio-utils.ts: MIME type detection, extension mapping, getAudioDuration() via Web Audio API decodeAudioData.
 - lib/chunker.ts:
   - Lazy ffmpeg init — loads @ffmpeg/core@0.12.6 from CDN via toBlobURL (avoids Turbopack issues)
   - chunkAudio(blob, fileName, model): Checks size AND duration. For gpt-4o models: split at 3.5MB or 20min, whichever first. For whisper-1: 3.5MB only.
   - Uses -c copy (no re-encode) for speed. Falls back to -b:a 64k re-encode if chunk still too large (variable bitrate edge case).
   - Called via dynamic import() to ensure browser-only loading.
 - Integrate into upload and recording flows.

 Phase 6: Audio Recording

 - lib/recorder.ts: AudioRecorderEngine class wrapping MediaRecorder.
   - Source modes: mic (getUserMedia), system (getDisplayMedia with video track discarded), both (merged via Web Audio API createMediaStreamDestination).
   - MIME detection: audio/webm;codecs=opus > audio/webm > audio/mp4 (Safari fallback).
   - timeslice: 30000ms for periodic chunk delivery.
   - Pause/resume support.
   - AnalyserNode exposed for waveform visualization.
 - components/AudioRecorder.tsx:
   - Source selector (3 buttons with icons). System/Both disabled on non-Chromium with explanation.
   - Large pulsing record button (custom keyframe animation).
   - Timer (MM:SS / HH:MM:SS).
   - Canvas waveform visualizer (oscilloscope from getByteTimeDomainData in rAF loop).
   - Pause/Stop buttons appear during recording.
   - Tip text contextual to selected source.
   - On stop: assembled blob → chunking → transcription → output.

 Phase 7: Crash Recovery

 - lib/storage.ts: Raw IndexedDB wrapper. DB: ramblr-db, store: recordings. CRUD for { id, chunks: Blob[], mimeType, source, timestamp, duration }.
 - Auto-save: Every 5 minutes during recording, persist accumulated chunks to IndexedDB.
 - components/RecoveryPrompt.tsx: On page load, check for orphaned recordings. Show "We found a recording from your last session" with Recover/Discard buttons. Recover assembles
  blob and feeds to transcription. Discard clears entry.
 - Cleanup: Delete IndexedDB entry after successful transcription or explicit discard.
 - Graceful fallback: If IndexedDB unavailable (private browsing), silently skip auto-save.

 Phase 8: Polish & Error Handling

 - Error consolidation (lib/errors.ts): Map all error types (network, permission denied, mic not found, empty transcription, ffmpeg load failure) to user-friendly messages.
 - Responsive tuning: Full-bleed cards on mobile, comfortable padding on tablet/desktop. Record button centered on all sizes.
 - Animations: Smooth tab transitions, card fade-in, progress bar CSS transitions, toast slide-in/out, dark mode color transition.
 - Accessibility: Focus-visible rings, ARIA labels on icon buttons, role="alert" on errors, keyboard navigation, prefers-reduced-motion disabling animations.
 - Footer disclaimer: "If you're recording a call, make sure all participants are aware and consent."
 - Empty result handling: "No speech detected in this audio."
 - Browser unsupported banner if MediaRecorder missing.

 Phase 9: Verification

 - Run next build — ensure clean production build
 - Run next dev — verify Turbopack compatibility
 - Test API route with a small audio file
 - Test chunking with a file >3.5MB
 - Test recording (mic source)
 - Test dark mode toggle + persistence
 - Test API key flow (enter, change, clear)
 - Test all three model selections
 - Test crash recovery (start recording → close tab → reopen)

 ---
 Critical Files

 ┌──────────────────────────────┬───────────────────────────────────────────────────────────────────────────┐
 │             File             │                                   Role                                    │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ app/globals.css              │ Design system: Tailwind v4 config, theme tokens, glassmorphism, gradients │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ app/layout.tsx               │ Root layout: DM Sans font, metadata, dark mode init script                │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ app/page.tsx                 │ Main page: state management, layout shell, tab routing                    │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ app/api/transcribe/route.ts  │ Only server code: OpenAI proxy, validation, error mapping                 │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ lib/chunker.ts               │ ffmpeg.wasm init from CDN, audio splitting by size/duration               │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ lib/recorder.ts              │ MediaRecorder wrapper: sources, MIME detection, pause/resume              │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ lib/storage.ts               │ Raw IndexedDB: crash recovery persistence                                 │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ lib/transcribe.ts            │ Client orchestrator: chunk sending, progress, error mapping               │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ lib/constants.ts             │ Model definitions, size limits, CDN URLs                                  │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ components/AudioRecorder.tsx │ Recording UI: source selector, button, timer, waveform                    │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ components/AudioUploader.tsx │ Upload UI: drag-drop, file list, batch transcription                      │
 ├──────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ components/ApiKeySetup.tsx   │ First-visit flow: key input, validation, help modal                       │
 └──────────────────────────────┴───────────────────────────────────────────────────────────────────────────┘

 ---
 Key Technical Decisions

 1. ffmpeg.wasm from CDN — Avoids Turbopack bundling issues. toBlobURL fetches core files at runtime. Lazy-loaded via dynamic import().
 2. 3.5MB chunk limit — Leaves 1MB headroom under Vercel's 4.5MB body limit for form data overhead.
 3. Dual chunking constraint — gpt-4o models: min(3.5MB, 20min). whisper-1: 3.5MB only.
 4. Class-based dark mode — @custom-variant dark in Tailwind v4. Inline script prevents flash.
 5. No extra dependencies — Raw IndexedDB (no idb/Dexie), raw MediaRecorder (no recorder library), raw Web Audio API for waveform.
 6. Sequential chunk transcription — Avoids OpenAI rate limits. Progress callback per chunk.