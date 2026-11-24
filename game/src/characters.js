// La Vega 3D — characters (round 10 re-author).
//
// Procedural people, built from the design document. No GLB characters
// are used in this round: the male/female GLB files render as naked
// T-pose mannequins on ilham's phone, so every person is a procedural
// humanoid built from primitives at an exact height — Jax 1.81 m,
// Maya 1.70 m, NPC men 1.78 m, women 1.65 m, cops 1.82 m. Limbs pivot
// at their joints (geometry translated so the mesh origin is the
// joint), so walk / punch / aim animations swing cleanly.
//
// The NPC class is the contract missions.js and police.js import:
//   new NPC(game, { kind, x, z, modelKey, shirt })
//   npc.build()          — idempotent; the constructor also builds
//   npc.state = 'chase'  — 'idle' | 'walk' | 'chase' | 'flee' | 'panic'
//                          | 'fish' | 'sunbathe' | 'swim' | 'jetski' | 'dead'
//   npc.fleeFrom = {x,z} — point to run away from (state 'flee')
//   npc.dead             — true once health reaches 0
//   npc.damage(amount)   — hurts the NPC; kills it at 0 health
// The characters manager (g.characters) keeps npcs[] and recycleNPC().

import * as THREE from 'three';
import { ROADS, WORLD } from './config.js';
import { groundHeight } from './city.js';
import { mulberry32, rand, randInt, pick, clamp, angleLerp, dist2d } from './rng.js';

const ROAD_W = WORLD.roadWidth; // 10
const SIDE_W = WORLD.sidewalk; // 2.5
const SEA_X = WORLD.seaX; // 15

// ---- procedural humanoid -----------------------------------------------
const SKINS = [0xd9a066, 0xc98a5a, 0x8a5a3a, 0xe8b88a, 0x6a4a2a];
const HAIRS = [0x1a1a1a, 0x3a2a1a, 0x8a6a3a, 0xcccccc, 0x6a3a1a];

export function buildHumanoid(opts = {}) {
  const H = opts.height || 1.78;
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin !== undefined ? opts.skin : pick(mulberry32(1), SKINS) });
  const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt !== undefined ? opts.shirt : 0x2a6fd6 });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants !== undefined ? opts.pants : 0x2a2d33 });
  const hairM = new THREE.MeshLambertMaterial({ color: opts.hair !== undefined ? opts.hair : 0x1a1a1a });
  const shoeM = new THREE.MeshLambertMaterial({ color: 0x14161a });

  const legLen = H * 0.48;
  const torsoLen = H * 0.3;
  const armLen = H * 0.42;
  const headR = H * 0.062;
  const hipY = legLen;
  const shoulderY = hipY + torsoLen * 0.92;

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  function limbBox(w, len, d, mat) {
    const geo = new THREE.BoxGeometry(w, len, d);
    geo.translate(0, -len / 2, 0); // origin at the joint
    return new THREE.Mesh(geo, mat);
  }

  const torso = new THREE.Mesh(new THREE.BoxGeometry(H * 0.21, torsoLen, H * 0.12), shirt);
  torso.position.y = hipY + torsoLen / 2;
  body.add(torso);
  // shirt stripe (a little detail so two NPCs do not look identical)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(H * 0.215, torsoLen * 0.22, H * 0.125), new THREE.MeshLambertMaterial({ color: 0xf2f5f7 }));
  stripe.position.y = hipY + torsoLen * 0.72;
  body.add(stripe);

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 12, 10), skin);
  head.position.y = shoulderY + headR * 1.15;
  body.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.05, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
  hair.position.y = head.position.y + headR * 0.12;
  body.add(hair);
  if (opts.longHair) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.6, headR * 2.2, headR * 0.7), hairM);
    back.position.set(0, head.position.y - headR * 0.6, -headR * 0.9);
    body.add(back);
  }

  const armL = limbBox(H * 0.055, armLen, H * 0.06, shirt);
  armL.position.set(-H * 0.135, shoulderY, 0);
  body.add(armL);
  const armR = limbBox(H * 0.055, armLen, H * 0.06, shirt);
  armR.position.set(H * 0.135, shoulderY, 0);
  body.add(armR);
  const handL = new THREE.Mesh(new THREE.BoxGeometry(H * 0.05, H * 0.05, H * 0.05), skin);
  handL.position.y = -armLen;
  armL.add(handL);
  const handR = new THREE.Mesh(new THREE.BoxGeometry(H * 0.05, H * 0.05, H * 0.05), skin);
  handR.position.y = -armLen;
  armR.add(handR);

  const legL = limbBox(H * 0.075, legLen, H * 0.085, pants);
  legL.position.set(-H * 0.055, hipY, 0);
  body.add(legL);
  const legR = limbBox(H * 0.075, legLen, H * 0.085, pants);
  legR.position.set(H * 0.055, hipY, 0);
  body.add(legR);
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(H * 0.08, H * 0.04, H * 0.14), shoeM);
  shoeL.position.set(0, -legLen, H * 0.02);
  legL.add(shoeL);
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(H * 0.08, H * 0.04, H * 0.14), shoeM);
  shoeR.position.set(0, -legLen, H * 0.02);
  legR.add(shoeR);

  // a small gun, held in the right hand when aiming / shooting
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.28), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0, -armLen - 0.02, 0.1);
  gun.visible = false;
  armR.add(gun);
  // a fishing rod, held when fishing
  const rod = new THREE.Group();
  const rodShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 2.2, 6), new THREE.MeshLambertMaterial({ color: 0x8a5a3a }));
  rodShaft.rotation.x = Math.PI / 2.4;
  rodShaft.position.set(0, 0.4, 0.7);
  rod.add(rodShaft);
  rod.visible = false;
  body.add(rod);

  const char = {
    group, body, parts: { head, torso, armL, armR, legL, legR, handL, handR, gun, rod },
    height: H, bob: 0, pose: 'idle',
    setWalk(phase, amount) {
      const s = Math.sin(phase) * 0.6 * amount;
      legL.rotation.x = s;
      legR.rotation.x = -s;
      armL.rotation.x = -s * 0.8;
      armR.rotation.x = s * 0.8;
      this.bob = Math.abs(Math.cos(phase)) * 0.035 * amount;
    },
    setPose(pose) {
      this.pose = pose;
      if (pose === 'idle') {
        armL.rotation.x = 0; armR.rotation.x = 0;
        legL.rotation.x = 0; legR.rotation.x = 0;
        body.rotation.x = 0; body.position.y = 0;
        gun.visible = false; rod.visible = false;
      } else if (pose === 'aim') {
        armL.rotation.x = -Math.PI / 2 + 0.15; armR.rotation.x = -Math.PI / 2;
        legL.rotation.x = 0.15; legR.rotation.x = -0.15;
        body.rotation.x = 0; body.position.y = 0;
        gun.visible = true; rod.visible = false;
      } else if (pose === 'punch') {
        armR.rotation.x = -Math.PI / 2; armL.rotation.x = 0.4;
        gun.visible = false; rod.visible = false;
      } else if (pose === 'dead') {
        armL.rotation.x = 0.4; armR.rotation.x = -0.4;
        legL.rotation.x = 0.1; legR.rotation.x = -0.1;
        body.rotation.x = -Math.PI / 2 * 0.92;
        body.position.y = 0.12;
        gun.visible = false; rod.visible = false;
      } else if (pose === 'fish') {
        armR.rotation.x = -0.9; armL.rotation.x = 0.2;
        legL.rotation.x = 0; legR.rotation.x = 0;
        body.rotation.x = 0.08; body.position.y = 0;
        gun.visible = false; rod.visible = true;
      } else if (pose === 'lie') {
        armL.rotation.x = 0.3; armR.rotation.x = -0.3;
        legL.rotation.x = 0; legR.rotation.x = 0;
        body.rotation.x = -Math.PI / 2 * 0.95;
        body.position.y = 0.1;
        gun.visible = false; rod.visible = false;
      } else if (pose === 'swim') {
        armL.rotation.x = -1.2; armR.rotation.x = -1.2;
        legL.rotation.x = 0.3; legR.rotation.x = -0.3;
        body.rotation.x = -Math.PI / 2 * 0.75;
        body.position.y = 0.15;
        gun.visible = false; rod.visible = false;
      }
    },
  };
  return char;
}

// ---- NPC ------------------------------------------------------------------
const NPC_PRESETS = {
  npcMale: { height: 1.78, longHair: false },
  npcFemale: { height: 1.65, longHair: true },
  cop: { height: 1.82, longHair: false, shirt: 0x20242c, pants: 0x20242c },
  vulture: { height: 1.8, longHair: false, shirt: 0x3a1a1a, pants: 0x1a1a1a },
  fisher: { height: 1.76, longHair: false, shirt: 0x2a6f4a },
  larosa: { height: 1.84, longHair: true, shirt: 0x8a1a1a, pants: 0x1a1a1a },
};

export class NPC {
  constructor(game, opts = {}) {
    this.game = game;
    this.kind = opts.kind || 'ped';
    this.modelKey = opts.modelKey || 'npcMale';
    this.x = opts.x !== undefined ? opts.x : 130;
    this.z = opts.z !== undefined ? opts.z : 130;
    this.heading = opts.heading !== undefined ? opts.heading : 0;
    this.rng = mulberry32((Math.floor(this.x * 13 + this.z * 7) % 100000) + 11);
    this.health = 100;
    this.dead = false;
    this.state = opts.state || 'idle';
    this.fleeFrom = opts.fleeFrom || null;
    this.speed = 0;
    this.walkPhase = rand(this.rng, 0, 6.28);
    this._built = false;
    this._deadT = 0;
    this._idleT = rand(this.rng, 0, 4);
    this._target = null; // walk target {x, z}
    this._attackT = 0;
    const preset = NPC_PRESETS[this.modelKey] || NPC_PRESETS.npcMale;
    const shirt = opts.shirt !== undefined ? opts.shirt : (preset.shirt !== undefined ? preset.shirt : pick(this.rng, [0x2a6fd6, 0xd92038, 0xffd34d, 0x2a6f4a, 0xe8e8e8, 0x8a5a3a]));
    this.char = buildHumanoid({
      height: preset.height,
      shirt,
      pants: preset.pants,
      longHair: preset.longHair,
      skin: pick(this.rng, SKINS),
      hair: pick(this.rng, HAIRS),
    });
    this.group = this.char.group;
    this.build();
  }

  build() {
    if (this._built) return;
    this._built = true;
    this.group.position.set(this.x, groundHeight(this.x, this.z), this.z);
    this.group.rotation.y = this.heading;
    if (this.game.scene) this.game.scene.add(this.group);
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) this.die();
    else if (this.state !== 'chase') { this.state = 'panic'; this.fleeFrom = this.game.player ? { x: this.game.player.x, z: this.game.player.z } : null; }
  }

  die() {
    this.dead = true;
    this.state = 'dead';
    this.speed = 0;
    this.char.setPose('dead');
    // drop a little cash the player can pick up (main loop collects it)
    if (this.game && this.game.onNPCDeath) this.game.onNPCDeath(this);
  }

  panic() {
    if (this.dead) return;
    this.state = 'panic';
    this.fleeFrom = this.game.player ? { x: this.game.player.x, z: this.game.player.z } : null;
  }

  update(dt) {
    if (this.dead) { this._deadT += dt; return; }
    const p = this.game.player;
    const speedByState = { walk: 1.4, chase: 5.2, flee: 6.0, panic: 5.5, idle: 0, fish: 0, sunbathe: 0, swim: 1.2, jetski: 8 };
    if (this.state === 'chase' && p) {
      const d = dist2d(this.x, this.z, p.x, p.z);
      if (d > 1.8) {
        const target = Math.atan2(p.x - this.x, p.z - this.z);
        this.heading = angleLerp(this.heading, target, Math.min(1, dt * 5));
        this.speed = speedByState.chase;
        this._move(dt);
        this._attackT -= dt;
      } else {
        this.speed = 0;
        this._attackT -= dt;
        if (this._attackT <= 0) {
          this._attackT = 0.9;
          this.char.setPose('punch');
          setTimeout(() => { if (!this.dead) this.char.setPose('idle'); }, 220);
          if (this.game.onNPCAttack) this.game.onNPCAttack(this, 10);
        }
      }
      this._animate(dt, this.speed > 0.1);
    } else if ((this.state === 'flee' || this.state === 'panic') && this.fleeFrom) {
      const target = Math.atan2(this.x - this.fleeFrom.x, this.z - this.fleeFrom.z);
      this.heading = angleLerp(this.heading, target, Math.min(1, dt * 5));
      this.speed = speedByState[this.state];
      this._move(dt);
      this._animate(dt, true);
      if (dist2d(this.x, this.z, this.fleeFrom.x, this.fleeFrom.z) > 45) {
        this.state = 'idle';
        this.fleeFrom = null;
      }
    } else if (this.state === 'walk') {
      if (!this._target || dist2d(this.x, this.z, this._target.x, this._target.z) < 2) {
        this._target = this._pickWalkTarget();
      }
      const target = Math.atan2(this._target.x - this.x, this._target.z - this.z);
      this.heading = angleLerp(this.heading, target, Math.min(1, dt * 3));
      this.speed = speedByState.walk;
      this._move(dt);
      this._animate(dt, true);
      this._idleT -= dt;
      if (this._idleT <= 0) { this.state = 'idle'; this._idleT = rand(this.rng, 3, 9); }
    } else if (this.state === 'fish') {
      this.char.setPose('fish');
      this.speed = 0;
      // a slow bob of the rod
      this.char.parts.armR.rotation.x = -0.9 + Math.sin(performance.now() / 900 + this.x) * 0.12;
    } else if (this.state === 'sunbathe') {
      this.char.setPose('lie');
      this.speed = 0;
    } else if (this.state === 'swim') {
      this.char.setPose('swim');
      this.speed = speedByState.swim;
      this.heading += dt * 0.25;
      this._move(dt);
      if (this.x > 12) { this.heading = -Math.PI / 2; } // too close to shore: back west
      if (this.x < -20) { this.heading = Math.PI / 2; } // too far out: back east
    } else if (this.state === 'jetski') {
      // rider circles the bay on a jet ski (the ski is a child mesh)
      this.heading += dt * 0.35;
      this.speed = speedByState.jetski;
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
      if (this.x > 8) this.heading = -Math.PI / 2; // near shore: back west
      if (this.x < -40) this.heading = Math.PI / 2; // too far out: back east
      if (this.z > 260) this.heading = Math.PI; // too far south: back north
      if (this.z < 0) this.heading = 0; // too far north: back south
      this.group.position.set(this.x, 0.05, this.z);
      this.group.rotation.y = this.heading;
    } else {
      // idle: stand, look around, sometimes start walking
      this.speed = 0;
      this.char.setPose('idle');
      this._idleT -= dt;
      if (this._idleT <= 0) {
        this.state = 'walk';
        this._idleT = rand(this.rng, 8, 20);
      }
    }
    if (this.state !== 'jetski' && this.state !== 'swim') {
      this.group.position.set(this.x, groundHeight(this.x, this.z) + this.char.bob, this.z);
      this.group.rotation.y = this.heading;
    }
    if (this.state === 'swim') {
      this.group.position.set(this.x, 0.05, this.z);
      this.group.rotation.y = this.heading;
    }
  }

  _animate(dt, moving) {
    if (moving) {
      this.walkPhase += dt * 7;
      this.char.setWalk(this.walkPhase, 1);
    } else {
      this.char.setWalk(this.walkPhase, 0);
    }
  }

  _move(dt) {
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    // stay out of buildings (circle vs box) and out of the deep sea
    const city = this.game.city;
    if (city) {
      for (const b of city.colliders.boxes) {
        if (nx > b.x0 - 0.5 && nx < b.x1 + 0.5 && nz > b.z0 - 0.5 && nz < b.z1 + 0.5) return;
      }
    }
    if (nx < SEA_X + 1 && this.state !== 'swim' && this.state !== 'jetski') return; // not into the sea
    if (nx > 460 || nx < -60 || nz > 460 || nz < -60) return;
    this.x = nx; this.z = nz;
  }

  _pickWalkTarget() {
    // a point on a sidewalk: beside a road, or in the park / on the beach
    const roll = this.rng();
    if (roll < 0.7) {
      const road = pick(this.rng, ROADS);
      const side = this.rng() < 0.5 ? 1 : -1;
      const along = rand(this.rng, 30, 250);
      if (this.rng() < 0.5) return { x: road + side * (ROAD_W / 2 + SIDE_W / 2), z: along };
      return { x: along, z: road + side * (ROAD_W / 2 + SIDE_W / 2) };
    }
    if (roll < 0.85) return { x: rand(this.rng, 60, 150), z: rand(this.rng, 60, 100) }; // park
    return { x: rand(this.rng, 18, 28), z: rand(this.rng, 20, 240) }; // beach
  }
}

// ---- the manager (g.characters) -------------------------------------------
export class CharacterManager {
  constructor(game) {
    this.game = game;
    this.npcs = [];
    this.rng = mulberry32(777);
    this.playerChars = {};
  }

  createPlayerCharacter(charId) {
    if (this.playerChars[charId]) return this.playerChars[charId];
    let char;
    if (charId === 'maya') {
      char = buildHumanoid({ height: 1.70, shirt: 0x2a6fd6, pants: 0x2a2d33, longHair: true, skin: 0xe8b88a, hair: 0x3a2a1a });
    } else {
      char = buildHumanoid({ height: 1.81, shirt: 0xd92038, pants: 0x2a2d33, longHair: false, skin: 0xd9a066, hair: 0x1a1a1a });
    }
    this.playerChars[charId] = char;
    return char;
  }

  spawnPeds(n) {
    for (let i = 0; i < n; i++) {
      const road = pick(this.rng, ROADS);
      const side = this.rng() < 0.5 ? 1 : -1;
      const along = rand(this.rng, 30, 250);
      let x, z;
      if (this.rng() < 0.5) { x = road + side * (ROAD_W / 2 + SIDE_W / 2); z = along; }
      else { x = along; z = road + side * (ROAD_W / 2 + SIDE_W / 2); }
      if (x < 20 || x > 255 || z < 20 || z > 255) continue;
      const female = this.rng() < 0.4;
      const npc = new NPC(this.game, {
        x, z,
        modelKey: female ? 'npcFemale' : 'npcMale',
        state: this.rng() < 0.6 ? 'walk' : 'idle',
        heading: rand(this.rng, 0, Math.PI * 2),
      });
      this.npcs.push(npc);
    }
  }

  // beach life (P0): fishers at the water edge, sunbathers on the sand,
  // swimmers in the shallows, jet skis circling the bay.
  spawnBeachLife() {
    for (let i = 0; i < 5; i++) {
      const fisher = new NPC(this.game, {
        x: rand(this.rng, 16.5, 19.5),
        z: rand(this.rng, 30, 230),
        modelKey: 'fisher',
        state: 'fish',
        heading: -Math.PI / 2, // facing the sea (west)
      });
      this.npcs.push(fisher);
    }
    for (let i = 0; i < 5; i++) {
      const sun = new NPC(this.game, {
        x: rand(this.rng, 21, 28),
        z: rand(this.rng, 25, 235),
        modelKey: this.rng() < 0.5 ? 'npcFemale' : 'npcMale',
        state: 'sunbathe',
        heading: rand(this.rng, 0, Math.PI * 2),
      });
      this.npcs.push(sun);
    }
    for (let i = 0; i < 3; i++) {
      const swim = new NPC(this.game, {
        x: rand(this.rng, -8, 6),
        z: rand(this.rng, 40, 220),
        modelKey: this.rng() < 0.5 ? 'npcFemale' : 'npcMale',
        state: 'swim',
        heading: rand(this.rng, 0, Math.PI * 2),
      });
      this.npcs.push(swim);
    }
    for (let i = 0; i < 2; i++) {
      const rider = new NPC(this.game, {
        x: rand(this.rng, -25, -5),
        z: rand(this.rng, 60, 200),
        modelKey: 'npcMale',
        state: 'jetski',
        heading: rand(this.rng, 0, Math.PI * 2),
      });
      // the jet ski under the rider + arms forward on the handlebar
      const ski = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.35, 2.6),
        new THREE.MeshLambertMaterial({ color: pick(this.rng, [0xd92038, 0x2a6fd6, 0xffd34d]) }),
      );
      ski.position.set(0, 0.05, 0.1);
      rider.group.add(ski);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.06, 0.06),
        new THREE.MeshLambertMaterial({ color: 0x222222 }),
      );
      bar.position.set(0, 1.15, 0.55);
      rider.group.add(bar);
      rider.char.parts.armL.rotation.x = -1.1;
      rider.char.parts.armR.rotation.x = -1.1;
      this.npcs.push(rider);
    }
  }

  spawnLaRosa() {
    const rosa = new NPC(this.game, {
      x: 156, z: 113,
      modelKey: 'larosa',
      state: 'idle',
      heading: Math.PI,
    });
    this.npcs.push(rosa);
    return rosa;
  }

  update(dt) {
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const npc = this.npcs[i];
      npc.update(dt);
      // a dead NPC lies for 30 s, then is recycled
      if (npc.dead && npc._deadT > 30) this.recycleNPC(npc);
    }
  }

  recycleNPC(npc) {
    const i = this.npcs.indexOf(npc);
    if (i >= 0) this.npcs.splice(i, 1);
    if (npc.group && npc.group.parent) npc.group.parent.remove(npc.group);
  }
}
