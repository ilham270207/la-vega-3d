// La Vega — VehicleManager (round 13 rebuild).
// Procedural cars / motorbikes / boats / planes / police heli, traffic AI that
// obeys the real traffic-light system, a vehicle ban from the beach,
// exploding cars, weapon pickups + a visible hand weapon + an always-on
// weapon HUD, garage upgrade pads, gun-shop pads, a world-space GPS route
// and loot drops from downed NPCs. No external assets, no GLB files.
import * as THREE from 'three';
import { WORLD, ROADS, CAR_MODELS, CAR_CATALOG, PLACES, WEAPONS } from './config.js';
import { clamp, lerp, damp, rand, pick } from './rng.js';
import { groundHeight } from './city.js';

const WEAPON_NAMES = { fists: 'FISTS', pistol: 'PISTOL', smg: 'SMG', shotgun: 'SHOTGUN', rifle: 'RIFLE' };
const WEAPON_PRICES = { pistol: 600, smg: 1500, shotgun: 2500, rifle: 4000 };
const UPGRADE_PADS = [
  { id: 'engine', label: 'ENGINE', price: 800, color: 0x2b6cb0 },
  { id: 'armor', label: 'ARMOR', price: 600, color: 0x2f9e44 },
  { id: 'nitro', label: 'NITRO', price: 500, color: 0xd9a441 },
];

function signTexture(text, fg = '#ffffff', bg = '#141824') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
  g.fillStyle = fg; g.font = 'bold 30px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.rng = game.rng;
    this._t = 0;
    this.cars = [];
    this.traffic = [];
    this.parkedCars = [];
    this.playerCar = null;
    this.pickups = [];
    this._loot = [];
    this._handWeapon = null;
    this._handWeaponId = null;
    this._handWeaponFor = null;
    this._burning = [];
    this._redCooldown = new Map();
    this._gps = { discs: [], arrow: null, target: null, timer: 0, path: [] };
    this._padChannel = null; // {kind, id, t, total}
    this._padMeshes = [];
    this._rotorCtx = null;
    this._rotorGain = null;
    this._headlight = null;
    this._hudLast = '';
    this._buildWeaponHUD();
    this._buildChannelPrompt();
    this._buildGPS();
    this._buildHeadlight();
    this.spawnTraffic(30);
    this.spawnParked(12);
    this._spawnBoats();
    this._spawnPlanes();
    this._spawnWeaponPickups();
    this._buildPads();
  }

  // ---------- DOM: always-on weapon HUD (item 15) ----------
  _buildWeaponHUD() {
    const d = document.createElement('div');
    d.id = 'lv-weapon-hud';
    d.style.cssText = 'position:fixed;top:108px;right:12px;z-index:40;min-width:178px;max-width:240px;background:rgba(8,10,18,0.82);border:1px solid rgba(255,255,255,0.22);border-radius:10px;padding:8px 10px;color:#fff;font-family:system-ui,Arial,sans-serif;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,0.4)';
    d.innerHTML = '<div style="font-size:10px;letter-spacing:2px;opacity:0.65">SENJATA</div>' +
      '<div id="lv-w-name" style="font-size:17px;font-weight:800;margin-top:2px">FISTS</div>' +
      '<div id="lv-w-ammo" style="font-size:14px;margin-top:1px">—</div>' +
      '<div id="lv-w-slots" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px"></div>';
    document.body.appendChild(d);
    this._hudEl = d;
  }

  _buildChannelPrompt() {
    const d = document.createElement('div');
    d.id = 'lv-channel-prompt';
    d.style.cssText = 'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);z-index:41;min-width:260px;background:rgba(8,10,18,0.88);border:1px solid rgba(255,210,74,0.6);border-radius:10px;padding:10px 14px;color:#fff;font-family:system-ui,Arial,sans-serif;text-align:center;pointer-events:none;display:none';
    d.innerHTML = '<div id="lv-c-label" style="font-size:14px;font-weight:700"></div>' +
      '<div style="height:8px;background:rgba(255,255,255,0.15);border-radius:4px;margin-top:8px;overflow:hidden"><div id="lv-c-bar" style="height:100%;width:0%;background:#ffd24a;border-radius:4px"></div></div>' +
      '<div id="lv-c-sub" style="font-size:11px;opacity:0.7;margin-top:6px">tetap di zona untuk membeli</div>';
    document.body.appendChild(d);
    this._channelEl = d;
  }

  _buildHeadlight() {
    const s = new THREE.SpotLight(0xfff2c0, 0, 46, 0.55, 0.5, 1.2);
    s.position.set(0, 2, 0);
    this.scene.add(s);
    this.scene.add(s.target);
    this._headlight = s;
  }

  _buildGPS() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 26; i++) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.16;
      disc.visible = false;
      this.scene.add(disc);
      this._gps.discs.push(disc);
    }
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 1.8, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd24a })
    );
    arrow.rotation.x = Math.PI;
    arrow.visible = false;
    this.scene.add(arrow);
    this._gps.arrow = arrow;
  }

  // ---------- procedural meshes ----------
  _box(w, h, d, color, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    return m;
  }

  _wheel(r = 0.35) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.26, 10), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    w.rotation.z = Math.PI / 2;
    return w;
  }

  _buildCarMesh(specKey, spec, color) {
    const g = new THREE.Group();
    const wheels = [];
    const len = spec.len || 4.4, wid = spec.wid || 1.9;
    if (specKey === 'motor') {
      const body = this._box(0.34, 0.3, 1.9, color, 0, 0.72, 0);
      g.add(body);
      const seat = this._box(0.3, 0.12, 0.7, 0x1a1a1a, 0, 0.92, -0.35);
      g.add(seat);
      const tank = this._box(0.36, 0.28, 0.6, 0x222222, 0, 0.92, 0.3);
      g.add(tank);
      const bar = this._box(0.9, 0.07, 0.07, 0x888888, 0, 1.05, 0.75);
      g.add(bar);
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.14, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
      lamp.position.set(0, 0.8, 1.0);
      g.add(lamp);
      for (const wz of [0.85, -0.85]) {
        const w = this._wheel(0.36);
        w.position.set(0, 0.36, wz);
        g.add(w); wheels.push(w);
      }
      g.userData.wheels = wheels;
      return { group: g, wheels };
    }
    // body + cabin + glass band
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.72, len), bodyMat);
    body.position.y = 0.58;
    g.add(body);
    let cabinLen = len * 0.46, cabinZ = -len * 0.04;
    if (specKey === 'truck') { cabinLen = len * 0.28; cabinZ = len * 0.3; }
    if (specKey === 'van' || specKey === 'bus') { cabinLen = len * 0.8; cabinZ = 0; }
    if (specKey === 'pickup') { cabinLen = len * 0.34; cabinZ = len * 0.26; }
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.86, 0.6, cabinLen), bodyMat);
    cabin.position.set(0, 1.22, cabinZ);
    g.add(cabin);
    const glass = this._box(wid * 0.88, 0.3, cabinLen * 0.92, 0x18242e, 0, 1.3, cabinZ);
    g.add(glass);
    // headlights + taillights (emissive, glow at night)
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), hlMat);
      hl.position.set(sx * (wid / 2 - 0.35), 0.62, len / 2 + 0.01);
      g.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
      tl.position.set(sx * (wid / 2 - 0.35), 0.62, -len / 2 - 0.01);
      g.add(tl);
    }
    // variant dressing
    if (specKey === 'taxi') {
      g.add(this._box(0.9, 0.28, 0.5, 0xffd24a, 0, 1.68, cabinZ));
      g.add(this._box(wid + 0.02, 0.22, len * 0.9, 0x1a1a1a, 0, 0.72, 0));
    }
    if (specKey === 'police') {
      g.add(this._box(wid + 0.02, 0.3, len * 0.5, 0x1a2a3a, 0, 0.62, -len * 0.1));
      const rb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
      rb.position.set(-0.3, 1.58, cabinZ);
      g.add(rb);
      const bb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2d6bff }));
      bb.position.set(0.3, 1.58, cabinZ);
      g.add(bb);
    }
    if (specKey === 'sport' || specKey === 'sportster' || specKey === 'roadster' || specKey === 'mustang') {
      g.add(this._box(wid * 0.9, 0.08, 0.5, 0x1a1a1a, 0, 1.05, -len / 2 + 0.1));
    }
    if (specKey === 'truck') {
      g.add(this._box(wid * 0.96, 1.5, len * 0.5, 0x8a8f96, 0, 1.35, -len * 0.22));
    }
    if (specKey === 'pickup') {
      g.add(this._box(wid * 0.9, 0.5, len * 0.42, 0x222222, 0, 0.95, -len * 0.26));
    }
    if (specKey === 'ambulance') {
      g.add(this._box(0.5, 0.5, 0.1, 0xc23b3b, 0, 1.2, wid * 0.44));
      g.add(this._box(0.5, 0.5, 0.1, 0xc23b3b, 0, 1.2, -wid * 0.44));
    }
    if (specKey === 'firetruck') {
      g.add(this._box(0.3, 0.2, len * 0.7, 0xcccccc, 0, 1.65, 0));
    }
    if (specKey === 'bus') {
      g.add(this._box(wid * 0.9, 0.5, len * 0.8, 0x2b6cb0, 0, 1.3, 0));
    }
    for (const [wx, wz] of [[-wid / 2, len * 0.32], [wid / 2, len * 0.32], [-wid / 2, -len * 0.32], [wid / 2, -len * 0.32]]) {
      const w = this._wheel(0.36);
      w.position.set(wx, 0.36, wz);
      g.add(w); wheels.push(w);
    }
    g.userData.wheels = wheels;
    return { group: g, wheels };
  }

  _buildHeliMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshLambertMaterial({ color: 0x2b4a9e }));
    body.scale.set(1, 0.85, 1.5);
    body.position.y = 0.4;
    g.add(body);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 6), new THREE.MeshLambertMaterial({ color: 0x18242e }));
    glass.scale.set(0.9, 0.6, 0.9);
    glass.position.set(0, 0.5, 1.5);
    g.add(glass);
    const tail = this._box(0.5, 0.5, 4.5, 0x2b4a9e, 0, 0.5, -3.4);
    g.add(tail);
    const fin = this._box(0.15, 1.4, 1.0, 0x2b4a9e, 0, 1.2, -5.4);
    g.add(fin);
    for (const sx of [-1.4, 1.4]) {
      const skid = this._box(0.12, 0.12, 3.4, 0x333333, sx, -0.9, 0.4);
      g.add(skid);
      g.add(this._box(0.1, 0.7, 0.1, 0x333333, sx, -0.55, 1.2));
      g.add(this._box(0.1, 0.7, 0.1, 0x333333, sx, -0.55, -0.5));
    }
    const rotor = new THREE.Group();
    rotor.add(this._box(5.6, 0.08, 0.35, 0x222222, 0, 0, 0));
    rotor.add(this._box(0.35, 0.08, 5.6, 0x222222, 0, 0, 0));
    rotor.position.y = 1.9;
    g.add(rotor);
    const tailRotor = new THREE.Group();
    tailRotor.add(this._box(0.08, 2.0, 0.25, 0x222222, 0, 0, 0));
    tailRotor.position.set(0.35, 1.0, -5.4);
    g.add(tailRotor);
    // spotlight cone + light (police.js points them at the player)
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 9, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    cone.position.y = -5;
    cone.rotation.x = Math.PI;
    g.add(cone);
    g.userData.rotor = rotor;
    g.userData.cone = cone;
    return { group: g, rotor };
  }

  _buildBoatMesh() {
    const g = new THREE.Group();
    const hull = this._box(2.2, 0.9, 6, 0xe8e8e8, 0, 0.45, 0);
    g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 4), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.45, 4);
    bow.scale.set(1, 1, 0.6);
    g.add(bow);
    g.add(this._box(1.8, 0.7, 2.2, 0x2b6cb0, 0, 1.2, -0.8));
    g.add(this._box(1.6, 0.5, 0.5, 0x18242e, 0, 1.3, 0.4));
    const motor = this._box(0.5, 0.9, 0.5, 0x222222, 0, 0.5, -3.2);
    g.add(motor);
    return { group: g, wheels: [] };
  }

  _buildPlaneMesh() {
    const g = new THREE.Group();
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 8, 10), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    fus.rotation.x = Math.PI / 2;
    fus.position.y = 1.7;
    g.add(fus);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 6), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    nose.position.set(0, 1.7, 4);
    g.add(nose);
    g.add(this._box(11, 0.25, 1.8, 0x2b6cb0, 0, 1.7, 0.5));
    g.add(this._box(3.6, 0.2, 1.2, 0x2b6cb0, 0, 2.7, -3.8));
    g.add(this._box(0.2, 2.2, 1.6, 0xc23b3b, 0, 3.3, -3.8));
    const prop = new THREE.Group();
    prop.add(this._box(0.25, 3.2, 0.12, 0x333333, 0, 0, 0));
    prop.add(this._box(3.2, 0.25, 0.12, 0x333333, 0, 0, 0));
    prop.position.set(0, 1.7, 4.6);
    g.add(prop);
    const wheels = [];
    for (const [wx, wz] of [[-1.4, 1], [1.4, 1], [0, -3]]) {
      const w = this._wheel(0.34);
      w.position.set(wx, 0.34, wz);
      g.add(w); wheels.push(w);
    }
    g.userData.wheels = wheels;
    g.userData.prop = prop;
    return { group: g, wheels, prop };
  }

  // ---------- spawning ----------
  spawn(specKey, x, z, heading, opts = {}) {
    let mesh, kind = opts.kind || 'car';
    let len = 4.4, wid = 1.9, top = 26, accel = 12, turn = 1.6;
    if (specKey === 'boat' || kind === 'boat') {
      kind = 'boat';
      mesh = this._buildBoatMesh();
      len = 6; wid = 2.2; top = 18; accel = 10;
    } else if (specKey === 'plane' || kind === 'plane') {
      kind = 'plane';
      mesh = this._buildPlaneMesh();
      len = 9; wid = 11; top = 45; accel = 14;
    } else if (specKey === 'heli' || kind === 'heli') {
      kind = 'heli';
      mesh = this._buildHeliMesh();
      len = 4; wid = 2.4; top = 30; accel = 12;
    } else {
      const spec = CAR_MODELS[specKey] || CAR_MODELS.sedan;
      const color = opts.color || pick(this.rng, spec.colors || [0xcccccc]);
      mesh = this._buildCarMesh(specKey, spec, color);
      len = spec.len || 4.4; wid = spec.wid || 1.9;
      top = spec.top || 26; accel = spec.accel || 12; turn = spec.turn || 1.6;
      if (specKey === 'motor') turn = (spec.turn || 1.6) * 1.5;
    }
    const car = {
      specKey, kind, len, wid,
      baseTop: top, top, baseAccel: accel, accel, turn,
      x, z, y: groundHeight(x, z), heading, speed: 0,
      fuel: 100, cond: 100, maxCond: 100, nitro: 100, maxNitro: 100,
      stalled: false, dead: false, traffic: !!opts.traffic,
      group: mesh.group, wheels: mesh.wheels || [],
      rotor: mesh.rotor || null, prop: mesh.prop || null,
      driverFled: false, hot: false, hotWanted: 0,
      _burning: false, _burnT: 0, _wreckT: 0, _fireMeshes: null, _vy: 0,
      upgEngine: 0, upgArmor: 0, upgNitro: 0,
      color: opts.color || 0xcccccc,
    };
    car.damage = (n) => {
      if (car.dead) return;
      car.cond -= n;
      if (car.cond <= 0) { car.cond = 0; this._startBurning(car); }
    };
    car.group.position.set(x, car.y, z);
    car.group.rotation.y = heading;
    if (kind === 'heli') { car.y = 0.9; car.group.position.y = 0.9; }
    if (kind === 'boat') { car.y = -0.1; car.group.position.y = -0.1; }
    this.scene.add(car.group);
    this.cars.push(car);
    if (opts.traffic) this.traffic.push(car);
    else if (opts.parked) this.parkedCars.push(car);
    return car;
  }

  spawnTraffic(n) {
    const set = ['sedan', 'suv', 'truck', 'sport', 'pickup', 'taxi', 'van', 'bus', 'motor'];
    for (let i = 0; i < n; i++) {
      const axis = this.rng() < 0.5 ? 'ns' : 'ew';
      const road = pick(this.rng, ROADS);
      const dir = this.rng() < 0.5 ? 1 : -1;
      const pos = 12 + this.rng() * 236;
      const x = axis === 'ns' ? road : pos;
      const z = axis === 'ns' ? pos : road;
      const heading = axis === 'ns' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const car = this.spawn(pick(this.rng, set), x, z, heading, { traffic: true });
      car.route = { axis, dir, road };
      car.speed = 8 + this.rng() * 6;
      car.targetSpeed = car.speed;
    }
  }

  spawnParked(n) {
    const set = ['sedan', 'suv', 'sport', 'pickup', 'taxi', 'convertible', 'mustang', 'hatch', 'roadster', 'motor'];
    for (let i = 0; i < n; i++) {
      const axis = this.rng() < 0.5 ? 'ns' : 'ew';
      const road = pick(this.rng, ROADS);
      const dir = this.rng() < 0.5 ? 1 : -1;
      const pos = 14 + this.rng() * 232;
      const off = (this.rng() < 0.5 ? -1 : 1) * 6.2;
      const x = axis === 'ns' ? road + off : pos;
      const z = axis === 'ns' ? pos : road + off;
      const heading = axis === 'ns' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.spawn(pick(this.rng, set), x, z, heading, { parked: true });
    }
  }

  _spawnBoats() {
    this.spawn('boat', 6, 120, 0.5);
    this.spawn('boat', 5, 145, -0.5);
  }

  _spawnPlanes() {
    this.spawn('plane', 335, 95, 0);
    this.spawn('plane', 335, 165, Math.PI);
    // civilian heli at the airport — the player can fly it
    this.spawn('heli', 345, 150, 0, { kind: 'heli' });
  }

  _spawnWeaponPickups() {
    const spots = [
      { id: 'pistol', x: 140, z: 124 }, { id: 'smg', x: 150, z: 120 },
      { id: 'shotgun', x: 8, z: 140 }, { id: 'rifle', x: 330, z: 140 },
      { id: 'pistol', x: 104, z: 85 }, { id: 'smg', x: 23, z: 90 },
    ];
    for (const s of spots) {
      const g = new THREE.Group();
      const gun = this._gunMesh(s.id, 1.6);
      gun.position.y = 1.0;
      g.add(gun);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.9, 0.07, 6, 20),
        new THREE.MeshBasicMaterial({ color: 0xffd24a })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      g.add(ring);
      g.position.set(s.x, 0, s.z);
      this.scene.add(g);
      this.pickups.push({ ...s, mesh: g, gun, active: true, respawnT: 0 });
    }
  }

  _gunMesh(id, scale = 1) {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a1c20 });
    const mid = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
    if (id === 'pistol') {
      g.add(this._box(0.09, 0.16, 0.34, 0x1a1c20, 0, 0, 0, dark));
      g.add(this._box(0.07, 0.14, 0.07, 0x1a1c20, 0, -0.13, -0.1, dark));
    } else if (id === 'smg') {
      g.add(this._box(0.09, 0.14, 0.55, 0x1a1c20, 0, 0, 0, dark));
      g.add(this._box(0.06, 0.22, 0.08, 0x1a1c20, 0, -0.16, 0.05, dark));
      g.add(this._box(0.07, 0.1, 0.2, 0x3a3f47, 0, 0, -0.2, mid));
    } else if (id === 'shotgun') {
      g.add(this._box(0.1, 0.14, 0.7, 0x1a1c20, 0, 0, 0, dark));
      g.add(this._box(0.08, 0.08, 0.5, 0x6b4f2a, 0, -0.08, 0.1, new THREE.MeshLambertMaterial({ color: 0x6b4f2a })));
      g.add(this._box(0.09, 0.12, 0.12, 0x3a3f47, 0, -0.02, -0.3, mid));
    } else { // rifle
      g.add(this._box(0.09, 0.14, 0.85, 0x1a1c20, 0, 0, 0, dark));
      g.add(this._box(0.07, 0.2, 0.09, 0x1a1c20, 0, -0.15, 0.1, dark));
      g.add(this._box(0.08, 0.1, 0.3, 0x3a3f47, 0, -0.02, -0.3, mid));
      g.add(this._box(0.06, 0.08, 0.16, 0x1a1c20, 0, 0.1, -0.05, dark));
    }
    g.scale.setScalar(scale);
    return g;
  }

  _buildPads() {
    const defs = [
      { kind: 'weapon', id: 'pistol', x: 138, z: 127, price: WEAPON_PRICES.pistol, label: 'PISTOL $600', color: 0x2b6cb0 },
      { kind: 'weapon', id: 'smg', x: 142, z: 127, price: WEAPON_PRICES.smg, label: 'SMG $1500', color: 0x2b6cb0 },
      { kind: 'weapon', id: 'shotgun', x: 146, z: 127, price: WEAPON_PRICES.shotgun, label: 'SHOTGUN $2500', color: 0x2b6cb0 },
      { kind: 'weapon', id: 'rifle', x: 150, z: 127, price: WEAPON_PRICES.rifle, label: 'RIFLE $4000', color: 0x2b6cb0 },
      { kind: 'upgrade', id: 'engine', x: 70, z: 150, price: 800, label: 'ENGINE +20%', color: 0x2b6cb0 },
      { kind: 'upgrade', id: 'armor', x: 86, z: 150, price: 600, label: 'ARMOR +50', color: 0x2f9e44 },
      { kind: 'upgrade', id: 'nitro', x: 78, z: 166, price: 500, label: 'NITRO +50', color: 0xd9a441 },
    ];
    for (const d of defs) {
      const decal = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.15, 2.6),
        new THREE.MeshLambertMaterial({ color: d.color, transparent: true, opacity: 0.85 })
      );
      decal.position.set(d.x, 0.15, d.z);
      this.scene.add(decal);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      pole.position.set(d.x + 1.2, 1.2, d.z + 1.2);
      this.scene.add(pole);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: signTexture(d.label) }));
      sign.position.set(d.x + 1.2, 2.6, d.z + 1.2);
      sign.rotation.y = Math.PI / 4;
      this.scene.add(sign);
      this._pads = this._pads || [];
      this._pads.push(d);
      this._padMeshes.push(decal);
    }
    this._pads = this._pads || [];
  }

  // ---------- enter / exit ----------
  nearestCar(x, z, maxD) {
    let best = null, bestD = maxD;
    const policeHeli = this.game.police && this.game.police.heli ? this.game.police.heli.car : null;
    for (const car of this.cars) {
      if (car.dead) continue;
      // the police heli is not enterable; the civilian airport heli is
      if (car.kind === 'heli' && car === policeHeli) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best ? { car: best, dist: bestD } : null;
  }

  tryEnterNearest(player) {
    const near = this.nearestCar(player.x, player.z, 4.5);
    if (!near) return false;
    const car = near.car;
    if (car.traffic) {
      car.driverFled = true;
      this.traffic = this.traffic.filter((c) => c !== car);
      car.traffic = false;
    }
    this.parkedCars = this.parkedCars.filter((c) => c !== car);
    this.playerCar = car;
    player.inCar = true;
    player.inBoat = car.kind === 'boat';
    player.inHeli = car.kind === 'heli';
    player.inPlane = car.kind === 'plane';
    player.x = car.x; player.z = car.z; player.heading = car.heading;
    car.hot = true;
    const police = this.game.police;
    if (car.hotWanted && police) police.setWanted(car.hotWanted, 'the LVPD recognised the car');
    else if (police) police.addHeat(1, 'carjacking');
    return true;
  }

  exitCar() {
    const car = this.playerCar;
    if (!car) return;
    const p = this.game.player;
    const police = this.game.police;
    if (police && police.wanted > 0) car.hotWanted = police.wanted;
    if (p) {
      p.x = car.x + Math.cos(car.heading) * 2.2;
      p.z = car.z - Math.sin(car.heading) * 2.2;
      p.inCar = false; p.inBoat = false; p.inHeli = false; p.inPlane = false;
      p.heading = car.heading;
    }
    if (!car.dead && !car.traffic) this.parkedCars.push(car);
    this.playerCar = null;
  }

  // ---------- collisions (also called by police.js for cruisers) ----------
  _collideBuildings(car) {
    if (!this.game.city || !this.game.city.colliders) return;
    if (car.kind === 'boat') return;
    if (car.kind === 'plane' && car.y > 10) return;
    const halfW = (car.wid || 1.9) / 2 * 0.85;
    for (const c of this.game.city.colliders) {
      const dx = car.x - c.x, dz = car.z - c.z;
      const d = Math.hypot(dx, dz);
      const minD = c.r + halfW;
      if (d < minD && d > 0.001) {
        const overlap = minD - d;
        const nx = dx / d, nz = dz / d;
        // damped push-out: full correction is small (<= speed*dt) and the
        // velocity into the collider is killed, so no snap / oscillation.
        car.x += nx * overlap;
        car.z += nz * overlap;
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        if (fx * nx + fz * nz < 0) car.speed *= 0.5;
      }
    }
  }

  // ---------- exploding cars (D) ----------
  _startBurning(car) {
    if (car._burning || car.dead) return;
    car._burning = true;
    car._burnT = 0;
    const fire = [];
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.5 + Math.random() * 0.3, 1.6, 6),
        new THREE.MeshBasicMaterial({ color: i === 0 ? 0xff6b1a : 0xffd24a })
      );
      cone.position.set((Math.random() - 0.5) * 1.5, 1.4, (Math.random() - 0.5) * 2);
      car.group.add(cone);
      fire.push(cone);
    }
    for (let i = 0; i < 2; i++) {
      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.55 })
      );
      smoke.position.set((Math.random() - 0.5) * 1.5, 2.4 + i * 0.7, (Math.random() - 0.5) * 2);
      car.group.add(smoke);
      fire.push(smoke);
    }
    car._fireMeshes = fire;
    if (car === this.playerCar && this.game.hud) this.game.hud.notify('Your car is on fire — get out!');
  }

  _explode(car) {
    if (car._fireMeshes) for (const m of car._fireMeshes) car.group.remove(m);
    car._fireMeshes = null;
    car.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.color) o.material.color.setHex(0x141414);
    });
    car.dead = true;
    car._burning = false;
    car._wreckT = 0;
    car.speed = 0;
    this.traffic = this.traffic.filter((c) => c !== car);
    this.parkedCars = this.parkedCars.filter((c) => c !== car);
    if (car === this.playerCar) {
      const p = this.game.player;
      this.exitCar();
      if (p) p.health = Math.max(0, (p.health ?? 100) - 25);
      if (this.game.hud) this.game.hud.notify('Your car exploded!');
    }
  }

  // ---------- per-frame ----------
  update(dt) {
    this._t += dt;
    const g = this.game;
    const p = g.player;
    const input = g.input || {};
    const city = g.city;
    const weather = g.weather;
    const night = weather && typeof weather.isNight === 'function' ? weather.isNight() : false;

    // ----- player vehicle physics (car / motor / boat / plane / heli) -----
    const car = this.playerCar;
    if (car && p) {
      const grip = weather && typeof weather.gripFactor === 'function' ? weather.gripFactor() : 1;
      if (car.kind === 'heli') {
        // helicopter: gas = climb + forward, brake = descend, left/right = turn
        const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        car.heading -= steer * 1.1 * dt * clamp(Math.abs(car.speed) / 6 + 0.3, 0, 1);
        if (input.gas) { car.speed = Math.min(car.speed + car.accel * dt, car.top); car.y += dt * 3.2; }
        else if (input.brake) { car.speed = Math.max(car.speed - 20 * dt, 0); car.y -= dt * 3.5; }
        else { car.speed = damp(car.speed, 0, 0.4, dt); car.y -= dt * 0.8; }
        car.y = clamp(car.y, 0.9, 120);
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        car.x = clamp(car.x, 4, 396); car.z = clamp(car.z, 4, 396);
        if (car.rotor) car.rotor.rotation.y += dt * 22;
      } else if (car.kind === 'plane') {
        const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const airborne = car.y > 0.5;
        car.heading -= steer * car.turn * 0.55 * dt * clamp(Math.abs(car.speed) / 10, 0, 1) * (car.speed < 0 ? -1 : 1) * grip;
        if (input.gas) car.speed = Math.min(car.speed + car.accel * dt, car.top);
        else if (input.brake) car.speed = Math.max(car.speed - 22 * dt, airborne ? 12 : -8);
        else car.speed = damp(car.speed, 0, 0.25, dt);
        if (airborne) {
          if (input.gas) car._vy = 3 + (car.speed - 25) * 0.12;
          else if (input.brake) car._vy = -4;
          else car._vy = -1.5;
          car.y = clamp(car.y + car._vy * dt, 0, 120);
          if (car.y <= 0) { car.y = 0; car._vy = 0; }
        } else if (input.gas && car.speed > 25) {
          car.y += dt * 2; // lift-off
        }
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        car.x = clamp(car.x, 31, 396); car.z = clamp(car.z, 4, 396);
        if (car.y <= 0) car.y = 0;
        if (car.prop) car.prop.rotation.z += dt * (4 + car.speed * 0.8);
        car.group.rotation.x = clamp(-car._vy * 0.03, -0.18, 0.12);
      } else if (car.kind === 'boat') {
        const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        car.heading -= steer * car.turn * 0.6 * dt * clamp(Math.abs(car.speed) / 6, 0, 1) * (car.speed < 0 ? -1 : 1);
        if (input.gas) car.speed = Math.min(car.speed + car.accel * dt, car.top);
        else if (input.brake) car.speed = Math.max(car.speed - 18 * dt, -6);
        else car.speed = damp(car.speed, 0, 0.5, dt);
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        // boats stay in the sea
        if (car.x < 2) { car.x = 2; car.speed *= 0.5; }
        if (car.x > 14.5) { car.x = 14.5; car.speed *= 0.5; }
        car.z = clamp(car.z, 4, 396);
        car.y = -0.1 + 0.08 * Math.sin(this._t * 1.5 + car.x);
      } else {
        // ground car / motorbike — D turns right, A turns left (verified)
        const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const sf = clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed < 0 ? -1 : 1);
        car.heading -= steer * car.turn * dt * sf * grip;
        let acc = car.accel;
        if (input.nitro && car.nitro > 0 && car.speed > 1) { acc *= 1.7; car.nitro = Math.max(0, car.nitro - 25 * dt); }
        else car.nitro = Math.min(car.maxNitro, car.nitro + 5 * dt);
        if (car.stalled) {
          car.speed = damp(car.speed, 0, 1.2, dt);
        } else if (input.gas) {
          car.speed = Math.min(car.speed + acc * dt, car.top);
        } else if (input.brake) {
          car.speed = car.speed > 0.5 ? Math.max(0, car.speed - 30 * dt) : Math.max(-8, car.speed - 10 * dt);
        } else {
          car.speed = damp(car.speed, 0, 0.4, dt);
        }
        if (input.handbrake) car.speed = damp(car.speed, 0, 3, dt);
        car.fuel -= 0.015 * Math.abs(car.speed) * dt;
        if (car.fuel <= 0) { car.fuel = 0; car.stalled = true; }
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        // BEACH BAN (item 2/16): no car may enter the sand / water / pier.
        // Cars stay on roads: x >= 31 (the sand edge is x = 30).
        if (car.x < 31) { car.x = 31; if (Math.sin(car.heading) < 0) car.speed *= 0.5; }
        car.x = clamp(car.x, 31, 396);
        car.z = clamp(car.z, 4, 396);
        car.y = groundHeight(car.x, car.z);
        this._collideBuildings(car);
        // red-light violation: player runs a red with police nearby
        this._checkPlayerRedLight(car);
      }
      // sync the player to the vehicle
      p.x = car.x; p.z = car.z; p.y = car.y;
      p.heading = car.heading;
      p.speed = car.speed;
      car.group.position.set(car.x, car.y, car.z);
      car.group.rotation.y = car.heading;
      // headlight follows the player car at night
      if (this._headlight) {
        const s = this._headlight;
        if (night && car.kind !== 'boat') {
          s.intensity = 60;
          s.position.set(car.x + Math.sin(car.heading) * car.len * 0.5, car.y + 1.2, car.z + Math.cos(car.heading) * car.len * 0.5);
          s.target.position.set(car.x + Math.sin(car.heading) * 22, 0, car.z + Math.cos(car.heading) * 22);
        } else s.intensity = 0;
      }
    } else if (this._headlight) this._headlight.intensity = 0;

    // ----- traffic AI: follows roads, obeys real traffic lights -----
    for (const t of this.traffic) {
      if (t.dead || t._burning) continue;
      const r = t.route;
      if (!r) continue;
      // lane: right-hand traffic
      const lane = r.axis === 'ns' ? r.road - r.dir * 2.2 : r.road + r.dir * 2.2;
      let target = t.targetSpeed || 12;
      // traffic light ahead (nearest lit intersection within 12 m)
      const ahead = this._lightAhead(t);
      if (ahead) {
        if (ahead.state === 'red') {
          // stop at the stop line (6 m before the centre); if already
          // past it (inside the intersection), keep going — never stop
          // in the middle of the crossing
          if (ahead.dist > 6) target = 0;
        } else if (ahead.state === 'yellow') {
          if (ahead.dist > 9) target = 0;
        }
      }
      // car ahead in the same lane: follow / stop
      for (const o of this.traffic) {
        if (o === t || o.dead) continue;
        if (o.route && o.route.axis === r.axis && o.route.road === r.road && o.route.dir === r.dir) {
          const gap = r.axis === 'ns' ? (o.z - t.z) * r.dir : (o.x - t.x) * r.dir;
          if (gap > 0 && gap < 8) { target = Math.min(target, o.speed); if (gap < 3.5) target = 0; }
        }
      }
      // player car ahead in the same lane
      if (car && car.kind !== 'boat' && car.kind !== 'plane' && car.kind !== 'heli') {
        const gap = r.axis === 'ns' ? (car.z - t.z) * r.dir : (car.x - t.x) * r.dir;
        const lat = r.axis === 'ns' ? Math.abs(car.x - lane) : Math.abs(car.z - lane);
        if (gap > 0 && gap < 8 && lat < 3) { target = Math.min(target, car.speed); if (gap < 3.5) target = 0; }
      }
      t.speed = damp(t.speed, target, 1.2, dt);
      if (r.axis === 'ns') { t.z += r.dir * t.speed * dt; t.x = lane; }
      else { t.x += r.dir * t.speed * dt; t.z = lane; }
      // wrap around the grid edge: re-enter from the opposite end of the
      // same road (same lane, no lateral jump)
      if (r.axis === 'ns' && (t.z > 258 || t.z < 2)) {
        t.z = t.z > 258 ? 2 : 258;
        t.speed = 8 + this.rng() * 6;
      }
      if (r.axis === 'ew' && (t.x > 258 || t.x < 2)) {
        t.x = t.x > 258 ? 2 : 258;
        t.speed = 8 + this.rng() * 6;
      }
      t.group.position.set(t.x, groundHeight(t.x, t.z), t.z);
      t.group.rotation.y = t.heading;
      this._collideBuildings(t);
    }

    // ----- car-car collisions (incl. PIT: side impact spins the target) -----
    const movers = this.cars.filter((c) => !c.dead && c.kind !== 'heli' && c.kind !== 'boat');
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i], b = movers[j];
        if (a.y > 10 || b.y > 10) continue; // airborne planes don't collide
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const minD = (a.len + b.len) / 2 * 0.72;
        if (d < minD && d > 0.001) {
          const nx = dx / d, nz = dz / d;
          const overlap = (minD - d) / 2;
          a.x -= nx * overlap; a.z -= nz * overlap;
          b.x += nx * overlap; b.z += nz * overlap;
          const rel = Math.abs(a.speed - b.speed);
          if (rel > 3) {
            a.damage(2 + rel * 0.15);
            b.damage(2 + rel * 0.15);
            // PIT: a side hit on a moving car kicks its heading
            const sideA = Math.abs(Math.sin(a.heading) * nz - Math.cos(a.heading) * nx);
            if (Math.abs(a.speed) > 6 && sideA > 0.5) a.heading += (this.rng() < 0.5 ? 1 : -1) * 0.35;
            const sideB = Math.abs(Math.sin(b.heading) * nz - Math.cos(b.heading) * nx);
            if (Math.abs(b.speed) > 6 && sideB > 0.5) b.heading += (this.rng() < 0.5 ? 1 : -1) * 0.35;
            a.speed *= 0.6; b.speed *= 0.6;
          } else {
            a.speed *= 0.85; b.speed *= 0.85;
          }
          a.group.position.set(a.x, a.y, a.z);
          b.group.position.set(b.x, b.y, b.z);
          a.group.rotation.y = a.heading;
          b.group.rotation.y = b.heading;
        }
      }
    }

    // ----- car vs pedestrian (player car only) -----
    if (car && Math.abs(car.speed) > 3 && g.characters && g.characters.npcs) {
      for (const n of g.characters.npcs) {
        if (!n || n.state === 'dying' || n.dead) continue;
        if (Math.hypot(n.x - car.x, n.z - car.z) < 2.2) {
          n.state = 'dying'; n.deadT = 0; n.health = 0;
          car.damage(2);
          car.speed *= 0.7;
          if (g.police) g.police.addHeat(1, 'hit pedestrian');
        }
      }
    }

    // ----- burning / wreck lifecycle -----
    for (const c of this.cars) {
      if (c._burning) {
        c._burnT += dt;
        if (c._fireMeshes) for (const m of c._fireMeshes) m.scale.y = 0.8 + Math.random() * 0.5;
        if (c._burnT > 2.5) this._explode(c);
      } else if (c.dead) {
        c._wreckT += dt;
        if (c._wreckT > 60) {
          this.scene.remove(c.group);
          this.cars = this.cars.filter((x) => x !== c);
        }
      }
      // wheels spin with speed; heli rotors spin
      if (c.rotor) c.rotor.rotation.y += dt * 22;
      for (const w of c.wheels || []) w.rotation.x += (c.speed * dt) / 0.35;
    }

    // ----- police heli rotor sound (WebAudio synth, no files) -----
    this._updateRotorAudio();
    // ----- world systems: pickups, hand weapon, HUD, GPS, pads, interiors -----
    this._updateWorldSystems(dt);
  }

  _updateWorldSystems(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    // ----- weapon pickups: bob + spin + collect + respawn -----
    for (const pk of this.pickups) {
      if (pk.active) {
        pk.mesh.rotation.y += dt * 1.2;
        pk.gun.position.y = 1.0 + 0.15 * Math.sin(this._t * 2 + pk.x);
        if (!p.inCar && Math.hypot(p.x - pk.x, p.z - pk.z) < 1.8) {
          const w = WEAPONS[pk.id];
          const ammo = (w && w.mag) || 30;
          if (typeof p.giveWeapon === 'function') p.giveWeapon(pk.id, ammo);
          if (typeof p.setWeapon === 'function') p.setWeapon(pk.id);
          if (g.hud) g.hud.notify(`Picked up ${WEAPON_NAMES[pk.id] || pk.id}!`);
          pk.active = false;
          pk.respawnT = 90;
          pk.mesh.visible = false;
        }
      } else {
        pk.respawnT -= dt;
        if (pk.respawnT <= 0) { pk.active = true; pk.mesh.visible = true; }
      }
    }
    // ----- hand weapon mesh follows the equipped weapon -----
    this._syncHandWeapon();
    // ----- always-on weapon HUD (item 15) -----
    this._updateWeaponHUD();
    // ----- GPS route to the active mission target -----
    this._updateGPS(dt);
    // ----- buy / upgrade pads (3 s channel) -----
    this._updatePads(dt);
    // ----- enterable interiors (teleport in / out) -----
    this._updateInteriors(dt);
  }

  _syncHandWeapon() {
    const p = this.game.player;
    if (!p || !p.parts || !p.parts.armR) return;
    const id = p.weapon || 'fists';
    const show = id !== 'fists' && !p.inCar;
    if (!show) {
      if (this._handWeapon) { this._handWeapon.visible = false; }
      return;
    }
    if (!this._handWeapon || this._handWeaponId !== id || this._handWeaponFor !== p) {
      if (this._handWeapon && this._handWeapon.parent) this._handWeapon.parent.remove(this._handWeapon);
      const mesh = this._gunMesh(id, 1.0);
      mesh.position.set(0, -0.62, 0.12);
      mesh.rotation.x = Math.PI / 2;
      p.parts.armR.add(mesh);
      this._handWeapon = mesh;
      this._handWeaponId = id;
      this._handWeaponFor = p;
    }
    this._handWeapon.visible = true;
  }

  _weaponAmmo(p, id) {
    const w = p.weapons ? p.weapons[id] : undefined;
    if (typeof w === 'number') return { mag: w, reserve: null };
    if (w && typeof w === 'object') return { mag: w.ammo ?? w.mag ?? w.current ?? null, reserve: w.reserve ?? w.total ?? null };
    if (p.ammo && typeof p.ammo[id] === 'number') return { mag: p.ammo[id], reserve: null };
    return { mag: null, reserve: null };
  }

  _updateWeaponHUD() {
    const el = this._hudEl;
    if (!el) return;
    const p = this.game.player;
    if (!p) return;
    const id = p.weapon || 'fists';
    const name = (WEAPONS[id] && WEAPONS[id].name) || WEAPON_NAMES[id] || String(id).toUpperCase();
    const a = this._weaponAmmo(p, id);
    const ammoText = id === 'fists' ? '—' : (a.mag === null ? '—' : (a.mag === 0 ? 'KOSONG' : `${a.mag}${a.reserve !== null ? ' / ' + a.reserve : ''}`));
    const owned = p.weapons ? Object.keys(p.weapons) : [];
    if (!owned.includes(id)) owned.push(id);
    const key = `${id}|${ammoText}|${owned.join(',')}`;
    if (key === this._hudLast) return;
    this._hudLast = key;
    const nameEl = el.querySelector('#lv-w-name');
    const ammoEl = el.querySelector('#lv-w-ammo');
    const slotsEl = el.querySelector('#lv-w-slots');
    if (nameEl) nameEl.textContent = name;
    if (ammoEl) {
      ammoEl.textContent = `Ammo: ${ammoText}`;
      ammoEl.style.color = ammoText === 'KOSONG' ? '#ff5d5d' : '#fff';
    }
    if (slotsEl) {
      slotsEl.innerHTML = '';
      for (const w of owned) {
        const chip = document.createElement('span');
        const wName = (WEAPONS[w] && WEAPONS[w].name) || WEAPON_NAMES[w] || String(w).toUpperCase();
        chip.textContent = wName;
        chip.style.cssText = w === id
          ? 'background:#ffd24a;color:#111;font-weight:700;font-size:11px;padding:2px 7px;border-radius:20px'
          : 'background:rgba(255,255,255,0.14);color:#ddd;font-size:11px;padding:2px 7px;border-radius:20px';
        slotsEl.appendChild(chip);
      }
    }
  }

  _updateGPS(dt) {
    const gps = this._gps;
    gps.timer -= dt;
    const g = this.game;
    const p = g.player;
    // find the active mission target
    let target = null;
    const m = g.missions;
    if (m && m.current) {
      const step = m.current.step || m.current.steps?.[m.current.stepIndex || 0];
      target = (step && (step.target || step.pos)) || m.current.target || null;
      if (target && typeof target.x !== 'number') target = null;
    }
    if (!target || !p) {
      for (const d of gps.discs) d.visible = false;
      if (gps.arrow) gps.arrow.visible = false;
      gps.target = null;
      return;
    }
    if (gps.timer > 0 && gps.target && Math.hypot(gps.target.x - target.x, gps.target.z - target.z) < 5) return;
    gps.timer = 2;
    gps.target = { x: target.x, z: target.z };
    // Manhattan path via the road grid (two L-shaped options, pick shorter)
    const pathA = [{ x: p.x, z: p.z }, { x: this._nearestRoad(p.x), z: p.z }, { x: this._nearestRoad(p.x), z: target.z }, { x: target.x, z: target.z }];
    const pathB = [{ x: p.x, z: p.z }, { x: p.x, z: this._nearestRoad(p.z) }, { x: target.x, z: this._nearestRoad(p.z) }, { x: target.x, z: target.z }];
    const lenA = this._pathLen(pathA), lenB = this._pathLen(pathB);
    const path = lenA <= lenB ? pathA : pathB;
    const pts = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.floor(seg / 6));
      for (let k = 0; k < n; k++) {
        pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
      }
    }
    pts.push({ x: target.x, z: target.z });
    const shown = pts.slice(0, gps.discs.length);
    gps.discs.forEach((d, i) => {
      if (i < shown.length) {
        d.position.set(shown[i].x, 0.16, shown[i].z);
        d.visible = true;
      } else d.visible = false;
    });
    if (gps.arrow) {
      gps.arrow.visible = true;
      gps.arrow.position.set(target.x, 3 + 0.4 * Math.sin(this._t * 2), target.z);
    }
  }

  _pathLen(path) {
    let s = 0;
    for (let i = 0; i < path.length - 1; i++) s += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
    return s;
  }

  _updatePads(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    const el = this._channelEl;
    let active = null;
    for (const pad of this._pads || []) {
      if (pad.kind === 'weapon') {
        if (p.inCar) continue;
        if (Math.hypot(p.x - pad.x, p.z - pad.z) < 1.8) { active = pad; break; }
      } else {
        const car = this.playerCar;
        if (!car) continue;
        if (Math.abs(car.speed) > 1) continue;
        if (Math.hypot(car.x - pad.x, car.z - pad.z) < 2.5) { active = pad; break; }
      }
    }
    if (!active) {
      if (this._padChannel) { this._padChannel = null; if (el) el.style.display = 'none'; }
      return;
    }
    if (!this._padChannel || this._padChannel.id !== active.id) {
      this._padChannel = { id: active.id, kind: active.kind, t: 0, total: 3 };
    }
    const ch = this._padChannel;
    ch.t += dt;
    if (el) {
      el.style.display = 'block';
      const label = el.querySelector('#lv-c-label');
      const bar = el.querySelector('#lv-c-bar');
      const owned = active.kind === 'weapon' && p.weapons && p.weapons[active.id] !== undefined;
      const price = owned ? Math.ceil(active.price * 0.25) : active.price;
      if (label) label.textContent = owned ? `Isi ulang ${active.label} — $${price}` : `Beli ${active.label} — $${price}`;
      if (bar) bar.style.width = `${Math.min(100, (ch.t / ch.total) * 100)}%`;
    }
    if (ch.t >= ch.total) {
      this._padChannel = null;
      if (el) el.style.display = 'none';
      this._applyPad(active);
    }
  }

  _applyPad(pad) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    if (pad.kind === 'weapon') {
      const owned = p.weapons && p.weapons[pad.id] !== undefined;
      const price = owned ? Math.ceil(pad.price * 0.25) : pad.price;
      if ((p.money ?? 0) < price) {
        if (g.hud) g.hud.notify(`Butuh $${price} untuk ${pad.label}`);
        return;
      }
      p.money -= price;
      const w = WEAPONS[pad.id];
      const ammo = (w && w.mag) || 30;
      if (typeof p.giveWeapon === 'function') p.giveWeapon(pad.id, ammo);
      if (typeof p.setWeapon === 'function') p.setWeapon(pad.id);
      if (g.hud) g.hud.notify(owned ? `${pad.label} diisi ulang!` : `${pad.label} dibeli — cek HUD senjata!`);
    } else {
      const car = this.playerCar;
      if (!car) return;
      if ((p.money ?? 0) < pad.price) {
        if (g.hud) g.hud.notify(`Butuh $${pad.price} untuk upgrade ${pad.label}`);
        return;
      }
      p.money -= pad.price;
      if (pad.id === 'engine') {
        car.upgEngine++;
        car.top = car.baseTop * (1 + 0.2 * car.upgEngine);
        car.accel = car.baseAccel * (1 + 0.15 * car.upgEngine);
        if (g.hud) g.hud.notify(`Mesin Lv${car.upgEngine} — top speed ${Math.round(car.top)}!`);
      } else if (pad.id === 'armor') {
        car.upgArmor++;
        car.maxCond += 50;
        car.cond = car.maxCond;
        if (g.hud) g.hud.notify(`Armor Lv${car.upgArmor} — kondisi ${car.maxCond}!`);
      } else if (pad.id === 'nitro') {
        car.upgNitro++;
        car.maxNitro += 50;
        car.nitro = car.maxNitro;
        if (g.hud) g.hud.notify(`Nitro Lv${car.upgNitro} — kapasitas ${car.maxNitro}!`);
      }
    }
  }

  _updateInteriors(dt) {
    const g = this.game;
    const p = g.player;
    const city = g.city;
    if (!p || !city || !city.interiors) return;
    const el = this._channelEl;
    if (p.inCar) {
      if (this._interiorChannel) { this._interiorChannel = null; if (el && !this._padChannel) el.style.display = 'none'; }
      return;
    }
    if (!this._inside) {
      // standing at a shop door → enter
      for (const room of city.interiors) {
        if (Math.hypot(p.x - room.door.x, p.z - room.door.z) < 2) {
          if (!this._interiorChannel || this._interiorChannel.key !== `enter:${room.name}`) {
            this._interiorChannel = { key: `enter:${room.name}`, t: 0, total: 1.5 };
          }
          const ch = this._interiorChannel;
          ch.t += dt;
          if (el) {
            el.style.display = 'block';
            const label = el.querySelector('#lv-c-label');
            const bar = el.querySelector('#lv-c-bar');
            if (label) label.textContent = `Masuk ${room.name}…`;
            if (bar) bar.style.width = `${Math.min(100, (ch.t / ch.total) * 100)}%`;
          }
          if (ch.t >= ch.total) {
            this._interiorChannel = null;
            if (el) el.style.display = 'none';
            p.x = room.room.x; p.z = room.room.z;
            this._inside = room;
            if (g.hud) g.hud.notify(`Kamu di dalam ${room.name} — keluar lewat pintu.`);
          }
          return;
        }
      }
      if (this._interiorChannel) { this._interiorChannel = null; if (el && !this._padChannel) el.style.display = 'none'; }
    } else {
      // standing at the room's exit door → leave
      const room = this._inside;
      if (Math.hypot(p.x - room.exit.x, p.z - room.exit.z) < 2) {
        if (!this._interiorChannel || this._interiorChannel.key !== `exit:${room.name}`) {
          this._interiorChannel = { key: `exit:${room.name}`, t: 0, total: 1.5 };
        }
        const ch = this._interiorChannel;
        ch.t += dt;
        if (el) {
          el.style.display = 'block';
          const label = el.querySelector('#lv-c-label');
          const bar = el.querySelector('#lv-c-bar');
          if (label) label.textContent = 'Keluar…';
          if (bar) bar.style.width = `${Math.min(100, (ch.t / ch.total) * 100)}%`;
        }
        if (ch.t >= ch.total) {
          this._interiorChannel = null;
          if (el) el.style.display = 'none';
          p.x = room.door.x; p.z = room.door.z;
          this._inside = null;
        }
        return;
      }
      if (this._interiorChannel) { this._interiorChannel = null; if (el && !this._padChannel) el.style.display = 'none'; }
    }
  }

  _nearestRoad(v) {
    let best = ROADS[0], bd = 1e9;
    for (const r of ROADS) { const d = Math.abs(r - v); if (d < bd) { bd = d; best = r; } }
    return best;
  }

  _lightAhead(t) {
    const city = this.game.city;
    if (!city || typeof city.lightAt !== 'function') return null;
    const r = t.route;
    if (!r) return null;
    // lit intersections exist only on even-index roads; odd-index roads
    // have no lights at all
    const roadIdx = ROADS.indexOf(r.road);
    if (roadIdx < 0 || roadIdx % 2 !== 0) return null;
    let best = null, bestD = 1e9;
    for (let i = 0; i < ROADS.length; i += 2) {
      const iz = ROADS[i];
      if (r.axis === 'ns') {
        const gap = (iz - t.z) * r.dir;
        if (gap > 0 && gap < 12 && gap < bestD) { bestD = gap; best = { x: r.road, z: iz }; }
      } else {
        const gap = (iz - t.x) * r.dir;
        if (gap > 0 && gap < 12 && gap < bestD) { bestD = gap; best = { x: iz, z: r.road }; }
      }
    }
    if (!best) return null;
    return { state: city.lightAt(best.x, best.z, r.axis), dist: bestD };
  }

  _checkPlayerRedLight(car) {
    const city = this.game.city;
    const police = this.game.police;
    if (!city || !police || typeof city.lightAt !== 'function') return;
    // nearest lit intersection the player is crossing
    let best = null, bestD = 1e9;
    for (const l of city.lights || []) {
      const d = Math.hypot(l.x - car.x, l.z - car.z);
      if (d < bestD) { bestD = d; best = l; }
    }
    if (!best || bestD > 8) return;
    const axis = Math.abs(Math.sin(car.heading)) > 0.7 ? 'ew' : 'ns';
    const state = city.lightAt(best.x, best.z, axis);
    const key = `${best.ix}_${best.iz}`;
    const now = this._t;
    if (state === 'red' && Math.abs(car.speed) > 4) {
      const last = this._redCooldown.get(key) || 0;
      if (now - last > 20) {
        this._redCooldown.set(key, now);
        // only if a police unit is nearby
        let near = false;
        for (const u of police.units || []) {
          if (u.car && Math.hypot(u.car.x - car.x, u.car.z - car.z) < 45) { near = true; break; }
        }
        if (near) {
          police.addHeat(1, 'ran a red light');
          if (this.game.hud) this.game.hud.notify('You ran a red light — wanted +1');
        }
      }
    }
  }

  _updateRotorAudio() {
    try {
      const g = this.game;
      const p = g.player;
      const heli = g.police && g.police.heli ? g.police.heli.car : null;
      const playerHeli = this.playerCar && this.playerCar.kind === 'heli' ? this.playerCar : null;
      const active = heli || playerHeli;
      if (!active) {
        if (this._rotorGain) this._rotorGain.gain.value = 0;
        return;
      }
      if (!this._rotorCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this._rotorCtx = new AC();
        const o1 = this._rotorCtx.createOscillator();
        o1.type = 'sawtooth'; o1.frequency.value = 27;
        const o2 = this._rotorCtx.createOscillator();
        o2.type = 'sine'; o2.frequency.value = 54;
        const lp = this._rotorCtx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 220;
        this._rotorGain = this._rotorCtx.createGain();
        this._rotorGain.gain.value = 0;
        o1.connect(lp); o2.connect(lp); lp.connect(this._rotorGain); this._rotorGain.connect(this._rotorCtx.destination);
        o1.start(); o2.start();
      }
      if (this._rotorCtx.state === 'suspended') this._rotorCtx.resume().catch(() => {});
      const d = p ? Math.hypot(active.x - p.x, active.z - p.z) : 100;
      const vol = playerHeli ? 0.06 : clamp(0.09 * (1 - d / 150), 0, 0.09);
      if (this._rotorGain) this._rotorGain.gain.value = vol;
    } catch (e) { /* audio is best-effort */ }
  }
}
