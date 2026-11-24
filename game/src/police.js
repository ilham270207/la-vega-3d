// La Vega 3D — police & wanted system (LVPD).
// Wanted 0-5 stars: pursuit AI (predictive), roadblocks at 3+, heli with
// spotlight at 4+, SWAT at 5, spike strips, officers who exit the cruiser
// when close, BUSTED on catch ($100 bail, respawn at La Vega General),
// and "police remember the vehicle" — heat sticks to the car until a respray.
// Written in this session for the recorded build.
import * as THREE from 'three';
import { WORLD, ROADS, PLACES, WANTED_MAX } from './config.js';
import { clamp, damp, rand, pick, dist2d } from './rng.js';
import { groundHeight } from './city.js';
import { NPC } from './characters.js';

const CHATTER = [
  'All units, suspect is a male, dark jacket, last seen near the Marina.',
  'Unit 7, set up on Neon Ave. Suspect drives a fast car, repeat, fast car.',
  'Air One is up. Eyes on the suspect, over.',
  'Suspect is armed and dangerous. Approach with caution.',
  'Dispatch: we have a runner on Harbor Blvd. All units respond.',
  'Unit 12, cover the bridge exits. Do not let them cross the river.',
  'Suspect vehicle is wanted in connection with the club shooting.',
  'All units be advised: suspect changes cars. Watch the plates.',
  'Air One: suspect is heading for the South Docks. Cut them off.',
  'Unit 3, spike strips ready on Casino Row. Stand by.',
];

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class WantedManager {
  constructor(game) {
    this.game = game;
    this.wanted = 0;
    this.heat = 0;          // fractional heat; 1.0 heat = +1 star
    this.hiddenT = 0;       // seconds since any unit last saw the player
    this.decayT = 0;
    this.chatterT = 0;
    this.bustT = 0;
    this.units = [];        // {car, officer, tactic, seen, exitT, stuckT, lastX, lastZ, roadblock}
    this.heli = null;       // {car, light, cone}
    this.roadblocks = [];   // police cars parked across a road
    this.spikes = [];       // {x, z, mesh, t}
    this.swatActive = false;
    this.vehicleHeat = new Map(); // car -> wanted stars the police link to it
    this._seen = false;
  }

  // -- wanted level -------------------------------------------------------
  setWanted(n, reason) {
    const g = this.game;
    const next = clamp(Math.round(n), 0, WANTED_MAX);
    if (next === this.wanted) return;
    const rising = next > this.wanted;
    this.wanted = next;
    this.hiddenT = 0;
    this.decayT = 0;
    if (next === 0) {
      g.hud.notify('You lost the cops. Stay clean, Vega.');
      this._clearUnits();
    } else {
      if (rising) {
        g.hud.notify(`WANTED ${'★'.repeat(next)}${'☆'.repeat(WANTED_MAX - next)} — ${reason || 'the LVPD is on you'}`);
        g.audio?.siren(true);
        g.audio?.wantedSting();
      }
      g.hud.flashWanted();
    }
  }

  addHeat(n, reason) {
    if (n <= 0) return;
    this.heat += n;
    while (this.heat >= 1 && this.wanted < WANTED_MAX) {
      this.heat -= 1;
      this.setWanted(this.wanted + 1, reason);
    }
    if (this.wanted >= WANTED_MAX) this.heat = 0;
  }

  clearWanted(reason) {
    this.heat = 0;
    this.setWanted(0, reason);
  }

  // The police remember the vehicle: heat sticks to the car object.
  rememberVehicle(car) {
    if (!car) return;
    this.vehicleHeat.set(car, Math.max(this.vehicleHeat.get(car) || 0, this.wanted));
  }
  clearVehicleHeat(car) {
    if (!car) return;
    this.vehicleHeat.delete(car);
  }
  onPlayerEnterCar(car) {
    // Climbing into a "hot" car brings the heat back.
    const h = this.vehicleHeat.get(car);
    if (h && this.wanted < h) {
      this.setWanted(h, 'the LVPD recognised the car');
      this.game.hud.notify('This car is HOT — the cops recognised the plates!');
    }
  }

  // -- spawning -----------------------------------------------------------
  _spawnPointNearPlayer(minD = 30, maxD = 70) {
    const g = this.game;
    const p = g.player;
    for (let tries = 0; tries < 12; tries++) {
      const a = rand(g.rng, 0, Math.PI * 2);
      const d = rand(g.rng, minD, maxD);
      const x = clamp(p.x + Math.sin(a) * d, 34, 256);
      const z = clamp(p.z + Math.cos(a) * d, 34, 256);
      // Prefer a road so the cruiser does not spawn inside a building.
      const road = ROADS.reduce((best, r) => (Math.abs(r - x) < Math.abs(best - x) ? r : best), ROADS[0]);
      const rx = Math.abs(road - x) < 14 ? road : x;
      const rz = Math.abs(ROADS.reduce((best, r) => (Math.abs(r - z) < Math.abs(best - z) ? r : best), ROADS[0]) - z) < 14
        ? ROADS.reduce((best, r) => (Math.abs(r - z) < Math.abs(best - z) ? r : best), ROADS[0]) : z;
      return { x: rx, z: rz };
    }
    return { x: clamp(p.x + 40, 34, 256), z: clamp(p.z, 34, 256) };
  }

  _spawnCruiser(opts = {}) {
    const g = this.game;
    const pt = opts.at || this._spawnPointNearPlayer();
    const car = g.vehicles.spawn(opts.specKey || 'police', pt.x, pt.z, rand(g.rng, 0, Math.PI * 2), { traffic: false, color: opts.color });
    car.aiSpeed = 0;
    const unit = {
      car, officer: null, tactic: 'PURSUING', seen: false,
      exitT: 0, stuckT: 0, lastX: car.x, lastZ: car.z, stuckCheckT: 0,
      roadblock: !!opts.roadblock, swat: !!opts.swat, aiSpeed: opts.swat ? 42 : 40,
    };
    this.units.push(unit);
    return unit;
  }

  _spawnHeli() {
    const g = this.game;
    const p = g.player;
    const car = g.vehicles.spawn('police', p.x + 30, p.z - 30, 0, { kind: 'heli', traffic: false });
    car.y = 55;
    car.group.position.y = 55;
    // Spotlight cone (additive, points down at the player).
    const coneGeo = new THREE.ConeGeometry(9, 55, 20, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff6c0, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.rotation.x = Math.PI; // apex up at the heli
    g.scene.add(cone);
    const light = new THREE.PointLight(0xfff2b0, 2.2, 60);
    g.scene.add(light);
    this.heli = { car, cone, light };
    g.hud.notify('LVPD Air One is overhead. The spotlight is on you!');
  }

  _spawnRoadblock() {
    const g = this.game;
    const p = g.player;
    // Ahead of the player, on the nearest road, two cruisers across it.
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const ax = p.x + fx * 45, az = p.z + fz * 45;
    const roadX = ROADS.reduce((best, r) => (Math.abs(r - ax) < Math.abs(best - ax) ? r : best), ROADS[0]);
    const roadZ = ROADS.reduce((best, r) => (Math.abs(r - az) < Math.abs(best - az) ? r : best), ROADS[0]);
    const useNS = Math.abs(roadX - ax) < Math.abs(roadZ - az);
    const cx = useNS ? roadX : clamp(ax, 34, 256);
    const cz = useNS ? clamp(az, 34, 256) : roadZ;
    const heading = useNS ? 0 : Math.PI / 2;
    for (const off of [-4, 4]) {
      const bx = useNS ? cx + off : cx;
      const bz = useNS ? cz : cz + off;
      const car = g.vehicles.spawn('police', bx, bz, heading, { traffic: false });
      const unit = { car, officer: null, tactic: 'ROADBLOCK', seen: true, exitT: 0, stuckT: 0, lastX: bx, lastZ: bz, stuckCheckT: 0, roadblock: true, swat: false, aiSpeed: 0 };
      this.units.push(unit);
      this.roadblocks.push(unit);
    }
    // Spike strip between the two cruisers.
    this._dropSpikes(cx, cz);
    // Two officers on foot at the roadblock (round 3: one officer read as
    // a bystander — a pair flanking the spike strip reads as a roadblock).
    for (const [ox, oz] of useNS ? [[-2, 2], [2, 2]] : [[2, -2], [2, 2]]) {
      const off = new NPC(g, { kind: 'cop', x: cx + ox, z: cz + oz, modelKey: 'npcMale', shirt: 0x20242c });
      off.build();
      off.state = 'idle';
      g.characters.npcs.push(off);
      this.roadblocks[this.roadblocks.length - 1].officer = off;
    }
    g.hud.notify('LVPD roadblock ahead! Spike strips on the road.');
    g.audio?.radioBlip();
  }

  _dropSpikes(x, z) {
    const g = this.game;
    const grp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 1.2), new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
    base.position.y = 0.06; grp.add(base);
    const spikeM = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
    for (let i = -2; i <= 2; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), spikeM);
      s.position.set(i * 1.1, 0.3, 0); grp.add(s);
    }
    grp.position.set(x, groundHeight(x, z), z);
    g.scene.add(grp);
    this.spikes.push({ x, z, mesh: grp, t: 60 });
  }

  _spawnSwat() {
    const g = this.game;
    const unit = this._spawnCruiser({ swat: true, specKey: 'van', color: 0x20242c }); // SWAT van
    unit.tactic = 'SWAT';
    // Two SWAT officers ride with the van.
    for (let i = 0; i < 2; i++) {
      const npc = new NPC(g, { kind: 'cop', x: unit.car.x + i * 1.5, z: unit.car.z, modelKey: 'npcMale', shirt: 0x20242c });
      npc.build();
      npc.state = 'chase';
      npc.fleeFrom = { x: g.player.x, z: g.player.z };
      g.characters.npcs.push(npc);
      if (!unit.officer) unit.officer = npc;
    }
    this.swatActive = true;
    g.hud.notify('SWAT is on the scene. Five stars — run or fight, Vega.');
    g.audio?.siren(true);
  }

  _clearUnits() {
    const g = this.game;
    for (const u of this.units) {
      if (u.officer && !u.officer.dead) g.characters.recycleNPC(u.officer);
      if (u.car && !u.car.dead) {
        g.vehicles.cars = g.vehicles.cars.filter((c) => c !== u.car);
        g.scene.remove(u.car.group);
        u.car.dead = true;
      }
    }
    this.units = [];
    this.roadblocks = [];
    if (this.heli) {
      g.scene.remove(this.heli.cone);
      g.scene.remove(this.heli.light);
      g.vehicles.cars = g.vehicles.cars.filter((c) => c !== this.heli.car);
      g.scene.remove(this.heli.car.group);
      this.heli.car.dead = true;
      this.heli = null;
    }
    for (const s of this.spikes) g.scene.remove(s.mesh);
    this.spikes = [];
    this.swatActive = false;
    g.audio?.siren(false);
  }

  // -- dispatch board ------------------------------------------------------
  getDispatch() {
    const p = this.game.player;
    return {
      wanted: this.wanted,
      units: this.units.map((u) => ({
        tactic: u.tactic,
        dist: Math.round(dist2d(u.car.x, u.car.z, p.x, p.z)),
        seen: u.seen,
      })),
      heli: !!this.heli,
      swat: this.swatActive,
      roadblock: this.roadblocks.length > 0,
    };
  }

  // -- busted ---------------------------------------------------------------
  busted() {
    const g = this.game;
    const bail = 100;
    const paid = Math.min(g.player.money, bail);
    g.player.money -= paid;
    this.clearWanted('busted');
    g.audio?.busted();
    g.hud.showBusted(paid);
    // Respawn at La Vega General, on foot.
    if (g.vehicles.playerCar) g.vehicles.exitCar();
    g.player.x = PLACES.hospital.x;
    g.player.z = PLACES.hospital.y + 8;
    g.player.y = groundHeight(g.player.x, g.player.z);
    g.player.health = 100;
    g.player.armor = 0;
    g.player.heading = Math.PI;
    g.player.group.position.set(g.player.x, g.player.y, g.player.z);
    g.player.dead = false;
    g.missions?.onBusted?.();
  }

  // -- per-frame -------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p || p.dead) return;

    // Visibility: any unit close enough (or the heli) sees the player.
    let seen = false;
    for (const u of this.units) {
      const d = dist2d(u.car.x, u.car.z, p.x, p.z);
      u.seen = d < 55 && !p.inInterior;
      if (u.seen) seen = true;
    }
    if (this.heli) {
      const d = dist2d(this.heli.car.x, this.heli.car.z, p.x, p.z);
      if (d < 85 && !p.inInterior) seen = true;
    }
    this._seen = seen;
    if (seen) { this.hiddenT = 0; this.decayT = 0; }
    else if (this.wanted > 0) {
      this.hiddenT += dt;
      if (this.hiddenT > 8) {
        this.decayT += dt;
        if (this.decayT > 6) {
          this.decayT = 0;
          this.setWanted(this.wanted - 1, 'lost them');
        }
      }
    }

    // Maintain force size: 1 cruiser per star (cap 4) + heli at 4+ + SWAT at 5.
    if (this.wanted > 0) {
      const wantCars = Math.min(this.wanted, 4);
      // NOTE: count inside the loop — filter() returns a snapshot, so a
      // cached length would spin forever (each spawn pushes to this.units).
      while (this.units.filter((u) => !u.roadblock).length < wantCars) this._spawnCruiser();
      if (this.wanted >= 3 && this.roadblocks.length === 0) this._spawnRoadblock();
      if (this.wanted >= 4 && !this.heli) this._spawnHeli();
      if (this.wanted >= 5 && !this.swatActive) this._spawnSwat();
      if (this.wanted < 3 && this.roadblocks.length) {
        for (const u of this.roadblocks) {
          g.vehicles.cars = g.vehicles.cars.filter((c) => c !== u.car);
          g.scene.remove(u.car.group); u.car.dead = true;
          this.units = this.units.filter((x) => x !== u);
        }
        this.roadblocks = [];
      }
      if (this.wanted < 4 && this.heli) {
        g.scene.remove(this.heli.cone); g.scene.remove(this.heli.light);
        g.vehicles.cars = g.vehicles.cars.filter((c) => c !== this.heli.car);
        g.scene.remove(this.heli.car.group); this.heli.car.dead = true; this.heli = null;
      }
      // Radio chatter.
      this.chatterT -= dt;
      if (this.chatterT <= 0) {
        this.chatterT = 9 + Math.random() * 4;
        g.hud.notify(`LVPD: ${pick(g.rng, CHATTER)}`);
        g.audio?.radioBlip();
      }
    }

    // Pursuit driving.
    for (const u of this.units) this._updateUnit(u, dt);

    // Heli follows the player from above; spotlight tracks them.
    if (this.heli) {
      const h = this.heli.car;
      const tx = p.x + (p.inCar ? Math.sin(p.heading) * p.speed * 0.4 : 0);
      const tz = p.z + (p.inCar ? Math.cos(p.heading) * p.speed * 0.4 : 0);
      h.heading = Math.atan2(tx - h.x, tz - h.z);
      const d = dist2d(h.x, h.z, tx, tz);
      const sp = d > 12 ? 26 : 8;
      h.x += Math.sin(h.heading) * sp * dt;
      h.z += Math.cos(h.heading) * sp * dt;
      h.y = damp(h.y, 55, 1.5, dt);
      h.group.position.set(h.x, h.y, h.z);
      h.group.rotation.y = h.heading;
      if (h.rotor) h.rotor.rotation.y += dt * 22;
      this.heli.cone.position.set(h.x, h.y - 27, h.z);
      this.heli.light.position.set(h.x, h.y - 6, h.z);
      // Spotlight ground disc follows the player.
      this.heli.cone.position.x = (h.x + p.x) / 2;
      this.heli.cone.position.z = (h.z + p.z) / 2;
      const dx = p.x - h.x, dz = p.z - h.z;
      const len = Math.max(1, Math.hypot(dx, dz));
      this.heli.cone.rotation.z = Math.atan2(dx, -55) * 0.4;
      this.heli.cone.rotation.x = Math.PI + Math.atan2(dz, 55) * 0.4;
      void len;
    }

    // Spike strips: shred the player's tires.
    const pc = g.vehicles.playerCar;
    if (pc) {
      for (const s of this.spikes) {
        if (dist2d(pc.x, pc.z, s.x, s.z) < 2.4) {
          pc.damage(25);
          pc.speed *= 0.35;
          g.hud.notify('Spike strip! Tires shredded — condition down.');
          g.audio?.crash();
          g.scene.remove(s.mesh);
          this.spikes = this.spikes.filter((x) => x !== s);
          break;
        }
      }
    }
    for (const s of this.spikes) { s.t -= dt; if (s.t <= 0) { g.scene.remove(s.mesh); this.spikes = this.spikes.filter((x) => x !== s); } }

    // Busted: an officer on foot reaches the player.
    if (this.wanted > 0 && !p.inCar && !p.inHeli && !p.inBoat) {
      let close = false;
      for (const u of this.units) {
        if (u.officer && !u.officer.dead && dist2d(u.officer.x, u.officer.z, p.x, p.z) < 2.0) { close = true; break; }
      }
      if (close) {
        this.bustT += dt;
        if (this.bustT > 1.2) { this.bustT = 0; this.busted(); return; }
      } else this.bustT = 0;
    } else this.bustT = 0;
  }

  _updateUnit(u, dt) {
    const g = this.game;
    const p = g.player;
    const car = u.car;
    if (!car || car.dead) return;
    if (u.roadblock) {
      // Parked across the road; officer stays with the car.
      car.speed = 0;
      return;
    }
    // Predictive target: where the player will be in ~0.6s.
    const pvx = p.inCar ? Math.sin(p.heading) * (p.speed || 0) : 0;
    const pvz = p.inCar ? Math.cos(p.heading) * (p.speed || 0) : 0;
    const tx = p.x + pvx * 0.6, tz = p.z + pvz * 0.6;
    const d = dist2d(car.x, car.z, tx, tz);
    const want = Math.atan2(tx - car.x, tz - car.z);
    const dh = angleDiff(want, car.heading);
    car.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
    // Slow for the car ahead / tight turns, full speed on a straight chase.
    let target = u.aiSpeed * (Math.abs(dh) > 0.9 ? 0.45 : 1);
    if (d < 6) target = Math.min(target, 6);
    // Don't ram through the player's car at full speed when very close.
    if (d < 3.5) target = 0;
    car.speed = damp(car.speed, target, 1.4, dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    car.y = groundHeight(car.x, car.z);
    car.group.position.set(car.x, car.y, car.z);
    car.group.rotation.y = car.heading;
    const spin = (car.speed * dt) / 0.34;
    for (const w of car.wheels) w.rotation.x += spin;
    g.vehicles._collideBuildings(car);
    u.tactic = u.swat ? 'SWAT' : (u.seen ? 'PURSUING' : (d > 80 ? 'SEARCHING' : 'PURSUING'));

    // Stuck detection: if the cruiser barely moved for 4s, respawn it closer.
    u.stuckCheckT += dt;
    if (u.stuckCheckT > 2) {
      const moved = dist2d(car.x, car.z, u.lastX, u.lastZ);
      if (moved < 1 && Math.abs(car.speed) < 1) u.stuckT += 2; else u.stuckT = 0;
      u.lastX = car.x; u.lastZ = car.z; u.stuckCheckT = 0;
      if (u.stuckT >= 4) {
        const pt = this._spawnPointNearPlayer(25, 40);
        car.x = pt.x; car.z = pt.z; car.speed = 0; u.stuckT = 0;
      }
    }

    // Officer exits the cruiser when close to a player on foot.
    if (!p.inCar && !p.inHeli && !p.inBoat && d < 9 && Math.abs(car.speed) < 3 && !u.officer) {
      const npc = new NPC(g, { kind: 'cop', x: car.x + 1.5, z: car.z, modelKey: 'npcMale', shirt: 0x20242c });
      npc.build();
      npc.state = 'chase';
      npc.fleeFrom = { x: p.x, z: p.z };
      g.characters.npcs.push(npc);
      u.officer = npc;
      g.hud.notify('LVPD officer is on foot — run!');
      g.audio?.radioBlip();
    }
    // Officer gives up the foot chase and returns to the car.
    if (u.officer) {
      const o = u.officer;
      if (o.dead) { u.officer = null; }
      else {
        o.fleeFrom = { x: p.x, z: p.z };
        const od = dist2d(o.x, o.z, p.x, p.z);
        if (od > 45 || p.inCar) {
          g.characters.recycleNPC(o);
          u.officer = null;
        }
      }
    }
  }
}
