// La Vega 3D — sound (round 7 re-author).
//
// Everything is synthesised with Web Audio: no audio files, no licensed
// music, no TTS. Three generative radio stations, an engine drone, sea
// ambience, a police siren, and one-shot effects for shooting, cash,
// crashes, punches, reloads, honks, phone pings and NPC barks (short
// Simlish-style mumbles — no words, no voice clips).
//
// The context is created lazily on the first user gesture (unlock()).
// Every method is safe to call before that: it simply does nothing
// until the context exists.
export class AudioSys {
  constructor(settings) {
    this.settings = settings || null;
    this._ctx = null;
    this._master = null;
    this._sfx = null;
    this._music = null;
    this._noiseBuf = null;
    this._muted = false;
    this._stationIdx = 0;
    this._radioTimer = null;
    this._radioStep = 0;
    this._engine = null; // { osc, sub, gain, filter }
    this._sea = null; // { src, gain }
    this._siren = null; // { osc, lfo, gain }
    this._stations = [
      {
        name: 'Neon Tide FM 98.6',
        wave: 'sawtooth', bpm: 112,
        // A minor-key synthwave loop (A minor): bass roots + arp notes.
        bass: [55, 55, 65.41, 49],
        arp: [220, 261.63, 329.63, 440, 329.63, 261.63, 196, 164.81],
      },
      {
        name: 'Mango Radio 101',
        wave: 'square', bpm: 96,
        bass: [41.2, 49, 55, 43.65],
        arp: [164.81, 196, 246.94, 196, 164.81, 146.83, 130.81, 196],
      },
      {
        name: 'Static Dub 88.1',
        wave: 'triangle', bpm: 80,
        bass: [36.71, 36.71, 43.65, 41.2],
        arp: [110, 130.81, 164.81, 130.81, 110, 98, 87.31, 98],
      },
    ];
  }

  // -- lifecycle ------------------------------------------------------------
  get stationIdx() {
    return this._stationIdx;
  }
  set stationIdx(i) {
    const n = this._stations.length;
    this._stationIdx = ((i % n) + n) % n;
    this._radioStep = 0;
  }

  unlock() {
    if (!this._ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this._ctx = new AC();
        this._master = this._ctx.createGain();
        this._master.gain.value = this._muted ? 0 : 0.9;
        this._master.connect(this._ctx.destination);
        this._sfx = this._ctx.createGain();
        this._sfx.gain.value = this._sfxOn() ? 0.9 : 0;
        this._sfx.connect(this._master);
        this._music = this._ctx.createGain();
        this._music.gain.value = this._musicOn() ? 0.5 : 0;
        this._music.connect(this._master);
        const len = this._ctx.sampleRate;
        this._noiseBuf = this._ctx.createBuffer(1, len, this._ctx.sampleRate);
        const data = this._noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      } catch (e) {
        this._ctx = null;
      }
    }
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
    if (this._ctx && this._musicOn() && !this._radioTimer) this._startRadio();
  }

  setMuted(m) {
    this._muted = !!m;
    if (this._master && this._ctx) {
      this._master.gain.setTargetAtTime(this._muted ? 0 : 0.9, this._ctx.currentTime, 0.05);
    }
  }

  _sfxOn() {
    return !this.settings || this.settings.get('sfx') !== false;
  }
  _musicOn() {
    return !this.settings || this.settings.get('music') !== false;
  }

  // -- primitives -----------------------------------------------------------
  // A short oscillator blip with an exponential decay envelope.
  _tone(freq, dur, type = 'sine', vol = 0.2, freqEnd = null, when = 0) {
    if (!this._ctx || !this._sfx) return;
    const t0 = this._ctx.currentTime + when;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this._sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // A burst of filtered noise (impacts, shots, surf).
  _noise(dur, vol = 0.2, filterFreq = 1200, type = 'lowpass', when = 0) {
    if (!this._ctx || !this._sfx || !this._noiseBuf) return;
    const t0 = this._ctx.currentTime + when;
    const src = this._ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filter = this._ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this._ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this._sfx);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // -- one-shot effects ------------------------------------------------------
  shoot() {
    this._noise(0.09, 0.5, 2400, 'highpass');
    this._tone(190, 0.1, 'square', 0.22, 55);
  }
  dryFire() {
    this._tone(1100, 0.04, 'square', 0.12);
  }
  reload() {
    this._tone(1200, 0.05, 'square', 0.12);
    this._tone(800, 0.05, 'square', 0.12, null, 0.16);
  }
  punch() {
    this._tone(130, 0.12, 'sine', 0.4, 45);
    this._noise(0.08, 0.2, 500);
  }
  crash(amount = 0.5) {
    const v = Math.min(1, 0.25 + amount * 0.6);
    this._noise(0.32, v, 700);
    this._tone(90, 0.28, 'sine', 0.35 * v, 35);
  }
  cash() {
    this._tone(1318, 0.09, 'sine', 0.18);
    this._tone(1760, 0.14, 'sine', 0.18, null, 0.09);
  }
  honk() {
    if (!this._ctx) return;
    this._tone(370, 0.32, 'square', 0.12);
    this._tone(440, 0.32, 'square', 0.12);
  }
  phoneNotify() {
    this._tone(880, 0.14, 'sine', 0.15);
    this._tone(1174, 0.18, 'sine', 0.12, null, 0.14);
  }
  radioBlip() {
    this._tone(660, 0.06, 'sine', 0.12);
  }
  stepDone() {
    this._tone(880, 0.1, 'sine', 0.16);
    this._tone(1318, 0.16, 'sine', 0.16, null, 0.1);
  }
  missionComplete() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.18, null, i * 0.11));
  }
  missionStart() {
    this._tone(392, 0.16, 'triangle', 0.16);
    this._tone(523.25, 0.24, 'triangle', 0.16, null, 0.14);
  }
  // Car alarm: four short tin-tin beeps.
  alarm() {
    for (let i = 0; i < 4; i++) this._tone(1250, 0.09, 'square', 0.14, null, i * 0.16);
  }
  // Stop a ringing alarm. Our alarm() is a one-shot four-beep burst, so
  // there is no loop to kill — this exists so callers can silence it
  // without crashing, and to mark the alarm as off for any later call.
  alarmStop() {
    this._alarmOff = true;
  }
  // Wanted sting: a short dissonant brass stab when the stars go up.
  wantedSting() {
    this._tone(220, 0.5, 'sawtooth', 0.16, 233);
    this._tone(233, 0.5, 'sawtooth', 0.14, 247);
    this._tone(55, 0.5, 'sine', 0.3, 40);
  }
  // Mission failed: three descending notes, low and final.
  missionFail() {
    const notes = [329.63, 261.63, 196];
    notes.forEach((f, i) => this._tone(f, 0.26, 'triangle', 0.18, null, i * 0.16));
  }
  // Busted: a low descending slide and a dull thud — the cuffs click.
  busted() {
    this._tone(220, 0.6, 'sawtooth', 0.16, 110);
    this._tone(110, 0.5, 'sine', 0.3, 55);
    this._noise(0.2, 0.25, 300);
  }
  // NPC bark: a few short pitch-wobbling mumbles (no words, no TTS).
  bark(kind = 'greet') {
    if (!this._ctx || !this._sfx) return;
    const n = kind === 'shout' ? 5 : 3;
    const base = kind === 'shout' ? 320 : 240;
    for (let i = 0; i < n; i++) {
      const f = base + Math.random() * 140;
      const t0 = this._ctx.currentTime + i * 0.11;
      const osc = this._ctx.createOscillator();
      const filter = this._ctx.createBiquadFilter();
      const gain = this._ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t0);
      osc.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.5), t0 + 0.09);
      filter.type = 'bandpass';
      filter.frequency.value = 900;
      gain.gain.setValueAtTime(kind === 'shout' ? 0.2 : 0.12, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this._sfx);
      osc.start(t0);
      osc.stop(t0 + 0.12);
    }
  }

  // -- radio -----------------------------------------------------------------
  // A tiny step sequencer: every eighth-note step plays the station's bass
  // root and one arpeggio note through the music bus. It starts on the
  // first unlock() and keeps time with setInterval; switching stations
  // just resets the step counter.
  _startRadio() {
    if (this._radioTimer || !this._ctx) return;
    const stepMs = () => 60000 / this._stations[this._stationIdx].bpm / 2;
    this._radioTimer = setInterval(() => {
      if (!this._ctx || this._ctx.state !== 'running' || !this._musicOn()) return;
      const st = this._stations[this._stationIdx];
      const i = this._radioStep++;
      const t0 = this._ctx.currentTime;
      const bass = st.bass[Math.floor(i / 2) % st.bass.length];
      const arp = st.arp[i % st.arp.length];
      // Bass on every second step, arp on every step.
      if (i % 2 === 0) this._radioTone(bass, 0.42, 'triangle', 0.16, t0);
      this._radioTone(arp, 0.2, st.wave, 0.05, t0);
    }, stepMs());
  }

  _radioTone(freq, dur, type, vol, t0) {
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this._music);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  nextStation() {
    this.stationIdx = this._stationIdx + 1;
    return this._stations[this._stationIdx].name;
  }

  // -- continuous layers -----------------------------------------------------
  // Engine drone: a sawtooth + sub sine through a lowpass, pitched and
  // levelled by speed. Called every frame; fades to silence on foot.
  engine(level = 0, hasCar = false) {
    if (!this._ctx) return;
    if (!this._engine) {
      const osc = this._ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const sub = this._ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 32;
      const filter = this._ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = this._ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(this._sfx);
      osc.start();
      sub.start();
      this._engine = { osc, sub, gain, filter };
    }
    const t = this._ctx.currentTime;
    const target = hasCar ? 0.05 + level * 0.1 : 0;
    this._engine.gain.gain.setTargetAtTime(target, t, 0.12);
    const f = 55 + level * 150;
    this._engine.osc.frequency.setTargetAtTime(f, t, 0.08);
    this._engine.sub.frequency.setTargetAtTime(f / 2, t, 0.08);
    this._engine.filter.frequency.setTargetAtTime(320 + level * 900, t, 0.1);
  }

  // Sea ambience: looped filtered noise, louder near the shore.
  // `v` is 0 (inland) to 1 (ankle-deep). Called with ?. by the game.
  setSeaLevel(v = 0) {
    if (!this._ctx || !this._noiseBuf) return;
    if (!this._sea) {
      const src = this._ctx.createBufferSource();
      src.buffer = this._noiseBuf;
      src.loop = true;
      const filter = this._ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = this._ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this._music);
      src.start();
      this._sea = { src, gain };
    }
    const target = Math.max(0, Math.min(1, v)) * 0.16;
    this._sea.gain.gain.setTargetAtTime(target, this._ctx.currentTime, 0.4);
  }

  // Police siren: a wailing two-tone loop (oscillator + slow LFO on its
  // pitch). on = true starts it, false stops it.
  siren(on) {
    if (!this._ctx) return;
    if (on && !this._siren) {
      const osc = this._ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 780;
      const lfo = this._ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.45;
      const lfoGain = this._ctx.createGain();
      lfoGain.gain.value = 190;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const gain = this._ctx.createGain();
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(this._sfx);
      osc.start();
      lfo.start();
      this._siren = { osc, lfo, gain };
    } else if (!on && this._siren) {
      const s = this._siren;
      this._siren = null;
      try {
        s.gain.gain.setTargetAtTime(0, this._ctx.currentTime, 0.05);
        s.osc.stop(this._ctx.currentTime + 0.3);
        s.lfo.stop(this._ctx.currentTime + 0.3);
      } catch (e) { /* already stopped */ }
    }
  }
}
