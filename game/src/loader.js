// La Vega 3D — model loading + procedural builders (round 7 re-author).
//
// Two jobs: (1) load the GLB models (Quaternius cars, characters, trees,
// weapons) with a hard timeout and a procedural fallback for every miss,
// so the game always boots; (2) build the procedural vehicles, people
// and trees the game uses when a model is missing or has not arrived yet.
//
// Nothing here fetches from the network: every path is under game/models/
// and is loaded with fetch through the GLTFLoader, which works both from
// file:// (with --allow-file-access-from-files) and from the Pages preview.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Loaded models, filled in by loadModels() at boot and by loadBuyCar()
// when the player buys a showroom car:
//   cars   — map keyed by model key ('sedan', 'sports-car', 'wedge', ...)
//   chars  — map keyed by character id ('jax', 'maya', 'laRosa', ...)
//   sport  — the sports-car GLB (the red Comet the missions point at)
//   trees  — palm / pine GLBs (used when present, else procedural)
//   weapons — pistol / rifle / shotgun / smg GLBs
export const MODELS = {
  cars: {},
  chars: {},
  sport: null,
  trees: {},
  weapons: {},
};

const LOAD_TIMEOUT_MS = 15000; // slow-connection fix: never hang the boot
const BUYCAR_TIMEOUT_MS = 20000;

// Race a promise against a timer that resolves to `fallback`. A load that
// times out is treated exactly like a missing file: the caller falls back.
function withTimeout(promise, ms, fallback) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function loadOne(loader, url) {
  return withTimeout(
    loader.loadAsync(url).catch((e) => {
      console.warn('[loader] failed', url, e && e.message ? e.message : e);
      return null;
    }),
    LOAD_TIMEOUT_MS,
    null,
  );
}

// Load every model the game needs at boot. `base` is the models folder,
// e.g. 'models/'. Loads run in parallel and never throw: a file that
// fails or times out simply stays out of MODELS and the procedural
// builders cover for it.
export async function loadModels(base) {
  const root = base.endsWith('/') ? base : `${base}/`;
  const loader = new GLTFLoader();
  const carFiles = {
    sedan: 'qcars/sedan.glb',
    'sedan-2': 'qcars/sedan-2.glb',
    'sports-car': 'qcars/sports-car.glb',
    suv: 'qcars/suv.glb',
    pickup: 'qcars/pickup.glb',
    taxi: 'qcars/taxi.glb',
    'police-car': 'qcars/police-car.glb',
  };
  const charFiles = {
    jax: 'chars/jax-male.glb',
    maya: 'chars/npc-female-2.glb',
    laRosa: 'chars/la-rosa-female.glb',
    leo: 'chars/npc-male-business.glb',
    npcMale: 'chars/npc-male-adventurer.glb',
    npcFemale: 'chars/npc-female-2.glb',
  };
  const treeFiles = { palm: 'trees/palm-tree.glb', pine: 'trees/pine.glb' };
  const weaponFiles = {
    pistol: 'weapons/pistol.glb',
    rifle: 'weapons/rifle.glb',
    shotgun: 'weapons/shotgun.glb',
    smg: 'weapons/smg.glb',
  };
  const jobs = [];
  for (const [key, file] of Object.entries(carFiles)) {
    jobs.push(loadOne(loader, root + file).then((g) => { if (g) MODELS.cars[key] = g; }));
  }
  for (const [key, file] of Object.entries(charFiles)) {
    jobs.push(loadOne(loader, root + file).then((g) => { if (g) MODELS.chars[key] = g; }));
  }
  for (const [key, file] of Object.entries(treeFiles)) {
    jobs.push(loadOne(loader, root + file).then((g) => { if (g) MODELS.trees[key] = g; }));
  }
  for (const [key, file] of Object.entries(weaponFiles)) {
    jobs.push(loadOne(loader, root + file).then((g) => { if (g) MODELS.weapons[key] = g; }));
  }
  await Promise.all(jobs);
  MODELS.sport = MODELS.cars['sports-car'] || null;
  return MODELS;
}

// Load one showroom car on demand (dealer purchase / dealer-lot upgrade).
// `file` is the path from the catalog entry, e.g. 'cars/wedge.glb' —
// relative to game/models/, or already starting with 'models/'.
// Returns the glTF object, or null when it fails or times out; the
// caller keeps the procedural car in that case.
export async function loadBuyCar(file) {
  const url = file.startsWith('models/') ? file : `models/${file}`;
  const loader = new GLTFLoader();
  return withTimeout(
    loader.loadAsync(url).catch((e) => {
      console.warn('[loader] buycar failed', url, e && e.message ? e.message : e);
      return null;
    }),
    BUYCAR_TIMEOUT_MS,
    null,
  );
}

// ---------------------------------------------------------------------------
// Small material helpers (procedural builders share these).
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
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// GLB cloning. Every clone is normalised the same way: the longest
// horizontal axis is turned to face +z (the driving direction), the model
// is scaled so its length matches spec.len, and it is re-grounded so the
// lowest point sits at y = 0. A wheel is any mesh whose name mentions a
// wheel, tyre or rim; the caller spins those.
// ---------------------------------------------------------------------------
function normaliseLength(obj, targetLen) {
  const b = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  b.getSize(size);
  // If the model is longer along x than z, turn it to face +z.
  if (size.x > size.z) obj.rotation.y = Math.PI / 2;
  const b2 = new THREE.Box3().setFromObject(obj);
  const size2 = new THREE.Vector3();
  b2.getSize(size2);
  const longest = Math.max(size2.x, size2.z);
  if (longest > 0.01) {
    const s = targetLen / longest;
    obj.scale.setScalar(s);
  }
  // Re-ground after scaling: lowest point back to y = 0.
  const b3 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= b3.min.y;
  return obj;
}

function collectWheels(root) {
  const wheels = [];
  root.traverse((o) => {
    if (o.isMesh && /wheel|tyre|tire|rim/i.test(o.name || '')) wheels.push(o);
  });
  return wheels;
}

// Clone a loaded car GLB into a drivable vehicle. The paint colour is
// applied to the largest body mesh (the body is the biggest single part
// of a Quaternius car; glass, tyres and trim stay as modelled).
// Returns { group, wheels }.
export function cloneCar(gltf, spec, color) {
  const clone = SkeletonUtils.clone(gltf.scene);
  // Paint the biggest mesh: the body shell.
  let body = null;
  let bodyVol = 0;
  clone.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const s = new THREE.Vector3();
    b.getSize(s);
    const v = s.x * s.y * s.z;
    if (v > bodyVol) { bodyVol = v; body = o; }
  });
  if (body && body.material && body.material.color) {
    body.material = body.material.clone();
    body.material.color.setHex(color);
  }
  normaliseLength(clone, spec.len || 4.5);
  const group = new THREE.Group();
  group.add(clone);
  // Mark the group as a GLB-built car: the game counts GLB vs procedural
  // cars from this flag (traffic mix, dealer showroom, playtest probes).
  group.userData.isGLB = true;
  return { group, wheels: collectWheels(group) };
}

// Clone a loaded character GLB. Normalised to ~1.8 m tall and grounded,
// with the shirt recoloured (materials whose name mentions a shirt, top
// or torso; otherwise the largest mesh in the torso height band).
// Returns { group, mixer, actions, parts } — actions maps clip names
// ('idle', 'walk', 'run', ...) to AnimationActions when the file has them.
export function cloneCharacter(gltf, opts = {}) {
  const shirt = opts.shirt !== undefined ? opts.shirt : 0x2a6fd6;
  const clone = SkeletonUtils.clone(gltf.scene);
  const b = new THREE.Box3().setFromObject(clone);
  const size = new THREE.Vector3();
  b.getSize(size);
  if (size.y > 0.01) {
    const s = 1.8 / size.y;
    clone.scale.setScalar(s);
  }
  const b2 = new THREE.Box3().setFromObject(clone);
  clone.position.y -= b2.min.y;
  // Shirt recolour.
  let shirtMesh = null;
  clone.traverse((o) => {
    if (!o.isMesh) return;
    if (/shirt|top|torso|chest|jacket/i.test(o.name || '')) shirtMesh = shirtMesh || o;
  });
  if (!shirtMesh) {
    // Fallback: the largest mesh whose centre sits in the torso band.
    let best = 0;
    clone.traverse((o) => {
      if (!o.isMesh) return;
      const bb = new THREE.Box3().setFromObject(o);
      const c = new THREE.Vector3();
      bb.getCenter(c);
      const s = new THREE.Vector3();
      bb.getSize(s);
      const v = s.x * s.y * s.z;
      if (c.y > 0.8 && c.y < 1.5 && v > best) { best = v; shirtMesh = o; }
    });
  }
  if (shirtMesh && shirtMesh.material && shirtMesh.material.color) {
    shirtMesh.material = shirtMesh.material.clone();
    shirtMesh.material.color.setHex(shirt);
  }
  const group = new THREE.Group();
  group.add(clone);
  const mixer = new THREE.AnimationMixer(group);
  const actions = {};
  if (gltf.animations) {
    for (const clip of gltf.animations) {
      const key = clip.name.toLowerCase();
      if (key.includes('idle')) actions.idle = mixer.clipAction(clip);
      else if (key.includes('run') || key.includes('sprint')) actions.run = mixer.clipAction(clip);
      else if (key.includes('walk')) actions.walk = mixer.clipAction(clip);
      else if (key.includes('jump')) actions.jump = mixer.clipAction(clip);
      else if (key.includes('swim')) actions.swim = mixer.clipAction(clip);
      else if (key.includes('punch') || key.includes('attack')) actions.punch = mixer.clipAction(clip);
      else if (key.includes('sit')) actions.sit = mixer.clipAction(clip);
      else if (key.includes('dance')) actions.dance = mixer.clipAction(clip);
    }
  }
  return { group, mixer, actions, parts: null };
}

// ---------------------------------------------------------------------------
// Procedural humanoid (~1.8 m). Used whenever the character GLB is missing:
// same proportions, same shirt colour, grounded, with named parts the
// animator can bob (head, torso, arms, legs).
// Returns { group, parts }.
export function buildProceduralHumanoid(opts = {}) {
  const shirt = opts.shirt !== undefined ? opts.shirt : 0x2a6fd6;
  const skin = opts.skin !== undefined ? opts.skin : 0xc89666;
  const pants = opts.pants !== undefined ? opts.pants : 0x2a2a3a;
  const group = new THREE.Group();
  const parts = {};
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), lam(skin));
  head.position.set(0, 1.66, 0);
  head.castShadow = true;
  group.add(head);
  parts.head = head;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), lam(0x1a1a1a));
  hair.position.set(0, 1.68, 0);
  group.add(hair);
  const torso = box(0.44, 0.62, 0.24, lam(shirt), 0, 1.2, 0);
  group.add(torso);
  parts.torso = torso;
  const armL = box(0.11, 0.58, 0.11, lam(shirt), -0.29, 1.18, 0);
  const armR = box(0.11, 0.58, 0.11, lam(shirt), 0.29, 1.18, 0);
  group.add(armL, armR);
  parts.armL = armL;
  parts.armR = armR;
  const legL = box(0.16, 0.82, 0.16, lam(pants), -0.11, 0.45, 0);
  const legR = box(0.16, 0.82, 0.16, lam(pants), 0.11, 0.45, 0);
  group.add(legL, legR);
  parts.legL = legL;
  parts.legR = legR;
  const shoeL = box(0.17, 0.09, 0.3, lam(0x1a1a1a), -0.11, 0.045, 0.05);
  const shoeR = box(0.17, 0.09, 0.3, lam(0x1a1a1a), 0.11, 0.045, 0.05);
  group.add(shoeL, shoeR);
  return { group, parts };
}

// ---------------------------------------------------------------------------
// Procedural vehicles. Length runs along +z (the driving direction).
// Every builder returns { group, wheels } where wheels are the meshes the
// driving code spins. Variants are keyed off spec.name / spec.top so the
// taxi, the LVPD cruiser, the pickup bed and the sports spoiler all read
// correctly without a GLB.
// ---------------------------------------------------------------------------
function makeWheel(r, w) {
  const wheel = cyl(r, r, w, lam(0x16161a), 0, 0, 0, 14);
  wheel.rotation.z = Math.PI / 2;
  return wheel;
}
function addWheelSet(group, len, wid, r, y = 0.32) {
  const wheels = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = makeWheel(r, 0.22);
      w.position.set(sx * (wid / 2 - 0.05), y, sz * (len * 0.32));
      group.add(w);
      wheels.push(w);
    }
  }
  return wheels;
}

// A street car: body, cabin with glass, bumpers, headlights, taillights.
// Sport models get a rear spoiler; the taxi gets a roof sign and a
// checker band; the LVPD cruiser gets white doors and a light bar; the
// pickup gets an open bed instead of a rear cabin.
export function buildProceduralCar(spec, color) {
  const len = spec.len || 4.5;
  const wid = spec.wid || 1.9;
  const group = new THREE.Group();
  const paint = lam(color);
  const glass = std(0x1a2a3a, 0.15, 0.6);
  const name = spec.name || '';
  const isTaxi = /taxi/i.test(name);
  const isPolice = /LVPD|police/i.test(name);
  const isPickup = /pickup/i.test(name);
  const isSport = (spec.top || 0) >= 44 || /sport|comet|wedge|mustang|formula/i.test(name);
  // Body.
  group.add(box(wid, 0.55, len, paint, 0, 0.55, 0));
  // Cabin (pickup: a short cab + open bed instead).
  if (isPickup) {
    group.add(box(wid * 0.9, 0.5, len * 0.32, glass, 0, 1.05, len * 0.22));
    const bed = box(wid * 0.94, 0.28, len * 0.42, lam(0x2a2a2e), 0, 0.92, -len * 0.22);
    group.add(bed);
  } else {
    group.add(box(wid * 0.86, 0.5, len * 0.48, glass, 0, 1.02, -len * 0.05));
    group.add(box(wid * 0.88, 0.1, len * 0.5, paint, 0, 1.28, -len * 0.05));
  }
  // Bumpers, lights.
  group.add(box(wid * 0.98, 0.16, 0.18, lam(0x2a2a2e), 0, 0.34, len / 2));
  group.add(box(wid * 0.98, 0.16, 0.18, lam(0x2a2a2e), 0, 0.34, -len / 2));
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  group.add(box(0.32, 0.14, 0.06, headMat, -wid * 0.3, 0.62, len / 2 + 0.01));
  group.add(box(0.32, 0.14, 0.06, headMat, wid * 0.3, 0.62, len / 2 + 0.01));
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd92038 });
  group.add(box(0.3, 0.12, 0.06, tailMat, -wid * 0.3, 0.62, -len / 2 - 0.01));
  group.add(box(0.3, 0.12, 0.06, tailMat, wid * 0.3, 0.62, -len / 2 - 0.01));
  // Police livery: white doors + roof light bar.
  if (isPolice) {
    group.add(box(0.04, 0.42, len * 0.42, lam(0xf2f5f7), -wid / 2 - 0.01, 0.55, 0));
    group.add(box(0.04, 0.42, len * 0.42, lam(0xf2f5f7), wid / 2 + 0.01, 0.55, 0));
    group.add(box(0.7, 0.12, 0.3, new THREE.MeshBasicMaterial({ color: 0x2a6fd6 }), 0, 1.34, -len * 0.05));
    group.add(box(0.7, 0.12, 0.3, new THREE.MeshBasicMaterial({ color: 0xd92038 }), 0, 1.34, len * 0.12));
  }
  // Taxi: roof sign + checker band.
  if (isTaxi) {
    group.add(box(0.7, 0.22, 0.3, lam(0xffd34d), 0, 1.42, -len * 0.05));
    group.add(box(wid * 0.9, 0.12, len * 0.9, lam(0x222222), 0, 0.86, 0));
  }
  // Sport spoiler.
  if (isSport) {
    group.add(box(wid * 0.9, 0.06, 0.4, lam(0x1a1a1a), 0, 1.0, -len / 2 + 0.15));
    group.add(box(0.08, 0.22, 0.08, lam(0x1a1a1a), -wid * 0.32, 0.88, -len / 2 + 0.15));
    group.add(box(0.08, 0.22, 0.08, lam(0x1a1a1a), wid * 0.32, 0.88, -len / 2 + 0.15));
  }
  const wheels = addWheelSet(group, len, wid, 0.34);
  return { group, wheels };
}

// A rigid truck: cab + hood + tall cargo box, chrome grill, exhaust
// stack, mud flaps, six wheels. Never a plain box — the cargo reads.
export function buildProceduralTruck(spec, color) {
  const len = spec.len || 6.4;
  const wid = spec.wid || 2.4;
  const group = new THREE.Group();
  const paint = lam(color);
  const glass = std(0x1a2a3a, 0.15, 0.6);
  const chrome = std(0xc8ccd4, 0.25, 0.8);
  // Cargo box (rear two-thirds).
  group.add(box(wid, 2.0, len * 0.58, lam(0xe8e8e8), 0, 1.35, -len * 0.2));
  group.add(box(wid + 0.06, 0.1, len * 0.58, paint, 0, 2.38, -len * 0.2));
  // Cab + hood (front third).
  group.add(box(wid, 1.1, len * 0.22, paint, 0, 0.85, len * 0.32));
  group.add(box(wid * 0.92, 0.9, len * 0.16, glass, 0, 1.75, len * 0.3));
  group.add(box(wid * 0.9, 0.5, len * 0.1, paint, 0, 0.55, len * 0.46));
  // Chrome grill + bumper, headlights.
  group.add(box(wid * 0.7, 0.5, 0.1, chrome, 0, 0.6, len / 2 + 0.02));
  group.add(box(wid, 0.2, 0.16, chrome, 0, 0.32, len / 2));
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  group.add(box(0.3, 0.16, 0.06, headMat, -wid * 0.32, 0.7, len / 2 + 0.01));
  group.add(box(0.3, 0.16, 0.06, headMat, wid * 0.32, 0.7, len / 2 + 0.01));
  // Exhaust stack + mud flaps.
  group.add(cyl(0.09, 0.09, 1.8, chrome, wid / 2 - 0.1, 1.9, len * 0.18, 8));
  group.add(box(0.5, 0.5, 0.05, lam(0x1a1a1a), -wid / 2 + 0.25, 0.35, -len / 2 + 0.1));
  group.add(box(0.5, 0.5, 0.05, lam(0x1a1a1a), wid / 2 - 0.25, 0.35, -len / 2 + 0.1));
  const wheels = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-0.85, -0.1, 0.75]) {
      const w = makeWheel(0.42, 0.26);
      w.position.set(sx * (wid / 2 - 0.05), 0.42, sz * len * 0.42);
      group.add(w);
      wheels.push(w);
    }
  }
  return { group, wheels };
}

// A tall van body shared by van / bus / ambulance / firetruck. `kind`
// picks the dressing: the bus gets five passenger windows and a
// destination sign, the ambulance a red cross and light bar, the
// firetruck a roof ladder and light bar.
export function buildProceduralVan(spec, color, kind = 'van') {
  const len = spec.len || 5.0;
  const wid = spec.wid || 2.2;
  const group = new THREE.Group();
  const glass = std(0x1a2a3a, 0.15, 0.6);
  const bodyColor = kind === 'ambulance' ? 0xf2f5f7 : kind === 'firetruck' ? 0xd92038 : color;
  const paint = lam(bodyColor);
  group.add(box(wid, 1.9, len, paint, 0, 1.25, 0));
  group.add(box(wid * 0.92, 0.7, 0.5, glass, 0, 1.7, len / 2 - 0.3));
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  group.add(box(0.3, 0.14, 0.06, headMat, -wid * 0.3, 0.7, len / 2 + 0.01));
  group.add(box(0.3, 0.14, 0.06, headMat, wid * 0.3, 0.7, len / 2 + 0.01));
  if (kind === 'bus') {
    // Five passenger windows per side + destination sign.
    for (let i = 0; i < 5; i++) {
      const z = -len / 2 + 1.0 + i * ((len - 2) / 4);
      group.add(box(0.04, 0.6, 1.1, glass, -wid / 2 - 0.01, 1.7, z));
      group.add(box(0.04, 0.6, 1.1, glass, wid / 2 + 0.01, 1.7, z));
    }
    group.add(box(1.2, 0.3, 0.06, new THREE.MeshBasicMaterial({ color: 0xffd34d }), 0, 2.0, len / 2 + 0.01));
  } else {
    // Two side windows for the plain van / ambulance / firetruck.
    for (const sx of [-1, 1]) {
      group.add(box(0.04, 0.6, 1.4, glass, sx * (wid / 2 + 0.01), 1.7, -len * 0.1));
    }
  }
  if (kind === 'ambulance') {
    // Red cross on each flank + light bar.
    for (const sx of [-1, 1]) {
      group.add(box(0.05, 0.5, 0.16, lam(0xd92038), sx * (wid / 2 + 0.02), 1.3, 0));
      group.add(box(0.05, 0.16, 0.5, lam(0xd92038), sx * (wid / 2 + 0.02), 1.3, 0));
    }
    group.add(box(0.8, 0.12, 0.3, new THREE.MeshBasicMaterial({ color: 0xd92038 }), 0, 2.28, 0));
  }
  if (kind === 'firetruck') {
    // Roof ladder + light bar.
    group.add(box(0.5, 0.12, len * 0.7, lam(0xc8ccd4), 0, 2.3, 0));
    for (let i = 0; i < 5; i++) {
      group.add(box(0.56, 0.05, 0.08, lam(0x8a8a92), 0, 2.3, -len * 0.3 + i * (len * 0.6) / 4));
    }
    group.add(box(0.8, 0.12, 0.3, new THREE.MeshBasicMaterial({ color: 0x2a6fd6 }), 0, 2.28, len * 0.2));
  }
  const wheels = addWheelSet(group, len, wid, 0.38, 0.38);
  return { group, wheels };
}

// ---------------------------------------------------------------------------
// Trees. The palm is the one players look at most, so it is built
// properly: a gently curving trunk and seven slender fronds that droop
// outwards — never a ball on a stick (the old "lollipop" bug). The pine
// is three stacked cones over a short trunk.
// ---------------------------------------------------------------------------
export function buildPalm() {
  const group = new THREE.Group();
  const trunkMat = lam(0x8a6a4a);
  const frondMat = lam(0x2e8b3a);
  // Trunk: four segments, each offset a little further, so it curves.
  let x = 0;
  let y = 0.6;
  for (let i = 0; i < 4; i++) {
    const seg = cyl(0.14 - i * 0.015, 0.17 - i * 0.015, 1.3, trunkMat, x, y, 0, 8);
    seg.rotation.z = -0.06 * (i + 1);
    group.add(seg);
    x += 0.14;
    y += 1.25;
  }
  const topX = x;
  const topY = y + 0.4;
  // Seven fronds: long, thin, drooping. Each is a flattened box hinged
  // at the crown, angled down ~55 degrees, fanned around the trunk.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const frond = new THREE.Group();
    const blade = box(0.55, 0.04, 2.0, frondMat, 0, 0, 1.0);
    // Taper the tip: a second, narrower blade continuing the droop.
    const tip = box(0.34, 0.03, 1.1, frondMat, 0, -0.28, 2.3);
    tip.rotation.x = 0.5;
    frond.add(blade, tip);
    frond.position.set(topX, topY, 0);
    frond.rotation.y = a;
    frond.rotation.x = -0.95; // droop outwards and down
    group.add(frond);
  }
  // Three coconuts tucked under the crown.
  const nutMat = lam(0x6a4a2a);
  for (const [dx, dz] of [[0.2, 0.1], [-0.18, 0.12], [0, -0.2]]) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), nutMat);
    nut.position.set(topX + dx, topY - 0.15, dz);
    group.add(nut);
  }
  return group;
}

export function buildPine() {
  const group = new THREE.Group();
  const trunkMat = lam(0x6a4a2a);
  const leafMat = lam(0x1e5c2a);
  group.add(cyl(0.16, 0.22, 1.2, trunkMat, 0, 0.6, 0, 8));
  const tiers = [
    { r: 1.5, h: 1.8, y: 1.9 },
    { r: 1.15, h: 1.6, y: 3.0 },
    { r: 0.8, h: 1.4, y: 4.0 },
  ];
  for (const t of tiers) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 10), leafMat);
    cone.position.set(0, t.y, 0);
    cone.castShadow = true;
    group.add(cone);
  }
  return group;
}
