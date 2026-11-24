// characters.js — La Vega people (round 12).
// The player (Jax / Maya, 1.81 m procedural humanoids with a named parts
// tree for animation probes) and ~110 NPCs with visible daily life:
// walk, hurry, chat, sit, wait, fish, swim, jetski, sunbathe, shop,
// work, plus cops, gang members, fleeing drivers and crew followers.
// NPCs stay grounded, on sidewalks, and water activities stay in the sea.
import * as THREE from 'three';
import { WORLD, ROADS, PLACES, DISTRICTS, PLAYER } from './config.js';
import { mulberry32, clamp, rand, pick, randInt } from './rng.js';

const SHIRTS = [0x2a6fd6, 0xd92038, 0x7dff8a, 0xffd34d, 0xff2a9d, 0xe8e8e8, 0x8a5a3a, 0x4da3ff, 0x9a6fd6, 0x3a3a3a];
const PANTS = [0x2a2a3a, 0x3a3a3a, 0x5a4a3a, 0x2a4a5a, 0x6a6a6a];
const SKINS = [0xc89666, 0x8a5a3a, 0xe8b88a, 0x6a3a22, 0xd9a06a];
const HAIRS = [0x1a1a1a, 0x3a2a1a, 0x6a4a2a, 0x8a8a8a];

// Build a procedural humanoid (~1.81 m). Returns {group, parts} where
// parts has named pivots: legL, legR, armL, armR, torso, head.
export function buildHumanoid(opts = {}) {
  const shirt = opts.shirt !== undefined ? opts.shirt : 0x2a6fd6;
  const pants = opts.pants !== undefined ? opts.pants : 0x2a2a3a;
  const skin = opts.skin !== undefined ? opts.skin : 0xc89666;
  const hair = opts.hair !== undefined ? opts.hair : 0x1a1a1a;
  const group = new THREE.Group();
  const parts = {};
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const mkBox = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  // Legs (pivot at the hip, y = 0.90).
  for (const side of ['legL', 'legR']) {
    const pivot = new THREE.Group();
    pivot.position.set(side === 'legL' ? -0.11 : 0.11, 0.9, 0);
    const leg = mkBox(0.17, 0.9, 0.19, lam(pants));
    leg.position.y = -0.45;
    pivot.add(leg);
    const shoe = mkBox(0.18, 0.09, 0.3, lam(0x1a1a1a));
    shoe.position.set(0, -0.86, 0.05);
    pivot.add(shoe);
    group.add(pivot);
    parts[side] = pivot;
  }
  // Torso (pivot at the waist).
  const torso = new THREE.Group();
  torso.position.set(0, 0.9, 0);
  const chest = mkBox(0.44, 0.62, 0.25, lam(shirt));
  chest.position.y = 0.31;
  torso.add(chest);
  const belt = mkBox(0.46, 0.07, 0.27, lam(0x1a1a1a));
  belt.position.y = 0.04;
  torso.add(belt);
  const pocket = mkBox(0.12, 0.12, 0.03, lam(0xffffff));
  pocket.position.set(-0.12, 0.42, 0.14);
  torso.add(pocket);
  group.add(torso);
  parts.torso = torso;
  // Arms (pivot at the shoulder, y = 1.42).
  for (const side of ['armL', 'armR']) {
    const pivot = new THREE.Group();
    pivot.position.set(side === 'armL' ? -0.28 : 0.28, 1.42, 0);
    const arm = mkBox(0.14, 0.6, 0.16, lam(shirt));
    arm.position.y = -0.3;
    pivot.add(arm);
    const hand = mkBox(0.13, 0.12, 0.14, lam(skin));
    hand.position.y = -0.64;
    pivot.add(hand);
    group.add(pivot);
    parts[side] = pivot;
  }
  // Head (pivot at the neck).
  const head = new THREE.Group();
  head.position.set(0, 1.52, 0);
  const skull = mkBox(0.27, 0.29, 0.27, lam(skin));
  skull.position.y = 0.145;
  head.add(skull);
  const hairM = mkBox(0.28, 0.09, 0.28, lam(hair));
  hairM.position.y = 0.3;
  head.add(hairM);
  const nose = mkBox(0.05, 0.08, 0.05, lam(skin));
  nose.position.set(0, 0.12, 0.15);
  head.add(nose);
  group.add(head);
  parts.head = head;
  return { group, parts };
}

export class NPC {
  constructor(game, opts = {}) {
    this.game = game;
    this.kind = opts.kind || 'ped';
    this.x = opts.x || 0;
    this.y = 0.1;
    this.z = opts.z || 0;
    this.heading = opts.heading !== undefined ? opts.heading : rand(game.rng, 0, Math.PI * 2);
    this.state = opts.state || 'walk';
    this.modelKey = opts.modelKey || 'npcMale';
    this.shirt = opts.shirt !== undefined ? opts.shirt : pick(game.rng, SHIRTS);
    this.pants = opts.pants !== undefined ? opts.pants : pick(game.rng, PANTS);
    this.skin = opts.skin !== undefined ? opts.skin : pick(game.rng, SKINS);
    this.home = opts.home || { x: this.x, z: this.z };
    this.health = 100;
    this.dead = false;
    this.deadT = 0;
    this.pose = 'stand';
    this.moveSpeed = 0;
    this.walkPhase = rand(game.rng, 0, Math.PI * 2);
    this.target = null;
    this.waitT = rand(game.rng, 0, 2);
    this.fleeFrom = null;
    this.fleeT = 0;
    this.punchCd = 0;
    this.punchAnimT = 0;
    this.isCrew = false;
    this.crewName = null;
    this.crewSlot = -1;
    this.crewOrder = 'follow';
    this.group = null;
    this.parts = null;
    this.name = opts.name || null;
  }

  build() {
    if (this.group) return this.group;
    let shirt = this.shirt;
    let pants = this.pants;
    if (this.kind === 'cop') { shirt = 0x20242c; pants = 0x1a1a22; }
    if (this.kind === 'gang') { shirt = 0x8a1a1a; pants = 0x2a2a2a; }
    const built = buildHumanoid({ shirt, pants, skin: this.skin });
    this.group = built.group;
    this.parts = built.parts;
    if (this.kind === 'cop') {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.3), new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
      cap.position.y = 0.36;
      this.parts.head.add(cap);
    }
    if (this.kind === 'gang') {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.28), new THREE.MeshLambertMaterial({ color: 0x8a1a1a }));
      band.position.y = 0.28;
      this.parts.head.add(band);
    }
    if (this.state === 'jetski') {
      // Little jetski hull under a seated rider.
      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 2.0), new THREE.MeshLambertMaterial({ color: 0x2a6fd6 }));
      hull.position.set(0, 0.05, 0.1);
      this.group.add(hull);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
      seat.position.set(0, 0.24, -0.3);
      this.group.add(seat);
    }
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    this.game.scene.add(this.group);
    return this.group;
  }
}

const SHOP_SPOTS = ['minimarket', 'clotheshop', 'mall', 'petshop', 'dealer', 'gunShop'];
const WORK_SPOTS = ['dock', 'warehouse', 'harbor', 'restaurant'];

export class CharacterManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.rng = game.rng;
    this.npcs = [];
    this.player = null;
    this.playerChar = 'jax';
  }

  // ---------- player ----------
  spawnPlayer(charId = 'jax') {
    this.playerChar = charId;
    const isJax = charId !== 'maya';
    const built = buildHumanoid({
      shirt: isJax ? 0xd92038 : 0x2a9d8f,
      pants: isJax ? 0x2a2a3a : 0x3a2a4a,
      skin: isJax ? 0xc89666 : 0xe8b88a,
      hair: isJax ? 0x1a1a1a : 0x3a2a1a,
    });
    const p = {
      charId,
      x: 30, y: 0.1, z: 100, heading: Math.PI / 2,
      health: PLAYER.health, armor: 0, stamina: 100,
      money: 0, weapon: 'fists',
      weapons: { fists: { mag: 0, reserve: 0 } },
      group: built.group, parts: built.parts,
      flash: null, grounded: true, vy: 0,
      inCar: false, inHeli: false, inBoat: false, dead: false,
      stats: { drive: 0, shoot: 0 },
      walkPhase: 0, punchCd: 0, punchAnimT: 0, reloadT: 0,
      lastHurtT: -10, aimT: 0,
      giveWeapon: (id, amount) => this._giveWeapon(p, id, amount),
      setWeapon: (id) => this._setWeapon(p, id),
    };
    // Muzzle flash (kept out of the player group so it never affects
    // the measured character height).
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 })
    );
    flash.visible = false;
    this.scene.add(flash);
    p.flash = flash;
    this.scene.add(p.group);
    this.player = p;
    return p;
  }

  switchCharacter(charId) {
    if (!this.player || this.playerChar === charId) return this.player;
    const old = this.player;
    this.scene.remove(old.group);
    if (old.flash) this.scene.remove(old.flash);
    const keep = { x: old.x, y: old.y, z: old.z, heading: old.heading, health: old.health, armor: old.armor, money: old.money, weapons: old.weapons, weapon: old.weapon };
    const p = this.spawnPlayer(charId);
    Object.assign(p, keep);
    p.inCar = old.inCar;
    return p;
  }

  _giveWeapon(p, id, amount) {
    const w = { fists: { mag: 0, reserve: 0 }, pistol: { mag: 12, reserve: 0 }, smg: { mag: 30, reserve: 0 }, shotgun: { mag: 6, reserve: 0 }, rifle: { mag: 30, reserve: 0 } }[id];
    if (!w) return;
    if (!p.weapons[id]) p.weapons[id] = { mag: w.mag, reserve: 0 };
    p.weapons[id].reserve += amount > 0 ? amount : w.mag * 5;
    if (p.weapons[id].mag === 0) p.weapons[id].mag = w.mag;
  }

  _setWeapon(p, id) {
    if (p.weapons[id]) p.weapon = id;
  }

  // ---------- NPC spawning ----------
  spawnNPC(opts = {}) {
    const npc = new NPC(this.game, opts);
    npc.build();
    this.npcs.push(npc);
    return npc;
  }

  spawnPedestrian(x, z, state = 'walk') {
    return this.spawnNPC({ kind: 'ped', x, z, state });
  }

  recycleNPC(npc) {
    const i = this.npcs.indexOf(npc);
    if (i >= 0) this.npcs.splice(i, 1);
    if (npc.group) this.scene.remove(npc.group);
  }

  spawnInitial() {
    const g = this.game;
    const rng = this.rng;
    const sidePoint = () => {
      const s = g.city.sidewalks[Math.floor(rng() * g.city.sidewalks.length)];
      return { x: rand(rng, s.x0 + 0.3, s.x1 - 0.3), z: rand(rng, s.z0 + 0.3, s.z1 - 0.3) };
    };
    const mk = (state, x, z, extra = {}) => this.spawnNPC({ kind: 'ped', x, z, state, ...extra });
    for (let i = 0; i < 50; i++) { const pt = sidePoint(); mk('walk', pt.x, pt.z); }
    for (let i = 0; i < 8; i++) { const pt = sidePoint(); mk('hurry', pt.x, pt.z); }
    for (let i = 0; i < 5; i++) {
      const pt = sidePoint();
      // Both partners stand inside the SAME sidewalk rect: a blind
      // offset could push the second one onto the road.
      const s = g.city.sidewalks.reduce((best, cur) => {
        const dCur = Math.hypot(Math.max(cur.x0 - pt.x, 0, pt.x - cur.x1), Math.max(cur.z0 - pt.z, 0, pt.z - cur.z1));
        const dBest = best ? Math.hypot(Math.max(best.x0 - pt.x, 0, pt.x - best.x1), Math.max(best.z0 - pt.z, 0, pt.z - best.z1)) : Infinity;
        return dCur < dBest ? cur : best;
      }, null);
      const pt2 = { x: rand(rng, s.x0 + 0.3, s.x1 - 0.3), z: rand(rng, s.z0 + 0.3, s.z1 - 0.3) };
      const a = mk('chat', pt.x, pt.z);
      const b = mk('chat', pt2.x, pt2.z);
      a.partner = b; b.partner = a;
      a.heading = Math.atan2(b.x - a.x, b.z - a.z);
      b.heading = Math.atan2(a.x - b.x, a.z - b.z);
    }
    for (let i = 0; i < 6; i++) {
      const s = g.city.busStops[i % g.city.busStops.length];
      mk('sit', s.x + rand(rng, -1, 1), s.z + rand(rng, -0.5, 0.5));
    }
    for (let i = 0; i < 5; i++) {
      const s = g.city.busStops[(i + 2) % g.city.busStops.length];
      mk('wait', s.x + rand(rng, -1.5, 1.5), s.z + rand(rng, -1, 1));
    }
    for (const s of g.city.beachSpots.fish.slice(0, 5)) mk('fish', s.x, s.z);
    for (const s of g.city.beachSpots.swim.slice(0, 4)) mk('swim', s.x, s.z);
    for (const s of g.city.beachSpots.jetski.slice(0, 3)) mk('jetski', s.x, s.z);
    for (const s of g.city.beachSpots.sun.slice(0, 6)) mk('sunbathe', s.x, s.z);
    // Shop / work NPCs stand on the sidewalk NEAREST their shop, never
    // in the shop's doorway or on the road in front of it.
    const nearSide = (x, z) => {
      let best = null;
      let bestD = Infinity;
      for (const s of g.city.sidewalks) {
        const cx = (s.x0 + s.x1) / 2;
        const cz = (s.z0 + s.z1) / 2;
        const d = Math.hypot(cx - x, cz - z);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    };
    for (let i = 0; i < 6; i++) {
      const key = SHOP_SPOTS[i % SHOP_SPOTS.length];
      const p = PLACES[key];
      const s = nearSide(p.x, p.y);
      mk('shop', rand(rng, s.x0 + 0.3, s.x1 - 0.3), rand(rng, s.z0 + 0.3, s.z1 - 0.3), { home: { x: p.x, z: p.y } });
    }
    for (let i = 0; i < 6; i++) {
      const key = WORK_SPOTS[i % WORK_SPOTS.length];
      const p = PLACES[key];
      const s = nearSide(p.x, p.y);
      mk('work', rand(rng, s.x0 + 0.3, s.x1 - 0.3), rand(rng, s.z0 + 0.3, s.z1 - 0.3), { home: { x: p.x, z: p.y } });
    }
    for (let i = 0; i < 4; i++) {
      const pt = sidePoint();
      this.spawnNPC({ kind: 'cop', x: 130 + rand(rng, -14, 14), z: 156 + rand(rng, -14, 14), state: 'walk' });
      void pt;
    }
  }

  // ---------- probes ----------
  countAbnormal() {
    const bad = [];
    for (const n of this.npcs) {
      if (n.dead) continue;
      if (n.y > 0.35) { bad.push({ x: +n.x.toFixed(1), z: +n.z.toFixed(1), why: 'floating' }); continue; }
      if (n.pose === 'lie' && !['sunbathe', 'dying', 'dead'].includes(n.state)) {
        bad.push({ x: +n.x.toFixed(1), z: +n.z.toFixed(1), why: 'lying-' + n.state });
      }
    }
    return { count: bad.length, bad };
  }

  countOffSidewalk() {
    const bad = [];
    const g = this.game;
    for (const n of this.npcs) {
      if (n.dead || n.kind !== 'ped') continue;
      if (!['walk', 'hurry', 'chat', 'sit', 'wait', 'shop', 'work'].includes(n.state)) continue;
      if (g.city.isOnRoad(n.x, n.z) && !g.city.isOnSidewalk(n.x, n.z)) {
        bad.push({ x: +n.x.toFixed(1), z: +n.z.toFixed(1), state: n.state });
      }
    }
    return { count: bad.length, bad };
  }

  countWaterOnLand() {
    const bad = [];
    for (const n of this.npcs) {
      if (n.dead) continue;
      if ((n.state === 'swim' || n.state === 'jetski') && n.x >= WORLD.seaX) {
        bad.push({ x: +n.x.toFixed(1), z: +n.z.toFixed(1), state: n.state });
      }
      if (n.state === 'fish' && (n.x < 14 || n.x > 30)) {
        bad.push({ x: +n.x.toFixed(1), z: +n.z.toFixed(1), state: n.state });
      }
    }
    return { count: bad.length, bad };
  }

  // ---------- per-frame ----------
  update(dt, input) {
    const g = this.game;
    if (this.player) this._updatePlayer(dt, input || {});
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      if (!n.group) n.build();
      this._updateNPC(dt, n);
    }
  }

  _collidePlayer(p) {
    const g = this.game;
    if (!g.city) return;
    for (const col of g.city.colliders) {
      const dx = p.x - col.x;
      const dz = p.z - col.z;
      const d = Math.hypot(dx, dz);
      const min = col.r + PLAYER.radius;
      if (d < min && d > 0.001) {
        p.x = col.x + (dx / d) * min;
        p.z = col.z + (dz / d) * min;
      }
    }
    const c = g.city.clampPlayer(p.x, p.z);
    p.x = c.x; p.z = c.z;
  }

  _updatePlayer(dt, input) {
    const g = this.game;
    const p = this.player;
    if (!p || p.dead) return;
    if (p.inCar) {
      // Seated in the car: hands on the wheel, no on-foot motion.
      p.parts.armL.rotation.x = -1.1;
      p.parts.armR.rotation.x = -1.1;
      p.parts.legL.rotation.x = -1.2;
      p.parts.legR.rotation.x = -1.2;
      p.group.position.set(p.x, 0.1, p.z);
      p.group.rotation.y = p.heading;
      return;
    }
    const now = (g.time || 0);
    // Facing eases toward the camera direction while moving.
    const moving = input.moveZ !== 0 || input.moveX !== 0;
    if (moving && g.camYaw !== undefined) {
      const target = g.camYaw + Math.PI;
      let diff = target - p.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.heading += clamp(diff, -6 * dt, 6 * dt);
    }
    // Speed: walk / run, half speed wading in the shallows.
    const inWater = g.city ? g.city.isInWater(p.x) : false;
    const wantRun = !!input.run && p.stamina > 1;
    let speed = wantRun ? PLAYER.run : PLAYER.walk;
    if (inWater) speed *= 0.5;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const rx = -Math.cos(p.heading);
    const rz = Math.sin(p.heading);
    const mx = fx * (-(input.moveZ || 0)) + rx * (input.moveX || 0);
    const mz = fz * (-(input.moveZ || 0)) + rz * (input.moveX || 0);
    const mLen = Math.hypot(mx, mz);
    if (mLen > 0.01) {
      p.x += (mx / mLen) * speed * dt;
      p.z += (mz / mLen) * speed * dt;
      p.moveSpeed = speed;
      p.walkPhase += dt * speed * 1.6;
      if (wantRun) p.stamina = Math.max(0, p.stamina - 12 * dt);
    } else {
      p.moveSpeed = 0;
      p.stamina = Math.min(100, p.stamina + 10 * dt);
    }
    // Jump + gravity.
    if (input.jump && p.grounded) {
      p.vy = 8.5;
      p.grounded = false;
    }
    if (!p.grounded) {
      p.vy -= 22 * dt;
      p.y += p.vy * dt;
      if (p.y <= 0.1) { p.y = 0.1; p.vy = 0; p.grounded = true; }
    }
    this._collidePlayer(p);
    // Punch.
    p.punchCd = Math.max(0, p.punchCd - dt);
    if (input.punch && p.punchCd <= 0) {
      p.punchCd = 0.4;
      p.punchAnimT = 0.3;
      this._playerPunch();
    }
    if (p.punchAnimT > 0) p.punchAnimT -= dt;
    // Shoot / aim.
    const wdef = { fists: { mag: 0, range: 2.2, damage: 34, interval: 0.4 }, pistol: { mag: 12, range: 40, damage: 50, interval: 0.25 }, smg: { mag: 30, range: 30, damage: 22, interval: 0.09 }, shotgun: { mag: 6, range: 18, damage: 110, interval: 0.8 }, rifle: { mag: 30, range: 70, damage: 80, interval: 0.12 } }[p.weapon] || { mag: 0, range: 2.2, damage: 34, interval: 0.4 };
    p.aimT = input.aim ? Math.min(1, p.aimT + dt * 6) : Math.max(0, p.aimT - dt * 6);
    if (input.fire && p.weapon !== 'fists') {
      p.fireCd = Math.max(0, (p.fireCd || 0) - dt);
      if (p.fireCd <= 0) {
        p.fireCd = wdef.interval;
        const slot = p.weapons[p.weapon];
        if (slot && slot.mag > 0) {
          slot.mag -= 1;
          p.stats.shoot += 1;
          this._playerShoot(wdef);
          if (g.audio) g.audio.shoot();
        } else if (g.audio) {
          g.audio.dryFire();
        }
      }
    }
    if (input.reload || (p.weapons[p.weapon] && p.weapons[p.weapon].mag === 0 && p.weapons[p.weapon].reserve > 0)) {
      if (p.reloadT <= 0 && p.weapon !== 'fists') {
        p.reloadT = { pistol: 1.1, smg: 1.5, shotgun: 2.0, rifle: 1.7 }[p.weapon] || 1;
        if (g.audio) g.audio.reload();
      }
    }
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        const slot = p.weapons[p.weapon];
        const cap = { pistol: 12, smg: 30, shotgun: 6, rifle: 30 }[p.weapon] || 0;
        const take = Math.min(cap, slot.reserve);
        slot.mag = take;
        slot.reserve -= take;
      }
    }
    // Health regen after 5 s without damage.
    if (now - p.lastHurtT > 5 && p.health < 100) p.health = Math.min(100, p.health + 3 * dt);
    // Animation: run swing, aim pose, punch.
    const swing = p.moveSpeed > 0.1 ? Math.sin(p.walkPhase) * (p.moveSpeed > 5 ? 0.85 : 0.55) : 0;
    p.parts.legL.rotation.x = swing;
    p.parts.legR.rotation.x = -swing;
    p.parts.armL.rotation.x = -swing * 0.8;
    p.parts.armR.rotation.x = swing * 0.8;
    if (p.aimT > 0.05) {
      p.parts.armR.rotation.x = -1.35 * p.aimT + swing * 0.2 * (1 - p.aimT);
      p.parts.armL.rotation.x = -0.9 * p.aimT;
    }
    if (p.punchAnimT > 0) {
      p.parts.armR.rotation.x = -1.6 * (p.punchAnimT / 0.3);
    }
    p.parts.torso.rotation.x = p.moveSpeed > 5 ? 0.12 : 0;
    p.group.position.set(p.x, p.y, p.z);
    p.group.rotation.y = p.heading;
    // Muzzle flash follows the gun for a blink.
    if (p.flash) {
      if (p.flash.visible) {
        p.flashT = (p.flashT || 0) - dt;
        if (p.flashT <= 0) p.flash.visible = false;
      }
      if (p.flash.visible) {
        p.flash.position.set(
          p.x + Math.sin(p.heading) * 0.6,
          p.y + 1.35,
          p.z + Math.cos(p.heading) * 0.6
        );
      }
    }
  }

  _nearestNPCInFront(x, z, heading, range, maxAngle = 0.5) {
    let best = null;
    let bestD = range;
    for (const n of this.npcs) {
      if (n.dead) continue;
      const dx = n.x - x;
      const dz = n.z - z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const ang = Math.atan2(dx, dz);
      let diff = ang - heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > maxAngle) continue;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  _hurtNPC(npc, dmg) {
    npc.health -= dmg;
    if (npc.health <= 0 && !npc.dead) {
      npc.state = 'dying';
      npc.deadT = 0;
      npc.pose = 'lie';
    }
  }

  _playerPunch() {
    const p = this.player;
    const target = this._nearestNPCInFront(p.x, p.z, p.heading, PLAYER.punchRange, 0.9);
    if (!target) return;
    this._hurtNPC(target, PLAYER.punchDamage);
    if (this.game.audio) this.game.audio.punch();
    if (target.kind === 'cop' && this.game.police) this.game.police.addHeat(1, 'assault');
  }

  _playerShoot(wdef) {
    const g = this.game;
    const p = this.player;
    const target = this._nearestNPCInFront(p.x, p.z, p.heading, wdef.range, 0.12);
    if (target) {
      this._hurtNPC(target, wdef.damage);
      if (target.kind === 'cop' && g.police) g.police.addHeat(1, 'cop shot');
    }
    p.flash.visible = true;
    p.flashT = 0.09;
  }

  _updateNPC(dt, n) {
    const g = this.game;
    const p = this.player;
    if (n.dead) {
      n.group.position.set(n.x, 0.12, n.z);
      return;
    }
    if (n.state === 'dying') {
      n.deadT += dt;
      const k = Math.min(1, n.deadT / 0.5);
      n.group.rotation.x = -Math.PI / 2 * k;
      if (n.deadT > 1.2) {
        n.dead = true;
        n.group.rotation.x = -Math.PI / 2;
      }
      n.group.position.set(n.x, 0.12, n.z);
      return;
    }
    n.punchCd = Math.max(0, n.punchCd - dt);
    if (n.punchAnimT > 0) n.punchAnimT -= dt;
    switch (n.state) {
      case 'walk':
      case 'hurry': {
        const speed = n.state === 'hurry' ? 2.9 : 1.4;
        // Walkers stay on ONE sidewalk lane: waypoints are sampled
        // inside the lane they occupy, so they never cut across roads
        // or blocks to reach a far waypoint.
        if (!n.lane) {
          let best = null;
          let bestD = Infinity;
          for (const s of g.city.sidewalks) {
            const cx = clamp(n.x, s.x0, s.x1);
            const cz = clamp(n.z, s.z0, s.z1);
            const d = Math.hypot(cx - n.x, cz - n.z);
            if (d < bestD) { bestD = d; best = s; }
          }
          n.lane = best;
        }
        if (!n.target || Math.hypot(n.target.x - n.x, n.target.z - n.z) < 1) {
          if (n.waitT > 0) {
            n.waitT -= dt;
            n.moveSpeed = 0;
            break;
          }
          // Walkers NEVER change lanes: the straight line to a waypoint
          // in another lane would cut across a road.
          const s = n.lane;
          n.target = { x: rand(this.rng, s.x0 + 0.3, s.x1 - 0.3), z: rand(this.rng, s.z0 + 0.3, s.z1 - 0.3) };
          if (this.rng() < 0.25) n.waitT = rand(this.rng, 1, 3);
        }
        this._moveToward(n, n.target.x, n.target.z, speed, dt);
        break;
      }
      case 'chat': {
        n.moveSpeed = 0;
        if (n.partner && !n.partner.dead) n.heading = Math.atan2(n.partner.x - n.x, n.partner.z - n.z);
        n.parts.armR.rotation.x = Math.sin((g.time || 0) * 2 + n.walkPhase) * 0.5 - 0.4;
        break;
      }
      case 'sit': {
        n.moveSpeed = 0;
        n.parts.legL.rotation.x = -1.35;
        n.parts.legR.rotation.x = -1.35;
        n.pose = 'sit';
        break;
      }
      case 'wait': {
        n.moveSpeed = 0;
        n.heading += Math.sin((g.time || 0) * 0.4 + n.walkPhase) * dt * 0.4;
        break;
      }
      case 'fish': {
        n.moveSpeed = 0;
        n.heading = -Math.PI / 2;
        n.parts.armR.rotation.x = -0.9 + Math.sin((g.time || 0) * 0.9 + n.walkPhase) * 0.25;
        break;
      }
      case 'swim': {
        n.pose = 'swim';
        n.moveSpeed = 0.5;
        n.walkPhase += dt * 1.4;
        n.x += Math.sin(n.walkPhase * 0.5) * dt * 0.4;
        n.z += Math.cos(n.walkPhase * 0.33) * dt * 0.4;
        n.x = clamp(n.x, 4, 14);
        n.parts.armL.rotation.x = Math.sin(n.walkPhase) * 0.9 - 0.6;
        n.parts.armR.rotation.x = -Math.sin(n.walkPhase) * 0.9 - 0.6;
        n.group.rotation.x = -0.5;
        break;
      }
      case 'jetski': {
        n.pose = 'sit';
        n.moveSpeed = 1.2;
        n.walkPhase += dt * 0.5;
        n.x = clamp(n.home.x + Math.sin(n.walkPhase) * 3, 2, 13);
        n.z = n.home.z + Math.cos(n.walkPhase * 0.7) * 6;
        n.heading = Math.atan2(Math.cos(n.walkPhase) * 3, -Math.sin(n.walkPhase * 0.7) * 6);
        break;
      }
      case 'sunbathe': {
        n.moveSpeed = 0;
        n.pose = 'lie';
        n.group.rotation.x = -Math.PI / 2;
        n.group.position.set(n.x, 0.14, n.z);
        break;
      }
      case 'shop': {
        n.moveSpeed = 0;
        n.heading = Math.atan2(n.home.x - n.x, n.home.z - n.z);
        n.parts.head.rotation.y = Math.sin((g.time || 0) * 0.7 + n.walkPhase) * 0.5;
        break;
      }
      case 'work': {
        n.moveSpeed = 0;
        n.heading = Math.atan2(n.home.x - n.x, n.home.z - n.z);
        n.parts.armR.rotation.x = -1.2 + Math.sin((g.time || 0) * 3 + n.walkPhase) * 0.5;
        break;
      }
      case 'idle': {
        n.moveSpeed = 0;
        break;
      }
      case 'chase': {
        if (p && !p.dead) {
          const d = Math.hypot(p.x - n.x, p.z - n.z);
          if (d > 1.6) this._moveToward(n, p.x, p.z, 5.0, dt);
          else {
            n.moveSpeed = 0;
            n.heading = Math.atan2(p.x - n.x, p.z - n.z);
            if (n.punchCd <= 0) {
              n.punchCd = 0.8;
              n.punchAnimT = 0.3;
              p.health -= 8;
              p.lastHurtT = g.time || 0;
              if (p.health <= 0) { p.health = 0; p.dead = true; }
            }
          }
        }
        break;
      }
      case 'flee': {
        const from = n.fleeFrom || { x: p ? p.x : 0, z: p ? p.z : 0 };
        const dx = n.x - from.x;
        const dz = n.z - from.z;
        const d = Math.hypot(dx, dz) || 1;
        n.x += (dx / d) * 6 * dt;
        n.z += (dz / d) * 6 * dt;
        n.heading = Math.atan2(dx, dz);
        n.moveSpeed = 6;
        n.walkPhase += dt * 9;
        n.fleeT += dt;
        if (n.fleeT > 6) { n.state = 'walk'; n.fleeT = 0; n.target = null; }
        break;
      }
      case 'crew': {
        // Movement is owned by CrewManager; animate from its speed.
        n.pose = 'stand';
        break;
      }
      default: {
        n.moveSpeed = 0;
        break;
      }
    }
    // Building collision for on-foot NPCs (not swimmers / sunbathers).
    if (!['swim', 'jetski', 'sunbathe', 'fish'].includes(n.state) && g.city) {
      for (const col of g.city.colliders) {
        const dx = n.x - col.x;
        const dz = n.z - col.z;
        const d = Math.hypot(dx, dz);
        const min = col.r + 0.45;
        if (d < min && d > 0.001) {
          n.x = col.x + (dx / d) * min;
          n.z = col.z + (dz / d) * min;
        }
      }
      const c = g.city.clampPlayer(n.x, n.z);
      n.x = c.x; n.z = c.z;
    }
    // Walk-cycle animation from movement speed.
    if (['walk', 'hurry', 'chase', 'flee', 'crew'].includes(n.state)) {
      n.walkPhase += dt * n.moveSpeed * 1.7;
      const swing = n.moveSpeed > 0.1 ? Math.sin(n.walkPhase) * (n.moveSpeed > 4 ? 0.8 : 0.5) : 0;
      n.parts.legL.rotation.x = swing;
      n.parts.legR.rotation.x = -swing;
      n.parts.armL.rotation.x = -swing * 0.8;
      n.parts.armR.rotation.x = swing * 0.8;
      n.parts.torso.rotation.x = n.moveSpeed > 4 ? 0.12 : 0;
    }
    if (n.punchAnimT > 0) n.parts.armR.rotation.x = -1.6 * (n.punchAnimT / 0.3);
    if (n.state !== 'sunbathe' && n.state !== 'swim') n.group.rotation.x = 0;
    n.group.position.set(n.x, n.y, n.z);
    n.group.rotation.y = n.heading;
  }

  _moveToward(n, tx, tz, speed, dt) {
    const dx = tx - n.x;
    const dz = tz - n.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) { n.moveSpeed = 0; return; }
    const step = Math.min(d, speed * dt);
    n.x += (dx / d) * step;
    n.z += (dz / d) * step;
    n.heading = Math.atan2(dx, dz);
    n.moveSpeed = speed;
  }
}
