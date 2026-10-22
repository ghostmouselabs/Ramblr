# Ramblr

Turn your voice into text in seconds. Record or upload audio and get instant transcriptions powered by OpenAI.

## Features

- **Record audio** directly in the browser (microphone, system audio, or both)
- **Upload audio files** — drag-and-drop, batch support
- **Two transcription models** — Best Quality (`gpt-4o-transcribe`) and Budget-Friendly (`gpt-4o-mini-transcribe`)
- **Automatic chunking** — handles large files seamlessly
- **Crash recovery** — auto-saves recordings to IndexedDB so you never lose data
- **Dark mode** with system preference detection
- **Private by design** — bring your own key; no accounts, no database, no analytics

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

1. Enter your [OpenAI API key](https://platform.openai.com/api-keys) — stored only in your browser
2. Record audio or upload files
3. Choose a transcription model
4. Get your transcription — copy to clipboard or download as .txt

## Privacy

- Your API key is stored in your browser's localStorage.
- Audio is split into chunks in your browser (ffmpeg.wasm). Each chunk and your key are sent over HTTPS to a small serverless route (`/api/transcribe`), which forwards them to OpenAI's transcription API and returns the text. The route keeps nothing and logs only error status codes, never the key, audio, file names, or transcripts.
- Recordings and uploaded audio are saved in your browser's IndexedDB; transcripts are saved in localStorage. Nothing is stored server-side, and there are no analytics.
- OpenAI's handling of the audio is governed by [OpenAI's API data usage policies](https://openai.com/policies/api-data-usage-policies).

## Deployment

Deploy to [Vercel](https://vercel.com) with zero configuration:

```bash
npx vercel
```

No environment variables or server-side secrets needed — the only server code is the `/api/transcribe` relay, which uses each user's own API key.
