// nightmarket.js — night market on Market St (round 13).
// Written from scratch by Thirteen (round 13, recording 01a20d7f).
// Six stalls + string lights + vendors. Busy and glowing at dusk/night,
// dim and mostly unstaffed by day.
import * as THREE from 'three';
import { resolveClock, box } from './twelve-utils.js';

const STALL_X = [148, 157, 166, 175, 184, 193];
const STALL_Z = 191;
const CANOPY_COLORS = [0xd8232a, 0x2470c8, 0xe0a52e, 0x2f9e44, 0x7b4fd0, 0xe06a1f];

function stripeTexture(colorA, colorB) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 === 0 ? colorA : colorB;
    g.fillRect(i * 16, 0, 16, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class NightMarketSystem {
  constructor(ctx) {
    this.ctx = ctx || {};
    this.clock = resolveClock(this.ctx);
    this.open = false;
    this.group = new THREE.Group();
    this.group.name = 'nightmarket';
    if (this.ctx.scene) this.ctx.scene.add(this.group);
    this._bulbs = [];
    this._vendors = [];
    // Stalls: counter + striped canopy + goods.
    STALL_X.forEach((x, i) => {
      const stall = new THREE.Group();
      stall.position.set(x, 0, STALL_Z);
      const counter = box(2.2, 1.0, 1.3, 0x6b4a2a, { y: 0.5 });
      stall.add(counter);
      const hex = '#' + CANOPY_COLORS[i % CANOPY_COLORS.length].toString(16).padStart(6, '0');
      const canopy = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 1.8),
        new THREE.MeshLambertMaterial({ map: stripeTexture(hex, '#f2ede0'), side: THREE.DoubleSide }),
      );
      canopy.rotation.x = -Math.PI / 2 + 0.35;
      canopy.position.y = 2.3;
      stall.add(canopy);
      for (const px of [-1.1, 1.1]) {
        const post = box(0.08, 2.3, 0.08, 0x3a3f4a, { x: px, y: 1.15, z: -0.5 });
        stall.add(post);
      }
      // Goods on the counter: little coloured crates.
      const goodsColors = [0xe0a52e, 0xd8232a, 0x7ac74f, 0x2470c8];
      for (let k = 0; k < 4; k++) {
        const crate = box(0.35, 0.25, 0.35, goodsColors[(i + k) % goodsColors.length], { x: -0.7 + k * 0.45, y: 1.15, z: 0.1 });
        stall.add(crate);
      }
      this.group.add(stall);
    });
    // String lights on 4 poles spanning the stalls.
    const poleXs = [146, 162, 178, 194];
    for (const x of poleXs) {
      const pole = box(0.14, 4.2, 0.14, 0x2a2f3a, { x, y: 2.1, z: STALL_Z - 2 });
      this.group.add(pole);
    }
    for (let s = 0; s < poleXs.length - 1; s++) {
      const x0 = poleXs[s];
      const x1 = poleXs[s + 1];
      for (let k = 1; k <= 8; k++) {
        const f = k / 9;
        const x = x0 + (x1 - x0) * f;
        const y = 4.1 - Math.sin(f * Math.PI) * 0.55;
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0x554422 }),
        );
        bulb.position.set(x, y, STALL_Z - 2);
        this.group.add(bulb);
        this._bulbs.push(bulb);
      }
    }
    // Vendors: simple figures behind three of the stalls.
    const vendorSpots = [157, 175, 193];
    for (const x of vendorSpots) {
      const v = new THREE.Group();
      v.position.set(x, 0, STALL_Z + 1.1);
      v.add(box(0.62, 0.95, 0.38, 0x2470c8, { y: 1.05, name: 'shirt' }));
      v.add(box(0.4, 0.4, 0.4, 0xc98d64, { y: 1.75, name: 'head' }));
      v.add(box(0.58, 0.75, 0.34, 0x2a2f3a, { y: 0.38, name: 'legs' }));
      v.visible = false;
      this.group.add(v);
      this._vendors.push(v);
    }
  }

  _applyOpen(open) {
    if (this.open === open) return;
    this.open = open;
    for (const b of this._bulbs) b.material.color.setHex(open ? 0xffd76a : 0x554422);
    for (const v of this._vendors) v.visible = open;
  }

  update() {
    const h = this.clock.getHour();
    const dusk = h >= 17.5 || h < 5.5;
    this._applyOpen(dusk || this.clock.isNight());
  }

  getState() {
    return { open: this.open, stalls: STALL_X.length, vendorsVisible: this._vendors.filter((v) => v.visible).length };
  }

  dispose() {
    if (this.ctx.scene) this.ctx.scene.remove(this.group);
  }
}
