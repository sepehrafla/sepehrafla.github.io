/** WebAudio-synthesized only, per the brief -- four rotor tones (detuned
 *  saws, pitch proportional to per-rotor thrust; the brief is explicit
 *  that "this quad-harmonic IS the soundtrack") plus airflow noise
 *  proportional to speed. Milestone 2 scope: proximity ticker and dock
 *  chime are later milestones (no docking yet to chime for). */
export class Sound {
  ctx?: AudioContext;
  master?: GainNode;
  rotors: { osc: OscillatorNode; gain: GainNode }[] = [];
  airflow?: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode };

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.16;
    this.master.connect(this.ctx.destination);

    // Four detuned saws, one per rotor -- slightly offset base frequencies
    // so they beat against each other at rest (the "alive hover" the
    // brief asks for) and pull into a cleaner harmonic as thrust rises.
    const detunes = [-6, -2, 2, 6];
    for (const detune of detunes) {
      const osc = this.ctx.createOscillator(),
        gain = this.ctx.createGain(),
        filter = this.ctx.createBiquadFilter();
      osc.type = "sawtooth";
      osc.frequency.value = 90;
      osc.detune.value = detune;
      filter.type = "lowpass";
      filter.frequency.value = 900;
      gain.gain.value = 0;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start();
      this.rotors.push({ osc, gain });
    }

    // Airflow: filtered looping noise buffer, volume/cutoff track speed.
    const noiseLen = this.ctx.sampleRate * 2,
      buf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate),
      data = buf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 300;
    filter.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    this.airflow = { src, gain, filter };
  }

  /** motorThrust: 0..maxThrustPerMotor per rotor. Call every render frame. */
  updateRotors(motorThrust: number[], maxThrust: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.rotors.length; i++) {
      const level = Math.max(0, Math.min(1, motorThrust[i] / maxThrust)),
        { osc, gain } = this.rotors[i];
      osc.frequency.setTargetAtTime(70 + level * 260, t, 0.05);
      gain.gain.setTargetAtTime(0.02 + level * 0.11, t, 0.08);
    }
  }

  updateAirflow(speed: number) {
    if (!this.ctx || !this.airflow) return;
    const t = this.ctx.currentTime,
      level = Math.min(1, speed / 35);
    this.airflow.gain.gain.setTargetAtTime(level * 0.09, t, 0.15);
    this.airflow.filter.frequency.setTargetAtTime(250 + level * 1400, t, 0.15);
  }

  /** Geiger-style proximity ticker: a short click, called externally at a
   *  rate that scales with closeness to nearby geometry. */
  tick(loudness = 0.12) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = "square";
    o.frequency.value = 1800;
    g.gain.setValueAtTime(loudness, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.03);
  }

  /** Bright ascending chime -- boost ring pass-through. */
  boost() {
    if (!this.ctx || !this.master) return;
    [440, 660, 880].forEach((f, i) => {
      const t0 = this.ctx!.currentTime + i * 0.04,
        o = this.ctx!.createOscillator(),
        g = this.ctx!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, t0);
      g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.connect(g);
      g.connect(this.master!);
      o.start(t0);
      o.stop(t0 + 0.36);
    });
  }
}
