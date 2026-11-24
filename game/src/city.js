// city.js — La Vega city builder (round 12).
// A 400x400 m island: street grid 0..260, sea west of x=15, sand strip
// 15..30, forest / desert / rocky hills beyond the grid. Round 12: the
// beach is OPEN — no colliders anywhere west of x=30, so the player can
// walk from the city across the sand and wade into the shallows. More
// pedestrians and traffic are spawned by the other managers; this file
// owns the ground, roads, buildings, beach props and street furniture.
import * as THREE from 'three';
import { WORLD, ROADS, DISTRICTS, PLACES } from './config.js';
import { mulberry32, clamp, rand } from './rng.js';

const BLOCKS = [52, 78, 104, 130, 156, 182, 208, 234];
const SKIP_BUILD = new Set(['beach', 'harbor', 'pierPickup', 'dock', 'park', 'airport', 'bridgeN', 'bridgeS']);
const FACADE_COLORS = [0xd8c9a8, 0xc9b18a, 0xb8a88e, 0x9fb4c7, 0xc78d7a, 0x8fa98f, 0xd9d9d9, 0xe8b04b, 0x7a9cc6, 0xc65b4e];
const ROOF_COLORS = [0x5a4a3a, 0x3a3a3a, 0x7a3a2a, 0x2a4a5a];

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function grassTexture() {
  return makeCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#8fce62'; g.fillRect(0, 0, w, h);
    const rng = mulberry32(7);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rng() < 0.5 ? '#7fb84f' : '#9ed973';
      g.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 3, 3);
    }
  });
}

function roadTexture() {
  const t = makeCanvas(128, 512, (g, w, h) => {
    g.fillStyle = '#4a505c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5d76e';
    for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 3, y + 8, 6, 34);
    g.fillStyle = '#e8e8e8';
    g.fillRect(4, 0, 3, h); g.fillRect(w - 7, 0, 3, h);
    const rng = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 4, 4);
    }
  });
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}

function sidewalkTexture() {
  const t = makeCanvas(64, 256, (g, w, h) => {
    g.fillStyle = '#c9c2b4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a89f8d'; g.lineWidth = 2;
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}

function signTexture(text, fg = '#ffd34d', bg = '#1a2233') {
  return makeCanvas(256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = fg; g.font = 'bold 26px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text.toUpperCase().slice(0, 22), w / 2, h / 2 + 1);
  });
}

export class City {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.colliders = [];   // {x, z, r} circles — buildings only, never on sand/sea
    this.sidewalks = [];   // {x0, z0, x1, z1} rects — NPC walking space
    this.busStops = [];    // {x, z}
    this.beachSpots = { sun: [], fish: [], swim: [], jetski: [] };
    this.trafficLights = [];
    this.lampMats = [];
    this.waveStrips = [];
    this.weather = null;
    this._build();
  }

  // ---------- helpers ----------
  _mat(color, opts = {}) {
    return new THREE.MeshLambertMaterial({ color, ...opts });
  }

  _box(w, h, d, color, x, y, z, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this._mat(color, opts));
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.building) m.userData.building = true;
    this.scene.add(m);
    return m;
  }

  _addCollider(x, z, r) {
    this.colliders.push({ x, z, r });
  }

  isOnRoad(x, z) {
    const hw = WORLD.roadWidth / 2 + 0.6;
    for (const L of ROADS) {
      if (Math.abs(x - L) < hw && z >= 0 && z <= WORLD.grid) return true;
      if (Math.abs(z - L) < hw && x >= 0 && x <= WORLD.grid) return true;
    }
    return false;
  }

  isOnSidewalk(x, z) {
    for (const s of this.sidewalks) {
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return true;
    }
    return false;
  }

  isInWater(x) { return x < WORLD.seaX; }
  isOnSand(x) { return x >= WORLD.seaX && x < WORLD.sandMax; }

  clampPlayer(x, z) {
    return { x: clamp(x, 2, WORLD.size - 2), z: clamp(z, 2, WORLD.size - 2) };
  }

  setTrafficRed(red) {
    for (const tl of this.trafficLights) {
      tl.red.material.emissive.setHex(red ? 0xff2222 : 0x220000);
      tl.red.material.emissiveIntensity = red ? 1.6 : 0.25;
      tl.green.material.emissive.setHex(red ? 0x002200 : 0x22ff66);
      tl.green.material.emissiveIntensity = red ? 0.25 : 1.6;
    }
  }

  // ---------- build ----------
  _build() {
    this._buildGround();
    this._buildSea();
    this._buildRoads();
    this._buildBlocks();
    this._buildBeach();
    this._buildProps();
    this._buildTrafficLights();
  }

  _buildGround() {
    const rng = this.rng;
    // Endless sea far below everything: no void past the map edge.
    const deep = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      this._mat(0x1e6fb0)
    );
    deep.rotation.x = -Math.PI / 2;
    deep.position.set(200, -0.4, 200);
    this.scene.add(deep);
    // Grass base.
    const gt = grassTexture();
    gt.wrapS = THREE.RepeatWrapping; gt.wrapT = THREE.RepeatWrapping;
    gt.repeat.set(48, 48);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size, WORLD.size),
      new THREE.MeshLambertMaterial({ map: gt })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(200, 0, 200);
    this.scene.add(ground);
    // Biome tints beyond the grid.
    const biome = (color, x0, z0, w, d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this._mat(color));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x0 + w / 2, 0.02, z0 + d / 2);
      this.scene.add(m);
    };
    biome(0x5d8a3c, 0, 260, 260, 140);    // FOREST
    biome(0xe8d49a, 260, 0, 140, 260);    // DESERT
    biome(0x8a7a68, 260, 260, 140, 140);  // ROCKY HILLS
    // Sand strip along the shore.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.sandMax - WORLD.seaX, WORLD.size),
      this._mat(0xf2d492)
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set((WORLD.seaX + WORLD.sandMax) / 2, 0.03, 200);
    this.scene.add(sand);
    void rng;
  }

  _buildSea() {
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(470, 500),
      new THREE.MeshLambertMaterial({ color: 0x2f9fd8, transparent: true, opacity: 0.94 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(WORLD.seaX - 220, 0.12, 200);
    this.scene.add(sea);
    this.seaMesh = sea;
    // Animated wave strips near the shore.
    for (let i = 0; i < 8; i++) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(3.5, 460),
        new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.35 })
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(6 + i * 1.6, 0.16 + i * 0.004, 200);
      this.scene.add(strip);
      this.waveStrips.push(strip);
    }
  }

  _buildRoads() {
    const rt = roadTexture();
    const st = sidewalkTexture();
    for (const L of ROADS) {
      // NS road.
      const ns = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadWidth, WORLD.grid), new THREE.MeshLambertMaterial({ map: rt }));
      ns.rotation.x = -Math.PI / 2;
      ns.position.set(L, 0.05, WORLD.grid / 2);
      this.scene.add(ns);
      // EW road.
      const ew = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadWidth, WORLD.grid), new THREE.MeshLambertMaterial({ map: rt }));
      ew.rotation.x = -Math.PI / 2;
      ew.rotation.z = Math.PI / 2;
      ew.position.set(WORLD.grid / 2, 0.05, L);
      this.scene.add(ew);
      // Sidewalks on both sides of both roads.
      for (const off of [-6.25, 6.25]) {
        const s1 = new THREE.Mesh(new THREE.PlaneGeometry(2.5, WORLD.grid), new THREE.MeshLambertMaterial({ map: st }));
        s1.rotation.x = -Math.PI / 2;
        s1.position.set(L + off, 0.06, WORLD.grid / 2);
        this.scene.add(s1);
        this.sidewalks.push({ x0: L + off - 1.25, x1: L + off + 1.25, z0: 0, z1: WORLD.grid });
        const s2 = new THREE.Mesh(new THREE.PlaneGeometry(2.5, WORLD.grid), new THREE.MeshLambertMaterial({ map: st }));
        s2.rotation.x = -Math.PI / 2;
        s2.rotation.z = Math.PI / 2;
        s2.position.set(WORLD.grid / 2, 0.06, L + off);
        this.scene.add(s2);
        this.sidewalks.push({ x0: 0, x1: WORLD.grid, z0: L + off - 1.25, z1: L + off + 1.25 });
      }
    }
    // Crosswalks at three main intersections only.
    const crosses = [[117, 117], [143, 169], [169, 143]];
    for (const [cx, cz] of crosses) {
      for (let i = -2; i <= 2; i++) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.6), this._mat(0xf5f5f5));
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(cx + i * 1.8, 0.07, cz);
        this.scene.add(stripe);
      }
    }
  }

  _placeForBlock(bx, bz) {
    for (const [key, p] of Object.entries(PLACES)) {
      if (Math.hypot(p.x - bx, p.y - bz) < 20) return key;
    }
    return null;
  }

  // Some places sit on a road centreline (dealer, casino, gun shop...).
  // Snap those onto the nearest block centre so the building never lands
  // in the middle of an intersection.
  _snapPlace(p) {
    const snap = (v) => {
      for (const L of ROADS) {
        if (Math.abs(v - L) < 6) {
          let best = BLOCKS[0];
          let bestD = Infinity;
          for (const b of BLOCKS) {
            const d = Math.abs(v - b);
            if (d < bestD || (d === bestD && b > best)) { bestD = d; best = b; }
          }
          return best;
        }
      }
      return v;
    };
    return { x: snap(p.x), z: snap(p.y) };
  }

  _buildBlocks() {
    const rng = this.rng;
    // Pass 1: generic buildings on blocks that hold no named place.
    for (const bx of BLOCKS) {
      for (const bz of BLOCKS) {
        if (this._placeForBlock(bx, bz)) continue;
        this._genericBuilding(bx, bz, null);
      }
    }
    // Pass 2: every named place gets its own building at its own
    // coordinates (places do not sit on block centres, so matching by
    // block would miss most of them).
    for (const [key, p] of Object.entries(PLACES)) {
      if (SKIP_BUILD.has(key)) {
        if (key === 'park') this._buildPark(p.x, p.y);
        continue;
      }
      if (key === 'gas') { this._buildGasStation(p.x, p.y); continue; }
      const s = this._snapPlace(p);
      this._genericBuilding(s.x, s.z, key);
    }
  }

  _genericBuilding(bx, bz, key) {
    const rng = this.rng;
    const h = key === 'cityHall' || key === 'casino' ? 26 + rng() * 10
      : key === 'mall' ? 14
      : (bx > 130 && bz < 130 ? 18 + rng() * 22 : 8 + rng() * 12);
    const w = 9 + rng() * 3;
    const d = 9 + rng() * 3;
    const color = FACADE_COLORS[Math.floor(rng() * FACADE_COLORS.length)];
    this._box(w, h, d, color, bx, h / 2, bz, { building: true });
    // Roof cap + ground-floor base.
    this._box(w + 0.6, 0.5, d + 0.6, ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)], bx, h + 0.25, bz);
    this._box(w + 0.4, 2.2, d + 0.4, 0x8a8074, bx, 1.1, bz);
    // Lit window strips on the facade.
    const floors = Math.max(2, Math.floor(h / 4));
    for (let f = 0; f < floors; f++) {
      const lit = rng() < 0.4;
      const strip = this._box(w * 0.82, 0.9, 0.15, lit ? 0xffe9a8 : 0x2a3542, bx, 3 + f * 3.4, bz + d / 2 + 0.08);
      if (lit) strip.material.emissive = new THREE.Color(0xffdf80);
    }
    // Special fronts.
    if (key === 'cityHall') {
      for (let i = -2; i <= 2; i++) this._box(0.7, 7, 0.7, 0xe8e8e8, bx + i * 2.2, 3.5, bz + d / 2 + 0.8);
    }
    if (key === 'casino' || key === 'club') {
      const glow = this._box(w * 0.7, 1.2, 0.3, key === 'casino' ? 0xffd34d : 0xff2a9d, bx, h * 0.75, bz + d / 2 + 0.15);
      glow.material.emissive = new THREE.Color(key === 'casino' ? 0xffc400 : 0xff2a9d);
    }
    if (key === 'hospital') {
      const cross1 = this._box(3.2, 0.9, 0.2, 0xff2a2a, bx, h + 0.9, bz + d / 2 + 0.1);
      const cross2 = this._box(0.9, 3.2, 0.2, 0xff2a2a, bx, h + 0.9, bz + d / 2 + 0.1);
      cross1.material.emissive = new THREE.Color(0xff2a2a);
      cross2.material.emissive = new THREE.Color(0xff2a2a);
    }
    if (key === 'workshop') {
      for (let i = 0; i < 3; i++) {
        const saw = this._box(w / 3, 1.6, d * 0.8, 0x5a6a7a, bx - w / 3 + i * (w / 3), h + 0.8, bz);
        saw.rotation.z = 0.35;
      }
    }
    // Sign board with the place name.
    if (key) {
      const p = PLACES[key];
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 1.75),
        new THREE.MeshBasicMaterial({ map: signTexture(p.name) })
      );
      sign.position.set(bx, Math.min(h - 1.2, 9), bz + d / 2 + 0.25);
      this.scene.add(sign);
    }
    this._addCollider(bx, bz, Math.max(w, d) * 0.62);
  }

  _buildPark(bx, bz) {
    const rng = this.rng;
    // Palm Court Park: lawn, trees, benches, two stunt ramps (park only,
    // never on a road).
    for (let i = 0; i < 7; i++) {
      const px = bx - 10 + rng() * 20;
      const pz = bz - 10 + rng() * 20;
      this._palm(px, pz);
    }
    for (let i = 0; i < 3; i++) {
      this._box(2.4, 0.5, 0.8, 0x8a5a3a, bx - 8 + i * 8, 0.45, bz + 6);
    }
    for (const [rx, rz] of [[bx - 6, bz - 6], [bx + 6, bz + 4]]) {
      const ramp = this._box(4, 0.3, 6, 0xe8b04b, rx, 0.9, rz);
      ramp.rotation.x = -0.35;
    }
  }

  _buildGasStation(bx, bz) {
    // Petro Vega: canopy on 4 posts, 2 pumps, kiosk. Open forecourt —
    // cars drive in freely; the pumps have no colliders (drive-through).
    const px = PLACES.gas.x; const pz = PLACES.gas.y;
    for (const [ox, oz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
      this._box(0.4, 4.4, 0.4, 0xd8d8d8, px + ox, 2.2, pz + oz);
    }
    const canopy = this._box(11, 0.5, 8, 0xff2a2a, px, 4.6, pz);
    canopy.material.emissive = new THREE.Color(0x881111);
    for (const [ox, oz] of [[-2, 0], [2, 0]]) {
      this._box(1, 1.6, 0.7, 0x2a6fd6, px + ox, 0.8, pz + oz);
    }
    this._box(4, 3, 3, 0xe8e8e8, px + 7, 1.5, pz + 5, { building: true });
    this._addCollider(px + 7, pz + 5, 3.4);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 2),
      new THREE.MeshBasicMaterial({ map: signTexture('PETRO VEGA', '#ffffff', '#d92038') })
    );
    sign.position.set(px, 6.2, pz + 4.2);
    this.scene.add(sign);
    void bx; void bz;
  }

  _buildBeach() {
    const rng = this.rng;
    // Umbrellas + towels on the sand (x 17..29), all grounded.
    for (let i = 0; i < 8; i++) {
      const ux = 18 + rng() * 10;
      const uz = 20 + rng() * 220;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), this._mat(0x8a8074));
      pole.position.set(ux, 1.2, uz);
      this.scene.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.7, 8), this._mat([0xff2a9d, 0xffd34d, 0x2a6fd6, 0x7dff8a][i % 4]));
      top.position.set(ux, 2.6, uz);
      this.scene.add(top);
      this.beachSpots.sun.push({ x: ux + 1.2, z: uz + 0.6 });
    }
    for (let i = 0; i < 10; i++) {
      const fx = 15.5 + rng() * 2;
      const fz = 30 + rng() * 200;
      this.beachSpots.fish.push({ x: fx, z: fz });
    }
    for (let i = 0; i < 8; i++) {
      const sx = 5 + rng() * 8;
      const sz = 40 + rng() * 180;
      this.beachSpots.swim.push({ x: sx, z: sz });
    }
    for (let i = 0; i < 6; i++) {
      const jx = 3 + rng() * 7;
      const jz = 50 + rng() * 160;
      this.beachSpots.jetski.push({ x: jx, z: jz });
    }
    // Pier 9: wooden planks from the sand out into the sea.
    for (let x = 14; x >= 2; x -= 2) {
      this._box(2, 0.25, 5, 0xa97c50, x, 0.35, 130);
    }
    for (const [px, pz] of [[2, 127.5], [2, 132.5], [14, 127.5], [14, 132.5]]) {
      this._box(0.4, 1.2, 0.4, 0x6a4a2a, px, 0.6, pz);
    }
    // Docks: short plank walk near the harbor.
    for (let x = 24; x >= 16; x -= 2) {
      this._box(2, 0.25, 4, 0xa97c50, x, 0.35, 140);
    }
    void rng;
  }

  _palm(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 4.6, 7), this._mat(0x8a6a42));
    trunk.position.set(x, 2.3, z);
    trunk.rotation.z = 0.08;
    this.scene.add(trunk);
    for (let i = 0; i < 7; i++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.6), this._mat(0x3f8f3a, { side: THREE.DoubleSide }));
      const a = (i / 7) * Math.PI * 2;
      frond.position.set(x + Math.cos(a) * 1.1, 4.7, z + Math.sin(a) * 1.1);
      frond.rotation.set(0.9, 0, a);
      frond.rotation.order = 'YXZ';
      frond.rotation.y = a;
      frond.rotation.x = 0.9;
      this.scene.add(frond);
    }
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), this._mat(0x6a4a2a));
    nut.position.set(x + 0.3, 4.4, z);
    this.scene.add(nut);
  }

  _pine(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2, 6), this._mat(0x6a4a2a));
    trunk.position.set(x, 1, z);
    this.scene.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8 - i * 0.45, 2.2, 7), this._mat(0x2a6a2a));
      cone.position.set(x, 2.6 + i * 1.5, z);
      this.scene.add(cone);
    }
  }

  _buildProps() {
    const rng = this.rng;
    // Palms along sidewalks (outer edge, never on the road).
    for (const L of ROADS) {
      for (let z = 20; z < 260; z += 34) {
        if (rng() < 0.7) this._palm(L + 8.2, z + rng() * 8);
        if (rng() < 0.5) this._palm(L - 8.2, z + 12 + rng() * 8);
      }
    }
    // Forest pines, desert cacti, hill rocks.
    for (let i = 0; i < 46; i++) this._pine(10 + rng() * 240, 268 + rng() * 120);
    for (let i = 0; i < 18; i++) {
      const cx = 268 + rng() * 120; const cz = 10 + rng() * 240;
      const cactus = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.2, 6), this._mat(0x3f8f3a));
      cactus.position.set(cx, 1.1, cz);
      this.scene.add(cactus);
    }
    for (let i = 0; i < 16; i++) {
      const rx = 268 + rng() * 120; const rz = 268 + rng() * 120;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + rng() * 2.5, 0), this._mat(0x8a7a68));
      rock.position.set(rx, 0.8, rz);
      rock.rotation.set(rng() * 3, rng() * 3, 0);
      this.scene.add(rock);
    }
    // Power poles + street lamps along the roads.
    for (const L of ROADS) {
      for (let z = 26; z < 260; z += 52) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), this._mat(0x4a3a2a));
        pole.position.set(L + 8.6, 3.5, z);
        this.scene.add(pole);
        const arm = this._box(2.2, 0.12, 0.12, 0x4a3a2a, L + 7.5, 6.9, z);
        void arm;
        const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0x000000 });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampMat);
        lamp.position.set(L + 6.5, 6.8, z);
        this.scene.add(lamp);
        this.lampMats.push(lampMat);
      }
    }
    // Bus stops with benches.
    const stops = [[65, 104], [117, 52], [169, 208], [221, 130], [91, 221], [195, 65]];
    for (const [sx, sz] of stops) {
      this.busStops.push({ x: sx + 6.4, z: sz });
      this._box(2.6, 0.5, 0.9, 0x8a5a3a, sx + 6.4, 0.5, sz);
      this._box(0.15, 2.6, 0.15, 0x3a5a8a, sx + 6.4, 1.3, sz + 1.2);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ map: signTexture('BUS', '#ffffff', '#2a6fd6') }));
      sign.position.set(sx + 6.4, 2.9, sz + 1.2);
      this.scene.add(sign);
    }
  }

  _buildTrafficLights() {
    for (const [cx, cz] of [[117, 117], [143, 169], [169, 143]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.4, 6), this._mat(0x2a2a2a));
      pole.position.set(cx + 6.2, 2.7, cz + 6.2);
      this.scene.add(pole);
      const box = this._box(0.7, 1.6, 0.5, 0x1a1a1a, cx + 6.2, 5.6, cz + 6.2);
      void box;
      const redMat = new THREE.MeshLambertMaterial({ color: 0x881111, emissive: 0xff2222, emissiveIntensity: 1.6 });
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), redMat);
      red.position.set(cx + 6.2, 5.95, cz + 6.5);
      this.scene.add(red);
      const greenMat = new THREE.MeshLambertMaterial({ color: 0x118844, emissive: 0x002200, emissiveIntensity: 0.25 });
      const green = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), greenMat);
      green.position.set(cx + 6.2, 5.35, cz + 6.5);
      this.scene.add(green);
      this.trafficLights.push({ red, green });
    }
  }

  update(dt, t = 0) {
    // Gentle wave motion + lamp glow at night.
    const night = this.weather ? this.weather.isNight() : false;
    for (let i = 0; i < this.waveStrips.length; i++) {
      const s = this.waveStrips[i];
      s.position.x = 6 + i * 1.6 + Math.sin(t * 0.7 + i * 1.3) * 0.5;
    }
    for (const m of this.lampMats) {
      m.emissive.setHex(night ? 0xffdf80 : 0x000000);
      m.emissiveIntensity = night ? 1.4 : 0;
    }
    void dt;
  }
}

// Terrain height at (x, z). The island is flat at y = 0; the sea floor
// west of the beach (x < 15) sits below the water plane.
export function groundHeight(x, z) {
  if (x < 15) return -0.4;
  return 0;
}
