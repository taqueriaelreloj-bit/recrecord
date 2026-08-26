export function formatTime(seconds = 0) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function preferredMime(MediaRecorderApi = globalThis.MediaRecorder) {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorderApi?.isTypeSupported?.(type)) || "";
}

export function microphoneConstraints(supported = {}, quality = "standard") {
  const audio = {};
  const add = (name, value) => { if (supported[name]) audio[name] = value; };
  add("echoCancellation", true);
  add("noiseSuppression", true);
  add("autoGainControl", true);
  add("channelCount", 1);
  if (quality === "high") {
    add("sampleRate", { ideal: 48000 });
    add("sampleSize", { ideal: 16 });
  }
  return { audio };
}

export function recorderOptions(MediaRecorderApi = globalThis.MediaRecorder, quality = "standard") {
  const mimeType = preferredMime(MediaRecorderApi);
  return {
    ...(mimeType ? { mimeType } : {}),
    audioBitsPerSecond: quality === "high" ? 192000 : 128000,
  };
}

export function extensionFor(type = "") {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  return "webm";
}
