import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Download, HardDrive, Mic, Pause, Play, Settings, Sparkles, Square, Trash2 } from "lucide-react";

const PRESETS = [
  { id: "normal", label: "Normal", rate: 1 },
  { id: "chipmunk", label: "Ardilla", rate: 1.7 },
  { id: "deep", label: "Grave", rate: 0.72 },
  { id: "fast", label: "Ardilla+", rate: 2.1 },
];

function formatTime(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function preferredMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function extensionFor(type = "") {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  return "webm";
}

function Waveform({ bars, active }) {
  return (
    <div className={`wave ${active ? "active" : ""}`}>
      {bars.map((value, index) => (
        <i key={index} style={{ height: `${Math.max(5, value * 42)}px` }} />
      ))}
    </div>
  );
}

export default function App() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [bars, setBars] = useState(Array(42).fill(0.08));
  const [takes, setTakes] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [error, setError] = useState("");

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const elapsedRef = useRef(0);
  const audioRef = useRef(null);

  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  const stopVisualizer = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (ctxRef.current) ctxRef.current.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
  }, []);

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) {
      const v = (sample - 128) / 128;
      sum += v * v;
    }
    const value = Math.min(1, Math.sqrt(sum / data.length) * 4.2);
    setLevel(value);
    setBars((prev) => [...prev.slice(-41), value]);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  };

  const startRecording = async () => {
    setError("");
    stopPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      ctxRef.current = ctx;
      analyserRef.current = analyser;

      const mimeType = preferredMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => e.data?.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size) {
          const take = {
            id: Date.now(),
            name: `Take ${String(takes.length + 1).padStart(2, "0")}`,
            duration: elapsedRef.current,
            type,
            blob,
            url: URL.createObjectURL(blob),
          };
          setTakes((prev) => [take, ...prev]);
        }
        stream.getTracks().forEach((track) => track.stop());
        stopVisualizer();
      };

      pausedTotalRef.current = 0;
      pausedAtRef.current = 0;
      startedAtRef.current = performance.now();
      setElapsed(0);
      setBars(Array(42).fill(0.08));
      recorder.start(250);
      setRecording(true);
      setPaused(false);
      timerRef.current = setInterval(() => {
        const now = performance.now();
        const livePause = pausedAtRef.current ? now - pausedAtRef.current : 0;
        setElapsed((now - startedAtRef.current - pausedTotalRef.current - livePause) / 1000);
      }, 150);
      tick();
    } catch (err) {
      setError("No pude acceder al micrófono. Revisa el permiso del navegador e inténtalo otra vez.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state !== "inactive") recorderRef.current.stop();
    clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
    setPaused(false);
    setLevel(0);
  };

  const togglePause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      pausedAtRef.current = performance.now();
      setPaused(true);
    } else if (recorder.state === "paused") {
      recorder.resume();
      pausedTotalRef.current += performance.now() - pausedAtRef.current;
      pausedAtRef.current = 0;
      setPaused(false);
    }
  };

  const playTake = (take, rate = 1) => {
    if (playingId === take.id) return stopPlayback();
    stopPlayback();
    const audio = new Audio(take.url);
    audio.playbackRate = rate;
    audio.onended = stopPlayback;
    audioRef.current = audio;
    setPlayingId(take.id);
    audio.play();
  };

  const downloadTake = (take) => {
    const link = document.createElement("a");
    link.href = take.url;
    link.download = `${take.name}.${extensionFor(take.type)}`;
    link.click();
  };

  const deleteTake = (take) => {
    if (playingId === take.id) stopPlayback();
    URL.revokeObjectURL(take.url);
    setTakes((prev) => prev.filter((item) => item.id !== take.id));
  };

  useEffect(() => () => {
    clearInterval(timerRef.current);
    stopVisualizer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    takes.forEach((take) => URL.revokeObjectURL(take.url));
  }, []);

  const percent = Math.round(level * 100);

  return (
    <div className="app">
      <div className="scanlines" />
      <div className="shell">
        <header>
          <div>
            <div className="brand">REC<span>●</span>RECORD</div>
            <div className="subtitle">SMART VOICE RECORDER</div>
          </div>
          <button className="icon"><Settings size={20} /></button>
        </header>

        <section className="stats hud">
          <div><Activity size={17} /><small>WAVEFORM</small><b>{recording && !paused ? "LIVE" : "READY"}</b></div>
          <div><Mic size={17} /><small>MIC LEVEL</small><b>{percent}%</b></div>
          <div><HardDrive size={17} /><small>STORAGE</small><b>LOCAL</b></div>
        </section>

        <main className="console hud">
          <div className="reels"><div className={`reel ${recording && !paused ? "spin" : ""}`} /><Waveform bars={bars} active={recording && !paused} /><div className={`reel ${recording && !paused ? "spin" : ""}`} /></div>

          <div className={`meter ${recording ? "live" : ""}`} style={{ "--meter": `${Math.max(8, percent * 2.7)}deg` }}>
            <div className="meterCore">
              <small>RECORDING TIME</small>
              <strong>{formatTime(elapsed)}</strong>
              <em>{paused ? "PAUSED" : recording ? `MIC ${percent}%` : "STANDBY"}</em>
            </div>
          </div>

          <div className="controls">
            <button disabled={!recording} onClick={togglePause} className="round secondary">{paused ? <Play /> : <Pause />}</button>
            <button onClick={recording ? stopRecording : startRecording} className={`round record ${recording ? "on" : ""}`}>{recording ? <Square fill="currentColor" /> : <Mic />}</button>
            <button disabled={!takes.length || recording} onClick={() => takes[0] && playTake(takes[0])} className="round secondary">{takes[0] && playingId === takes[0].id ? <Square /> : <Play />}</button>
          </div>
          <div className="labels"><span>{paused ? "RESUME" : "PAUSE"}</span><span>{recording ? "STOP" : "RECORD"}</span><span>PLAY</span></div>
          {error && <div className="error">{error}</div>}
        </main>

        <section className="library">
          <div className="libraryHead"><span>RECORDED TAKES</span><b>{String(takes.length).padStart(2, "0")}</b></div>
          {!takes.length ? <div className="empty hud">No recordings yet. Press RECORD to create your first take.</div> : takes.map((take) => (
            <article className="take hud" key={take.id}>
              <button onClick={() => playTake(take)} className="takePlay">{playingId === take.id ? <Square size={14} /> : <Play size={15} />}</button>
              <div className="takeInfo"><b>{take.name}</b><small>{formatTime(take.duration)}</small></div>
              <div className="actions">
                <button title="Funny voice" onClick={() => playTake(take, PRESETS[1].rate)}><Sparkles size={16} /></button>
                <button onClick={() => downloadTake(take)}><Download size={16} /></button>
                <button onClick={() => deleteTake(take)}><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </section>

        <footer>RECORDINGS STAY ON THIS DEVICE · NOTHING UPLOADS · NOTHING SYNCS</footer>
      </div>
    </div>
  );
}
