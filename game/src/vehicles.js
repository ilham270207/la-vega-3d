// vehicles.js — La Vega driving (round 12).
// Traffic, parked cars, carjacking, police cruisers and the player's car.
// Steering (round 12 fix): D turns RIGHT, A turns LEFT. Heading uses the
// same convention as the rest of the game — forward = (sin h, cos h) — so
// turning right means the heading DECREASES. Fuel drains while the
// player's car drives; an empty tank stalls it (see stations.js).
import * as THREE from 'three';
import { CAR_MODELS, ROADS, WORLD } from './config.js';
import { mulberry32, clamp, rand, pick } from './rng.js';
import { FUEL_DRAIN } from './stations.js';

const TRAFFIC_KEYS = ['sedan', 'suv', 'truck', 'sport', 'pickup', 'taxi'];
const LIGHTS = [[117, 117], [143, 169], [169, 143]];

function lam(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.rng = mulberry32(20240);
    this.cars = [];
    this.traffic = [];
    this.parkedCars = [];
    this.playerCar = null;
    this.spotLight = null;
  }

  // ---------- car construction ----------
  _buildVisual(spec, color) {
    const g = new THREE.Group();
    const len = spec.len || 4.6;
    const wid = spec.wid || 1.9;
    const wheels = [];
    let lightBarRed = null;
    let lightBarBlue = null;
    const box = (w, h, d, c, x, y, z, emissive) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c, emissive ? { emissive } : {}));
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.28, 10);
    const wheelMat = lam(0x141414);
    const hubMat = lam(0x9aa2ad);
    const mkWheel = (x, z) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.35, z);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8), hubMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, 0.35, z);
      g.add(w); g.add(hub);
      wheels.push(w);
      return w;
    };
    if (spec.proc === 'truck') {
      box(2.3, 1.9, 2.2, color, 0, 1.25, len / 2 - 1.4);           // cab
      box(2.0, 0.7, 1.6, 0x1a2a3a, 0, 1.7, len / 2 - 1.4);          // windshield
      box(2.4, 2.2, len - 3.2, 0xd8d8d8, 0, 1.4, -len / 2 + 1.9);   // cargo box
      box(2.4, 0.25, 0.3, 0xc0c0c0, 0, 0.5, len / 2 - 0.1);         // chrome bumper
      box(2.4, 0.15, 0.2, 0xffd34d, 0, 2.6, -len / 2 + 0.4);        // marker strip
    } else if (spec.proc === 'van' || spec.proc === 'bus') {
      const isBus = spec.proc === 'bus';
      const bl = isBus ? 10 : 5.2;
      box(wid, 2.2, bl, color, 0, 1.4, 0);
      box(wid * 0.92, 0.8, bl * 0.8, 0x1a2a3a, 0, 1.7, 0);
      if (isBus) {
        box(wid * 0.9, 0.5, 0.3, 0xffd34d, 0, 2.2, bl / 2 - 0.2);
      }
    } else {
      box(wid, 0.55, len, color, 0, 0.62, 0);                        // body
      box(wid * 0.88, 0.5, len * 0.48, 0x18222e, 0, 1.05, -len * 0.06); // cabin glass
      box(wid * 0.9, 0.08, len * 0.5, color, 0, 1.32, -len * 0.06);  // roof
      box(wid + 0.06, 0.18, 0.3, 0x222222, 0, 0.42, len / 2 - 0.1);  // bumpers
      box(wid + 0.06, 0.18, 0.3, 0x222222, 0, 0.42, -len / 2 + 0.1);
      box(0.34, 0.16, 0.1, 0xfff2c0, -wid / 2 + 0.4, 0.72, len / 2 + 0.02, 0xfff2c0); // headlights
      box(0.34, 0.16, 0.1, 0xfff2c0, wid / 2 - 0.4, 0.72, len / 2 + 0.02, 0xfff2c0);
      box(0.3, 0.14, 0.1, 0xff2222, -wid / 2 + 0.4, 0.72, -len / 2 - 0.02, 0xff2222);  // taillights
      box(0.3, 0.14, 0.1, 0xff2222, wid / 2 - 0.4, 0.72, -len / 2 - 0.02, 0xff2222);
      if (spec.turn >= 2.5) {
        box(wid * 0.9, 0.07, 0.5, 0x1a1a1a, 0, 1.15, -len / 2 + 0.15); // spoiler
      }
      if (spec.len < 5 && color === 0xffd34d) {
        box(0.9, 0.3, 0.5, 0xffd34d, 0, 1.55, 0); // taxi roof sign
      }
    }
    // Wheels (all cars, incl. helis — police spins them).
    mkWheel(-wid / 2 + 0.05, len * 0.32);
    mkWheel(wid / 2 - 0.05, len * 0.32);
    mkWheel(-wid / 2 + 0.05, -len * 0.32);
    mkWheel(wid / 2 - 0.05, -len * 0.32);
    // Police light bar.
    if (spec.key === 'police' || (spec.name && /police/i.test(spec.name))) {
      lightBarRed = box(0.55, 0.18, 0.4, 0xff2222, -0.32, 1.5, 0, 0xff2222);
      lightBarBlue = box(0.55, 0.18, 0.4, 0x2255ff, 0.32, 1.5, 0, 0x2255ff);
    }
    return { group: g, wheels, lightBarRed, lightBarBlue };
  }

  spawn(specKey, x, z, heading, opts = {}) {
    const spec = { ...(CAR_MODELS[specKey] || CAR_MODELS.sedan), key: specKey };
    const color = opts.color !== undefined ? opts.color
      : pick(this.rng, spec.colors || [0xd92038]);
    let visual;
    if (opts.kind === 'heli') {
      visual = this._buildHeli(spec, color);
    } else {
      visual = this._buildVisual(spec, color);
    }
    visual.group.position.set(x, opts.y || 0, z);
    visual.group.rotation.y = heading;
    this.scene.add(visual.group);
    const car = {
      specKey, spec, name: spec.name, color,
      x, y: opts.y || 0, z, heading,
      speed: 0, aiSpeed: 0,
      fuel: 100, cond: 100, nitro: 100, stalled: false, dead: false,
      kind: opts.kind || 'car',
      axis: opts.axis || 'ns', line: opts.line || 0, lane: opts.lane || 0, dir: opts.dir || 1,
      group: visual.group, wheels: visual.wheels,
      lightBarRed: visual.lightBarRed, lightBarBlue: visual.lightBarBlue,
      driver: opts.traffic ? true : null,
      alarmT: 0, radius: Math.max(spec.len, spec.wid) * 0.5,
    };
    this.cars.push(car);
    if (opts.traffic) this.traffic.push(car);
    return car;
  }

  _buildHeli(spec, color) {
    const g = new THREE.Group();
    const box = (w, h, d, c, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c));
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    box(2.0, 1.4, 4.2, color, 0, 0, 0);
    box(1.6, 0.9, 1.4, 0x18222e, 0, 0.2, 1.6);
    box(0.3, 0.3, 3.4, 0x333333, 0, 0.4, -3.2);
    const rotor = box(7.5, 0.08, 0.4, 0x222222, 0, 1.0, 0);
    const wheels = [];
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8), lam(0x141414));
      w.rotation.z = Math.PI / 2;
      w.position.set(i % 2 ? 0.8 : -0.8, -0.8, i < 2 ? 1.2 : -1.2);
      g.add(w);
      wheels.push(w);
    }
    void rotor;
    return { group: g, wheels, lightBarRed: null, lightBarBlue: null };
  }

  spawnTraffic(n) {
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      const key = pick(rng, TRAFFIC_KEYS);
      const axis = rng() < 0.5 ? 'ns' : 'ew';
      const line = pick(rng, ROADS);
      const lane = rng() < 0.5 ? -2.5 : 2.5;
      const dir = rng() < 0.5 ? 1 : -1;
      const along = rand(rng, 10, WORLD.grid - 10);
      const x = axis === 'ns' ? line + lane : along;
      const z = axis === 'ns' ? along : line + lane;
      const heading = axis === 'ns' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const car = this.spawn(key, x, z, heading, { traffic: true, axis, line, lane, dir });
      car.speed = rand(rng, 7, 13);
      car.aiSpeed = car.speed;
    }
  }

  spawnParked(n) {
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      const key = pick(rng, TRAFFIC_KEYS);
      const line = pick(rng, ROADS);
      const side = rng() < 0.5 ? -1 : 1;
      const along = rand(rng, 12, WORLD.grid - 12);
      const ns = rng() < 0.5;
      const x = ns ? line + side * 8.4 : along;
      const z = ns ? along : line + side * 8.4;
      const heading = ns ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const car = this.spawn(key, x, z, heading, {});
      car.kind = 'parked';
      this.parkedCars.push(car);
    }
  }

  // ---------- queries ----------
  nearestCar(x, z, range) {
    let best = null;
    let bestD = range;
    for (const c of this.cars) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best ? { car: best, dist: bestD } : null;
  }

  countOffRoadMoving() {
    const bad = [];
    const hw = WORLD.roadWidth / 2 + 1;
    for (const c of this.traffic) {
      if (c.dead || Math.abs(c.speed) < 1) continue;
      const off = c.axis === 'ns'
        ? Math.abs(c.x - c.line) > hw
        : Math.abs(c.z - c.line) > hw;
      if (off) bad.push({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), speed: +c.speed.toFixed(1) });
    }
    return { count: bad.length, bad };
  }

  // Push a car (or any {x,z,radius}) out of building colliders. Returns
  // true when a collision happened. Police calls this with the car itself.
  _collideBuildings(target) {
    const g = this.game;
    if (!g.city) return false;
    const r = target.radius || 1.4;
    let hit = false;
    for (const col of g.city.colliders) {
      const dx = target.x - col.x;
      const dz = target.z - col.z;
      const d = Math.hypot(dx, dz);
      const min = col.r + r;
      if (d < min && d > 0.001) {
        const push = (min - d) / d;
        target.x += dx * push;
        target.z += dz * push;
        hit = true;
        if (target.speed !== undefined && Math.abs(target.speed) > 3) {
          target.speed *= 0.4;
          if (target.cond !== undefined) {
            target.cond = Math.max(0, target.cond - 4);
            if (g.audio && Math.abs(target.speed) > 6) g.audio.crash(0.4);
          }
        }
      }
    }
    return hit;
  }

  _collideCars() {
    const list = this.cars.filter((c) => !c.dead);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + b.radius - 0.6;
        if (d < min && d > 0.001) {
          const push = (min - d) / 2 / d;
          a.x -= dx * push; a.z -= dz * push;
          b.x += dx * push; b.z += dz * push;
          const closing = Math.abs(a.speed - b.speed);
          if (closing > 4) {
            a.cond = Math.max(0, a.cond - 3);
            b.cond = Math.max(0, b.cond - 3);
            a.speed *= 0.6; b.speed *= 0.6;
            if (this.game.audio) this.game.audio.crash(0.5);
          }
        }
      }
    }
  }

  // ---------- enter / exit ----------
  tryEnterNearest(player) {
    const g = this.game;
    const near = this.nearestCar(player.x, player.z, 4.5);
    if (!near) return null;
    const car = near.car;
    if (car.driver) {
      // Pull the NPC driver out — they flee on foot.
      car.driver = null;
      if (g.characters) g.characters.spawnPedestrian(car.x + 2, car.z, 'flee');
      if (g.audio) g.audio.cash();
    } else if (car.kind === 'parked') {
      if (g.audio) g.audio.alarm();
      car.alarmT = 3;
    }
    car.aiSpeed = 0;
    this.playerCar = car;
    car.kind = 'player';
    // Leave the traffic list: from now on the player drives this car.
    // (If it stayed in traffic, the traffic AI would overwrite its
    // heading and snap it back to its lane every frame.)
    this.traffic = this.traffic.filter((c) => c !== car);
    this.parkedCars = this.parkedCars.filter((c) => c !== car);
    player.inCar = true;
    player.group.visible = false;
    player.x = car.x; player.z = car.z;
    if (g.police) {
      g.police.addHeat(1, 'carjack');
      g.police.onPlayerEnterCar(car);
    }
    if (g.missions) g.missions.onCarEntered();
    return car;
  }

  exitCar() {
    const g = this.game;
    const car = this.playerCar;
    if (!car) return;
    if (g.police && g.police.wanted > 0) g.police.rememberVehicle(car);
    this.playerCar = null;
    const p = g.player;
    p.inCar = false;
    p.group.visible = true;
    p.x = car.x + 2.2;
    p.z = car.z;
    p.y = 0.1;
    p.heading = car.heading;
    if (car.kind === 'player') car.kind = 'parked';
    if (!this.parkedCars.includes(car)) this.parkedCars.push(car);
  }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.game;
    const input = g.input || {};
    // Traffic AI.
    for (const c of this.traffic) {
      if (c.dead) continue;
      let target = c.aiSpeed;
      // Red light: stop before the crosswalk.
      if (g.trafficRed) {
        for (const [lx, lz] of LIGHTS) {
          const along = c.axis === 'ns' ? c.z : c.x;
          const cross = c.axis === 'ns' ? lz : lx;
          const onRoad = c.axis === 'ns' ? Math.abs(c.line - lx) < 6 : Math.abs(c.line - lz) < 6;
          if (onRoad) {
            const ahead = (cross - along) * c.dir;
            if (ahead > 0 && ahead < 13) target = 0;
          }
        }
      }
      // Brake for the player or a car ahead in the lane.
      const aheadX = c.x + Math.sin(c.heading) * 6;
      const aheadZ = c.z + Math.cos(c.heading) * 6;
      if (g.player && !g.player.inCar && Math.hypot(g.player.x - aheadX, g.player.z - aheadZ) < 3.5) target = 0;
      for (const o of this.cars) {
        if (o === c || o.dead) continue;
        if (Math.hypot(o.x - aheadX, o.z - aheadZ) < 3.2) { target = 0; break; }
      }
      c.speed += clamp(target - c.speed, -14 * dt, 8 * dt);
      if (c.axis === 'ns') {
        c.z += c.dir * c.speed * dt;
        c.x = c.line + c.lane;
        if (c.z > WORLD.grid - 4) { c.z = 6; }
        if (c.z < 4) { c.z = WORLD.grid - 6; }
      } else {
        c.x += c.dir * c.speed * dt;
        c.z = c.line + c.lane;
        if (c.x > WORLD.grid - 4) { c.x = 6; }
        if (c.x < 4) { c.x = WORLD.grid - 6; }
      }
      c.heading = c.axis === 'ns' ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    // Player driving.
    const pc = this.playerCar;
    if (pc && !pc.dead) {
      const grip = g.weather ? g.weather.gripFactor() : 1;
      const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const gas = !!input.gas;
      const brake = !!input.brake;
      const handbrake = !!input.handbrake;
      const nitro = !!input.nitro && pc.nitro > 0;
      if (pc.stalled) {
        pc.speed -= pc.speed * 2.2 * dt;
        if (Math.abs(pc.speed) < 0.1) pc.speed = 0;
      } else if (gas) {
        const top = pc.spec.top * (nitro ? 1.3 : 1);
        pc.speed = Math.min(top, pc.speed + pc.spec.accel * grip * (nitro ? 1.8 : 1) * dt);
        if (nitro) pc.nitro = Math.max(0, pc.nitro - 30 * dt);
      } else if (brake) {
        if (pc.speed > 0.5) pc.speed = Math.max(0, pc.speed - 22 * dt);
        else pc.speed = Math.max(-8, pc.speed - 8 * dt);
      } else {
        pc.speed -= pc.speed * 0.5 * dt;
        if (Math.abs(pc.speed) < 0.15) pc.speed = 0;
      }
      if (handbrake) pc.speed -= pc.speed * 3.5 * dt;
      pc.nitro = Math.min(100, pc.nitro + 2 * dt);
      // STEERING — D (right) turns right, A (left) turns left.
      // Heading decreases on a right turn (forward = (sin h, cos h)).
      const steerAuthority = clamp(Math.abs(pc.speed) / 6, 0, 1) * (pc.speed >= 0 ? 1 : -1);
      pc.heading -= steer * pc.spec.turn * (handbrake ? 1.5 : 1) * steerAuthority * dt;
      pc.x += Math.sin(pc.heading) * pc.speed * dt;
      pc.z += Math.cos(pc.heading) * pc.speed * dt;
      // Fuel drain + stall.
      if (Math.abs(pc.speed) > 0.5) {
        pc.fuel = Math.max(0, pc.fuel - Math.abs(pc.speed) * FUEL_DRAIN * dt);
        if (pc.fuel <= 0) pc.stalled = true;
      }
      // Keep the player's car on the island.
      pc.x = clamp(pc.x, 1, WORLD.size - 1);
      pc.z = clamp(pc.z, 1, WORLD.size - 1);
      this._collideBuildings(pc);
      // Running over a pedestrian: they go down and the law notices.
      if (Math.abs(pc.speed) > 3 && g.characters) {
        for (const n of g.characters.npcs) {
          if (n.dead || n.isCrew) continue;
          if (['swim', 'jetski', 'sunbathe', 'fish'].includes(n.state)) continue;
          if (Math.hypot(n.x - pc.x, n.z - pc.z) < 1.6) {
            n.state = 'dying';
            n.deadT = 0;
            pc.speed *= 0.7;
            if (g.police) g.police.addHeat(1, 'hit pedestrian');
            if (g.audio) g.audio.crash(0.5);
            break;
          }
        }
      }
      if (g.player) {
        g.player.x = pc.x; g.player.z = pc.z; g.player.heading = pc.heading;
      }
      if (g.audio) g.audio.engine(Math.abs(pc.speed) / pc.spec.top, true);
    }
    // Collisions + visuals for every car.
    this._collideCars();
    // Police light bars flash red/blue (~4 Hz) so a pursuit is visible
    // from across the street.
    this._barT = (this._barT || 0) + dt;
    const barPhase = Math.floor(this._barT * 4) % 2;
    for (const c of this.cars) {
      if (c.dead) continue;
      if (c.lightBarRed && c.lightBarBlue) {
        c.lightBarRed.material.color.setHex(barPhase === 0 ? 0xff2222 : 0x551111);
        c.lightBarBlue.material.color.setHex(barPhase === 0 ? 0x111155 : 0x2255ff);
      }
      c.group.position.set(c.x, c.y || 0, c.z);
      c.group.rotation.y = c.heading;
      const spin = (c.speed / 0.35) * dt;
      for (const w of c.wheels) w.rotation.x += spin;
      if (c.alarmT > 0) {
        c.alarmT -= dt;
        if (c.alarmT <= 0 && this.game.audio) this.game.audio.alarmStop();
      }
    }
    // Player headlight at night.
    if (pc && g.weather && g.weather.isNight()) {
      if (!this.spotLight) {
        this.spotLight = new THREE.SpotLight(0xfff2c0, 60, 30, 0.5, 0.4);
        this.scene.add(this.spotLight);
        this.spotLight.target = new THREE.Object3D();
        this.scene.add(this.spotLight.target);
      }
      this.spotLight.visible = true;
      this.spotLight.position.set(pc.x, 2.2, pc.z);
      this.spotLight.target.position.set(
        pc.x + Math.sin(pc.heading) * 12, 0, pc.z + Math.cos(pc.heading) * 12
      );
    } else if (this.spotLight) {
      this.spotLight.visible = false;
    }
  }
}
