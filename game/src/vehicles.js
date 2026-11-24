// La Vega 3D — vehicles: traffic, player driving, boats, helicopter
// (round 8 re-author).
//
// Rebuilt from REFERENCE.md and the old build's look: detailed cars
// (GLB Quaternius first, procedural fallback with spoiler / taxi sign /
// police livery / pickup bed / van split / truck chrome), real traffic
// that stays on its road, carjacking with a fleeing driver and a
// "tin-tin" alarm, boats that live in the sea, a flyable helicopter.
//
// THE FLIP FIX (ilham's report: a white SUV upside-down on the road):
// cars in this file are KINEMATIC — position + heading only. There is
// no torque, no angular velocity, no roll or pitch ever applied: every
// update forces the visual group upright (rotation.x = rotation.z = 0)
// and re-grounds the car, and collisions only ever stop a car or push
// it back along the road. A car physically cannot end up on its roof.
// Traffic also auto-rights: if a car is ever found tilted, it is
// levelled on the spot.
//
// Exports: VehicleManager. A car object carries x/z/y, speed, heading,
// kind ('car' | 'boat' | 'jetski' | 'heli'), specKey, isTraffic,
// isParked, isBus, isPlayer, occupied (NPC driver or null), alarmOn,
// cond, fuel, dead, group (THREE.Group, userData.isGLB when built from
// a GLB), wheels, color, spec, refuel(), repair().
import * as THREE from 'three';
import { WORLD, ROADS, CAR_MODELS, PLACES } from './config.js';
import { groundHeight, isSea, isInRiver, isOnRoad } from './city.js';
import { cloneCar, buildProceduralCar, buildProceduralTruck, buildProceduralVan, MODELS } from './loader.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist2d = (x1, z1, x2, z2) => Math.hypot(x1 - x2, z1 - z2);

// Traffic keys: GLB-backed first (the playtest wants >= 50% GLB cars).
const TRAFFIC_KEYS = [
  'sedan', 'suv', 'sport', 'pickup', 'taxi',
  'sedan', 'suv', 'sport', 'pickup', 'sedan',
  'suv', 'sport', 'pickup', 'taxi', 'truck',
  'sedan', 'suv', 'sport', 'pickup', 'sedan',
  'suv', 'sport', 'pickup', 'van',
];
const PARKED_KEYS = [
  'sedan', 'suv', 'sport', 'pickup', 'taxi',
  'sedan', 'suv', 'sport', 'pickup', 'truck',
  'van', 'sedan', 'suv', 'sport',
];
const DEALER_KEYS = ['sport', 'sedan', 'suv', 'pickup', 'taxi', 'sedan', 'sport', 'suv'];

// ---------------------------------------------------------------------------
// Procedural boat / jetski / helicopter / motorbike (no GLB for these).
// Length runs along +z, like the loader's car builders.
// ---------------------------------------------------------------------------
function buildBoat(kind) {
  const g = new THREE.Group();
  if (kind === 'jetski') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 2.4), new THREE.MeshLambertMaterial({ color: 0x2a6fd6 }));
    body.position.y = 0.25;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 1.1), new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
    seat.position.set(0, 0.5, -0.3);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.1), new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
    handle.position.set(0, 0.62, 0.8);
    g.add(body, seat, handle);
    return { group: g, wheels: [] };
  }
  // Speedboat: hull + windscreen + outboard motor + seats.
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f5f7 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 5.2), hullMat);
  hull.position.y = 0.35;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.18, 5.25), new THREE.MeshLambertMaterial({ color: 0xd92038 }));
  stripe.position.y = 0.55;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 0.12), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.15, metalness: 0.6 }));
  screen.position.set(0, 0.95, 1.2);
  screen.rotation.x = -0.3;
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.5), new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
  motor.position.set(0, 0.5, -2.7);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.4), new THREE.MeshLambertMaterial({ color: 0x2a6fd6 }));
  seat.position.set(0, 0.8, -0.6);
  g.add(hull, stripe, screen, motor, seat);
  return { group: g, wheels: [] };
}

function buildHeli() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 4.4), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
  body.position.y = 1.2;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.2), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.15, metalness: 0.6 }));
  glass.position.set(0, 1.4, 1.8);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.2), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
  tail.position.set(0, 1.5, -3.4);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 1.0), new THREE.MeshLambertMaterial({ color: 0xd92038 }));
  fin.position.set(0, 2.2, -4.8);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
  mast.position.set(0, 2.3, 0.3);
  const rotor = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.4), new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
    blade.rotation.y = (i * Math.PI) / 2;
    rotor.add(blade);
  }
  rotor.position.set(0, 2.65, 0.3);
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 3.4), new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
  skidL.position.set(-0.9, 0.15, 0);
  const skidR = skidL.clone();
  skidR.position.x = 0.9;
  g.add(body, glass, tail, fin, mast, rotor, skidL, skidR);
  return { group: g, wheels: [], rotor };
}

function buildMotorbike(spec, color) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 1.6), new THREE.MeshLambertMaterial({ color }));
  frame.position.y = 0.55;
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.7), new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
  tank.position.set(0, 0.8, 0.2);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.8), new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
  seat.position.set(0, 0.78, -0.5);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), new THREE.MeshLambertMaterial({ color: 0x8a8a92 }));
  handle.position.set(0, 0.95, 0.75);
  const wheels = [];
  for (const z of [0.75, -0.75]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 14), new THREE.MeshLambertMaterial({ color: 0x16161a }));
    w.rotation.z = Math.PI / 2;
    w.position.set(0, 0.34, z);
    g.add(w);
    wheels.push(w);
  }
  g.add(frame, tank, seat, handle);
  return { group: g, wheels };
}

export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.cars = [];
    this.playerCar = null;
    this.playerBoat = null;
    this.playerHeli = null;
    this._alarmT = new Map(); // car -> seconds left on its alarm
    this._nearMissCd = 0;
    this._driftScore = 0;
    this._headlight = null;
  }

  // -- construction -----------------------------------------------------------
  _buildVisual(specKey, color) {
    const spec = CAR_MODELS[specKey] || CAR_MODELS.sedan;
    if (specKey === 'motor') return { ...buildMotorbike(spec, color), isGLB: false };
    if (spec.proc === 'truck') return { ...buildProceduralTruck(spec, color), isGLB: false };
    if (spec.proc === 'van' || spec.proc === 'bus' || spec.proc === 'ambulance' || spec.proc === 'firetruck') {
      return { ...buildProceduralVan(spec, color, spec.proc), isGLB: false };
    }
    const glb = spec.glb && MODELS.cars[spec.glb];
    if (glb) {
      const built = cloneCar(glb, spec, color);
      return { ...built, isGLB: true };
    }
    return { ...buildProceduralCar(spec, color), isGLB: false };
  }

  spawn(specKey, x, z, heading = 0, opts = {}) {
    const spec = CAR_MODELS[specKey] || CAR_MODELS.sedan;
    const color = opts.color !== undefined ? opts.color : pick(spec.colors || [0xd92038]);
    let kind = 'car';
    let visual;
    if (opts.kind === 'heli') {
      kind = 'heli';
      visual = buildHeli();
    } else if (opts.kind === 'boat' || opts.kind === 'jetski') {
      kind = opts.kind;
      visual = buildBoat(kind);
    } else {
      visual = this._buildVisual(specKey, color);
    }
    const y = kind === 'heli' ? 0 : kind === 'boat' || kind === 'jetski' ? 0.1 : groundHeight(x, z);
    const car = {
      specKey, spec, kind, color,
      x, z, y, heading,
      speed: 0, steer: 0,
      group: visual.group,
      wheels: visual.wheels || [],
      rotor: visual.rotor || null,
      isTraffic: opts.traffic !== undefined ? opts.traffic : false,
      isParked: !!opts.parked,
      isBus: specKey === 'bus',
      isPlayer: false,
      occupied: null,
      alarmOn: false,
      cond: opts.cond !== undefined ? opts.cond : 100,
      fuel: opts.fuel !== undefined ? opts.fuel : 100,
      dead: false,
      // Traffic state: which road axis + lane direction it follows.
      roadAxis: Math.random() < 0.5 ? 'x' : 'z',
      roadLine: pick(ROADS),
      laneDir: Math.random() < 0.5 ? 1 : -1,
      cruise: rand(8, 14),
      stuckT: 0,
      waitT: 0,
    };
    car.group.position.set(x, y, z);
    car.group.rotation.set(0, heading, 0);
    car.group.userData.isGLB = !!visual.isGLB;
    this.scene.add(car.group);
    this.cars.push(car);
    car.refuel = () => { car.fuel = 100; };
    car.repair = () => { car.cond = 100; car.dead = false; };
    return car;
  }

  spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const key = TRAFFIC_KEYS[i % TRAFFIC_KEYS.length];
      // On a road: pick a road line + a point along it, right-hand lane.
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const line = pick(ROADS);
      const along = rand(20, 240);
      const lane = rand(1.2, 3.2) * (Math.random() < 0.5 ? 1 : -1);
      const x = axis === 'x' ? along : line + lane;
      const z = axis === 'x' ? line + lane : along;
      const heading = axis === 'x' ? (lane > 0 ? Math.PI / 2 : -Math.PI / 2) : (lane > 0 ? 0 : Math.PI);
      const car = this.spawn(key, x, z, heading, { traffic: true });
      car.roadAxis = axis;
      car.roadLine = line;
      car.laneDir = lane > 0 ? 1 : -1;
      car.speed = rand(6, 12);
    }
  }

  spawnParked(n) {
    for (let i = 0; i < n; i++) {
      const key = PARKED_KEYS[i % PARKED_KEYS.length];
      // Parallel-parked at the kerb: just off the carriageway, facing
      // along the road. Never on grass, never blocking the middle.
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const line = pick(ROADS);
      const along = rand(25, 235);
      const side = Math.random() < 0.5 ? 1 : -1;
      const x = axis === 'x' ? along : line + side * 6.2;
      const z = axis === 'x' ? line + side * 6.2 : along;
      const heading = axis === 'x' ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
      this.spawn(key, x, z, heading, { parked: true });
    }
  }

  spawnDealerLot() {
    // Auto Palms display row: showroom cars, nose-out, on the lot.
    const dx = PLACES.dealer.x, dz = PLACES.dealer.y;
    for (let i = 0; i < DEALER_KEYS.length; i++) {
      const key = DEALER_KEYS[i];
      const spec = CAR_MODELS[key];
      const x = dx - 9 + (i % 4) * 6;
      const z = dz + 10 + Math.floor(i / 4) * 5;
      const car = this.spawn(key, x, z, Math.PI, { parked: true, color: key === 'sport' && i === 0 ? 0xe01e37 : undefined });
      car.dealerCar = true;
      void spec;
    }
  }

  spawnBus() {
    // City bus on a loop along Marina Blvd, with stops.
    const bus = this.spawn('bus', 65, 60, Math.PI / 2, { traffic: true });
    bus.roadAxis = 'z';
    bus.roadLine = 65;
    bus.laneDir = 1;
    bus.cruise = 9;
    bus.isBus = true;
    return bus;
  }

  spawnBoats() {
    // Boats + jet skis live in the SEA — never on a road.
    const spots = [
      ['boat', 8, 100], ['boat', 7, 170], ['jetski', 9, 130], ['jetski', 6, 200],
    ];
    for (const [kind, x, z] of spots) {
      const boat = this.spawn(kind === 'boat' ? 'sedan' : 'sedan', x, z, rand(0, Math.PI * 2), { kind, traffic: false });
      boat.specKey = kind;
      boat.speed = 0;
    }
  }

  spawnHeli(x, z) {
    const heli = this.spawn('police', x, z, 0, { kind: 'heli', traffic: false });
    heli.specKey = 'heli';
    heli.y = 0;
    return heli;
  }

  nearestCar(x, z, radius, filter) {
    let best = null, bd = radius;
    for (const c of this.cars) {
      if (c.dead || c.kind === 'heli') continue;
      if (filter && !filter(c)) continue;
      const d = dist2d(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // -- entering / stealing ------------------------------------------------------
  enterCar(car) {
    if (!car || car.dead) return false;
    const g = this.game;
    const p = g.player;
    if (car.occupied) return this.stealCar(car);
    car.isPlayer = true;
    car.isTraffic = false;
    car.isParked = false;
    this.playerCar = car;
    p.inCar = car;
    p.group.visible = false;
    if (g.police) g.police.onPlayerEnterCar(car);
    if (g.audio) g.audio.radioBlip();
    return true;
  }

  stealCar(car) {
    if (!car || car.dead) return false;
    const g = this.game;
    const p = g.player;
    if (car.occupied) {
      // Driver bails out and runs for it.
      const npc = car.occupied;
      npc.state = 'flee';
      npc.driverOf = null;
      car.occupied = null;
    } else if (car.isParked) {
      // Empty parked car: the alarm screams "tin-tin-tin-tin".
      car.alarmOn = true;
      this._alarmT.set(car, 6);
      if (g.audio) g.audio.alarm();
    }
    this.enterCar(car);
    if (g.police) g.police.addHeat(1, 'grand theft auto');
    return true;
  }

  exitCar() {
    const car = this.playerCar;
    if (!car) return;
    const g = this.game;
    const p = g.player;
    this.playerCar = null;
    car.isPlayer = false;
    car.speed = 0;
    p.inCar = null;
    p.x = clamp(car.x + 2.2, 2, 398);
    p.z = clamp(car.z + 1.5, 2, 398);
    p.y = groundHeight(p.x, p.z);
    p.group.position.set(p.x, p.y, p.z);
    p.group.visible = true;
  }

  // -- per-frame update ---------------------------------------------------------
  update(dt, input) {
    const g = this.game;
    this._nearMissCd = Math.max(0, this._nearMissCd - dt);
    // Alarms tick down and stop themselves.
    for (const [car, t] of [...this._alarmT.entries()]) {
      const left = t - dt;
      if (left <= 0) {
        car.alarmOn = false;
        this._alarmT.delete(car);
        if (g.audio) g.audio.alarmStop();
      } else this._alarmT.set(car, left);
    }
    if (this.playerCar) this._updatePlayerCar(dt, input);
    if (this.playerBoat) this._updatePlayerBoat(dt, input);
    if (this.playerHeli) this._updatePlayerHeli(dt, input);
    for (const car of this.cars) {
      if (car === this.playerCar || car === this.playerBoat || car === this.playerHeli) continue;
      if (car.kind === 'boat' || car.kind === 'jetski') this._updateBoatIdle(car, dt);
      else if (car.kind === 'heli') this._updateHeliIdle(car, dt);
      else if (car.isTraffic) this._updateTraffic(car, dt);
      else this._updateParked(car, dt);
      // THE ANTI-FLIP GUARANTEE: a car is always upright and grounded.
      // Any tilt (from a collision, a bump, a bad spawn) is levelled here.
      car.group.rotation.x = 0;
      car.group.rotation.z = 0;
      car.group.rotation.y = car.heading;
    }
    // Headlights: on at night for the player's car only.
    if (this.playerCar) {
      const night = g.weather && g.weather.isNight && g.weather.isNight();
      if (night && !this._headlight) {
        const light = new THREE.SpotLight(0xfff2c0, 60, 30, 0.5, 0.4);
        light.position.set(0, 1.0, 2.0);
        const tgt = new THREE.Object3D();
        tgt.position.set(0, 0, 14);
        this.playerCar.group.add(tgt);
        light.target = tgt;
        this.playerCar.group.add(light);
        this._headlight = light;
      } else if (!night && this._headlight) {
        this.playerCar.group.remove(this._headlight);
        this._headlight = null;
      }
    }
  }

  _updatePlayerCar(dt, input) {
    const car = this.playerCar;
    const g = this.game;
    const spec = car.spec;
    const grip = (g.weather && g.weather.gripFactor) ? g.weather.gripFactor() : 1;
    // Steering + throttle (kinematic: no torque, no roll, no pitch).
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
    const spd = Math.abs(car.speed);
    if (car.fuel > 0 && !car.dead) {
      if (input.fwd) car.speed += spec.accel * grip * dt * (input.nitro && car.fuel > 5 ? 1.6 : 1);
      if (input.back) car.speed -= spec.accel * 0.7 * dt;
      if (input.nitro && input.fwd) car.fuel = Math.max(0, car.fuel - dt * 3);
    }
    // Drag + rolling resistance; handbrake stops the car hard (and drifts).
    car.speed -= car.speed * (input.handbrake ? 3.2 : 0.55) * dt;
    if (Math.abs(car.speed) < 0.05 && !input.fwd && !input.back) car.speed = 0;
    car.speed = clamp(car.speed, -spec.top * 0.4, spec.top * (input.nitro ? 1.15 : 1));
    car.heading += car.steer * spec.turn * (spd / Math.max(6, spec.top)) * (car.speed >= 0 ? 1 : -1) * dt * (input.handbrake ? 1.8 : 1);
    // Drift: handbrake + speed + steering = a slide that pays.
    if (input.handbrake && spd > 12 && Math.abs(car.steer) > 0.5) {
      this._driftScore += spd * dt;
      if (this._driftScore > 40) {
        const score = Math.round(this._driftScore);
        this._driftScore = 0;
        if (g.onDrift) g.onDrift(score);
        if (g.audio) g.audio.radioBlip();
      }
    } else this._driftScore = Math.max(0, this._driftScore - dt * 20);
    // Move (stunt-ramp jump: vertical arc only, the car stays level).
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    car.x = clamp(nx, 2, 398);
    car.z = clamp(nz, 2, 398);
    const gy = groundHeight(car.x, car.z);
    if (car.jumpV) {
      car.jumpV -= 14 * dt;
      car.jumpY = (car.jumpY || 0) + car.jumpV * dt;
      if (car.jumpY <= 0) { car.jumpY = 0; car.jumpV = 0; }
    }
    car.y = gy + (car.jumpY || 0);
    car.group.position.set(car.x, car.y, car.z);
    car.group.rotation.set(0, car.heading, 0);
    // Fuel burn + stall.
    if (Math.abs(car.speed) > 1) car.fuel = Math.max(0, car.fuel - dt * 0.25);
    // Wheel spin.
    for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.34;
    // Collisions: buildings, traffic, and the world edge.
    this._collideBuildings(car);
    this._collideTraffic(car, true);
    // Near miss: fast pass within 2.5 m of a traffic car, no contact.
    if (this._nearMissCd <= 0 && Math.abs(car.speed) > 15) {
      for (const other of this.cars) {
        if (other === car || other.kind !== 'car' || !other.isTraffic) continue;
        const d = dist2d(car.x, car.z, other.x, other.z);
        if (d > 1.8 && d < 3.2) {
          this._nearMissCd = 2;
          if (g.onNearMiss) g.onNearMiss();
          break;
        }
      }
    }
    // Stunt ramp: hit the park ramp fast and the car takes off (level).
    if (g.stunts) {
      for (const s of g.stunts) {
        if (dist2d(car.x, car.z, s.x, s.z) < 3 && Math.abs(car.speed) > 15 && !car.jumpV && !car.jumpY) {
          car.jumpV = 7;
          car.jumpY = 0.01;
        }
      }
    }
  }

  _updateTraffic(car, dt) {
    const g = this.game;
    // Red light: stop before the intersection when the light is red.
    let target = car.cruise;
    if (g.trafficRed) {
      for (const r of ROADS) {
        const dAlong = car.roadAxis === 'x' ? Math.abs(car.z - r) : Math.abs(car.x - r);
        const dCross = car.roadAxis === 'x' ? Math.abs(car.x - r) : Math.abs(car.z - r);
        if (dAlong < 4 && dCross > 4 && dCross < 16) { target = 0; break; }
      }
    }
    // Car ahead: slow down, never ram through.
    for (const other of this.cars) {
      if (other === car || other.kind !== 'car') continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
      const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
      if (ahead > 0 && ahead < 8 && side < 2.4) { target = Math.min(target, Math.max(0, other.speed - 2)); }
    }
    car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
    if (car.speed < 0.1 && target === 0) car.speed = 0;
    // Move along the road, staying in its lane.
    const step = car.speed * dt;
    if (car.roadAxis === 'x') {
      car.x += Math.sin(car.heading) * step;
      car.z += Math.cos(car.heading) * step;
      // Lane keeping: drift back to the lane offset.
      const laneZ = car.roadLine + car.laneDir * 2.2;
      car.z += (laneZ - car.z) * Math.min(1, dt * 0.8);
      if (car.x > 256 || car.x < 4) this._trafficTurn(car);
    } else {
      car.x += Math.sin(car.heading) * step;
      car.z += Math.cos(car.heading) * step;
      const laneX = car.roadLine + car.laneDir * 2.2;
      car.x += (laneX - car.x) * Math.min(1, dt * 0.8);
      if (car.z > 256 || car.z < 4) this._trafficTurn(car);
    }
    // Occasionally turn at an intersection (or reverse at the grid edge).
    if (Math.random() < dt * 0.02) this._trafficTurn(car);
    car.y = groundHeight(car.x, car.z);
    car.group.position.set(car.x, car.y, car.z);
    for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.34;
  }

  _trafficTurn(car) {
    // Pick a new road line + axis at the next intersection, keeping the
    // car on the grid. Heading snaps to a cardinal direction: traffic
    // never cuts across blocks or sidewalks.
    const line = pick(ROADS);
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    car.roadAxis = axis;
    car.roadLine = line;
    car.laneDir = Math.random() < 0.5 ? 1 : -1;
    if (axis === 'x') {
      car.heading = car.laneDir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.z = line + car.laneDir * 2.2;
      car.x = clamp(car.x, 8, 252);
    } else {
      car.heading = car.laneDir > 0 ? 0 : Math.PI;
      car.x = line + car.laneDir * 2.2;
      car.z = clamp(car.z, 8, 252);
    }
  }

  _updateParked(car, dt) {
    // Parked cars sit still — but stay grounded and upright.
    car.y = groundHeight(car.x, car.z);
    car.group.position.set(car.x, car.y, car.z);
  }

  _updateBoatIdle(car, dt) {
    // Gentle bob on the water; never leaves the sea.
    car.y = 0.1 + Math.sin(performance.now() * 0.001 + car.x) * 0.08;
    car.group.position.set(car.x, car.y, car.z);
    car.group.rotation.set(0, car.heading, 0);
  }

  _updateHeliIdle(car, dt) {
    if (car.rotor) car.rotor.rotation.y += dt * 2;
    car.group.position.set(car.x, car.y, car.z);
  }

  _updatePlayerBoat(dt, input) {
    const boat = this.playerBoat;
    const g = this.game;
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (input.fwd) boat.speed = Math.min(boat.speed + 10 * dt, 24);
    if (input.back) boat.speed = Math.max(boat.speed - 8 * dt, -6);
    boat.speed -= boat.speed * 0.4 * dt;
    boat.heading += steer * 1.8 * (Math.abs(boat.speed) / 24) * dt;
    boat.x = clamp(boat.x + Math.sin(boat.heading) * boat.speed * dt, 2, 28);
    boat.z = clamp(boat.z + Math.cos(boat.heading) * boat.speed * dt, 4, 396);
    boat.y = 0.1 + Math.sin(performance.now() * 0.0015) * 0.08;
    boat.group.position.set(boat.x, boat.y, boat.z);
    boat.group.rotation.set(0, boat.heading, 0);
    void g;
  }

  _updatePlayerHeli(dt, input) {
    const heli = this.playerHeli;
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (input.fwd) heli.speed = Math.min(heli.speed + 8 * dt, 26);
    if (input.back) heli.speed = Math.max(heli.speed - 8 * dt, -8);
    heli.speed -= heli.speed * 0.3 * dt;
    heli.heading += steer * 1.6 * dt;
    if (input.up) heli.y = Math.min(heli.y + 9 * dt, 60);
    if (input.down) heli.y = Math.max(heli.y - 9 * dt, 0);
    heli.x = clamp(heli.x + Math.sin(heli.heading) * heli.speed * dt, 2, 398);
    heli.z = clamp(heli.z + Math.cos(heli.heading) * heli.speed * dt, 2, 398);
    heli.group.position.set(heli.x, heli.y, heli.z);
    heli.group.rotation.set(0, heli.heading, 0);
    if (heli.rotor) heli.rotor.rotation.y += dt * 22;
  }

  // -- collisions ---------------------------------------------------------------
  _collideBuildings(car) {
    const city = this.game.city;
    if (!city || !city.colliders) return;
    const r = (car.spec.wid || 2) / 2 + 0.15;
    for (const c of city.colliders) {
      if (car.x > c.x0 - r && car.x < c.x1 + r && car.z > c.z0 - r && car.z < c.z1 + r) {
        const pushL = car.x - (c.x0 - r), pushR = (c.x1 + r) - car.x;
        const pushU = car.z - (c.z0 - r), pushD = (c.z1 + r) - car.z;
        const m = Math.min(pushL, pushR, pushU, pushD);
        if (m === pushL) car.x = c.x0 - r;
        else if (m === pushR) car.x = c.x1 + r;
        else if (m === pushU) car.z = c.z0 - r;
        else car.z = c.z1 + r;
        if (Math.abs(car.speed) > 3) this._damage(car, 8);
        car.speed *= 0.25;
        car.group.position.set(car.x, car.y, car.z);
      }
    }
  }

  _collideTraffic(car, isPlayer) {
    for (const other of this.cars) {
      if (other === car || other.kind !== 'car' || other.dead) continue;
      const d = dist2d(car.x, car.z, other.x, other.z);
      const minD = ((car.spec.len || 4.5) + (other.spec.len || 4.5)) / 2 - 0.6;
      if (d < minD && d > 0.01) {
        // Push apart along the line between them; both stop. No flip,
        // no spin, no launch — a fender-bender, not a cartoon.
        const nx = (car.x - other.x) / d, nz = (car.z - other.z) / d;
        const push = (minD - d) / 2;
        car.x += nx * push; car.z += nz * push;
        if (other.isTraffic) { other.x -= nx * push; other.z -= nz * push; }
        if (Math.abs(car.speed) > 4 || Math.abs(other.speed) > 4) {
          this._damage(car, 6);
          this._damage(other, 6);
          if (isPlayer && this.game.audio) this.game.audio.crash(0.5);
          if (isPlayer) this.game.shake = Math.min(0.6, (this.game.shake || 0) + 0.3);
        }
        car.speed *= 0.3;
        other.speed *= 0.3;
        car.group.position.set(car.x, car.y, car.z);
        other.group.position.set(other.x, other.y, other.z);
      }
    }
  }

  _damage(car, amount) {
    car.cond = Math.max(0, car.cond - amount);
    if (car.cond <= 0 && !car.dead) {
      car.dead = true;
      car.speed = 0;
      if (this.game.hud && car === this.playerCar) this.game.hud.notify('Your car is wrecked — get it repaired at Manny\'s.');
    }
  }
}
