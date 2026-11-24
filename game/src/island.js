// island.js — the island across the sea, with its lighthouse (round 13).
// Written from scratch by Thirteen (round 13, recording 01a20d7f).
// Island at (-120,130): hill, palms, six lit buildings, dock, a ferry
// shuttling to La Vega harbour, and a lighthouse with twin rotating beams.
import * as THREE from 'three';
import { dist2d, resolveClock, box } from './twelve-utils.js';

const ISLAND_X = -120;
const ISLAND_Z = 130;
const HARBOUR_X = 20;
const HARBOUR_Z = 130;

function buildPalm(scale) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.22, 5.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6a42 }),
  );
  trunk.position.y = 2.6;
  trunk.rotation.z = 0.08;
  g.add(trunk);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.55), frondMat);
    const a = (i / 6) * Math.PI * 2;
    frond.position.set(Math.cos(a) * 1.1, 5.3, Math.sin(a) * 1.1);
    frond.rotation.set(Math.sin(a) * 0.9, -a, Math.cos(a) * 0.9);
    g.add(frond);
  }
  const nut = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2a }),
  );
  nut.position.set(0.3, 5.0, 0.2);
  g.add(nut);
  g.scale.setScalar(scale || 1);
  return g;
}

export class IslandSystem {
  constructor(ctx) {
    this.ctx = ctx || {};
    this.clock = resolveClock(this.ctx);
    this.group = new THREE.Group();
    this.group.name = 'island';
    if (this.ctx.scene) this.ctx.scene.add(this.group);
    // Sand base + grass dome + central hill.
    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(56, 58, 1.2, 24),
      new THREE.MeshLambertMaterial({ color: 0xf2d492 }),
    );
    sand.position.set(ISLAND_X, 0.2, ISLAND_Z);
    this.group.add(sand);
    const grass = new THREE.Mesh(
      new THREE.SphereGeometry(50, 20, 10),
      new THREE.MeshLambertMaterial({ color: 0x69b455 }),
    );
    grass.scale.set(1, 0.22, 1);
    grass.position.set(ISLAND_X, 0.6, ISLAND_Z);
    this.group.add(grass);
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(20, 17, 12),
      new THREE.MeshLambertMaterial({ color: 0x5a8f4a }),
    );
    hill.position.set(ISLAND_X, 9, ISLAND_Z);
    this.group.add(hill);
    // Six palms around the shore.
    const palmSpots = [[-158, 105], [-150, 160], [-95, 100], [-88, 158], [-120, 92], [-120, 168]];
    for (const [x, z] of palmSpots) {
      const p = buildPalm(0.9 + Math.random() * 0.4);
      p.position.set(x, 0.8, z);
      this.group.add(p);
    }
    // Six buildings with windows that light up at night.
    this._windows = [];
    const buildingSpots = [[-138, 118], [-132, 142], [-108, 118], [-102, 142], [-122, 112], [-118, 148]];
    const buildingColors = [0xd8cfc0, 0xc8b89a, 0x9fb0c3, 0xe0d5c0, 0xb8a88a, 0xcfd8dc];
    buildingSpots.forEach(([x, z], i) => {
      const h = 5 + (i % 3) * 3;
      const b = box(6, h, 6, buildingColors[i % buildingColors.length], { x, y: h / 2 + 0.6, z });
      this.group.add(b);
      const roof = box(6.6, 0.5, 6.6, 0x8a4a3a, { x, y: h + 0.85, z });
      this.group.add(roof);
      for (let f = 0; f < 2; f++) {
        const winMat = new THREE.MeshBasicMaterial({ color: 0x2a3348 });
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), winMat);
        win.position.set(x + 3.05, 2 + f * 2.6, z - 1.2);
        win.rotation.y = Math.PI / 2;
        this.group.add(win);
        this._windows.push(winMat);
        const win2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), winMat);
        win2.position.set(x - 1.2, 2 + f * 2.6, z + 3.05);
        this.group.add(win2);
      }
    });
    // Dock reaching east toward La Vega harbour.
    for (let i = 0; i < 8; i++) {
      const plank = box(2.4, 0.25, 3.2, 0xa97c50, { x: -62 + i * 2.6, y: 0.5, z: ISLAND_Z });
      this.group.add(plank);
    }
    // Ferry shuttling island <-> harbour on a ~90 s loop.
    this._ferry = new THREE.Group();
    this._ferry.add(box(6, 1.4, 2.6, 0xf2f2f2, { y: 0.7 }));
    this._ferry.add(box(3.2, 1.4, 2.0, 0x2470c8, { y: 1.9 }));
    this._ferry.add(box(0.5, 1.2, 0.5, 0x3a3f4a, { x: -1, y: 2.8 }));
    this._ferry.position.set(-58, 0, ISLAND_Z);
    this.group.add(this._ferry);
    this._ferryT = 0;
    this._ferryDir = 1;
    this._ferryWait = 0;
    // Lighthouse on the highest point: white/red tower + keeper's cottage
    // + lamp room + twin rotating beams (8 s per sweep).
    const lh = new THREE.Group();
    lh.position.set(ISLAND_X, 17.5, ISLAND_Z);
    const bandColors = [0xf2f2f2, 0xd8232a, 0xf2f2f2, 0xd8232a];
    let by = 0;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5 - i * 0.18, 1.7 - i * 0.18, 3.2, 12),
        new THREE.MeshLambertMaterial({ color: bandColors[i] }),
      );
      seg.position.y = by + 1.6;
      lh.add(seg);
      by += 3.2;
    }
    const gallery = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.0, 0.4, 12),
      new THREE.MeshLambertMaterial({ color: 0x2a2f3a }),
    );
    gallery.position.y = by + 0.2;
    lh.add(gallery);
    this._lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 10), this._lampMat);
    lamp.position.y = by + 1.3;
    lh.add(lamp);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 1.2, 10),
      new THREE.MeshLambertMaterial({ color: 0x2a2f3a }),
    );
    cap.position.y = by + 2.8;
    lh.add(cap);
    this.group.add(lh);
    // Keeper's cottage at the lighthouse base.
    this.group.add(box(4, 2.6, 3.4, 0xe0d5c0, { x: ISLAND_X + 6, y: 18.8, z: ISLAND_Z + 4 }));
    this.group.add(box(4.6, 0.9, 4.0, 0x8a4a3a, { x: ISLAND_X + 6, y: 20.4, z: ISLAND_Z + 4 }));
    // Twin beams: long translucent cones, opposite directions.
    this._beams = new THREE.Group();
    this._beams.position.set(ISLAND_X, 17.5 + by + 1.3, ISLAND_Z);
    this._beamMats = [];
    for (const dir of [0, Math.PI]) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, 55, 10, 1, true), mat);
      cone.rotation.z = Math.PI / 2;
      cone.position.x = Math.cos(dir) * 27;
      cone.rotation.y = dir;
      this._beams.add(cone);
      this._beamMats.push(mat);
    }
    this.group.add(this._beams);
    this._beamAngle = 0;
    this._lit = null;
  }

  _applyNight(night) {
    if (this._lit === night) return;
    this._lit = night;
    for (const w of this._windows) w.color.setHex(night ? 0xffd76a : 0x2a3348);
    this._lampMat.color.setHex(night ? 0xfff2b0 : 0xcfc49a);
    for (const m of this._beamMats) m.opacity = night ? 0.32 : 0.08;
  }

  update(dt) {
    // Beams sweep: one full rotation per 8 s.
    this._beamAngle += (Math.PI * 2 / 8) * dt;
    this._beams.rotation.y = this._beamAngle;
    // Ferry: 90 s loop harbour <-> island dock, 5 s pause at each end.
    this._ferryT += dt;
    const span = 78; // -58 .. 20
    const cycle = 90;
    const t = this._ferryT % cycle;
    let f;
    if (t < 40) f = t / 40;
    else if (t < 45) f = 1;
    else if (t < 85) f = 1 - (t - 45) / 40;
    else f = 0;
    const eased = f * f * (3 - 2 * f);
    const fx = -58 + eased * span;
    this._ferry.position.set(fx, 0, HARBOUR_Z);
    const dir = t < 42.5 ? 1 : -1;
    this._ferry.rotation.y = dir > 0 ? 0 : Math.PI;
    this._applyNight(this.clock.isNight());
  }

  visibleFrom(x, z) {
    const d = dist2d(x, z, ISLAND_X, ISLAND_Z);
    return { distance: Math.round(d), visible: d < 320 };
  }

  dispose() {
    if (this.ctx.scene) this.ctx.scene.remove(this.group);
  }
}
