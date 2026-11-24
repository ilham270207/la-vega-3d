// La Vega 3D — vehicles (round 6 re-author).
//
// Owns every moving vehicle: the player's car / boat / jet ski / helicopter,
// street traffic, parked cars, the dealer lot and the city bus. Cars prefer
// the detailed GLB models and fall back to the procedural builders when a
// model is missing or has not loaded yet.
//
// A car record is plain data + a THREE group:
//   specKey, kind ('car' | 'boat' | 'jetski' | 'heli'), spec, x, y, z,
//   heading, speed, color, cond (0..100), fuel (0..100), nitro (0..100),
//   isTraffic, isParked, isBus, isPlayer, occupied (driver NPC or null),
//   alarmOn, alarmT, dead, group, wheels, aiSpeed, rotor.
// Methods on a car: refuel(), repair(), damage(n).
import * as THREE from 'three';
import { CAR_MODELS, CAR_CATALOG, PLACES, ROADS, WORLD } from './config.js';
import { clamp, damp, dist2d, rand, pick, angleLerp } from './rng.js';
import { groundHeight, isSea, isInRiver, isOnRoad } from './city.js';
import { cloneCar, buildProceduralCar, buildProceduralTruck, buildProceduralVan, loadBuyCar, MODELS } from './loader.js';

// Specs for the vehicles that have no CAR_MODELS entry (water + air).
const BOAT_SPEC = { name: 'Speedboat', len: 6.0, wid: 2.2, accel: 15, top: 30, turn: 2.1, colors: [0xf2f5f7, 0xd92038, 0x2a6fd6], price: 0, hp: 120 };
const JETSKI_SPEC = { name: 'Jet Ski', len: 2.6, wid: 1.0, accel: 20, top: 34, turn: 3.0, colors: [0x22c3aa, 0xffd34d, 0xff2a9d], price: 0, hp: 60 };
const HELI_SPEC = { name: 'Helicopter', len: 7.0, wid: 2.4, accel: 12, top: 28, turn: 2.0, colors: [0xe8e8e8, 0xd92038], price: 0, hp: 200 };

// Specs the traffic AI picks from (weighted toward ordinary street cars).
const TRAFFIC_SPECS = ['sedan', 'sedan', 'suv', 'taxi', 'sport', 'pickup', 'van', 'truck', 'motor'];
const PARKED_SPECS = ['sedan', 'suv', 'sport', 'pickup', 'van', 'motor', 'sedan', 'taxi'];

function lam(color) { return new THREE.MeshLambertMaterial({ color }); }
function basic(color) { return new THREE.MeshBasicMaterial({ color }); }

// ---------------------------------------------------------------------------
// Procedural builders for the vehicles the loader has no builder for.
// ---------------------------------------------------------------------------

// A motorbike: two wheels, a frame, a tank, a seat, handlebars, a headlight.
function buildBike(spec, color) {
  const group = new THREE.Group();
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x16161a });
  const wheels = [];
  for (const z of [-0.62, 0.62]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.32, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  const bodyMat = lam(color);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.55), bodyMat);
  tank.position.set(0, 0.72, -0.05);
  tank.castShadow = true;
  group.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.6), lam(0x1a1a1a));
  seat.position.set(0, 0.78, -0.45);
  group.add(seat);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.1), lam(0x2a2a2e));
  frame.position.set(0, 0.55, 0);
  group.add(frame);
  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.06), lam(0x2a2a2e));
  bars.position.set(0, 0.95, 0.6);
  group.add(bars);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.08), basic(0xfff2b0));
  lamp.position.set(0, 0.78, 0.72);
  group.add(lamp);
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), lam(0x8a8a92));
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.18, 0.42, -0.35);
  group.add(exhaust);
  return { group, wheels };
}

// A speedboat: hull, deck, windshield, two seats, an outboard motor.
function buildBoat(spec, color) {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 0.7, spec.len), lam(color));
  hull.position.y = 0.35;
  hull.castShadow = true;
  group.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(spec.wid * 0.5, 1.4, 4), lam(color));
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.35, spec.len / 2 + 0.7);
  group.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(spec.wid - 0.3, 0.12, spec.len - 1.4), lam(0x2a2a2e));
  deck.position.set(0, 0.72, -0.3);
  group.add(deck);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(spec.wid - 0.5, 0.55, 0.1), new THREE.MeshLambertMaterial({ color: 0x9ecfff, transparent: true, opacity: 0.7 }));
  shield.position.set(0, 1.0, 0.9);
  shield.rotation.x = 0.25;
  group.add(shield);
  for (const z of [-0.1, -0.9]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), lam(0x3a3a3a));
    seat.position.set(0, 0.95, z);
    group.add(seat);
  }
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.4), lam(0x1a1a1a));
  motor.position.set(0, 0.45, -spec.len / 2 - 0.15);
  group.add(motor);
  return { group, wheels: [] };
}

// A jet ski: a small hull, a seat and a handlebar.
function buildJetSki(spec, color) {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 0.45, spec.len), lam(color));
  hull.position.y = 0.28;
  hull.castShadow = true;
  group.add(hull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(spec.wid * 0.5, 0.9, 4), lam(color));
  nose.rotation.x = Math.PI / 2;
  nose.rotation.y = Math.PI / 4;
  nose.position.set(0, 0.28, spec.len / 2 + 0.45);
  group.add(nose);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 1.0), lam(0x1a1a1a));
  seat.position.set(0, 0.58, -0.35);
  group.add(seat);
  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), lam(0x2a2a2e));
  bars.position.set(0, 0.72, 0.35);
  group.add(bars);
  return { group, wheels: [] };
}

// A helicopter: cabin, tail boom, tail fin + rotor, main rotor, skids.
function buildHeli(spec, color) {
  const group = new THREE.Group();
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 1.5, 3.2), lam(color));
  cabin.position.y = 1.4;
  cabin.castShadow = true;
  group.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(spec.wid - 0.3, 0.7, 0.9), new THREE.MeshLambertMaterial({ color: 0x9ecfff, transparent: true, opacity: 0.75 }));
  glass.position.set(0, 1.5, 1.2);
  group.add(glass);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), lam(color));
  boom.position.set(0, 1.6, -3.2);
  group.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.8), lam(0xd92038));
  fin.position.set(0, 2.2, -4.8);
  group.add(fin);
  const rotorMat = lam(0x1a1a1a);
  const rotor = new THREE.Group();
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.06, 0.35), rotorMat);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  rotor.position.y = 2.35;
  group.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.2), rotorMat);
  tailRotor.position.set(0.35, 2.2, -4.8);
  group.add(tailRotor);
  for (const x of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.6), lam(0x2a2a2e));
    skid.position.set(x, 0.25, 0);
    group.add(skid);
    for (const z of [-1.2, 1.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), lam(0x2a2a2e));
      leg.position.set(x, 0.55, z);
      group.add(leg);
    }
  }
  return { group, wheels: [], rotor, tailRotor };
}

// ---------------------------------------------------------------------------
// Car factory: picks the right model for a spec and builds the record.
// ---------------------------------------------------------------------------
function makeCar(game, specKey, x, z, heading, opts = {}) {
  const kind = opts.kind || (specKey === 'boat' ? 'boat' : specKey === 'jetski' ? 'jetski' : specKey === 'heli' ? 'heli' : 'car');
  const spec = kind === 'boat' ? BOAT_SPEC : kind === 'jetski' ? JETSKI_SPEC : kind === 'heli' ? HELI_SPEC : CAR_MODELS[specKey];
  if (!spec) return null;
  const color = opts.color !== undefined ? opts.color : pick(game.rng, spec.colors);
  let built;
  if (kind === 'boat') built = buildBoat(spec, color);
  else if (kind === 'jetski') built = buildJetSki(spec, color);
  else if (kind === 'heli') built = buildHeli(spec, color);
  else if (specKey === 'motor') built = buildBike(spec, color);
  else if (spec.glb && MODELS.cars[spec.glb]) built = cloneCar(MODELS.cars[spec.glb], spec, color);
  else if (spec.proc === 'truck') built = buildProceduralTruck(spec, color);
  else if (spec.proc === 'van' || spec.proc === 'bus' || spec.proc === 'ambulance' || spec.proc === 'firetruck') {
    built = buildProceduralVan(spec, color, specKey === 'bus' ? 'bus' : specKey === 'ambulance' ? 'ambulance' : specKey === 'firetruck' ? 'firetruck' : 'van');
  } else built = buildProceduralCar(spec, color);
  const y = kind === 'boat' || kind === 'jetski' ? 0.2 : kind === 'heli' ? 0.0 : groundHeight(x, z);
  const group = built.group;
  group.position.set(x, y, z);
  group.rotation.y = heading;
  game.scene.add(group);
  const car = {
    specKey, kind, spec, x, y, z, heading, speed: 0,
    color, cond: opts.cond !== undefined ? opts.cond : 100,
    fuel: opts.fuel !== undefined ? opts.fuel : 100,
    nitro: 100,
    isTraffic: !!opts.traffic, isParked: !!opts.parked, isBus: specKey === 'bus',
    isPlayer: false, occupied: null, alarmOn: false, alarmT: 0, dead: false,
    group, wheels: built.wheels || [], rotor: built.rotor || null, tailRotor: built.tailRotor || null,
    aiSpeed: rand(game.rng, 8, 14), ai: null, busStop: 0, busRoute: null, busIdx: 0,
    refuel() { this.fuel = 100; },
    repair() { this.cond = 100; },
    damage(n) { this.cond = Math.max(0, this.cond - n); if (this.cond <= 0) this.dead = true; },
  };
  return car;
}

// ---------------------------------------------------------------------------
// VehicleManager.
// ---------------------------------------------------------------------------
export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.playerCar = null;
    this.playerBoat = null;
    this.playerHeli = null;
    this._busRoute = null;
  }

  spawn(specKey, x, z, heading = 0, opts = {}) {
    const car = makeCar(this.game, specKey, x, z, heading, opts);
    if (!car) return null;
    this.cars.push(car);
    return car;
  }

  // Street traffic: cars that drive the road grid on their own.
  spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const road = pick(this.game.rng, ROADS);
      const along = 24 + this.game.rng() * 212;
      const onNS = this.game.rng() < 0.5;
      const lane = this.game.rng() < 0.5 ? -2.5 : 2.5;
      const x = onNS ? road + lane : along;
      const z = onNS ? along : road + lane;
      // Right-hand traffic: east lane drives +z, west lane -z; south lane
      // drives +x, north lane -x. Forward is (sin h, cos h).
      const heading = onNS ? (lane < 0 ? Math.PI : 0) : (lane < 0 ? Math.PI / 2 : -Math.PI / 2);
      const car = this.spawn(pick(this.game.rng, TRAFFIC_SPECS), x, z, heading, { traffic: true });
      if (!car) continue;
      car.ai = {
        axis: onNS ? 'z' : 'x',
        road,
        dir: onNS ? (lane < 0 ? -1 : 1) : (lane < 0 ? 1 : -1),
        lane,
        turnT: 0,
      };
      car.speed = car.aiSpeed;
    }
  }

  // Parked cars along the curbs (carjacking targets).
  spawnParked(n) {
    for (let i = 0; i < n; i++) {
      const road = pick(this.game.rng, ROADS);
      const along = 30 + this.game.rng() * 200;
      const onNS = this.game.rng() < 0.5;
      const side = this.game.rng() < 0.5 ? -1 : 1;
      const x = onNS ? road + side * 7.6 : along;
      const z = onNS ? along : road + side * 7.6;
      if (x < 34 || x > 256 || z < 6 || z > 254) continue;
      const heading = onNS ? (side < 0 ? Math.PI : 0) : (side < 0 ? -Math.PI / 2 : Math.PI / 2);
      this.spawn(pick(this.game.rng, PARKED_SPECS), x, z, heading, { parked: true });
    }
  }

  // The dealer lot: the catalog cars for sale + the red sport for mission 8.
  // Catalog cars are buycars (their GLB loads from models/); spawn the
  // procedural fallback immediately and swap in the real model when it
  // arrives so the lot always shows the actual cars for sale.
  spawnDealerLot() {
    const d = PLACES.dealer;
    if (!d) return;
    const lot = CAR_CATALOG.slice(0, 8);
    lot.forEach((key, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = d.x - 12 + col * 8;
      const z = d.y + 8 + row * 9;
      const car = this.spawn(key, x, z, Math.PI, { parked: true });
      if (!car) return;
      car.forSale = { key, price: CAR_MODELS[key] ? CAR_MODELS[key].price : 0 };
      const spec = CAR_MODELS[key];
      if (spec && spec.buycar && spec.file) this._upgradeLotCar(car, key, spec);
    });
    // The red sport the mission asks for sits at the front of the lot.
    const red = this.spawn('sport', d.x + 14, d.y + 4, Math.PI / 2, { parked: true, color: 0xe01e37 });
    if (red) red.forSale = { key: 'sport', price: CAR_MODELS.sport.price };
  }

  // Swap a dealer-lot car to its real GLB model once it has loaded.
  async _upgradeLotCar(car, key, spec) {
    try {
      const gltf = await loadBuyCar(spec.file);
      if (!gltf || !this.cars.includes(car)) return;
      MODELS.cars[key] = gltf;
      spec.glb = key;
      const built = cloneCar(gltf, spec, car.color);
      this.game.scene.remove(car.group);
      built.group.position.set(car.x, car.y, car.z);
      built.group.rotation.y = car.heading;
      this.game.scene.add(built.group);
      car.group = built.group;
      car.wheels = built.wheels || [];
    } catch (e) { /* keep the procedural fallback */ }
  }

  // The city bus: loops the main avenues and stops at the bus shelters.
  spawnBus() {
    const route = [
      [117, 39], [117, 117], [117, 195], [195, 195], [195, 117], [195, 39], [117, 39],
    ];
    const bus = this.spawn('bus', 117, 39, 0, { traffic: false });
    if (!bus) return null;
    bus.isBus = true;
    bus.busRoute = route;
    bus.busIdx = 1;
    bus.busStop = 0;
    bus.aiSpeed = 9;
    bus.speed = 9;
    return bus;
  }

  // Boats at the harbor + a jet ski near the beach.
  spawnBoats() {
    this.spawn('boat', 9, 128, Math.PI / 2, { parked: true });
    this.spawn('boat', 11, 150, Math.PI / 2, { parked: true });
    this.spawn('jetski', 8, 96, 0, { parked: true });
    this.spawn('jetski', 10, 168, Math.PI, { parked: true });
  }

  // A civilian helicopter on the airport tarmac.
  spawnHeli(x = 336, z = 148) {
    return this.spawn('heli', x, z, Math.PI / 2, { parked: true });
  }

  nearestCar(x, z, maxD = 12, filter = null) {
    let best = null, bestD = maxD;
    for (const car of this.cars) {
      if (car.dead) continue;
      if (filter && !filter(car)) continue;
      const d = dist2d(x, z, car.x, car.z);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  // Steal a car: the driver (if any) bails out and flees, a parked car sets
  // its alarm off, and the police take notice. Returns true on success.
  stealCar(car) {
    const g = this.game;
    if (!car || car.dead || car.isBus) return false;
    if (car.occupied) {
      const driver = car.occupied;
      car.occupied = null;
      if (g.characters && g.characters.npcFlee) g.characters.npcFlee(driver, g.player.x, g.player.z);
    }
    if (car.isParked) {
      car.alarmOn = true;
      car.alarmT = 4;
      if (g.audio && g.audio.alarm) g.audio.alarm();
    }
    if (g.police) g.police.addHeat(1, 'carjacking');
    this.enterCar(car);
    return true;
  }

  enterCar(car) {
    const g = this.game;
    this.playerCar = car;
    car.isPlayer = true;
    car.isParked = false;
    car.isTraffic = false;
    car.ai = null;
    g.player.inCar = car;
    g.player.group.visible = false;
    if (g.police) g.police.onPlayerEnterCar(car);
  }

  exitCar() {
    const g = this.game;
    const car = this.playerCar;
    if (!car) return;
    car.speed = 0;
    car.isPlayer = false;
    this.playerCar = null;
    const side = car.heading + Math.PI / 2;
    g.player.x = clamp(car.x + Math.sin(side) * 2.2, 2, 398);
    g.player.z = clamp(car.z + Math.cos(side) * 2.2, 2, 398);
    g.player.y = groundHeight(g.player.x, g.player.z);
    g.player.inCar = null;
    g.player.group.visible = true;
  }

  // Push a car out of building colliders; hard hits damage it.
  _collideBuildings(car) {
    const g = this.game;
    const h = Math.max(car.spec.wid, car.spec.len) / 2 + 0.3;
    if (g.city && g.city.colliders) {
      for (const c of g.city.colliders) {
        const cx0 = car.x - h, cx1 = car.x + h, cz0 = car.z - h, cz1 = car.z + h;
        if (cx1 <= c.x0 || cx0 >= c.x1 || cz1 <= c.z0 || cz0 >= c.z1) continue;
        const pushL = cx1 - c.x0, pushR = c.x1 - cx0, pushU = cz1 - c.z0, pushD = c.z1 - cz0;
        const m = Math.min(pushL, pushR, pushU, pushD);
        if (m === pushL) car.x = c.x0 - h;
        else if (m === pushR) car.x = c.x1 + h;
        else if (m === pushU) car.z = c.z0 - h;
        else car.z = c.z1 + h;
        if (Math.abs(car.speed) > 8) {
          car.damage(4);
          if (car.isPlayer) {
            if (g.audio) g.audio.crash();
            g.shake = Math.max(g.shake || 0, 0.4);
          }
        }
        car.speed *= 0.35;
      }
    }
    car.x = clamp(car.x, 2, 398);
    car.z = clamp(car.z, 2, 398);
    if (car.kind === 'car' && car.x < 15.5) { car.x = 15.5; car.speed *= 0.5; }
  }

  // -- per-frame update ------------------------------------------------------
  update(dt, input) {
    const g = this.game;
    if (this.playerCar) this._drivePlayerCar(dt, input);
    if (this.playerBoat) this._drivePlayerBoat(dt, input);
    if (this.playerHeli) this._drivePlayerHeli(dt, input);
    for (const car of this.cars) {
      if (car.isTraffic && car.ai) this._driveTraffic(car, dt);
      else if (car.isBus && car.busRoute) this._driveBus(car, dt);
      if (car.alarmOn) {
        car.alarmT -= dt;
        if (car.alarmT <= 0) {
          car.alarmOn = false;
          if (g.audio && g.audio.alarmStop) g.audio.alarmStop();
        }
      }
      if (car.rotor) car.rotor.rotation.y += dt * 18;
      if (car.tailRotor) car.tailRotor.rotation.x += dt * 24;
      for (const wheel of car.wheels) wheel.rotation.x += car.speed * dt / 0.34;
      car.group.position.set(car.x, car.y, car.z);
      car.group.rotation.y = car.heading;
    }
    // Car-vs-car bumps (player car and traffic only; NPC hits live in main).
    this._carCollisions(dt);
  }

  // -- player driving --------------------------------------------------------
  _drivePlayerCar(dt, input) {
    const g = this.game;
    const car = this.playerCar;
    const spec = car.spec;
    const grip = g.weather ? g.weather.gripFactor() : 1;
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const top = spec.top * (car.cond < 30 ? 0.7 : 1);
    if (input.fwd && car.fuel > 0) {
      let accel = spec.accel;
      if (input.nitro && car.nitro > 0) {
        accel *= 1.9;
        car.nitro = Math.max(0, car.nitro - 45 * dt);
      }
      car.speed = damp(car.speed, top, accel / top * 2.2, dt);
      car.fuel = Math.max(0, car.fuel - dt * (0.25 + Math.abs(car.speed) / top * 0.9));
    } else if (input.back) {
      car.speed = damp(car.speed, -top * 0.4, spec.accel / top * 2.2, dt);
    } else {
      car.speed = damp(car.speed, 0, 1.4, dt);
    }
    if (input.handbrake && Math.abs(car.speed) > 6) {
      // Handbrake turn: bleed speed, slide sideways, score a drift.
      const drift = Math.abs(car.speed) * dt;
      car.speed = damp(car.speed, 0, 2.2, dt);
      if (g.onDrift && drift > 0.4) g.onDrift(drift * 12);
    }
    if (car.speed !== 0) {
      const dir = car.speed > 0 ? 1 : -1;
      car.heading += steer * spec.turn * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * dir * grip;
    }
    car.nitro = Math.min(100, car.nitro + 6 * dt);
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const px = car.x + fx * car.speed * dt;
    const pz = car.z + fz * car.speed * dt;
    car.x = px;
    car.z = pz;
    car.y = groundHeight(car.x, car.z);
    this._collideBuildings(car);
    // Keep the player on the road grid (traffic lanes), not in the sea.
    if (!isOnRoad(car.x, car.z) && car.x > 16 && car.x < 262 && car.z > 4 && car.z < 258) {
      // Off-road: rough ground slows the car.
      car.speed = damp(car.speed, 0, 0.6, dt);
    }
  }

  _drivePlayerBoat(dt, input) {
    const g = this.game;
    const boat = this.playerBoat;
    const spec = boat.spec;
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (input.fwd) boat.speed = damp(boat.speed, spec.top, spec.accel / spec.top * 2.0, dt);
    else if (input.back) boat.speed = damp(boat.speed, -spec.top * 0.3, spec.accel / spec.top * 2.0, dt);
    else boat.speed = damp(boat.speed, 0, 0.8, dt);
    if (boat.speed !== 0) {
      boat.heading += steer * spec.turn * dt * clamp(Math.abs(boat.speed) / 8, 0, 1) * (boat.speed > 0 ? 1 : -1);
    }
    boat.x += Math.sin(boat.heading) * boat.speed * dt;
    boat.z += Math.cos(boat.heading) * boat.speed * dt;
    boat.x = clamp(boat.x, 2, 17.5);
    boat.z = clamp(boat.z, 4, 396);
    boat.y = 0.2 + Math.sin(performance.now() * 0.001 + boat.z * 0.05) * 0.08;
    if (g.onDrift && Math.abs(boat.speed) > 20) { /* boats do not drift-score */ }
  }

  _drivePlayerHeli(dt, input) {
    const g = this.game;
    const heli = this.playerHeli;
    const spec = heli.spec;
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (input.fwd) heli.speed = damp(heli.speed, spec.top, spec.accel / spec.top * 2.0, dt);
    else if (input.back) heli.speed = damp(heli.speed, -spec.top * 0.3, spec.accel / spec.top * 2.0, dt);
    else heli.speed = damp(heli.speed, 0, 1.0, dt);
    heli.heading += steer * spec.turn * dt * 0.6;
    if (input.up) heli.y = Math.min(80, heli.y + 14 * dt);
    if (input.down) heli.y = Math.max(2, heli.y - 14 * dt);
    heli.x += Math.sin(heli.heading) * heli.speed * dt;
    heli.z += Math.cos(heli.heading) * heli.speed * dt;
    heli.x = clamp(heli.x, 2, 398);
    heli.z = clamp(heli.z, 2, 398);
  }

  // -- traffic AI ------------------------------------------------------------
  _driveTraffic(car, dt) {
    const g = this.game;
    const ai = car.ai;
    let target = car.aiSpeed;
    // Stop at a red light when an intersection is just ahead.
    if (g.trafficRed) {
      const pos = ai.axis === 'z' ? car.z : car.x;
      let next = null;
      for (const r of ROADS) {
        const d = (r - pos) * ai.dir;
        if (d > 0 && (next === null || d < next)) next = d;
      }
      if (next !== null && next < 12) target = 0;
    }
    // Slow down for the car ahead in the same lane.
    for (const other of this.cars) {
      if (other === car || other.kind !== 'car' || other.dead || !other.ai) continue;
      if (other.ai.axis !== ai.axis || other.ai.road !== ai.road || other.ai.dir !== ai.dir) continue;
      const along = ai.axis === 'z' ? (other.z - car.z) * ai.dir : (other.x - car.x) * ai.dir;
      const side = ai.axis === 'z' ? Math.abs(other.x - car.x) : Math.abs(other.z - car.z);
      if (along > 0 && along < 9 && side < 4) target = Math.min(target, Math.max(0, other.speed));
    }
    car.speed = damp(car.speed, target, 1.6, dt);
    if (ai.axis === 'z') {
      car.z += ai.dir * car.speed * dt;
      car.x = ai.road + ai.lane;
    } else {
      car.x += ai.dir * car.speed * dt;
      car.z = ai.road + ai.lane;
    }
    // Turn at an intersection sometimes (cooldown so it does not zig-zag).
    ai.turnT -= dt;
    if (ai.turnT <= 0) {
      const pos = ai.axis === 'z' ? car.z : car.x;
      for (const r of ROADS) {
        if (Math.abs(pos - r) < 4 && this.game.rng() < 0.22) {
          ai.axis = ai.axis === 'z' ? 'x' : 'z';
          ai.road = r;
          ai.dir = this.game.rng() < 0.5 ? -1 : 1;
          ai.lane = this.game.rng() < 0.5 ? -2.5 : 2.5;
          ai.turnT = 4;
          if (ai.axis === 'z') car.x = ai.road + ai.lane;
          else car.z = ai.road + ai.lane;
          break;
        }
      }
    }
    // End of the grid: turn around.
    const pos = ai.axis === 'z' ? car.z : car.x;
    if (pos < 10 || pos > 252) {
      ai.dir *= -1;
      ai.lane *= -1;
      ai.turnT = 2;
    }
    car.heading = ai.axis === 'z' ? (ai.dir > 0 ? 0 : Math.PI) : (ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.y = groundHeight(car.x, car.z);
  }

  // -- the city bus ----------------------------------------------------------
  _driveBus(car, dt) {
    if (car.busStop > 0) {
      car.busStop -= dt;
      car.speed = damp(car.speed, 0, 2.0, dt);
      car.y = groundHeight(car.x, car.z);
      return;
    }
    const wp = car.busRoute[car.busIdx];
    const dx = wp[0] - car.x, dz = wp[1] - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 4) {
      car.busIdx = (car.busIdx + 1) % car.busRoute.length;
      car.busStop = 4; // dwell at the stop so passengers can board
      return;
    }
    car.heading = Math.atan2(dx, dz);
    car.speed = damp(car.speed, car.aiSpeed, 1.4, dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    car.y = groundHeight(car.x, car.z);
  }

  // -- car-vs-car bumps + near-miss bonus -------------------------------------
  _carCollisions(dt) {
    const g = this.game;
    const player = this.playerCar;
    for (let i = 0; i < this.cars.length; i++) {
      const a = this.cars[i];
      if (a.kind !== 'car' || a.dead) continue;
      for (let j = i + 1; j < this.cars.length; j++) {
        const b = this.cars[j];
        if (b.kind !== 'car' || b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const minD = (a.spec.len + b.spec.len) / 2 * 0.62;
        if (d >= minD || d < 0.001) continue;
        // Push apart and bleed speed.
        const push = (minD - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        const closing = Math.abs(a.speed) + Math.abs(b.speed);
        if (closing > 6) {
          a.damage(3); b.damage(3);
          a.speed *= 0.5; b.speed *= 0.5;
          if ((a.isPlayer || b.isPlayer) && g.audio) g.audio.crash();
          if (a.isPlayer || b.isPlayer) g.shake = Math.max(g.shake || 0, 0.35);
        }
      }
      // Near miss: a traffic car whips past the player at speed without
      // touching — a small cash bonus, once per car until it is far away.
      if (player && a !== player && a.isTraffic) {
        const d = dist2d(player.x, player.z, a.x, a.z);
        if (d > 20) a._nearMissed = false;
        else if (!a._nearMissed && d < 3.6 && d > 1.6 && Math.abs(player.speed) > 12) {
          a._nearMissed = true;
          if (g.onNearMiss) g.onNearMiss();
        }
      }
    }
    void dt;
  }
}
