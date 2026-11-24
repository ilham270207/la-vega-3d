// La Vega 3D — vehicles (round 10 re-author).
//
// All cars are procedural, built from the design document and the
// dealer catalog (config CAR_MODELS). No GLB is loaded for traffic or
// the player car in this round: every wheel is a cylinder whose
// geometry is centred on its own axle, so a wheel spins in place
// instead of orbiting the car — the round-9 wheel bug (GLB wheel
// meshes with position [0,0,0] and geometry centres up to 1.3 m off)
// cannot happen by construction.
//
// Traffic drives ON the road network only: a traffic car always sits
// in a lane (road centreline +/- 1.8 m), turns only at intersections,
// stops at red lights, and U-turns at the end of a road. It never
// cuts across blocks, sidewalks, sand or sea. Parked cars sit in
// road-edge bays or on designated lots (dealer lot, garage forecourt,
// gas station) — never in the desert, the sea or a block interior.

import * as THREE from 'three';
import { CAR_MODELS, CAR_CATALOG, ROADS, WORLD } from './config.js';
import { groundHeight } from './city.js';
import { mulberry32, rand, randInt, pick, clamp, damp, angleLerp, dist2d } from './rng.js';

const ROAD_W = WORLD.roadWidth; // 10
const SEA_X = WORLD.seaX; // 15

// Right-hand lane offset for a road. A car heading +z on a north-south
// road drives at road - 1.8; heading -z at road + 1.8. East-west roads
// mirror: heading +x at road + 1.8, heading -x at road - 1.8.
function laneOffset(axis, dir) {
  return axis === 'ns' ? -dir * 1.8 : dir * 1.8;
}

function kindOf(specKey) {
  const spec = CAR_MODELS[specKey];
  if (spec.proc) return spec.proc; // truck | van | bus | ambulance | firetruck
  if (specKey === 'motor') return 'motor';
  return 'car';
}

// ---- procedural car builder (wheels correct by construction) -----------
function buildCarGroup(specKey, color) {
  const spec = CAR_MODELS[specKey];
  const kind = kindOf(specKey);
  const len = spec.len, wid = spec.wid;
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c1e24 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const hub = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });

  function box(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || paint);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  // wheels: cylinders with the axle on local X, centred on their own
  // pivot. The mesh position IS the wheel centre, so rotation.x spins
  // the wheel in place. Wheelbase and track come from the spec.
  const wheels = [];
  let wheelR = 0.33;
  let wb = len * 0.62;
  if (kind === 'truck' || kind === 'firetruck') { wheelR = 0.42; wb = len * 0.55; }
  if (kind === 'bus' || kind === 'van' || kind === 'ambulance') { wheelR = 0.4; wb = len * 0.6; }
  if (kind === 'motor') { wheelR = 0.3; wb = 1.4; }
  const track = kind === 'motor' ? 0 : wid / 2 - 0.12;
  function wheel(x, z) {
    const geo = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 12);
    geo.rotateZ(Math.PI / 2); // axle -> local X
    const m = new THREE.Mesh(geo, tyre);
    m.position.set(x, wheelR, z);
    group.add(m);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.26, 10), hub);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(x, wheelR, z);
    group.add(cap);
    // wheels are raw meshes (loader.js contract): police.js spins them via
    // w.rotation.x, so the radius + hub cap ride on the mesh itself.
    m.r = wheelR;
    m.cap = cap;
    wheels.push(m);
    return m;
  }

  if (kind === 'motor') {
    box(0.5, 0.35, 1.9, 0, 0.62, 0, trim);
    box(0.4, 0.5, 0.5, 0, 0.95, -0.3, paint);
    const bar = box(0.9, 0.06, 0.06, 0, 1.05, 0.55, trim);
    bar.rotation.x = 0.3;
    wheel(0, wb / 2);
    wheel(0, -wb / 2);
  } else if (kind === 'bus') {
    box(wid, 1.5, len, 0, 1.05, 0, paint);
    box(wid * 0.92, 0.7, len * 0.8, 0, 1.7, 0, glass);
    box(wid + 0.1, 0.25, len, 0, 1.95, 0, trim);
    box(0.5, 0.9, 0.4, wid / 2 - 0.2, 0.6, len / 2 - 0.4, glass); // door
    wheel(track, wb / 2); wheel(-track, wb / 2);
    wheel(track, -wb / 2); wheel(-track, -wb / 2);
  } else if (kind === 'truck') {
    box(wid, 0.9, 1.9, 0, 0.85, len / 2 - 0.95, paint); // cab
    box(wid * 0.9, 0.7, 1.4, 0, 1.55, len / 2 - 0.95, glass);
    box(wid, 0.25, len - 2.1, 0, 0.75, -1.0, trim); // bed floor
    box(wid, 0.8, 0.2, 0, 1.1, -len / 2 + 0.1, paint); // bed tail
    box(0.2, 0.8, len - 2.1, wid / 2 - 0.1, 1.1, -1.0, paint);
    box(0.2, 0.8, len - 2.1, -wid / 2 + 0.1, 1.1, -1.0, paint);
    wheel(track, wb / 2); wheel(-track, wb / 2);
    wheel(track, -wb / 2); wheel(-track, -wb / 2);
  } else if (kind === 'van' || kind === 'ambulance') {
    box(wid, 1.5, len, 0, 1.05, 0, paint);
    box(wid * 0.9, 0.6, 0.8, 0, 1.5, len / 2 - 0.5, glass);
    box(wid * 0.92, 0.5, len * 0.55, 0, 1.45, -0.6, glass);
    if (kind === 'ambulance') {
      box(1.2, 0.35, 0.1, 0, 1.4, wid / 2 + 0.02, new THREE.MeshBasicMaterial({ color: 0xd92038 }));
      box(0.35, 1.2, 0.1, 0, 1.4, wid / 2 + 0.02, new THREE.MeshBasicMaterial({ color: 0xd92038 }));
    }
    wheel(track, wb / 2); wheel(-track, wb / 2);
    wheel(track, -wb / 2); wheel(-track, -wb / 2);
  } else if (kind === 'firetruck') {
    box(wid, 1.4, len, 0, 1.0, 0, paint);
    box(wid * 0.9, 0.6, 1.0, 0, 1.5, len / 2 - 0.8, glass);
    const ladder = box(0.5, 0.25, len * 0.8, 0, 1.95, -0.3, new THREE.MeshLambertMaterial({ color: 0xcccccc }));
    ladder.rotation.x = 0.08;
    wheel(track, wb / 2); wheel(-track, wb / 2);
    wheel(track, -wb / 2); wheel(-track, -wb / 2);
  } else {
    // everyday car: sedan / suv / sport / pickup / taxi / police
    box(wid, 0.55, len, 0, 0.55, 0, paint);
    const cabLen = len * 0.45;
    box(wid * 0.85, 0.5, cabLen, 0, 1.05, -len * 0.08, paint);
    box(wid * 0.78, 0.42, cabLen * 0.8, 0, 1.06, -len * 0.08, glass);
    if (specKey === 'sport') {
      box(wid * 0.9, 0.06, 0.5, 0, 1.15, -len / 2 + 0.3, trim); // spoiler
      box(0.08, 0.25, 0.08, wid * 0.35, 1.0, -len / 2 + 0.3, trim);
      box(0.08, 0.25, 0.08, -wid * 0.35, 1.0, -len / 2 + 0.3, trim);
    }
    if (specKey === 'pickup') {
      box(wid * 0.9, 0.5, len * 0.3, 0, 0.95, -len * 0.32, trim); // open bed
    }
    if (specKey === 'taxi') {
      box(0.9, 0.3, 0.4, 0, 1.45, -len * 0.08, new THREE.MeshLambertMaterial({ color: 0xffd34d }));
    }
    if (specKey === 'police') {
      box(0.5, 0.18, 0.9, 0.3, 1.38, -len * 0.08, new THREE.MeshBasicMaterial({ color: 0xd92038 }));
      box(0.5, 0.18, 0.9, -0.3, 1.38, -len * 0.08, new THREE.MeshBasicMaterial({ color: 0x2a6fd6 }));
    }
    wheel(track, wb / 2); wheel(-track, wb / 2);
    wheel(track, -wb / 2); wheel(-track, -wb / 2);
  }

  // headlights (front, +z) and taillights (rear, -z)
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd92038 });
  const headlights = [];
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lampMat);
    h.position.set(sx * (wid / 2 - 0.35), 0.62, len / 2 + 0.02);
    group.add(h);
    headlights.push(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    t.position.set(sx * (wid / 2 - 0.35), 0.62, -len / 2 - 0.02);
    group.add(t);
  }
  return { group, wheels, headlights };
}

// Fix wheel pivots on an imported (GLB) group: any mesh whose name
// mentions a wheel but whose geometry centre is far from its own
// origin gets its geometry re-centred (on a clone) and its position
// moved to the old centre, so it spins in place. Procedural cars
// never need this; it exists for dealer GLB stock if it is ever used.
export function fixWheelPivots(group) {
  const fixed = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const name = (o.name || '').toLowerCase();
    if (!name.includes('wheel') && !name.includes('tire') && !name.includes('tyre')) return;
    o.geometry.computeBoundingBox();
    const c = new THREE.Vector3();
    o.geometry.boundingBox.getCenter(c);
    if (c.length() < 0.1) return;
    if (o.position.lengthSq() > 0.001) return; // already pivoted
    if (Math.abs(o.rotation.x) > 0.01 || Math.abs(o.rotation.y) > 0.01 || Math.abs(o.rotation.z) > 0.01) return;
    const geo = o.geometry.clone();
    geo.translate(-c.x, -c.y, -c.z);
    o.geometry = geo;
    o.position.copy(c);
    const size = new THREE.Vector3();
    o.geometry.boundingBox.getSize(size);
    fixed.push({ mesh: o, r: Math.max(size.y, size.z) / 2 });
  });
  return fixed;
}

// ---- the manager ----------------------------------------------------------
export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.rng = mulberry32(20240);
    this.cars = [];
    this.playerCar = null;
    this.playerBoat = null;
    this.playerHeli = null;
    this.headlight = null;
    this.headlightTarget = null;
    this.bus = null;
    this.busStopT = 0;
    this.busWp = 0;
    this.boats = [];
    this.helis = [];
    // bus route: corners + stops, all on roads, clockwise outer ring
    this.busRoute = [
      [39, 39], [65, 39], [130, 39], [247, 39], [247, 65], [247, 130],
      [247, 247], [195, 247], [130, 247], [39, 247], [39, 195], [39, 130],
    ];
  }

  makeCar(specKey, x, z, opts = {}) {
    const spec = CAR_MODELS[specKey];
    const color = opts.color !== undefined ? opts.color : pick(this.rng, spec.colors);
    const built = buildCarGroup(specKey, color);
    const group = built.group;
    const heading = opts.heading !== undefined ? opts.heading : rand(this.rng, 0, Math.PI * 2);
    group.position.set(x, groundHeight(x, z), z);
    group.rotation.y = heading;
    this.scene.add(group);
    const car = {
      specKey, spec, kind: kindOf(specKey),
      x, z, y: groundHeight(x, z),
      heading, speed: 0, vy: 0,
      color, cond: 100, fuel: 100,
      isTraffic: !!opts.isTraffic, isParked: !!opts.isParked,
      isBus: specKey === 'bus', isPlayer: false,
      occupied: !!opts.occupied, alarmOn: false, dead: false,
      parked: !!opts.isParked,
      group, wheels: built.wheels, rotor: null, tailRotor: null,
      headlights: built.headlights, isGLB: false,
      axis: opts.axis || 'ns', road: opts.road !== undefined ? opts.road : 0,
      dir: opts.dir !== undefined ? opts.dir : 1,
      lane: 0,
      cruise: opts.cruise !== undefined ? opts.cruise : rand(this.rng, 7, 12),
      turning: null, settle: 0,
      refuel() { this.fuel = 100; },
      repair() { this.cond = 100; },
    };
    car.lane = laneOffset(car.axis, car.dir);
    this.cars.push(car);
    return car;
  }

  // spawn a car that already has a group (e.g. a dealer GLB clone)
  registerGroup(group, specKey, x, z, opts = {}) {
    const spec = CAR_MODELS[specKey];
    const fixed = fixWheelPivots(group);
    group.position.set(x, groundHeight(x, z), z);
    group.rotation.y = opts.heading !== undefined ? opts.heading : 0;
    this.scene.add(group);
    const car = {
      specKey, spec, kind: kindOf(specKey),
      x, z, y: groundHeight(x, z),
      heading: group.rotation.y, speed: 0, vy: 0,
      color: 0xcccccc, cond: 100, fuel: 100,
      isTraffic: false, isParked: !!opts.isParked,
      isBus: false, isPlayer: false,
      occupied: false, alarmOn: false, dead: false,
      parked: !!opts.isParked,
      group, wheels: fixed, rotor: null, tailRotor: null,
      headlights: [], isGLB: true,
      axis: 'ns', road: 0, dir: 1, lane: 0,
      cruise: 10, turning: null, settle: 0,
      refuel() { this.fuel = 100; },
      repair() { this.cond = 100; },
    };
    this.cars.push(car);
    return car;
  }

  spawnTraffic(n) {
    const keys = ['sedan', 'suv', 'sport', 'pickup', 'taxi', 'van', 'truck', 'sedan', 'suv', 'pickup'];
    for (let i = 0; i < n; i++) {
      const axis = rand(this.rng, 0, 1) < 0.5 ? 'ns' : 'ew';
      const road = pick(this.rng, ROADS);
      const dir = rand(this.rng, 0, 1) < 0.5 ? 1 : -1;
      const along = rand(this.rng, 40, 240);
      const lane = laneOffset(axis, dir);
      const x = axis === 'ns' ? road + lane : along;
      const z = axis === 'ns' ? along : road + lane;
      const heading = axis === 'ns' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const specKey = pick(this.rng, keys);
      this.makeCar(specKey, x, z, { isTraffic: true, axis, road, dir, heading, cruise: rand(this.rng, 7, 12) });
    }
    // one ambulance and one firetruck circulating, for life
    this.makeCar('ambulance', 130 + laneOffset('ns', 1), 120, { isTraffic: true, axis: 'ns', road: 130, dir: 1, heading: 0, cruise: 11 });
    this.makeCar('firetruck', 130 + laneOffset('ew', -1), 130, { isTraffic: true, axis: 'ew', road: 130, dir: -1, heading: -Math.PI / 2, cruise: 10 });
  }

  spawnParked(n) {
    // dealer lot: 8 display cars on the lot plane (x 50..80, z 101..113)
    const lotKeys = CAR_CATALOG.slice(0, 8);
    lotKeys.forEach((key, i) => {
      const x = 54 + (i % 4) * 8;
      const z = 104 + Math.floor(i / 4) * 7;
      this.makeCar(key, x, z, { isParked: true, heading: Math.PI });
    });
    // road-edge bays: just off the carriageway, heading along the road
    const bayRoads = [39, 65, 91, 117, 143, 169, 195, 221];
    let placed = 0;
    let guard = 0;
    while (placed < n && guard++ < 200) {
      const axis = rand(this.rng, 0, 1) < 0.5 ? 'ns' : 'ew';
      const road = pick(this.rng, bayRoads);
      const side = rand(this.rng, 0, 1) < 0.5 ? 1 : -1;
      const along = rand(this.rng, 45, 235);
      const off = ROAD_W / 2 + 1.2; // 6.2 m from centreline — on the bay, off the road
      const x = axis === 'ns' ? road + side * off : along;
      const z = axis === 'ns' ? along : road + side * off;
      if (x < 20 || x > 255 || z < 20 || z > 255) continue;
      if (this.cars.some((c) => dist2d(c.x, c.z, x, z) < 7)) continue;
      const heading = axis === 'ns' ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      const key = pick(this.rng, ['sedan', 'suv', 'pickup', 'sport', 'van']);
      this.makeCar(key, x, z, { isParked: true, heading });
      placed++;
    }
    // two easy steals near the ferry, for mission 1
    this.makeCar('sedan', 45, 120, { isParked: true, heading: 0 });
    this.makeCar('pickup', 45, 138, { isParked: true, heading: Math.PI });
  }

  spawnBus() {
    const start = this.busRoute[0];
    const bus = this.makeCar('bus', start[0], start[1], { isTraffic: true, axis: 'ew', road: 39, dir: 1, heading: Math.PI / 2, cruise: 9 });
    bus.isBus = true;
    this.bus = bus;
    this.busWp = 1;
    this.busStopT = 0;
    return bus;
  }

  // ---- per-frame ------------------------------------------------------------
  update(dt) {
    const game = this.game;
    for (const car of this.cars) {
      if (car.dead && !car.isPlayer) continue;
      if (car.isPlayer) this._drivePlayer(car, dt);
      else if (car.isBus) this._driveBus(car, dt);
      else if (car.isTraffic) this._driveTraffic(car, dt);
      // wheels spin with the road speed, around their own axle
      if (car.speed !== 0) {
        for (const w of car.wheels) {
          w.rotation.x += (car.speed * dt) / w.r;
          if (w.cap) w.cap.rotation.x = w.rotation.x;
        }
      }
      car.group.position.set(car.x, car.y, car.z);
      car.group.rotation.y = car.heading;
      car.group.rotation.x = 0; // kinematic body: never rolls, never flips
      car.group.rotation.z = 0;
    }
    this._collideCars(dt);
    this._updateHeadlights();
  }

  _advance(car, d) {
    car.x += Math.sin(car.heading) * d;
    car.z += Math.cos(car.heading) * d;
    car.y = groundHeight(car.x, car.z);
  }

  // traffic: stay in the lane, turn only at intersections, stop on red,
  // never leave the road. The perpendicular coordinate is always the
  // road centreline plus the lane offset — by construction the car
  // cannot be on a sidewalk, on grass, in the desert or in the sea.
  _driveTraffic(car, dt) {
    const game = this.game;
    const red = game && game.trafficRed === true;
    const myLightRed = red && car.axis === 'ns' ? true : (!red && car.axis === 'ew');
    // turning: lerp heading to the target, then settle into the new lane
    if (car.turning) {
      const t = car.turning;
      car.heading = angleLerp(car.heading, t.target, Math.min(1, dt * 3.5));
      car.speed = Math.max(4, car.speed - 6 * dt);
      this._advance(car, car.speed * dt);
      if (Math.abs(((car.heading - t.target + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.06) {
        car.axis = t.axis; car.road = t.road; car.dir = t.dir;
        car.lane = laneOffset(car.axis, car.dir);
        car.turning = null;
        car.settle = 1;
      }
      return;
    }
    // settle: ease the perpendicular coordinate into the lane after a turn
    if (car.settle > 0) {
      car.settle = Math.max(0, car.settle - dt * 1.5);
      if (car.axis === 'ns') car.x += ((car.road + car.lane) - car.x) * Math.min(1, dt * 3);
      else car.z += ((car.road + car.lane) - car.z) * Math.min(1, dt * 3);
    }
    const along = car.axis === 'ns' ? car.z : car.x;
    const dir = car.dir;
    // red light: stop before the next intersection while my axis is red
    let wantStop = false;
    if (myLightRed) {
      for (const q of ROADS) {
        const d = (q - along) * dir;
        if (d > 1 && d < 9) { wantStop = true; break; }
      }
    }
    // car ahead on the same road + lane: don't rear-end it
    let lead = null;
    for (const o of this.cars) {
      if (o === car || !o.isTraffic || o.isParked) continue;
      if (o.axis !== car.axis || o.road !== car.road || o.dir !== car.dir) continue;
      const d = (car.axis === 'ns' ? o.z - car.z : o.x - car.x) * dir;
      if (d > 0 && d < 11) { if (!lead || d < lead) lead = d; }
    }
    let target = car.cruise;
    if (wantStop) target = 0;
    else if (lead !== null) target = lead < 6 ? 0 : Math.min(car.cruise, 4);
    car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);
    if (car.speed < 0.05 && target === 0) car.speed = 0;
    this._advance(car, car.speed * dt);
    // pin the perpendicular coordinate to the lane (exact, every frame)
    // — except while settling after a turn, when it eases in instead
    if (car.settle <= 0) {
      if (car.axis === 'ns') car.x = car.road + car.lane;
      else car.z = car.road + car.lane;
    }
    car.y = groundHeight(car.x, car.z);
    // end of the road: U-turn (slow, arc, back the other way)
    const pos = car.axis === 'ns' ? car.z : car.x;
    if ((pos < 34 && dir < 0) || (pos > 256 && dir > 0)) {
      car.turning = { axis: car.axis, road: car.road, dir: -dir, target: car.heading + Math.PI };
      return;
    }
    // intersection: sometimes turn onto the crossing road (one roll per
    // intersection, so a car does not turn at nearly every crossing)
    if (car.speed > 3) {
      for (const q of ROADS) {
        const d = Math.abs(along - q);
        if (d < 1.2 && car.lastTurnQ !== q) {
          car.lastTurnQ = q;
          if (this.rng() >= 0.3) break;
          const newAxis = car.axis === 'ns' ? 'ew' : 'ns';
          const newDir = this.rng() < 0.5 ? 1 : -1;
          const targetHeading = newAxis === 'ns'
            ? (newDir > 0 ? 0 : Math.PI)
            : (newDir > 0 ? Math.PI / 2 : -Math.PI / 2);
          car.turning = { axis: newAxis, road: q, dir: newDir, target: targetHeading };
          break;
        }
      }
    }
  }

  // the city bus: waypoint to waypoint on the outer ring, pausing at
  // the bus stops. Every leg is a straight run along one road.
  _driveBus(car, dt) {
    if (this.busStopT > 0) {
      this.busStopT -= dt;
      car.speed = 0;
      return;
    }
    const wp = this.busRoute[this.busWp % this.busRoute.length];
    const dx = wp[0] - car.x, dz = wp[1] - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.5) {
      // reached a waypoint: stop here if it is a bus stop, else roll on
      const isStop = (wp[0] === 65 && wp[1] === 39) || (wp[0] === 130 && wp[1] === 39)
        || (wp[0] === 247 && wp[1] === 65) || (wp[0] === 247 && wp[1] === 130)
        || (wp[0] === 195 && wp[1] === 247) || (wp[0] === 130 && wp[1] === 247)
        || (wp[0] === 39 && wp[1] === 195) || (wp[0] === 39 && wp[1] === 130);
      if (isStop) this.busStopT = 4;
      this.busWp = (this.busWp + 1) % this.busRoute.length;
      return;
    }
    const targetHeading = Math.atan2(dx, dz);
    car.heading = angleLerp(car.heading, targetHeading, Math.min(1, dt * 3));
    car.speed += clamp(9 - car.speed, -10 * dt, 6 * dt);
    this._advance(car, car.speed * dt);
    car.y = groundHeight(car.x, car.z);
  }

  // player driving: arcade physics, fuel burn, anti-flip, sea clamp
  _drivePlayer(car, dt) {
    const input = this.game.input || {};
    const spec = car.spec;
    const fwd = input.up ? 1 : 0;
    const back = input.down ? 1 : 0;
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const top = input.nitro && car.fuel > 0 ? spec.top * 1.35 : spec.top;
    if (car.fuel <= 0) {
      car.speed = damp(car.speed, 0, 1.2, dt);
    } else {
      if (fwd) car.speed += spec.accel * dt;
      if (back) car.speed -= spec.accel * 0.6 * dt;
      if (!fwd && !back) car.speed = damp(car.speed, 0, 0.6, dt);
      if (input.brake) car.speed = damp(car.speed, 0, 4, dt);
    }
    car.speed = clamp(car.speed, -8, top);
    const steerAuthority = clamp(Math.abs(car.speed) / 10, 0, 1) * (car.speed >= 0 ? 1 : -1);
    car.heading += steer * spec.turn * dt * steerAuthority * 0.9;
    this._advance(car, car.speed * dt);
    // the sea is not drivable: hold the car at the shoreline
    if (car.x < SEA_X + 1.5) { car.x = SEA_X + 1.5; car.speed *= 0.5; }
    // river: shallow wade only, half speed in the channel
    if (Math.abs(car.z - 281) < 5 && car.x > 0 && car.x < 400) car.speed *= (1 - 0.5 * dt);
    car.fuel = Math.max(0, car.fuel - Math.abs(car.speed) * dt * 0.01);
    if (car.cond <= 0) { car.dead = true; car.speed = 0; }
  }

  // police.js calls this: spawn(specKey, x, z, heading, { traffic, color, kind })
  spawn(specKey, x, z, heading, opts = {}) {
    if (opts.kind === 'heli') {
      const heli = this.spawnHeli(x, z, { isPlayer: false });
      heli.heading = heading || 0;
      return heli;
    }
    return this.makeCar(specKey, x, z, {
      heading: heading !== undefined ? heading : 0,
      isTraffic: !!opts.traffic,
      color: opts.color,
    });
  }

  // collide one car with buildings + poles/props (used by the police
  // cruisers too, so they cannot drive through a block)
  _collideBuildings(car) {
    const city = this.game.city;
    if (!city) return;
    const boxes = city.colliders.boxes;
    const circles = city.colliders.circles;
    const r = car.spec.len / 2;
    for (const b of boxes) {
      const cx = clamp(car.x, b.x0, b.x1);
      const cz = clamp(car.z, b.z0, b.z1);
      const d = dist2d(car.x, car.z, cx, cz);
      if (d < r && d > 0.001) {
        const push = (r - d);
        const nx = (car.x - cx) / d, nz = (car.z - cz) / d;
        car.x += nx * push; car.z += nz * push;
        if (Math.abs(car.speed) > 4) {
          car.cond = Math.max(0, car.cond - Math.abs(car.speed) * 1.5);
          if (car.isPlayer && this.game.audio) this.game.audio.crash(Math.min(1, Math.abs(car.speed) / 20));
        }
        car.speed *= -0.25;
      }
    }
    for (const c of circles) {
      const d = dist2d(car.x, car.z, c.x, c.z);
      const min = r * 0.5 + c.r;
      if (d < min && d > 0.001) {
        const push = min - d;
        car.x += (car.x - c.x) / d * push;
        car.z += (car.z - c.z) / d * push;
        if (Math.abs(car.speed) > 5) car.cond = Math.max(0, car.cond - 4);
        car.speed *= 0.5;
      }
    }
  }

  // simple circle collisions: car vs car, car vs building boxes,
  // car vs pole/prop circles. Damage + bounce, no tunneling.
  _collideCars(dt) {
    for (const car of this.cars) {
      if (car.isParked && !car.isPlayer) continue;
      this._collideBuildings(car);
    }
    for (let i = 0; i < this.cars.length; i++) {
      const a = this.cars[i];
      for (let j = i + 1; j < this.cars.length; j++) {
        const b = this.cars[j];
        const aParked = a.isParked && !a.isPlayer;
        const bParked = b.isParked && !b.isPlayer;
        if (aParked && bParked) continue;
        // traffic never touches parked cars (bays are off the lanes);
        // only the player's car can hit a parked one
        if ((aParked || bParked) && !a.isPlayer && !b.isPlayer) continue;
        const min = (a.spec.len + b.spec.len) / 2 * 0.75;
        const d = dist2d(a.x, a.z, b.x, b.z);
        if (d < min && d > 0.001) {
          const push = (min - d) / (aParked || bParked ? 1 : 2);
          const nx = (a.x - b.x) / d, nz = (a.z - b.z) / d;
          if (!aParked) { a.x += nx * push; a.z += nz * push; }
          if (!bParked) { b.x -= nx * push; b.z -= nz * push; }
          const impact = Math.abs(a.speed - b.speed);
          if (impact > 3) {
            a.cond = Math.max(0, a.cond - impact);
            b.cond = Math.max(0, b.cond - impact);
            if ((a.isPlayer || b.isPlayer) && this.game.audio) this.game.audio.crash(Math.min(1, impact / 20));
          }
          if (!aParked && !bParked) {
            const avg = (a.speed + b.speed) / 2;
            a.speed = avg * 0.6; b.speed = avg * 0.6;
          } else if (a.isPlayer) { a.speed *= -0.3; }
          else if (b.isPlayer) { b.speed *= -0.3; }
        }
      }
    }
  }

  // headlights: one spotlight on the player's car, only at night
  _updateHeadlights() {
    const game = this.game;
    const night = game.weather && game.weather.isNight && game.weather.isNight();
    const car = this.playerCar;
    if (!car || !night) {
      if (this.headlight) this.headlight.intensity = 0;
      return;
    }
    if (!this.headlight) {
      this.headlight = new THREE.SpotLight(0xfff0c8, 60, 45, 0.55, 0.4, 1.2);
      this.headlightTarget = new THREE.Object3D();
      this.scene.add(this.headlight, this.headlightTarget);
      this.headlight.target = this.headlightTarget;
    }
    this.headlight.intensity = 60;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    this.headlight.position.set(car.x + fx * car.spec.len / 2, car.y + 1.0, car.z + fz * car.spec.len / 2);
    this.headlightTarget.position.set(car.x + fx * 14, car.y + 0.4, car.z + fz * 14);
  }

  // ---- boats + helicopter (simple, kept for the harbor missions) -------
  spawnBoat(x, z, opts = {}) {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 6), new THREE.MeshLambertMaterial({ color: 0xf2f5f7 }));
    hull.position.y = 0.35;
    group.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2), new THREE.MeshLambertMaterial({ color: 0x2a6fd6 }));
    cabin.position.set(0, 0.9, -0.5);
    group.add(cabin);
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    motor.position.set(0, 0.4, -3.1);
    group.add(motor);
    group.position.set(x, 0.02, z);
    this.scene.add(group);
    const boat = { group, x, z, heading: 0, speed: 0, isPlayer: opts.isPlayer !== false };
    this.boats.push(boat);
    if (boat.isPlayer) this.playerBoat = boat;
    return boat;
  }

  updateBoat(dt) {
    const boat = this.playerBoat;
    if (!boat) return;
    const input = this.game.input || {};
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (input.up) boat.speed += 14 * dt;
    if (input.down) boat.speed -= 10 * dt;
    boat.speed = clamp(boat.speed, -4, 22);
    if (!input.up && !input.down) boat.speed = damp(boat.speed, 0, 0.5, dt);
    boat.heading += steer * 1.8 * dt * clamp(Math.abs(boat.speed) / 8, 0, 1);
    boat.x += Math.sin(boat.heading) * boat.speed * dt;
    boat.z += Math.cos(boat.heading) * boat.speed * dt;
    if (boat.x > SEA_X - 1) { boat.x = SEA_X - 1; boat.speed *= 0.5; }
    if (boat.x < -60) boat.x = -60;
    if (boat.z < -60) boat.z = -60;
    if (boat.z > 460) boat.z = 460;
    boat.group.position.set(boat.x, 0.02, boat.z);
    boat.group.rotation.y = boat.heading;
  }

  spawnHeli(x, z, opts = {}) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 4.5), new THREE.MeshLambertMaterial({ color: 0xd92038 }));
    body.position.y = 0.8;
    group.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4), new THREE.MeshLambertMaterial({ color: 0xd92038 }));
    tail.position.set(0, 1.0, -3.8);
    group.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    rotor.position.y = 1.9;
    group.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.3), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    tailRotor.position.set(0.3, 1.1, -5.6);
    group.add(tailRotor);
    group.position.set(x, groundHeight(x, z), z);
    this.scene.add(group);
    const heli = { group, x, z, y: groundHeight(x, z), heading: 0, speed: 0, vy: 0, rotor, tailRotor, isPlayer: opts.isPlayer !== false };
    this.helis.push(heli);
    if (heli.isPlayer) this.playerHeli = heli;
    return heli;
  }

  updateHeli(dt) {
    const heli = this.playerHeli;
    if (!heli) return;
    const input = this.game.input || {};
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (input.up) heli.speed += 12 * dt;
    if (input.down) heli.speed -= 8 * dt;
    heli.speed = clamp(heli.speed, -6, 30);
    if (input.jump) heli.vy += 10 * dt;
    else heli.vy -= 6 * dt;
    heli.vy = clamp(heli.vy, -8, 10);
    heli.heading += steer * 1.6 * dt;
    heli.x += Math.sin(heli.heading) * heli.speed * dt;
    heli.z += Math.cos(heli.heading) * heli.speed * dt;
    heli.y = clamp(heli.y + heli.vy * dt, groundHeight(heli.x, heli.z), 70);
    heli.group.position.set(heli.x, heli.y, heli.z);
    heli.group.rotation.y = heli.heading;
    heli.rotor.rotation.y += dt * 22;
    heli.tailRotor.rotation.x += dt * 30;
  }

  enterCar(car) {
    if (this.playerCar) this.playerCar.isPlayer = false;
    car.isPlayer = true;
    car.parked = false;
    car.isParked = false;
    car.isTraffic = false;
    car.turning = null;
    this.playerCar = car;
    return car;
  }

  exitCar() {
    const car = this.playerCar;
    if (!car) return null;
    car.isPlayer = false;
    car.speed = 0;
    this.playerCar = null;
    return car;
  }
}
