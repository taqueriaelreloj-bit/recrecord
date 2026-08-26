import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Download, HardDrive, Mic, Pause, Play, Settings, Sparkles, Square, Trash2 } from "lucide-react";
import { extensionFor, formatTime, preferredMime } from "./audioUtils.js";
import { deleteStoredTake, loadStoredTakes, saveStoredTake } from "./recordingStore.js";

const PRESETS = [
  { id: "normal", label: "Normal", effect: "normal" },
  { id: "chipmunk", label: "Ardilla", effect: "chipmunk" },
  { id: "deep", label: "Grave", effect: "deep" },
  { id: "robot", label: "Robot", effect: "robot" },
  { id: "radio", label: "Radio", effect: "radio" },
  { id: "echo", label: "Eco", effect: "echo" },
];

function Waveform({ bars, active }) {
  return <div className={`wave ${active ? "active" : ""}`}>{bars.map((value, index) => <i key={index} style={{ height: `${Math.max(5, value * 42)}px` }} />)}</div>;
}

function makeDistortionCurve(amount = 35) {
  const samples = 22050;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presetId, setPresetId] = useState("normal");

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);
  const recordingLiveRef = useRef(false);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const elapsedRef = useRef(0);
  const playbackCtxRef = useRef(null);
  const playbackSourceRef = useRef(null);
  const takesRef = useRef([]);

  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);
  useEffect(() => { takesRef.current = takes; }, [takes]);

  useEffect(() => {
    let cancelled = false;
    loadStoredTakes().then((storedTakes) => {
      if (cancelled) return;
      const hydrated = storedTakes.sort((a, b) => b.id - a.id).map((take) => ({ ...take, url: URL.createObjectURL(take.blob) }));
      setTakes((current) => {
        const currentIds = new Set(current.map((take) => take.id));
        return [...current, ...hydrated.filter((take) => !currentIds.has(take.id))].sort((a, b) => b.id - a.id);
      });
    }).catch(() => { if (!cancelled) setError("No pude abrir la biblioteca local. Las nuevas grabaciones durarán hasta que cierres esta pestaña."); });
    return () => { cancelled = true; };
  }, []);

  const stopVisualizer = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (ctxRef.current) ctxRef.current.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
  }, []);

  const tick = useCallback(function animate() {
    const analyser = analyserRef.current;
    if (!analyser || !recordingLiveRef.current) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) { const v = (sample - 128) / 128; sum += v * v; }
    const value = Math.min(1, Math.sqrt(sum / data.length) * 4.2);
    setLevel(value);
    setBars((prev) => [...prev.slice(-41), value]);
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  const stopPlayback = useCallback(() => {
    try { playbackSourceRef.current?.stop(); } catch {}
    playbackSourceRef.current = null;
    if (playbackCtxRef.current) playbackCtxRef.current.close().catch(() => {});
    playbackCtxRef.current = null;
    setPlayingId(null);
  }, []);

  const playTake = async (take, effect = "normal") => {
    if (playingId === take.id) { stopPlayback(); return; }
    stopPlayback();
    setError("");
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error("Web Audio unavailable");
      const ctx = new AudioContext();
      playbackCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const bytes = await take.blob.arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      playbackSourceRef.current = source;

      let tail = source;
      if (effect === "chipmunk") {
        const high = ctx.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 1500; high.gain.value = 12;
        const thin = ctx.createBiquadFilter(); thin.type = "highpass"; thin.frequency.value = 180;
        tail.connect(thin); thin.connect(high); tail = high;
      } else if (effect === "deep") {
        const bass = ctx.createBiquadFilter(); bass.type = "lowshelf"; bass.frequency.value = 280; bass.gain.value = 14;
        const warm = ctx.createBiquadFilter(); warm.type = "lowpass"; warm.frequency.value = 2600; warm.Q.value = 0.7;
        tail.connect(bass); bass.connect(warm); tail = warm;
      } else if (effect === "robot") {
        const shaper = ctx.createWaveShaper(); shaper.curve = makeDistortionCurve(65); shaper.oversample = "4x";
        const band = ctx.createBiquadFilter(); band.type = "bandpass"; band.frequency.value = 1100; band.Q.value = 1.4;
        tail.connect(shaper); shaper.connect(band); tail = band;
      } else if (effect === "radio") {
        const high = ctx.createBiquadFilter(); high.type = "highpass"; high.frequency.value = 500;
        const low = ctx.createBiquadFilter(); low.type = "lowpass"; low.frequency.value = 2800;
        const shaper = ctx.createWaveShaper(); shaper.curve = makeDistortionCurve(18);
        tail.connect(high); high.connect(low); low.connect(shaper); tail = shaper;
      } else if (effect === "echo") {
        const dry = ctx.createGain(); dry.gain.value = 0.85;
        const delay = ctx.createDelay(1); delay.delayTime.value = 0.22;
        const feedback = ctx.createGain(); feedback.gain.value = 0.32;
        source.connect(dry); dry.connect(ctx.destination);
        source.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(ctx.destination);
        tail = null;
      }
      if (tail) tail.connect(ctx.destination);
      source.onended = () => {
        if (playbackSourceRef.current === source) {
          playbackSourceRef.current = null;
          playbackCtxRef.current = null;
          setPlayingId(null);
          ctx.close().catch(() => {});
        }
      };
      setPlayingId(take.id);
      source.start();
    } catch (err) {
      stopPlayback();
      setError("No pude reproducir esta grabación en el teléfono. Prueba una grabación nueva después de actualizar la app.");
    }
  };

  const startRecording = async () => {
    setError(""); stopPlayback();
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !(window.AudioContext || window.webkitAudioContext)) throw new Error("Recording is not supported in this browser.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512; source.connect(analyser);
      ctxRef.current = ctx; analyserRef.current = analyser;
      const mimeType = preferredMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder; chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data?.size && chunksRef.current.push(e.data);
      recorder.onerror = () => { setError("La grabación se interrumpió por un error del dispositivo de audio."); stopRecording(); };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size) {
          const take = { id: Date.now(), name: `Take ${String(takesRef.current.length + 1).padStart(2, "0")}`, duration: elapsedRef.current, type, blob, url: URL.createObjectURL(blob) };
          setTakes((prev) => [take, ...prev]);
          saveStoredTake(take).catch(() => setError("La grabación funciona, pero no pude guardarla para la próxima sesión."));
        }
        stream.getTracks().forEach((track) => track.stop());
        stopVisualizer();
      };
      pausedTotalRef.current = 0; pausedAtRef.current = 0; startedAtRef.current = performance.now(); elapsedRef.current = 0;
      setElapsed(0); setBars(Array(42).fill(0.08));
      recorder.start(250); recordingLiveRef.current = true; setRecording(true); setPaused(false);
      timerRef.current = setInterval(() => {
        if (!recordingLiveRef.current) return;
        const now = performance.now();
        const livePause = pausedAtRef.current ? now - pausedAtRef.current : 0;
        const value = Math.max(0, (now - startedAtRef.current - pausedTotalRef.current - livePause) / 1000);
        elapsedRef.current = value; setElapsed(value);
      }, 100);
      tick();
    } catch (err) {
      recordingLiveRef.current = false;
      stream?.getTracks().forEach((track) => track.stop()); stopVisualizer();
      const unsupported = err?.message?.includes("not supported");
      setError(unsupported ? "Este navegador no admite grabación de audio. Prueba una versión reciente de Chrome, Edge, Firefox o Safari." : "No pude acceder al micrófono. Revisa el permiso del navegador e inténtalo otra vez.");
    }
  };

  const stopRecording = () => {
    if (!recordingLiveRef.current && recorderRef.current?.state === "inactive") return;
    const now = performance.now();
    const livePause = pausedAtRef.current ? now - pausedAtRef.current : 0;
    const finalElapsed = startedAtRef.current ? Math.max(0, (now - startedAtRef.current - pausedTotalRef.current - livePause) / 1000) : elapsedRef.current;
    recordingLiveRef.current = false;
    clearInterval(timerRef.current); timerRef.current = null;
    elapsedRef.current = finalElapsed; setElapsed(finalElapsed);
    setRecording(false); setPaused(false); setLevel(0); pausedAtRef.current = 0;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.requestData(); } catch {}
      try { recorder.stop(); } catch {}
    }
  };

  const togglePause = () => {
    const recorder = recorderRef.current; if (!recorder) return;
    if (recorder.state === "recording") { recorder.pause(); pausedAtRef.current = performance.now(); setPaused(true); }
    else if (recorder.state === "paused") { recorder.resume(); pausedTotalRef.current += performance.now() - pausedAtRef.current; pausedAtRef.current = 0; setPaused(false); }
  };

  const downloadTake = (take) => { const link = document.createElement("a"); link.href = take.url; link.download = `${take.name}.${extensionFor(take.type)}`; link.click(); };
  const deleteTake = (take) => { if (playingId === take.id) stopPlayback(); URL.revokeObjectURL(take.url); setTakes((prev) => prev.filter((item) => item.id !== take.id)); deleteStoredTake(take.id).catch(() => setError("Eliminé la grabación de esta sesión, pero no pude actualizar la biblioteca local.")); };

  useEffect(() => () => {
    recordingLiveRef.current = false; clearInterval(timerRef.current); stopVisualizer(); stopPlayback();
    streamRef.current?.getTracks().forEach((track) => track.stop()); takesRef.current.forEach((take) => URL.revokeObjectURL(take.url));
  }, [stopVisualizer, stopPlayback]);

  const percent = Math.round(level * 100);
  const selectedPreset = PRESETS.find((preset) => preset.id === presetId) ?? PRESETS[0];

  return <div className="app"><div className="scanlines" /><div className="shell">
    <header><div><div className="brand">REC<span>●</span>RECORD</div><div className="subtitle">SMART VOICE RECORDER</div></div><button className="icon" type="button" aria-label="Abrir ajustes de reproducción" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><Settings size={20} /></button></header>
    {settingsOpen && <section className="settings hud" aria-label="Efectos de voz"><span>EFECTO DE VOZ</span><div>{PRESETS.map((preset) => <button type="button" className={preset.id === presetId ? "selected" : ""} aria-pressed={preset.id === presetId} onClick={() => setPresetId(preset.id)} key={preset.id}>{preset.label}</button>)}</div></section>}
    <section className="stats hud"><div><Activity size={17} /><small>WAVEFORM</small><b>{recording && !paused ? "LIVE" : "READY"}</b></div><div><Mic size={17} /><small>MIC LEVEL</small><b>{percent}%</b></div><div><HardDrive size={17} /><small>STORAGE</small><b>LOCAL</b></div></section>
    <main className="console hud"><div className="reels"><div className={`reel ${recording && !paused ? "spin" : ""}`} /><Waveform bars={bars} active={recording && !paused} /><div className={`reel ${recording && !paused ? "spin" : ""}`} /></div>
      <div className={`meter ${recording ? "live" : ""}`} style={{ "--meter": `${Math.max(8, percent * 2.7)}deg` }}><div className="meterCore"><small>RECORDING TIME</small><strong>{formatTime(elapsed)}</strong><em>{paused ? "PAUSED" : recording ? `MIC ${percent}%` : "STANDBY"}</em></div></div>
      <div className="controls"><button type="button" aria-label={paused ? "Reanudar grabación" : "Pausar grabación"} disabled={!recording} onClick={togglePause} className="round secondary">{paused ? <Play /> : <Pause />}</button><button type="button" aria-label={recording ? "Detener grabación" : "Iniciar grabación"} onClick={recording ? stopRecording : startRecording} className={`round record ${recording ? "on" : ""}`}>{recording ? <Square fill="currentColor" /> : <Mic />}</button><button type="button" aria-label="Reproducir grabación más reciente" disabled={!takes.length || recording} onClick={() => takes[0] && playTake(takes[0], selectedPreset.effect)} className="round secondary">{takes[0] && playingId === takes[0].id ? <Square /> : <Play />}</button></div>
      <div className="labels"><span>{paused ? "RESUME" : "PAUSE"}</span><span>{recording ? "STOP" : "RECORD"}</span><span>PLAY</span></div>{error && <div className="error" role="alert">{error}</div>}
    </main>
    <section className="library"><div className="libraryHead"><span>RECORDED TAKES</span><b>{String(takes.length).padStart(2, "0")}</b></div>{!takes.length ? <div className="empty hud">No recordings yet. Press RECORD to create your first take.</div> : takes.map((take) => <article className="take hud" key={take.id}><button type="button" aria-label={`${playingId === take.id ? "Detener" : "Reproducir"} ${take.name}`} onClick={() => playTake(take, selectedPreset.effect)} className="takePlay">{playingId === take.id ? <Square size={14} /> : <Play size={15} />}</button><div className="takeInfo"><b>{take.name}</b><small>{formatTime(take.duration)}</small></div><div className="actions"><button type="button" title="Efecto de voz" aria-label={`Reproducir ${take.name} con efecto de voz`} onClick={() => playTake(take, selectedPreset.effect)}><Sparkles size={16} /></button><button type="button" title="Descargar" aria-label={`Descargar ${take.name}`} onClick={() => downloadTake(take)}><Download size={16} /></button><button type="button" title="Eliminar" aria-label={`Eliminar ${take.name}`} onClick={() => deleteTake(take)}><Trash2 size={16} /></button></div></article>)}</section>
    <footer>RECORDINGS STAY ON THIS DEVICE · NOTHING UPLOADS · NOTHING SYNCS</footer>
  </div></div>;
}
