/* global AudioWorkletProcessor, registerProcessor */
class GentleNoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.envelope = 0;
    this.gain = 1;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input.length) return true;
    for (let channel = 0; channel < output.length; channel += 1) {
      const source = input[Math.min(channel, input.length - 1)];
      const target = output[channel];
      for (let i = 0; i < target.length; i += 1) {
        const level = Math.abs(source[i] || 0);
        this.envelope = Math.max(level, this.envelope * 0.995);
        const desired = this.envelope < 0.006 ? 0.42 : 1;
        const coefficient = desired > this.gain ? 0.12 : 0.0025;
        this.gain += (desired - this.gain) * coefficient;
        target[i] = (source[i] || 0) * this.gain;
      }
    }
    return true;
  }
}

registerProcessor("gentle-noise-gate", GentleNoiseGateProcessor);
