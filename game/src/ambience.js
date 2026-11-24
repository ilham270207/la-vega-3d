// ambience.js — La Vega city sounds (round 12).
// Everything here is synthesized with the Web Audio API: car horns,
// traffic engine hum and a street noise bed. No audio files, no
// copyrighted material. Counters are exposed so the playtest can prove
// the system actually runs headlessly.
export class AmbienceSys {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.master = null;
    this.bedGain = null;
    this.humGain = null;
    this.unlocked = false;
    this.honks = 0;
    this.lastHonkAt = 0;
    this.nextHonkIn = 5;
    this.nearbyTraffic = 0;
    this.engineLevel = 0;
    this._blockHonkT = 0;
    this._time = 0;
  }

  unlock() {
    if (this.unlocked) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._startBed();
      this._startHum();
      this.unlocked = true;
      return true;
    } catch (e) {
      this.ctx = null;
      return false;
    }
  }

  _noiseBuffer(seconds = 2) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buf;
  }

  _startBed() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(3);
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 320;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.05;
    src.connect(filt);
    filt.connect(this.bedGain);
    this.bedGain.connect(this.master);
    src.start();
  }

  _startHum() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 220;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    osc.connect(filt);
    filt.connect(this.humGain);
    this.humGain.connect(this.master);
    osc.start();
  }

  // A two-tone car horn (370 + 466 Hz sawtooths, fast attack, short decay).
  honk(pan = 0, dur = 0.45) {
    this.honks += 1;
    this.lastHonkAt = this._time;
    if (!this.ctx || !this.unlocked) return;
    try {
      const ctx = this.ctx;
      const t0 = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03);
      out.gain.setValueAtTime(0.22, t0 + Math.max(0.05, dur - 0.12));
      out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 1400;
      let dest = this.master;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
        out.connect(filt);
        filt.connect(p);
        p.connect(this.master);
        dest = null;
      } else {
        out.connect(filt);
        filt.connect(this.master);
      }
      void dest;
      for (const f of [370, 466]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(out);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
      }
    } catch (e) {
      // Audio must never break the game.
    }
  }

  // Deterministic hook for the playtest: force one horn now.
  forceHonk() {
    this.honk(0, 0.4);
    return this.honks;
  }

  update(dt) {
    this._time += dt;
    if (this._blockHonkT > 0) this._blockHonkT -= dt;
    const g = this.game;
    const p = g.player;
    if (!p || !g.vehicles) return;
    // Nearby traffic drives the hum level and the random horns.
    let near = 0;
    let nearestSpeed = 0;
    let nearestD = Infinity;
    for (const c of g.vehicles.traffic) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 45) {
        near += 1;
        if (d < nearestD) { nearestD = d; nearestSpeed = Math.abs(c.speed || 0); }
      }
    }
    this.nearbyTraffic = near;
    this.engineLevel = near > 0 ? Math.min(1, nearestSpeed / 28) * Math.max(0, 1 - nearestD / 45) : 0;
    if (this.humGain && this.ctx) {
      this.humGain.gain.setTargetAtTime(this.engineLevel * 0.06, this.ctx.currentTime, 0.2);
    }
    // Random horns from the traffic around the player.
    this.nextHonkIn -= dt;
    if (this.nextHonkIn <= 0) {
      this.nextHonkIn = 6 + Math.random() * 9;
      if (near > 0) this.honk((Math.random() * 2 - 1) * 0.6, 0.35 + Math.random() * 0.3);
    }
    // A traffic car stuck behind the player on the road honks in protest.
    if (this._blockHonkT <= 0) {
      for (const c of g.vehicles.traffic) {
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < 7 && Math.abs(c.speed || 0) < 0.5 && !p.inCar) {
          this.honk(0, 0.5);
          this._blockHonkT = 3;
          break;
        }
      }
    }
  }
}
