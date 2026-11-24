// La Vega 3D — characters (round 6 re-author).
//
// Player (Jax / Maya, switchable), the NPC population and the character
// manager. The player prefers the detailed GLB models and falls back to a
// procedural humanoid when a model has not loaded. The partner (the
// character you are NOT controlling) stands at the safehouse and NEVER
// follows you — there is no follow code anywhere in this file.
//
// Player fields: x, y, z, heading, speed, charId, money, health, armor,
// stamina, weapons, weapon, magAmmo, inCar / inBoat / inHeli (the vehicle
// object or null), inInterior, dead, deadT, phoneOpen, group, positions
// {jax, maya}, stats {drive, shoot}, customShirt, char, reloading,
// reloadT, punchT, shootT, _exitPos.
import * as THREE from 'three';
import { WEAPONS, PLAYER, PLACES } from './config.js';
import { clamp, damp, dist2d, rand, pick, angleLerp } from './rng.js';
import { groundHeight, isSea, isInRiver } from './city.js';
import { cloneCharacter, buildProceduralHumanoid, MODELS } from './loader.js';

const CHAR_SHIRTS = { jax: 0x2a6fd6, maya: 0xff2a9d };

// Build a character visual: the GLB model when it is loaded, otherwise a
// procedural humanoid in the same pose. Returns {group, mixer, actions,
// procedural, parts}.
function makeCharVisual(modelKey, shirt) {
  const gltf = MODELS.chars[modelKey];
  if (gltf) {
    const c = cloneCharacter(gltf, { shirt });
    return { group: c.group, mixer: c.mixer || null, actions: c.actions || {}, procedural: false, parts: c.parts || null };
  }
  const p = buildProceduralHumanoid({ shirt });
  return { group: p.group, mixer: null, actions: {}, procedural: true, parts: p.parts || null };
}

export class Player {
  constructor(game) {
    this.game = game;
    this.x = 30; this.y = 0; this.z = 60;
    this.heading = Math.PI;
    this.speed = 0;
    this.charId = 'jax';
    this.money = 0;
    this.health = PLAYER.health;
    this.armor = 0;
    this.stamina = 100;
    this.weapons = { fists: { ammo: Infinity, mag: Infinity } };
    this.weapon = 'fists';
    this.magAmmo = Infinity;
    this.inCar = null; this.inBoat = null; this.inHeli = null;
    this.inInterior = null;
    this.dead = false; this.deadT = 0;
    this.phoneOpen = false;
    this.group = new THREE.Group();
    this.positions = { jax: { x: 30, z: 60 }, maya: { x: 52, z: 182 } };
    this.stats = { drive: 0, shoot: 0 };
    this.customShirt = null;
    this.char = null;
    this.reloading = false; this.reloadT = 0;
    this.punchT = 0; this.shootT = 0;
    this._exitPos = null;
    this._walkPhase = 0;
    this._action = null;
  }

  async build() {
    this._rebuildChar();
    this.group.position.set(this.x, this.y, this.z);
    this.game.scene.add(this.group);
  }

  _rebuildChar() {
    if (this.char && this.char.group) {
      this.group.remove(this.char.group);
    }
    const shirt = this.customShirt || CHAR_SHIRTS[this.charId] || 0x2a6fd6;
    this.char = makeCharVisual(this.charId, shirt);
    this.char.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(this.char.group);
    this._action = null;
  }

  // Play a GLB clip by name (idle / walk / run / punch / ...). Procedural
  // characters have no clips and are animated by limb swing instead.
  _play(name) {
    if (!this.char || !this.char.actions || !this.char.actions[name]) return;
    if (this._action === name) return;
    const prev = this._action ? this.char.actions[this._action] : null;
    const next = this.char.actions[name];
    if (prev) prev.fadeOut(0.15);
    next.reset().fadeIn(0.15).play();
    this._action = name;
  }

  update(dt, input, camYaw) {
    const g = this.game;
    if (this.dead) {
      this.deadT -= dt;
      if (this.deadT <= 0 && g._respawn) g._respawn();
      return;
    }
    if (this.inCar || this.inBoat || this.inHeli) return; // driving: the vehicle moves
    if (this.char && this.char.mixer) this.char.mixer.update(dt);
    this.punchT = Math.max(0, this.punchT - dt);
    this.shootT = Math.max(0, this.shootT - dt);
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloading = false;
        const w = WEAPONS[this.weapon];
        if (w && w.mag && this.weapons[this.weapon]) {
          this.weapons[this.weapon].ammo = Math.max(0, this.weapons[this.weapon].ammo - w.mag);
          this.magAmmo = w.mag;
        }
        g.hud.updateWeapon();
      }
    }
    // Move relative to the camera: W walks away from the camera.
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let mx = fx * ((input.fwd ? 1 : 0) - (input.back ? 1 : 0)) + rx * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
    let mz = fz * ((input.fwd ? 1 : 0) - (input.back ? 1 : 0)) + rz * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
    const len = Math.hypot(mx, mz);
    const swimming = isSea(this.x, this.z) || isInRiver(this.x, this.z);
    let targetSpeed = 0;
    if (len > 0.01) {
      mx /= len; mz /= len;
      const wantRun = input.run && this.stamina > 1 && !swimming;
      targetSpeed = wantRun ? PLAYER.run : PLAYER.walk;
      if (swimming) targetSpeed = PLAYER.walk * 0.45;
      if (wantRun) this.stamina = Math.max(0, this.stamina - 12 * dt);
      const targetHeading = Math.atan2(mx, mz);
      let dh = targetHeading - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * Math.min(1, 10 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + 9 * dt);
    }
    this.speed = damp(this.speed, targetSpeed, 8, dt);
    if (this.speed > 0.2) {
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
    }
    // Stay in the world and out of buildings.
    this.x = clamp(this.x, 2, 398);
    this.z = clamp(this.z, 2, 398);
    if (this.inInterior) {
      const room = g.city.interiors[this.inInterior];
      if (room) {
        this.x = clamp(this.x, room.x - room.w / 2 + 1, room.x + room.w / 2 - 1);
        this.z = clamp(this.z, room.z - room.d / 2 + 1, room.z + room.d / 2 - 1);
      }
    } else {
      this._collideBuildings();
    }
    this.y = groundHeight(this.x, this.z);
    // Animate: run / walk / idle (GLB clips) or limb swing (procedural).
    if (this.char) {
      if (this.char.procedural && this.char.parts) {
        this._walkPhase += this.speed * dt * 2.2;
        const s = Math.sin(this._walkPhase) * clamp(this.speed / PLAYER.walk, 0, 1) * 0.55;
        const parts = this.char.parts;
        if (parts.legs) {
          if (parts.legs.L) parts.legs.L.hip.rotation.x = s;
          if (parts.legs.R) parts.legs.R.hip.rotation.x = -s;
        }
        if (parts.arms) {
          if (parts.arms.L) parts.arms.L.shoulder.rotation.x = -s * 0.7;
          if (parts.arms.R) parts.arms.R.shoulder.rotation.x = s * 0.7;
        }
      } else if (this.punchT > 0.2) {
        this._play('punch');
      } else if (this.speed > 5.5) {
        this._play('run');
      } else if (this.speed > 0.4) {
        this._play('walk');
      } else {
        this._play('idle');
      }
    }
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
  }

  _collideBuildings() {
    const g = this.game;
    if (!g.city || !g.city.colliders) return;
    const r = PLAYER.radius + 0.15;
    for (const c of g.city.colliders) {
      if (this.x > c.x0 - r && this.x < c.x1 + r && this.z > c.z0 - r && this.z < c.z1 + r) {
        const pushL = this.x - (c.x0 - r), pushR = (c.x1 + r) - this.x;
        const pushU = this.z - (c.z0 - r), pushD = (c.z1 + r) - this.z;
        const m = Math.min(pushL, pushR, pushU, pushD);
        if (m === pushL) this.x = c.x0 - r;
        else if (m === pushR) this.x = c.x1 + r;
        else if (m === pushU) this.z = c.z0 - r;
        else this.z = c.z1 + r;
      }
    }
  }

  punch() {
    if (this.punchT > 0 || this.dead || this.inCar) return;
    this.punchT = 0.45;
    this._play('punch');
    if (this.game.audio) this.game.audio.punch();
    const g = this.game;
    for (const npc of g.characters.npcs) {
      if (npc.dead) continue;
      const d = dist2d(this.x, this.z, npc.x, npc.z);
      if (d > PLAYER.punchRange + 0.4) continue;
      const ang = Math.abs(((Math.atan2(npc.x - this.x, npc.z - this.z) - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (ang > 1.1) continue;
      npc.damage(PLAYER.punchDamage, this.x, this.z, 'punch');
    }
  }

  shoot() {
    const g = this.game;
    if (this.dead || this.inCar || this.inBoat || this.inHeli) return;
    if (this.weapon === 'fists') { this.punch(); return; }
    if (this.reloading || this.shootT > 0) return;
    const w = WEAPONS[this.weapon];
    if (!w) return;
    if (this.magAmmo <= 0) { this.reload(); return; }
    this.magAmmo -= 1;
    this.shootT = w.interval;
    this.stats.shoot += 1;
    if (g.audio) g.audio.shoot();
    g.hud.updateWeapon();
    // Hit the nearest NPC in front, inside the weapon's range and cone.
    let best = null, bestD = w.range;
    for (const npc of g.characters.npcs) {
      if (npc.dead) continue;
      const d = dist2d(this.x, this.z, npc.x, npc.z);
      if (d > bestD) continue;
      const ang = Math.abs(((Math.atan2(npc.x - this.x, npc.z - this.z) - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (ang > 0.7) continue;
      best = npc; bestD = d;
    }
    if (best) best.damage(w.damage, this.x, this.z, 'shot');
    g.characters.onGunshot(this.x, this.z);
  }

  reload() {
    const w = WEAPONS[this.weapon];
    if (!w || !w.mag) return;
    if (this.reloading || this.magAmmo >= w.mag) return;
    const reserve = this.weapons[this.weapon] ? this.weapons[this.weapon].ammo : 0;
    if (reserve <= 0) {
      if (this.game.audio) this.game.audio.dryFire();
      this.game.hud.notify('Out of ammo — buy more at Vega Arms.');
      return;
    }
    this.reloading = true;
    this.reloadT = w.reload;
    if (this.game.audio) this.game.audio.reload();
  }

  setWeapon(id) {
    const w = WEAPONS[id];
    if (!w || !this.weapons[id]) return;
    this.weapon = id;
    this.magAmmo = w.mag || Infinity;
    this.game.hud.updateWeapon();
  }

  giveWeapon(id, amount) {
    const w = WEAPONS[id];
    if (!w) return;
    // A new weapon starts with five magazines in reserve, plus the amount
    // given (mission rewards and shop packs add on top).
    if (this.weapons[id]) {
      this.weapons[id].ammo += amount || 0;
    } else {
      this.weapons[id] = { ammo: (w.mag || 0) * 5 + (amount || 0) };
    }
    this.game.hud.updateWeapon();
  }

  switchCharacter() {
    const g = this.game;
    if (this.inCar || this.inBoat || this.inHeli || this.inInterior) return;
    this.positions[this.charId] = { x: this.x, z: this.z };
    this.charId = this.charId === 'jax' ? 'maya' : 'jax';
    const pos = this.positions[this.charId] || { x: 30, z: 60 };
    this.x = pos.x; this.z = pos.z;
    this.y = groundHeight(this.x, this.z);
    this._rebuildChar();
    this.group.position.set(this.x, this.y, this.z);
    g.characters.swapPartner();
    g.hud.updateCharacter();
    g.hud.notify(this.charId === 'jax' ? 'Now playing as Jax Vega.' : 'Now playing as Maya Vega.');
  }

  heal(n) {
    this.health = Math.min(PLAYER.health, this.health + n);
  }

  takeDamage(n) {
    if (this.dead) return;
    let rest = n;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, rest);
      this.armor -= absorbed;
      rest -= absorbed;
    }
    this.health -= rest;
    if (this.game.hud) this.game.hud.flashDamage();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.deadT = 2.0;
      if (this.game.onPlayerDown) this.game.onPlayerDown();
    }
  }
}

// ---------------------------------------------------------------------------
// NPC: one pedestrian / cashier / cop / gang member / partner.
// States: walk, flee, chase, sit, chat, dance, fish, dead.
// ---------------------------------------------------------------------------
export class NPC {
  constructor(game, opts = {}) {
    this.game = game;
    this.kind = opts.kind || 'ped';
    this.x = opts.x || 100;
    this.z = opts.z || 100;
    this.y = groundHeight(this.x, this.z);
    this.modelKey = opts.modelKey || (game.rng() < 0.5 ? 'npcMale' : 'npcFemale');
    this.shirt = opts.shirt !== undefined ? opts.shirt : pick(game.rng, [0xd94f3d, 0x2a6fd6, 0x22c3aa, 0xffd34d, 0xe8e8e8, 0x8a5a2a]);
    this.home = opts.home || { x: this.x, z: this.z };
    this.health = 100;
    this.dead = false;
    this.state = 'walk';
    this.group = null;
    this.char = null;
    this.fleeFrom = null;
    this.speed = 0;
    this.loot = 0;
    this.heading = game.rng() * Math.PI * 2;
    this._target = null;
    this._fleeT = 0;
    this._attackT = 0;
    this._walkPhase = game.rng() * 6;
    this._action = null;
  }

  build() {
    if (this.group) return;
    this.char = makeCharVisual(this.modelKey, this.shirt);
    this.group = this.char.group;
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    this.game.scene.add(this.group);
  }

  _play(name) {
    if (!this.char || !this.char.actions || !this.char.actions[name]) return;
    if (this._action === name) return;
    const prev = this._action ? this.char.actions[this._action] : null;
    const next = this.char.actions[name];
    if (prev) prev.fadeOut(0.15);
    next.reset().fadeIn(0.15).play();
    this._action = name;
  }

  _step(dt, tx, tz, speed) {
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) return true;
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += dh * Math.min(1, 8 * dt);
    this.speed = speed;
    this.x += Math.sin(this.heading) * speed * dt;
    this.z += Math.cos(this.heading) * speed * dt;
    this.x = clamp(this.x, 32, 398);
    this.z = clamp(this.z, 4, 398);
    this.y = groundHeight(this.x, this.z);
    return false;
  }

  _animate(dt) {
    if (!this.char) return;
    if (this.char.mixer) this.char.mixer.update(dt);
    if (this.char.procedural && this.char.parts) {
      this._walkPhase += this.speed * dt * 2.4;
      const s = Math.sin(this._walkPhase) * clamp(this.speed / 2, 0, 1) * 0.5;
      const parts = this.char.parts;
      if (parts.legs) {
        if (parts.legs.L) parts.legs.L.hip.rotation.x = s;
        if (parts.legs.R) parts.legs.R.hip.rotation.x = -s;
      }
      if (parts.arms) {
        if (parts.arms.L) parts.arms.L.shoulder.rotation.x = -s * 0.7;
        if (parts.arms.R) parts.arms.R.shoulder.rotation.x = s * 0.7;
      }
    } else if (this.state === 'dead') {
      this._play('death');
    } else if (this.state === 'flee' || this.state === 'chase') {
      this._play('run');
    } else if (this.speed > 0.4) {
      this._play('walk');
    } else if (this.state === 'sit') {
      this._play('sit');
    } else if (this.state === 'dance') {
      this._play('dance');
    } else {
      this._play('idle');
    }
    if (this.group) {
      this.group.position.set(this.x, this.y, this.z);
      this.group.rotation.y = this.heading;
    }
  }

  update(dt, player) {
    if (this.dead) { this._animate(dt); return; }
    this._attackT = Math.max(0, this._attackT - dt);
    const g = this.game;
    switch (this.state) {
      case 'flee': {
        this._fleeT -= dt;
        if (!this.fleeFrom || this._fleeT <= 0) { this.state = 'walk'; this._target = null; break; }
        const dx = this.x - this.fleeFrom.x, dz = this.z - this.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        this._step(dt, this.x + (dx / d) * 10, this.z + (dz / d) * 10, 5.0);
        break;
      }
      case 'chase': {
        if (!player || player.dead) { this.state = 'walk'; break; }
        const d = dist2d(this.x, this.z, player.x, player.z);
        if (d < 1.8) {
          this.speed = 0;
          if (this._attackT <= 0) {
            this._attackT = 1.0;
            player.takeDamage(6);
            if (g.audio) g.audio.punch();
          }
        } else {
          this._step(dt, player.x, player.z, 4.6);
        }
        break;
      }
      case 'sit':
      case 'chat':
      case 'fish':
        this.speed = 0;
        break;
      case 'dance':
        this.speed = 0;
        this.heading += dt * 1.2;
        this.y = groundHeight(this.x, this.z) + Math.abs(Math.sin(performance.now() * 0.004)) * 0.25;
        break;
      case 'walk':
      default: {
        if (!this._target || dist2d(this.x, this.z, this._target.x, this._target.z) < 2) {
          const nx = clamp(this.home.x + rand(g.rng, -40, 40), 34, 256);
          const nz = clamp(this.home.z + rand(g.rng, -40, 40), 8, 256);
          this._target = { x: nx, z: nz };
        }
        this._step(dt, this._target.x, this._target.z, 1.4 + g.rng() * 0.4);
        break;
      }
    }
    this._animate(dt);
  }

  damage(amount, fromX, fromZ, cause) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.die();
      return;
    }
    // A hurt NPC runs away from whoever hit them.
    if (this.kind !== 'cop' && this.kind !== 'gang') {
      this.state = 'flee';
      this.fleeFrom = { x: fromX, z: fromZ };
      this._fleeT = 4;
    } else {
      this.state = 'chase';
      this.fleeFrom = { x: fromX, z: fromZ };
    }
    void cause;
  }

  die() {
    this.dead = true;
    this.state = 'dead';
    this.speed = 0;
    this.loot = 5 + Math.floor(this.game.rng() * 46);
    if (this.group) {
      this.group.rotation.x = -Math.PI / 2;
      this.group.position.y = groundHeight(this.x, this.z) + 0.3;
    }
  }
}

// ---------------------------------------------------------------------------
// CharacterManager: spawns and tends the NPC population. La Rosa waits at
// the club, cashiers mind the shops, the partner waits at the safehouse,
// and pedestrians fill the streets. The partner NEVER follows the player.
// ---------------------------------------------------------------------------
export class CharacterManager {
  constructor(game) {
    this.game = game;
    this.npcs = [];
    this.cashiers = [];
    this.laRosa = null;
    this.partner = null;
    this._shotPostT = 0;
  }

  async build() {
    const g = this.game;
    // La Rosa at the club door — the first person the player must meet.
    const club = PLACES.club;
    this.laRosa = new NPC(g, { kind: 'larosa', x: club.x, z: club.y - 7, modelKey: 'laRosa', shirt: 0xff2a9d, home: { x: club.x, z: club.y - 7 } });
    this.laRosa.build();
    this.laRosa.state = 'chat';
    this.npcs.push(this.laRosa);
    // Cashiers at the shop doors (robbery targets).
    for (const key of ['minimarket', 'gunShop', 'clotheshop', 'restaurant', 'mall', 'bank']) {
      const p = PLACES[key];
      if (!p) continue;
      const c = new NPC(g, { kind: 'cashier', x: p.x + 2, z: p.y - 7, modelKey: g.rng() < 0.5 ? 'npcMale' : 'npcFemale', shirt: 0x2a6fd6, home: { x: p.x, z: p.y - 7 } });
      c.build();
      c.state = 'chat';
      this.npcs.push(c);
      this.cashiers.push(c);
    }
    // The partner waits at the safehouse (never follows).
    this.swapPartner();
    // Sitters in the park, chatters downtown, dancers at the club, fishers
    // on the pier — the city feels lived-in, not just walked-through.
    for (const [sx, sz] of [[96, 72], [112, 74], [98, 86], [108, 72]]) {
      const s = new NPC(g, { kind: 'ped', x: sx, z: sz, home: { x: sx, z: sz } });
      s.build(); s.state = 'sit';
      this.npcs.push(s);
    }
    for (const [cx, cz] of [[130, 100], [132, 102], [180, 120], [182, 122]]) {
      const c = new NPC(g, { kind: 'ped', x: cx, z: cz, home: { x: cx, z: cz } });
      c.build(); c.state = 'chat';
      this.npcs.push(c);
    }
    for (const [dx, dz] of [[150, 98], [160, 98], [155, 96]]) {
      const d = new NPC(g, { kind: 'ped', x: dx, z: dz, home: { x: dx, z: dz } });
      d.build(); d.state = 'dance';
      this.npcs.push(d);
    }
    for (const [fx, fz] of [[10, 128], [12, 138]]) {
      const f = new NPC(g, { kind: 'ped', x: fx, z: fz, home: { x: fx, z: fz } });
      f.build(); f.state = 'fish';
      f.heading = -Math.PI / 2;
      this.npcs.push(f);
    }
    // Pedestrians fill the streets.
    for (let i = 0; i < 40; i++) this._spawnPed();
  }

  _spawnPed(nearX, nearZ) {
    const g = this.game;
    let x, z;
    if (nearX !== undefined) {
      x = clamp(nearX + rand(g.rng, -60, 60), 34, 256);
      z = clamp(nearZ + rand(g.rng, -60, 60), 8, 256);
    } else {
      x = rand(g.rng, 34, 256);
      z = rand(g.rng, 8, 256);
    }
    const npc = new NPC(g, { kind: 'ped', x, z, home: { x, z } });
    npc.build();
    this.npcs.push(npc);
    return npc;
  }

  update(dt, player) {
    const g = this.game;
    this._shotPostT = Math.max(0, this._shotPostT - dt);
    // Update every NPC; drop the long-dead and the far-away.
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const npc = this.npcs[i];
      if (npc.dead) {
        npc._deadT = (npc._deadT || 0) + dt;
        if (npc._deadT > 45) { this.recycleNPC(npc); continue; }
      }
      npc.update(dt, player);
      // Pedestrians far from the player are moved back near the action
      // (they are off-screen, so the jump is invisible).
      if (npc.kind === 'ped' && !npc.dead && player) {
        const d = dist2d(npc.x, npc.z, player.x, player.z);
        if (d > 220) {
          npc.x = clamp(player.x + rand(g.rng, -60, 60), 34, 256);
          npc.z = clamp(player.z + rand(g.rng, -60, 60), 8, 256);
          npc.home = { x: npc.x, z: npc.z };
          npc._target = null;
        }
      }
    }
    // Keep the streets populated.
    let peds = 0;
    for (const n of this.npcs) if (n.kind === 'ped' && !n.dead) peds++;
    if (peds < 30 && player) {
      this._spawnPed(player.x, player.z);
    }
  }

  npcFlee(npc, x, z) {
    if (!npc || npc.dead) return;
    npc.state = 'flee';
    npc.fleeFrom = { x, z };
    npc._fleeT = 4;
  }

  onGunshot(x, z) {
    const g = this.game;
    for (const npc of this.npcs) {
      if (npc.dead) continue;
      if (dist2d(npc.x, npc.z, x, z) < 25) this.npcFlee(npc, x, z);
    }
    if (this._shotPostT <= 0 && g.hud) {
      this._shotPostT = 20;
      g.hud.socialPost(
        pick(g.rng, ['@beachbum', '@neonrider', '@vegalocal', '@clubkid']),
        `Someone just opened fire near ${g.hud.districtName()}! 😱 #LaVega`,
      );
    }
  }

  // The partner is whoever the player is NOT controlling. They wait at the
  // safehouse and never follow — switching characters swaps who is "you"
  // and who is waiting, it never makes anyone trail behind.
  swapPartner() {
    const g = this.game;
    if (this.partner) {
      this.recycleNPC(this.partner);
      this.partner = null;
    }
    const otherId = g.player.charId === 'jax' ? 'maya' : 'jax';
    const safe = PLACES.safehouse || { x: 52, y: 182 };
    const p = new NPC(g, { kind: 'partner', x: safe.x, z: safe.y, modelKey: otherId, shirt: CHAR_SHIRTS[otherId], home: { x: safe.x, z: safe.y } });
    p.build();
    p.state = 'chat';
    this.partner = p;
    this.npcs.push(p);
  }

  recycleNPC(npc) {
    if (!npc) return;
    const i = this.npcs.indexOf(npc);
    if (i >= 0) this.npcs.splice(i, 1);
    const ci = this.cashiers.indexOf(npc);
    if (ci >= 0) this.cashiers.splice(ci, 1);
    if (this.partner === npc) this.partner = null;
    if (this.laRosa === npc) this.laRosa = null;
    if (npc.group && npc.group.parent) npc.group.parent.remove(npc.group);
  }
}
