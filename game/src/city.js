// La Vega 3D — city builder (round 6 re-author, from REFERENCE.md).
// Own architecture: a tiny Kit of one-line builders (K.box / K.cyl / K.cone /
// K.slab / K.board), data-driven tables for places and shop signs, a canvas
// facade painter with pre-computed window rects, and a deterministic layout
// seed so the city is identical on every boot. All names original (La Vega).
import * as THREE from 'three';
import { WORLD, ROADS, PLACES, PLACE_DIMS, DISTRICTS, PALETTE, CITY_TUNING, BIOMES } from './config.js';
import { clamp, rand, pick, hash2, smoothNoise, mulberry32 } from './rng.js';
import { buildPalm, buildPine } from './loader.js';

// ---------------------------------------------------------------------------
// Kit: one-line mesh builders. Every builder drops its mesh into the given
// group, sets castShadow, and returns the mesh for further tweaking.
// ---------------------------------------------------------------------------
const _matCache = new Map();
function M(color, opts = {}) {
  const key = color + '|' + (opts.emissive || 0) + '|' + (opts.op || 1);
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshLambertMaterial({
      color,
      emissive: opts.emissive || 0x000000,
      transparent: opts.op < 1,
      opacity: opts.op,
    }));
  }
  return _matCache.get(key);
}
function basic(color, opts = {}) {
  return new THREE.MeshBasicMaterial({
    color, transparent: opts.op < 1, opacity: opts.op ?? 1, side: opts.side || THREE.FrontSide,
  });
}

const K = {
  box(g, w, h, d, color, x, y, z, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opts.mat || M(color, opts));
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = opts.shadow !== false;
    m.receiveShadow = true;
    g.add(m);
    return m;
  },
  cyl(g, rt, rb, h, color, x, y, z, seg = 10, opts = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), opts.mat || M(color, opts));
    m.position.set(x, y, z);
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = true;
    g.add(m);
    return m;
  },
  cone(g, r, h, color, x, y, z, seg = 4, opts = {}) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), opts.mat || M(color, opts));
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    m.castShadow = true;
    g.add(m);
    return m;
  },
  sph(g, r, color, x, y, z, opts = {}) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), opts.mat || M(color, opts));
    m.position.set(x, y, z);
    m.castShadow = false;
    g.add(m);
    return m;
  },
  // Flat slab (paved plot, road, sidewalk, roof panel): a thin box.
  slab(g, w, d, color, x, y, z, h = 0.12, opts = {}) {
    return K.box(g, w, h, d, color, x, y, z, { ...opts, shadow: false });
  },
  // Sign board: a plane with a canvas texture, facing -z by default
  // (buildings face -z; the board sits proud of the front wall).
  board(g, w, h, tex, x, y, z, opts = {}) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false }),
    );
    m.position.set(x, y, z);
    m.rotation.y = opts.ry ?? Math.PI;
    g.add(m);
    return m;
  },
};

// ---------------------------------------------------------------------------
// Canvas painters. Facades are painted once per building (window grid with
// mullion crosses, floor separators, ~12% lit windows); signs are painted
// once per text. Window rects are pre-computed so the painter is a loop.
// ---------------------------------------------------------------------------
function winRects(w, h, floors, cols) {
  const rects = [];
  const bandH = h / floors;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const ww = (w - 16) / cols;
      const wh = bandH * 0.55;
      rects.push({
        x: 8 + c * ww + ww * 0.18,
        y: 8 + f * bandH + bandH * 0.22,
        w: ww * 0.64,
        h: wh,
      });
    }
  }
  return rects;
}

function paintFacade(base, floors, cols, accent, seed = 1) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  const hex = '#' + base.toString(16).padStart(6, '0');
  x.fillStyle = hex;
  x.fillRect(0, 0, 256, 256);
  // Subtle vertical grime variation.
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(0,0,0,${0.03 + (hash2(i, seed) * 0.05)})`;
    x.fillRect(hash2(i, seed + 9) * 256, 0, 6 + hash2(i, seed + 3) * 14, 256);
  }
  const rects = winRects(256, 256, floors, cols);
  const rng = mulberry32(seed * 7919 + 13);
  for (const r of rects) {
    const lit = rng() < 0.12;
    x.fillStyle = lit ? '#ffd34d' : '#20283a';
    x.fillRect(r.x, 256 - r.y - r.h, r.w, r.h);
    // Mullion cross.
    x.fillStyle = hex;
    x.fillRect(r.x + r.w / 2 - 1, 256 - r.y - r.h, 2, r.h);
    x.fillRect(r.x, 256 - r.y - r.h / 2 - 1, r.w, 2);
    // Frame.
    x.strokeStyle = 'rgba(0,0,0,0.45)';
    x.lineWidth = 2;
    x.strokeRect(r.x, 256 - r.y - r.h, r.w, r.h);
  }
  // Floor separator bands.
  x.fillStyle = 'rgba(0,0,0,0.35)';
  for (let f = 1; f < floors; f++) x.fillRect(0, Math.round((256 / floors) * f) - 2, 256, 4);
  // Accent band at the top.
  x.fillStyle = '#' + accent.toString(16).padStart(6, '0');
  x.fillRect(0, 0, 256, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function paintSign(text, fg = 0xffd34d, bg = 0x14142a, sub = '') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#' + bg.toString(16).padStart(6, '0');
  x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#' + fg.toString(16).padStart(6, '0');
  x.lineWidth = 6;
  x.strokeRect(4, 4, 504, 120);
  x.fillStyle = '#' + fg.toString(16).padStart(6, '0');
  x.font = '900 52px Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const label = text.length > 18 ? text.slice(0, 18) : text;
  x.fillText(label.toUpperCase(), 256, sub ? 48 : 64);
  if (sub) {
    x.font = '700 30px Arial, sans-serif';
    x.fillStyle = '#cde';
    x.fillText(sub.toUpperCase(), 256, 96);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Terrain height. groundHeight is the WALK / SWIM level (what the player,
// NPCs and cars stand on); terrainH is the mesh height underneath it.
// ---------------------------------------------------------------------------
const CHANNEL = { x0: 262, x1: 292, z0: 0, z1: 260 }; // river between the islands
const DECKS = [
  { x0: 258, x1: 298, z0: 33, z1: 45 },   // North Bridge (z = 39)
  { x0: 258, x1: 298, z0: 241, z1: 253 }, // South Bridge (z = 247)
];
const AIRPORT = { x0: 285, x1: 385, z0: 108, z1: 152 };

function inRect(x, z, r) { return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; }
function deckFactor(x, z) {
  for (const d of DECKS) {
    if (z >= d.z0 && z <= d.z1 && x >= d.x0 && x <= d.x1) {
      // Fade in/out over 4 m at the deck ends so cars roll up, not teleport.
      const fx = Math.min(1, (x - d.x0) / 4, (d.x1 - x) / 4);
      return clamp(fx, 0, 1);
    }
  }
  return 0;
}
function terrainH(x, z) {
  if (x < 15) return -1.2 * clamp((15 - x) / 7, 0, 1); // seabed slope
  if (inRect(x, z, CHANNEL)) return -0.4; // riverbed
  if (inRect(x, z, AIRPORT)) return 0; // flat airfield
  if (x >= 260 && z >= 260) return 1.5 + smoothNoise(x * 0.03, z * 0.03) * 4.5; // rocky hills
  if (x >= 292 && z < 260) return smoothNoise(x * 0.04, z * 0.04) * 1.2; // desert dunes
  if (z >= 260 && x < 260) return smoothNoise(x * 0.06, z * 0.06) * 1.0; // forest floor
  if (x >= 130 && x < 260 && z >= 300) return 0.05; // swamp
  return 0; // city grid + beach
}
// True when the point is on a road or on a sidewalk strip next to one.
export function isOnRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) < WORLD.roadWidth / 2 + WORLD.sidewalk + 0.5) return true;
    if (Math.abs(z - r) < WORLD.roadWidth / 2 + WORLD.sidewalk + 0.5) return true;
  }
  return false;
}

export function groundHeight(x, z) {
  const deck = deckFactor(x, z);
  if (deck > 0) return 0.65 * deck;
  if (inRect(x, z, CHANNEL)) return 0.1; // swimming in the river
  if (x < 15) return 0.1; // swimming in the sea
  return terrainH(x, z);
}
export function isSea(x, z) { return x < 15; }
export function isInRiver(x, z) { return inRect(x, z, CHANNEL) && deckFactor(x, z) <= 0; }
function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  return DISTRICTS[0];
}

// ---------------------------------------------------------------------------
// Ground mesh (heightfield + vertex colours per biome) and water.
// ---------------------------------------------------------------------------
function buildGround(g) {
  const seg = 100;
  const geo = new THREE.PlaneGeometry(400, 400, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = [0.55, 0.81, 0.38], cGrass2 = [0.45, 0.72, 0.32];
  const cSand = [0.95, 0.83, 0.57], cDesert = [0.87, 0.74, 0.5];
  const cRock = [0.5, 0.48, 0.42], cForest = [0.32, 0.55, 0.28];
  const cSwamp = [0.35, 0.48, 0.29], cSea = [0.76, 0.66, 0.42];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + 200, z = pos.getZ(i) + 200;
    pos.setY(i, terrainH(x, z));
    let c;
    if (x < 15) c = cSea;
    else if (x < 30) c = cSand;
    else if (x >= 260 && z >= 260) c = cRock;
    else if (x >= 292) c = cDesert;
    else if (z >= 260) c = (x >= 130 && z >= 300) ? cSwamp : cForest;
    else c = (hash2(Math.floor(x), Math.floor(z)) < 0.5) ? cGrass : cGrass2;
    const v = 0.92 + hash2(Math.floor(x * 2), Math.floor(z * 2)) * 0.16;
    colors[i * 3] = c[0] * v; colors[i * 3 + 1] = c[1] * v; colors[i * 3 + 2] = c[2] * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.position.set(200, 0, 200);
  mesh.receiveShadow = true;
  g.add(mesh);
  // Sea + river water (translucent, just above the swim level).
  const waterMat = new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.75 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(15, 400), waterMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(7.5, 0.12, 200);
  g.add(sea);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(30, 260), waterMat.clone());
  river.rotation.x = -Math.PI / 2;
  river.position.set(277, 0.12, 130);
  g.add(river);
  // Swamp shallows.
  const swamp = new THREE.Mesh(
    new THREE.PlaneGeometry(130, 100),
    new THREE.MeshLambertMaterial({ color: PALETTE.swamp, transparent: true, opacity: 0.6 }),
  );
  swamp.rotation.x = -Math.PI / 2;
  swamp.position.set(195, 0.16, 350);
  g.add(swamp);
}

// ---------------------------------------------------------------------------
// Roads, sidewalks, markings, zebra crossings, traffic lights.
// ---------------------------------------------------------------------------
function buildRoads(g, city) {
  // Road ribbons (both axes) + sidewalks + centre dashes.
  for (const r of ROADS) {
    K.slab(g, 400, 10, PALETTE.road, 200, 0.06, r, 0.12); // EW ribbon
    K.slab(g, 10, 400, PALETTE.road, r, 0.06, 200, 0.12); // NS ribbon
    K.slab(g, 400, 2.5, PALETTE.sidewalk, 200, 0.09, r - 6.25, 0.1);
    K.slab(g, 400, 2.5, PALETTE.sidewalk, 200, 0.09, r + 6.25, 0.1);
    K.slab(g, 2.5, 400, PALETTE.sidewalk, r - 6.25, 0.09, 200, 0.1);
    K.slab(g, 2.5, 400, PALETTE.sidewalk, r + 6.25, 0.09, 200, 0.1);
    // Centre dashes (skip the intersections themselves).
    for (let d = 8; d < 400; d += 16) {
      const nearCross = ROADS.some((rr) => Math.abs(d - rr) < 9);
      if (nearCross) continue;
      K.slab(g, 3, 0.4, PALETTE.roadLine, d, 0.13, r, 0.05, { shadow: false });
      K.slab(g, 0.4, 3, PALETTE.roadLine, r, 0.13, d, 0.05, { shadow: false });
    }
  }
  // Zebra crossings + traffic lights at 5 main intersections only.
  const crosses = [[117, 117], [143, 143], [91, 169], [169, 91], [195, 195]];
  for (const [cx, cz] of crosses) {
    for (let i = -2; i <= 2; i++) {
      K.slab(g, 0.9, 8, 0xf2f5f7, cx + i * 1.8, 0.14, cz - 5.5, 0.05, { shadow: false });
      K.slab(g, 0.9, 8, 0xf2f5f7, cx + i * 1.8, 0.14, cz + 5.5, 0.05, { shadow: false });
      K.slab(g, 8, 0.9, 0xf2f5f7, cx - 5.5, 0.14, cz + i * 1.8, 0.05, { shadow: false });
      K.slab(g, 8, 0.9, 0xf2f5f7, cx + 5.5, 0.14, cz + i * 1.8, 0.05, { shadow: false });
    }
    // One light pole per crossing (housing + red/green lamps).
    const pole = K.cyl(g, 0.09, 0.12, 5.2, 0x2a2a2e, cx + 6.5, 2.6, cz + 6.5, 8);
    void pole;
    const housing = K.box(g, 0.5, 1.1, 0.5, 0x1a1a1e, cx + 6.5, 5.0, cz + 6.5);
    void housing;
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2233 }));
    red.position.set(cx + 6.5, 5.25, cz + 6.2);
    g.add(red);
    const green = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0x22dd55 }));
    green.position.set(cx + 6.5, 4.85, cz + 6.2);
    green.visible = false;
    g.add(green);
    city.trafficLights.push({ red, green });
  }
}

// ---------------------------------------------------------------------------
// Buildings. buildOne erects a single shop/house from a spec table; the
// specials table adds the landmark extras (neon, columns, dome, bays).
// ---------------------------------------------------------------------------
const SHOP_SIGNS = ['DONUTS', 'TACOS', 'PIZZA', 'BAR', 'HOTEL', 'GYM', 'CAFE', 'MARKET', 'PHARMACY', 'LAUNDRY', 'BURGER', 'SUSHI', 'BOOKS', 'FLOWERS', 'BIKES', 'TOYS', 'BAKERY', 'DELI', 'RAMEN', 'TATTOO'];
const WALL_COLORS = [0xc9a06a, 0xb8a88e, 0xa86a4a, 0x7a9a8a, 0x9a8a7a, 0x6a8aa0, 0xd8c8a8, 0x8a7a6a, 0xc07850, 0x5a7a9a];

function addSign(g, city, x, y, z, text, w = 5, fg = 0xffd34d, bg = 0x14142a, sub = '') {
  const tex = paintSign(text, fg, bg, sub);
  const board = K.board(g, w, w * 0.25, tex, x, y, z);
  city.signCount++;
  return board;
}

function addCollider(city, x, z, w, d, pad = 0.3) {
  city.colliders.push({ x0: x - w / 2 - pad, z0: z - d / 2 - pad, x1: x + w / 2 + pad, z1: z + d / 2 + pad });
}

// One building: paved plot, proud base, facade-textured body, canopy,
// cornice, pilasters, roof (pitched cone for narrow plots, flat + parapet
// for wide ones), and a sign on the -z face.
function buildOne(g, city, rng, spec) {
  const { x, z, w, d, h } = spec;
  const base = spec.base ?? pick(rng, WALL_COLORS);
  const accent = spec.accent ?? 0xffd34d;
  const floors = Math.max(1, Math.round(h / 3.2));
  const cols = Math.max(2, Math.round(w / 2.2));
  const tex = paintFacade(base, floors, cols, accent, Math.floor(x * 7 + z * 13) % 997 + 1);
  // Paved plot slab under the building (density: no bare grass gaps).
  K.slab(g, w + 2.5, d + 2.5, 0xb8b0a0, x, 0.07, z, 0.14);
  // Proud ground floor.
  K.box(g, w + 0.7, 3.1, d + 0.7, 0x8a7a68, x, 1.55, z);
  // Main body with the painted facade.
  const bodyMat = new THREE.MeshLambertMaterial({ map: tex });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
  body.position.set(x, h / 2 + 0.1, z);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // Canopy over the door + two posts.
  const frontZ = z - d / 2;
  K.box(g, Math.min(4, w * 0.6), 0.18, 1.6, 0x2a2a2e, x, 3.3, frontZ - 0.7);
  K.cyl(g, 0.07, 0.07, 3.3, 0x2a2a2e, x - 1.4, 1.65, frontZ - 1.3, 6);
  K.cyl(g, 0.07, 0.07, 3.3, 0x2a2a2e, x + 1.4, 1.65, frontZ - 1.3, 6);
  // Door (dark, on the -z face).
  K.box(g, 1.4, 2.4, 0.15, 0x1a2028, x, 1.3, frontZ - 0.05);
  // Crown cornice + pilasters.
  K.box(g, w + 0.5, 0.45, d + 0.5, 0x6a5a48, x, h + 0.1, z);
  for (const sx of [-1, 1]) {
    K.box(g, 0.5, h * 0.7, 0.3, 0x6a5a48, x + sx * (w / 2 - 0.4), h * 0.35 + 0.1, frontZ - 0.08);
  }
  // Roof: narrow plots get a pitched cone (never a small dome — a 1-2 m
  // sphere at roof height reads as a lollipop crown); wide plots get a
  // flat roof with a parapet and a rooftop box.
  if (spec.roof === 'dome') {
    const dome = K.sph(g, 3.2, 0x2a6fd6, x, h + 1.6, z);
    dome.scale.y = 0.75;
  } else if (w <= 8.5 || spec.roof === 'pitched') {
    K.cone(g, Math.max(w, d) * 0.72, 2.2, 0x8a3a2a, x, h + 1.2, z, 4, { ry: Math.PI / 4 });
  } else {
    K.box(g, w + 0.3, 0.35, d + 0.3, 0x5a4a3a, x, h + 0.3, z);
    K.box(g, w * 0.3, 1.1, d * 0.3, 0x7a7a7a, x + w * 0.2, h + 0.9, z);
  }
  // Sign on the front face.
  if (spec.sign) {
    addSign(g, city, x, Math.min(h * 0.72, h - 1.2), frontZ - 0.35, spec.sign, spec.signW || Math.min(6, w * 0.8), spec.signFg, spec.signBg, spec.signSub || '');
  }
  addCollider(city, x, z, w, d);
  return body;
}

// Landmark extras, keyed by place. Each runs after buildOne.
const SPECIALS = {
  club(g, city, p, dims) {
    // Neon glow strip + a second tall neon sign.
    K.box(g, dims.w, 0.35, 0.3, 0xff2a9d, p.x, 4.6, p.y - dims.d / 2 - 0.3, { mat: new THREE.MeshBasicMaterial({ color: 0xff2a9d }) });
    addSign(g, city, p.x, dims ? 9.5 : 9.5, p.y - dims.d / 2 - 0.4, "LA ROSA'S", 7, 0xff2a9d, 0x1a0a2e, 'CLUB');
  },
  casino(g, city, p, dims) {
    // Setback top floor + gold neon.
    K.box(g, dims.w * 0.6, 3, dims.d * 0.6, 0x8a6a1a, p.x, 13.5, p.y);
    K.box(g, dims.w, 0.35, 0.3, 0xffd34d, p.x, 5.2, p.y - dims.d / 2 - 0.3, { mat: new THREE.MeshBasicMaterial({ color: 0xffd34d }) });
  },
  cityHall(g, city, p, dims) {
    // Five columns + portico + flag.
    for (let i = -2; i <= 2; i++) K.cyl(g, 0.45, 0.5, 7, 0xe8e0d0, p.x + i * 2.6, 3.5, p.y - dims.d / 2 - 1.2, 10);
    K.box(g, dims.w + 2, 0.8, 3, 0xe8e0d0, p.x, 7.4, p.y - dims.d / 2 - 1.2);
    K.cyl(g, 0.06, 0.06, 9, 0x2a2a2e, p.x, 14, p.y + 2, 6);
    K.box(g, 1.6, 1.0, 0.05, 0xffd34d, p.x, 17.5, p.y + 2, { mat: new THREE.MeshBasicMaterial({ color: 0xffd34d }) });
  },
  mall(g, city, p, dims) {
    K.box(g, dims.w + 2, 0.3, 4, 0x2a2a2e, p.x, 3.6, p.y - dims.d / 2 - 1.5);
  },
  hospital(g, city, p, dims) {
    // Rooftop box + red cross.
    K.box(g, 5, 2, 5, 0xe8e8e8, p.x, 12, p.y);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xd92038 });
    K.box(g, 0.8, 2.4, 0.2, 0xd92038, p.x, 13.6, p.y - dims.d / 2 - 0.2, { mat: crossMat });
    K.box(g, 2.4, 0.8, 0.2, 0xd92038, p.x, 13.6, p.y - dims.d / 2 - 0.2, { mat: crossMat });
  },
  garage(g, city, p, dims) {
    // Three open bays (dark openings on the front).
    for (let i = -1; i <= 1; i++) K.box(g, 3, 2.8, 0.3, 0x14141a, p.x + i * 4, 1.5, p.y - dims.d / 2 - 0.1);
  },
  workshop(g, city, p, dims) {
    // Sawtooth roof: three pitched ridges.
    for (let i = -1; i <= 1; i++) K.cone(g, 2.6, 1.6, 0x6a7a8a, p.x + i * 4, 11.5, p.y, 4, { ry: Math.PI / 4 });
  },
  gas(g, city, p, dims) {
    // Forecourt canopy on four posts + two pumps.
    for (const [px, pz] of [[-4, -6], [4, -6], [-4, 2], [4, 2]]) K.cyl(g, 0.12, 0.12, 4.5, 0x2a2a2e, p.x + px, 2.25, p.y + pz, 8);
    K.box(g, 11, 0.4, 10, 0xf2f5f7, p.x, 4.7, p.y - 2);
    for (const sx of [-1, 1]) K.box(g, 0.8, 1.4, 0.6, 0xd92038, p.x + sx * 2, 0.8, p.y - 5);
  },
  station(g, city, p, dims) {
    // Blue LVPD band + flag.
    K.box(g, dims.w, 0.6, 0.3, 0x2a6fd6, p.x, 4.4, p.y - dims.d / 2 - 0.3, { mat: new THREE.MeshBasicMaterial({ color: 0x2a6fd6 }) });
    K.cyl(g, 0.06, 0.06, 8, 0x2a2a2e, p.x + dims.w / 2 + 1, 4, p.y - dims.d / 2, 6);
    K.box(g, 1.4, 0.9, 0.05, 0x2a6fd6, p.x + dims.w / 2 + 1, 7.2, p.y - dims.d / 2, { mat: new THREE.MeshBasicMaterial({ color: 0x2a6fd6 }) });
  },
  dealer(g, city, p, dims) {
    // Glass showroom front.
    K.box(g, dims.w * 0.8, 2.6, 0.2, 0x2e4a5a, p.x, 1.5, p.y - dims.d / 2 - 0.1, { mat: new THREE.MeshLambertMaterial({ color: 0x2e4a5a, emissive: 0x0a1a22 }) });
  },
  villa(g, city, p, dims) {
    // Garden wall + pool.
    K.box(g, dims.w + 4, 1.1, 0.4, 0xe8dcc0, p.x, 0.55, p.y - dims.d / 2 - 3);
    K.slab(g, 5, 3, 0x2f9fd8, p.x + dims.w / 2 + 3, 0.1, p.y + 3, 0.1, { shadow: false });
  },
  villa2(g, city, p, dims) {
    K.box(g, dims.w + 4, 1.1, 0.4, 0xe8dcc0, p.x, 0.55, p.y - dims.d / 2 - 3);
    K.slab(g, 6, 3.5, 0x2f9fd8, p.x - dims.w / 2 - 3, 0.1, p.y + 3, 0.1, { shadow: false });
  },
};

// Place -> building spec (height by district feel, sign text, roof style).
function placeSpec(key, p, dims, rng) {
  const d = districtAt(p.x, p.y);
  const tall = d.key === 'downtown' ? [12, 20] : d.key === 'neon' ? [9, 15] : [7, 12];
  const spec = {
    x: p.x, z: p.y, w: dims.w, d: dims.d,
    h: key === 'cityHall' ? 12 : key === 'hospital' ? 11 : key === 'mall' ? 10 : rand(rng, tall[0], tall[1]),
    sign: p.name, signW: Math.min(8, dims.w * 0.75),
    roof: key === 'cityHall' ? 'dome' : key === 'villa' || key === 'villa2' || key === 'safehouse' ? 'pitched' : 'flat',
  };
  if (key === 'club') { spec.base = 0x5a2a6a; spec.signFg = 0xff2a9d; spec.signSub = 'CLUB'; }
  if (key === 'casino') { spec.base = 0x8a6a1a; spec.signFg = 0xffd34d; spec.signSub = 'CASINO'; }
  if (key === 'hospital') { spec.base = 0xe8e8e8; spec.signFg = 0xd92038; }
  if (key === 'station') { spec.base = 0x4a6a8a; spec.signFg = 0x9ecfff; }
  if (key === 'dealer') { spec.base = 0x2a4a5a; spec.signFg = 0xffd34d; }
  if (key === 'garage' || key === 'workshop') { spec.base = 0x7a6a55; }
  return spec;
}

function buildNamed(g, city, rng) {
  const skip = new Set(['beach', 'harbor', 'pierPickup', 'dock', 'park', 'airport', 'bridgeN', 'bridgeS']);
  for (const key of Object.keys(PLACES)) {
    if (skip.has(key)) continue;
    const p = PLACES[key];
    const dims = PLACE_DIMS[key] || { w: 14, d: 11 };
    const spec = placeSpec(key, p, dims, rng);
    buildOne(g, city, rng, spec);
    if (SPECIALS[key]) SPECIALS[key](g, city, p, dims);
  }
}

function buildBlocks(g, city, rng) {
  // Generic blocks between the roads. A block whose rect touches a named
  // building's footprint is skipped (the landmark owns that ground).
  const namedRects = Object.keys(PLACES).map((k) => {
    const p = PLACES[k];
    const dims = PLACE_DIMS[k] || { w: 14, d: 11 };
    return { x0: p.x - dims.w / 2 - 3, z0: p.y - dims.d / 2 - 3, x1: p.x + dims.w / 2 + 3, z1: p.y + dims.d / 2 + 3 };
  });
  const hitsNamed = (x0, z0, x1, z1) => namedRects.some((r) => x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0);
  for (let i = 0; i < ROADS.length - 1; i++) {
    for (let j = 0; j < ROADS.length - 1; j++) {
      const bx0 = ROADS[i] + 7.5, bx1 = ROADS[i + 1] - 7.5;
      const bz0 = ROADS[j] + 7.5, bz1 = ROADS[j + 1] - 7.5;
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      if (hitsNamed(bx0, bz0, bx1, bz1)) continue;
      const roll = rng();
      const d = districtAt(cx, cz);
      const hBase = d.key === 'downtown' ? [10, 20] : d.key === 'neon' ? [8, 15] : d.key === 'marina' ? [6, 12] : [5, 10];
      if (roll < CITY_TUNING.parkChance) {
        // Mini-park: lawn, two palms, a bench.
        K.slab(g, bx1 - bx0 + 1, bz1 - bz0 + 1, PALETTE.park, cx, 0.08, cz, 0.12);
        const t1 = buildPalm(); t1.position.set(cx - 2.5, 0, cz - 2); g.add(t1);
        const t2 = buildPalm(); t2.position.set(cx + 2.5, 0, cz + 2); g.add(t2);
        K.box(g, 2.2, 0.5, 0.7, 0x8a6a46, cx, 0.5, cz + 3.5);
        continue;
      }
      if (roll < CITY_TUNING.parkChance + CITY_TUNING.twoBuildingChance) {
        // Two small shops side by side.
        for (const s of [-1, 1]) {
          const sx = cx + s * 2.9;
          const sign = pick(rng, SHOP_SIGNS);
          buildOne(g, city, rng, {
            x: sx, z: cz, w: 5.2, d: 8.5, h: rand(rng, hBase[0], hBase[1]),
            sign, signW: 4.4, roof: 'pitched',
          });
        }
      } else {
        // One bigger shop.
        const sign = pick(rng, SHOP_SIGNS);
        buildOne(g, city, rng, {
          x: cx, z: cz, w: 9, d: 9, h: rand(rng, hBase[0], hBase[1]),
          sign, signW: 6, roof: rand(rng, 0, 1) < 0.5 ? 'pitched' : 'flat',
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Nature + props: palms on the beach, pines in the forest, cacti and rocks
// in the desert, boulders in the hills, reeds in the swamp. Nothing spawns
// on a road (7 m clearance) or in the water.
// ---------------------------------------------------------------------------
function onRoad(x, z) {
  for (const r of ROADS) if (Math.abs(x - r) < 7 || Math.abs(z - r) < 7) return true;
  return false;
}
function buildNature(g, city, rng) {
  // Beach palms (sand strip) + street palms along the sidewalks.
  for (let i = 0; i < 42; i++) {
    const x = 18 + rng() * 10, z = 8 + rng() * 244;
    if (onRoad(x, z)) continue;
    const t = buildPalm();
    t.position.set(x, 0, z);
    t.rotation.y = rng() * Math.PI * 2;
    const s = 0.85 + rng() * 0.4;
    t.scale.setScalar(s);
    g.add(t);
  }
  for (let i = 0; i < 26; i++) {
    const r = pick(rng, ROADS);
    const along = 20 + rng() * 220;
    const side = rng() < 0.5 ? -1 : 1;
    const x = (rng() < 0.5 ? r + side * 6.8 : along);
    const z = (rng() < 0.5 ? along : r + side * 6.8);
    if (x < 32 || x > 258 || z < 4 || z > 256 || onRoad(x, z)) continue;
    const t = buildPalm();
    t.position.set(x, 0, z);
    t.scale.setScalar(0.8 + rng() * 0.3);
    g.add(t);
  }
  // Forest: dense pines (x 0..260, z 260..400) + a dirt road.
  for (let i = 0; i < 150; i++) {
    const x = 6 + rng() * 248, z = 264 + rng() * 132;
    if (onRoad(x, z)) continue;
    const t = buildPine();
    t.position.set(x, terrainH(x, z), z);
    t.rotation.y = rng() * Math.PI * 2;
    t.scale.setScalar(0.9 + rng() * 0.7);
    g.add(t);
  }
  K.slab(g, 260, 4, 0x8a6a46, 130, 0.08, 330, 0.1, { shadow: false }); // forest dirt road
  // Desert: cacti + rocks (x 292..400, z 0..260), long highway.
  for (let i = 0; i < 46; i++) {
    const x = 296 + rng() * 100, z = 8 + rng() * 248;
    if (inRect(x, z, AIRPORT)) continue;
    const c = new THREE.Group();
    const gm = M(0x3f9e4d);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 2.4, 8), gm);
    stem.position.y = 1.2; stem.castShadow = true;
    c.add(stem);
    for (const [ax, ay] of [[-0.6, 1.2], [0.6, 1.6]]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 8), gm);
      arm.position.set(ax, ay, 0);
      arm.rotation.z = ax < 0 ? 0.5 : -0.5;
      c.add(arm);
    }
    c.position.set(x, terrainH(x, z), z);
    g.add(c);
  }
  for (let i = 0; i < 36; i++) {
    const x = 296 + rng() * 100, z = 8 + rng() * 248;
    if (inRect(x, z, AIRPORT)) continue;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + rng() * 1.1, 0), M(0x7a756e));
    rock.position.set(x, terrainH(x, z) + 0.4, z);
    rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rock.castShadow = true;
    g.add(rock);
  }
  K.slab(g, 4, 240, 0x4a505c, 345, 0.08, 130, 0.1, { shadow: false }); // desert highway
  // Rocky hills: big boulders (dodecahedrons — never spheres) + cliffs.
  for (let i = 0; i < 42; i++) {
    const x = 266 + rng() * 130, z = 266 + rng() * 130;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 + rng() * 2.4, 0), M(0x6a655c));
    rock.position.set(x, terrainH(x, z) + 0.6, z);
    rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rock.castShadow = true;
    g.add(rock);
    addCollider(city, x, z, 2.5, 2.5, 0.5);
  }
  // Swamp reeds.
  for (let i = 0; i < 60; i++) {
    const x = 134 + rng() * 122, z = 304 + rng() * 92;
    const reed = K.cyl(g, 0.03, 0.05, 1.6 + rng() * 0.8, 0x4a7a3a, x, 0.9, z, 5, { shadow: false });
    reed.rotation.z = (rng() - 0.5) * 0.25;
  }
  // Palm Court Park (104,78): lawn, pond, benches, palms.
  K.slab(g, 22, 16, PALETTE.park, 104, 0.08, 78, 0.12);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20), new THREE.MeshLambertMaterial({ color: PALETTE.pond }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(110, 0.14, 82);
  g.add(pond);
  for (const [bx, bz] of [[96, 72], [112, 74], [98, 86]]) K.box(g, 2.2, 0.5, 0.7, 0x8a6a46, bx, 0.5, bz);
  for (const [tx, tz] of [[98, 74], [110, 72], [100, 84], [108, 86]]) {
    const t = buildPalm();
    t.position.set(tx, 0, tz);
    g.add(t);
  }
  // Beach umbrellas + lifeguard stand near (23,78).
  for (const [ux, uz, col] of [[20, 70, 0xff2a9d], [24, 86, 0xffd34d], [19, 94, 0x2a6fd6], [25, 64, 0x22c3aa]]) {
    K.cyl(g, 0.05, 0.05, 2.4, 0x8a6a46, ux, 1.2, uz, 6);
    K.cone(g, 1.6, 0.8, col, ux, 2.7, uz, 8);
  }
  K.box(g, 2.4, 2.2, 2.4, 0xf2f5f7, 22, 1.1, 100);
  K.box(g, 2.6, 0.3, 2.6, 0xd92038, 22, 2.35, 100);
}

// ---------------------------------------------------------------------------
// Power poles, street lamps, bus stops, harbor, airport, bridges.
// ---------------------------------------------------------------------------
function buildProps(g, city, rng) {
  // Power poles along the two main avenues; cars can knock them down.
  city.poles = [];
  for (const road of [117, 143]) {
    for (let d = 30; d < 250; d += 26) {
      const grp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 7, 8), M(0x4a3a2a));
      pole.position.y = 3.5; pole.castShadow = true;
      grp.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), M(0x4a3a2a));
      arm.position.y = 6.6;
      grp.add(arm);
      grp.position.set(road + 6.8, 0, d);
      g.add(grp);
      city.poles.push({ grp, x: road + 6.8, z: d, down: false, fallT: 0 });
    }
  }
  // Street lamps along every other road.
  for (const road of [65, 117, 169, 221]) {
    for (let d = 24; d < 250; d += 34) {
      K.cyl(g, 0.07, 0.1, 5.5, 0x2a2a2e, road - 6.8, 2.75, d, 8);
      K.box(g, 1.6, 0.12, 0.12, 0x2a2a2e, road - 6.0, 5.4, d);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
      );
      lamp.position.set(road - 5.2, 5.3, d);
      g.add(lamp);
    }
  }
  // Bus stops (shelter on the sidewalk, bench facing the road).
  for (const [sx, sz, ry] of [[110.5, 117, 0], [150.5, 143, Math.PI / 2], [117, 150.5, Math.PI]]) {
    K.box(g, 4, 0.15, 1.8, 0x2a6fd6, sx, 2.6, sz, { ry });
    for (const [px, pz] of [[-1.8, -0.7], [1.8, -0.7], [-1.8, 0.7], [1.8, 0.7]]) {
      K.cyl(g, 0.05, 0.05, 2.6, 0x2a2a2e, sx + px, 1.3, sz + pz, 6);
    }
    K.box(g, 3.4, 0.45, 0.6, 0x8a6a46, sx, 0.55, sz, { ry });
  }
  // Harbor: pier into the sea, containers, two cranes, a ship.
  const pierMat = M(PALETTE.pier);
  for (let i = 0; i < 10; i++) K.box(g, 1.9, 0.25, 6, PALETTE.pier, 20 - i * 2, 0.5, 130, { mat: pierMat });
  for (let i = 0; i < 6; i++) K.cyl(g, 0.18, 0.18, 1.6, 0x6a4a2a, 20 - i * 3.4, 0.2, 127.4, 8);
  const contCols = [0xd92038, 0x2a6fd6, 0xffd34d, 0x22c3aa, 0x8a5a2a];
  for (let i = 0; i < 6; i++) {
    const cx = 26 + (i % 3) * 7, cz = 118 + Math.floor(i / 3) * 8;
    K.box(g, 6, 2.6, 2.6, contCols[i % contCols.length], cx, 1.4, cz);
    addCollider(city, cx, cz, 6, 2.6, 0.2);
    if (i % 2 === 0) K.box(g, 6, 2.6, 2.6, contCols[(i + 2) % contCols.length], cx, 4.0, cz);
  }
  for (const [kx, kz] of [[34, 108], [34, 152]]) {
    K.box(g, 2, 14, 2, 0xd9a13c, kx, 7, kz);
    K.box(g, 10, 1.2, 1.2, 0xd9a13c, kx + 3, 13.2, kz);
    K.box(g, 1, 1.6, 1, 0x2a2a2e, kx + 7, 12, kz);
    addCollider(city, kx, kz, 2, 2, 0.2);
  }
  // Ship in the sea.
  K.box(g, 16, 3, 5, 0x2a3a4a, 8, 0.6, 170);
  K.box(g, 5, 2.4, 4, 0xe8e8e8, 8, 3.2, 170);
  K.box(g, 1, 3.4, 1, 0xd92038, 6, 5, 170);
  // Airport: runway, tarmac, terminal, windsock.
  K.slab(g, 90, 12, 0x2a2e36, 335, 0.08, 130, 0.12, { shadow: false });
  for (let d = 296; d < 375; d += 12) K.slab(g, 5, 0.5, 0xf2f5f7, d, 0.15, 130, 0.05, { shadow: false });
  K.slab(g, 40, 20, 0x8a8a92, 320, 0.07, 152, 0.1, { shadow: false });
  K.box(g, 22, 7, 12, 0x9aa8b8, 320, 3.5, 164);
  addSign(g, city, 320, 8.2, 157.8, 'LA VEGA AIR', 10, 0x9ecfff, 0x1a2a3a);
  addCollider(city, 320, 164, 22, 12, 0.2);
  K.cyl(g, 0.08, 0.08, 7, 0x2a2a2e, 300, 3.5, 118, 6);
  K.cone(g, 0.5, 2.2, 0xff8c1a, 300, 7.6, 118, 8, { rx: Math.PI / 2 });
  // Bridges: deck + rails + pillars over the river channel.
  for (const d of DECKS) {
    const cx = (d.x0 + d.x1) / 2, cz = (d.z0 + d.z1) / 2;
    const w = d.x1 - d.x0;
    K.box(g, w, 0.5, 12, 0x8a8a92, cx, 0.4, cz);
    K.slab(g, w, 10, PALETTE.road, cx, 0.68, cz, 0.1, { shadow: false });
    for (const sz of [-1, 1]) K.box(g, w, 1.0, 0.35, 0xd9a13c, cx, 1.15, cz + sz * 5.8);
    for (const px of [266, 278, 290]) {
      K.box(g, 1.2, 2.2, 11, 0x6a655c, px, -0.6, cz);
    }
    for (let dd = d.x0 + 4; dd < d.x1; dd += 8) K.slab(g, 2.4, 0.35, PALETTE.roadLine, dd, 0.74, cz, 0.05, { shadow: false });
  }
}

// ---------------------------------------------------------------------------
// Interiors: one room per enterable place, built underground (y = -40).
// The room is open-topped (the interior camera looks in over the walls).
// ---------------------------------------------------------------------------
const INTERIOR_KEYS = ['club', 'bank', 'jewelry', 'minimarket', 'gunShop', 'safehouse', 'garage', 'workshop', 'restaurant', 'clotheshop', 'salon', 'tattoo', 'mall', 'hospital', 'station', 'dealer'];
const INTERIOR_FLOOR = {
  club: 0x3a1a4a, bank: 0x8a7a5a, jewelry: 0x6a5a3a, minimarket: 0xd8d8d8, gunShop: 0x4a4a4a,
  safehouse: 0x7a6a55, garage: 0x5a5a5a, workshop: 0x6a5a48, restaurant: 0x8a5a3a, clotheshop: 0xc8b8a8,
  salon: 0xd8a8c8, tattoo: 0x3a3a3a, mall: 0xb8c8d8, hospital: 0xe8f0f0, station: 0x4a6a8a, dealer: 0x2a3a4a,
};

function buildInteriors(g, city) {
  for (const key of INTERIOR_KEYS) {
    const p = PLACES[key];
    if (!p) continue;
    const dims = PLACE_DIMS[key] || { w: 12, d: 10 };
    const w = dims.w, d = dims.d;
    const room = { x: p.x, z: p.y, w, d };
    city.interiors[key] = room;
    const y0 = -40;
    const rg = new THREE.Group();
    // Floor + walls (open top).
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: INTERIOR_FLOOR[key] || 0x8a7a68 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(p.x, y0 + 0.05, p.y);
    rg.add(floor);
    const wallMat = M(0xd8d0c0);
    const mkWall = (ww, dd, wx, wz) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, 3.6, dd), wallMat);
      wall.position.set(wx, y0 + 1.8, wz);
      rg.add(wall);
    };
    mkWall(w, 0.3, p.x, p.y - d / 2);
    mkWall(w, 0.3, p.x, p.y + d / 2);
    mkWall(0.3, d, p.x - w / 2, p.y);
    mkWall(0.3, d, p.x + w / 2, p.y);
    // Counter near the north wall + shelves.
    K.box(rg, Math.min(5, w * 0.5), 1.1, 1.2, 0x6a4a2a, p.x, y0 + 0.55, p.y - d / 2 + 1.2);
    K.box(rg, w * 0.6, 0.15, 0.8, 0x8a6a46, p.x - w * 0.15, y0 + 2.2, p.y - d / 2 + 0.4);
    K.box(rg, 1.2, 1.8, 1.2, 0x5a6a7a, p.x + w * 0.25, y0 + 0.9, p.y + d / 2 - 1.6);
    // Blue exit door on the south wall (the way out).
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.5), new THREE.MeshBasicMaterial({ color: 0x2a6fd6 }));
    door.position.set(p.x, y0 + 1.25, p.y + d / 2 - 0.18);
    door.rotation.y = Math.PI;
    rg.add(door);
    // Warm ceiling glow panel (no extra lights — the room reads bright).
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, d * 0.4), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(p.x, y0 + 3.5, p.y);
    rg.add(glow);
    g.add(rg);
  }
}

// ---------------------------------------------------------------------------
// Sea animation (foam + wave strips) and knock-down power poles.
// ---------------------------------------------------------------------------
function buildSeaAnim(g, city) {
  city._waves = [];
  for (let i = 0; i < 8; i++) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 0.9),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }),
    );
    strip.rotation.x = -Math.PI / 2;
    const bx = 9 + (i % 3) * 2.2;
    const bz = 20 + i * 48;
    strip.position.set(bx, 0.18, bz);
    g.add(strip);
    city._waves.push({ mesh: strip, bx, bz, ph: i * 0.9, sp: 0.5 + (i % 3) * 0.2 });
  }
  // Foam line hugging the beach.
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 400),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(15.2, 0.16, 200);
  g.add(foam);
  city._foam = foam;
}

function updateSea(city, dt) {
  city._seaT = (city._seaT || 0) + dt;
  const t = city._seaT;
  for (const w of city._waves) {
    w.mesh.position.x = w.bx + Math.sin(t * w.sp + w.ph) * 1.6;
    w.mesh.material.opacity = 0.22 + 0.16 * Math.sin(t * w.sp * 1.3 + w.ph);
  }
  if (city._foam) city._foam.material.opacity = 0.32 + 0.12 * Math.sin(t * 0.7);
}

function updatePoles(city, dt, cars) {
  if (!city.poles) return;
  for (const pole of city.poles) {
    if (pole.down) {
      if (pole.fallT < 1) {
        pole.fallT = Math.min(1, pole.fallT + dt * 1.4);
        pole.grp.rotation.z = pole.fallT * 1.35;
      }
      continue;
    }
    for (const car of cars) {
      if (!car || Math.abs(car.speed || 0) < 7) continue;
      const dx = car.x - pole.x, dz = car.z - pole.z;
      if (dx * dx + dz * dz < 2.2 * 2.2) {
        pole.down = true;
        pole.fallT = 0;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Assembly.
// ---------------------------------------------------------------------------
export function buildCity(scene, MODELS) {
  const rng = mulberry32(20261124);
  const group = new THREE.Group();
  scene.add(group);
  const city = {
    group,
    trafficLights: [],
    interiors: {},
    colliders: [],
    signCount: 0,
    poles: [],
    _waves: [],
    _seaT: 0,
    updateSea(dt) { updateSea(city, dt); },
    updatePoles(dt, cars) { updatePoles(city, dt, cars); },
  };
  void MODELS;
  buildGround(group);
  buildRoads(group, city);
  buildNamed(group, city, rng);
  buildBlocks(group, city, rng);
  buildNature(group, city, rng);
  buildProps(group, city, rng);
  buildInteriors(group, city);
  buildSeaAnim(group, city);
  return city;
}
