// La Vega 3D — sky, sun/moon, clouds, rain, storm and the day-night cycle.
// Written in this session for the recorded build.
import * as THREE from 'three';
import { clamp, lerp } from './rng.js';

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.time = 12.0; // in-game clock, hours (starts 12:00, bright noon)
    this.day = 1;
    this.kind = 'sun'; // sun | cloud | rain | storm
    this.kindT = 0; // seconds in this weather
    this.nextKindAt = 50 + Math.random() * 60;
    this.rainDrops = null;
    this.rainVel = [];
    this.clouds = [];
    this.sun = new THREE.DirectionalLight(0xfff2d0, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -160;
    this.sun.shadow.camera.right = 160;
    this.sun.shadow.camera.top = 160;
    this.sun.shadow.camera.bottom = -160;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.bias = -0.0004;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(this.ambient);
    // Sky dome (gradient via vertex colours) + sun glow sprite.
    const skyGeo = new THREE.SphereGeometry(480, 24, 12);
    const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
    const pos = skyGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 480; // -1..1
      const t = clamp(y * 0.5 + 0.5, 0, 1);
      colors[i * 3] = lerp(0.35, 0.55, t);
      colors[i * 3 + 1] = lerp(0.45, 0.75, t);
      colors[i * 3 + 2] = lerp(0.65, 0.95, t);
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(this.sky);
    this.skyColors = colors;
    // Clouds: FLAT soft sprites from a canvas texture (ilham 04:16: "awan
    // masih bulat"). Never white spheres again — a real cloud is a wide,
    // flat, layered puff. The texture is several overlapping radial
    // gradients; each sprite is 3-5x wider than tall, high in the sky.
    const cloudTex = (() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      const ctx = c.getContext('2d');
      const puffs = [
        [64, 84, 46], [110, 70, 56], [160, 78, 52], [205, 88, 40],
        [90, 92, 40], [140, 92, 44], [185, 96, 36],
      ];
      for (const [x, y, r] of puffs) {
        const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.9)');
        grad.addColorStop(0.6, 'rgba(255,255,255,0.45)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.75 + Math.random() * 0.15, depthWrite: false });
      const s = new THREE.Sprite(mat);
      const w = 55 + Math.random() * 60;
      s.scale.set(w, w * 0.28, 1);
      s.position.set(Math.random() * 400, 100 + Math.random() * 55, Math.random() * 400);
      s.userData.drift = 1 + Math.random() * 1.2;
      scene.add(s);
      this.clouds.push(s);
    }
    // Rain as STREAKS (LineSegments), not Points: WebGL renders Points as
    // squares, which is why the playtest showed floating blue squares (P5).
    const N = 700;
    const rpos = new Float32Array(N * 2 * 3);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * 400, y = Math.random() * 40, z = Math.random() * 400;
      rpos[i * 6] = x; rpos[i * 6 + 1] = y; rpos[i * 6 + 2] = z;
      rpos[i * 6 + 3] = x + 0.12; rpos[i * 6 + 4] = y - 0.9; rpos[i * 6 + 5] = z;
      this.rainVel.push(28 + Math.random() * 12);
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
    this.rainDrops = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: 0xaaccee, transparent: true, opacity: 0.55 }));
    this.rainDrops.visible = false;
    this.rainDrops.frustumCulled = false;
    scene.add(this.rainDrops);
    // Night stars (600 points on the dome) + the moon (pale disc opposite
    // the sun) — visible only at night (P17-G).
    const SN = 600;
    const spos = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.45 + 0.08;
      const r = 460;
      spos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      spos[i * 3 + 1] = Math.sin(e) * r;
      spos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false }));
    this.stars.visible = false;
    this.stars.frustumCulled = false;
    scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(14, 24), new THREE.MeshBasicMaterial({ color: 0xf5f0d0, fog: false }));
    this.moon.visible = false;
    scene.add(this.moon);
    // Sea glint light (a warm point light over the water at dusk).
    this.seaLight = new THREE.PointLight(0xffc880, 0, 220);
    this.seaLight.position.set(10, 12, 200);
    scene.add(this.seaLight);
  }

  // Phase of day: 0 night, 1 day. Golden hour 16:30-19:00.
  phase() {
    const h = this.time;
    if (h >= 6 && h < 16.5) return 1; // day
    if (h >= 16.5 && h < 19) return 0.7 + (19 - h) / 2.5 * 0.3; // golden hour
    if (h >= 19 || h < 5) return 0; // night
    if (h >= 5 && h < 6) return (h - 5); // dawn
    return 1;
  }
  isGoldenHour() { return this.time >= 16.5 && this.time < 19; }
  isNight() { return this.time >= 19 || this.time < 5.5; }

  pickWeather() {
    const r = Math.random();
    this.kind = r < 0.5 ? 'sun' : r < 0.75 ? 'cloud' : r < 0.93 ? 'rain' : 'storm';
    this.kindT = 0;
    this.nextKindAt = 60 + Math.random() * 90;
  }

  update(dt, playerPos) {
    // Clock: 1 real second = 1 game minute (a full day in 24 minutes).
    this.time += dt / 60;
    if (this.time >= 24) { this.time -= 24; this.day++; }
    this.kindT += dt;
    if (this.kindT > this.nextKindAt) this.pickWeather();
    const ph = this.phase();
    const golden = this.isGoldenHour();
    const night = this.isNight();
    // Sun position (arcs across the sky).
    const ang = ((this.time - 6) / 12) * Math.PI;
    const sx = Math.cos(ang) * 220;
    const sy = Math.sin(ang) * 180 + 20;
    this.sun.position.set(playerPos.x + sx * 0.6, Math.max(sy, 8), playerPos.z + 60);
    this.sun.target.position.set(playerPos.x, 0, playerPos.z);
    this.sun.intensity = night ? 0.12 : golden ? 2.2 : 2.6;
    this.sun.color.setHex(golden ? 0xffc880 : night ? 0x8899ff : 0xfff2d0);
    this.hemi.intensity = night ? 0.25 : golden ? 0.6 : 0.9;
    this.ambient.intensity = night ? 0.12 : 0.25;
    // Sky colours per phase (day blue / dusk rose-purple / night dark / rain grey).
    const pos = this.sky.geometry.attributes.position;
    const colors = this.skyColors;
    let top, bot;
    if (night) { top = [0.05, 0.07, 0.16]; bot = [0.10, 0.12, 0.22]; }
    else if (golden) { top = [0.35, 0.25, 0.55]; bot = [0.98, 0.62, 0.35]; }
    else if (this.kind === 'rain' || this.kind === 'storm') { top = [0.35, 0.38, 0.42]; bot = [0.55, 0.58, 0.62]; }
    else { top = [0.25, 0.5, 0.85]; bot = [0.65, 0.82, 0.95]; }
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 480;
      const t = clamp(y * 0.5 + 0.5, 0, 1);
      colors[i * 3] = lerp(bot[0], top[0], t);
      colors[i * 3 + 1] = lerp(bot[1], top[1], t);
      colors[i * 3 + 2] = lerp(bot[2], top[2], t);
    }
    this.sky.geometry.attributes.color.needsUpdate = true;
    this.sky.position.set(playerPos.x, 0, playerPos.z);
    // Clouds: tint per phase, drift slowly across the sky. Sprites stay
    // high (storms darken them, never pull them down — GAP 3: the old
    // y=30 storm drop read as low grey lumps hugging the rooftops).
    const cloudTint = night ? 0x5a6a8a : golden ? 0xffc0a0 : (this.kind === 'rain' || this.kind === 'storm') ? 0x6a6a72 : 0xffffff;
    for (const c of this.clouds) {
      c.position.x += dt * c.userData.drift;
      if (c.position.x > 430) c.position.x = -30;
      c.material.color.setHex(cloudTint);
      c.position.y = Math.min(155, c.position.y + dt * 0.5);
    }
    // Rain (streaks: each drop is a 2-vertex line, top + bottom).
    const raining = this.kind === 'rain' || this.kind === 'storm';
    this.rainDrops.visible = raining;
    if (raining) {
      const p = this.rainDrops.geometry.attributes.position;
      for (let i = 0; i < this.rainVel.length; i++) {
        let y = p.getY(i * 2) - this.rainVel[i] * dt;
        if (y < 0) {
          y = 40;
          const nx = playerPos.x + (Math.random() - 0.5) * 80;
          const nz = playerPos.z + (Math.random() - 0.5) * 80;
          p.setX(i * 2, nx); p.setZ(i * 2, nz);
          p.setX(i * 2 + 1, nx + 0.12); p.setZ(i * 2 + 1, nz);
        }
        p.setY(i * 2, y);
        p.setY(i * 2 + 1, y - 0.9);
      }
      p.needsUpdate = true;
    }
    // Stars + moon follow the player and show only at night.
    this.stars.visible = night;
    this.stars.position.set(playerPos.x, 0, playerPos.z);
    this.moon.visible = night;
    if (night) {
      this.moon.position.set(playerPos.x - sx * 0.6, 220, playerPos.z - 120);
      this.moon.lookAt(playerPos.x, 0, playerPos.z);
    }
    // Sea glint at dusk.
    this.seaLight.intensity = golden ? 60 : 0;
    return { phase: ph, golden, night, raining: raining, storm: this.kind === 'storm' };
  }

  clockText() {
    const h = Math.floor(this.time);
    const m = Math.floor((this.time - h) * 60);
    return `DAY ${this.day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // Jump the clock (used by the dossier staging helper + tests).
  setTime(hours) {
    this.time = ((hours % 24) + 24) % 24;
    this.day = Math.max(1, Math.floor(this.time / 24) + 1);
  }
  // True between 19:30 and 05:30 (street lamps + car headlights use this).
  isNight() { return this.time >= 19.5 || this.time < 5.5; }
  // Golden hour for screenshots: 17:36, sun low, warm light.
  setGoldenHour() {
    this.setTime(17.6);
    this.kind = 'sun';
    this.update(0, { x: 130, z: 130 });
  }
  weatherName() {
    return { sun: 'SUNNY', cloud: 'CLOUDY', rain: 'RAIN', storm: 'STORM' }[this.kind];
  }
  // Grip factor for driving (rain makes roads slippery).
  gripFactor() {
    if (this.kind === 'storm') return 0.78;
    if (this.kind === 'rain') return 0.85;
    return 1;
  }
}
