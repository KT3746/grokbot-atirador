// Sons sintetizados com WebAudio (nenhum arquivo externo)
export class Sfx {
  constructor() { this.ctx = null; this.vol = 0.8; this.windGain = null; this.env = 'cidade'; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    // ruido base
    const len = c.sampleRate * 2; this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // reverb com impulso gerado
    this.rev = c.createConvolver(); this.rev.buffer = this.impulse(3.2, 2.6);
    this.revGain = c.createGain(); this.revGain.gain.value = 0.55; this.rev.connect(this.revGain); this.revGain.connect(this.master);
    // eco distante (montanha, predios)
    this.echo = c.createDelay(3); this.echo.delayTime.value = 0.55;
    this.echoFb = c.createGain(); this.echoFb.gain.value = 0.38;
    this.echoLp = c.createBiquadFilter(); this.echoLp.type = 'lowpass'; this.echoLp.frequency.value = 900;
    this.echoOut = c.createGain(); this.echoOut.gain.value = 0.5;
    this.echo.connect(this.echoLp); this.echoLp.connect(this.echoFb); this.echoFb.connect(this.echo); this.echoLp.connect(this.echoOut); this.echoOut.connect(this.master);
    this.startWind();
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  setEnv(env) {
    this.env = env; if (!this.ctx) return;
    const e = { cidade: [0.42, 0.35, 0.45], montanha: [0.9, 0.5, 0.6], deserto: [0.3, 0.2, 0.25] }[env] || [0.5, 0.3, 0.4];
    this.echo.delayTime.value = e[0]; this.echoFb.gain.value = e[1]; this.echoOut.gain.value = e[2];
  }
  impulse(sec, decay) {
    const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  src(rate = 1, offset = Math.random()) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = rate; s._off = offset; return s; }
  env1(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  noiseHit({ type = 'lowpass', freq = 1000, q = 0.7, peak = 0.5, a = 0.002, dec = 0.2, rate = 1, delay = 0, wet = 0, echo = 0, sweep = 0 } = {}) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay;
    const s = this.src(rate), f = c.createBiquadFilter(), g = c.createGain();
    f.type = type; f.frequency.setValueAtTime(freq, t); if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + a + dec); f.Q.value = q;
    s.connect(f); f.connect(g); g.connect(this.master);
    if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.rev); }
    if (echo) { const w = c.createGain(); w.gain.value = echo; g.connect(w); w.connect(this.echo); }
    this.env1(g, t, a, peak, dec); s.start(t, s._off); s.stop(t + a + dec + 0.05);
  }
  tone({ type = 'sine', f0 = 440, f1 = null, peak = 0.3, a = 0.003, dec = 0.15, delay = 0, wet = 0 } = {}) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + dec);
    o.connect(g); g.connect(this.master); if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.rev); }
    this.env1(g, t, a, peak, dec); o.start(t); o.stop(t + a + dec + 0.05);
  }
  shot(heavy = 1) {
    if (!this.ctx) return;
    // estalo supersonico
    this.noiseHit({ type: 'highpass', freq: 1500, peak: 0.9, a: 0.001, dec: 0.09, rate: 1.4, wet: 0.3 });
    // corpo do disparo
    this.noiseHit({ type: 'lowpass', freq: 1800, sweep: 300, peak: 1.0, a: 0.002, dec: 0.45 * heavy, wet: 0.9, echo: 0.8 });
    this.tone({ type: 'sine', f0: 90, f1: 32, peak: 0.9, a: 0.002, dec: 0.4 * heavy, wet: 0.4 });
    // cauda distante
    this.noiseHit({ type: 'lowpass', freq: 500, peak: 0.35, a: 0.05, dec: 1.4, delay: 0.08, wet: 0.6, echo: 0.6 });
  }
  impact(kind, dist = 100) {
    const k = Math.max(0.15, 1 - dist / 900), d = Math.min(1.2, dist / 340);
    if (kind === 'body') { this.tone({ f0: 140, f1: 60, peak: 0.5 * k, dec: 0.12, delay: d }); this.noiseHit({ freq: 700, peak: 0.4 * k, dec: 0.08, delay: d }); }
    else if (kind === 'metal') { this.tone({ type: 'triangle', f0: 2600, f1: 1800, peak: 0.25 * k, dec: 0.35, delay: d, wet: 0.5 }); this.tone({ type: 'sine', f0: 3900, peak: 0.15 * k, dec: 0.25, delay: d }); this.noiseHit({ type: 'highpass', freq: 3000, peak: 0.25 * k, dec: 0.05, delay: d }); }
    else { this.noiseHit({ type: 'bandpass', freq: 900, q: 0.8, peak: 0.5 * k, dec: 0.18, delay: d, wet: 0.3 }); this.tone({ type: 'sine', f0: 1800 + Math.random() * 900, f1: 500, peak: 0.08 * k, dec: 0.4, delay: d + 0.02 }); }
  }
  bolt(delay = 0) {
    this.noiseHit({ type: 'bandpass', freq: 3200, q: 3, peak: 0.35, dec: 0.04, delay });
    this.noiseHit({ type: 'bandpass', freq: 1800, q: 1.5, peak: 0.25, a: 0.03, dec: 0.12, delay: delay + 0.12 });
    this.noiseHit({ type: 'bandpass', freq: 2600, q: 3, peak: 0.4, dec: 0.05, delay: delay + 0.32 });
    this.shell(delay + 0.5);
  }
  shell(delay = 0) { [0, 0.13, 0.22].forEach((o, i) => this.tone({ type: 'sine', f0: 5200 - i * 400, peak: 0.12 / (i + 1), dec: 0.08, delay: delay + o })); }
  reload() {
    this.noiseHit({ type: 'bandpass', freq: 1400, q: 2, peak: 0.4, dec: 0.06, delay: 0.1 });
    this.tone({ type: 'square', f0: 220, f1: 120, peak: 0.08, dec: 0.05, delay: 0.12 });
    this.noiseHit({ type: 'bandpass', freq: 900, q: 1.2, peak: 0.5, dec: 0.1, delay: 1.0 });
    this.tone({ type: 'square', f0: 160, f1: 90, peak: 0.1, dec: 0.06, delay: 1.02 });
    this.bolt(1.6);
  }
  ui() { this.tone({ type: 'triangle', f0: 880, f1: 1320, peak: 0.12, dec: 0.06 }); }
  uiBack() { this.tone({ type: 'triangle', f0: 660, f1: 440, peak: 0.12, dec: 0.07 }); }
  zoom() { this.noiseHit({ type: 'bandpass', freq: 2400, q: 4, peak: 0.12, dec: 0.05 }); this.tone({ type: 'sine', f0: 1200, peak: 0.04, dec: 0.04 }); }
  empty() { this.noiseHit({ type: 'bandpass', freq: 2800, q: 5, peak: 0.3, dec: 0.03 }); }
  alert() { this.tone({ type: 'square', f0: 660, peak: 0.08, dec: 0.12 }); this.tone({ type: 'square', f0: 880, peak: 0.08, dec: 0.15, delay: 0.15 }); }
  heart() { this.tone({ f0: 60, f1: 40, peak: 0.35, dec: 0.12 }); this.tone({ f0: 55, f1: 38, peak: 0.25, dec: 0.12, delay: 0.18 }); }
  whoosh() { this.noiseHit({ type: 'bandpass', freq: 300, sweep: 2000, q: 1, peak: 0.5, a: 0.3, dec: 1.6, wet: 0.5 }); this.tone({ f0: 50, f1: 30, peak: 0.4, a: 0.2, dec: 1.8, wet: 0.5 }); }
  star(i = 0) { this.tone({ type: 'triangle', f0: 880 * Math.pow(1.26, i), peak: 0.18, dec: 0.4, wet: 0.5 }); this.tone({ type: 'sine', f0: 1760 * Math.pow(1.26, i), peak: 0.06, dec: 0.5 }); }
  fail() { this.tone({ type: 'sawtooth', f0: 300, f1: 110, peak: 0.12, dec: 0.8, wet: 0.4 }); }
  startWind() {
    const c = this.ctx, s = this.src(0.5); s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.5;
    const g = c.createGain(); g.gain.value = 0; this.windGain = g; this.windF = f;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
  }
  nvOn() { if (!this.ctx) return; this.tone({ type: 'sine', f0: 1800, f1: 7800, peak: 0.05, a: 0.05, dec: 0.55 }); this.noiseHit({ type: 'highpass', freq: 5000, peak: 0.05, a: 0.1, dec: 0.4 }); }
  setRain(level) {
    if (!this.ctx) return;
    if (!this.rainGain) { if (!level) return; const c = this.ctx, s = this.src(1); s.loop = true; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400; const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 7000;
      const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(f2); f2.connect(g); g.connect(this.master); s.start(); this.rainGain = g; }
    const tgt = level ? 0.11 : 0; if (this.rainLvl !== tgt) { this.rainLvl = tgt; this.rainGain.gain.setTargetAtTime(tgt, this.ctx.currentTime, 0.5); }
  }
  setWind(level, t) {
    if (!this.windGain) return;
    const gust = 0.6 + 0.4 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1);
    this.windGain.gain.setTargetAtTime(Math.min(0.35, 0.03 + level * 0.035) * gust, this.ctx.currentTime, 0.3);
    this.windF.frequency.setTargetAtTime(300 + level * 60 * gust, this.ctx.currentTime, 0.3);
  }
}
export const sfx = new Sfx();
