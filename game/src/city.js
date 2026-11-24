// La Vega 3D — city builder (round 9 re-author).
//
// Builds the whole island from the design document: a 400 m island with a
// 260 m street grid, four districts, three outer biomes, a river crossed
// by two bridges, a beach and open sea to the west, and an airport in the
// desert. Everything is procedural from the numbers in config.js — the
// ground is a displaced plane painted by one 2048 px canvas, buildings
// wear a shared canvas facade texture, and the special places get bespoke
// builders. No code is copied from any earlier build; this file is written
// from the design spec alone.
import * as THREE from 'three';
import {
  WORLD, ROADS, STREET_NS, STREET_EW, DISTRICTS, PLACES, PLACE_DIMS,
  PALETTE, CITY_TUNING, BIOMES,
} from './config.js';
import { mulberry32, hash2, smoothNoise, rand, pick, clamp } from './rng.js';
import { buildPalm, buildPine } from './loader.js';

// ---------------------------------------------------------------------------
// Terrain queries — pure deterministic functions of (x, z). Every other
// module (characters, vehicles, missions, police) stands on these.
// ---------------------------------------------------------------------------

// The river runs north-south through the east of the island, crossed by
// the North Bridge (z = 39) and the South Bridge (z = 247). It meanders a
// few metres either side of x = 278.
export function riverCenter(z) {
  return 281 + 2 * Math.sin(z * 0.02);
}

export function isInRiver(x, z) {
  // The bridge decks are dry: walking the bridge is not swimming.
  if (x > 262 && x < 294 && (Math.abs(z - 39) < 6 || Math.abs(z - 247) < 6)) return false;
  return Math.abs(x - riverCenter(z)) < 9 && z >= 0 && z <= 400;
}

export function isSea(x, z) {
  return x < WORLD.seaX;
}

export function isOnRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) < 5 && z >= 0 && z <= 260) return true;
    if (Math.abs(z - r) < 5 && x >= 0 && x <= 260) return true;
  }
  // Desert highways east (the two bridge roads continue to the airport).
  if ((Math.abs(z - 39) < 5 || Math.abs(z - 247) < 5) && x >= 260 && x <= 400) return true;
  // Bridge decks.
  if (x >= 258 && x <= 298 && (Math.abs(z - 39) < 6 || Math.abs(z - 247) < 6)) return true;
  // Airport runway tarmac.
  if (x >= 300 && x <= 360 && z >= 122 && z <= 138) return true;
  return false;
}

function onBridgeDeck(x, z) {
  return x >= 262 && x <= 294 && (Math.abs(z - 39) < 6 || Math.abs(z - 247) < 6);
}

// Ground height. Gentle rolling terrain (|y| < ~3.4), flat road corridors
// so cars drive level, a low riverbed, and the sea floor sloping down
// west of the beach. Bridge decks sit at 0.65 with short approach ramps.
export function groundHeight(x, z) {
  if (onBridgeDeck(x, z)) return 0.65;
  // Bridge approaches blend 0 -> 0.65 over 4 m either side of the deck.
  if ((Math.abs(z - 39) < 6 || Math.abs(z - 247) < 6) && x >= 258 && x <= 298) {
    const t = x < 262 ? (x - 258) / 4 : (298 - x) / 4;
    return 0.65 * clamp(t, 0, 1);
  }
  // Shallow wading channel: the player wades at y = 0.1 (the "swim" level
  // the playtest probes), the water ribbon sits just above the bed.
  if (isInRiver(x, z)) return 0.1;
  if (x < WORLD.seaX) return Math.max(-3.4, -2.2 + (x - WORLD.seaX) * 0.06);
  if (x < WORLD.sandMax) return 0.25;
  if (isOnRoad(x, z)) return 0;
  // Rolling base terrain.
  let h = 0.6
    + (smoothNoise(x * 0.03, z * 0.03) - 0.5) * 1.6
    + (smoothNoise(x * 0.11 + 7, z * 0.11 + 3) - 0.5) * 0.5;
  // Rocky hills in the south-east rise higher; desert dunes roll gently;
  // the forest floor undulates a little.
  if (x > BIOMES.rocky.x0 && z > BIOMES.rocky.z0) {
    h += 1.2 + (smoothNoise(x * 0.05 + 13, z * 0.05 + 29) - 0.5) * 3.0;
  } else if (x > BIOMES.desert.x0 && z < BIOMES.desert.z1) {
    h += (smoothNoise(x * 0.06 + 5, z * 0.06 + 11) - 0.5) * 0.8;
  } else if (z > BIOMES.forest.z0 && x < BIOMES.forest.x1) {
    h += (smoothNoise(x * 0.08 + 3, z * 0.08 + 17) - 0.5) * 0.7;
  }
  return clamp(h, -0.5, 3.4);
}

// ---------------------------------------------------------------------------
// Canvas texture helpers.
// ---------------------------------------------------------------------------

function hexCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// The whole 400 x 400 m island painted onto one 2048 px canvas:
// 5.12 px per metre, canvas px = worldX * 5.12, canvas py = worldZ * 5.12.
function paintGroundTexture(rng) {
  const S = 2048;
  const PX = S / 400;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const X = (x) => x * PX;
  const Z = (z) => z * PX;

  // Base grass.
  g.fillStyle = hexCss(PALETTE.grass);
  g.fillRect(0, 0, S, S);

  // Grass speckle for a lived-in lawn (never a flat baseplate).
  for (let i = 0; i < 9000; i++) {
    const x = rng() * S, z = rng() * S;
    g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    g.fillRect(x, z, 3, 3);
  }

  // Forest biome: darker green + dense speckle.
  g.fillStyle = '#5d9c48';
  g.fillRect(X(BIOMES.forest.x0), Z(BIOMES.forest.z0), X(BIOMES.forest.x1 - BIOMES.forest.x0), Z(BIOMES.forest.z1 - BIOMES.forest.z0));
  for (let i = 0; i < 2500; i++) {
    const x = BIOMES.forest.x0 + rng() * (BIOMES.forest.x1 - BIOMES.forest.x0);
    const z = BIOMES.forest.z0 + rng() * (BIOMES.forest.z1 - BIOMES.forest.z0);
    g.fillStyle = rng() < 0.5 ? 'rgba(20,60,20,0.25)' : 'rgba(120,180,90,0.25)';
    g.fillRect(X(x), Z(z), 4, 4);
  }

  // Desert biome: sand + dune speckle.
  g.fillStyle = '#e8cf96';
  g.fillRect(X(BIOMES.desert.x0), Z(BIOMES.desert.z0), X(BIOMES.desert.x1 - BIOMES.desert.x0), Z(BIOMES.desert.z1 - BIOMES.desert.z0));
  for (let i = 0; i < 1800; i++) {
    const x = BIOMES.desert.x0 + rng() * (BIOMES.desert.x1 - BIOMES.desert.x0);
    const z = BIOMES.desert.z0 + rng() * (BIOMES.desert.z1 - BIOMES.desert.z0);
    g.fillStyle = rng() < 0.5 ? 'rgba(160,120,60,0.18)' : 'rgba(255,240,200,0.18)';
    g.fillRect(X(x), Z(z), 5, 3);
  }

  // Rocky biome: grey-brown + rock speckle.
  g.fillStyle = '#8a7a62';
  g.fillRect(X(BIOMES.rocky.x0), Z(BIOMES.rocky.z0), X(BIOMES.rocky.x1 - BIOMES.rocky.x0), Z(BIOMES.rocky.z1 - BIOMES.rocky.z0));
  for (let i = 0; i < 1500; i++) {
    const x = BIOMES.rocky.x0 + rng() * (BIOMES.rocky.x1 - BIOMES.rocky.x0);
    const z = BIOMES.rocky.z0 + rng() * (BIOMES.rocky.z1 - BIOMES.rocky.z0);
    g.fillStyle = rng() < 0.5 ? 'rgba(60,50,40,0.3)' : 'rgba(180,170,150,0.3)';
    const s = 2 + rng() * 5;
    g.fillRect(X(x), Z(z), s, s);
  }

  // Beach sand strip (x 15..30).
  g.fillStyle = hexCss(PALETTE.sand);
  g.fillRect(X(15), 0, X(15), S);
  for (let i = 0; i < 800; i++) {
    const x = 15 + rng() * 15;
    const z = rng() * 400;
    g.fillStyle = 'rgba(180,140,80,0.2)';
    g.fillRect(X(x), Z(z), 3, 3);
  }

  // Sea (x < 15): shallow turquoise at the shore deepening westward.
  const seaGrad = g.createLinearGradient(0, 0, X(15), 0);
  seaGrad.addColorStop(0, hexCss(PALETTE.deep));
  seaGrad.addColorStop(0.7, '#2a8fc8');
  seaGrad.addColorStop(1, '#7fd4e8');
  g.fillStyle = seaGrad;
  g.fillRect(0, 0, X(15), S);
  // Foam edge at the waterline.
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(X(13.5), 0, X(1.5), S);

  // River band (meanders with riverCenter).
  g.fillStyle = '#3a8fc0';
  g.beginPath();
  for (let z = 0; z <= 400; z += 4) g.lineTo(X(riverCenter(z) + 9), Z(z));
  for (let z = 400; z >= 0; z -= 4) g.lineTo(X(riverCenter(z) - 9), Z(z));
  g.closePath();
  g.fill();

  // Parks: a deeper green on park blocks.
  g.fillStyle = hexCss(PALETTE.park);

  // Sidewalks first (15 m corridor: 10 m road + 2.5 m each side), then
  // asphalt (10 m), so every road reads as dark asphalt edged in beige.
  for (const r of ROADS) {
    // North-south road.
    g.fillStyle = hexCss(PALETTE.sidewalk);
    g.fillRect(X(r - 7.5), 0, X(15), Z(260));
    g.fillStyle = hexCss(PALETTE.road);
    g.fillRect(X(r - 5), 0, X(10), Z(260));
    // East-west road.
    g.fillStyle = hexCss(PALETTE.sidewalk);
    g.fillRect(0, Z(r - 7.5), X(260), Z(15));
    g.fillStyle = hexCss(PALETTE.road);
    g.fillRect(0, Z(r - 5), X(260), Z(10));
  }

  // Desert highways (the two bridge roads continue east to the airport).
  for (const r of [39, 247]) {
    g.fillStyle = hexCss(PALETTE.road);
    g.fillRect(X(260), Z(r - 5), X(140), Z(10));
  }

  // Double yellow centre lines on every road.
  g.fillStyle = hexCss(PALETTE.roadLine);
  for (const r of ROADS) {
    g.fillRect(X(r - 0.9), 0, X(0.35), Z(260));
    g.fillRect(X(r + 0.55), 0, X(0.35), Z(260));
    g.fillRect(0, Z(r - 0.9), X(260), Z(0.35));
    g.fillRect(0, Z(r + 0.55), X(260), Z(0.35));
  }
  for (const r of [39, 247]) {
    g.fillRect(X(260), Z(r - 0.9), X(140), Z(0.35));
    g.fillRect(X(260), Z(r + 0.55), X(140), Z(0.35));
  }

  // Zebra crossings at the five signalled intersections.
  const zebras = [[65, 65], [117, 117], [169, 169], [91, 195], [195, 91]];
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [zx, zz] of zebras) {
    for (let i = -4; i <= 4; i++) {
      g.fillRect(X(zx + i * 1.1 - 0.4), Z(zz - 5), X(0.8), Z(10));
      g.fillRect(X(zx - 5), Z(zz + i * 1.1 - 0.4), X(10), Z(0.8));
    }
  }

  // Airport runway + tarmac (desert, x 300..360, z 122..138).
  g.fillStyle = '#3c4148';
  g.fillRect(X(300), Z(122), X(60), Z(16));
  g.fillStyle = '#e8e8e8';
  g.fillRect(X(300), Z(129.7), X(60), Z(0.6));
  for (let x = 304; x < 358; x += 8) g.fillRect(X(x), Z(129.7), X(4), Z(0.6));

  // Harbor pier deck (wood) + dock apron.
  g.fillStyle = hexCss(PALETTE.pier);
  g.fillRect(X(-10), Z(126), X(34), Z(8));
  g.fillRect(X(16), Z(118), X(14), Z(24));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// One shared facade texture per colour variant: six floors of framed
// windows (about 12% lit warm), a proud glass storefront on the ground
// floor, floor separator bands and a cornice line at the top. Buildings
// clone this texture and set repeat.y to fit their height.
function paintFacadeTexture(baseColor, litRatio = 0.12) {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 256, 256);
  // Subtle vertical grime variation per bay.
  for (let bx = 0; bx < 8; bx++) {
    g.fillStyle = `rgba(0,0,0,${0.03 + (bx % 3) * 0.02})`;
    g.fillRect(bx * 32, 0, 32, 256);
  }
  // Six floors of windows.
  const floors = 6;
  const fh = 256 / floors;
  for (let f = 0; f < floors; f++) {
    const y0 = f * fh;
    // Floor separator band.
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, y0 + fh - 3, 256, 3);
    for (let col = 0; col < 4; col++) {
      const x0 = 12 + col * 60;
      const y = y0 + 8;
      const w = 38, h = fh - 16;
      // Frame.
      g.fillStyle = '#e8e2d4';
      g.fillRect(x0 - 2, y - 2, w + 4, h + 4);
      // Glass: lit warm ~12%, otherwise dark blue-grey.
      const lit = hash2(col * 7 + f * 13, f * 3 + col) < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#22384a';
      g.fillRect(x0, y, w, h);
      // Mullion cross.
      g.fillStyle = 'rgba(232,226,212,0.9)';
      g.fillRect(x0 + w / 2 - 1, y, 2, h);
      g.fillRect(x0, y + h / 2 - 1, w, 2);
    }
  }
  // Ground floor: glass storefront + door + sign band.
  g.fillStyle = '#1c2a38';
  g.fillRect(8, 256 - 44, 150, 36);
  g.fillStyle = '#9fc4d8';
  g.fillRect(12, 256 - 40, 142, 28);
  g.fillStyle = '#3a2a1a';
  g.fillRect(170, 256 - 44, 44, 44); // door
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(170, 256 - 44, 44, 6);
  // Cornice at the top.
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 0, 256, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Small canvas sign: dark board, bold text, thin border. Readable from
// the street because it uses MeshBasicMaterial (unlit).
function makeSignTexture(text, bg = '#1a1a22', fg = '#ffd34d') {
  const c = makeCanvas(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = fg;
  g.lineWidth = 4;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = fg;
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.slice(0, 18), 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Small mesh helpers.
// ---------------------------------------------------------------------------

function lam(color) {
  return new THREE.MeshLambertMaterial({ color });
}
function std(color, rough = 0.6, metal = 0.25) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// A shop sign board: a board mesh with a canvas-texture face, mounted on
// a building wall, turned to face the nearest street.
function makeSignBoard(text, w = 4.5, bg = '#1a1a22', fg = '#ffd34d') {
  const group = new THREE.Group();
  const tex = makeSignTexture(text, bg, fg);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(w, w * 0.25, 0.18),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  group.add(board);
  const back = box(w, w * 0.25, 0.06, lam(0x222222), 0, 0, -0.1);
  group.add(back);
  return group;
}

const GENERIC_SHOPS = [
  'DONUTS', 'TACOS', 'SURF SHOP', 'LAUNDRY', 'NEON BAR', 'CAFE', 'GYM',
  'PHARMACY', 'BAKERY', 'BOOKS', 'FLOWERS', 'PIZZA', 'RAMEN', 'TATTOO',
  'BARBER', 'LIQUOR', 'JEWELRY', 'HOTEL', 'MOTEL', 'ARCADE', 'BURGERS',
  'SUSHI', 'PAWN SHOP', 'GROCERY', 'FISH & CHIPS', 'CLUB 77', 'TIKI BAR',
];

// ---------------------------------------------------------------------------
// Buildings.
// ---------------------------------------------------------------------------

// Facade colour variants — strong colours like the old build's skyline.
const FACADE_COLORS = ['#c96a3a', '#7a5a9a', '#4a7a9a', '#9a4a5a', '#b8903a', '#5a8a5a', '#8a6a4a', '#6a6a7a'];

export function buildCity(scene, MODELS) {
  const rng = mulberry32(1337);
  const group = new THREE.Group();
  const colliders = [];
  const trafficLights = [];
  const interiors = {};
  const poles = []; // knockable power poles: {group, x, z, fallen, fallT, axis}
  const waveStrips = [];
  let seaPlane = null;
  let signCount = 0;

  const facadeTexes = FACADE_COLORS.map((col) => paintFacadeTexture(col));
  const roofMat = lam(0x3a3a42);
  const slabMat = lam(0x9a938a);

  function facadeMaterial(variant, height) {
    const tex = facadeTexes[variant % facadeTexes.length].clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, Math.max(1, Math.round(height / 18)));
    return new THREE.MeshLambertMaterial({ map: tex });
  }

  function addCollider(x0, x1, z0, z1) {
    colliders.push({ x0, x1, z0, z1 });
  }

  // A flat paved slab under a building plot hides any terrain gap under
  // the walls and gives the plot a finished edge.
  function addSlab(cx, cz, w, d, baseY) {
    const slab = box(w + 1.2, 0.18, d + 1.2, slabMat, cx, baseY + 0.09, cz);
    slab.castShadow = false;
    group.add(slab);
  }

  // One generic building: textured box, proud ground floor, cornice,
  // pilasters, a silhouette variant (setback / bay / terrace), and a
  // shop sign on ~30% of them. Returns the footprint for the collider.
  function addBuilding(cx, cz, w, d, h, variant, signText) {
    const baseY = groundHeight(cx, cz);
    addSlab(cx, cz, w, d, baseY);
    const mat = facadeMaterial(variant, h);
    const body = box(w, h, d, mat, cx, baseY + h / 2, cz);
    group.add(body);
    // Proud ground floor: a slightly wider base band with the storefront.
    const base = box(w + 0.5, 1.6, d + 0.5, lam(0x8a7a6a), cx, baseY + 0.8, cz);
    group.add(base);
    const glass = box(w * 0.7, 1.2, 0.15, std(0x1a2a3a, 0.15, 0.6), cx, baseY + 0.8, cz + d / 2 + 0.26);
    group.add(glass);
    // Cornice + pilasters.
    group.add(box(w + 0.6, 0.4, d + 0.6, lam(0x5a524a), cx, baseY + h + 0.2, cz));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      group.add(box(0.5, h, 0.5, lam(0x6a625a), cx + sx * (w / 2 - 0.1), baseY + h / 2, cz + sz * (d / 2 - 0.1)));
    }
    // Silhouette variant.
    const v = Math.floor(rng() * 3);
    if (v === 0) {
      // Two-tier setback: a smaller box on the roof.
      const top = box(w * 0.6, h * 0.28, d * 0.6, facadeMaterial((variant + 3) % facadeTexes.length, h * 0.28), cx, baseY + h + h * 0.14, cz);
      group.add(top);
      group.add(box(w * 0.6 + 0.4, 0.3, d * 0.6 + 0.4, lam(0x5a524a), cx, baseY + h + h * 0.28 + 0.15, cz));
    } else if (v === 1) {
      // Bay window jutting from the south face.
      group.add(box(w * 0.45, h * 0.55, 0.9, facadeMaterial((variant + 1) % facadeTexes.length, h * 0.55), cx, baseY + h * 0.45, cz + d / 2 + 0.4));
    } else {
      // Roof terrace: parapet + AC box + a palm in a planter.
      group.add(box(w + 0.2, 0.5, 0.3, lam(0x5a524a), cx, baseY + h + 0.4, cz + d / 2));
      group.add(box(w + 0.2, 0.5, 0.3, lam(0x5a524a), cx, baseY + h + 0.4, cz - d / 2));
      group.add(box(1.4, 0.9, 1.0, lam(0x8a8a92), cx + w * 0.25, baseY + h + 0.65, cz - d * 0.2));
    }
    // Awning over the door.
    const awn = box(3.2, 0.12, 1.2, lam(0xd92038), cx, baseY + 2.6, cz + d / 2 + 0.6);
    awn.rotation.x = 0.25;
    group.add(awn);
    // Shop sign above the door, facing south (toward the street).
    if (signText) {
      const sign = makeSignBoard(signText, Math.min(5, w * 0.8));
      sign.position.set(cx, baseY + 3.6, cz + d / 2 + 0.35);
      group.add(sign);
      signCount++;
    }
    addCollider(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2);
    return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
  }

  // Named places get a bespoke treatment on top of a normal building.
  function addSpecial(key) {
    const place = PLACES[key];
    const dims = PLACE_DIMS[key];
    const cx = place.x, cz = place.y;
    const w = dims.w, d = dims.d;
    const baseY = groundHeight(cx, cz);
    addSlab(cx, cz, w, d, baseY);
    const h = key === 'cityHall' ? 16 : key === 'hospital' ? 14 : key === 'mall' ? 12 : 10;
    const body = box(w, h, d, facadeMaterial(2, h), cx, baseY + h / 2, cz);
    group.add(body);
    group.add(box(w + 0.6, 0.4, d + 0.6, lam(0x5a524a), cx, baseY + h + 0.2, cz));
    // Big readable sign with the place name.
    const sign = makeSignBoard(place.name.toUpperCase(), Math.min(8, w * 0.85), '#14141e', '#ffd34d');
    sign.position.set(cx, baseY + h + 1.6, cz + d / 2 + 0.4);
    group.add(sign);
    signCount++;
    addCollider(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2);

    if (key === 'club') {
      // La Rosa's Club: purple walls, pink neon windows, neon sign glow.
      body.material = lam(0x6a2a8a);
      const neon = new THREE.MeshBasicMaterial({ color: 0xff2a9d });
      for (let i = 0; i < 4; i++) {
        group.add(box(1.6, 2.4, 0.1, neon, cx - w / 2 + 3 + i * 4.5, baseY + 5, cz + d / 2 + 0.05));
      }
      const glow = box(w * 0.9, 0.5, 0.5, new THREE.MeshBasicMaterial({ color: 0xff2a9d }), cx, baseY + h - 1, cz + d / 2 + 0.1);
      group.add(glow);
    } else if (key === 'casino') {
      // Neon Palm Casino: setback upper floor + gold neon trim.
      group.add(box(w * 0.7, 5, d * 0.7, lam(0x1a5a4a), cx, baseY + h + 2.5, cz));
      const trim = box(w + 0.3, 0.35, 0.35, new THREE.MeshBasicMaterial({ color: 0xffd34d }), cx, baseY + h + 0.4, cz + d / 2 + 0.1);
      group.add(trim);
    } else if (key === 'cityHall') {
      // Five columns + pediment portico on the south face.
      for (let i = 0; i < 5; i++) {
        group.add(cyl(0.5, 0.55, 9, lam(0xe8e2d4), cx - w / 2 + 2 + i * (w - 4) / 4, baseY + 4.5, cz + d / 2 + 1.2, 10));
      }
      const ped = box(w * 0.8, 1.6, 0.6, lam(0xe8e2d4), cx, baseY + 9.6, cz + d / 2 + 1.2);
      group.add(ped);
    } else if (key === 'hospital') {
      // Rooftop box + red cross on the roof and the face.
      group.add(box(6, 3, 4, lam(0xf2f5f7), cx, baseY + h + 1.5, cz));
      const crossMat = lam(0xd92038);
      group.add(box(0.5, 2.2, 0.2, crossMat, cx, baseY + h + 1.5, cz + d / 2 + 0.1));
      group.add(box(2.2, 0.5, 0.2, crossMat, cx, baseY + h + 1.5, cz + d / 2 + 0.1));
      group.add(box(3, 0.8, 0.2, crossMat, cx, baseY + 6, cz + d / 2 + 0.1));
      group.add(box(0.8, 3, 0.2, crossMat, cx, baseY + 6, cz + d / 2 + 0.1));
    } else if (key === 'mall') {
      // Wide canopy over the entrance + big glass front.
      const canopy = box(w * 0.9, 0.3, 4, lam(0x2a6fd6), cx, baseY + 4.2, cz + d / 2 + 2);
      group.add(canopy);
      group.add(box(w * 0.8, 3, 0.15, std(0x1a2a3a, 0.15, 0.6), cx, baseY + 2, cz + d / 2 + 0.05));
    } else if (key === 'station') {
      // LVPD Station: blue trim + flag pole + badge sign.
      group.add(box(w + 0.2, 0.8, 0.3, lam(0x2a6fd6), cx, baseY + h - 0.5, cz + d / 2 + 0.05));
      const pole = cyl(0.08, 0.08, 9, lam(0xc8ccd4), cx + w / 2 - 2, baseY + 4.5, cz + d / 2 + 2, 8);
      group.add(pole);
      group.add(box(1.8, 1.1, 0.05, lam(0x2a6fd6), cx + w / 2 - 2, baseY + 8.2, cz + d / 2 + 2));
    } else if (key === 'dealer') {
      // Auto Palms: open showroom front (glass) + forecourt (cars park here).
      group.add(box(w * 0.8, 3.2, 0.15, std(0x1a2a3a, 0.15, 0.6), cx, baseY + 2.1, cz + d / 2 + 0.05));
      const canopy = box(w * 0.9, 0.3, 5, lam(0xffd34d), cx, baseY + 4.4, cz + d / 2 + 2.5);
      group.add(canopy);
    } else if (key === 'garage') {
      // Manny's Garage: three open bays (dark openings) + tool sign.
      for (let i = -1; i <= 1; i++) {
        group.add(box(4, 3.4, 0.2, lam(0x14141a), cx + i * 5.5, baseY + 1.9, cz + d / 2 + 0.05));
      }
    } else if (key === 'gas') {
      // Petro Vega: pump canopy on posts + two pumps.
      for (const sx of [-1, 1]) {
        group.add(cyl(0.18, 0.18, 4.5, lam(0xc8ccd4), cx + sx * 5, baseY + 2.25, cz + d / 2 + 5, 8));
      }
      group.add(box(13, 0.5, 7, lam(0xd92038), cx, baseY + 4.8, cz + d / 2 + 5));
      for (const sx of [-1, 1]) {
        group.add(box(0.9, 1.4, 0.7, lam(0xe8e8e8), cx + sx * 2.5, baseY + 0.9, cz + d / 2 + 5));
      }
    } else if (key === 'warehouse') {
      // Old Cannery: sawtooth roof + rust tint.
      body.material = lam(0x7a5a3a);
      for (let i = 0; i < 3; i++) {
        const tooth = box(w / 3, 1.8, d, lam(0x5a4a3a), cx - w / 3 + i * (w / 3), baseY + h + 0.9, cz);
        tooth.rotation.x = 0.18;
        group.add(tooth);
      }
    } else if (key === 'bank') {
      // Stone columns + gold trim, like city hall but smaller.
      for (let i = 0; i < 4; i++) {
        group.add(cyl(0.4, 0.45, 7, lam(0xd8d2c4), cx - w / 2 + 2 + i * (w - 4) / 3, baseY + 3.5, cz + d / 2 + 1, 10));
      }
      group.add(box(w * 0.7, 0.3, 0.3, lam(0xffd34d), cx, baseY + h - 0.4, cz + d / 2 + 0.05));
    }
    return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
  }

  // -------------------------------------------------------------------------
  // Trees. Palms use the loader's proper palm (curved trunk, drooping
  // fronds — never a ball on a stick). Lush trees are clusters of SMALL
  // spheres (radius 0.5–0.9; the 1.0–2.0 band is avoided by design).
  // Nothing is planted on a road or inside a building footprint.
  // -------------------------------------------------------------------------
  function nearBuilding(x, z, margin = 1) {
    for (const c of colliders) {
      if (x > c.x0 - margin && x < c.x1 + margin && z > c.z0 - margin && z < c.z1 + margin) return true;
    }
    return false;
  }

  function plantPalm(x, z, scale = 1) {
    if (isOnRoad(x, z) || nearBuilding(x, z, 2)) return;
    const palm = MODELS.trees && MODELS.trees.palm
      ? (() => { const g = MODELS.trees.palm.scene.clone(); g.scale.setScalar(scale * 1.4); return g; })()
      : buildPalm();
    if (!MODELS.trees || !MODELS.trees.palm) palm.scale.setScalar(scale);
    palm.position.set(x, groundHeight(x, z), z);
    palm.rotation.y = rng() * Math.PI * 2;
    group.add(palm);
  }

  function plantPine(x, z, scale = 1) {
    if (isOnRoad(x, z) || nearBuilding(x, z, 2)) return;
    const pine = MODELS.trees && MODELS.trees.pine
      ? (() => { const g = MODELS.trees.pine.scene.clone(); g.scale.setScalar(scale * 1.6); return g; })()
      : buildPine();
    if (!MODELS.trees || !MODELS.trees.pine) pine.scale.setScalar(scale);
    pine.position.set(x, groundHeight(x, z), z);
    pine.rotation.y = rng() * Math.PI * 2;
    group.add(pine);
  }

  function plantLush(x, z) {
    if (isOnRoad(x, z) || nearBuilding(x, z, 2)) return;
    const g = new THREE.Group();
    const trunk = cyl(0.18, 0.26, 1.6, lam(0x6a4a2a), 0, 0.8, 0, 8);
    g.add(trunk);
    // Cluster of small balls (r 0.55–0.9) — a full crown, not a lollipop.
    const leaf = lam(0x2e8b3a);
    const leaf2 = lam(0x3aa84a);
    for (let i = 0; i < 5; i++) {
      const r = 0.55 + rng() * 0.35;
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), i % 2 ? leaf : leaf2);
      s.position.set((rng() - 0.5) * 1.6, 2.0 + rng() * 0.9, (rng() - 0.5) * 1.6);
      s.castShadow = true;
      g.add(s);
    }
    g.position.set(x, groundHeight(x, z), z);
    group.add(g);
  }

  function plantCactus(x, z) {
    if (isOnRoad(x, z)) return;
    const g = new THREE.Group();
    const mat = lam(0x2a7a3a);
    g.add(cyl(0.32, 0.38, 2.4, mat, 0, 1.2, 0, 10));
    const armL = cyl(0.16, 0.16, 0.9, mat, -0.5, 1.5, 0, 8);
    armL.rotation.z = Math.PI / 2;
    g.add(armL);
    g.add(cyl(0.16, 0.16, 0.7, mat, -0.9, 1.8, 0, 8));
    const armR = cyl(0.16, 0.16, 0.8, mat, 0.5, 1.8, 0, 8);
    armR.rotation.z = Math.PI / 2;
    g.add(armR);
    g.add(cyl(0.16, 0.16, 0.6, mat, 0.9, 2.05, 0, 8));
    g.position.set(x, groundHeight(x, z), z);
    group.add(g);
  }

  function plantRock(x, z) {
    if (isOnRoad(x, z) || nearBuilding(x, z, 1)) return;
    const s = 0.8 + rng() * 2.2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), lam(0x8a8078));
    rock.position.set(x, groundHeight(x, z) + s * 0.3, z);
    rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rock.castShadow = true;
    group.add(rock);
  }

  // -------------------------------------------------------------------------
  // Street props.
  // -------------------------------------------------------------------------
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleMat = lam(0x3a3a42);

  function addLamp(x, z) {
    if (isOnRoad(x, z)) return;
    const g = new THREE.Group();
    g.add(cyl(0.09, 0.12, 5.2, poleMat, 0, 2.6, 0, 8));
    const arm = box(1.6, 0.1, 0.1, poleMat, 0.7, 5.1, 0);
    g.add(arm);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampHeadMat);
    head.position.set(1.45, 5.0, 0);
    g.add(head);
    g.position.set(x, groundHeight(x, z), z);
    group.add(g);
  }

  // Power pole with sagging cables to the next pole along the road.
  // Knockable: updatePoles drops any pole a fast car hits.
  function addPowerPole(x, z) {
    const g = new THREE.Group();
    const pole = cyl(0.14, 0.18, 7.5, lam(0x5a4a3a), 0, 3.75, 0, 8);
    g.add(pole);
    const cross = box(2.2, 0.14, 0.14, lam(0x5a4a3a), 0, 6.8, 0);
    g.add(cross);
    g.position.set(x, groundHeight(x, z), z);
    group.add(g);
    poles.push({ group: g, x, z, fallen: false, fallT: 0, axis: (rng() - 0.5) * 0.6 });
    return g;
  }

  function addCable(a, b) {
    // A sagging line between two pole tops (catenary approximated).
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = 6.8 - Math.sin(t * Math.PI) * 1.1;
      pts.push(new THREE.Vector3(x, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x1a1a1a }));
    group.add(line);
  }

  // Traffic light at an intersection: housing + red lamp + green lamp.
  // main.js toggles l.red.visible / l.green.visible on its 8 s cycle.
  function addTrafficLight(x, z, face) {
    const g = new THREE.Group();
    g.add(cyl(0.1, 0.13, 4.6, poleMat, 0, 2.3, 0, 8));
    const housing = box(0.5, 1.3, 0.4, lam(0x1a1a1a), 0, 4.6, 0);
    g.add(housing);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.set(0, 4.95, 0.22);
    g.add(red);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: 0x2aff5a }));
    green.position.set(0, 4.35, 0.22);
    green.visible = false;
    g.add(green);
    g.position.set(x, groundHeight(x, z), z);
    g.rotation.y = face;
    group.add(g);
    trafficLights.push({ red, green });
  }

  function addStreetSign(x, z, name) {
    const g = new THREE.Group();
    g.add(cyl(0.06, 0.06, 2.6, lam(0x8a8a92), 0, 1.3, 0, 8));
    const tex = makeSignTexture(name, '#145a2a', '#ffffff');
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.06), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set(0, 2.6, 0);
    g.add(board);
    g.position.set(x, groundHeight(x, z), z);
    g.rotation.y = rng() * Math.PI;
    group.add(g);
  }

  function addHydrant(x, z) {
    if (isOnRoad(x, z)) return;
    const g = new THREE.Group();
    g.add(cyl(0.22, 0.26, 0.7, lam(0xd92038), 0, 0.35, 0, 10));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lam(0xd92038));
    cap.position.set(0, 0.75, 0);
    g.add(cap);
    g.position.set(x, groundHeight(x, z), z);
    group.add(g);
  }

  function addBench(x, z, rotY = 0) {
    if (isOnRoad(x, z)) return;
    const g = new THREE.Group();
    g.add(box(1.8, 0.12, 0.55, lam(0x8a6a4a), 0, 0.45, 0));
    const back = box(1.8, 0.6, 0.1, lam(0x8a6a4a), 0, 0.85, -0.24);
    g.add(back);
    for (const sx of [-0.7, 0.7]) {
      g.add(box(0.1, 0.45, 0.5, lam(0x3a3a42), sx, 0.22, 0));
    }
    g.position.set(x, groundHeight(x, z), z);
    g.rotation.y = rotY;
    group.add(g);
  }

  function addBusStop(x, z) {
    if (isOnRoad(x, z)) return;
    const g = new THREE.Group();
    for (const sx of [-1.4, 1.4]) {
      g.add(cyl(0.07, 0.07, 2.4, poleMat, sx, 1.2, 0, 8));
    }
    g.add(box(3.2, 0.12, 1.2, lam(0x2a6fd6), 0, 2.5, 0));
    const bench = box(2.6, 0.12, 0.5, lam(0x8a6a4a), 0, 0.45, 0);
    g.add(bench);
    const sign = makeSignBoard('BUS STOP', 2.2, '#145a2a', '#ffffff');
    sign.position.set(0, 2.9, 0);
    g.add(sign);
    g.position.set(x, groundHeight(x, z), z);
    group.add(g);
  }

  // -------------------------------------------------------------------------
  // Bridges, pier, airport.
  // -------------------------------------------------------------------------
  function addBridge(zCenter) {
    // Deck at y = 0.65 spanning the river (x 262..294), continuous side
    // rails (boxes along the deck edge — never floating posts), approaches.
    const deck = box(32, 0.5, 12, lam(0x6a6a72), 278, 0.4, zCenter);
    deck.receiveShadow = true;
    group.add(deck);
    for (const sz of [-1, 1]) {
      const rail = box(32, 0.9, 0.35, lam(0x8a8a92), 278, 1.1, zCenter + sz * 5.8);
      group.add(rail);
    }
    // Approach ramps.
    for (const sx of [-1, 1]) {
      const ramp = box(4.5, 0.4, 12, lam(0x6a6a72), 278 + sx * 18, 0.2, zCenter);
      ramp.rotation.z = sx * 0.12;
      group.add(ramp);
    }
    // Lamp posts on the deck.
    for (const lx of [266, 278, 290]) {
      const g = new THREE.Group();
      g.add(cyl(0.07, 0.09, 3.4, poleMat, 0, 1.7, 0, 8));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampHeadMat);
      head.position.set(0, 3.4, 0);
      g.add(head);
      g.position.set(lx, 0.65, zCenter - 5.4);
      group.add(g);
    }
  }

  function addPierAndHarbor() {
    // Wooden pier from the beach out into the sea at z = 130.
    const pier = box(26, 0.5, 7, lam(0xa97c50), 2, 0.35, 130);
    group.add(pier);
    for (let x = -8; x <= 12; x += 4) {
      for (const sz of [-3, 3]) {
        group.add(cyl(0.18, 0.18, 1.6, lam(0x6a4a2a), x, -0.2, 130 + sz, 8));
      }
    }
    // Lighthouse at the pier end.
    const tower = cyl(1.1, 1.5, 9, lam(0xf2f5f7), -10, 4.5, 130, 12);
    group.add(tower);
    group.add(cyl(1.3, 1.3, 0.5, lam(0xd92038), -10, 9.2, 130, 12));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    lamp.position.set(-10, 10.2, 130);
    group.add(lamp);
    // Dock containers + crane.
    const contColors = [0xd92038, 0x2a6fd6, 0xffd34d, 0x2a8a4a];
    for (let i = 0; i < 6; i++) {
      const cx = 20 + (i % 3) * 7;
      const cz = 118 + Math.floor(i / 3) * 8;
      const cont = box(6, 2.6, 2.6, lam(contColors[i % 4]), cx, groundHeight(cx, cz) + 1.3, cz);
      cont.rotation.y = (i % 2) * 0.1;
      group.add(cont);
    }
    // Crane: two legs + jib.
    const crane = new THREE.Group();
    crane.add(box(1.2, 14, 1.2, lam(0xffd34d), -2, 7, 0));
    crane.add(box(1.2, 14, 1.2, lam(0xffd34d), 2, 7, 0));
    const jib = box(16, 0.8, 0.8, lam(0xffd34d), 5, 13.5, 0);
    crane.add(jib);
    crane.add(box(1.5, 1.5, 1.5, lam(0x3a3a42), -1, 13.5, 0));
    crane.position.set(28, groundHeight(28, 140), 140);
    group.add(crane);
  }

  function addAirport() {
    // Runway is painted in the ground texture; here the terminal, the
    // control tower and ONE procedural plane on the tarmac — never on a
    // road, always on the runway.
    const tx = 330, tz = 150;
    const baseY = groundHeight(tx, tz);
    const terminal = box(24, 7, 12, lam(0xd8d2c4), tx, baseY + 3.5, tz);
    group.add(terminal);
    group.add(box(24.6, 0.5, 12.6, lam(0x2a6fd6), tx, baseY + 7.2, tz));
    group.add(box(20, 2.5, 0.2, std(0x1a2a3a, 0.15, 0.6), tx, baseY + 3, tz - 6.1));
    addCollider(tx - 12, tx + 12, tz - 6, tz + 6);
    const tower = cyl(1.2, 1.6, 16, lam(0xe8e2d4), 352, groundHeight(352, 158) + 8, 158, 12);
    group.add(tower);
    const cab = cyl(2.2, 1.8, 2.5, std(0x1a2a3a, 0.15, 0.6), 352, groundHeight(352, 158) + 17, 158, 12);
    group.add(cab);
    // Procedural plane on the runway.
    const plane = new THREE.Group();
    const fus = cyl(1.1, 0.9, 14, lam(0xf2f5f7), 0, 1.6, 0, 12);
    fus.rotation.x = Math.PI / 2;
    plane.add(fus);
    const wing = box(18, 0.25, 2.6, lam(0x2a6fd6), 0, 1.5, 0);
    plane.add(wing);
    const tail = box(5, 0.2, 1.6, lam(0x2a6fd6), 0, 2.6, -6.2);
    plane.add(tail);
    const fin = box(0.25, 2.4, 1.8, lam(0x2a6fd6), 0, 3.2, -6.4);
    plane.add(fin);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), lam(0x2a6fd6));
    nose.position.set(0, 1.6, 7);
    plane.add(nose);
    plane.position.set(330, groundHeight(330, 130), 130);
    plane.rotation.y = Math.PI / 2;
    group.add(plane);
  }

  // -------------------------------------------------------------------------
  // Interiors — 20 walk-in rooms far below the city (y = -40). Each room
  // is a floored, walled box with a blue exit door, a little furniture and
  // ceiling lights. main.js teleports the player to (room.x, -40, room.z)
  // and clamps walking to room.x +/- w/2, room.z +/- d/2.
  // -------------------------------------------------------------------------
  const INTERIOR_KEYS = [
    'club', 'garage', 'warehouse', 'hospital', 'cityHall',
    'casino', 'dealer', 'gunShop', 'station', 'petshop',
    'restaurant', 'mall', 'safehouse', 'bank', 'jewelry',
    'minimarket', 'workshop', 'clotheshop', 'salon', 'tattoo',
  ];

  function buildInteriors() {
    INTERIOR_KEYS.forEach((key, i) => {
      const dims = PLACE_DIMS[key];
      const w = Math.min(dims.w, 16);
      const d = Math.min(dims.d, 12);
      const rx = 30 + (i % 5) * 30;
      const rz = 30 + Math.floor(i / 5) * 30;
      const Y = -40;
      const room = new THREE.Group();
      // Floor + walls (no ceiling — the city slab above reads as one).
      room.add(box(w, 0.2, d, lam(0x8a7a6a), rx, Y + 0.1, rz));
      const wallMat = lam(0xd8cfc0);
      room.add(box(w, 3.6, 0.3, wallMat, rx, Y + 1.8, rz - d / 2));
      room.add(box(w, 3.6, 0.3, wallMat, rx, Y + 1.8, rz + d / 2));
      room.add(box(0.3, 3.6, d, wallMat, rx - w / 2, Y + 1.8, rz));
      room.add(box(0.3, 3.6, d, wallMat, rx + w / 2, Y + 1.8, rz));
      // Blue exit door on the south wall.
      room.add(box(1.4, 2.4, 0.2, lam(0x2a6fd6), rx, Y + 1.2, rz + d / 2 - 0.1));
      // Ceiling light panels (unlit material — they glow on their own).
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
      room.add(box(2.2, 0.08, 0.8, lightMat, rx - w / 4, Y + 3.5, rz));
      room.add(box(2.2, 0.08, 0.8, lightMat, rx + w / 4, Y + 3.5, rz));
      // A little furniture so the room is not an empty box: a counter and
      // a table, or a bed for the safehouse.
      if (key === 'safehouse') {
        room.add(box(2.2, 0.5, 4, lam(0x7a5a9a), rx - w / 4, Y + 0.45, rz - d / 4));
        room.add(box(2.2, 0.3, 1, lam(0xf2f5f7), rx - w / 4, Y + 0.85, rz - d / 4 + 1.2));
      } else {
        room.add(box(w * 0.5, 1.0, 0.8, lam(0x6a4a2a), rx, Y + 0.5, rz - d / 2 + 1.2));
        room.add(box(1.6, 0.7, 1.6, lam(0x8a6a4a), rx + w / 4, Y + 0.35, rz + d / 4));
        room.add(box(1.2, 1.8, 0.6, lam(0x3a3a42), rx - w / 4, Y + 0.9, rz + d / 4));
      }
      group.add(room);
      interiors[key] = { x: rx, z: rz, w, d };
    });
  }

  // -------------------------------------------------------------------------
  // Assembly.
  // -------------------------------------------------------------------------

  // Ground: a 120x120-segment plane displaced by groundHeight, painted by
  // the 2048 px canvas. The mesh sits at (200, 0, 200) so it spans the
  // world 0..400 on both axes; canvas px = worldX * 5.12.
  const groundTex = paintGroundTexture(mulberry32(99));
  const groundGeo = new THREE.PlaneGeometry(400, 400, 120, 120);
  groundGeo.rotateX(-Math.PI / 2);
  {
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + 200;
      const wz = pos.getZ(i) + 200;
      pos.setY(i, groundHeight(wx, wz));
    }
    groundGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ map: groundTex }));
  ground.position.set(200, 0, 200);
  ground.receiveShadow = true;
  group.add(ground);

  // Endless sea: a huge deep-blue plane under everything, so no direction
  // ever shows void past the island.
  const bigSea = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshLambertMaterial({ color: PALETTE.deep }),
  );
  bigSea.rotation.x = -Math.PI / 2;
  bigSea.position.set(200, 0.02, 200);
  group.add(bigSea);

  // Sea water surface (west) + river ribbon, both slightly above the bed.
  seaPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 400),
    new THREE.MeshLambertMaterial({ color: 0x2f9fd8, transparent: true, opacity: 0.85 }),
  );
  seaPlane.rotation.x = -Math.PI / 2;
  seaPlane.position.set(-5, 0.12, 200);
  group.add(seaPlane);

  {
    // River water ribbon following the meander.
    const pts = [];
    const idx = [];
    for (let z = 0; z <= 400; z += 10) {
      const cx = riverCenter(z);
      pts.push(cx - 9, 0.12, z, cx + 9, 0.12, z);
    }
    for (let i = 0; i < pts.length / 3 - 2; i += 2) {
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const river = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3a8fc0, transparent: true, opacity: 0.9 }));
    group.add(river);
  }

  // Foam wave strips along the shoreline, animated by updateSea.
  for (let i = 0; i < 8; i++) {
    const z = 20 + i * 50 + rng() * 20;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 14), mat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(14, 0.16, z);
    group.add(strip);
    waveStrips.push({ mesh: strip, phase: rng() * Math.PI * 2, baseX: 14 });
  }

  // Named places first (bespoke), then generic blocks.
  const placedSpecial = new Set();
  for (const key of Object.keys(PLACES)) {
    if (key === 'beach' || key === 'harbor' || key === 'pierPickup' || key === 'dock' || key === 'airport' || key === 'bridgeN' || key === 'bridgeS') continue;
    if (key === 'park') continue; // handled as a park block below
    addSpecial(key);
    placedSpecial.add(key);
  }

  // Generic city blocks: 8x8 grid, centres 52..234.
  const blockCenters = [52, 78, 104, 130, 156, 182, 208, 234];
  function blockTaken(bx, bz) {
    // A named place footprint intersecting this block's build area.
    for (const key of Object.keys(PLACES)) {
      const p = PLACES[key];
      const d = PLACE_DIMS[key];
      if (bx + 6.5 > p.x - d.w / 2 - 1 && bx - 6.5 < p.x + d.w / 2 + 1
        && bz + 6.5 > p.y - d.d / 2 - 1 && bz - 6.5 < p.y + d.d / 2 + 1) return true;
    }
    return false;
  }
  function districtAt(x, z) {
    for (const d of DISTRICTS) {
      if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.key;
    }
    return 'marina';
  }
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (blockTaken(bx, bz)) continue;
      if (bx === 104 && bz === 78) {
        // Palm Court Park (the named park place).
        const slab = box(20, 0.15, 16, lam(PALETTE.park), bx, groundHeight(bx, bz) + 0.07, bz);
        slab.castShadow = false;
        group.add(slab);
        plantPalm(bx - 6, bz - 5);
        plantPalm(bx + 6, bz - 5);
        plantPalm(bx - 6, bz + 5);
        plantLush(bx + 6, bz + 5);
        addBench(bx - 3, bz + 2, Math.PI / 2);
        addBench(bx + 3, bz - 2, -Math.PI / 2);
        continue;
      }
      if (rng() < CITY_TUNING.parkChance) {
        const slab = box(20, 0.15, 16, lam(PALETTE.park), bx, groundHeight(bx, bz) + 0.07, bz);
        slab.castShadow = false;
        group.add(slab);
        plantLush(bx - 5, bz - 4);
        plantLush(bx + 5, bz + 4);
        plantPalm(bx + 5, bz - 4);
        addBench(bx, bz + 5, 0);
        if (rng() < 0.4) {
          const pond = new THREE.Mesh(new THREE.CircleGeometry(3, 20), lam(PALETTE.pond));
          pond.rotation.x = -Math.PI / 2;
          pond.position.set(bx - 2, groundHeight(bx, bz) + 0.18, bz - 1);
          group.add(pond);
        }
        continue;
      }
      const dist = districtAt(bx, bz);
      const h = dist === 'downtown' ? 16 + rng() * 18
        : dist === 'neon' ? 12 + rng() * 12
        : dist === 'beach' ? 8 + rng() * 8
        : 10 + rng() * 10;
      if (rng() < CITY_TUNING.twoBuildingChance) {
        addBuilding(bx - 2.8, bz, 5, 9, h * 0.85, Math.floor(rng() * 8), rng() < 0.3 ? pick(rng, GENERIC_SHOPS) : null);
        addBuilding(bx + 2.8, bz, 5, 9, h, Math.floor(rng() * 8), rng() < 0.3 ? pick(rng, GENERIC_SHOPS) : null);
      } else {
        addBuilding(bx, bz, 9 + rng() * 2, 9 + rng() * 2, h, Math.floor(rng() * 8), rng() < 0.3 ? pick(rng, GENERIC_SHOPS) : null);
      }
    }
  }

  // Beach props at La Vega Beach.
  plantPalm(20, 60);
  plantPalm(24, 90);
  plantPalm(19, 110);
  plantPalm(25, 150);
  plantPalm(20, 180);
  plantPalm(24, 220);
  {
    // Lifeguard tower.
    const lg = new THREE.Group();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      lg.add(cyl(0.09, 0.09, 3, lam(0xf2f5f7), sx * 0.9, 1.5, sz * 0.9, 8));
    }
    lg.add(box(2.4, 0.3, 2.4, lam(0xd92038), 0, 3.1, 0));
    lg.add(box(2.0, 1.4, 2.0, lam(0xf2f5f7), 0, 4.0, 0));
    lg.add(box(2.6, 0.15, 2.6, lam(0xd92038), 0, 4.9, 0));
    lg.position.set(24, groundHeight(24, 78), 78);
    group.add(lg);
  }

  // Forest pines, desert cacti, rocky boulders, roadside trees.
  for (let i = 0; i < 70; i++) {
    plantPine(rand(rng, 5, 255), rand(rng, 265, 395), 0.8 + rng() * 0.7);
  }
  for (let i = 0; i < 35; i++) {
    plantCactus(rand(rng, 265, 395), rand(rng, 5, 255));
  }
  for (let i = 0; i < 25; i++) {
    plantRock(rand(rng, 265, 395), rand(rng, 265, 395));
  }
  for (let i = 0; i < 40; i++) {
    plantLush(rand(rng, 35, 255), rand(rng, 35, 255));
  }
  // Palms along the beach road and Palm Row.
  for (let z = 20; z <= 250; z += 26) {
    plantPalm(33, z, 0.9 + rng() * 0.3);
    if (rng() < 0.6) plantPalm(58.5, z, 0.9 + rng() * 0.3);
  }

  // Street lamps along the roads (every ~52 m, alternating sides).
  for (const r of ROADS) {
    for (let t = 52; t <= 234; t += 52) {
      addLamp(r + 6.4, t);
      addLamp(t, r + 6.4);
    }
  }

  // Power poles + sagging cables on four roads.
  const poleRoadsNS = [65, 169];
  const poleRoadsEW = [91, 195];
  const poleLines = [];
  for (const r of poleRoadsNS) {
    let prev = null;
    for (let t = 39; t <= 247; t += 26) {
      const p = addPowerPole(r - 6.4, t);
      if (prev) poleLines.push([prev, { x: r - 6.4, z: t }]);
      prev = { x: r - 6.4, z: t };
    }
  }
  for (const r of poleRoadsEW) {
    let prev = null;
    for (let t = 39; t <= 247; t += 26) {
      const p = addPowerPole(t, r - 6.4);
      if (prev) poleLines.push([prev, { x: t, z: r - 6.4 }]);
      prev = { x: t, z: r - 6.4 };
    }
  }
  for (const [a, b] of poleLines) addCable(a, b);

  // Traffic lights + zebra crossings at five intersections.
  const zebraSpots = [[65, 65], [117, 117], [169, 169], [91, 195], [195, 91]];
  for (const [zx, zz] of zebraSpots) {
    addTrafficLight(zx - 7, zz - 7, Math.PI / 4);
    addTrafficLight(zx + 7, zz + 7, Math.PI + Math.PI / 4);
  }

  // Street name signs at a dozen intersections.
  const signSpots = [
    [65, 91, 'Palm Row'], [91, 65, 'Marina Blvd'], [117, 143, 'Neon Ave'],
    [143, 117, 'Casino Row'], [169, 195, 'Harbor Blvd'], [195, 169, 'Sunset Ave'],
    [91, 143, 'Marina Blvd'], [143, 91, 'Casino Row'], [65, 195, 'Palm Row'],
    [195, 65, 'Sunset Ave'], [117, 65, 'Neon Ave'], [169, 117, 'Harbor Blvd'],
  ];
  for (const [sx, sz, name] of signSpots) addStreetSign(sx + 7, sz + 7, name);

  // Hydrants, benches, bus stops.
  for (let i = 0; i < 20; i++) {
    const r = pick(rng, ROADS);
    const t = rand(rng, 45, 250);
    if (rng() < 0.5) addHydrant(r + 6.4, t);
    else addHydrant(t, r + 6.4);
  }
  for (let i = 0; i < 12; i++) {
    const r = pick(rng, ROADS);
    const t = rand(rng, 45, 250);
    if (rng() < 0.5) addBench(r + 6.4, t, Math.PI / 2);
    else addBench(t, r + 6.4, 0);
  }
  addBusStop(65 + 6.4, 117);
  addBusStop(143, 65 + 6.4);
  addBusStop(195 + 6.4, 169);
  addBusStop(117, 221 + 6.4);

  // Bridges, pier + harbor, airport.
  addBridge(39);
  addBridge(247);
  addPierAndHarbor();
  addAirport();

  // Interiors under the city.
  buildInteriors();

  scene.add(group);

  // -----------------------------------------------------------------------
  // Per-frame updates (called from main.js).
  // -----------------------------------------------------------------------
  const sparks = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe94d }));
    s.visible = false;
    group.add(s);
    sparks.push({ mesh: s, t: 1 });
  }
  let seaT = 0;

  function updatePoles(dt, cars) {
    if (!cars) return;
    for (const p of poles) {
      if (!p.fallen) {
        for (const car of cars) {
          if (!car || car.speed === undefined) continue;
          const dx = car.x - p.x, dz = car.z - p.z;
          if (dx * dx + dz * dz < 2.4 * 2.4 && Math.abs(car.speed) >= 7) {
            p.fallen = true;
            p.fallT = 0;
            // Spark flash at the base.
            const sp = sparks.find((s) => s.t >= 1);
            if (sp) {
              sp.t = 0;
              sp.mesh.position.set(p.x, 0.6, p.z);
              sp.mesh.visible = true;
            }
            break;
          }
        }
      } else if (p.fallT < 0.6) {
        p.fallT = Math.min(0.6, p.fallT + dt);
        const a = (p.fallT / 0.6) * 1.35;
        p.group.rotation.z = a * (p.axis >= 0 ? 1 : -1);
        p.group.rotation.x = a * 0.3;
      }
    }
    for (const sp of sparks) {
      if (sp.t < 1) {
        sp.t = Math.min(1, sp.t + dt / 0.4);
        sp.mesh.scale.setScalar(Math.max(0.01, 1 - sp.t));
        if (sp.t >= 1) sp.mesh.visible = false;
      }
    }
  }

  function updateSea(dt) {
    seaT += dt;
    for (const w of waveStrips) {
      w.mesh.position.x = w.baseX + Math.sin(seaT * 0.8 + w.phase) * 0.6;
      w.mesh.material.opacity = 0.35 + 0.2 * Math.sin(seaT * 1.3 + w.phase);
    }
    if (seaPlane) seaPlane.position.y = 0.12 + Math.sin(seaT * 0.5) * 0.03;
  }

  return { group, trafficLights, colliders, interiors, updatePoles, updateSea };
}
