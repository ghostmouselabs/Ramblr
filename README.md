# Ramblr

Turn your voice into text in seconds. Record or upload audio and get instant transcriptions powered by OpenAI.

## Features

- **Record audio** directly in the browser (microphone, system audio, or both)
- **Upload audio files** — drag-and-drop, batch support
- **Three transcription models** — Best Quality, Budget-Friendly, and Classic (no length limit)
- **Automatic chunking** — handles large files seamlessly
- **Crash recovery** — auto-saves recordings to IndexedDB so you never lose data
- **Dark mode** with system preference detection
- **Fully client-side** — your API key stays on your device

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4** (CSS-first configuration)
- **ffmpeg.wasm** for client-side audio splitting
- **Lucide React** for icons

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) and enter your OpenAI API key to begin.

## How It Works

1. Enter your [OpenAI API key](https://platform.openai.com/api-keys) — stored locally, never sent to our servers
2. Record audio or upload files
3. Choose a transcription model
4. Get your transcription — copy to clipboard or download as .txt

## Deployment

Deploy to [Vercel](https://vercel.com) with zero configuration:

```bash
npx vercel
```

No environment variables or server-side secrets needed — everything runs client-side with the user's own API key.
