// businesses.js — buyable businesses with passive income (round 13).
// Written from scratch by Thirteen (round 13, recording 01a20d7f).
// Four businesses; buy one and it pays its hourly rate every 60 seconds.
import * as THREE from 'three';
import { clamp, dist2d, formatMoney, resolveMoney, resolveNotifier, createSignTexture, box } from './twelve-utils.js';

export const BUSINESSES = [
  { id: 'neonbar', name: 'Neon Bar', price: 2000, incomePerHour: 120, x: 150, z: 92 },
  { id: 'garage', name: "Manny's Garage", price: 1500, incomePerHour: 90, x: 78, z: 156 },
  { id: 'beachhouse', name: 'Beach House', price: 1200, incomePerHour: 60, x: 40, z: 78 },
  { id: 'pierkiosk', name: 'Pier Kiosk', price: 800, incomePerHour: 40, x: 24, z: 130 },
];

export class BusinessSystem {
  constructor(ctx) {
    this.ctx = ctx || {};
    this.money = resolveMoney(this.ctx);
    this.notify = resolveNotifier(this.ctx);
    this.owned = {};
    this.earned = 0;
    this._t = 0;
    this._panel = null;
    this.group = new THREE.Group();
    this.group.name = 'businesses';
    this._signs = {};
    if (this.ctx.scene) this.ctx.scene.add(this.group);
    // A sign post in front of each business: pole + board facing the city.
    for (const b of BUSINESSES) {
      const g = new THREE.Group();
      g.position.set(b.x, 0, b.z);
      const pole = box(0.18, 3.4, 0.18, 0x3a3f4a);
      pole.position.y = 1.7;
      g.add(pole);
      const sign = createSignTexture(b.name.toUpperCase(), 'FOR SALE ' + formatMoney(b.price), '#f5d76e');
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 1.8),
        new THREE.MeshBasicMaterial({ map: sign.tex, side: THREE.DoubleSide }),
      );
      board.position.y = 3.9;
      board.rotation.y = Math.atan2(130 - b.x, 130 - b.z);
      g.add(board);
      this.group.add(g);
      this._signs[b.id] = sign;
    }
    this.syncFromGame();
  }

  // Ownership lives in game.businesses so saves already include it.
  syncFromGame() {
    const gb = this.ctx.getBusinesses ? this.ctx.getBusinesses() : null;
    if (gb) {
      for (const b of BUSINESSES) {
        if (gb[b.id]) this.owned[b.id] = true;
        else delete this.owned[b.id];
      }
      this._refreshSigns();
    }
  }

  _refreshSigns() {
    for (const b of BUSINESSES) {
      const s = this._signs[b.id];
      if (!s) continue;
      if (this.owned[b.id]) s.redraw(b.name.toUpperCase(), 'OWNED · ' + formatMoney(b.incomePerHour) + '/HR', '#7ee081');
      else s.redraw(b.name.toUpperCase(), 'FOR SALE ' + formatMoney(b.price), '#f5d76e');
    }
  }

  promptFor(player) {
    if (!player) return null;
    let best = null;
    let bestD = 7;
    for (const b of BUSINESSES) {
      const d = dist2d(player.x, player.z, b.x, b.z);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (!best) return null;
    const owned = !!this.owned[best.id];
    return {
      id: best.id,
      name: best.name,
      price: best.price,
      owned,
      canBuy: !owned && this.money.canAfford(best.price),
      label: owned
        ? `${best.name} — yours · ${formatMoney(best.incomePerHour)}/hr`
        : `${best.name} — ${formatMoney(best.price)} · earns ${formatMoney(best.incomePerHour)}/hr`,
    };
  }

  buy(id) {
    const b = BUSINESSES.find((x) => x.id === id);
    if (!b) return { ok: false, reason: 'unknown business' };
    if (this.owned[id]) return { ok: false, reason: 'already owned' };
    if (!this.money.spend(b.price)) return { ok: false, reason: 'not enough cash' };
    this.owned[id] = true;
    const gb = this.ctx.getBusinesses ? this.ctx.getBusinesses() : null;
    if (gb) gb[id] = { boughtAt: Date.now() };
    this._refreshSigns();
    this.notify(`You bought ${b.name} for ${formatMoney(b.price)} — it now earns ${formatMoney(b.incomePerHour)}/hr.`);
    this._refreshPanel();
    return { ok: true };
  }

  update(dt) {
    this._t += dt;
    if (this._t < 60) return;
    this._t -= 60;
    for (const b of BUSINESSES) {
      if (!this.owned[b.id]) continue;
      const payout = Math.floor(b.incomePerHour / 60);
      if (payout <= 0) continue;
      this.money.add(payout);
      this.earned += payout;
      this.notify(`+$${payout} — ${b.name} income.`);
    }
  }

  togglePanel() {
    if (!this._panel) this._buildPanel();
    const show = this._panel.classList.contains('hidden');
    if (show) this._refreshPanel();
    this._panel.classList.toggle('hidden', !show);
  }

  _buildPanel() {
    const el = document.createElement('div');
    el.className = 'lv-biz-panel hidden';
    el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:95;width:min(420px,92vw);background:rgba(10,14,26,0.96);border:2px solid #f5d76e;border-radius:12px;padding:16px;color:#fff;font:600 15px system-ui,sans-serif;';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><span style="font-size:18px;">BUSINESSES</span><button class="lv-biz-close" style="background:#222a3d;color:#fff;border:1px solid #555;border-radius:6px;padding:4px 10px;cursor:pointer;">CLOSE</button></div><div class="lv-biz-rows"></div><div class="lv-biz-foot" style="margin-top:10px;color:#9fb0c3;font-size:13px;"></div>';
    el.querySelector('.lv-biz-close').addEventListener('click', () => el.classList.add('hidden'));
    document.body.appendChild(el);
    this._panel = el;
  }

  _refreshPanel() {
    if (!this._panel) return;
    const rows = this._panel.querySelector('.lv-biz-rows');
    rows.innerHTML = '';
    for (const b of BUSINESSES) {
      const owned = !!this.owned[b.id];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 4px;border-bottom:1px solid #2a3348;';
      const btn = document.createElement('button');
      btn.textContent = owned ? 'OWNED' : 'BUY ' + formatMoney(b.price);
      btn.disabled = owned || !this.money.canAfford(b.price);
      btn.style.cssText = 'background:' + (owned ? '#2f9e44' : '#d9a441') + ';color:#fff;border:none;border-radius:6px;padding:7px 12px;cursor:pointer;font-weight:700;';
      btn.addEventListener('click', () => this.buy(b.id));
      const label = document.createElement('span');
      label.textContent = `${b.name} · ${formatMoney(b.incomePerHour)}/hr`;
      row.appendChild(label);
      row.appendChild(btn);
      rows.appendChild(row);
    }
    this._panel.querySelector('.lv-biz-foot').textContent = 'Total earned from your businesses: ' + formatMoney(this.earned) + ' · Press B to close.';
  }

  serialize() { return { owned: Object.keys(this.owned), earned: this.earned }; }

  deserialize(data) {
    if (!data) return;
    this.owned = {};
    for (const id of data.owned || []) this.owned[id] = true;
    this.earned = data.earned || 0;
    this._refreshSigns();
  }

  reset() {
    this.owned = {};
    this.earned = 0;
    this._refreshSigns();
    this._refreshPanel();
  }

  dispose() {
    if (this.ctx.scene) this.ctx.scene.remove(this.group);
    if (this._panel && this._panel.parentNode) this._panel.parentNode.removeChild(this._panel);
    this._panel = null;
  }
}
