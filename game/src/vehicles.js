// La Vega 3D — vehicles (round 9 re-author).
//
// Every vehicle in the game is a PURELY KINEMATIC object: position +
// heading, no torque, no angular velocity, no physics engine. That is
// the anti-flip guarantee — a car cannot roll over because nothing ever
// tilts it: every update forces rotation.x = rotation.z = 0, re-grounds
// the car to the terrain, and auto-rights it if it is ever found tilted
// more than 45 degrees (which cannot happen by construction, but the
// guard is there anyway). Ramp jumps are a vertical arc only.
//
// GLB-first: any spec with a loaded GLB clones it (cloneCar sets
// userData.isGLB); otherwise the procedural builders from loader.js
// cover the model, so no vehicle ever fails to render.
import * as THREE from 'three';
import { CAR_MODELS, CAR_CATALOG, PLACES, WORLD, ROADS } from './config.js';
import { groundHeight, isSea, isInRiver, isOnRoad } from './city.js';
import {
  cloneCar, buildProceduralCar, buildProceduralTruck, buildProceduralVan,
  buildProceduralHumanoid, MODELS,
} from './loader.js';
import { clamp, damp, dist2d, rand, pick, mulberry32 } from './rng.js';

// Re-exported so other modules can build vehicles through this one.
export { cloneCar, buildProceduralCar, buildProceduralTruck, buildProceduralVan };
export { CAR_MODELS } from './config.js';

// ---------------------------------------------------------------------------
// Procedural visuals that loader.js does not build: motorbike, boat /
// jetski, helicopter. All lengths run along +z (the driving direction).
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

function buildBike(color) {
  const group = new THREE.Group();
  const paint = lam(color);
  const dark = lam(0x1a1a1a);
  const wheels = [];
  for (const z of [0.75, -0.75]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 16), dark);
    w.position.set(0, 0.32, z);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }
  // Frame, tank, seat, handlebar, headlight.
  const frame = box(0.12, 0.12, 1.5, paint, 0, 0.62, 0);
  frame.rotation.x = 0.15;
  group.add(frame);
  group.add(box(0.34, 0.28, 0.55, paint, 0, 0.78, 0.15));
  group.add(box(0.3, 0.1, 0.5, dark, 0, 0.72, -0.45));
  const bar = box(0.62, 0.07, 0.07, dark, 0, 0.95, 0.72);
  group.add(bar);
  group.add(box(0.22, 0.14, 0.08, new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), 0, 0.82, 0.78));
  return { group, wheels };
}

function buildBoat(kind, color) {
  const group = new THREE.Group();
  const isSki = kind === 'jetski';
  const len = isSki ? 2.6 : 6.5;
  const wid = isSki ? 1.1 : 2.4;
  const hullMat = lam(color);
  // Hull: a tapered box (bow narrower via a second smaller box).
  group.add(box(wid, 0.7, len * 0.7, hullMat, 0, 0.45, -len * 0.12));
  const bow = box(wid * 0.7, 0.55, len * 0.35, hullMat, 0, 0.45, len * 0.32);
  group.add(bow);
  const deck = box(wid * 0.85, 0.12, len * 0.6, lam(0xf2f5f7), 0, 0.85, -len * 0.1);
  group.add(deck);
  if (!isSki) {
    // Windshield + cabin + outboard motor.
    group.add(box(wid * 0.8, 0.5, 0.1, std(0x1a2a3a, 0.15, 0.6), 0, 1.15, len * 0.18));
    group.add(box(wid * 0.6, 0.7, 1.4, lam(0xf2f5f7), 0, 1.2, -len * 0.15));
    group.add(box(0.5, 0.9, 0.4, lam(0x1a1a1a), 0, 0.6, -len * 0.48));
  } else {
    group.add(box(0.5, 0.25, 0.9, lam(0x1a1a1a), 0, 0.95, -0.1));
  }
  return { group, wheels: [] };
}

function buildHeli(color) {
  const group = new THREE.Group();
  const paint = lam(color);
  // Body: a rounded cabin + tail boom + skids.
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 10), paint);
  body.scale.set(1, 0.85, 1.5);
  body.position.set(0, 1.4, 0.3);
  body.castShadow = true;
  group.add(body);
  group.add(box(0.9, 0.5, 1.2, std(0x1a2a3a, 0.15, 0.6), 0, 1.7, 1.4));
  const boom = cyl(0.22, 0.32, 4.5, paint, 0, 1.5, -2.8, 8);
  boom.rotation.x = Math.PI / 2 - 0.08;
  group.add(boom);
  const fin = box(0.12, 1.1, 0.7, paint, 0, 2.2, -4.9);
  group.add(fin);
  for (const sx of [-0.9, 0.9]) {
    group.add(box(0.12, 0.12, 3.4, lam(0x3a3a42), sx, 0.35, 0.2));
    group.add(box(0.12, 0.5, 0.12, lam(0x3a3a42), sx, 0.6, 1.2));
    group.add(box(0.12, 0.5, 0.12, lam(0x3a3a42), sx, 0.6, -0.8));
  }
  // Main rotor (spun by the update loop via car.rotor) + tail rotor.
  const rotor = new THREE.Group();
  const bladeMat = lam(0x1a1a1a);
  rotor.add(box(7.5, 0.08, 0.35, bladeMat, 0, 0, 0));
  rotor.add(box(0.35, 0.08, 7.5, bladeMat, 0, 0, 0));
  rotor.add(cyl(0.12, 0.12, 0.5, lam(0x3a3a42), 0, -0.2, 0, 8));
  rotor.position.set(0, 2.9, 0.3);
  group.add(rotor);
  const tailRotor = new THREE.Group();
  tailRotor.add(box(0.08, 1.6, 0.2, bladeMat, 0, 0, 0));
  tailRotor.position.set(0.35, 2.0, -4.9);
  group.add(tailRotor);
  return { group, wheels: [], rotor, tailRotor };
}

// Pick the visual for a spec: GLB clone first, procedural fallback next.
// Returns {group, wheels, isGLB}.
function buildVehicleVisual(spec, color) {
  const glb = spec.glb && MODELS.cars[spec.glb];
  if (glb) {
    const r = cloneCar(glb, spec, color);
    return { group: r.group, wheels: r.wheels, isGLB: true };
  }
  if (spec.proc === 'truck') {
    const r = buildProceduralTruck(spec, color);
    return { group: r.group, wheels: r.wheels, isGLB: false };
  }
  if (spec.proc === 'van' || spec.proc === 'bus' || spec.proc === 'ambulance' || spec.proc === 'firetruck') {
    const r = buildProceduralVan(spec, color, spec.proc);
    return { group: r.group, wheels: r.wheels, isGLB: false };
  }
  const r = buildProceduralCar(spec, color);
  return { group: r.group, wheels: r.wheels, isGLB: false };
}

// ---------------------------------------------------------------------------
// VehicleManager.
// ---------------------------------------------------------------------------

const STREET_SPECS = ['sedan', 'suv', 'pickup', 'taxi', 'van', 'truck'];
const GLB_STREET = ['sedan', 'suv', 'pickup', 'taxi'];

export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.rng = mulberry32(4242);
    this.cars = [];
    this.playerCar = null;
    this.playerBoat = null;
    this.playerHeli = null;
    // One spotlight for the player car at night (created once, attached
    // on enter, detached on exit).
    this.headlight = new THREE.SpotLight(0xfff2c0, 60, 30, 0.5, 0.5, 1.2);
    this.headlightTarget = new THREE.Object3D();
    this.headlightTarget.position.set(0, 0, 12);
    this.headlight.target = this.headlightTarget;
    this.bus = null;
    this.busStopT = 0;
    this.busWp = 0;
  }

  spawn(specKey, x, z, heading, opts = {}) {
    const spec = CAR_MODELS[specKey] || CAR_MODELS.sedan;
    const color = opts.color !== undefined ? opts.color : pick(this.rng, spec.colors || [0xcccccc]);
    const kind = opts.kind || (specKey === 'motor' ? 'motor' : 'car');
    let visual;
    let rotor = null;
    let tailRotor = null;
    if (kind === 'heli') {
      const h = buildHeli(color);
      visual = { group: h.group, wheels: h.wheels, isGLB: false };
      rotor = h.rotor;
      tailRotor = h.tailRotor;
    } else if (kind === 'boat' || kind === 'jetski') {
      const b = buildBoat(kind, color);
      visual = { group: b.group, wheels: b.wheels, isGLB: false };
    } else if (specKey === 'motor') {
      const m = buildBike(color);
      visual = { group: m.group, wheels: m.wheels, isGLB: false };
    } else {
      visual = buildVehicleVisual(spec, color);
    }
    // Headlight glow boxes at the front (shown at night).
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), hlMat);
    const hlR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), hlMat);
    const fl = spec.len || 4.5;
    hlL.position.set(-(spec.wid || 1.9) * 0.3, 0.62, fl / 2 + 0.02);
    hlR.position.set((spec.wid || 1.9) * 0.3, 0.62, fl / 2 + 0.02);
    hlL.visible = false;
    hlR.visible = false;
    visual.group.add(hlL, hlR);

    const car = {
      specKey, spec, kind,
      x, z,
      y: kind === 'heli' ? (opts.parked ? 0 : 20) : kind === 'boat' || kind === 'jetski' ? 0.1 : groundHeight(x, z),
      heading,
      speed: 0,
      vy: 0,
      color,
      cond: 100,
      fuel: 100,
      isTraffic: !!opts.traffic,
      isParked: !!opts.parked,
      isBus: specKey === 'bus',
      isPlayer: false,
      occupied: !!opts.traffic, // a traffic car has a driver aboard
      alarmOn: false,
      dead: false,
      parked: !!opts.parked,
      group: visual.group,
      wheels: visual.wheels || [],
      rotor,
      tailRotor,
      headlights: [hlL, hlR],
      isGLB: !!visual.isGLB,
      // Traffic AI state.
      axis: null, road: 0, dir: 1, lane: 0,
      cruise: 9 + this.rng() * 4,
      refuel() { this.fuel = 100; },
      repair() { this.cond = 100; },
    };
    if (car.isTraffic) {
      // Put it on a road with a lane offset and a driving direction.
      const ns = this.rng() < 0.5;
      car.axis = ns ? 'ns' : 'ew';
      car.road = pick(this.rng, ROADS);
      car.dir = this.rng() < 0.5 ? 1 : -1;
      car.lane = (this.rng() < 0.5 ? -1 : 1) * 2;
      if (ns) {
        car.x = car.road + car.lane;
        car.z = rand(this.rng, 20, 240);
        car.heading = car.dir > 0 ? 0 : Math.PI;
      } else {
        car.z = car.road + car.lane;
        car.x = rand(this.rng, 20, 240);
        car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      car.y = groundHeight(car.x, car.z);
      car.speed = car.cruise * (0.7 + this.rng() * 0.3);
    }
    car.group.position.set(car.x, car.y, car.z);
    car.group.rotation.set(0, car.heading, 0);
    this.scene.add(car.group);
    this.cars.push(car);
    return car;
  }

  spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      // GLB-first mix: ~75% of traffic is a loaded GLB model.
      const key = this.rng() < 0.75
        ? pick(this.rng, GLB_STREET)
        : pick(this.rng, STREET_SPECS);
      this.spawn(key, 0, 0, 0, { traffic: true });
    }
  }

  spawnParked(n) {
    for (let i = 0; i < n; i++) {
      const ns = this.rng() < 0.5;
      const road = pick(this.rng, ROADS);
      const along = rand(this.rng, 30, 235);
      const side = (this.rng() < 0.5 ? -1 : 1) * 4.2;
      const key = pick(this.rng, ['sedan', 'suv', 'pickup', 'taxi', 'van']);
      let x, z, heading;
      if (ns) {
        x = road + side;
        z = along;
        heading = this.rng() < 0.5 ? 0 : Math.PI;
      } else {
        x = along;
        z = road + side;
        heading = this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      }
      // Keep parked cars off intersections and out of the sea.
      if (isSea(x, z)) continue;
      this.spawn(key, x, z, heading, { parked: true });
    }
  }

  spawnDealerLot() {
    // Auto Palms forecourt: the first eight catalog cars in two rows.
    // Four of the eight are loaded GLBs, so the lot is >= 50% GLB.
    const lot = CAR_CATALOG.slice(0, 8);
    const dx = PLACES.dealer.x;
    const dz = PLACES.dealer.y + 13;
    lot.forEach((key, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = dx - 13.5 + col * 9;
      const z = dz + row * 7;
      const car = this.spawn(key, x, z, 0, { parked: true });
      if (key === 'sport') car.color = 0xe01e37; // the red Comet (mission 8)
    });
  }

  spawnBus() {
    const bus = this.spawn('bus', 65, 65, 0, { parked: false });
    bus.isBus = true;
    bus.isTraffic = false;
    bus.cruise = 8;
    bus.speed = 8;
    bus.route = [
      { x: 65, z: 65 }, { x: 65, z: 195 }, { x: 195, z: 195 }, { x: 195, z: 65 },
    ];
    bus.wp = 0;
    this.bus = bus;
    return bus;
  }

  spawnBoats() {
    const spots = [
      ['boat', 8, 100], ['boat', 6, 160], ['boat', 10, 220],
      ['jetski', 7, 60], ['jetski', 9, 190], ['jetski', 5, 240],
    ];
    for (const [kind, x, z] of spots) {
      const boat = this.spawn(kind === 'boat' ? 'sedan' : 'motor', x, z, rand(this.rng, 0, Math.PI * 2), { kind, parked: false });
      boat.cruise = kind === 'jetski' ? 6 : 4;
      boat.speed = boat.cruise;
    }
  }

  spawnHeli(x, z) {
    // The airport helicopter, parked on the tarmac (rotor still).
    const heli = this.spawn('police', x, z, 0, { kind: 'heli', parked: true });
    heli.y = 0;
    heli.group.position.y = 0;
    return heli;
  }

  nearestCar(x, z, dist, filter) {
    let best = null;
    let bd = dist;
    for (const c of this.cars) {
      if (c.dead || c.kind === 'heli' || c.kind === 'boat' || c.kind === 'jetski') continue;
      if (filter && !filter(c)) continue;
      const d = dist2d(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  enterCar(car) {
    if (!car || car.dead) return false;
    if (this.playerCar) this.exitCar();
    this.playerCar = car;
    car.isPlayer = true;
    car.isTraffic = false;
    car.isParked = false;
    car.occupied = null;
    const p = this.game.player;
    if (p) {
      p.inCar = car;
      p.group.visible = false;
    }
    // Night headlight beam on the player's car.
    car.group.add(this.headlight);
    car.group.add(this.headlightTarget);
    return true;
  }

  exitCar() {
    const car = this.playerCar;
    if (!car) return;
    this.playerCar = null;
    car.isPlayer = false;
    car.isParked = true; // left where it stands
    car.group.remove(this.headlight);
    car.group.remove(this.headlightTarget);
    const p = this.game.player;
    if (p) {
      p.inCar = null;
      // Step out on the driver's side.
      p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.2;
      p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.2;
      p.y = groundHeight(p.x, p.z);
      p.group.position.set(p.x, p.y, p.z);
      p.group.visible = true;
    }
  }

  stealCar(car) {
    if (!car || car.dead) return false;
    if (car.occupied) {
      // The driver bails out and runs away in a panic.
      this._driverFlees(car);
      car.occupied = null;
    } else if (car.isParked) {
      // An empty parked car: the alarm rings (one four-beep burst).
      this.game.audio?.alarm();
      car.alarmOn = true;
    }
    this.enterCar(car);
    // Stealing a car is instantly one star of heat.
    this.game.police?.addHeat(1, 'grand theft auto');
    return true;
  }

  // A fleeing driver: a procedural humanoid that sprints away from the
  // player for a few seconds, then is removed. Purely visual.
  _driverFlees(car) {
    const driver = car.occupied;
    // A real NPC driver (an object with a state machine) flees through its
    // own AI: set it to flee from the player for 4 s.
    if (driver && typeof driver === 'object' && 'state' in driver) {
      driver.state = 'flee';
      driver.fleeFrom = {
        x: this.game.player ? this.game.player.x : car.x,
        z: this.game.player ? this.game.player.z : car.z,
      };
      driver._fleeT = 4;
      return;
    }
    // Traffic cars carry a boolean driver: spawn a procedural fleer visual.
    const built = buildProceduralHumanoid({ shirt: 0xd8d2c4 });
    const g = built.group;
    const px = this.game.player ? this.game.player.x : car.x;
    const pz = this.game.player ? this.game.player.z : car.z;
    const away = Math.atan2(car.x - px, car.z - pz);
    g.position.set(car.x + Math.sin(away) * 1.5, groundHeight(car.x, car.z), car.z + Math.cos(away) * 1.5);
    g.rotation.y = away;
    this.scene.add(g);
    const fleer = { g, away, t: 0 };
    fleer.step = (dt) => {
      fleer.t += dt;
      const nx = g.position.x + Math.sin(fleer.away) * 6 * dt;
      const nz = g.position.z + Math.cos(fleer.away) * 6 * dt;
      g.position.set(nx, groundHeight(nx, nz), nz);
      // Simple leg swing while running.
      if (built.parts && built.parts.legL && built.parts.legR) {
        const s = Math.sin(fleer.t * 12) * 0.6;
        built.parts.legL.rotation.x = s;
        built.parts.legR.rotation.x = -s;
      }
      if (fleer.t > 4) {
        this.scene.remove(g);
        this.fleers = this.fleers.filter((f) => f !== fleer);
      }
    };
    this.fleers = this.fleers || [];
    this.fleers.push(fleer);
  }

  // -------------------------------------------------------------------------
  // Update loop. Anti-flip is structural: the group rotation is rebuilt
  // from (0, heading, 0) every frame, the car is re-grounded, and any
  // tilt past 45 degrees is corrected back to level on the spot.
  // -------------------------------------------------------------------------
  update(dt, input) {
    const g = this.game;
    const night = !!(g.weather && typeof g.weather.isNight === 'function' && g.weather.isNight());

    for (const car of this.cars) {
      if (car.dead) continue;
      // Headlight glow at night.
      for (const hl of car.headlights) hl.visible = night;
      if (car.kind === 'heli') {
        this._updateHeli(car, dt, input);
      } else if (car.kind === 'boat' || car.kind === 'jetski') {
        this._updateBoat(car, dt, input);
      } else if (car === this.playerCar) {
        this._updatePlayerCar(car, dt, input);
      } else if (car.isBus && car.route) {
        this._updateBus(car, dt);
      } else if (car.isTraffic) {
        this._updateTraffic(car, dt);
      }
      // --- anti-flip: rebuild the rotation flat every single frame. ---
      car.group.rotation.x = 0;
      car.group.rotation.z = 0;
      car.group.rotation.y = car.heading;
      // Spin the wheels with the road speed.
      const spin = car.speed * dt / 0.35;
      for (const w of car.wheels) w.rotation.x += spin;
      // Sync the group to the kinematic state.
      car.group.position.set(car.x, car.y, car.z);
    }

    // Fleeing drivers keep running for a few seconds.
    if (this.fleers) {
      for (const f of this.fleers.slice()) f.step(dt);
    }

    // Car-vs-car collisions (circle push-apart + damage on hard hits).
    this._collideCars(dt);

    // The player car must not drive through buildings.
    if (this.playerCar) this._collideBuildings(this.playerCar);
  }

  _updatePlayerCar(car, dt, input) {
    const spec = car.spec;
    const top = spec.top || 32;
    const nitro = input && input.nitro && car.fuel > 0;
    const maxFwd = nitro ? top * 1.5 : top;
    // Fuel: only the player's car burns it; empty tank = no power.
    if (Math.abs(car.speed) > 0.5) {
      car.fuel = Math.max(0, car.fuel - (Math.abs(car.speed) / top) * dt * (nitro ? 1.6 : 0.8));
    }
    if (input) {
      if (input.fwd && car.fuel > 0) {
        car.speed += spec.accel * dt * (nitro ? 1.4 : 1);
      } else if (input.back) {
        // Brake, then reverse up to 8 m/s.
        if (car.speed > 0.5) car.speed -= spec.accel * 1.6 * dt;
        else car.speed = Math.max(-8, car.speed - spec.accel * 0.7 * dt);
      } else {
        // Rolling drag.
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
      }
      if (input.handbrake) {
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
      }
      // Steering only works while moving; sharper at low speed, and the
      // handbrake lets the car rotate harder (drift).
      const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      const spd = Math.abs(car.speed);
      if (steer !== 0 && spd > 0.2) {
        const rate = spec.turn * (1 - (spd / maxFwd) * 0.45) * (input.handbrake ? 1.7 : 1);
        car.heading += steer * rate * dt * Math.sign(car.speed);
      }
    }
    car.speed = clamp(car.speed, -8, maxFwd);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    // Keep the car inside the island (the sea stops it, not the void).
    car.x = clamp(car.x, 2, 398);
    car.z = clamp(car.z, 2, 398);
    // Stunt ramps: a fast car over a ramp spot launches into a vertical
    // arc — the car never pitches or rolls, it just goes up and comes
    // back down level.
    const stunts = this.game.stunts || [];
    if (car.vy === 0 && Math.abs(car.speed) > 15) {
      for (const s of stunts) {
        if (s.cd > 0) continue;
        if (dist2d(car.x, car.z, s.x, s.z) < 3) {
          car.vy = 7.5;
          s.cd = 30;
          break;
        }
      }
    }
    const ground = groundHeight(car.x, car.z);
    if (car.vy !== 0 || car.y > ground + 0.05) {
      car.y += car.vy * dt;
      car.vy -= 22 * dt;
      if (car.y <= ground) {
        car.y = ground;
        car.vy = 0;
      }
    } else {
      car.y = ground;
    }
    // Damage makes the car sluggish; it never fully dies on the player.
    if (car.cond < 30) car.speed *= 1 - 0.15 * dt;
  }

  _updateTraffic(car, dt) {
    const g = this.game;
    let target = car.cruise;
    // Red light: stop before the next intersection.
    if (g.trafficRed) {
      const along = car.axis === 'ns' ? car.z : car.x;
      for (const r of ROADS) {
        const ahead = car.dir > 0 ? r - along : along - r;
        if (ahead > 0 && ahead < 10) { target = 0; break; }
      }
    }
    // Car ahead in the same lane: match its speed.
    for (const o of this.cars) {
      if (o === car || o.dead || o.kind !== 'car') continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const forward = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
      const side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
      if (forward > 0 && forward < 8 && side < 2.5) {
        target = Math.min(target, Math.max(0, o.speed));
      }
    }
    // Accelerate / brake toward the target speed.
    if (car.speed < target) car.speed = Math.min(target, car.speed + 6 * dt);
    else if (car.speed > target) car.speed = Math.max(target, car.speed - 12 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    // Turn at intersections sometimes (keeps traffic spread over the grid).
    const along = car.axis === 'ns' ? car.z : car.x;
    for (const r of ROADS) {
      if (Math.abs(along - r) < 1.2 && this.rng() < 0.06) {
        const crossNs = car.axis === 'ew';
        const newRoad = r;
        const newDir = this.rng() < 0.5 ? 1 : -1;
        const newLane = (this.rng() < 0.5 ? -1 : 1) * 2;
        if (crossNs) {
          car.axis = 'ns';
          car.road = newRoad;
          car.x = newRoad + newLane;
          car.dir = newDir;
          car.heading = newDir > 0 ? 0 : Math.PI;
        } else {
          car.axis = 'ew';
          car.road = newRoad;
          car.z = newRoad + newLane;
          car.dir = newDir;
          car.heading = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        break;
      }
    }
    // Out of the grid: respawn on a random road so traffic never thins.
    if (car.x < 4 || car.x > 256 || car.z < 4 || car.z > 256) {
      const ns = this.rng() < 0.5;
      car.axis = ns ? 'ns' : 'ew';
      car.road = pick(this.rng, ROADS);
      car.dir = this.rng() < 0.5 ? 1 : -1;
      car.lane = (this.rng() < 0.5 ? -1 : 1) * 2;
      if (ns) {
        car.x = car.road + car.lane;
        car.z = rand(this.rng, 20, 240);
        car.heading = car.dir > 0 ? 0 : Math.PI;
      } else {
        car.z = car.road + car.lane;
        car.x = rand(this.rng, 20, 240);
        car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    car.y = groundHeight(car.x, car.z);
  }

  _updateBus(car, dt) {
    if (this.busStopT > 0) {
      this.busStopT -= dt;
      car.speed = 0;
      return;
    }
    const wp = car.route[car.wp];
    const dx = wp.x - car.x;
    const dz = wp.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 4) {
      car.wp = (car.wp + 1) % car.route.length;
      // Pause at the bus stops on the route corners.
      this.busStopT = 3;
      car.speed = 0;
      return;
    }
    car.heading = Math.atan2(dx, dz);
    car.speed = car.cruise;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    car.y = groundHeight(car.x, car.z);
  }

  _updateBoat(car, dt, input) {
    const isPlayer = car === this.playerBoat;
    if (isPlayer && input) {
      const top = car.specKey === 'motor' ? 24 : 18;
      if (input.fwd) car.speed = Math.min(top, car.speed + 10 * dt);
      else if (input.back) car.speed = Math.max(0, car.speed - 12 * dt);
      else car.speed = Math.max(0, car.speed - 4 * dt);
      const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      if (steer !== 0 && car.speed > 0.5) car.heading += steer * 1.8 * dt;
    } else {
      // AI boats cruise the bay slowly, turning back at the shore.
      if (this.rng() < 0.002) car.heading += (this.rng() - 0.5) * 1.2;
      car.speed = car.cruise;
    }
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    // Stay in the sea: the beach turns boats back west.
    if (car.x > 13) {
      car.heading = Math.PI + (Math.PI - car.heading);
      car.x = 13;
    }
    if (car.x < 1) { car.heading = -car.heading; car.x = 1; }
    if (car.z < 2) { car.heading = Math.PI - car.heading; car.z = 2; }
    if (car.z > 398) { car.heading = Math.PI - car.heading; car.z = 398; }
    car.y = 0.1;
  }

  _updateHeli(car, dt, input) {
    if (car.rotor) car.rotor.rotation.y += dt * (car.parked && car !== this.playerHeli ? 0 : 22);
    if (car.tailRotor) car.tailRotor.rotation.x += dt * 30;
    if (car === this.playerHeli && input) {
      const top = 22;
      if (input.fwd) car.speed = Math.min(top, car.speed + 12 * dt);
      else if (input.back) car.speed = Math.max(-6, car.speed - 12 * dt);
      else car.speed = Math.max(0, car.speed - 6 * dt);
      const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      if (steer !== 0) car.heading += steer * 1.6 * dt;
      if (input.up) car.y = Math.min(60, car.y + 9 * dt);
      if (input.down) car.y = Math.max(1, car.y - 9 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      car.x = clamp(car.x, 2, 398);
      car.z = clamp(car.z, 2, 398);
    } else if (car.parked) {
      // The airport helicopter sits on the tarmac.
      car.y = 0;
    }
    // The LVPD heli is driven by police.js (it sets x/y/z itself); the
    // group sync in update() keeps the visual on the kinematic state.
  }

  _collideCars(dt) {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.dead || a.kind === 'heli') continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.dead || b.kind === 'heli') continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const rr = (a.spec.len + b.spec.len) / 4 + 0.6;
        const d2 = dx * dx + dz * dz;
        if (d2 > rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        // A hard hit damages both cars and makes a crash sound.
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 6) {
          a.cond = Math.max(5, a.cond - impact * 0.4);
          b.cond = Math.max(5, b.cond - impact * 0.4);
          a.speed *= 0.6;
          b.speed *= 0.6;
          if (a === this.playerCar || b === this.playerCar) {
            this.game.audio?.crash?.(Math.min(1, impact / 20));
          }
        } else {
          // Gentle nudge: traffic yields.
          if (a.isTraffic) a.speed = Math.min(a.speed, b.speed);
          if (b.isTraffic) b.speed = Math.min(b.speed, a.speed);
        }
      }
    }
  }

  _collideBuildings(car) {
    const colliders = this.game.city?.colliders;
    if (!colliders) return;
    const r = (car.spec.wid || 1.9) / 2 + 0.3;
    for (const c of colliders) {
      if (car.x > c.x0 - r && car.x < c.x1 + r && car.z > c.z0 - r && car.z < c.z1 + r) {
        const pushL = car.x - (c.x0 - r);
        const pushR = (c.x1 + r) - car.x;
        const pushU = car.z - (c.z0 - r);
        const pushD = (c.z1 + r) - car.z;
        const m = Math.min(pushL, pushR, pushU, pushD);
        if (m === pushL) car.x = c.x0 - r;
        else if (m === pushR) car.x = c.x1 + r;
        else if (m === pushU) car.z = c.z0 - r;
        else car.z = c.z1 + r;
        if (Math.abs(car.speed) > 8) {
          car.cond = Math.max(5, car.cond - 4);
          this.game.audio?.crash?.(0.4);
        }
        car.speed *= 0.5;
      }
    }
  }
}
