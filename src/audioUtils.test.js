import assert from "node:assert/strict";
import test from "node:test";
import { extensionFor, formatTime, preferredMime } from "./audioUtils.js";

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
