# RecRecord

RecRecord is a futuristic browser-based smart voice recorder built with React and Vite.

## Current features

- Microphone recording with browser permission handling
- Live microphone level and waveform visualization
- Pause and resume recording
- Local playback
- Download recordings in the browser-supported audio format
- Local delete
- Quick funny-voice playback preset
- Futuristic mobile-first HUD interface
- Recordings remain on the device and are not uploaded

## Run locally

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

## Status

Early development prototype. Planned next steps include persistent local library, richer voice effects, recording rename/share, waveform history, markers, PWA install support, and Android packaging.
