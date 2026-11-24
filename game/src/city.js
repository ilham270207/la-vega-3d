// La Vega — City module (round 13 rebuild).
// Procedural city: layered ground (no z-fight), glass-facade buildings with
// planters, real sandy beach, harbour, airport, night market, animals,
// a real traffic-light system, day/night sky with a visible sun disc.
// No external assets, no GLB files, no copied code from other games.
import * as THREE from 'three';
import { WORLD, ROADS, STREET_NS, STREET_EW, DISTRICTS, PLACES, PLACE_DIMS, PALETTE, CITY_TUNING, BIOMES } from './config.js';
import { mulberry32, clamp, lerp, rand, pick, randInt } from './rng.js';

// Layer heights: ground < sand < road < sidewalk < marking. Each layer is a
// separate Y level plus polygonOffset, so nothing flickers while moving.
const L = { ground: 0.0, sea: -0.06, sand: 0.03, foam: 0.05, road: 0.06, sidewalk: 0.10, marking: 0.13, pad: 0.15 };

export function groundHeight(x, z) {
  if (x >= 4 && x <= 16 && z >= 124 && z <= 136) return 0.5; // wooden pier deck
  if (x < 15) return -0.4; // wading in the sea
  return 0;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(text, fg = '#ffe9a8', bg = '#141824') {
  return canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg; g.font = 'bold 52px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function neonTexture(text, fg = '#ff5df2') {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#0b0620'; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 64px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = fg; g.shadowBlur = 22;
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

// Facade variants: base colour, glass tint, floors drawn, window pattern.
const FACADE_VARIANTS = [
  { base: '#c8b49a', glass: '#3d6f8e', trim: '#8a7a63' },
  { base: '#9aa5ad', glass: '#2f5d7d', trim: '#6b7680' },
  { base: '#b98d6e', glass: '#466f8a', trim: '#8a6248' },
  { base: '#d8cdb4', glass: '#3a6a7f', trim: '#a89a7c' },
  { base: '#7e8b9a', glass: '#2c4f6e', trim: '#5c6672' },
  { base: '#c4a37e', glass: '#4a7a92', trim: '#96714f' },
];
function facadeTexture(variant, cols, rows) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = variant.base; g.fillRect(0, 0, w, h);
    // floor bands
    g.fillStyle = variant.trim;
    for (let r = 0; r <= rows; r++) g.fillRect(0, (r * h) / rows - 2, w, 4);
    // cornice + base
    g.fillRect(0, 0, w, 8); g.fillRect(0, h - 14, w, 14);
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.18, y = r * ch + ch * 0.22;
        const ww = cw * 0.64, wh = ch * 0.56;
        // glass with a simple vertical reflection gradient
        const grad = g.createLinearGradient(x, y, x, y + wh);
        grad.addColorStop(0, '#dfeef7'); grad.addColorStop(0.35, variant.glass); grad.addColorStop(1, '#1c3345');
        g.fillStyle = grad; g.fillRect(x, y, ww, wh);
        g.strokeStyle = '#20242a'; g.lineWidth = 2; g.strokeRect(x, y, ww, wh);
        // mullion cross
        g.beginPath(); g.moveTo(x + ww / 2, y); g.lineTo(x + ww / 2, y + wh);
        g.moveTo(x, y + wh / 2); g.lineTo(x + ww, y + wh / 2); g.stroke();
      }
    }
  });
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = opts.mat || new THREE.MeshLambertMaterial({ color, polygonOffset: !!opts.poly, polygonOffsetFactor: opts.poly ? -1 : 0, polygonOffsetUnits: opts.poly ? -1 : 0 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.userData) Object.assign(m.userData, opts.userData);
  return m;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.rng = mulberry32(1337);
    this._t = 0;
    this.weather = null;
    this.sidewalks = [];
    this.busStops = [];
    this.beachSpots = { fish: [], swim: [], jetski: [], sun: [] };
    this.colliders = [];
    this.lights = [];
    this.facadeStats = { windows: 0, planters: 0, litWindows: 0 };
    this._litMats = [];
    this._lampGlows = [];
    this._hqLights = [];
    this._foam = [];
    this._waveStrips = [];
    this._dogs = [];
    this._birds = [];
    this._manualRed = false;
    this._manualUntil = 0;
    this._sunDisc = null;
    this._sunGlow = null;
    this.sandZone = { x0: 15, x1: 32 };
    // enterable interiors: {name, door (world), room (interior), exit}
    this.interiors = [
      { name: 'Vega Arms', door: { x: 143, z: 124 }, room: { x: 375, z: 375 }, exit: { x: 375, z: 379.5 } },
      { name: 'Toko SPBU', door: { x: 44, z: 204 }, room: { x: 375, z: 25 }, exit: { x: 375, z: 28.5 } },
      { name: 'Garasi Manny', door: { x: 78, z: 163 }, room: { x: 25, z: 375 }, exit: { x: 25, z: 379.5 } },
    ];
    this._buildGround();
    this._buildRoads();
    this._buildBuildings();
    this._buildNamedPlaces();
    this._buildConstruction();
    this._buildInteriors();
    this._buildBeach();
    this._buildHarbour();
    this._buildAirport();
    this._buildTrafficLights();
    this._buildStreetProps();
    this._buildSky();
  }

  _add(mesh) { this.scene.add(mesh); return mesh; }
  _collider(x, z, r) { this.colliders.push({ x, z, r }); }

  // ---------- ground / sea / sand ----------
  _buildGround() {
    const rng = this.rng;
    // base grass (one single plane, layer 'ground')
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(440, 440),
      new THREE.MeshLambertMaterial({ color: PALETTE.grass, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 0 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(200, L.ground, 200);
    grass.userData.layer = 'ground';
    this._add(grass);
    // subtle darker grass patches for texture (single layer, no overlap)
    for (let i = 0; i < 10; i++) {
      const w = 30 + rng() * 50, d = 30 + rng() * 50;
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshLambertMaterial({ color: 0x7cbf55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      );
      p.rotation.x = -Math.PI / 2;
      p.position.set(40 + rng() * 320, L.ground + 0.005, 40 + rng() * 320);
      p.userData.layer = 'ground';
      this._add(p);
    }
    // sea (below sand level so the shoreline reads)
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 460),
      new THREE.MeshLambertMaterial({ color: PALETTE.sea })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(-20, L.sea, 200);
    sea.userData.layer = 'sea';
    this._add(sea);
    const deep = new THREE.Mesh(
      new THREE.PlaneGeometry(45, 460),
      new THREE.MeshLambertMaterial({ color: PALETTE.deep, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    );
    deep.rotation.x = -Math.PI / 2;
    deep.position.set(-32, L.sea - 0.02, 200);
    deep.userData.layer = 'sea';
    this._add(deep);
    // SAND: a clear, wide sand expanse along the whole west edge — two
    // tones so it reads as a real beach, not a flat strip: darker wet sand
    // at the waterline (x 15..20), lighter dry sand above it (x 20..32).
    // Sand colour is clearly different from the sea and from the road.
    const wet = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 420),
      new THREE.MeshLambertMaterial({ color: 0xd9b978, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    );
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(17.5, L.sand, 200);
    wet.userData.layer = 'sand';
    this._add(wet);
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 420),
      new THREE.MeshLambertMaterial({ color: 0xf7e3b0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(26, L.sand + 0.005, 200);
    sand.userData.layer = 'sand';
    this._add(sand);
    // sand texture: subtle lighter/darker patches + low dunes for grain
    for (let i = 0; i < 8; i++) {
      const pw = 8 + rng() * 12, pd = 14 + rng() * 26;
      const patch = new THREE.Mesh(
        new THREE.PlaneGeometry(pw, pd),
        new THREE.MeshLambertMaterial({ color: pick(rng, [0xe8c98a, 0xfbeec2, 0xecd096]), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(20 + rng() * 10, L.sand + 0.01, 15 + rng() * 380);
      patch.userData.layer = 'sand';
      this._add(patch);
    }
    for (let i = 0; i < 5; i++) {
      const dune = new THREE.Mesh(
        new THREE.SphereGeometry(2.2 + rng() * 1.6, 10, 6),
        new THREE.MeshLambertMaterial({ color: 0xefdb9e })
      );
      dune.scale.y = 0.22;
      dune.position.set(24 + rng() * 6, L.sand + 0.02, 30 + i * 72 + rng() * 20);
      this._add(dune);
    }
    // foam strips that drift in update() — two rows: surf line + waterline
    for (let i = 0; i < 8; i++) {
      const f = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 26),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      );
      f.rotation.x = -Math.PI / 2;
      f.position.set(14.6, L.foam + 0.01, 20 + i * 48 + rng() * 10);
      f.userData.layer = 'foam';
      f.userData.baseX = 14.6;
      this._foam.push(f);
      this._add(f);
    }
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      );
      f.rotation.x = -Math.PI / 2;
      f.position.set(15.9, L.foam + 0.015, 40 + i * 62 + rng() * 12);
      f.userData.layer = 'foam';
      f.userData.baseX = 15.9;
      this._foam.push(f);
      this._add(f);
    }
    // slow wave strips out in the sea
    for (let i = 0; i < 6; i++) {
      const wv = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 60),
        new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.3 })
      );
      wv.rotation.x = -Math.PI / 2;
      wv.position.set(2 - i * 2.4, L.sea + 0.01, 40 + i * 62);
      this._waveStrips.push(wv);
      this._add(wv);
    }
    // shells + starfish scattered on the sand
    for (let i = 0; i < 40; i++) {
      const sx = 17 + rng() * 11, sz = 6 + rng() * 388;
      if (rng() < 0.5) {
        const shell = new THREE.Mesh(
          new THREE.SphereGeometry(0.14 + rng() * 0.1, 6, 4),
          new THREE.MeshLambertMaterial({ color: pick(rng, [0xffffff, 0xffd9e8, 0xffe9c4]) })
        );
        shell.scale.y = 0.5;
        shell.position.set(sx, L.sand + 0.06, sz);
        this._add(shell);
      } else {
        const star = new THREE.Group();
        const sm = new THREE.MeshLambertMaterial({ color: 0xff9d6b });
        for (let a = 0; a < 5; a++) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.42), sm);
          arm.position.set(Math.sin((a / 5) * Math.PI * 2) * 0.18, 0, Math.cos((a / 5) * Math.PI * 2) * 0.18);
          arm.rotation.y = (a / 5) * Math.PI * 2;
          star.add(arm);
        }
        star.position.set(sx, L.sand + 0.06, sz);
        this._add(star);
      }
    }
  }

  // ---------- roads, sidewalks, markings ----------
  _buildRoads() {
    const rng = this.rng;
    // NS and EW layers sit on slightly different Y levels with different
    // polygonOffset factors, so overlapping planes at intersections never
    // z-fight (item 10).
    const roadMatNS = new THREE.MeshLambertMaterial({ color: PALETTE.road, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const roadMatEW = new THREE.MeshLambertMaterial({ color: PALETTE.road, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const walkMatNS = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const walkMatEW = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const dashMatNS = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const dashMatEW = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (const r of ROADS) {
      // NS road
      const ns = new THREE.Mesh(new THREE.PlaneGeometry(10, 262), roadMatNS);
      ns.rotation.x = -Math.PI / 2; ns.position.set(r, L.road, 130); ns.userData.layer = 'road';
      this._add(ns);
      const ew = new THREE.Mesh(new THREE.PlaneGeometry(262, 10), roadMatEW);
      ew.rotation.x = -Math.PI / 2; ew.position.set(130, L.road + 0.005, r); ew.userData.layer = 'road';
      this._add(ew);
      // centre dashes (NS + EW), one layer only, above the road plane
      for (let z = 8; z < 254; z += 8) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 3.4), dashMatNS);
        d.rotation.x = -Math.PI / 2; d.position.set(r, L.marking, z); d.userData.layer = 'marking';
        this._add(d);
      }
      for (let x = 8; x < 254; x += 8) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.35), dashMatEW);
        d.rotation.x = -Math.PI / 2; d.position.set(x, L.marking + 0.005, r); d.userData.layer = 'marking';
        this._add(d);
      }
      // sidewalks: two strips flanking each road, inside the grid
      for (const off of [-6.25, 6.25]) {
        const sw1 = { x0: r + off - 1.25, x1: r + off + 1.25, z0: 0, z1: 260 };
        const sw2 = { x0: 0, x1: 260, z0: r + off - 1.25, z1: r + off + 1.25 };
        this.sidewalks.push(sw1, sw2);
        const p1 = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 262), walkMatNS);
        p1.rotation.x = -Math.PI / 2; p1.position.set(r + off, L.sidewalk, 130); p1.userData.layer = 'sidewalk';
        this._add(p1);
        const p2 = new THREE.Mesh(new THREE.PlaneGeometry(262, 2.5), walkMatEW);
        p2.rotation.x = -Math.PI / 2; p2.position.set(130, L.sidewalk + 0.01, r + off); p2.userData.layer = 'sidewalk';
        this._add(p2);
      }
    }
    // crosswalks at lit intersections (white stripes, one layer)
    const cwMat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let i = 0; i < ROADS.length; i += 2) {
      for (let j = 0; j < ROADS.length; j += 2) {
        const x = ROADS[i], z = ROADS[j];
        for (let k = -2; k <= 2; k++) {
          const s1 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.6), cwMat);
          s1.rotation.x = -Math.PI / 2; s1.position.set(x + k * 1.4, L.marking + 0.002, z - 6.4); s1.userData.layer = 'marking';
          this._add(s1);
          const s2 = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.7), cwMat);
          s2.rotation.x = -Math.PI / 2; s2.position.set(x - 6.4, L.marking + 0.007, z + k * 1.4); s2.userData.layer = 'marking';
          this._add(s2);
        }
      }
    }
    // bus stops (6): shelter + bench + sign
    const stops = [[52, 39], [130, 91], [208, 143], [91, 208], [169, 65], [247, 221]];
    for (const [bx, bz] of stops) {
      const g = new THREE.Group();
      g.add(box(4, 0.15, 2, 0x3a6ea5, 0, 2.6, 0));
      g.add(box(0.18, 2.6, 0.18, 0x555c66, -1.9, 1.3, -0.9));
      g.add(box(0.18, 2.6, 0.18, 0x555c66, 1.9, 1.3, -0.9));
      g.add(box(3.4, 0.5, 0.9, 0x8a5a2b, 0, 0.7, -0.5));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: signTexture('BUS', '#ffffff', '#2563eb') }));
      sign.position.set(2.3, 2.2, 0); sign.rotation.y = Math.PI / 4;
      g.add(sign);
      g.position.set(bx, 0, bz);
      this._add(g);
      this.busStops.push({ x: bx, z: bz });
    }
  }

  // ---------- buildings with glass facades + planters ----------
  _planter(x, z, scale = 1) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42 * scale, 0.32 * scale, 0.55 * scale, 8),
      new THREE.MeshLambertMaterial({ color: 0xb5653a })
    );
    pot.position.y = 0.28 * scale;
    g.add(pot);
    const shrub = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55 * scale, 1),
      new THREE.MeshLambertMaterial({ color: pick(this.rng, [0x3f8f3a, 0x57a84e, 0x2f7d33]) })
    );
    shrub.position.y = 0.85 * scale;
    shrub.scale.y = 0.85;
    g.add(shrub);
    g.position.set(x, 0, z);
    this._add(g);
    this.facadeStats.planters++;
    return g;
  }

  _palm(x, z, h = 5) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.22, h, 6),
      new THREE.MeshLambertMaterial({ color: 0x8a6b48 })
    );
    trunk.position.y = h / 2;
    trunk.rotation.z = 0.06;
    g.add(trunk);
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.4), frondMat);
      const a = (i / 7) * Math.PI * 2;
      f.position.set(Math.cos(a) * 0.9, h + 0.15, Math.sin(a) * 0.9);
      f.rotation.set(Math.sin(a) * 0.9, a, -Math.cos(a) * 0.9);
      g.add(f);
    }
    const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), new THREE.MeshLambertMaterial({ color: 0x6b4f2a }));
    nuts.position.y = h - 0.1;
    g.add(nuts);
    g.position.set(x, 0, z);
    this._add(g);
    return g;
  }

  _pine(x, z, h = 6) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x6b4f2a }));
    trunk.position.y = 0.6;
    g.add(trunk);
    const mat = new THREE.MeshLambertMaterial({ color: 0x1f6b2e });
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5 - i * 0.42, 2.2, 8), mat);
      cone.position.y = 1.8 + i * 1.5;
      g.add(cone);
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(h / 6);
    this._add(g);
    return g;
  }

  _makeBuilding(cx, cz, w, d, h, opts = {}) {
    const rng = this.rng;
    const variant = opts.variant || pick(rng, FACADE_VARIANTS);
    const cols = Math.max(2, Math.round(w / 2.6));
    const rows = Math.max(2, Math.round(h / 3.2));
    const tex = facadeTexture(variant, cols, rows);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const sideMat = new THREE.MeshLambertMaterial({ map: tex });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat]);
    mesh.position.set(cx, h / 2, cz);
    mesh.userData.building = true;
    this._add(mesh);
    this.facadeStats.windows += cols * rows * 2; // two visible faces counted
    // ground-floor shopfront: darker base + door + awning
    const base = box(w * 0.96, 2.6, d * 0.96, 0x2e3138, cx, 1.3, cz, { userData: { building: true } });
    this._add(base);
    // entrance: steps + framed glass door + awning (clear, readable entry)
    this._add(box(2.4, 0.18, 0.9, 0x8a8f96, cx, 0.09, cz + d / 2 + 0.6));
    this._add(box(2.0, 0.18, 0.7, 0x9aa0a8, cx, 0.27, cz + d / 2 + 0.5));
    const doorFrame = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.7),
      new THREE.MeshLambertMaterial({ color: 0x2a2e35 })
    );
    doorFrame.position.set(cx, 1.35, cz + d / 2 + 0.02);
    this._add(doorFrame);
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x8fd3ff, emissive: 0x1a3a4a })
    );
    door.position.set(cx, 1.1, cz + d / 2 + 0.03);
    this._add(door);
    const awning = box(w * 0.7, 0.18, 1.1, pick(rng, [0xc23b3b, 0x2b6cb0, 0x2f9e44, 0xd9a441]), cx, 2.9, cz + d / 2 + 0.5);
    this._add(awning);
    // balconies on taller buildings (slab + railing, front face)
    if (h >= 12) {
      const nBal = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < nBal; i++) {
        const bx = cx - w / 2 + 1.2 + rng() * (w - 2.4);
        const by = 5 + rng() * Math.max(1, h - 7);
        this._add(box(1.7, 0.14, 0.8, 0x8a8f96, bx, by, cz + d / 2 + 0.4));
        this._add(box(1.7, 0.7, 0.06, 0x3a3f47, bx, by + 0.45, cz + d / 2 + 0.78));
        for (const rx of [-0.8, 0.8]) this._add(box(0.06, 0.7, 0.06, 0x3a3f47, bx + rx, by + 0.45, cz + d / 2 + 0.78));
      }
    }
    // wall-mounted AC units + vents on the facade
    const nAC = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < nAC; i++) {
      const ax = cx - w / 2 + 1 + rng() * (w - 2);
      const ay = 3.5 + rng() * Math.max(1, h - 5);
      this._add(box(0.8, 0.55, 0.45, 0x9aa0a8, ax, ay, cz + d / 2 + 0.22));
      this._add(box(0.7, 0.08, 0.05, 0x555a63, ax, ay, cz + d / 2 + 0.46));
    }
    if (rng() < 0.4) {
      // roof vent pipe
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 6), new THREE.MeshLambertMaterial({ color: 0x888888 }));
      vent.position.set(cx + w * 0.3, h + 0.7, cz - d * 0.2);
      this._add(vent);
    }
    // roof variation: parapet / setback tier / AC boxes / antenna / water tank
    const roofKind = pick(rng, ['parapet', 'tier', 'ac', 'antenna', 'tank']);
    if (roofKind === 'parapet') {
      this._add(box(w + 0.2, 0.7, 0.3, 0x555a63, cx, h + 0.35, cz + d / 2));
      this._add(box(w + 0.2, 0.7, 0.3, 0x555a63, cx, h + 0.35, cz - d / 2));
    } else if (roofKind === 'tier') {
      this._add(box(w * 0.55, h * 0.22, d * 0.55, variant.base, cx, h + h * 0.11, cz, { userData: { building: true } }));
    } else if (roofKind === 'ac') {
      this._add(box(1.6, 0.9, 1.2, 0x9aa0a8, cx - w * 0.22, h + 0.45, cz));
      this._add(box(1.2, 0.7, 1.0, 0x7d838c, cx + w * 0.25, h + 0.35, cz - d * 0.2));
    } else if (roofKind === 'antenna') {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 4, 5), new THREE.MeshLambertMaterial({ color: 0x888888 }));
      a.position.set(cx + w * 0.3, h + 2, cz);
      this._add(a);
    } else {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 10), new THREE.MeshLambertMaterial({ color: 0x6b5d4f }));
      t.position.set(cx - w * 0.25, h + 1.4, cz);
      this._add(t);
    }
    // lit windows at night: a few warm emissive panes on the front face
    const litCount = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < litCount; i++) {
      const lm = new THREE.MeshBasicMaterial({ color: 0xffd27a });
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.3), lm);
      const lx = cx - w / 2 + 1 + rng() * (w - 2);
      const ly = 4 + rng() * Math.max(1, h - 6);
      pane.position.set(lx, ly, cz + d / 2 + 0.04);
      pane.visible = false;
      this._litMats.push(pane);
      this._add(pane);
      this.facadeStats.litWindows++;
    }
    // planters + shrubs at the base (front corners + sides)
    const nPlant = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < nPlant; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      this._planter(cx + side * (w / 2 - 0.8) + (rng() - 0.5) * 1.5, cz + d / 2 + 0.9, 0.9 + rng() * 0.4);
    }
    if (rng() < 0.5) this._planter(cx - w / 2 - 0.9, cz + (rng() - 0.5) * d * 0.6);
    // sign board for named places
    if (opts.sign) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(9, opts.sign.length * 0.62 + 1), 1.7),
        new THREE.MeshBasicMaterial({ map: signTexture(opts.sign, opts.signFg || '#ffe9a8', opts.signBg || '#141824') })
      );
      s.position.set(cx, Math.min(h - 1.2, 6.5), cz + d / 2 + 0.06);
      this._add(s);
    }
    if (opts.neon) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(6.5, 1.7),
        new THREE.MeshBasicMaterial({ map: neonTexture(opts.neon, opts.neonColor || '#ff5df2') })
      );
      s.position.set(cx, Math.min(h - 1.2, 7.5), cz + d / 2 + 0.06);
      this._add(s);
    }
    this._collider(cx, cz, Math.max(w, d) * 0.68);
    return mesh;
  }

  _buildBuildings() {
    const rng = this.rng;
    const mids = [];
    for (let i = 0; i < ROADS.length - 1; i++) mids.push((ROADS[i] + ROADS[i + 1]) / 2);
    // named-place blocks to skip in the generic pass (bespoke builders own them)
    const skip = new Set();
    for (const key of ['club', 'casino', 'cityHall', 'hospital', 'mall', 'garage', 'workshop', 'gas', 'dealer', 'gunShop', 'station', 'bank', 'jewelry', 'minimarket', 'clotheshop', 'salon', 'tattoo', 'petshop', 'restaurant', 'villa', 'villaDelMar', 'safehouse', 'warehouse']) {
      const p = PLACES[key];
      if (p) skip.add(`${Math.round(p.x / 26)}_${Math.round(p.z / 26)}`);
    }
    skip.add('4_3'); // park block (104,78)
    skip.add('0_5'); // harbour handled separately
    skip.add('8_8'); // construction site block (208,208)
    for (const bx of mids) {
      for (const bz of mids) {
        if (bx < 30 || bz < 30) continue; // keep the beach strip clear
        if (skip.has(`${Math.round(bx / 26)}_${Math.round(bz / 26)}`)) continue;
        const downtown = bx >= 130 && bz <= 130;
        const h = downtown ? 12 + rng() * 22 : 7 + rng() * 9;
        const w = 8 + rng() * 3, d = 8 + rng() * 3;
        if (rng() < CITY_TUNING.parkChance) {
          // pocket park instead of a building
          this._add(box(w, 0.4, d, 0x69b455, bx, 0.2, bz));
          this._palm(bx - 2, bz - 2, 4 + rng() * 2);
          this._palm(bx + 2, bz + 2, 4 + rng() * 2);
          this._pine(bx + 2, bz - 2, 5);
          this._add(box(3, 0.5, 1, 0x8a5a2b, bx, 0.45, bz + 3));
          continue;
        }
        this._makeBuilding(bx, bz, w, d, h);
      }
    }
  }

  // ---------- named places (bespoke) ----------
  _buildNamedPlaces() {
    const P = PLACES, D = PLACE_DIMS;
    const mk = (key, opts) => {
      const p = P[key]; if (!p) return;
      const dd = D[key] || {};
      this._makeBuilding(p.x, p.z, dd.w || 14, dd.d || 12, dd.h || 10, opts);
    };
    mk('club', { sign: "LA ROSA'S", neon: 'CLUB', neonColor: '#ff5df2' });
    mk('casino', { sign: 'NEON PALM', neon: 'CASINO', neonColor: '#ffd24a' });
    mk('cityHall', { sign: 'CITY HALL' });
    mk('hospital', { sign: 'ST. MARIA', signBg: '#123a5c' });
    mk('mall', { sign: 'VEGA MALL' });
    mk('garage', { sign: "MANNY'S GARAGE", signBg: '#3a2a12' });
    mk('workshop', { sign: 'TUNE-UP', signBg: '#2a2a2a' });
    mk('dealer', { sign: 'VEGA MOTORS', signBg: '#1a2a4a' });
    mk('gunShop', { sign: 'VEGA ARMS', signBg: '#2a1a1a' });
    mk('station', { sign: 'LVPD', signBg: '#1a2a6a', signFg: '#cfe4ff' });
    mk('bank', { sign: 'VEGA BANK' });
    mk('jewelry', { sign: 'DIAMOND ROW', signBg: '#3a2a4a' });
    mk('minimarket', { sign: 'MINI MART' });
    mk('clotheshop', { sign: 'THREADS', signBg: '#4a2a5a' });
    mk('salon', { sign: 'GLOW SALON', signBg: '#5a2a4a' });
    mk('tattoo', { sign: 'INK HOUSE', signBg: '#1a1a1a' });
    mk('petshop', { sign: 'PAWS', signBg: '#2a4a2a' });
    mk('restaurant', { sign: 'MARINA GRILL' });
    mk('villa', { sign: 'VILLA SOL' });
    mk('villaDelMar', { sign: 'BEACH HOUSE' });
    mk('safehouse', { sign: 'SAFEHOUSE', signBg: '#2a3a2a' });
    mk('warehouse', { sign: 'OLD CANNERY' });
    // LVPD headquarters: bigger complex — annex tower, flag pole, two
    // parked police cars out front, flashing red/blue roof lights
    const st = P.station;
    if (st) {
      this._makeBuilding(st.x - 16, st.z + 2, 10, 10, 18, { sign: 'LVPD HQ', signBg: '#1a2a6a', signFg: '#cfe4ff' });
      // flag pole + blue flag
      const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 11, 6), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      fp.position.set(st.x + 8, 5.5, st.z - 10);
      this._add(fp);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshLambertMaterial({ color: 0x2b4a9e, side: THREE.DoubleSide }));
      flag.position.set(st.x + 9.3, 10.2, st.z - 10);
      this._add(flag);
      // two parked police cars (static props)
      for (const [px, pz, ry] of [[st.x - 6, st.z - 12, 0], [st.x + 2, st.z - 12, 0]]) {
        const pc = new THREE.Group();
        pc.add(box(1.9, 0.65, 4.4, 0xf2f2f2, 0, 0.55, 0));
        pc.add(box(1.7, 0.55, 2.2, 0x1a2a3a, 0, 1.15, -0.2));
        pc.add(box(1.9, 0.1, 4.4, 0x1a2a3a, 0, 0.85, 0));
        for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 8), new THREE.MeshLambertMaterial({ color: 0x111111 }));
          wh.rotation.z = Math.PI / 2;
          wh.position.set(wx, 0.34, wz);
          pc.add(wh);
        }
        const redMat = new THREE.MeshBasicMaterial({ color: 0xff2d2d });
        const blueMat = new THREE.MeshBasicMaterial({ color: 0x2d6bff });
        const rb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), redMat);
        rb.position.set(-0.3, 1.55, -0.2);
        pc.add(rb);
        const bb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), blueMat);
        bb.position.set(0.3, 1.55, -0.2);
        pc.add(bb);
        this._hqLights.push({ redMat, blueMat });
        pc.position.set(px, 0, pz);
        pc.rotation.y = ry;
        this._add(pc);
      }
      // roof light bar on the HQ itself
      const hqRed = new THREE.MeshBasicMaterial({ color: 0xff2d2d });
      const hqBlue = new THREE.MeshBasicMaterial({ color: 0x2d6bff });
      const hqr = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.5), hqRed);
      hqr.position.set(st.x - 16, 19, st.z + 2 + 5.1);
      this._add(hqr);
      const hqb = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.5), hqBlue);
      hqb.position.set(st.x - 16, 19, st.z + 2 - 5.1);
      this._add(hqb);
      this._hqLights.push({ redMat: hqRed, blueMat: hqBlue });
    }
    // gas station: canopy + pumps + big sign (bespoke, not a box building)
    const gas = P.gas;
    if (gas) {
      const canopy = box(16, 0.6, 10, 0xe8e8e8, gas.x, 5.4, gas.z);
      this._add(canopy);
      for (const [px, pz] of [[-6, -3], [6, -3], [-6, 3], [6, 3]]) {
        this._add(box(0.35, 5.4, 0.35, 0x888888, gas.x + px, 2.7, gas.z + pz));
      }
      for (const [px, pz] of [[-3, 0], [3, 0]]) {
        this._add(box(1.1, 1.5, 0.7, 0xc23b3b, gas.x + px, 0.75, gas.z + pz));
      }
      const gs = new THREE.Mesh(new THREE.PlaneGeometry(9, 2), new THREE.MeshBasicMaterial({ map: signTexture('PETRO VEGA', '#ffffff', '#c23b3b') }));
      gs.position.set(gas.x, 6.6, gas.z + 5.1);
      this._add(gs);
      this._add(box(8, 3.5, 6, 0xd8cdb4, gas.x + 14, 1.75, gas.z, { userData: { building: true } }));
      this._collider(gas.x + 14, gas.z, 5);
      this._collider(gas.x, gas.z, 8);
    }
    // park (104,78): lawn, palms, benches, paths — NO ramps, NO yellow blocks
    const park = P.park;
    if (park) {
      this._add(box(22, 0.4, 18, 0x69b455, park.x, 0.2, park.z));
      for (const [px, pz] of [[-8, -6], [8, -6], [-8, 6], [8, 6], [0, -7], [0, 7]]) this._palm(park.x + px, park.z + pz, 4.5 + this.rng() * 1.5);
      for (const [px, pz] of [[-5, 0], [5, 0], [0, -3], [0, 3]]) this._add(box(3, 0.5, 1, 0x8a5a2b, park.x + px, 0.45, park.z + pz));
      this._planter(park.x - 10, park.z - 8);
      this._planter(park.x + 10, park.z + 8);
    }
    // street trees along sidewalks
    for (let i = 0; i < 40; i++) {
      const road = pick(this.rng, ROADS);
      const along = 10 + this.rng() * 240;
      if (this.rng() < 0.5) this._palm(road + (this.rng() < 0.5 ? -8 : 8), along, 4 + this.rng() * 2);
      else this._pine(along, road + (this.rng() < 0.5 ? -8 : 8), 4 + this.rng() * 2);
    }
  }

  // ---------- construction site (208,208): half-built tower + crane ----------
  _buildConstruction() {
    const cx = 208, cz = 208;
    const conc = new THREE.MeshLambertMaterial({ color: 0x9a938a });
    const concDark = new THREE.MeshLambertMaterial({ color: 0x7d766d });
    // half-finished concrete frame: columns + 2 floor slabs + stair core
    for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, -4], [0, 4]]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, 9, 0.7), conc);
      col.position.set(cx + ox, 4.5, cz + oz);
      this._add(col);
    }
    for (const fy of [4.5, 9]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 11), concDark);
      slab.position.set(cx, fy, cz);
      this._add(slab);
    }
    const core = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 3), conc);
    core.position.set(cx - 2, 4.5, cz + 2);
    this._add(core);
    // exposed rebar sticking out of the top slab
    for (let i = 0; i < 8; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
      bar.position.set(cx - 4 + (i % 4) * 2.6, 10, cz - 4 + Math.floor(i / 4) * 8);
      this._add(bar);
    }
    // scaffolding on the east face: poles + planks
    for (let sx = -5; sx <= 5; sx += 2.5) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 9, 4), new THREE.MeshLambertMaterial({ color: 0xc7a23a }));
      pole.position.set(cx + 5.6, 4.5, cz + sx);
      this._add(pole);
    }
    for (const py of [3, 6, 8.6]) {
      const plank = box(0.9, 0.12, 11, 0xa97c50, cx + 5.6, py, cz);
      this._add(plank);
    }
    // tower crane: mast + jib + counter-jib + hook + hanging block
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 1.2), new THREE.MeshLambertMaterial({ color: 0xd9a441 }));
    mast.position.set(cx - 9, 11, cz - 9);
    this._add(mast);
    const jib = box(18, 0.8, 0.8, 0xd9a441, cx - 2, 22.2, cz - 9);
    this._add(jib);
    const cjib = box(7, 0.8, 0.8, 0xd9a441, cx - 15.5, 22.2, cz - 9);
    this._add(cjib);
    const cweight = box(1.5, 2, 1.5, 0x555a63, cx - 18.5, 21, cz - 9);
    this._add(cweight);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 9, 4), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    cable.position.set(cx + 4, 17.5, cz - 9);
    this._add(cable);
    const load = box(1.6, 1.6, 1.6, 0x9a938a, cx + 4, 12.6, cz - 9);
    this._add(load);
    // project fence (orange/white barriers) around the site
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0xe87b1e });
    for (let f = -12; f <= 12; f += 3) {
      this._add(box(2.8, 1.1, 0.12, 0xe87b1e, cx + f, 0.55, cz - 12.5));
      this._add(box(2.8, 1.1, 0.12, 0xe87b1e, cx + f, 0.55, cz + 12.5));
      this._add(box(0.12, 1.1, 2.8, 0xe87b1e, cx - 12.5, 0.55, cz + f));
      this._add(box(0.12, 1.1, 2.8, 0xe87b1e, cx + 12.5, 0.55, cz + f));
    }
    // materials: concrete blocks, rebar bundles, cement bags
    for (let i = 0; i < 6; i++) this._add(box(1.2, 0.6, 0.6, 0x8a8378, cx - 10 + (i % 3) * 1.4, 0.3 + Math.floor(i / 3) * 0.65, cz + 10));
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5, 5), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
      bar.rotation.z = Math.PI / 2;
      bar.position.set(cx + 9, 0.2 + i * 0.16, cz + 9 + i * 0.1);
      this._add(bar);
    }
    for (let i = 0; i < 5; i++) this._add(box(0.9, 0.5, 0.6, 0xcbb28a, cx - 11 + (i % 3) * 1.1, 0.25 + Math.floor(i / 3) * 0.55, cz + 5));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshBasicMaterial({ map: signTexture('PROYEK', '#1a1a1a', '#ffd24a') }));
    sign.position.set(cx, 2.2, cz - 12.4);
    this._add(sign);
    this._collider(cx, cz, 7);
    this._collider(cx - 9, cz - 9, 1.5);
  }

  // ---------- enterable interiors (open-top rooms in the far corners) ----------
  _room(cx, cz, w, d, floorColor) {
    // floor + 4 walls (no ceiling — the camera looks over the walls)
    this._add(box(w, 0.3, d, floorColor, cx, 0.15, cz));
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xd8cdb4 });
    const walls = [
      { x: cx, z: cz - d / 2, w, d: 0.4 }, // north
      { x: cx, z: cz + d / 2 - 2.2, w: w / 2 - 1.1, d: 0.4 }, // south-left (door gap)
      { x: cx, z: cz + d / 2 + 2.2, w: w / 2 - 1.1, d: 0.4 }, // south-right (door gap)
      { x: cx - w / 2, z: cz, w: 0.4, d }, // west
      { x: cx + w / 2, z: cz, w: 0.4, d }, // east
    ];
    for (const wl of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(wl.w, 3.5, wl.d), wallMat);
      m.position.set(wl.x, 1.75, wl.z);
      this._add(m);
    }
    // door frame on the south wall (the exit zone)
    this._add(box(0.3, 3.2, 0.5, 0x6b4f2a, cx - 1.2, 1.6, cz + d / 2));
    this._add(box(0.3, 3.2, 0.5, 0x6b4f2a, cx + 1.2, 1.6, cz + d / 2));
    this._add(box(2.7, 0.4, 0.5, 0x6b4f2a, cx, 3.3, cz + d / 2));
    // wall colliders (leave the door gap open)
    for (const [ox, oz] of [[-w / 4, -d / 2], [w / 4, -d / 2], [-w / 2, -d / 4], [-w / 2, d / 4], [w / 2, -d / 4], [w / 2, d / 4], [-w / 2 + 1, d / 2], [w / 2 - 1, d / 2]]) {
      this._collider(cx + ox, cz + oz, 1.8);
    }
  }

  _buildInteriors() {
    // --- Vega Arms gun shop (375,375): counter + wall weapon racks ---
    this._room(375, 375, 12, 10, 0x8a7a63);
    this._add(box(6, 1.1, 1.2, 0x5a4632, 375, 0.55, 372));
    for (let i = 0; i < 4; i++) {
      const rack = box(2.2, 0.15, 0.5, 0x6b4f2a, 371 + i * 2.6, 2.0, 370.3);
      this._add(rack);
      const gun = box(0.12, 0.5, 1.4, 0x1a1c20, 371 + i * 2.6, 2.4, 370.3);
      gun.rotation.x = 0.4;
      this._add(gun);
    }
    for (let i = 0; i < 5; i++) this._add(box(0.8, 0.6, 0.6, 0x2f6b2f, 379.5, 0.3 + Math.floor(i / 3) * 0.65, 377 + (i % 3) * 1.1));
    const gs = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.9), new THREE.MeshBasicMaterial({ map: signTexture('VEGA ARMS', '#ffe9a8', '#2a1a1a') }));
    gs.position.set(375, 2.8, 370.2);
    this._add(gs);
    // --- SPBU shop (375,25): shelves + fridge + counter ---
    this._room(375, 25, 10, 8, 0xb8a88a);
    for (const [sx, sz] of [[371, 22], [375, 22], [379, 22]]) {
      this._add(box(3, 1.8, 0.8, 0x8a5a2b, sx, 0.9, sz));
      this._add(box(2.8, 0.3, 0.7, 0xc23b3b, sx, 1.5, sz));
      this._add(box(2.8, 0.3, 0.7, 0x2b6cb0, sx, 1.1, sz));
    }
    this._add(box(1.4, 2.2, 1.0, 0xe8e8e8, 379.5, 1.1, 27.5));
    this._add(box(1.2, 0.9, 0.9, 0x5a4632, 372, 0.45, 27.5));
    // --- Manny's garage (25,375): benches + tires + lift + display car ---
    this._room(25, 375, 14, 10, 0x7d766d);
    this._add(box(4, 1.0, 1.2, 0x3a3f47, 20, 0.5, 371.5));
    this._add(box(3, 1.0, 1.2, 0x3a3f47, 30, 0.5, 371.5));
    for (let i = 0; i < 4; i++) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      tire.position.set(19, 0.35 + i * 0.32, 378);
      this._add(tire);
    }
    this._add(box(3, 0.4, 6, 0x2b6cb0, 27, 0.2, 376));
    const dc = new THREE.Group();
    dc.add(box(1.9, 0.7, 4.4, 0xc23b3b, 0, 0.6, 0));
    dc.add(box(1.7, 0.55, 2.0, 0x18242e, 0, 1.2, -0.2));
    dc.position.set(25, 0.4, 376);
    this._add(dc);
    const gsign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.9), new THREE.MeshBasicMaterial({ map: signTexture("MANNY'S GARAGE", '#ffe9a8', '#3a2a12') }));
    gsign.position.set(25, 2.8, 370.2);
    this._add(gsign);
  }

  // ---------- beach props (umbrellas, chairs, lifeguard tower) ----------
  _buildBeach() {
    const rng = this.rng;
    // Beach NPCs = JETSKI ONLY (ilham: no sunbathing / lying NPCs on the
    // beach — the lying bodies under umbrellas looked like a glitch).
    // fish / swim / sun stay EMPTY on purpose: characters.js iterates these
    // arrays, so empty arrays simply spawn no NPCs of those kinds.
    for (let i = 0; i < 6; i++) {
      this.beachSpots.jetski.push({ x: 8 + rng() * 4, z: 60 + i * 36 });
    }
    // umbrellas + beach chairs
    const umbrellaColors = [0xff5d5d, 0x4a90e2, 0xffd24a, 0x7ed957, 0xff8ac2];
    for (let i = 0; i < 10; i++) {
      const ux = 19 + rng() * 8, uz = 20 + i * 36 + rng() * 8;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      pole.position.set(ux, 1.1, uz);
      this._add(pole);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 8), new THREE.MeshLambertMaterial({ color: umbrellaColors[i % umbrellaColors.length] }));
      canopy.position.set(ux, 2.4, uz);
      this._add(canopy);
      const chair = box(0.7, 0.5, 1.4, 0x3a6ea5, ux + 1.6, 0.25, uz + 0.8, { ry: rng() * Math.PI });
      this._add(chair);
    }
    // surfboards stuck in the sand
    for (let i = 0; i < 4; i++) {
      const b = box(0.5, 1.9, 0.08, pick(rng, [0xff8ac2, 0x4a90e2, 0xffd24a]), 20 + rng() * 7, 0.95, 90 + i * 70);
      b.rotation.z = 0.25;
      this._add(b);
    }
    // lifeguard tower
    const lg = new THREE.Group();
    for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3, 5), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      leg.position.set(lx, 1.5, lz);
      lg.add(leg);
    }
    lg.add(box(2.4, 0.3, 2.2, 0xffffff, 0, 3.1, 0));
    lg.add(box(2.2, 1.4, 2.0, 0xff5d5d, 0, 4.0, 0));
    lg.add(box(2.6, 0.2, 2.4, 0xffd24a, 0, 4.9, 0));
    lg.position.set(23, 0, 100);
    this._add(lg);
    // beach bollards: a vehicle barrier along the sand edge (x = 30.5)
    const bolMat = new THREE.MeshLambertMaterial({ color: 0xd9a441 });
    for (let z = 4; z < 400; z += 6) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.0, 8), bolMat);
      b.position.set(30.5, 0.5, z);
      this._add(b);
    }
  }

  // ---------- harbour: pier, ship, containers, cranes, warehouse ----------
  _buildHarbour() {
    const rng = this.rng;
    // wooden pier: walkable deck into the sea (groundHeight returns 0.5 here)
    const pierMat = new THREE.MeshLambertMaterial({ color: PALETTE.pier });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 12), pierMat);
    deck.position.set(10, 0.25, 130);
    this._add(deck);
    for (let x = 5; x <= 15; x += 2) {
      for (const dz of [-5.5, 5.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 5), new THREE.MeshLambertMaterial({ color: 0x6b4f2a }));
        post.position.set(x, -0.3, 130 + dz);
        this._add(post);
      }
    }
    for (const dz of [-5.8, 5.8]) {
      const rail = box(12, 0.12, 0.12, 0x8a6b48, 10, 1.05, 130 + dz);
      this._add(rail);
    }
    // docked ship (procedural, in the water)
    const ship = new THREE.Group();
    const hull = box(10, 3, 26, 0x2b4a6b, 0, 0.6, 0);
    ship.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(5, 6, 4), new THREE.MeshLambertMaterial({ color: 0x2b4a6b }));
    bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.6, 16);
    bow.scale.set(1, 1, 0.6);
    ship.add(bow);
    ship.add(box(7, 2.5, 10, 0xe8e8e8, 0, 3.2, -4));
    ship.add(box(1.6, 4, 1.6, 0xc23b3b, 0, 4.5, -9));
    for (let i = 0; i < 3; i++) ship.add(box(2.4, 2.2, 2.4, pick(rng, [0xc23b3b, 0x2b6cb0, 0xd9a441]), -2.6 + i * 2.6, 3.2, 4));
    ship.position.set(2, -0.2, 158);
    this._add(ship);
    // stacked containers on the quay
    const contColors = [0xc23b3b, 0x2b6cb0, 0xd9a441, 0x2f9e44, 0x8a5a2b];
    for (let s = 0; s < 5; s++) {
      const cx = 34 + s * 7, cz = 112 + (s % 2) * 22;
      const layers = 2 + Math.floor(rng() * 2);
      for (let l = 0; l < layers; l++) {
        const c = box(5.6, 2.4, 2.4, contColors[(s + l) % contColors.length], cx, 1.2 + l * 2.45, cz, { ry: s % 2 === 0 ? 0 : 0.02 });
        this._add(c);
      }
      this._collider(cx, cz, 3.4);
    }
    // two gantry cranes
    for (const [cx, cz] of [[32, 118], [32, 142]]) {
      const g = new THREE.Group();
      for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 14, 6), new THREE.MeshLambertMaterial({ color: 0xd9a441 }));
        leg.position.set(lx, 7, lz);
        g.add(leg);
      }
      g.add(box(4.5, 1, 4.5, 0xd9a441, 0, 14.2, 0));
      const jib = box(16, 0.9, 0.9, 0xd9a441, -6, 15.4, 0);
      g.add(jib);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 7, 4), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      cable.position.set(-12, 11.5, 0);
      g.add(cable);
      const hook = box(1.2, 1, 1.2, 0x333333, -12, 7.8, 0);
      g.add(hook);
      g.position.set(cx, 0, cz);
      this._add(g);
      this._collider(cx, cz, 3.2);
    }
    // harbour warehouse
    this._add(box(18, 7, 12, 0x8a7a63, 46, 3.5, 130, { userData: { building: true } }));
    this._add(box(18.4, 0.8, 12.4, 0x555a63, 46, 7.4, 130));
    this._collider(46, 130, 10);
  }

  // ---------- airport (330,130): runway, terminal, tower, parked planes ----------
  _buildAirport() {
    const rng = this.rng;
    // runway (dark strip) + threshold bars + centreline; tarmac around
    // (330,130) stays clear of colliders for r=40 so driving probes pass
    const runwayMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const runway = new THREE.Mesh(new THREE.PlaneGeometry(96, 12), runwayMat);
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(348, L.road + 0.002, 130);
    runway.userData.layer = 'runway';
    this._add(runway);
    const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let x = 306; x < 392; x += 8) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.4), markMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, L.marking, 130);
      this._add(d);
    }
    for (const tx of [304, 388]) {
      for (let k = -2; k <= 2; k++) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), markMat);
        bar.rotation.x = -Math.PI / 2;
        bar.position.set(tx, L.marking, 130 + k * 2.2);
        this._add(bar);
      }
    }
    // terminal: glass front + sign
    const term = box(20, 8, 14, 0xd8d3c8, 362, 4, 104, { userData: { building: true } });
    this._add(term);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 5),
      new THREE.MeshLambertMaterial({ color: 0x3d6f8e, emissive: 0x0e2a3a })
    );
    glass.position.set(362, 3.6, 104 - 7.05);
    glass.rotation.y = Math.PI;
    this._add(glass);
    const ts = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: signTexture('LA VEGA AIR', '#cfe4ff', '#1a2a4a') }));
    ts.position.set(362, 9.2, 104 - 7.05);
    ts.rotation.y = Math.PI;
    this._add(ts);
    this._collider(362, 104, 11);
    // control tower: cylinder + glass cab + antenna
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 18, 10), new THREE.MeshLambertMaterial({ color: 0xd8d3c8 }));
    tower.position.set(372, 9, 156);
    this._add(tower);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.6, 3, 10), new THREE.MeshLambertMaterial({ color: 0x2f5d7d, emissive: 0x12303f }));
    cab.position.set(372, 19.5, 156);
    this._add(cab);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5, 5), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    ant.position.set(372, 23, 156);
    this._add(ant);
    this._collider(372, 156, 3.5);
    // two parked planes (procedural)
    for (const [px, pz, ry] of [[345, 105, 0.3], [352, 162, -0.4]]) {
      const plane = new THREE.Group();
      const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 9, 10), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      fus.rotation.x = Math.PI / 2;
      fus.position.y = 1.6;
      plane.add(fus);
      const nose = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 6), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      nose.position.set(0, 1.6, 4.5);
      plane.add(nose);
      const wing = box(11, 0.25, 1.8, 0x2b6cb0, 0, 1.6, 0.5);
      plane.add(wing);
      const tail = box(3.6, 0.2, 1.2, 0x2b6cb0, 0, 2.6, -4.2);
      plane.add(tail);
      const fin = box(0.2, 2.2, 1.6, 0xc23b3b, 0, 3.2, -4.2);
      plane.add(fin);
      for (const wx of [-2.6, 2.6]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8), new THREE.MeshLambertMaterial({ color: 0x111111 }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.35, 1);
        plane.add(wheel);
      }
      plane.position.set(px, 0, pz);
      plane.rotation.y = ry;
      this._add(plane);
      this._collider(px, pz, 6);
    }
    // windsock
    const ws = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5, 5), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    ws.position.set(320, 2.5, 118);
    this._add(ws);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 8), new THREE.MeshLambertMaterial({ color: 0xff7b2f }));
    sock.rotation.z = Math.PI / 2.3;
    sock.position.set(321.2, 4.8, 118);
    this._add(sock);
  }

  // ---------- traffic lights: real system, 25 lit intersections ----------
  _buildTrafficLights() {
    const CYCLE = 20; // seconds: 8 green NS / 2 yellow NS / 8 green EW / 2 yellow EW
    for (let i = 0; i < ROADS.length; i += 2) {
      for (let j = 0; j < ROADS.length; j += 2) {
        const x = ROADS[i], z = ROADS[j];
        const offset = ((i + j) % 4) * 2.5; // green wave: neighbours offset 2.5s
        const light = { x, z, ix: i, iz: j, offset, cycle: CYCLE, heads: [], ped: {} };
        // pole on the south-east corner
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.4, 6), new THREE.MeshLambertMaterial({ color: 0x33363c }));
        pole.position.set(x + 5.8, 2.7, z + 5.8);
        this._add(pole);
        const arm = box(0.25, 0.25, 5.2, 0x33363c, x + 5.8, 5.2, z + 3.2);
        this._add(arm);
        // two 3-lamp heads: one faces NS traffic, one faces EW traffic
        const headNS = this._makeLightHead(x + 5.8, 4.9, z + 0.6, 0);
        const headEW = this._makeLightHead(x + 0.6, 4.9, z + 5.8, Math.PI / 2);
        light.heads.push({ axis: 'ns', lamps: headNS });
        light.heads.push({ axis: 'ew', lamps: headEW });
        // pedestrian signals on the same pole: walk (green) / don't walk (red)
        const pedNS = this._makePedSignal(x + 5.8, 3.1, z + 5.8, 0);
        const pedEW = this._makePedSignal(x + 6.3, 3.1, z + 5.8, Math.PI / 2);
        light.ped = { ns: pedNS, ew: pedEW };
        this.lights.push(light);
      }
    }
  }

  _makeLightHead(x, y, z, ry) {
    const g = new THREE.Group();
    const housing = box(0.7, 1.9, 0.5, 0x1a1c20, 0, 0, 0);
    g.add(housing);
    const lamps = {};
    const defs = [['red', 0.62, 0xff2d2d], ['yellow', 0, 0xffd24a], ['green', -0.62, 0x2fd35a]];
    for (const [name, dy, color] of defs) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x330000 });
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), mat);
      lamp.position.set(0, dy, 0.26);
      g.add(lamp);
      lamps[name] = { mesh: lamp, mat, on: color, off: 0x2a0d0d };
    }
    g.position.set(x, y, z);
    g.rotation.y = ry;
    this._add(g);
    return lamps;
  }

  _makePedSignal(x, y, z, ry) {
    const g = new THREE.Group();
    const housing = box(0.6, 1.1, 0.35, 0x1a1c20, 0, 0, 0);
    g.add(housing);
    const walkMat = new THREE.MeshBasicMaterial({ color: 0x0d2a0d });
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), walkMat);
    walk.position.set(0, 0.22, 0.19);
    g.add(walk);
    const stopMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
    const stop = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), stopMat);
    stop.position.set(0, -0.22, 0.19);
    g.add(stop);
    g.position.set(x, y, z);
    g.rotation.y = ry;
    this._add(g);
    return { walk, walkMat, stop, stopMat };
  }

  // state of one intersection at time t: 'green' | 'yellow' | 'red' per axis
  _lightPhase(light, t) {
    const p = (((t + light.offset) % light.cycle) + light.cycle) % light.cycle;
    if (p < 8) return { ns: 'green', ew: 'red' };
    if (p < 10) return { ns: 'yellow', ew: 'red' };
    if (p < 18) return { ns: 'red', ew: 'green' };
    return { ns: 'red', ew: 'yellow' };
  }

  // public: what does a driver on `axis` ('ns'|'ew') see at (x,z)?
  lightAt(x, z, axis) {
    if (this._manualRed && this._t < this._manualUntil) return 'red';
    if (this._manualRed) this._manualRed = false;
    let best = null, bestD = 1e9;
    for (const l of this.lights) {
      const d = Math.hypot(l.x - x, l.z - z);
      if (d < bestD) { bestD = d; best = l; }
    }
    if (!best || bestD > 14) return 'green';
    return this._lightPhase(best, this._t)[axis];
  }

  setTrafficRed(b) {
    this._manualRed = !!b;
    this._manualUntil = this._t + 6;
  }

  // ---------- street props: lamps + power poles ----------
  _buildStreetProps() {
    const rng = this.rng;
    // street lamps along every road (alternate sides), glow at night
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3238 });
    for (const r of ROADS) {
      for (let z = 13; z < 254; z += 26) {
        for (const [px, pz, armDir] of [[r - 7.6, z, 1], [r + 7.6, z + 13, -1]]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 6.5, 6), poleMat);
          pole.position.set(px, 3.25, pz);
          this._add(pole);
          const arm = box(0.12, 0.12, 1.6, 0x2e3238, px, 6.4, pz + armDir * 0.7);
          this._add(arm);
          const head = box(0.5, 0.18, 0.9, 0x1a1c20, px, 6.35, pz + armDir * 1.4);
          this._add(head);
          const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85 })
          );
          glow.position.set(px, 6.2, pz + armDir * 1.4);
          glow.visible = false;
          this._lampGlows.push(glow);
          this._add(glow);
        }
      }
    }
    // power poles + wires along Neon Ave (x = 117) and the EW road z = 117
    const tops = [];
    for (let z = 26; z < 254; z += 26) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), new THREE.MeshLambertMaterial({ color: 0x6b4f2a }));
      pole.position.set(117 + 8.4, 3.5, z);
      this._add(pole);
      this._add(box(2.2, 0.14, 0.14, 0x6b4f2a, 117 + 8.4, 6.6, z));
      tops.push(new THREE.Vector3(117 + 8.4 - 1, 6.6, z), new THREE.Vector3(117 + 8.4 + 1, 6.6, z));
    }
    const wireGeo = new THREE.BufferGeometry().setFromPoints(tops);
    this._add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x222222 })));
  }

  // ---------- sky: visible sun disc + glow (weather.js owns dome/clouds) ----------
  _buildSky() {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(16, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, fog: false })
    );
    disc.visible = false;
    this._sunDisc = disc;
    this._add(disc);
    const glowTex = canvasTexture(128, 128, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,220,120,0.85)');
      grad.addColorStop(0.4, 'rgba(255,180,80,0.35)');
      grad.addColorStop(1, 'rgba(255,180,80,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false })
    );
    glow.visible = false;
    this._sunGlow = glow;
    this._add(glow);
  }

  // ---------- per-frame ----------
  update(dt, time) {
    this._t += dt;
    // foam breathing + waves drifting
    for (let i = 0; i < this._foam.length; i++) {
      const f = this._foam[i];
      f.material.opacity = 0.4 + 0.2 * Math.sin(this._t * 0.7 + i);
      f.position.x = (f.userData.baseX || 14.6) + 0.5 * Math.sin(this._t * 0.5 + i * 1.3);
    }
    for (let i = 0; i < this._waveStrips.length; i++) {
      this._waveStrips[i].position.x = 2 - i * 2.4 + 1.2 * Math.sin(this._t * 0.25 + i);
    }
    // traffic lights: lamp colours + pedestrian signals
    for (const light of this.lights) {
      const ph = this._lightPhase(light, this._t);
      for (const head of light.heads) {
        const state = ph[head.axis];
        for (const [name, lamp] of Object.entries(head.lamps)) {
          const on = (state === name);
          lamp.mat.color.setHex(on ? lamp.on : lamp.off);
        }
      }
      // pedestrians cross the NS road while NS traffic is stopped (ew green)
      const pedNSWalk = ph.ns === 'red';
      light.ped.ns.walkMat.color.setHex(pedNSWalk ? 0x2fd35a : 0x0d2a0d);
      light.ped.ns.stopMat.color.setHex(pedNSWalk ? 0x330000 : 0xff2d2d);
      const pedEWWalk = ph.ew === 'red';
      light.ped.ew.walkMat.color.setHex(pedEWWalk ? 0x2fd35a : 0x0d2a0d);
      light.ped.ew.stopMat.color.setHex(pedEWWalk ? 0x330000 : 0xff2d2d);
    }
    // sun disc + night lighting, driven by the game clock
    const w = this.weather;
    let hour = 12, night = false;
    if (w && typeof w.time === 'number') {
      hour = w.time;
      night = typeof w.isNight === 'function' ? w.isNight() : (hour >= 19.5 || hour < 5.5);
    }
    const dayFrac = (hour - 6) / 12; // 0 at sunrise, 1 at sunset
    const sunUp = dayFrac > 0 && dayFrac < 1;
    if (this._sunDisc) {
      this._sunDisc.visible = sunUp;
      this._sunGlow.visible = sunUp;
      if (sunUp) {
        const ang = dayFrac * Math.PI;
        const sx = 130 + Math.cos(ang) * 300;
        const sy = 25 + Math.sin(ang) * 190;
        const sz = 130 - 160;
        this._sunDisc.position.set(sx, sy, sz);
        this._sunDisc.lookAt(130, 20, 130);
        this._sunGlow.position.set(sx, sy, sz - 2);
        this._sunGlow.lookAt(130, 20, 130);
        // golden-orange low, white-yellow high
        const low = Math.sin(ang) < 0.45;
        this._sunDisc.material.color.setHex(low ? 0xff8c3a : 0xffd76a);
      }
    }
    for (const pane of this._litMats) pane.visible = night;
    for (const glow of this._lampGlows) glow.visible = night;
    // LVPD HQ roof lights + parked-car light bars flash red/blue
    const flash = Math.floor(this._t * 4) % 2 === 0;
    for (const l of this._hqLights) {
      l.redMat.color.setHex(flash ? 0xff2d2d : 0x330000);
      l.blueMat.color.setHex(flash ? 0x0d1a33 : 0x2d6bff);
    }
  }

  // ---------- queries used by characters / vehicles / missions ----------
  isInWater(x) { return x < 15; }
  isOnSand(x) { return x >= 15 && x < 30; }
  isOnRoad(x, z) {
    for (const r of ROADS) {
      if (Math.abs(x - r) <= 5 && z >= 0 && z <= 260) return true;
      if (Math.abs(z - r) <= 5 && x >= 0 && x <= 260) return true;
    }
    return false;
  }
  isOnSidewalk(x, z) {
    for (const s of this.sidewalks) {
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return true;
    }
    return false;
  }
  clampPlayer(x, z) {
    return { x: clamp(x, 4, 396), z: clamp(z, 4, 396) };
  }
}
