import assert from "node:assert/strict";
import test from "node:test";
import { extensionFor, formatTime, microphoneConstraints, preferredMime, recorderOptions } from "./audioUtils.js";

test("formatTime normalizes invalid values and formats hours", () => {
  assert.equal(formatTime(-1), "00:00:00");
  assert.equal(formatTime(Number.NaN), "00:00:00");
  assert.equal(formatTime(3661.9), "01:01:01");
});

test("extensionFor maps supported MIME containers", () => {
  assert.equal(extensionFor("audio/mp4"), "m4a");
  assert.equal(extensionFor("audio/ogg;codecs=opus"), "ogg");
  assert.equal(extensionFor("audio/webm"), "webm");
});

test("preferredMime chooses the first supported candidate", () => {
  const recorder = { isTypeSupported: (type) => type === "audio/mp4" };
  assert.equal(preferredMime(recorder), "audio/mp4");
  assert.equal(preferredMime(undefined), "");
});

test("microphoneConstraints only requests supported capabilities", () => {
  const supported = { echoCancellation: true, channelCount: true, sampleRate: true };
  assert.deepEqual(microphoneConstraints(supported, "high"), {
    audio: { echoCancellation: true, channelCount: 1, sampleRate: { ideal: 48000 } },
  });
  assert.deepEqual(microphoneConstraints({}, "standard"), { audio: {} });
});

test("recorderOptions chooses MIME and quality bitrate", () => {
  const recorder = { isTypeSupported: (type) => type === "audio/webm;codecs=opus" };
  assert.deepEqual(recorderOptions(recorder, "standard"), { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 128000 });
  assert.deepEqual(recorderOptions(recorder, "high"), { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 192000 });
});
