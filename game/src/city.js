// La Vega 3D — city builder (round 10 re-author).
//
// The island, built from the design document: a 400 m island, a 260 m
// street grid on a 26 m block rhythm, four districts, three land biomes
// and the sea west of x = 15. The ground is a single land plane at
// y = 0.10 with a painted canvas texture; the sea is a SEPARATE plane
// that only ever covers x < 15, and the river is a narrow ribbon in the
// forest. Nothing else in the city is water — the streets, the beach
// and Marina are dry land by construction, so the flood of round 9
// (one 2400 x 2400 sea plane over the whole map) cannot come back.
//
// Roads are 10 m wide with 2.5 m sidewalks (config WORLD). Power poles
// run along the sidewalk edge, traffic lights stand at the inner
// intersections, road markings and roadside props dress the streets,
// and 30+ palms line the beach. Buildings are procedural boxes with
// canvas facades; named places get bespoke fronts and sign boards.

import * as THREE from 'three';
import {
  WORLD, ROADS, DISTRICTS, PLACES, PLACE_DIMS, PALETTE, CITY_TUNING, BIOMES,
} from './config.js';
import { buildPalm, buildPine } from './loader.js';
import { mulberry32, rand, pick, randInt } from './rng.js';

const GRID = WORLD.grid; // 260 — street grid extent
const ROAD_W = WORLD.roadWidth; // 10
const SIDE_W = WORLD.sidewalk; // 2.5
const SEA_X = WORLD.seaX; // 15 — everything west of this is sea
const SAND_MAX = WORLD.sandMax; // 30 — beach strip ends here
const GROUND_Y = 0.10; // dry land height — always ABOVE the sea plane
const SEA_Y = 0.02; // sea surface — always BELOW the land plane
const RIVER_Z = 281; // river centreline through the forest
const RIVER_W = 9; // river width
const RIVER_BED = 0.0; // river bed — below the land plane
const RIVER_WATER = 0.115; // river ribbon — just above the land plane

// Height of the walkable surface at (x, z). The sea is low, the river
// bed is low, everything else is dry land at GROUND_Y. Missions and
// police import this directly.
export function groundHeight(x, z) {
  if (x < SEA_X) return SEA_Y;
  if (x >= 0 && x <= 400 && Math.abs(z - RIVER_Z) <= RIVER_W / 2) return RIVER_BED;
  return GROUND_Y;
}

function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.key;
  return 'marina';
}

// ---- small geometry helpers (merge many flat pieces into one draw) ----
function mergeGeoms(geoms) {
  let vCount = 0, iCount = 0;
  for (const g of geoms) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function flatPlane(w, d, x, y, z) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function boxAt(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---- ground canvas: 2048 px over world [-50, 450] on both axes --------
function paintGround() {
  const S = 500, O = 50; // span and offset
  const px = (x) => (x + O) / S * 2048;
  const pz = (z) => (z + O) / S * 2048;
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  return canvasTexture(2048, 2048, (g) => {
    g.fillStyle = hex(PALETTE.grass);
    g.fillRect(0, 0, 2048, 2048);
    // sea strip west of the shoreline (under the sea plane, for blend)
    g.fillStyle = hex(PALETTE.deep);
    g.fillRect(0, 0, px(SEA_X), 2048);
    // desert east, forest north, rocky north-east
    g.fillStyle = '#e8d29a';
    g.fillRect(px(BIOMES.desert.x0), pz(BIOMES.desert.z0), px(BIOMES.desert.x1) - px(BIOMES.desert.x0), pz(BIOMES.desert.z1) - pz(BIOMES.desert.z0));
    g.fillStyle = '#4e8f3e';
    g.fillRect(px(BIOMES.forest.x0), pz(BIOMES.forest.z0), px(BIOMES.forest.x1) - px(BIOMES.forest.x0), pz(BIOMES.forest.z1) - pz(BIOMES.forest.z0));
    g.fillStyle = '#9a8f7a';
    g.fillRect(px(BIOMES.rocky.x0), pz(BIOMES.rocky.z0), px(BIOMES.rocky.x1) - px(BIOMES.rocky.x0), pz(BIOMES.rocky.z1) - pz(BIOMES.rocky.z0));
    // forest / rocky speckle
    const rng = mulberry32(4242);
    for (let i = 0; i < 900; i++) {
      const x = rng() * 400, z = 260 + rng() * 140;
      g.fillStyle = rng() > 0.5 ? '#3f7a33' : '#5da34b';
      g.fillRect(px(x), pz(z), 6, 6);
    }
    for (let i = 0; i < 220; i++) {
      const x = 260 + rng() * 140, z = 260 + rng() * 140;
      g.fillStyle = rng() > 0.5 ? '#8a7f6a' : '#b0a58e';
      g.beginPath(); g.arc(px(x), pz(z), 3 + rng() * 5, 0, 7); g.fill();
    }
    // beach band: sand from the sea edge to SAND_MAX
    g.fillStyle = hex(PALETTE.sand);
    g.fillRect(px(SEA_X), 0, px(SAND_MAX) - px(SEA_X), 2048);
    // river channel through the forest (painted dark; the water ribbon
    // sits just above it)
    g.fillStyle = '#1e6f9f';
    g.fillRect(px(0), pz(RIVER_Z - RIVER_W / 2), px(400) - px(0), pz(RIVER_Z + RIVER_W / 2) - pz(RIVER_Z - RIVER_W / 2));
    // city blocks: light pavement with a little variation; parks green
    const brng = mulberry32(99);
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 8; j++) {
        const x0 = i === 0 ? 0 : ROADS[i - 1] + ROAD_W / 2;
        const x1 = i === 8 ? GRID : ROADS[i] - ROAD_W / 2;
        const z0 = j === 0 ? 0 : ROADS[j - 1] + ROAD_W / 2;
        const z1 = j === 8 ? GRID : ROADS[j] - ROAD_W / 2;
        const park = brng() < CITY_TUNING.parkChance;
        g.fillStyle = park ? hex(PALETTE.park) : (brng() > 0.5 ? '#b8b0a0' : '#aca496');
        g.fillRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0));
      }
    }
    // sloped beach shading: a soft wet-sand strip right at the water
    g.fillStyle = 'rgba(210, 180, 120, 0.55)';
    g.fillRect(px(SEA_X), 0, px(19) - px(SEA_X), 2048);
  });
}

// ---- facade canvases ----------------------------------------------------
function facadeTexture(base, lit) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // brick / panel lines
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // windows: dark glass, some lit warm
    const rng = mulberry32(base.length * 7919 + lit);
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 5; c++) {
        const x = 14 + c * 48, y = 16 + r * 40;
        g.fillStyle = rng() < 0.28 ? '#ffd98a' : '#20242e';
        g.fillRect(x, y, 30, 26);
        g.fillStyle = 'rgba(255,255,255,0.14)';
        g.fillRect(x, y, 30, 5);
      }
    }
    // ground floor: darker band + door
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, h - 40, w, 40);
    g.fillStyle = '#1c1e24';
    g.fillRect(w / 2 - 14, h - 40, 28, 40);
  });
}

const FACADE_BASES = ['#c9a06a', '#b98a5a', '#8fa3b8', '#a87f7f', '#7fa08a', '#c2b49a', '#9a8fb8', '#d0a090'];
let facadeCache = null;
function facades() {
  if (facadeCache) return facadeCache;
  facadeCache = FACADE_BASES.map((b, i) => facadeTexture(b, i));
  return facadeCache;
}

const signCache = new Map();
function signTexture(text, bg, fg) {
  const key = text + '|' + bg + '|' + fg;
  if (signCache.has(key)) return signCache.get(key);
  const t = canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    g.font = 'bold 52px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text.toUpperCase().slice(0, 18), w / 2, h / 2 + 2);
  });
  signCache.set(key, t);
  return t;
}

// ---- the city -----------------------------------------------------------
export function buildCity(game) {
  const rng = mulberry32(1337);
  const group = new THREE.Group();
  const colliders = { boxes: [], circles: [] };
  const interiors = [];
  const trafficLights = [];

  // --- ground, sea, beach slope, river ---------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ map: paintGround() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(200, GROUND_Y, 200);
  group.add(ground);

  // sea: ONE plane, strictly west of x = 15. It can never flood the city
  // because the land plane sits 8 cm above it everywhere else.
  const seaMat = new THREE.MeshLambertMaterial({ color: PALETTE.sea });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(465, 900), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SEA_X - 465 / 2, SEA_Y, 200);
  group.add(sea);

  // sloped wet sand from the waterline up to the dry beach
  const shore = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 400),
    new THREE.MeshLambertMaterial({ color: 0xe0c184 }),
  );
  shore.rotation.x = -Math.PI / 2;
  shore.rotation.z = -0.02;
  shore.position.set(23, 0.06, 200);
  group.add(shore);

  // river: dark bed + narrow water ribbon, both confined to z 276.5..285.5
  const riverBed = new THREE.Mesh(
    new THREE.PlaneGeometry(400, RIVER_W),
    new THREE.MeshLambertMaterial({ color: 0x14384d }),
  );
  riverBed.rotation.x = -Math.PI / 2;
  riverBed.position.set(200, RIVER_BED, RIVER_Z);
  group.add(riverBed);
  const riverMat = new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.85 });
  const river = new THREE.Mesh(new THREE.PlaneGeometry(400, RIVER_W - 1), riverMat);
  river.rotation.x = -Math.PI / 2;
  river.position.set(200, RIVER_WATER, RIVER_Z);
  group.add(river);

  // animated wave strips on the sea (cheap shimmer, no extra water)
  const waves = [];
  const waveMat = new THREE.MeshBasicMaterial({ color: 0x9fd8f2, transparent: true, opacity: 0.35 });
  for (let i = 0; i < 8; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(60 + rng() * 90, 0.5), waveMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(-40 - rng() * 320, SEA_Y + 0.005, rng() * 400);
    w.userData.phase = rng() * 6.28;
    group.add(w);
    waves.push(w);
  }

  // --- roads, sidewalks, centre lines, crosswalks (merged, few draws) --
  const asphalt = [];
  const walks = [];
  const lines = [];
  const zebras = [];
  for (const r of ROADS) {
    asphalt.push(flatPlane(ROAD_W, GRID, r, GROUND_Y + 0.01, GRID / 2));
    asphalt.push(flatPlane(GRID, ROAD_W, GRID / 2, GROUND_Y + 0.01, r));
    walks.push(flatPlane(SIDE_W, GRID, r - ROAD_W / 2 - SIDE_W / 2, GROUND_Y + 0.015, GRID / 2));
    walks.push(flatPlane(SIDE_W, GRID, r + ROAD_W / 2 + SIDE_W / 2, GROUND_Y + 0.015, GRID / 2));
    walks.push(flatPlane(GRID, SIDE_W, GRID / 2, GROUND_Y + 0.015, r - ROAD_W / 2 - SIDE_W / 2));
    walks.push(flatPlane(GRID, SIDE_W, GRID / 2, GROUND_Y + 0.015, r + ROAD_W / 2 + SIDE_W / 2));
    // double yellow centre line, broken at intersections
    for (let i = 0; i < ROADS.length - 1; i++) {
      const a = ROADS[i] + ROAD_W / 2 + 1, b = ROADS[i + 1] - ROAD_W / 2 - 1;
      const mid = (a + b) / 2, len = b - a;
      if (len <= 0) continue;
      lines.push(flatPlane(0.16, len, r - 0.45, GROUND_Y + 0.02, mid));
      lines.push(flatPlane(0.16, len, r + 0.45, GROUND_Y + 0.02, mid));
      lines.push(flatPlane(len, 0.16, mid, GROUND_Y + 0.02, r - 0.45));
      lines.push(flatPlane(len, 0.16, mid, GROUND_Y + 0.02, r + 0.45));
    }
    // crosswalk stripes at the inner intersections
    for (const q of ROADS) {
      if (q < 65 || q > 221) continue;
      for (let s = -2; s <= 2; s++) {
        zebras.push(flatPlane(0.6, 3.4, q + s * 1.1, GROUND_Y + 0.02, r - ROAD_W / 2 - 0.6));
        zebras.push(flatPlane(3.4, 0.6, r - ROAD_W / 2 - 0.6, GROUND_Y + 0.02, q + s * 1.1));
      }
    }
  }
  // dirt roads through the biomes (forest / desert / rocky)
  const dirtMat = new THREE.MeshLambertMaterial({ color: 0xc9a86a });
  const dirt = [];
  dirt.push(flatPlane(6, 140, 330, GROUND_Y + 0.01, 130));
  dirt.push(flatPlane(140, 6, 330, GROUND_Y + 0.01, 130));
  dirt.push(flatPlane(6, 140, 130, GROUND_Y + 0.01, 330));
  dirt.push(flatPlane(140, 6, 130, GROUND_Y + 0.01, 330));
  group.add(new THREE.Mesh(mergeGeoms(asphalt), new THREE.MeshLambertMaterial({ color: PALETTE.road })));
  group.add(new THREE.Mesh(mergeGeoms(walks), new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk })));
  group.add(new THREE.Mesh(mergeGeoms(lines), new THREE.MeshLambertMaterial({ color: PALETTE.roadLine })));
  group.add(new THREE.Mesh(mergeGeoms(zebras), new THREE.MeshLambertMaterial({ color: 0xf2f5f7 })));
  group.add(new THREE.Mesh(mergeGeoms(dirt), dirtMat));

  // --- buildings ---------------------------------------------------------
  const SHOP_NAMES = ['TACOS', 'PIZZA', 'BAR', 'HOTEL', 'CAFE', 'GYM', 'PHARMACY', 'BAKERY', 'MARKET', 'LAUNDRY', 'BOOKS', 'FLOWERS', 'DONUTS', 'SUSHI', 'BURGER', 'RAMEN', 'JUICE', 'SHOES', 'TOYS', 'MUSIC', 'KARAOKE', 'SPA', 'NACHOS', 'COFFEE'];
  let shopSigns = 0;

  function addSign(text, x, y, z, w, bg, fg) {
    const t = signTexture(text, bg || '#1c1e24', fg || '#ffd34d');
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshBasicMaterial({ map: t }),
    );
    m.position.set(x, y, z);
    group.add(m);
    shopSigns++;
    return m;
  }

  function addBuilding(cx, cz, w, d, floors, opts = {}) {
    const h = floors * 3.2;
    const tex = facades()[randInt(rng, 0, FACADE_BASES.length - 1)].clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(floors / 3)));
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    m.position.set(cx, GROUND_Y + h / 2, cz);
    group.add(m);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4),
      new THREE.MeshLambertMaterial({ color: 0x3a3f47 }),
    );
    cap.position.set(cx, GROUND_Y + h + 0.15, cz);
    group.add(cap);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.2, 1.0, d + 0.2),
      new THREE.MeshLambertMaterial({ color: 0x55504a }),
    );
    base.position.set(cx, GROUND_Y + 0.5, cz);
    group.add(base);
    if (rng() < 0.5) {
      const ac = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.8, 1.2),
        new THREE.MeshLambertMaterial({ color: 0x8a8f96 }),
      );
      ac.position.set(cx + rand(rng, -w / 4, w / 4), GROUND_Y + h + 0.7, cz + rand(rng, -d / 4, d / 4));
      group.add(ac);
    }
    if (opts.sign) addSign(opts.sign, cx, GROUND_Y + h + 1.6, cz + d / 2 + 0.08, Math.min(w + 1, 10));
    colliders.boxes.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
    return m;
  }

  // named places first (they own their blocks)
  const SKIP_BUILD = new Set(['beach', 'harbor', 'pierPickup', 'dock', 'park', 'airport', 'bridgeN', 'bridgeS']);
  const placed = []; // AABBs already occupied by named places
  const neonMat = new THREE.MeshBasicMaterial({ color: 0xff2a9d });
  const neonMat2 = new THREE.MeshBasicMaterial({ color: 0x2ad6ff });

  function namedBuilding(key, floors, signBg, signFg) {
    const p = PLACES[key];
    const dims = PLACE_DIMS[key] || { w: 14, d: 11 };
    const m = addBuilding(p.x, p.y, dims.w, dims.d, floors, { sign: p.name });
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 2, z1: p.y + dims.d / 2 + 2 });
    interiors.push({ id: key, name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
    return m;
  }

  // La Rosa's Club — neon front, canopy, magenta + cyan glow strips
  {
    const p = PLACES.club, dims = PLACE_DIMS.club;
    addBuilding(p.x, p.y, dims.w, dims.d, 3, { sign: p.name });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(dims.w + 0.3, 0.25, 0.3), neonMat);
    strip.position.set(p.x, GROUND_Y + 6.4, p.y + dims.d / 2 + 0.1);
    group.add(strip);
    const strip2 = new THREE.Mesh(new THREE.BoxGeometry(dims.w + 0.3, 0.25, 0.3), neonMat2);
    strip2.position.set(p.x, GROUND_Y + 3.4, p.y + dims.d / 2 + 0.1);
    group.add(strip2);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 3), new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
    canopy.position.set(p.x, GROUND_Y + 3.6, p.y + dims.d / 2 + 1.6);
    group.add(canopy);
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 2, z1: p.y + dims.d / 2 + 2 });
    interiors.push({ id: 'club', name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
  }
  // Neon Palm Casino — setback tower + gold trim + neon crown
  {
    const p = PLACES.casino, dims = PLACE_DIMS.casino;
    addBuilding(p.x, p.y, dims.w, dims.d, 2, {});
    const tower = addBuilding(p.x, p.y - 1, dims.w * 0.6, dims.d * 0.6, 4, {});
    tower.position.y = GROUND_Y + 6.4 + 6.4;
    addSign(p.name, p.x, GROUND_Y + 13, p.y - 1 + dims.d * 0.3 + 0.12, 10);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(dims.w * 0.6 + 0.4, 0.3, dims.d * 0.6 + 0.4), neonMat);
    crown.position.set(p.x, GROUND_Y + 19.4, p.y - 1);
    group.add(crown);
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 2, z1: p.y + dims.d / 2 + 2 });
    interiors.push({ id: 'casino', name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
  }
  // City Hall — white columns + portico + flag
  {
    const p = PLACES.cityHall, dims = PLACE_DIMS.cityHall;
    const m = addBuilding(p.x, p.y, dims.w, dims.d, 3, { sign: p.name });
    m.material = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
    for (let i = -2; i <= 2; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 9.6, 10), new THREE.MeshLambertMaterial({ color: 0xf2f0ea }));
      col.position.set(p.x + i * 3.4, GROUND_Y + 4.8, p.y + dims.d / 2 + 1.2);
      group.add(col);
      colliders.circles.push({ x: p.x + i * 3.4, z: p.y + dims.d / 2 + 1.2, r: 0.55 });
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 12, 6), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    pole.position.set(p.x + dims.w / 2 + 3, GROUND_Y + 6, p.y + dims.d / 2 + 2);
    group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshBasicMaterial({ color: 0x2a6fd6, side: THREE.DoubleSide }));
    flag.position.set(p.x + dims.w / 2 + 4.2, GROUND_Y + 10.6, p.y + dims.d / 2 + 2);
    group.add(flag);
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 2, z1: p.y + dims.d / 2 + 2 });
    interiors.push({ id: 'cityHall', name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
  }
  // La Vega General — white tower + red cross sign
  {
    const p = PLACES.hospital, dims = PLACE_DIMS.hospital;
    const m = addBuilding(p.x, p.y, dims.w, dims.d, 4, { sign: p.name });
    m.material = new THREE.MeshLambertMaterial({ color: 0xf2f5f7 });
    const cross = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 0.2), new THREE.MeshBasicMaterial({ color: 0xd92038 }));
    cross.position.set(p.x, GROUND_Y + 13.6, p.y + dims.d / 2 + 0.1);
    group.add(cross);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xd92038 }));
    cross2.position.set(p.x, GROUND_Y + 13.6, p.y + dims.d / 2 + 0.1);
    group.add(cross2);
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 2, z1: p.y + dims.d / 2 + 2 });
    interiors.push({ id: 'hospital', name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
  }
  // Manny's Garage — low box, open bays on the front
  {
    const p = PLACES.garage, dims = PLACE_DIMS.garage;
    addBuilding(p.x, p.y, dims.w, dims.d, 1, { sign: p.name });
    for (let i = -1; i <= 1; i++) {
      const bay = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.6, 0.4), new THREE.MeshLambertMaterial({ color: 0x14161a }));
      bay.position.set(p.x + i * 5, GROUND_Y + 1.4, p.y + dims.d / 2 + 0.06);
      group.add(bay);
    }
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 2, z1: p.y + dims.d / 2 + 2 });
    interiors.push({ id: 'garage', name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
  }
  // Old Cannery Warehouse — big low brown box
  {
    const p = PLACES.warehouse, dims = PLACE_DIMS.warehouse;
    const m = addBuilding(p.x, p.y, dims.w, dims.d, 1, { sign: p.name });
    m.material = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 2, z1: p.y + dims.d / 2 + 2 });
    interiors.push({ id: 'warehouse', name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
  }
  // La Vega Mall — glass front + wide canopy
  {
    const p = PLACES.mall, dims = PLACE_DIMS.mall;
    const m = addBuilding(p.x, p.y, dims.w, dims.d, 2, { sign: p.name });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(dims.w * 0.8, 3.4, 0.3), new THREE.MeshLambertMaterial({ color: 0x7fb8d8 }));
    glass.position.set(p.x, GROUND_Y + 2.2, p.y + dims.d / 2 + 0.08);
    group.add(glass);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(dims.w, 0.3, 4), new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
    canopy.position.set(p.x, GROUND_Y + 4.2, p.y + dims.d / 2 + 2);
    group.add(canopy);
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 2, z1: p.y + dims.d / 2 + 2 });
    interiors.push({ id: 'mall', name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
  }
  // Petro Vega — canopy on poles + pumps
  {
    const p = PLACES.gas, dims = PLACE_DIMS.gas;
    addBuilding(p.x, p.y, dims.w, dims.d, 1, { sign: p.name });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 10), new THREE.MeshLambertMaterial({ color: 0xd92038 }));
    canopy.position.set(p.x, GROUND_Y + 5.2, p.y + dims.d / 2 + 6);
    group.add(canopy);
    for (const [dx, dz] of [[-4, 4], [4, 4], [-4, 8], [4, 8]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.2, 8), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      pole.position.set(p.x + dx, GROUND_Y + 2.6, p.y + dims.d / 2 + dz);
      group.add(pole);
      colliders.circles.push({ x: p.x + dx, z: p.y + dims.d / 2 + dz, r: 0.25 });
    }
    for (const dx of [-2, 2]) {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.6), new THREE.MeshLambertMaterial({ color: 0xf2f5f7 }));
      pump.position.set(p.x + dx, GROUND_Y + 0.7, p.y + dims.d / 2 + 6);
      group.add(pump);
      colliders.circles.push({ x: p.x + dx, z: p.y + dims.d / 2 + 6, r: 0.6 });
    }
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 10, z1: p.y + dims.d / 2 + 10 });
    interiors.push({ id: 'gas', name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
  }
  // Auto Palms dealer — showroom glass + open lot
  {
    const p = PLACES.dealer, dims = PLACE_DIMS.dealer;
    addBuilding(p.x, p.y, dims.w, dims.d, 1, { sign: p.name });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(dims.w * 0.7, 2.6, 0.3), new THREE.MeshLambertMaterial({ color: 0x7fb8d8 }));
    glass.position.set(p.x, GROUND_Y + 1.8, p.y + dims.d / 2 + 0.08);
    group.add(glass);
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshLambertMaterial({ color: 0x3f444d }));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(p.x, GROUND_Y + 0.02, p.y + dims.d / 2 + 8);
    group.add(lot);
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 2, z1: p.y + dims.d / 2 + 14 });
    interiors.push({ id: 'dealer', name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
  }
  // LVPD Station — blue stripe + flag
  {
    const p = PLACES.station, dims = PLACE_DIMS.station;
    addBuilding(p.x, p.y, dims.w, dims.d, 2, { sign: p.name });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(dims.w + 0.2, 0.7, 0.3), new THREE.MeshLambertMaterial({ color: 0x2a6fd6 }));
    stripe.position.set(p.x, GROUND_Y + 4.6, p.y + dims.d / 2 + 0.1);
    group.add(stripe);
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 2, z1: p.y + dims.d / 2 + 2 });
    interiors.push({ id: 'station', name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
  }
  // Tune-Up Workshop — sawtooth roof
  {
    const p = PLACES.workshop, dims = PLACE_DIMS.workshop;
    addBuilding(p.x, p.y, dims.w, dims.d, 1, { sign: p.name });
    for (let i = -1; i <= 1; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, dims.d * 0.7), new THREE.MeshLambertMaterial({ color: 0x6a7078 }));
      tooth.position.set(p.x + i * 5.6, GROUND_Y + 3.9, p.y);
      tooth.rotation.z = 0.35;
      group.add(tooth);
    }
    placed.push({ x0: p.x - dims.w / 2 - 2, z0: p.y - dims.d / 2 - 2, x1: p.x + dims.w / 2 + 2, z1: p.y + dims.d / 2 + 2 });
    interiors.push({ id: 'workshop', name: p.name, x: p.x, z: p.y + dims.d / 2 + 1, w: dims.w, d: dims.d });
  }
  // the rest of the named places: generic building + sign + interior
  for (const key of Object.keys(PLACES)) {
    if (SKIP_BUILD.has(key)) continue;
    if (['club', 'casino', 'cityHall', 'hospital', 'garage', 'warehouse', 'mall', 'gas', 'dealer', 'station', 'workshop'].includes(key)) continue;
    const dist = districtAt(PLACES[key].x, PLACES[key].y);
    const floors = dist === 'downtown' ? randInt(rng, 3, 6) : randInt(rng, 2, 3);
    namedBuilding(key, floors);
  }

  // generic blocks: one building per block (or two), parks stay green
  const blockRng = mulberry32(99); // same seed as the ground painter: parks match
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const x0 = i === 0 ? 0 : ROADS[i - 1] + ROAD_W / 2;
      const x1 = i === 8 ? GRID : ROADS[i] - ROAD_W / 2;
      const z0 = j === 0 ? 0 : ROADS[j - 1] + ROAD_W / 2;
      const z1 = j === 8 ? GRID : ROADS[j] - ROAD_W / 2;
      const park = blockRng() < CITY_TUNING.parkChance;
      if (!park) blockRng(); // mirror the ground painter's draw order
      if (park) continue; // painted green already; trees added below
      const bw = x1 - x0 - SIDE_W * 2, bd = z1 - z0 - SIDE_W * 2;
      if (bw < 9 || bd < 9) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const overlap = placed.some((a) => cx > a.x0 - 6 && cx < a.x1 + 6 && cz > a.z0 - 6 && cz < a.z1 + 6);
      if (overlap) continue;
      const dist = districtAt(cx, cz);
      const floors = dist === 'downtown' ? randInt(rng, 5, 14) : dist === 'neon' ? randInt(rng, 3, 7) : dist === 'beach' ? randInt(rng, 2, 4) : randInt(rng, 2, 5);
      const two = blockRng() < CITY_TUNING.twoBuildingChance && bw > 18;
      if (two) {
        const w2 = bw / 2 - 1;
        addBuilding(cx - bw / 4, cz, w2, bd, floors, { sign: rng() < 0.4 ? pick(rng, SHOP_NAMES) : undefined });
        addBuilding(cx + bw / 4, cz, w2, bd, Math.max(2, floors - randInt(rng, 0, 2)), { sign: rng() < 0.4 ? pick(rng, SHOP_NAMES) : undefined });
      } else {
        addBuilding(cx, cz, Math.min(bw, 11), Math.min(bd, 11), floors, { sign: rng() < 0.35 ? pick(rng, SHOP_NAMES) : undefined });
      }
    }
  }

  // --- parks, beach, harbor, airport, bridges ---------------------------
  // park trees + benches on the green blocks
  const parkRng = mulberry32(99);
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const x0 = i === 0 ? 0 : ROADS[i - 1] + ROAD_W / 2;
      const x1 = i === 8 ? GRID : ROADS[i] - ROAD_W / 2;
      const z0 = j === 0 ? 0 : ROADS[j - 1] + ROAD_W / 2;
      const z1 = j === 8 ? GRID : ROADS[j] - ROAD_W / 2;
      if (!(parkRng() < CITY_TUNING.parkChance)) { parkRng(); continue; }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (let t = 0; t < 3; t++) {
        const palm = buildPalm();
        palm.position.set(cx + rand(rng, -5, 5), GROUND_Y, cz + rand(rng, -5, 5));
        palm.rotation.y = rand(rng, 0, 6.28);
        group.add(palm);
      }
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.7), new THREE.MeshLambertMaterial({ color: 0x8a5a3a }));
      bench.position.set(cx + 3, GROUND_Y + 0.5, cz - 3);
      group.add(bench);
    }
  }
  // beach: umbrellas on the sand
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
  const umbrellaMat2 = new THREE.MeshLambertMaterial({ color: 0x2a6fd6 });
  for (let i = 0; i < 8; i++) {
    const ux = rand(rng, 18, 28), uz = 20 + i * 28 + rand(rng, -6, 6);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    pole.position.set(ux, GROUND_Y + 1.2, uz);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.9, 8), i % 2 ? umbrellaMat : umbrellaMat2);
    top.position.set(ux, GROUND_Y + 2.7, uz);
    group.add(top);
    colliders.circles.push({ x: ux, z: uz, r: 0.3 });
  }
  // harbor + docks: wooden pier planks into the sea + crates
  {
    const pierMat = new THREE.MeshLambertMaterial({ color: PALETTE.pier });
    for (let px = 6; px <= 24; px += 3) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 10), pierMat);
      plank.position.set(px, 0.35, 130);
      group.add(plank);
    }
    for (let i = 0; i < 6; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshLambertMaterial({ color: 0xa97c50 }));
      crate.position.set(rand(rng, 18, 26), GROUND_Y + 0.7, 122 + i * 3);
      crate.rotation.y = rand(rng, 0, 1.5);
      group.add(crate);
      colliders.circles.push({ x: crate.position.x, z: crate.position.z, r: 1.0 });
    }
  }
  // airport (desert): runway + hangar + tower
  {
    const runway = new THREE.Mesh(new THREE.PlaneGeometry(200, 30), new THREE.MeshLambertMaterial({ color: 0x3a3f47 }));
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(330, GROUND_Y + 0.01, 130);
    group.add(runway);
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(24, 9, 18), new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
    hangar.position.set(330, GROUND_Y + 4.5, 165);
    group.add(hangar);
    colliders.boxes.push({ x0: 318, z0: 156, x1: 342, z1: 174 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.6, 16, 8), new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
    tower.position.set(300, GROUND_Y + 8, 108);
    group.add(tower);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), new THREE.MeshLambertMaterial({ color: 0x2a6fd6 }));
    cab.position.set(300, GROUND_Y + 17.5, 108);
    group.add(cab);
    colliders.circles.push({ x: 300, z: 108, r: 2.8 });
    addSign('LA VEGA AIR', 330, GROUND_Y + 10.5, 176, 12, '#1c1e24', '#f2f5f7');
  }
  // inter-island bridges: flat decks + rails
  for (const key of ['bridgeN', 'bridgeS']) {
    const p = PLACES[key];
    const deck = new THREE.Mesh(new THREE.BoxGeometry(40, 0.6, 12), new THREE.MeshLambertMaterial({ color: 0x6a7078 }));
    deck.position.set(p.x, GROUND_Y + 0.4, p.y);
    group.add(deck);
    for (const dz of [-5.5, 5.5]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(40, 0.9, 0.3), new THREE.MeshLambertMaterial({ color: 0xd92038 }));
      rail.position.set(p.x, GROUND_Y + 1.2, p.y + dz);
      group.add(rail);
    }
  }

  // --- power poles + cables (P0) ------------------------------------------
  // CE spec: 10 m wooden pole, base, two crossarms, five insulators,
  // transformer on every third pole, three black cables at y = 9.4 to the
  // next pole on the same side. Poles stand on the sidewalk, 1.1 m from
  // the road edge (offset 6.1 m from the centreline), one per block.
  {
    const poleGeoms = [];
    const poleCyl = new THREE.CylinderGeometry(0.14, 0.18, 10, 8);
    poleCyl.translate(0, 5, 0);
    poleGeoms.push(poleCyl);
    const armTop = new THREE.BoxGeometry(2.6, 0.18, 0.18);
    armTop.translate(0, 9.3, 0);
    poleGeoms.push(armTop);
    const armBot = new THREE.BoxGeometry(1.8, 0.18, 0.18);
    armBot.translate(0, 8.5, 0);
    poleGeoms.push(armBot);
    const woodGeo = mergeGeoms(poleGeoms);

    const insGeoms = [];
    for (const [ox, oy] of [[-1.1, 9.5], [0, 9.5], [1.1, 9.5], [-0.7, 8.65], [0.7, 8.65]]) {
      const c = new THREE.CylinderGeometry(0.09, 0.11, 0.25, 6);
      c.translate(ox, oy, 0);
      insGeoms.push(c);
    }
    const insGeo = mergeGeoms(insGeoms);
    const baseGeo = new THREE.CylinderGeometry(0.26, 0.3, 0.36, 8);
    baseGeo.translate(0, 0.18, 0);
    const trGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.95, 10);
    trGeo.translate(0, 7.3, 0.42);
    const trCap = new THREE.BoxGeometry(0.8, 0.12, 0.8);
    trCap.translate(0, 7.85, 0.42);
    const trMerged = mergeGeoms([trGeo, trCap]);

    const poleSpots = []; // {x, z, rotY, along} — along: 'ns' | 'ew'
    for (const r of ROADS) {
      for (const s of [-1, 1]) {
        for (let t = 26; t <= 234; t += 26) {
          poleSpots.push({ x: r + s * (ROAD_W / 2 + 1.1), z: t, rotY: 0, along: 'ns', road: r, side: s, at: t });
          poleSpots.push({ x: t, z: r + s * (ROAD_W / 2 + 1.1), rotY: Math.PI / 2, along: 'ew', road: r, side: s, at: t });
        }
      }
    }
    const woodMesh = new THREE.InstancedMesh(woodGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a2b }), poleSpots.length);
    const insMesh = new THREE.InstancedMesh(insGeo, new THREE.MeshLambertMaterial({ color: 0xdadce2 }), poleSpots.length);
    const baseMesh = new THREE.InstancedMesh(baseGeo, new THREE.MeshLambertMaterial({ color: 0x555555 }), poleSpots.length);
    const trSpots = poleSpots.filter((_, i) => i % 3 === 0);
    const trMesh = new THREE.InstancedMesh(trMerged, new THREE.MeshLambertMaterial({ color: 0x7d8288 }), trSpots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    poleSpots.forEach((p, i) => {
      eul.set(0, p.rotY, 0);
      q.setFromEuler(eul);
      m4.compose(new THREE.Vector3(p.x, GROUND_Y, p.z), q, one);
      woodMesh.setMatrixAt(i, m4);
      insMesh.setMatrixAt(i, m4);
      baseMesh.setMatrixAt(i, m4);
      colliders.circles.push({ x: p.x, z: p.z, r: 0.25 });
    });
    trSpots.forEach((p, i) => {
      eul.set(0, p.rotY, 0);
      q.setFromEuler(eul);
      m4.compose(new THREE.Vector3(p.x, GROUND_Y, p.z), q, one);
      trMesh.setMatrixAt(i, m4);
    });
    group.add(woodMesh, insMesh, baseMesh, trMesh);

    // cables: 3 per span, slight sag, black
    const cablePts = [];
    const byKey = new Map();
    for (const p of poleSpots) {
      const k = p.along + '|' + p.road + '|' + p.side;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(p);
    }
    for (const list of byKey.values()) {
      list.sort((a, b) => a.at - b.at);
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i], b = list[i + 1];
        for (const off of [-1.1, 0, 1.1]) {
          const ax = a.along === 'ns' ? a.x + off : a.x;
          const az = a.along === 'ns' ? a.z : a.z + off;
          const bx = b.along === 'ns' ? b.x + off : b.x;
          const bz = b.along === 'ns' ? b.z : b.z + off;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          cablePts.push(new THREE.Vector3(ax, GROUND_Y + 9.4, az), new THREE.Vector3(mx, GROUND_Y + 9.0, mz));
          cablePts.push(new THREE.Vector3(mx, GROUND_Y + 9.0, mz), new THREE.Vector3(bx, GROUND_Y + 9.4, bz));
        }
      }
    }
    const cableGeo = new THREE.BufferGeometry().setFromPoints(cablePts);
    group.add(new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x15161a })));
  }

  // --- traffic lights (P1) ------------------------------------------------
  // 4 poles per inner intersection, head at y = 5.7. The head colour is
  // driven by game.trafficRed in updatePoles (6 s cycle lives in main).
  let lightHeads = null;
  let lightAxis = [];
  {
    const spots = [];
    for (const rx of ROADS) {
      if (rx < 65 || rx > 221) continue;
      for (const rz of ROADS) {
        if (rz < 65 || rz > 221) continue;
        spots.push({ x: rx + 6.2, z: rz + 6.2, axis: 'ns' });
        spots.push({ x: rx - 6.2, z: rz - 6.2, axis: 'ns' });
        spots.push({ x: rx - 6.2, z: rz + 6.2, axis: 'ew' });
        spots.push({ x: rx + 6.2, z: rz - 6.2, axis: 'ew' });
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5, 6);
    poleGeo.translate(0, 2.5, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2a2d33 }), spots.length);
    const headGeo = new THREE.BoxGeometry(0.55, 0.9, 0.55);
    headGeo.translate(0, 5.7, 0);
    lightHeads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    spots.forEach((s, i) => {
      q.setFromEuler(new THREE.Euler(0, s.axis === 'ns' ? 0 : Math.PI / 2, 0));
      m4.compose(new THREE.Vector3(s.x, GROUND_Y, s.z), q, one);
      poles.setMatrixAt(i, m4);
      lightHeads.setMatrixAt(i, m4);
      lightHeads.setColorAt(i, new THREE.Color(0x22dd55));
      lightAxis.push(s.axis);
      trafficLights.push({ x: s.x, z: s.z, axis: s.axis });
      colliders.circles.push({ x: s.x, z: s.z, r: 0.2 });
    });
    group.add(poles, lightHeads);
  }

  // --- roadside props (P1) -------------------------------------------------
  {
    const propSpots = { hydrant: [], trash: [], mailbox: [], bollard: [], planter: [] };
    const prng = mulberry32(777);
    for (const r of ROADS) {
      for (const s of [-1, 1]) {
        for (let t = 20; t <= 240; t += 20) {
          const roll = prng();
          if (roll < 0.12) propSpots.hydrant.push([r + s * 6.8, t]);
          else if (roll < 0.24) propSpots.trash.push([r + s * 6.8, t]);
          else if (roll < 0.32) propSpots.mailbox.push([r + s * 6.8, t]);
          else if (roll < 0.44) propSpots.bollard.push([r + s * 6.8, t]);
          else if (roll < 0.54) propSpots.planter.push([r + s * 6.8, t]);
          const roll2 = prng();
          if (roll2 < 0.12) propSpots.hydrant.push([t, r + s * 6.8]);
          else if (roll2 < 0.24) propSpots.trash.push([t, r + s * 6.8]);
          else if (roll2 < 0.32) propSpots.mailbox.push([t, r + s * 6.8]);
          else if (roll2 < 0.44) propSpots.bollard.push([t, r + s * 6.8]);
          else if (roll2 < 0.54) propSpots.planter.push([t, r + s * 6.8]);
        }
      }
    }
    function instanced(geo, color, list, r) {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), list.length);
      const m4 = new THREE.Matrix4();
      list.forEach(([x, z], i) => {
        m4.makeTranslation(x, GROUND_Y, z);
        mesh.setMatrixAt(i, m4);
        colliders.circles.push({ x, z, r: r || 0.3 });
      });
      group.add(mesh);
    }
    const hydGeo = mergeGeoms([boxAt(0.5, 0.9, 0.5, 0, 0.45, 0), boxAt(0.3, 0.25, 0.3, 0, 1.0, 0)]);
    instanced(hydGeo, 0xd92038, propSpots.hydrant, 0.35);
    const trashGeo = new THREE.CylinderGeometry(0.35, 0.3, 0.8, 8);
    trashGeo.translate(0, 0.4, 0);
    instanced(trashGeo, 0x3a3f47, propSpots.trash, 0.4);
    const mailGeo = new THREE.BoxGeometry(0.6, 1.0, 0.5);
    mailGeo.translate(0, 0.5, 0);
    instanced(mailGeo, 0x2a6fd6, propSpots.mailbox, 0.4);
    const bolGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.7, 6);
    bolGeo.translate(0, 0.35, 0);
    instanced(bolGeo, 0x8a8f96, propSpots.bollard, 0.2);
    const plantGeo = mergeGeoms([boxAt(1.0, 0.5, 1.0, 0, 0.25, 0), boxAt(0.8, 0.4, 0.8, 0, 0.7, 0)]);
    instanced(plantGeo, 0x6a7078, propSpots.planter, 0.55);
    // bus stops: bench + roof + pole, on the outer ring route
    const busStops = [[130, 39], [247, 130], [130, 247], [39, 130], [65, 39], [195, 247], [39, 195], [247, 65]];
    for (const [bx, bz] of busStops) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.7), new THREE.MeshLambertMaterial({ color: 0x8a5a3a }));
      bench.position.set(bx, GROUND_Y + 0.5, bz + 1);
      group.add(bench);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 1.6), new THREE.MeshLambertMaterial({ color: 0x2a6fd6 }));
      roof.position.set(bx, GROUND_Y + 2.6, bz + 1);
      group.add(roof);
      for (const dx of [-1.5, 1.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0x888888 }));
        post.position.set(bx + dx, GROUND_Y + 1.3, bz + 1);
        group.add(post);
      }
      addSign('BUS STOP', bx, GROUND_Y + 3.1, bz + 1, 3, '#2a6fd6', '#ffffff');
    }
  }

  // --- palms, pines, rocks --------------------------------------------------
  // 30+ beach palms along the sand
  for (let i = 0; i < 36; i++) {
    const palm = buildPalm();
    const px = rand(rng, 18, 28), pz = 8 + i * 7 + rand(rng, -2, 2);
    palm.position.set(px, GROUND_Y, pz);
    palm.rotation.y = rand(rng, 0, 6.28);
    palm.scale.setScalar(rand(rng, 0.85, 1.25));
    group.add(palm);
    colliders.circles.push({ x: px, z: pz, r: 0.4 });
  }
  // street palms along Shoreline Dr
  for (let i = 0; i < 12; i++) {
    const palm = buildPalm();
    const pz = 20 + i * 20 + rand(rng, -3, 3);
    palm.position.set(46, GROUND_Y, pz);
    palm.rotation.y = rand(rng, 0, 6.28);
    palm.scale.setScalar(rand(rng, 0.9, 1.1));
    group.add(palm);
    colliders.circles.push({ x: 46, z: pz, r: 0.4 });
  }
  // forest pines
  for (let i = 0; i < 50; i++) {
    const pine = buildPine();
    const px = rand(rng, 10, 250), pz = rand(rng, 268, 392);
    pine.position.set(px, GROUND_Y, pz);
    pine.rotation.y = rand(rng, 0, 6.28);
    pine.scale.setScalar(rand(rng, 0.8, 1.4));
    group.add(pine);
    colliders.circles.push({ x: px, z: pz, r: 0.5 });
  }
  // rocky hills boulders
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a7f6a });
  for (let i = 0; i < 30; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(rng, 0.8, 2.2), 0), rockMat);
    const rx = rand(rng, 268, 392), rz = rand(rng, 268, 392);
    rock.position.set(rx, GROUND_Y + 0.6, rz);
    rock.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), rand(rng, 0, 3));
    group.add(rock);
    colliders.circles.push({ x: rx, z: rz, r: 1.4 });
  }

  // --- per-frame updates ----------------------------------------------------
  let lastRed = null;
  let lightTimer = 0;
  let fallbackRed = true;
  function updatePoles(dt) {
    // wave shimmer
    const t = performance.now() / 1000;
    for (const w of waves) {
      if (w.userData.x0 === undefined) w.userData.x0 = w.position.x;
      w.position.x = w.userData.x0 + Math.sin(t * 0.3 + w.userData.phase) * 6;
    }
    // traffic lights: follow the game's 6 s cycle when present
    let red = null;
    if (game && typeof game.trafficRed === 'boolean') red = game.trafficRed;
    else {
      lightTimer += dt;
      if (lightTimer > 6) { lightTimer = 0; fallbackRed = !fallbackRed; }
      red = fallbackRed;
    }
    if (red === lastRed || !lightHeads) return;
    lastRed = red;
    const green = new THREE.Color(0x22dd55);
    const redC = new THREE.Color(0xdd2222);
    for (let i = 0; i < lightAxis.length; i++) {
      const isNs = lightAxis[i] === 'ns';
      lightHeads.setColorAt(i, (red && isNs) || (!red && !isNs) ? redC : green);
    }
    lightHeads.instanceColor.needsUpdate = true;
  }

  function updateSea(dt) {
    // kept for the main loop's call site; waves animate in updatePoles
  }

  return { group, sea, river, ground, trafficLights, colliders, interiors, updatePoles, updateSea };
}
