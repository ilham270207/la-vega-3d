// trailer.js — cinematic in-engine trailer, 6 shots, ~46 s (round 13).
// Written from scratch by Thirteen (round 13, recording 01a20d7f).
// Smooth eased dollies, title cards, skippable. Menu WATCH TRAILER calls
// play(onEnd); skip() ends early. Time of day follows each shot and is
// restored when the trailer ends.
import * as THREE from 'three';
import { clamp } from './twelve-utils.js';

const SHOTS = [
  { title: 'LA VEGA', sub: 'Twelve jobs. One island.', dur: 8, hour: 17.6, from: [260, 45, 40], to: [225, 32, 75], look: [150, 12, 100] },
  { title: 'THE ISLAND', sub: 'Across the water, the light never sleeps.', dur: 8, hour: 17.6, from: [60, 14, 55], to: [30, 10, 90], look: [-120, 12, 130] },
  { title: 'DRIVE', sub: 'Every car. Every street. Yours.', dur: 8, hour: 12, from: [117, 5, 80], to: [117, 7, 120], look: [117, 2, 150] },
  { title: 'HEAT', sub: 'The LVPD is always watching.', dur: 8, hour: 12, from: [150, 10, 150], to: [130, 8, 130], look: [117, 2, 117] },
  { title: 'CREW', sub: 'Four deep. One family.', dur: 7, hour: 17.6, from: 'player', to: 'player', look: 'player' },
  { title: 'NEON NIGHT', sub: 'La Vega after dark.', dur: 7, hour: 21.5, from: [60, 38, 190], to: [90, 25, 175], look: [120, 8, 165] },
];

const TOTAL = SHOTS.reduce((s, x) => s + x.dur, 0);

export class TrailerSystem {
  constructor(ctx) {
    this.ctx = ctx || {};
    this.playing = false;
    this.shotIndex = 0;
    this.shotT = 0;
    this.totalT = 0;
    this._onEnd = null;
    this._savedHour = null;
    this._savedCam = null;
    this._card = null;
    this._cardTitle = null;
    this._cardSub = null;
    this._from = null;
    this._to = null;
    this._look = null;
  }

  _buildCard() {
    const el = document.createElement('div');
    el.className = 'lv-trailer-card hidden';
    el.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:96;text-align:center;pointer-events:none;';
    el.innerHTML = '<div class="lv-trailer-title" style="color:#fff;font:800 44px system-ui,sans-serif;letter-spacing:6px;text-shadow:0 3px 14px rgba(0,0,0,0.9);"></div><div class="lv-trailer-sub" style="color:#f5d76e;font:600 17px system-ui,sans-serif;margin-top:6px;text-shadow:0 2px 8px rgba(0,0,0,0.9);"></div><div style="color:#fff;opacity:0.75;font:500 13px system-ui,sans-serif;margin-top:14px;">ENTER / TAP — SKIP</div>';
    document.body.appendChild(el);
    this._card = el;
    this._cardTitle = el.querySelector('.lv-trailer-title');
    this._cardSub = el.querySelector('.lv-trailer-sub');
  }

  _resolveShot(shot) {
    const player = this.ctx.player;
    const px = player ? player.x : 130;
    const pz = player ? player.z : 130;
    const from = shot.from === 'player' ? [px + 9, 4.5, pz + 9] : shot.from;
    const to = shot.to === 'player' ? [px + 5, 3.5, pz + 5] : shot.to;
    const look = shot.look === 'player' ? [px, 1.4, pz] : shot.look;
    return { from, to, look };
  }

  _startShot(i) {
    const shot = SHOTS[i];
    const r = this._resolveShot(shot);
    this._from = r.from;
    this._to = r.to;
    this._look = r.look;
    if (this._cardTitle) this._cardTitle.textContent = shot.title;
    if (this._cardSub) this._cardSub.textContent = shot.sub;
    const weather = this.ctx.weather;
    if (weather && typeof weather.setTime === 'function') {
      try { weather.setTime(shot.hour); } catch (e) { /* keep current time */ }
    }
  }

  play(onEnd) {
    if (!this._card) this._buildCard();
    if (this.ctx.camera) {
      this._savedCam = this.ctx.camera.position.toArray();
    }
    const weather = this.ctx.weather;
    this._savedHour = weather && typeof weather.time === 'number' ? weather.time : null;
    this.playing = true;
    this.shotIndex = 0;
    this.shotT = 0;
    this.totalT = 0;
    this._onEnd = typeof onEnd === 'function' ? onEnd : null;
    this._card.classList.remove('hidden');
    this._startShot(0);
  }

  skip() {
    if (!this.playing) return;
    this._finish();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    this._restore();
  }

  _restore() {
    if (this._card) this._card.classList.add('hidden');
    const weather = this.ctx.weather;
    if (weather && this._savedHour !== null && typeof weather.setTime === 'function') {
      try { weather.setTime(this._savedHour); } catch (e) { /* ignore */ }
    }
    this._savedHour = null;
  }

  _finish() {
    if (!this.playing) return;
    this.playing = false;
    const cb = this._onEnd;
    this._onEnd = null;
    this._restore();
    if (cb) cb();
  }

  update(dt) {
    if (!this.playing) return;
    const shot = SHOTS[this.shotIndex];
    if (!shot) { this._finish(); return; }
    this.shotT += dt;
    this.totalT += dt;
    const f = clamp(this.shotT / shot.dur, 0, 1);
    const e = f * f * (3 - 2 * f); // smoothstep dolly
    const cam = this.ctx.camera;
    if (cam && this._from && this._to && this._look) {
      cam.position.set(
        this._from[0] + (this._to[0] - this._from[0]) * e,
        this._from[1] + (this._to[1] - this._from[1]) * e,
        this._from[2] + (this._to[2] - this._from[2]) * e,
      );
      cam.lookAt(new THREE.Vector3(this._look[0], this._look[1], this._look[2]));
    }
    if (this.shotT >= shot.dur) {
      this.shotIndex += 1;
      this.shotT = 0;
      if (this.shotIndex >= SHOTS.length) this._finish();
      else this._startShot(this.shotIndex);
    }
  }

  getState() {
    const shot = SHOTS[this.shotIndex];
    return {
      playing: this.playing,
      shotIndex: this.shotIndex,
      shotT: +this.shotT.toFixed(2),
      totalT: +this.totalT.toFixed(2),
      duration: TOTAL,
      shotTitle: shot ? shot.title : null,
    };
  }

  dispose() {
    if (this._card && this._card.parentNode) this._card.parentNode.removeChild(this._card);
    this._card = null;
  }
}
