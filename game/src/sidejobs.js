// sidejobs.js — taxi / parcel / vigilante side jobs (round 13).
// Written from scratch by Thirteen (round 13, recording 01a20d7f).
// Pick a job from the board, follow the gold marker, get paid on delivery.
import * as THREE from 'three';
import { dist2d, formatMoney, resolveMoney, resolveNotifier, box } from './twelve-utils.js';

export const SIDE_JOBS = [
  { id: 'taxi', name: 'Taxi Fare', desc: 'Pick up a passenger and drop them off.', pay: 150 },
  { id: 'parcel', name: 'Parcel Run', desc: 'Collect a package at the docks, deliver it to the club.', pay: 200 },
  { id: 'vigilante', name: 'Vigilante', desc: 'Run down a fleeing Vultures runner.', pay: 400 },
];

// Road intersections the taxi jobs rotate through.
const TAXI_SPOTS = [
  [65, 65], [117, 117], [169, 169], [195, 91], [91, 195], [143, 143], [221, 117], [65, 221],
];

export class SideJobSystem {
  constructor(ctx) {
    this.ctx = ctx || {};
    this.money = resolveMoney(this.ctx);
    this.notify = resolveNotifier(this.ctx);
    this.active = null;
    this._spotIdx = 0;
    this._panel = null;
    this._marker = null;
    this._markerRing = null;
    this._markerT = 0;
    this._target = null;
    this._targetMesh = null;
    if (this.ctx.scene) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 2.6, 12),
        new THREE.MeshBasicMaterial({ color: 0xf5d76e }),
      );
      cone.visible = false;
      this.ctx.scene.add(cone);
      this._marker = cone;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.6, 2.1, 24),
        new THREE.MeshBasicMaterial({ color: 0xf5d76e, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.ctx.scene.add(ring);
      this._markerRing = ring;
    }
  }

  listJobs() { return SIDE_JOBS.map((j) => ({ ...j })); }

  _nextTaxiSpot(player) {
    // Pick the spot 20–60 m from the player so the drive is short but real.
    for (let i = 0; i < TAXI_SPOTS.length; i++) {
      const s = TAXI_SPOTS[(this._spotIdx + i) % TAXI_SPOTS.length];
      const d = player ? dist2d(player.x, player.z, s[0], s[1]) : 30;
      if (d > 20 && d < 90) { this._spotIdx = (this._spotIdx + i + 1) % TAXI_SPOTS.length; return s; }
    }
    const s = TAXI_SPOTS[this._spotIdx % TAXI_SPOTS.length];
    this._spotIdx = (this._spotIdx + 1) % TAXI_SPOTS.length;
    return s;
  }

  _farSpot(from) {
    let best = TAXI_SPOTS[0];
    let bestD = -1;
    for (const s of TAXI_SPOTS) {
      const d = dist2d(from[0], from[1], s[0], s[1]);
      if (d > bestD) { bestD = d; best = s; }
    }
    return best;
  }

  accept(jobId) {
    const job = SIDE_JOBS.find((j) => j.id === jobId);
    if (!job) return { ok: false, reason: 'unknown job' };
    if (this.active) return { ok: false, reason: 'already on a job — cancel it first' };
    const player = this.ctx.player || null;
    if (jobId === 'taxi') {
      const pickup = this._nextTaxiSpot(player);
      const dropoff = this._farSpot(pickup);
      this.active = { id: 'taxi', job, stage: 'pickup', pickup, dropoff };
      this.notify('Taxi job: pick up the passenger at the gold marker.');
    } else if (jobId === 'parcel') {
      this.active = { id: 'parcel', job, stage: 'pickup', pickup: [24, 130], dropoff: [156, 104] };
      this.notify('Parcel job: collect the package at the docks.');
    } else {
      const px = player ? player.x : 130;
      const pz = player ? player.z : 130;
      const tx = px + 14;
      const tz = pz + 6;
      let target = null;
      if (this.ctx.spawnNPC) {
        try { target = this.ctx.spawnNPC({ kind: 'gang', x: tx, z: tz, state: 'walk', shirt: 0x8a1a1a }); } catch (e) { target = null; }
      }
      if (!target && this.ctx.scene) {
        // Procedural stand-in target (red shirt) when no NPC spawner exists.
        const g = new THREE.Group();
        g.add(box(0.7, 1.0, 0.4, 0x8a1a1a, { y: 1.1, name: 'shirt' }));
        g.add(box(0.42, 0.42, 0.42, 0xc98d64, { y: 1.85, name: 'head' }));
        g.add(box(0.65, 0.8, 0.35, 0x2a2f3a, { y: 0.4, name: 'legs' }));
        g.position.set(tx, 0, tz);
        this.ctx.scene.add(g);
        this._targetMesh = g;
        target = { x: tx, z: tz, health: 100, kind: 'gang', state: 'walk', _mesh: g };
      }
      this.active = { id: 'vigilante', job, stage: 'chase', target, x: tx, z: tz };
      this.notify('Vigilante job: run the Vultures runner down!');
    }
    this._placeMarker();
    this._refreshPanel();
    return { ok: true };
  }

  cancel() {
    if (!this.active) return;
    this.active = null;
    this._clearTarget();
    this._hideMarker();
    this.notify('Job cancelled.');
    this._refreshPanel();
  }

  _placeMarker() {
    const o = this.getObjective();
    if (!o || !this._marker) return;
    this._marker.position.set(o.x, 4.2, o.z);
    this._marker.visible = true;
    this._markerRing.position.set(o.x, 0.15, o.z);
    this._markerRing.visible = true;
  }

  _hideMarker() {
    if (this._marker) this._marker.visible = false;
    if (this._markerRing) this._markerRing.visible = false;
  }

  _clearTarget() {
    if (this._targetMesh && this.ctx.scene) {
      this.ctx.scene.remove(this._targetMesh);
      this._targetMesh = null;
    }
    this._target = null;
  }

  getObjective() {
    if (!this.active) return null;
    const a = this.active;
    if (a.id === 'vigilante') {
      const t = a.target;
      return { text: 'Run down the Vultures runner', x: t ? t.x : a.x, z: t ? t.z : a.z };
    }
    if (a.stage === 'pickup') return { text: 'Pick up at the gold marker', x: a.pickup[0], z: a.pickup[1] };
    return { text: 'Drop off at the gold marker', x: a.dropoff[0], z: a.dropoff[1] };
  }

  getMarkers() {
    const o = this.getObjective();
    return o ? [{ id: 'sidejob', x: o.x, z: o.z, label: o.text }] : [];
  }

  _complete() {
    const a = this.active;
    if (!a) return;
    this.money.add(a.job.pay);
    this.notify(`Job complete! +${formatMoney(a.job.pay)} (${a.job.name}).`);
    this.active = null;
    this._clearTarget();
    this._hideMarker();
    this._refreshPanel();
  }

  update(dt) {
    this._markerT += dt;
    if (this._marker && this._marker.visible) {
      this._marker.position.y = 4.2 + Math.sin(this._markerT * 3) * 0.5;
      this._marker.rotation.y += dt * 2;
    }
    if (!this.active) return;
    const player = this.ctx.player;
    if (!player) return;
    const a = this.active;
    if (a.id === 'vigilante') {
      const t = a.target;
      if (!t) { this._complete(); return; }
      // The runner flees from the player at ~5.5 m/s.
      const dx = t.x - player.x;
      const dz = t.z - player.z;
      const d = Math.hypot(dx, dz) || 1;
      const sp = 5.5 * dt;
      t.x += (dx / d) * sp;
      t.z += (dz / d) * sp;
      t.x = Math.max(16, Math.min(258, t.x));
      t.z = Math.max(2, Math.min(258, t.z));
      if (t._mesh) { t._mesh.position.set(t.x, 0, t.z); t._mesh.rotation.y = Math.atan2(dx, dz); }
      if (this._marker) { this._marker.position.set(t.x, 4.2 + Math.sin(this._markerT * 3) * 0.5, t.z); this._markerRing.position.set(t.x, 0.15, t.z); }
      if (d < 3) this._complete();
      return;
    }
    const goal = a.stage === 'pickup' ? a.pickup : a.dropoff;
    if (dist2d(player.x, player.z, goal[0], goal[1]) < 5) {
      if (a.stage === 'pickup') {
        a.stage = 'dropoff';
        this.notify(a.id === 'taxi' ? 'Passenger aboard — drive to the drop-off.' : 'Package collected — deliver it to the club.');
        this._placeMarker();
      } else {
        this._complete();
      }
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
    el.className = 'lv-jobs-panel hidden';
    el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:95;width:min(420px,92vw);background:rgba(10,14,26,0.96);border:2px solid #f5d76e;border-radius:12px;padding:16px;color:#fff;font:600 15px system-ui,sans-serif;';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><span style="font-size:18px;">SIDE JOBS</span><button class="lv-jobs-close" style="background:#222a3d;color:#fff;border:1px solid #555;border-radius:6px;padding:4px 10px;cursor:pointer;">CLOSE</button></div><div class="lv-jobs-rows"></div><div class="lv-jobs-active" style="margin-top:10px;color:#f5d76e;font-size:14px;"></div>';
    el.querySelector('.lv-jobs-close').addEventListener('click', () => el.classList.add('hidden'));
    document.body.appendChild(el);
    this._panel = el;
  }

  _refreshPanel() {
    if (!this._panel) return;
    const rows = this._panel.querySelector('.lv-jobs-rows');
    rows.innerHTML = '';
    for (const j of SIDE_JOBS) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 4px;border-bottom:1px solid #2a3348;';
      const label = document.createElement('span');
      label.innerHTML = `<b>${j.name}</b> · ${formatMoney(j.pay)}<br><span style="color:#9fb0c3;font-size:13px;">${j.desc}</span>`;
      const btn = document.createElement('button');
      const isActive = this.active && this.active.id === j.id;
      btn.textContent = isActive ? 'ACTIVE' : 'ACCEPT';
      btn.disabled = !!this.active;
      btn.style.cssText = 'background:' + (isActive ? '#2f9e44' : '#d9a441') + ';color:#fff;border:none;border-radius:6px;padding:7px 12px;cursor:pointer;font-weight:700;';
      btn.addEventListener('click', () => this.accept(j.id));
      row.appendChild(label);
      row.appendChild(btn);
      rows.appendChild(row);
    }
    const act = this._panel.querySelector('.lv-jobs-active');
    const o = this.getObjective();
    act.textContent = o ? `Active: ${o.text}` : '';
    if (this.active) {
      const cancel = document.createElement('button');
      cancel.textContent = 'CANCEL JOB';
      cancel.style.cssText = 'margin-top:8px;background:#8a1a1a;color:#fff;border:none;border-radius:6px;padding:7px 12px;cursor:pointer;font-weight:700;';
      cancel.addEventListener('click', () => this.cancel());
      act.appendChild(document.createElement('br'));
      act.appendChild(cancel);
    }
  }

  dispose() {
    if (this.ctx.scene) {
      if (this._marker) this.ctx.scene.remove(this._marker);
      if (this._markerRing) this.ctx.scene.remove(this._markerRing);
    }
    this._clearTarget();
    if (this._panel && this._panel.parentNode) this._panel.parentNode.removeChild(this._panel);
    this._panel = null;
  }
}
