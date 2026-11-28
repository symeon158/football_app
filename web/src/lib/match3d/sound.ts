/**
 * Match sounds, synthesised with the Web Audio API (no audio files): referee whistle, ball
 * kicks, crowd murmur, goal roar, near-miss groan and the "thud" of a save. Browser-only;
 * start() must be called from a user gesture (browsers block audio until then).
 */
import type { SoundCue } from "./director";

export class MatchSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowd: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  start() {
    if (this.ctx || typeof window === "undefined") return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ctx.destination);
    // Two seconds of white noise, reused by every crowd/kick sound.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // Constant crowd murmur.
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 500;
    band.Q.value = 0.6;
    this.crowd = ctx.createGain();
    this.crowd.gain.value = 0.08;
    src.connect(band).connect(this.crowd).connect(this.master);
    src.start();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  stop() {
    void this.ctx?.close();
    this.ctx = null;
  }

  play(cue: SoundCue) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;
    switch (cue) {
      case "whistle":
      case "whistle-long":
        this.whistle(now, cue === "whistle-long" ? 0.9 : 0.35);
        break;
      case "kick":
        this.burst(now, 0.08, 900, 0.5, "lowpass");
        break;
      case "net":
        this.burst(now, 0.25, 300, 0.35, "lowpass");
        break;
      case "save":
        this.burst(now, 0.12, 200, 0.6, "lowpass");
        this.swell(now + 0.05, 1.2, 700, 0.3);
        break;
      case "roar":
        this.swell(now, 3.2, 650, 0.9);
        this.swell(now + 0.1, 2.6, 1400, 0.35);
        break;
      case "groan":
        this.swell(now, 1.4, 350, 0.45);
        break;
    }
  }

  private whistle(t: number, dur: number) {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
    gain.gain.setValueAtTime(0.18, t + dur - 0.05);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    // The pea in the whistle: a fast flutter on the pitch.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 32;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain);
    for (const f of [2900, 3350]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      lfoGain.connect(o.frequency);
      o.connect(gain);
      o.start(t);
      o.stop(t + dur);
    }
    lfo.start(t);
    lfo.stop(t + dur);
    gain.connect(this.master!);
  }

  private burst(t: number, dur: number, freq: number, level: number, type: BiquadFilterType) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private swell(t: number, dur: number, freq: number, level: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + dur * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}
