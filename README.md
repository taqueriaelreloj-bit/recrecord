# RecRecord

RecRecord is a futuristic browser-based smart voice recorder built with React and Vite.

## Current features

- Microphone recording with browser permission handling
- Live microphone level and waveform visualization
- Pause and resume recording
- Local playback
- Download recordings in the browser-supported audio format
- Persistent local library backed by IndexedDB
- Local delete
- Quick funny-voice playback preset
- Futuristic mobile-first HUD interface
- Recordings remain on the device and are not uploaded

## Run locally

Requires Node.js 20.19 or newer (Node.js 22 LTS is recommended).

```bash
npm install
npm run dev
```

Open the local address shown by Vite. For microphone access on another phone or computer, use HTTPS or localhost because modern browsers restrict microphone access on insecure origins.

## Production build

```bash
npm run build
npm run preview
```

## Quality checks

```bash
npm run check
```

This runs ESLint, the unit tests, and the production build. CI uses `npm ci` with the committed lockfile so dependency installation is reproducible.

## Status

Early development prototype. Planned next steps include richer voice effects, recording rename/share, waveform history, markers, expanded PWA install support, and Android packaging.
