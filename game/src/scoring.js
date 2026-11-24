// scoring.js — loot from dead NPCs + drift / near-miss payouts (round 13).
// Written from scratch by Thirteen (round 13, recording 01a20d7f).
// Host hooks: dropLoot(x, z), noteDrift(chain), noteNearMiss(). The module
// also polls NPC deaths itself so no edit to the character manager is needed.
import * as THREE from 'three';
import { dist2d, formatMoney, resolveMoney, resolveNotifier, makeTextTexture, box } from './twelve-utils.js';

export class ScoringSystem {
  constructor(ctx) {
    this.ctx = ctx || {};
    this.money = resolveMoney(this.ctx);
    this.notify = resolveNotifier(this.ctx);
    this.polling = true; // set false in tests for deterministic hook checks
    this.stats = { earned: 0, lootsCollected: 0, lootsOnGround: 0, driftsPaid: 0, nearMisses: 0 };
    this._loots = [];
    this._lootedNpcs = new WeakSet();
    this._lastDrift = -10;
    this._lastNearMiss = -10;
    this._t = 0;
    this._driftTime = 0;
    this._prevCar = null;
    this._nearMissState = new Map();
    this._popup = null;
    this._popupT = 0;
    this.group = new THREE.Group();
    this.group.name = 'scoring-loot';
    if (this.ctx.scene) this.ctx.scene.add(this.group);
  }

  dropLoot(x, z) {
    const amount = 5 + Math.floor(Math.random() * 46); // $5–$50
    const g = new THREE.Group();
    g.position.set(x, 0.25, z);
    const bill = box(0.55, 0.06, 0.3, 0x2f9e44);
    bill.position.y = 0.1;
    g.add(bill);
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshBasicMaterial({ map: makeTextTexture('$', { color: '#7ee081' }), transparent: true, side: THREE.DoubleSide }),
    );
    tag.position.y = 0.9;
    g.add(tag);
    this.group.add(g);
    this._loots.push({ mesh: g, tag, x, z, amount, t: 0 });
    this.stats.lootsOnGround = this._loots.length;
    return amount;
  }

  _collect(loot) {
    this.money.add(loot.amount);
    this.stats.earned += loot.amount;
    this.stats.lootsCollected += 1;
    this.notify(`+${formatMoney(loot.amount)} loot.`);
    this.group.remove(loot.mesh);
    const i = this._loots.indexOf(loot);
    if (i >= 0) this._loots.splice(i, 1);
    this.stats.lootsOnGround = this._loots.length;
  }

  noteDrift(chain) {
    if (chain < 3) return false;
    if (this._t - this._lastDrift < 2) return false;
    this._lastDrift = this._t;
    this.money.add(150);
    this.stats.earned += 150;
    this.stats.driftsPaid += 1;
    this._popupText('DRIFT x3  +$150');
    this.notify('DRIFT x3 — +$150!');
    return true;
  }

  noteNearMiss() {
    if (this._t - this._lastNearMiss < 2) return false;
    this._lastNearMiss = this._t;
    this.money.add(250);
    this.stats.earned += 250;
    this.stats.nearMisses += 1;
    this._popupText('NEAR MISS  +$250');
    this.notify('NEAR MISS — +$250!');
    return true;
  }

  _popupText(text) {
    if (!this._popup) {
      const el = document.createElement('div');
      el.className = 'lv-score-popup';
      el.style.cssText = 'position:fixed;left:50%;top:32%;transform:translateX(-50%);z-index:94;color:#7ee081;font:800 26px system-ui,sans-serif;text-shadow:0 2px 8px rgba(0,0,0,0.8);pointer-events:none;opacity:0;transition:opacity 0.25s;';
      document.body.appendChild(el);
      this._popup = el;
    }
    this._popup.textContent = text;
    this._popup.style.opacity = '1';
    this._popupT = 0;
  }

  _pollNpcDeaths() {
    const npcs = this.ctx.getNpcs ? this.ctx.getNpcs() : null;
    if (!npcs || !npcs.length) return;
    for (const n of npcs) {
      if (this._lootedNpcs.has(n)) continue;
      const dead = n.dead === true || n.state === 'dying' || (typeof n.health === 'number' && n.health <= 0);
      if (dead && typeof n.x === 'number' && typeof n.z === 'number') {
        this._lootedNpcs.add(n);
        this.dropLoot(n.x, n.z);
      }
    }
  }

  _pollDriving(dt) {
    const car = this.ctx.getPlayerCar ? this.ctx.getPlayerCar() : null;
    if (!car || !this.ctx.player || !this.ctx.player.inCar) { this._prevCar = null; this._driftTime = 0; return; }
    // Drift: slip angle between heading and velocity direction.
    if (this._prevCar) {
      const vx = car.x - this._prevCar.x;
      const vz = car.z - this._prevCar.z;
      const speed = Math.hypot(vx, vz) / Math.max(dt, 0.001);
      if (speed > 12) {
        const velAngle = Math.atan2(vx, vz);
        let slip = velAngle - car.heading;
        while (slip > Math.PI) slip -= 2 * Math.PI;
        while (slip < -Math.PI) slip += 2 * Math.PI;
        if (Math.abs(slip) > 0.45) {
          this._driftTime += dt;
          if (this._driftTime > 0.8) { this.noteDrift(3); this._driftTime = 0; }
        } else {
          this._driftTime = 0;
        }
      } else {
        this._driftTime = 0;
      }
    }
    this._prevCar = { x: car.x, z: car.z };
    // Near miss: a traffic car sweeps within 2.5 m while we are fast, then pulls away.
    const traffic = this.ctx.getTraffic ? this.ctx.getTraffic() : null;
    if (traffic && car.speed > 10) {
      for (const t of traffic) {
        if (t.dead) continue;
        const d = dist2d(car.x, car.z, t.x, t.z);
        const st = this._nearMissState.get(t) || { min: 1e9, armed: false };
        if (d < st.min) st.min = d;
        if (d < 2.5 && !st.armed) st.armed = true;
        if (st.armed && d > 4 && st.min < 2.5) {
          this.noteNearMiss();
          st.armed = false;
          st.min = 1e9;
        }
        if (d > 12) { st.armed = false; st.min = 1e9; }
        this._nearMissState.set(t, st);
      }
    }
  }

  update(dt) {
    this._t += dt;
    if (this._popup) {
      this._popupT += dt;
      if (this._popupT > 1.5) this._popup.style.opacity = '0';
    }
    const player = this.ctx.player;
    // Loot bob / expiry / auto-collect.
    for (let i = this._loots.length - 1; i >= 0; i--) {
      const l = this._loots[i];
      l.t += dt;
      l.tag.position.y = 0.9 + Math.sin(l.t * 3) * 0.12;
      l.tag.rotation.y += dt * 2;
      if (l.t > 90) {
        this.group.remove(l.mesh);
        this._loots.splice(i, 1);
        this.stats.lootsOnGround = this._loots.length;
        continue;
      }
      if (player && dist2d(player.x, player.z, l.x, l.z) < 2.2) this._collect(l);
    }
    if (this.polling) {
      this._pollNpcDeaths();
      this._pollDriving(dt);
    }
  }

  getStats() { return { ...this.stats }; }

  dispose() {
    if (this.ctx.scene) this.ctx.scene.remove(this.group);
    if (this._popup && this._popup.parentNode) this._popup.parentNode.removeChild(this._popup);
    this._popup = null;
  }
}
