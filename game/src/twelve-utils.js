// twelve-utils.js — shared helpers for the round-13 standalone modules.
// Written from scratch by Thirteen (round 13, recording 01a20d7f).
// Pure helpers only: no game state, no side effects on import.
import * as THREE from 'three';

export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function formatMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

// Resolve a money adapter from a ctx: prefers ctx.money, falls back to
// reading/writing ctx.player.money (a live getter), then a local ledger.
export function resolveMoney(ctx) {
  if (ctx && ctx.money && typeof ctx.money.get === 'function') return ctx.money;
  let ledger = 0;
  const player = () => (ctx && typeof ctx.player !== 'undefined' ? ctx.player : null);
  return {
    get: () => { const p = player(); return p && typeof p.money === 'number' ? p.money : ledger; },
    add: (n) => { const p = player(); if (p && typeof p.money === 'number') p.money += n; else ledger += n; },
    spend: (n) => {
      const p = player();
      if (p && typeof p.money === 'number') { if (p.money < n) return false; p.money -= n; return true; }
      if (ledger < n) return false; ledger -= n; return true;
    },
    canAfford: (n) => { const p = player(); return p && typeof p.money === 'number' ? p.money >= n : ledger >= n; },
  };
}

// Resolve a notifier: prefers ctx.notify, then hud.notify, then a DOM toast.
export function resolveNotifier(ctx) {
  if (ctx && typeof ctx.notify === 'function') return ctx.notify;
  if (ctx && ctx.hud && typeof ctx.hud.notify === 'function') return (t) => ctx.hud.notify(t);
  return (text) => {
    let host = document.querySelector('.lv-toasts');
    if (!host) {
      host = document.createElement('div');
      host.className = 'lv-toasts';
      host.style.cssText = 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:90;pointer-events:none;';
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'lv-toast';
    t.textContent = text;
    t.style.cssText = 'background:rgba(10,14,26,0.85);color:#fff;padding:8px 14px;border-radius:8px;margin-top:6px;font:600 14px system-ui,sans-serif;text-align:center;';
    host.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
  };
}

// Resolve a clock: prefers ctx.getHour / ctx.isNight, then ctx.weather.
export function resolveClock(ctx) {
  const weather = ctx ? ctx.weather : null;
  return {
    getHour: () => {
      if (ctx && typeof ctx.getHour === 'function') return ctx.getHour();
      if (weather && typeof weather.time === 'number') return weather.time;
      return 12;
    },
    isNight: () => {
      if (ctx && typeof ctx.isNight === 'function') return ctx.isNight();
      if (weather && typeof weather.isNight === 'function') return weather.isNight();
      const h = weather && typeof weather.time === 'number' ? weather.time : 12;
      return h >= 19 || h < 5.5;
    },
  };
}

// A canvas-backed sign texture. Returns { tex, redraw(title, sub, accent) }.
export function createSignTexture(title, sub, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const redraw = (t, s, a) => {
    const g = canvas.getContext('2d');
    g.fillStyle = '#10141f';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = a || '#f5d76e';
    g.lineWidth = 10;
    g.strokeRect(8, 8, 496, 240);
    g.fillStyle = a || '#f5d76e';
    g.font = 'bold 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, 256, 96, 470);
    g.fillStyle = '#ffffff';
    g.font = '600 40px system-ui, sans-serif';
    g.fillText(s, 256, 186, 470);
    tex.needsUpdate = true;
  };
  redraw(title, sub, accent);
  return { tex, canvas, redraw };
}

// Small canvas texture for a single glyph/word (loot bills, tattoos, canopies).
export function makeTextTexture(text, opts) {
  const o = opts || {};
  const canvas = document.createElement('canvas');
  canvas.width = o.w || 128;
  canvas.height = o.h || 128;
  const g = canvas.getContext('2d');
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, canvas.width, canvas.height); }
  g.fillStyle = o.color || '#ffffff';
  g.font = (o.font || 'bold 72px system-ui, sans-serif');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A plain coloured box mesh helper (keeps the modules terse).
export function box(w, h, d, color, opts) {
  const o = opts || {};
  const mat = o.basic
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshLambertMaterial({ color });
  if (o.emissive !== undefined) mat.emissive = new THREE.Color(o.emissive);
  if (o.emissiveIntensity !== undefined) mat.emissiveIntensity = o.emissiveIntensity;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  if (o.name) m.name = o.name;
  if (o.x !== undefined) m.position.set(o.x, o.y || 0, o.z || 0);
  if (o.ry !== undefined) m.rotation.y = o.ry;
  return m;
}
