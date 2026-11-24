// animals.js — stray dogs + seagulls (round 13).
// Written from scratch by Thirteen (round 13, recording 01a20d7f).
// Three dogs wander their home areas; eight gulls circle over the sea.
import * as THREE from 'three';
import { clamp, box } from './twelve-utils.js';

const DOG_HOMES = [
  { name: 'park', x: 104, z: 78 },
  { name: 'beach', x: 30, z: 85 },
  { name: 'marina', x: 120, z: 130 },
];

function buildDog(color) {
  const g = new THREE.Group();
  g.name = 'dog';
  const body = box(0.72, 0.34, 0.32, color, { y: 0.42 });
  body.name = 'dog-body';
  g.add(body);
  const head = box(0.26, 0.26, 0.26, color, { x: 0.42, y: 0.62 });
  head.name = 'dog-head';
  g.add(head);
  const snout = box(0.16, 0.12, 0.14, 0x8a6a4a, { x: 0.6, y: 0.56 });
  g.add(snout);
  const ear = box(0.08, 0.16, 0.06, 0x2a1f16, { x: 0.36, y: 0.8, z: 0.1 });
  g.add(ear);
  const legs = [];
  for (const [lx, lz] of [[0.26, 0.11], [0.26, -0.11], [-0.26, 0.11], [-0.26, -0.11]]) {
    const leg = box(0.09, 0.3, 0.09, 0x2a1f16, { x: lx, y: 0.15, z: lz });
    leg.name = 'dog-leg';
    g.add(leg);
    legs.push(leg);
  }
  const tail = box(0.3, 0.07, 0.07, color, { x: -0.48, y: 0.58 });
  tail.name = 'dog-tail';
  g.add(tail);
  return { group: g, legs, tail };
}

function buildGull() {
  const g = new THREE.Group();
  g.name = 'gull';
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.7, 6),
    new THREE.MeshBasicMaterial({ color: 0xf5f5f0 }),
  );
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const wingGeo = new THREE.PlaneGeometry(0.9, 0.28);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e0, side: THREE.DoubleSide });
  const wl = new THREE.Mesh(wingGeo, wingMat);
  wl.position.x = -0.45;
  const wr = new THREE.Mesh(wingGeo, wingMat);
  wr.position.x = 0.45;
  // Pivot at the body: wrap each wing in a pivot group.
  const pl = new THREE.Group();
  pl.add(wl);
  wl.position.x = -0.45;
  const pr = new THREE.Group();
  pr.add(wr);
  wr.position.x = 0.45;
  g.add(pl);
  g.add(pr);
  return { group: g, wingL: pl, wingR: pr };
}

export class AnimalSystem {
  constructor(ctx) {
    this.ctx = ctx || {};
    this.group = new THREE.Group();
    this.group.name = 'animals';
    if (this.ctx.scene) this.ctx.scene.add(this.group);
    this.dogs = [];
    const colors = [0x8a6a3a, 0x3a3f4a, 0xc9a06a];
    DOG_HOMES.forEach((home, i) => {
      const d = buildDog(colors[i % colors.length]);
      d.group.position.set(home.x, 0, home.z);
      this.group.add(d.group);
      this.dogs.push({
        ...d, home, x: home.x, z: home.z, heading: Math.random() * Math.PI * 2,
        state: 'idle', stateT: 1 + Math.random() * 2, tx: home.x, tz: home.z, moved: 0,
      });
    });
    this.birds = [];
    for (let i = 0; i < 8; i++) {
      const b = buildGull();
      const cx = -20 - (i % 4) * 12;
      const cz = 50 + Math.floor(i / 4) * 90 + (i % 3) * 25;
      const r = 10 + (i % 3) * 5;
      const a = (i / 8) * Math.PI * 2;
      b.group.position.set(cx + Math.cos(a) * r, 16 + (i % 3) * 4, cz + Math.sin(a) * r);
      this.group.add(b.group);
      this.birds.push({ ...b, cx, cz, r, angle: a, speed: 0.25 + (i % 3) * 0.08, y: 16 + (i % 3) * 4, flap: Math.random() * 6 });
    }
  }

  update(dt) {
    // Dogs: idle → pick a nearby target → trot → idle. Tail always wags.
    for (const d of this.dogs) {
      d.stateT -= dt;
      d.tail.rotation.z = Math.sin(performance.now() * 0.008 + d.x) * 0.5;
      if (d.state === 'idle') {
        if (d.stateT <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = 3 + Math.random() * 7;
          d.tx = clamp(d.home.x + Math.cos(a) * r, 16, 258);
          d.tz = clamp(d.home.z + Math.sin(a) * r, 2, 258);
          d.state = 'walk';
          d.stateT = 6;
        }
      } else {
        const dx = d.tx - d.x;
        const dz = d.tz - d.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.4 || d.stateT <= 0) {
          d.state = 'idle';
          d.stateT = 1 + Math.random() * 3;
        } else {
          const sp = 1.6 * dt;
          d.x += (dx / dist) * sp;
          d.z += (dz / dist) * sp;
          d.moved += sp;
          d.heading = Math.atan2(dx, dz);
          d.group.position.set(d.x, 0, d.z);
          d.group.rotation.y = d.heading;
          // Trot: legs swing.
          const s = Math.sin(performance.now() * 0.02 + d.x * 2) * 0.5;
          d.legs[0].rotation.x = s;
          d.legs[3].rotation.x = s;
          d.legs[1].rotation.x = -s;
          d.legs[2].rotation.x = -s;
        }
      }
    }
    // Gulls: circle over the sea, wings flapping.
    for (const b of this.birds) {
      b.angle += b.speed * dt;
      b.flap += dt * 6;
      const x = b.cx + Math.cos(b.angle) * b.r;
      const z = b.cz + Math.sin(b.angle) * b.r;
      b.group.position.set(x, b.y + Math.sin(b.flap * 0.5) * 0.6, z);
      b.group.rotation.y = -b.angle;
      const flap = Math.sin(b.flap) * 0.55;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
    }
  }

  getCounts() { return { dogs: this.dogs.length, birds: this.birds.length }; }

  dispose() {
    if (this.ctx.scene) this.ctx.scene.remove(this.group);
  }
}
