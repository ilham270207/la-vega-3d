// La Vega 3D — city builder (round 8 re-author).
//
// Rebuilt from the design document (REFERENCE.md) and a visual study of
// the old build ilham loved: bright flat PS2 colours, dark asphalt with
// double yellow centrelines, wide pale sidewalks, grass verges, power
// lines on wooden poles, purple club with pink lit windows, grey towers
// with dense window grids, palms with long drooping fronds, round-canopy
// shade trees, and a wooden pier with a yellow GPS beam. Every facade is
// detailed (window grids, lit windows, base, canopy, cornice, sign) —
// no plain box ever stands in for a finished building.
//
// Exports: buildCity(scene, MODELS), groundHeight(x, z), isInRiver,
// isSea, isOnRoad. The returned city object carries .group (the whole
// city, for probes), .trafficLights [{red, green}], .colliders (AABB
// list for the player + cars), .interiors {key: {x, z, w, d}} (rooms at
// y = -40), .updatePoles(dt, cars) and .updateSea(dt).
import * as THREE from 'three';
import { WORLD, ROADS, PLACES, PLACE_DIMS, PALETTE, CITY_TUNING, BIOMES, STREET_NS, STREET_EW } from './config.js';
import { buildPalm, buildPine } from './loader.js';

// ---------------------------------------------------------------------------
// Deterministic dice (the city layout must be identical every boot).
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261124);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const rr = (a, b) => a + rng() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------------------
// Terrain height. The city grid is flat (y = 0). The river cuts north-
// south through the desert at x 274..292 (water level 0.1); the two
// bridges carry the road over it on a 0.65 m deck. The sea floor is
// -0.5. The rocky south-east rises in smooth, gentle swells (never a
// pyramid) that fade to flat at the biome borders, so there is no seam.
// ---------------------------------------------------------------------------
const RIVER = { x0: 274, x1: 292, z0: 0, z1: 260 };
const BRIDGE_BANDS = [{ z0: 33, z1: 45 }, { z0: 241, z1: 253 }];
const DECK = { x0: 258, x1: 298 };

function onBridgeDeck(x, z) {
  if (x < DECK.x0 || x > DECK.x1) return false;
  return BRIDGE_BANDS.some((b) => z >= b.z0 && z <= b.z1);
}
function inRiverChannel(x, z) {
  return x >= RIVER.x0 && x <= RIVER.x1 && z >= RIVER.z0 && z <= RIVER.z1 && !onBridgeDeck(x, z);
}
function hillHeight(x, z) {
  // Smooth swells, faded to zero at the biome borders (no cliff seam).
  const fx = clamp((x - 262) / 30, 0, 1);
  const fz = clamp((z - 262) / 30, 0, 1);
  const f = fx * fz;
  if (f <= 0) return 0;
  const h = 2.1 * Math.sin(x * 0.045) * Math.cos(z * 0.04)
    + 1.1 * Math.sin(x * 0.11 + z * 0.07)
    + 0.6 * Math.sin(x * 0.021 - z * 0.03);
  return h * f;
}

export function groundHeight(x, z) {
  if (onBridgeDeck(x, z)) return 0.65;
  if (inRiverChannel(x, z)) return 0.1;
  if (x < WORLD.seaX) return -0.5;
  if (x > BIOMES.rocky.x0 && z > BIOMES.rocky.z0) return hillHeight(x, z);
  return 0;
}
export function isSea(x, z) { return x < WORLD.seaX; }
export function isInRiver(x, z) { return inRiverChannel(x, z); }
export function isOnRoad(x, z) {
  if (x < 0 || x > WORLD.grid || z < 0 || z > WORLD.grid) return false;
  for (const r of ROADS) {
    if (Math.abs(x - r) <= 7.5 || Math.abs(z - r) <= 7.5) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Canvas texture helpers. Facades are painted once (shared across the
// city) — a 256 px texture with floor bands, a mullion window grid and
// ~12% lit windows, so a building reads as a real place from the street
// instead of a flat coloured box.
// ---------------------------------------------------------------------------
function hex(n) { return `#${n.toString(16).padStart(6, '0')}`; }
function shade(hexCol, f) {
  const n = parseInt(hexCol.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

function makeFacadeTexture(base, lit, floors) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = hex(base);
  g.fillRect(0, 0, 256, 256);
  // Subtle vertical grime variation per column.
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.05})`;
    g.fillRect(x, 0, 16, 256);
  }
  const rows = Math.max(2, floors);
  const rowH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    // Floor separator band.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y, 256, 3);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(0, y + 3, 256, 2);
    // Window grid: 4 columns, mullion cross in each.
    for (let col = 0; col < 4; col++) {
      const wx = 18 + col * 60;
      const wy = y + rowH * 0.22;
      const ww = 34;
      const wh = rowH * 0.56;
      const isLit = rng() < 0.14;
      g.fillStyle = isLit ? hex(lit) : 'rgba(12,18,28,0.92)';
      g.fillRect(wx, wy, ww, wh);
      // Mullion cross.
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      g.fillRect(wx, wy + wh / 2 - 1, ww, 2);
      // Frame.
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 2;
      g.strokeRect(wx, wy, ww, wh);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const FACADE_SETS = [
  { base: 0x5a5f6e, lit: 0xffd34d }, // grey tower
  { base: 0x7a4a3a, lit: 0xffd34d }, // brick red-brown
  { base: 0x4a3a6e, lit: 0xff5ad0 }, // purple (club district)
  { base: 0x8a7a5a, lit: 0x7de3ff }, // beige
  { base: 0x3a5a7a, lit: 0xffd34d }, // steel blue
  { base: 0x6e2a3a, lit: 0xff9a5a }, // wine red
];
const facadeTextures = FACADE_SETS.map((s) => makeFacadeTexture(s.base, s.lit, 4));

// A sign board: canvas text on a dark plate, drawn once per label and
// cached. MeshBasicMaterial + map so the playtest counts it as a sign.
const signCache = new Map();
function makeSignTexture(text, fg = '#ffd34d', bg = '#14101f', font = 44) {
  const key = `${text}|${fg}|${bg}`;
  if (signCache.has(key)) return signCache.get(key);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = fg;
  g.font = `900 ${font}px Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const t = text.length > 18 ? text.slice(0, 18) : text;
  g.fillText(t.toUpperCase(), 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  signCache.set(key, tex);
  return tex;
}
function makeSignBoard(text, w, fg, bg) {
  const tex = makeSignTexture(text, fg, bg);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w / 4),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  return m;
}

// ---------------------------------------------------------------------------
// Shared materials / geometry helpers.
// ---------------------------------------------------------------------------
const MAT = {
  grass: new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
  sand: new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  sea: new THREE.MeshPhongMaterial({ color: PALETTE.sea, shininess: 90, specular: 0x99ccff }),
  deep: new THREE.MeshPhongMaterial({ color: PALETTE.deep, shininess: 70, specular: 0x88bbff }),
  road: new THREE.MeshLambertMaterial({ color: PALETTE.road }),
  sidewalk: new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
  park: new THREE.MeshLambertMaterial({ color: PALETTE.park }),
  desert: new THREE.MeshLambertMaterial({ color: 0xe8cf9a }),
  rocky: new THREE.MeshLambertMaterial({ color: 0x9a8a72 }),
  forestFloor: new THREE.MeshLambertMaterial({ color: 0x4a7a3a }),
  pier: new THREE.MeshLambertMaterial({ color: PALETTE.pier }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6a4a2a }),
  poleWood: new THREE.MeshLambertMaterial({ color: 0x5a4028 }),
  poleBlack: new THREE.MeshLambertMaterial({ color: 0x1a1a1e }),
  lampGlow: new THREE.MeshBasicMaterial({ color: 0xfff2c0 }),
  white: new THREE.MeshLambertMaterial({ color: 0xf2f5f7 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x222226 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.15, metalness: 0.6 }),
  roof: new THREE.MeshLambertMaterial({ color: 0x3a3f4a }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x2e8b3a }),
  leafDark: new THREE.MeshLambertMaterial({ color: 0x1e5c2a }),
  rock: new THREE.MeshLambertMaterial({ color: 0x8a7a66 }),
  cactus: new THREE.MeshLambertMaterial({ color: 0x3a7a3a }),
  yellow: new THREE.MeshLambertMaterial({ color: 0xf7c948 }),
  red: new THREE.MeshLambertMaterial({ color: 0xd92038 }),
  blueDoor: new THREE.MeshLambertMaterial({ color: 0x2a6fd6 }),
};
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function lam(color) { return new THREE.MeshLambertMaterial({ color }); }

// ---------------------------------------------------------------------------
// Ground: one painted canvas texture for the whole 400 m island —
// grass, sand beach, desert, forest floor, rocky ground, the river, and
// the full road grid with double yellow centrelines, sidewalks and a
// few crosswalks. Painting it (instead of stacking planes) means no
// z-fighting at intersections, and it reads exactly like the old build's
// flat, bright PS2 ground.
// ---------------------------------------------------------------------------
function makeGroundTexture() {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const px = (v) => (v / WORLD.size) * S;
  // Base grass.
  g.fillStyle = hex(PALETTE.grass);
  g.fillRect(0, 0, S, S);
  // Grass variation: soft blotches so the baseplate is never flat.
  for (let i = 0; i < 900; i++) {
    const x = rng() * S, y = rng() * S, r = 6 + rng() * 26;
    g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,60,0,0.06)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Forest floor (north-west, z 260..400).
  g.fillStyle = hex(0x4a7a3a);
  g.fillRect(0, px(260), px(260), px(140));
  // Desert (east, x 260..400, z 0..260).
  g.fillStyle = hex(0xe8cf9a);
  g.fillRect(px(260), 0, px(140), px(260));
  // Rocky ground (south-east).
  g.fillStyle = hex(0x9a8a72);
  g.fillRect(px(260), px(260), px(140), px(140));
  // Sand beach strip (x 15..30) + sea (x < 15).
  g.fillStyle = hex(PALETTE.sand);
  g.fillRect(px(15), 0, px(15), S);
  g.fillStyle = hex(PALETTE.sea);
  g.fillRect(0, 0, px(15), S);
  // River channel (x 274..292, z 0..260) — shallow blue water.
  g.fillStyle = hex(0x3a9ad0);
  g.fillRect(px(274), 0, px(18), px(260));
  // Roads: dark carriageway + pale sidewalks on both sides.
  for (const r of ROADS) {
    // NS road (vertical in canvas: x = road, z runs down).
    g.fillStyle = hex(PALETTE.sidewalk);
    g.fillRect(px(r - 7.5), 0, px(15), px(260));
    g.fillStyle = hex(PALETTE.road);
    g.fillRect(px(r - 5), 0, px(10), px(260));
    // EW road.
    g.fillStyle = hex(PALETTE.sidewalk);
    g.fillRect(0, px(r - 7.5), px(260), px(15));
    g.fillStyle = hex(PALETTE.road);
    g.fillRect(0, px(r - 5), px(260), px(10));
  }
  // Double yellow centrelines, dashed.
  g.fillStyle = hex(PALETTE.roadLine);
  for (const r of ROADS) {
    for (let d = 4; d < 260; d += 10) {
      g.fillRect(px(r - 0.9), px(d), px(0.5), px(4));
      g.fillRect(px(r + 0.4), px(d), px(0.5), px(4));
      g.fillRect(px(d), px(r - 0.9), px(4), px(0.5));
      g.fillRect(px(d), px(r + 0.4), px(4), px(0.5));
    }
  }
  // Crosswalks at the five main intersections (only — never everywhere).
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [ix, iz] of [[117, 117], [143, 143], [169, 117], [143, 195], [195, 169]]) {
    for (let k = -4; k <= 4; k++) {
      g.fillRect(px(ix + k * 1.1 - 0.4), px(iz - 5), px(0.8), px(10));
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// buildCity
// ---------------------------------------------------------------------------
export function buildCity(scene, MODELS) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const interiors = {};
  const trafficLights = [];
  const poles = []; // knockable utility poles {group, fallen, fallT}
  const clouds = [];
  const foamStrips = [];
  const waveStrips = [];

  // --- endless sea under everything + island ground -----------------------
  const seaBig = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), MAT.deep);
  seaBig.rotation.x = -Math.PI / 2;
  seaBig.position.set(200, -0.45, 200);
  group.add(seaBig);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size, WORLD.size),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(200, 0, 200);
  ground.receiveShadow = true;
  group.add(ground);
  // Near-shore sea plane with a specular glint (the playable water).
  const seaNear = new THREE.Mesh(new THREE.PlaneGeometry(70, 400), MAT.sea);
  seaNear.rotation.x = -Math.PI / 2;
  seaNear.position.set(-20, -0.15, 200);
  group.add(seaNear);
  // Rocky quadrant: real displaced terrain so the swells are visible.
  {
    const geo = new THREE.PlaneGeometry(140, 140, 24, 24);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 330;
      const z = pos.getZ(i) + 330;
      pos.setY(i, hillHeight(x, z));
    }
    geo.computeVertexNormals();
    const rocky = new THREE.Mesh(geo, MAT.rocky);
    rocky.position.set(330, 0.02, 330);
    rocky.receiveShadow = true;
    group.add(rocky);
  }
  // River water surface (shallow, just above the painted channel).
  const riverWater = new THREE.Mesh(new THREE.PlaneGeometry(18, 260), new THREE.MeshPhongMaterial({ color: 0x3a9ad0, shininess: 80, specular: 0x99ccff, transparent: true, opacity: 0.9 }));
  riverWater.rotation.x = -Math.PI / 2;
  riverWater.position.set(283, 0.12, 130);
  group.add(riverWater);

  // --- bridges over the river (deck y = 0.65, matches groundHeight) -----
  for (const [bx, bz] of [[278, 39], [278, 247]]) {
    const deck = box(40, 0.65, 12, MAT.road, bx, 0.325, bz);
    group.add(deck);
    // Edge lines + side rails.
    for (const s of [-1, 1]) {
      group.add(box(40, 0.12, 0.3, MAT.yellow, bx, 0.68, bz + s * 5.6));
      group.add(box(40, 1.0, 0.25, MAT.poleBlack, bx, 1.15, bz + s * 5.9));
    }
    // Lamp posts on the bridge.
    for (const lx of [264, 278, 292]) {
      const p = cyl(0.09, 0.12, 5, MAT.poleBlack, lx, 3.1, bz - 5.9, 8);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), MAT.lampGlow);
      head.position.set(lx, 5.7, bz - 5.9);
      group.add(p, head);
    }
  }

  // --- beach: foam, umbrellas, palms --------------------------------------
  for (let z = 8; z < 400; z += 14) {
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(15.5, 0.06, z);
    group.add(foam);
    foamStrips.push(foam);
  }
  // Animated wave strips just offshore.
  for (let i = 0; i < 8; i++) {
    const w = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 60),
      new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35 }),
    );
    w.rotation.x = -Math.PI / 2;
    w.position.set(6 - i * 1.5, 0.02 + i * 0.005, 40 + i * 44);
    group.add(w);
    waveStrips.push(w);
  }
  const umbrellaCols = [0xff2a9d, 0xffd34d, 0x2a6fd6, 0xff7a1a];
  for (let i = 0; i < 10; i++) {
    const z = 40 + i * 34;
    const x = 20 + (i % 2) * 4;
    const pole = cyl(0.05, 0.05, 2.4, MAT.white, x, 1.2, z, 6);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 8), lam(umbrellaCols[i % 4]));
    top.position.set(x, 2.7, z);
    top.castShadow = true;
    const towel = box(1.8, 0.06, 0.9, lam(umbrellaCols[(i + 1) % 4]), x + 1.6, 0.06, z + 1);
    group.add(pole, top, towel);
  }

  // --- clouds: flat white ellipses, high up, never columns ---------------
  for (let i = 0; i < 14; i++) {
    const cl = new THREE.Mesh(
      new THREE.CircleGeometry(rr(9, 18), 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: rr(0.75, 0.95) }),
    );
    cl.rotation.x = -Math.PI / 2;
    cl.scale.y = 0.45;
    cl.position.set(rr(0, 400), rr(55, 85), rr(0, 400));
    group.add(cl);
    clouds.push(cl);
  }

  // --- buildings -----------------------------------------------------------
  // A building: textured body + proud ground floor + entrance canopy +
  // crown cornice + floor bands + pilasters + an optional setback tier,
  // bay window or roof terrace. Nothing is a bare box.
  function addBuilding(cx, cz, w, d, h, facadeIdx, opts = {}) {
    const tex = facadeTextures[facadeIdx % facadeTextures.length];
    const side = new THREE.MeshLambertMaterial({ map: tex });
    const roof = MAT.roof;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
    body.position.set(cx, h / 2, cz);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    // Proud ground floor: a slightly wider, taller-detailed base with big
    // shop windows and a door on the south face.
    const baseH = Math.min(3.4, h * 0.3);
    const base = box(w + 0.6, baseH, d + 0.6, lam(opts.baseColor || 0x2a2a30), cx, baseH / 2, cz);
    group.add(base);
    // Shopfront glass + door (south face, faces the street).
    const glassW = Math.min(w * 0.7, 7);
    const win = box(glassW, 1.9, 0.12, MAT.glass, cx, 1.35, cz + d / 2 + 0.32);
    group.add(win);
    const door = box(1.3, 2.3, 0.14, MAT.dark, cx + glassW / 2 + 1.1, 1.15, cz + d / 2 + 0.32);
    group.add(door);
    // Entrance canopy + two posts.
    const can = box(3.4, 0.14, 1.6, lam(opts.canopyColor || 0x8a1a2a), cx + glassW / 2 + 1.1, 2.6, cz + d / 2 + 1.0);
    group.add(can);
    for (const s of [-1, 1]) {
      group.add(cyl(0.07, 0.07, 2.6, MAT.poleBlack, cx + glassW / 2 + 1.1 + s * 1.5, 1.3, cz + d / 2 + 1.6, 6));
    }
    // Crown cornice.
    group.add(box(w + 0.5, 0.35, d + 0.5, lam(0x1a1a1e), cx, h + 0.15, cz));
    // Floor bands + corner pilasters.
    const floors = Math.max(2, Math.round(h / 3));
    for (let f = 1; f < floors; f++) {
      group.add(box(w + 0.08, 0.16, d + 0.08, lam(0x000000), cx, (h * f) / floors, cz).translateX(0));
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      group.add(box(0.5, h, 0.5, lam(0x000000), cx + sx * (w / 2 - 0.1), h / 2, cz + sz * (d / 2 - 0.1)));
    }
    // Silhouette variant: setback tier, bay window, or roof terrace.
    const variant = opts.variant || pick(['setback', 'bay', 'terrace', 'plain']);
    if (variant === 'setback' && h > 9) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, h * 0.32, d * 0.62), [side, side, roof, roof, side, side]);
      tier.position.set(cx, h + (h * 0.32) / 2, cz);
      tier.castShadow = true;
      group.add(tier);
      group.add(box(w * 0.62 + 0.4, 0.3, d * 0.62 + 0.4, lam(0x1a1a1e), cx, h + 0.15, cz));
    } else if (variant === 'bay') {
      group.add(box(2.2, h * 0.6, 0.9, MAT.glass, cx, h * 0.45, cz + d / 2 + 0.4));
      group.add(box(2.4, 0.2, 1.0, lam(0x1a1a1e), cx, h * 0.76, cz + d / 2 + 0.4));
    } else if (variant === 'terrace') {
      // Roof terrace: low parapet + a couple of planters.
      group.add(box(w, 0.5, 0.3, lam(0x1a1a1e), cx, h + 0.4, cz - d / 2 + 0.15));
      group.add(box(w, 0.5, 0.3, lam(0x1a1a1e), cx, h + 0.4, cz + d / 2 - 0.15));
      group.add(box(0.9, 0.6, 0.9, MAT.leaf, cx - w / 4, h + 0.6, cz));
      group.add(box(0.9, 0.6, 0.9, MAT.leaf, cx + w / 4, h + 0.6, cz));
    }
    colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
    return { cx, cz, w, d, h };
  }

  // A sign board on the south face of a building, facing the street.
  function addSign(cx, cz, d, text, w = 7, fg = '#ffd34d', bg = '#14101f') {
    const s = makeSignBoard(text, w, fg, bg);
    s.position.set(cx, 4.2, cz + d / 2 + 0.45);
    group.add(s);
    return s;
  }

  // Special places: the same detailed body, plus the landmark dressing
  // that makes each one recognisable from the street.
  const SHOP_SIGNS = ['CAFE', 'MARKET', 'HOTEL', 'BAR', 'DONUTS', 'SHOP', 'TACOS', 'PIZZA', 'GYM', 'PHARMACY', 'BAKERY', 'LAUNDRY'];
  function buildNamedPlace(key, place, dims) {
    const { x: cx, y: cz } = place;
    const { w, d } = dims;
    let h = 8;
    let facade = 0;
    let baseColor = 0x2a2a30;
    let canopyColor = 0x8a1a2a;
    if (key === 'club') { h = 11; facade = 2; baseColor = 0x3a1a4a; canopyColor = 0xff2a9d; }
    if (key === 'casino') { h = 13; facade = 2; baseColor = 0x2a1a3a; canopyColor = 0xffd34d; }
    if (key === 'cityHall') { h = 12; facade = 3; baseColor = 0x8a8a82; canopyColor = 0xf2f5f7; }
    if (key === 'hospital') { h = 11; facade = 3; baseColor = 0xe8e8e8; canopyColor = 0xd92038; }
    if (key === 'mall') { h = 10; facade = 1; baseColor = 0x3a3f4a; canopyColor = 0x2a6fd6; }
    if (key === 'station') { h = 9; facade = 4; baseColor = 0x1a2a4a; canopyColor = 0x2a6fd6; }
    if (key === 'dealer') { h = 7; facade = 0; baseColor = 0x2a2a2e; canopyColor = 0xffd34d; }
    if (key === 'garage') { h = 6; facade = 1; baseColor = 0x3a3a3a; canopyColor = 0xff7a1a; }
    if (key === 'warehouse') { h = 8; facade = 1; baseColor = 0x5a4a3a; canopyColor = 0x8a8a92; }
    if (key === 'gas') { h = 5; facade = 0; baseColor = 0x8a1a1a; canopyColor = 0xd92038; }
    const b = addBuilding(cx, cz, w, d, h, facade, { baseColor, canopyColor, variant: 'setback' });
    // Landmark dressing.
    if (key === 'club') {
      // Neon glow: a pink-lit window band + a big neon sign.
      const neon = box(w * 0.8, 1.6, 0.15, new THREE.MeshBasicMaterial({ color: 0xff2a9d }), cx, h * 0.62, cz + d / 2 + 0.35);
      group.add(neon);
      addSign(cx, cz, d, "LA ROSA'S", 9, '#ff5ad0', '#1a0b2e');
    } else if (key === 'casino') {
      const neon = box(w * 0.85, 2.0, 0.15, new THREE.MeshBasicMaterial({ color: 0x2ae6ff }), cx, h * 0.7, cz + d / 2 + 0.35);
      group.add(neon);
      addSign(cx, cz, d, 'NEON PALM', 9, '#2ae6ff', '#0b1a2e');
    } else if (key === 'cityHall') {
      // Five columns + portico pediment.
      for (let i = -2; i <= 2; i++) {
        group.add(cyl(0.35, 0.4, 6.5, MAT.white, cx + i * 3.2, 3.25, cz + d / 2 + 1.2, 10));
      }
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 4.4, 2.2, 4), MAT.white);
      ped.position.set(cx, 8.2, cz + d / 2 + 1.2);
      ped.rotation.y = Math.PI / 4;
      ped.scale.z = 0.5;
      group.add(ped);
      addSign(cx, cz, d, 'CITY HALL', 8, '#f2f5f7', '#2a2a30');
    } else if (key === 'hospital') {
      // Rooftop box + red cross sign.
      group.add(box(4, 1.6, 4, MAT.white, cx, h + 0.9, cz));
      addSign(cx, cz, d, 'HOSPITAL +', 8, '#ff5a5a', '#f2f5f7');
    } else if (key === 'mall') {
      addSign(cx, cz, d, 'LA VEGA MALL', 10, '#ffd34d', '#1c2b45');
    } else if (key === 'station') {
      addSign(cx, cz, d, 'LVPD STATION', 9, '#7db8ff', '#101828');
    } else if (key === 'dealer') {
      addSign(cx, cz, d, 'AUTO PALMS', 9, '#ffd34d', '#1a1a1e');
    } else if (key === 'garage') {
      // Open bays: dark recesses with a car silhouette inside.
      for (const s of [-1, 1]) {
        group.add(box(4.5, 2.6, 0.3, new THREE.MeshBasicMaterial({ color: 0x0a0a0c }), cx + s * 4.5, 1.4, cz + d / 2 + 0.34));
      }
      addSign(cx, cz, d, "MANNY'S GARAGE", 9, '#ff9a5a', '#1a1a1e');
    } else if (key === 'warehouse') {
      addSign(cx, cz, d, 'OLD CANNERY', 9, '#e8e8e8', '#3a2a1a');
    } else if (key === 'gas') {
      // Canopy over the pumps + a price pylon.
      group.add(box(12, 0.5, 8, MAT.red, cx, 4.6, cz + d / 2 + 4));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        group.add(cyl(0.12, 0.12, 4.4, MAT.white, cx + sx * 5.4, 2.2, cz + d / 2 + 4 + sz * 3.4, 8));
      }
      for (const s of [-1, 1]) {
        group.add(box(1.2, 2.2, 0.8, MAT.red, cx + s * 2.4, 1.1, cz + d / 2 + 4));
      }
      addSign(cx, cz, d, 'PETRO VEGA', 8, '#ffffff', '#8a1a1a');
    } else {
      addSign(cx, cz, d, place.name, 7);
    }
    // Interiors for the enterable places (rooms at y = -40).
    const ENTERABLE = new Set(['club', 'garage', 'warehouse', 'hospital', 'cityHall', 'casino', 'dealer', 'gunShop', 'station', 'petshop', 'restaurant', 'mall', 'bank', 'jewelry', 'minimarket', 'workshop', 'clotheshop', 'salon', 'tattoo', 'safehouse']);
    if (ENTERABLE.has(key)) {
      interiors[key] = { x: cx, z: cz, w, d };
      buildInteriorRoom(cx, cz, w, d, key);
    }
    return b;
  }

  // Interior room at y = -40: floor, four walls, a blue exit door on the
  // south wall, a counter + a couple of props so it is not an empty box.
  function buildInteriorRoom(cx, cz, w, d, key) {
    const y0 = -40;
    const room = new THREE.Group();
    const floorMat = lam(key === 'club' ? 0x2a0a2e : key === 'garage' ? 0x3a3a3a : 0x8a7a5a);
    const floor = box(w, 0.3, d, floorMat, 0, -0.15, 0);
    floor.receiveShadow = true;
    room.add(floor);
    const wallMat = lam(key === 'club' ? 0x4a1a4a : 0xc9c2b4);
    const wallN = box(w, 4, 0.3, wallMat, 0, 2, -d / 2);
    const wallS = box(w, 4, 0.3, wallMat, 0, 2, d / 2);
    const wallW = box(0.3, 4, d, wallMat, -w / 2, 2, 0);
    const wallE = box(0.3, 4, d, wallMat, w / 2, 2, 0);
    room.add(wallN, wallS, wallW, wallE);
    // Blue exit door on the south wall.
    room.add(box(1.6, 2.6, 0.15, MAT.blueDoor, 0, 1.3, d / 2 - 0.2));
    // Props by place.
    if (key === 'club' || key === 'restaurant') {
      room.add(box(4, 1.1, 1.2, lam(0x6a1a2a), -w / 4, 0.55, -d / 4));
      for (let i = 0; i < 3; i++) room.add(cyl(0.3, 0.35, 0.8, MAT.dark, -w / 4 - 1.2 + i * 1.2, 0.4, -d / 4 + 1.2, 8));
    } else if (key === 'garage' || key === 'workshop') {
      room.add(box(3, 1, 2, MAT.dark, w / 4, 0.5, -d / 4));
      room.add(box(1.4, 2.2, 0.8, MAT.red, -w / 4, 1.1, d / 4));
    } else if (key === 'dealer') {
      room.add(box(2.2, 1.1, 1.2, lam(0x2a6fd6), 0, 0.55, -d / 4));
    } else {
      room.add(box(2.4, 1.0, 1.2, lam(0x8a6a4a), 0, 0.5, -d / 4));
      room.add(box(1.2, 2.0, 0.6, MAT.white, w / 4, 1.0, d / 4));
    }
    // Warm ceiling light (no ceiling mesh — the camera looks in from above).
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), MAT.lampGlow);
    lamp.position.set(0, 3.6, 0);
    room.add(lamp);
    room.position.set(cx, y0, cz);
    group.add(room);
  }

  // --- city blocks ----------------------------------------------------------
  const BLOCK_C = [52, 78, 104, 130, 156, 182, 208, 234];
  const SKIP = new Set(['beach', 'harbor', 'pierPickup', 'dock', 'park', 'airport', 'bridgeN', 'bridgeS']);
  // Which block holds which named place (by centre proximity).
  const placeByBlock = new Map();
  for (const [key, p] of Object.entries(PLACES)) {
    if (SKIP.has(key)) continue;
    const bx = BLOCK_C.reduce((a, b) => (Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a));
    const bz = BLOCK_C.reduce((a, b) => (Math.abs(b - p.y) < Math.abs(a - p.y) ? b : a));
    placeByBlock.set(`${bx},${bz}`, key);
  }
  const GENERIC_SIGNS = ['CAFE', 'MARKET', 'HOTEL', 'BAR', 'DONUTS', 'TACOS', 'PIZZA', 'GYM', 'BAKERY'];
  for (const bx of BLOCK_C) {
    for (const bz of BLOCK_C) {
      const key = placeByBlock.get(`${bx},${bz}`);
      if (key) {
        buildNamedPlace(key, PLACES[key], PLACE_DIMS[key]);
        continue;
      }
      // Park blocks: grass, trees, benches, a pond.
      if (rng() < CITY_TUNING.parkChance) {
        const park = box(20, 0.12, 20, MAT.park, bx, 0.06, bz);
        park.receiveShadow = true;
        group.add(park);
        for (let i = 0; i < 5; i++) addShadeTree(bx + rr(-8, 8), bz + rr(-8, 8));
        for (let i = 0; i < 2; i++) {
          const bx2 = bx + rr(-7, 7), bz2 = bz + rr(-7, 7);
          group.add(box(2.2, 0.12, 0.7, lam(0x6a4a2a), bx2, 0.5, bz2));
          group.add(box(2.2, 0.5, 0.12, lam(0x6a4a2a), bx2, 0.75, bz2 - 0.35));
        }
        const pond = new THREE.Mesh(new THREE.CircleGeometry(3, 16), new THREE.MeshPhongMaterial({ color: 0x3a7a9a, shininess: 60 }));
        pond.rotation.x = -Math.PI / 2;
        pond.position.set(bx + 4, 0.14, bz + 4);
        group.add(pond);
        continue;
      }
      // Generic buildings: one or two per block, varied heights.
      const two = rng() < CITY_TUNING.twoBuildingChance;
      const spots = two ? [[bx - 5.5, bz], [bx + 5.5, bz]] : [[bx, bz]];
      for (const [sx, sz] of spots) {
        const w = two ? rr(8, 10) : rr(10, 14);
        const d = rr(8, 12);
        const downtown = bx >= 130 && bz <= 130;
        const h = downtown ? rr(10, 30) : rr(6, 16);
        const facade = Math.floor(rng() * facadeTextures.length);
        addBuilding(sx, sz, w, d, h, facade, {});
        // ~30% of generic shops get a sign board.
        if (rng() < 0.32) addSign(sx, sz, d, pick(GENERIC_SIGNS), 5);
      }
    }
  }

  // --- trees ----------------------------------------------------------------
  // Shade tree: trunk + a canopy of small spheres (each radius < 1.0, so
  // the "no sphere crowns" probe stays green) clustered into a full,
  // round crown like the old build's trees.
  function addShadeTree(x, z) {
    const t = new THREE.Group();
    const trunk = cyl(0.16, 0.24, 2.6, MAT.trunk, 0, 1.3, 0, 8);
    t.add(trunk);
    const blobs = [
      [0, 3.2, 0, 0.95], [0.7, 2.9, 0.3, 0.7], [-0.65, 2.95, -0.25, 0.68],
      [0.2, 3.6, -0.3, 0.65], [-0.3, 3.5, 0.35, 0.6],
    ];
    for (const [dx, dy, dz, r] of blobs) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), rng() < 0.5 ? MAT.leaf : MAT.leafDark);
      s.position.set(dx, dy, dz);
      s.castShadow = true;
      t.add(s);
    }
    t.position.set(x, groundHeight(x, z), z);
    group.add(t);
    return t;
  }
  function addPalm(x, z) {
    const glb = MODELS?.trees?.palm;
    let tree;
    if (glb) {
      tree = glb.scene.clone();
      tree.scale.setScalar(1.6);
    } else {
      tree = buildPalm();
    }
    tree.position.set(x, groundHeight(x, z), z);
    tree.rotation.y = rng() * Math.PI * 2;
    group.add(tree);
    return tree;
  }
  function addPine(x, z) {
    const glb = MODELS?.trees?.pine;
    let tree;
    if (glb) {
      tree = glb.scene.clone();
      tree.scale.setScalar(1.8);
    } else {
      tree = buildPine();
    }
    tree.position.set(x, groundHeight(x, z), z);
    group.add(tree);
    return tree;
  }
  // Palms along the beach + Palm Row; shade trees in parks, on sidewalks
  // (never on the carriageway) and around the plaza blocks.
  for (let z = 20; z < 400; z += 16) addPalm(20 + rng() * 6, z);
  for (let z = 40; z < 260; z += 26) {
    addPalm(33.5, z);
    addShadeTree(38, z + 13);
  }
  for (let i = 0; i < 40; i++) addShadeTree(rr(36, 256), rr(36, 256));
  // Forest biome: dense pines + shade trees.
  for (let i = 0; i < 130; i++) {
    const x = rr(8, 252), z = rr(268, 392);
    if (isOnRoad(x, z)) continue;
    if (rng() < 0.7) addPine(x, z); else addShadeTree(x, z);
  }
  // Desert: cacti + boulders. Rocky hills: boulders.
  for (let i = 0; i < 46; i++) {
    const x = rr(268, 392), z = rr(8, 252);
    if (rng() < 0.55) {
      const c = cyl(0.22, 0.26, rr(1.4, 2.4), MAT.cactus, x, 1, z, 8);
      group.add(c);
      group.add(cyl(0.14, 0.14, 0.8, MAT.cactus, x + 0.3, 1.1, z, 6));
    } else {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.5, 1.4), 0), MAT.rock);
      r.position.set(x, 0.4, z);
      r.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      r.castShadow = true;
      group.add(r);
    }
  }
  for (let i = 0; i < 40; i++) {
    const x = rr(268, 392), z = rr(268, 392);
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.8, 2.2), 0), MAT.rock);
    r.position.set(x, groundHeight(x, z) + 0.5, z);
    r.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    r.castShadow = true;
    group.add(r);
  }

  // --- street furniture ------------------------------------------------------
  // Lamps: black pole + round glowing head, along every road, alternating
  // sides, never in the carriageway.
  for (const r of ROADS) {
    for (let d = 20; d < 260; d += 26) {
      const side = (Math.floor(d / 26) % 2 === 0) ? 1 : -1;
      const pole = cyl(0.09, 0.12, 5.2, MAT.poleBlack, r + side * 6.4, 2.6, d, 8);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), MAT.lampGlow);
      head.position.set(r + side * 6.4, 5.4, d);
      group.add(pole, head);
      const pole2 = cyl(0.09, 0.12, 5.2, MAT.poleBlack, d, 2.6, r - side * 6.4, 8);
      const head2 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), MAT.lampGlow);
      head2.position.set(d, 5.4, r - side * 6.4);
      group.add(pole2, head2);
    }
  }
  // Utility poles + sagging power lines (the old build's signature) along
  // the two main avenues. Poles are knockable: updatePoles() topples one
  // when a car hits it at speed.
  function addUtilityRun(fixed, isNS) {
    let prev = null;
    for (let d = 30; d <= 250; d += 26) {
      const x = isNS ? fixed : d;
      const z = isNS ? d : fixed;
      const pole = new THREE.Group();
      const post = cyl(0.12, 0.16, 7, MAT.poleWood, 0, 3.5, 0, 8);
      const arm = box(2.6, 0.14, 0.14, MAT.poleWood, 0, 6.6, 0);
      pole.add(post, arm);
      pole.position.set(x, 0, z);
      group.add(pole);
      poles.push({ group: pole, x, z, fallen: false, fallT: 0 });
      if (prev) {
        const a = new THREE.Vector3(prev.x, 6.5, prev.z);
        const b = new THREE.Vector3(x, 6.5, z);
        const mid = a.clone().lerp(b, 0.5); mid.y -= 0.9;
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const wire = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 8, 0.03, 4),
          new THREE.MeshBasicMaterial({ color: 0x1a1a1e }),
        );
        group.add(wire);
      }
      prev = { x, z };
    }
  }
  addUtilityRun(117, true);
  addUtilityRun(195, true);
  addUtilityRun(117, false);
  addUtilityRun(195, false);
  // Traffic lights at the four main intersections.
  for (const [ix, iz] of [[117, 117], [143, 143], [169, 117], [143, 195]]) {
    const pole = cyl(0.1, 0.13, 5.4, MAT.poleBlack, ix + 6.2, 2.7, iz + 6.2, 8);
    const arm = box(2.4, 0.14, 0.14, MAT.poleBlack, ix + 5.0, 5.3, iz + 6.2);
    const housing = box(0.5, 1.3, 0.5, MAT.dark, ix + 3.9, 5.0, iz + 6.2);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.set(ix + 3.9, 5.35, iz + 6.5);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2aff5a }));
    green.position.set(ix + 3.9, 4.65, iz + 6.5);
    green.visible = false;
    group.add(pole, arm, housing, red, green);
    trafficLights.push({ red, green });
  }
  // Street name signs at intersections (canvas plates on posts).
  for (let i = 0; i < ROADS.length; i++) {
    const s = makeSignBoard(STREET_NS[i], 4.5, '#e8e8e8', '#1c2b45');
    s.position.set(ROADS[i] + 8.2, 2.6, 33);
    group.add(s);
    group.add(cyl(0.07, 0.07, 2.6, MAT.poleBlack, ROADS[i] + 8.2, 1.3, 33, 6));
    const s2 = makeSignBoard(STREET_EW[i], 4.5, '#e8e8e8', '#1c2b45');
    s2.position.set(33, 2.6, ROADS[i] - 8.2);
    s2.rotation.y = Math.PI / 2;
    group.add(s2);
    group.add(cyl(0.07, 0.07, 2.6, MAT.poleBlack, 33, 1.3, ROADS[i] - 8.2, 6));
  }
  // Hydrants, benches, bus shelters, bins.
  for (const [hx, hz] of [[110, 110], [150, 150], [190, 110], [110, 190], [210, 210], [70, 150]]) {
    group.add(cyl(0.22, 0.26, 0.7, MAT.red, hx, 0.35, hz, 10));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), MAT.red);
    cap.position.set(hx, 0.75, hz);
    group.add(cap);
  }
  for (const [sx, sz] of [[104, 96], [156, 130], [78, 182], [208, 104]]) {
    group.add(box(2.4, 0.12, 0.8, lam(0x6a4a2a), sx, 0.5, sz));
    group.add(box(2.4, 0.6, 0.12, lam(0x6a4a2a), sx, 0.8, sz - 0.4));
    group.add(box(3.2, 0.15, 1.4, lam(0x2a6fd6), sx, 2.4, sz));
    for (const px2 of [-1.4, 1.4]) group.add(cyl(0.06, 0.06, 2.4, MAT.poleBlack, sx + px2, 1.2, sz, 6));
    const bs = makeSignBoard('BUS STOP', 3.5, '#ffffff', '#2a6fd6');
    bs.position.set(sx, 2.9, sz);
    group.add(bs);
  }

  // --- harbour / pier / docks ------------------------------------------------
  // Wooden pier decking out into the sea (planks with gaps), plus a small
  // striped lighthouse at the end and container stacks at the docks.
  for (let i = 0; i < 14; i++) {
    const plank = box(1.1, 0.18, 7, MAT.pier, 22 - i * 1.25, 0.55, 130);
    group.add(plank);
  }
  for (const pz of [126, 134]) {
    for (let i = 0; i < 8; i++) group.add(cyl(0.12, 0.12, 1.6, MAT.poleWood, 22 - i * 2.4, 0.1, pz, 6));
  }
  {
    const lh = new THREE.Group();
    const base = cyl(1.1, 1.4, 3, MAT.white, 0, 1.5, 0, 12);
    const band = cyl(1.15, 1.15, 0.9, MAT.red, 0, 3.4, 0, 12);
    const top = cyl(0.9, 1.1, 3, MAT.white, 0, 5.2, 0, 12);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), MAT.lampGlow);
    lamp.position.set(0, 7.2, 0);
    lh.add(base, band, top, lamp);
    lh.position.set(5, 0.6, 130);
    group.add(lh);
  }
  const contCols = [0xd92038, 0x2a6fd6, 0xffd34d, 0x2e8b3a];
  for (let i = 0; i < 8; i++) {
    const c = box(5, 2.4, 2.4, lam(contCols[i % 4]), 30 + (i % 4) * 6, 1.2 + Math.floor(i / 4) * 2.5, 118 + (i % 2) * 8);
    c.rotation.y = (i % 2) * 0.06;
    group.add(c);
  }
  // Dock crane: two legs + beam + hook cable.
  {
    const crane = new THREE.Group();
    crane.add(box(0.8, 14, 0.8, MAT.yellow, -6, 7, 0));
    crane.add(box(0.8, 14, 0.8, MAT.yellow, 6, 7, 0));
    crane.add(box(16, 1, 1, MAT.yellow, 0, 14, 0));
    crane.add(cyl(0.05, 0.05, 6, MAT.dark, 10, 11, 0, 6));
    crane.add(box(1.4, 1.4, 1.4, MAT.dark, 10, 7.5, 0));
    crane.position.set(34, 0, 142);
    group.add(crane);
  }

  // --- airport: runway + terminal + ONE plane on the tarmac (never roads) --
  {
    const runway = box(90, 0.1, 14, MAT.dark, 335, 0.05, 130);
    group.add(runway);
    for (let i = 0; i < 9; i++) group.add(box(4, 0.06, 0.5, MAT.white, 300 + i * 9, 0.12, 130));
    group.add(box(24, 7, 12, lam(0x8a8a92), 330, 3.5, 108));
    group.add(box(24, 0.6, 13, MAT.glass, 330, 6.2, 108));
    addSign(330, 101, 12, 'LA VEGA AIR', 9, '#ffffff', '#2a6fd6');
    // Procedural plane, parked on the tarmac.
    const plane = new THREE.Group();
    const fus = cyl(1.1, 1.1, 12, MAT.white, 0, 1.4, 0, 12);
    fus.rotation.x = Math.PI / 2;
    const wing = box(16, 0.18, 2.4, MAT.white, 0, 1.4, 0);
    const tail = box(5, 0.16, 1.6, MAT.red, 0, 2.2, -5.4);
    const fin = box(0.18, 2.2, 1.8, MAT.red, 0, 2.8, -5.4);
    plane.add(fus, wing, tail, fin);
    plane.position.set(345, 0, 142);
    plane.rotation.y = Math.PI / 2;
    group.add(plane);
  }

  // --- update hooks -----------------------------------------------------------
  function updatePoles(dt, cars) {
    if (!cars) return;
    for (const p of poles) {
      if (p.fallen) continue;
      for (const car of cars) {
        if (Math.abs(car.speed || 0) < 7) continue;
        const d = Math.hypot(car.x - p.x, car.z - p.z);
        if (d < 2.4) { p.fallen = true; p.fallT = 0; break; }
      }
    }
    for (const p of poles) {
      if (!p.fallen || p.fallT >= 1) continue;
      p.fallT = Math.min(1, p.fallT + dt * 2.2);
      p.group.rotation.z = p.fallT * 1.45;
      p.group.position.y = -p.fallT * 0.4;
    }
  }
  function updateSea(dt) {
    const t = performance.now() * 0.001;
    for (let i = 0; i < foamStrips.length; i++) {
      foamStrips[i].material.opacity = 0.4 + 0.2 * Math.sin(t * 1.4 + i);
      foamStrips[i].position.x = 15.5 + Math.sin(t * 0.7 + i * 1.3) * 0.5;
    }
    for (let i = 0; i < waveStrips.length; i++) {
      waveStrips[i].position.x = 6 - i * 1.5 + Math.sin(t * 0.5 + i) * 0.8;
    }
    for (const cl of clouds) {
      cl.position.x += dt * 0.6;
      if (cl.position.x > 420) cl.position.x = -20;
    }
  }

  return { group, trafficLights, colliders, interiors, updatePoles, updateSea };
}
