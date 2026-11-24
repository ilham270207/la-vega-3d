// main.js — La Vega game boot + loop (round 12).
// Owns the renderer, the camera, input (keyboard / mouse / touch) and
// the per-frame wiring of every manager. The game object is the shared
// state the untouched managers (missions, police, save) read from.
import * as THREE from 'three';
import { WORLD, PLACES, DISTRICTS, CAR_MODELS } from './config.js';
import { mulberry32, clamp } from './rng.js';
import { AudioSys } from './audio.js';
import { Weather } from './weather.js';
import { settings, isTouchDevice } from './settings.js';
import { MissionManager } from './missions.js';
import { WantedManager } from './police.js';
import { SaveManager } from './save.js';
import { City } from './city.js';
import { CharacterManager } from './characters.js';
import { VehicleManager } from './vehicles.js';
import { HUD } from './hud.js';
import { CrewManager } from './crew.js';
import { StationsManager } from './stations.js';
import { AmbienceSys } from './ambience.js';
import { BusinessSystem } from './businesses.js';
import { SideJobSystem } from './sidejobs.js';
import { ScoringSystem } from './scoring.js';
import { CustomizationSystem } from './customization.js';
import { AnimalSystem } from './animals.js';
import { NightMarketSystem } from './nightmarket.js';
import { IslandSystem } from './island.js';
import { TrailerSystem } from './trailer.js';

const RANK_NAMES = ['NEWCOMER', 'STREET HUSTLER', 'WHEELMAN', 'CREW RUNNER', 'MADE DRIVER', 'LA VEGA LEGEND'];

export class Game {
  constructor() {
    this.rng = mulberry32(987654);
    this.state = 'menu';
    this.time = 0;
    this.input = {
      moveX: 0, moveZ: 0, run: false, jump: false, punch: false,
      fire: false, aim: false, reload: false, gas: false, brake: false,
      left: false, right: false, nitro: false, handbrake: false,
    };
    this.camYaw = -Math.PI / 2;
    this.camDist = 8;
    this.camPitch = 0.3;
    this.trafficRed = false;
    this.ownedCars = [];
    this.garageSelected = null;
    this.garageCooldown = 0;
    this.cutsceneT = 0;
    this.trailerT = 0;
    this.menuChar = 'jax';
    this.taxi = null;
    this.rank = 0;
    this.rankName = RANK_NAMES[0];
    this.standing = { marina: 0, downtown: 0, neon: 0, beach: 0 };
    this.businesses = {};
    this.socialFeed = [
      'La Rosa: The city never sleeps, and neither do we. 🌃',
      'Manny: Fresh paint, full tank, zero questions.',
      'LVPD: Drive safe, La Vega. We are watching.',
    ];
    this.quality = 'auto';
    this.paused = false;
    this._bustedT = false;
    this._lastNextIdx = 0;
    this._fpsFrames = 0;
    this._fpsT = 0;
    this._fpsDone = false;
    this._renderer = null;
    this._scene = null;
    this._camera = null;
  }

  get renderer() { return this._renderer; }
  get scene() { return this._scene; }
  get camera() { return this._camera; }

  async boot() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    document.body.appendChild(renderer.domElement);
    this._renderer = renderer;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87b5e0);
    this._scene = scene;
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);
    camera.position.set(100, 30, 100);
    this._camera = camera;
    scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x3a5a3a, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
    sun.position.set(120, 180, 60);
    scene.add(sun);
    this.sunLight = sun;

    this.weather = new Weather(scene);
    this.weather.setTime(12);
    this.audio = new AudioSys(settings);
    this.city = new City(scene);
    this.city.weather = this.weather;
    this.characters = new CharacterManager(this);
    this.player = this.characters.spawnPlayer('jax');
    this.player.giveWeapon('pistol', 0);
    this.characters.spawnInitial();
    this.vehicles = new VehicleManager(this);
    this.vehicles.spawnTraffic(30);
    this.vehicles.spawnParked(12);
    this.hud = new HUD(this);
    this.police = new WantedManager(this);
    this.missions = new MissionManager(this);
    this.save = new SaveManager(this);
    this.crew = new CrewManager(this);
    this.stations = new StationsManager(this);
    this.ambience = new AmbienceSys(this);
    // Round-13 standalone modules (Thirteen): one shared ctx object; each
    // constructor is guarded so a single module can never break the boot.
    const self = this;
    const modCtx = {
      scene,
      camera: this._camera,
      weather: this.weather,
      get player() { return self.player; },
      money: {
        get: () => (self.player ? self.player.money : 0),
        add: (n) => { if (self.player) self.player.money += n; },
        spend: (n) => { if (!self.player || self.player.money < n) return false; self.player.money -= n; return true; },
        canAfford: (n) => !!self.player && self.player.money >= n,
      },
      notify: (t) => { if (self.hud) self.hud.notify(t); },
      getHour: () => (self.weather ? self.weather.time : 12),
      isNight: () => (self.weather ? self.weather.isNight() : false),
      getBusinesses: () => self.businesses,
      getNpcs: () => (self.characters ? self.characters.npcs : []),
      getPlayerCar: () => (self.vehicles ? self.vehicles.playerCar : null),
      getTraffic: () => (self.vehicles ? self.vehicles.traffic : []),
      getCrew: () => (self.crew ? self.crew.members : []),
      getPolice: () => (self.police ? self.police.units : []),
      spawnNPC: (opts) => (self.characters ? self.characters.spawnNPC(opts) : null),
      markers: { add() {}, remove() {} },
    };
    const safeMod = (fn) => { try { return fn(); } catch (e) { console.error('[mods]', e); return null; } };
    this.biz = safeMod(() => new BusinessSystem(modCtx));
    this.jobs = safeMod(() => new SideJobSystem(modCtx));
    this.score = safeMod(() => new ScoringSystem(modCtx));
    this.cust = safeMod(() => new CustomizationSystem(modCtx));
    this.animals = safeMod(() => new AnimalSystem(modCtx));
    this.market = safeMod(() => new NightMarketSystem(modCtx));
    this.island = safeMod(() => new IslandSystem(modCtx));
    this.trailer = safeMod(() => new TrailerSystem(modCtx));
    this._bindInput();
    this._applyControlMode('auto');
    this.hud.hideLoading();
    this.hud.showMenu();
    this.state = 'menu';
    this._lastT = performance.now();
    const loop = () => {
      requestAnimationFrame(loop);
      this._frame();
    };
    requestAnimationFrame(loop);
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    return true;
  }

  // ---------- input ----------
  _bindInput() {
    const input = this.input;
    const keyMap = {
      KeyW: 'w', ArrowUp: 'w', KeyS: 's', ArrowDown: 's',
      KeyA: 'a', ArrowLeft: 'a', KeyD: 'd', ArrowRight: 'd',
    };
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (e.code === 'Tab') { e.preventDefault(); this.hud.showWeaponMenu(); return; }
      const k = keyMap[e.code];
      if (k === 'w') { input.moveZ = -1; if (this.player && this.player.inCar) input.gas = true; }
      if (k === 's') { input.moveZ = 1; if (this.player && this.player.inCar) input.brake = true; }
      if (k === 'a') { input.moveX = -1; if (this.player && this.player.inCar) input.left = true; }
      if (k === 'd') { input.moveX = 1; if (this.player && this.player.inCar) input.right = true; }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = true;
      if (e.code === 'Space') { e.preventDefault(); if (this.player && this.player.inCar) input.handbrake = true; else input.jump = true; }
      if (e.code === 'KeyF') input.fire = true;
      if (e.code === 'KeyQ') input.punch = true;
      if (e.code === 'KeyX') input.reload = true;
      if (e.code === 'KeyN') input.nitro = true;
      if (e.code === 'KeyE' && !e.repeat) this.interact();
      if (e.code === 'KeyG' && !e.repeat) this.repairCar();
      if (e.code === 'KeyR' && !e.repeat && this.audio) this.audio.nextStation();
      if (e.code === 'KeyH' && !e.repeat) { if (this.audio) this.audio.honk(); this.ambience.honk(0, 0.5); }
      if (e.code === 'KeyM' && !e.repeat) this.setMuted(!this._muted);
      if (e.code === 'KeyT' && !e.repeat) this.hud.togglePhone();
      if (e.code === 'KeyV' && !e.repeat) this.camDist = this.camDist >= 14 ? 7 : this.camDist + 4;
      if (e.code === 'KeyZ' && !e.repeat) this.crew.command('regroup');
      if (e.code === 'KeyX' && e.shiftKey) this.crew.command('attack');
      if (e.code === 'KeyC' && !e.repeat) this.crew.command('hold');
      if (e.code === 'KeyB' && !e.repeat && this.biz) this.biz.togglePanel();
      if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) this.togglePause();
      if (e.code.startsWith('Digit')) {
        const idx = +e.code.slice(5) - 1;
        const ids = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];
        if (ids[idx] && this.player) this.player.setWeapon(ids[idx]);
      }
      if (e.code === 'Digit1' && this._nearPlace('dealer', 9)) this.buyCar('sedan');
      if (e.code === 'Digit2' && this._nearPlace('dealer', 9)) this.buyCar('truck');
      if (e.code === 'Digit3' && this._nearPlace('dealer', 9)) this.buyCar('sport');
    });
    window.addEventListener('keyup', (e) => {
      const k = keyMap[e.code];
      if (k === 'w') { input.moveZ = 0; input.gas = false; }
      if (k === 's') { input.moveZ = 0; input.brake = false; }
      if (k === 'a') { input.moveX = 0; input.left = false; }
      if (k === 'd') { input.moveX = 0; input.right = false; }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = false;
      if (e.code === 'Space') { input.handbrake = false; input.jump = false; }
      if (e.code === 'KeyF') input.fire = false;
      if (e.code === 'KeyQ') input.punch = false;
      if (e.code === 'KeyX') input.reload = false;
      if (e.code === 'KeyN') input.nitro = false;
    });
    // Mouse: drag to orbit, wheel to zoom, click to fire / aim.
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const el = this._renderer.domElement;
    el.addEventListener('mousedown', (e) => {
      this.audio.unlock();
      this.ambience.unlock();
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      if (e.button === 0) input.fire = true;
      if (e.button === 2) input.aim = true;
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      this.camYaw -= (e.clientX - lastX) * 0.005;
      this.camPitch = clamp(this.camPitch + (e.clientY - lastY) * 0.003, 0.05, 1.1);
      lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mouseup', (e) => {
      dragging = false;
      if (e.button === 0) input.fire = false;
      if (e.button === 2) input.aim = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camDist = clamp(this.camDist + (e.deltaY > 0 ? 1.5 : -1.5), 4, 20);
    }, { passive: false });
    // Touch: 1 finger orbits, 2 fingers pinch-zoom.
    let touches = new Map();
    let pinchStart = 0;
    let pinchDist0 = 0;
    el.addEventListener('touchstart', (e) => {
      this.audio.unlock();
      this.ambience.unlock();
      for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinchStart = this.camDist;
        pinchDist0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      if (e.cancelable) e.preventDefault();
      if (touches.size === 1) {
        const t = e.changedTouches[0];
        const prev = touches.get(t.identifier);
        if (prev) {
          this.camYaw -= (t.clientX - prev.x) * 0.006;
          this.camPitch = clamp(this.camPitch + (t.clientY - prev.y) * 0.004, 0.05, 1.1);
        }
        touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      } else if (touches.size === 2) {
        for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
        const [a, b] = [...touches.values()];
        const gap = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        this.camDist = clamp(pinchStart * (pinchDist0 / gap), 4, 20);
      }
    }, { passive: false });
    const touchEnd = (e) => {
      for (const t of e.changedTouches) touches.delete(t.identifier);
    };
    el.addEventListener('touchend', touchEnd);
    el.addEventListener('touchcancel', touchEnd);
    window.addEventListener('pointerdown', () => { this.audio.unlock(); this.ambience.unlock(); }, { once: true });
  }

  _nearPlace(key, range) {
    const p = this.player;
    if (!p || !PLACES[key]) return false;
    return Math.hypot(PLACES[key].x - p.x, PLACES[key].y - p.z) < range;
  }

  touchAction(act, down) {
    const input = this.input;
    if (act === 'gas') input.gas = down;
    else if (act === 'brake') input.brake = down;
    else if (act === 'left') input.left = down;
    else if (act === 'right') input.right = down;
    else if (act === 'fire') input.fire = down;
    else if (act === 'punch') input.punch = down;
    else if (act === 'jump') input.jump = down;
    else if (act === 'enter' && down) this.interact();
  }

  // ---------- flow ----------
  newGame(charId = 'jax') {
    const p = this.characters.spawnPlayer(charId);
    this.player = p;
    p.x = 30; p.z = 100; p.y = 0.1; p.heading = Math.PI / 2;
    p.money = 0;
    p.health = 100; p.armor = 0;
    p.giveWeapon('pistol', 0);
    p.setWeapon('pistol');
    this.standing = { marina: 0, downtown: 0, neon: 0, beach: 0 };
    this.rank = 0; this.rankName = RANK_NAMES[0];
    this.ownedCars = [];
    if (this.biz) this.biz.reset();
    this.camYaw = -Math.PI / 2;
    this.camDist = 8;
    this.camPitch = 0.3;
    this.missions.startMission(1);
    this.hud.hideMenu();
    this.hud.hideDialogue();
    this.hud.updateMissionPanel();
    this.state = 'playing';
  }

  loadGame(slot) {
    const data = this.save ? this.save.load(slot) : null;
    if (!data) { this.hud.notify('No save in that slot.'); return false; }
    const p = this.player;
    p.x = data.x; p.z = data.z; p.heading = data.heading;
    p.health = data.health; p.armor = data.armor; p.stamina = data.stamina;
    p.money = data.money; p.weapons = data.weapons; p.weapon = data.weapon;
    p.charId = data.charId;
    this.standing = data.standing || this.standing;
    this.rank = data.rank || 0;
    this.rankName = RANK_NAMES[Math.min(RANK_NAMES.length - 1, Math.floor(this.rank / 20))] || RANK_NAMES[0];
    this.businesses = data.businesses || {};
    if (this.biz) this.biz.syncFromGame();
    if (this.missions && data.missions) this.missions.restore(data.missions);
    if (this.weather && data.time !== undefined) this.weather.setTime(data.time);
    if (this.audio && data.station !== undefined) this.audio.stationIdx = data.station;
    this.ownedCars = (data.ownedCars || []).map((c) => ({ ...c, name: (CAR_MODELS[c.specKey] || {}).name || c.specKey }));
    this.hud.hideMenu();
    this.state = 'playing';
    this.hud.notify(`Loaded slot ${slot}.`);
    return true;
  }

  saveGame(slot) {
    if (this.save) this.save.save(slot);
  }

  quitToMenu() {
    this.state = 'menu';
    this.paused = false;
    this.hud.hidePause();
    this.hud.showMenu();
  }

  togglePause(force) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    const toPause = force !== undefined ? force : !this.paused;
    this.paused = toPause;
    if (toPause) {
      this.state = 'paused';
      const p = this.player;
      this.hud.showPause(`DAY ${this.weather ? this.weather.day : 1} · $${Math.floor(p.money)} · MISSION ${this.missions && this.missions.current ? this.missions.current.id : '—'}/12`);
    } else {
      this.state = 'playing';
      this.hud.hidePause();
    }
  }

  playTrailer() {
    this.state = 'trailer';
    this.trailerT = 0;
    this.hud.hideMenu();
    if (this.trailer) {
      this.trailer.play(() => { if (this.state === 'trailer') this.endTrailer(); });
    } else {
      this.hud.showMissionCard('LA VEGA', 'OFFICIAL TRAILER', 'Twelve jobs. One island. No rules but yours.');
    }
  }

  endTrailer() {
    if (this.trailer) this.trailer.stop();
    this.state = 'menu';
    this.hud.hideMissionCard();
    this.hud.showMenu();
  }

  enterGarage() {
    if (this.state !== 'playing') return;
    const car = this.vehicles.playerCar;
    if (!car) return;
    this.ownedCars.push({ specKey: car.specKey, name: car.name, color: car.color, cond: Math.round(car.cond), fuel: Math.round(car.fuel) });
    this.garageSelected = this.ownedCars[this.ownedCars.length - 1];
    this.state = 'garage';
    this.hud.showGarageMenu(this.ownedCars);
  }

  exitGarage() {
    const data = this.garageSelected || this.ownedCars[this.ownedCars.length - 1];
    if (!data) { this.state = 'playing'; this.hud.hideGarageMenu(); return; }
    const car = this.vehicles.spawn(data.specKey, 78, 169, 0, { color: data.color });
    car.cond = data.cond ?? 100;
    car.fuel = data.fuel ?? 100;
    car.kind = 'player';
    this.vehicles.playerCar = car;
    const p = this.player;
    p.inCar = true;
    p.group.visible = false;
    p.x = car.x; p.z = car.z; p.heading = car.heading;
    this.garageCooldown = 5;
    this.state = 'playing';
    this.hud.hideGarageMenu();
  }

  buyCar(specKey) {
    const spec = CAR_MODELS[specKey];
    if (!spec) return;
    const p = this.player;
    if (p.money < spec.price) { this.hud.notify(`Need $${spec.price} — you have $${Math.floor(p.money)}.`); return; }
    p.money -= spec.price;
    this.ownedCars.push({ specKey, name: spec.name, color: spec.colors[0], cond: 100, fuel: 100 });
    const car = this.vehicles.spawn(specKey, PLACES.dealer.x + 9, PLACES.dealer.y, 0, {});
    car.kind = 'parked';
    this.vehicles.parkedCars.push(car);
    if (this.missions) this.missions.onCarBought();
    this.hud.notify(`You bought the ${spec.name} for $${spec.price}!`);
    this.hud.hideDealer();
    if (this.audio) this.audio.cash();
  }

  refuelCar() {
    if (!this.vehicles.playerCar) return;
    const r = this.stations.refuel(this.vehicles.playerCar);
    if (!r.ok) this.hud.notify(r.reason === 'not enough cash' ? 'Not enough cash for fuel.' : 'Tank is already full.');
  }

  repairCar() {
    if (!this.vehicles.playerCar) return;
    const r = this.stations.repair(this.vehicles.playerCar);
    if (!r.ok) this.hud.notify(r.reason === 'not enough cash' ? 'Not enough cash for repairs.' : 'Body is already mint.');
  }

  useSnack() {
    const p = this.player;
    if (p.money < 5) { this.hud.notify('Need $5 for a snack.'); return; }
    if (p.health >= 100) { this.hud.notify('Health is already full.'); return; }
    p.money -= 5;
    p.health = Math.min(100, p.health + 25);
    this.hud.hideWeaponMenu();
  }

  callContact(who) {
    if (who === 'larosa') {
      this.hud.togglePhone();
      this.missions.talkToLaRosa();
    } else if (who === 'manny') {
      this.hud.togglePhone();
      this.hud.notify("Manny: bring the car to the garage and I'll look after it.");
    }
  }

  interact() {
    if (this.state !== 'playing' || this.paused) return;
    const p = this.player;
    if (!p) return;
    if (p.inCar) {
      const prompt = this.stations.promptFor(p);
      if (prompt && prompt.canRefuel) { this.refuelCar(); return; }
      this.vehicles.exitCar();
      return;
    }
    const nearCar = this.vehicles.nearestCar(p.x, p.z, 4.5);
    if (nearCar) { this.vehicles.tryEnterNearest(p); return; }
    const npc = this.crew.nearestRecruitable(p.x, p.z, 3.2);
    if (npc) { this.crew.recruit(npc); return; }
    if (this._nearPlace('dealer', 9)) { this.hud.showDealer(); return; }
    if (this._nearPlace('club', 11)) { this.missions.talkToLaRosa(); return; }
    if (this._nearPlace('garage', 7)) { this.hud.notify('Bring a car to the garage to store it.'); return; }
  }

  // ---------- settings ----------
  cycleQuality() {
    const order = ['auto', 'low', 'medium', 'high'];
    const next = order[(order.indexOf(this.quality) + 1) % order.length];
    this.setQuality(next);
  }

  setQuality(v) {
    this.quality = v;
    const pr = v === 'low' ? 1 : v === 'medium' ? 1.25 : Math.min(window.devicePixelRatio || 1, 2);
    this._renderer.setPixelRatio(pr);
    if (this.hud) this.hud.qualityEl.textContent = `Quality: ${v}`;
  }

  setMusicVolume(v) { this._musicVol = v; if (this.audio && this.audio.setMusicVolume) this.audio.setMusicVolume(v); }
  setSfxVolume(v) { this._sfxVol = v; if (this.audio && this.audio.setSfxVolume) this.audio.setSfxVolume(v); }
  setMuted(m) { this._muted = m; if (this.audio) this.audio.setMuted(m); }

  setControlMode(v) {
    this._applyControlMode(v);
  }

  _applyControlMode(v) {
    const touch = v === 'touch' || (v === 'auto' && isTouchDevice());
    document.body.classList.toggle('lv-touch-mode', touch);
    document.body.classList.toggle('lv-pc-mode', !touch);
  }

  // ---------- dossier staging ----------
  stageShot(kind) {
    const p = this.player;
    if (!p) return;
    if (this.weather) this.weather.setGoldenHour();
    if (kind === 'beach') {
      p.x = 24; p.z = 100; p.heading = -Math.PI / 2;
      this.camYaw = -Math.PI / 2; this.camDist = 14; this.camPitch = 0.3;
    } else if (kind === 'downtown') {
      p.x = 130; p.z = 130; p.heading = 0;
      this.camYaw = 0; this.camDist = 12; this.camPitch = 0.3;
    } else if (kind === 'harbor') {
      p.x = 20; p.z = 130; p.heading = Math.PI / 2;
      this.camYaw = Math.PI / 2; this.camDist = 16; this.camPitch = 0.35;
    } else {
      p.x = 200; p.z = 200; p.heading = 0.6;
      this.camYaw = 0.6; this.camDist = 18; this.camPitch = 0.55;
    }
    p.group.position.set(p.x, p.y, p.z);
    p.group.rotation.y = p.heading;
    if (this.police) this.police.setWanted(3, 'photo');
  }

  // ---------- frame ----------
  _frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this._lastT || now)) / 1000 || 0.016);
    this._lastT = now;
    this.time += dt;
    if (!this._fpsDone && this.state === 'playing') {
      this._fpsFrames += 1;
      this._fpsT += dt;
      if (this._fpsT >= 3) {
        this._fpsDone = true;
        const fps = this._fpsFrames / this._fpsT;
        if (this.quality === 'auto') {
          if (fps < 15) this.setQuality('low');
          else if (fps < 25) this.setQuality('medium');
          else if (this.hud) this.hud.qualityEl.textContent = 'Quality: auto';
        }
      }
    }
    if (this.garageCooldown > 0) this.garageCooldown -= dt;
    if (this.state === 'menu') {
      this.camYaw += dt * 0.05;
      const cx = 130 + Math.sin(this.camYaw) * 55;
      const cz = 130 + Math.cos(this.camYaw) * 55;
      this._camera.position.set(cx, 34, cz);
      this._camera.lookAt(130, 8, 130);
      this.city.update(dt, this.time);
      this.weather.update(dt, { x: 130, z: 130 });
      if (this.island) this.island.update(dt);
      if (this.animals) this.animals.update(dt);
      if (this.market) this.market.update(dt);
    } else if (this.state === 'trailer') {
      if (this.trailer && this.trailer.getState().playing) {
        this.trailer.update(dt);
      } else {
        this.trailerT += dt;
        if (this.trailerT > 34) this.endTrailer();
        const t = this.trailerT;
        const cx = 130 + Math.sin(t * 0.12) * 90;
        const cz = 130 + Math.cos(t * 0.12) * 90;
        this._camera.position.set(cx, 26 + Math.sin(t * 0.2) * 8, cz);
        this._camera.lookAt(130, 6, 130);
      }
      this.city.update(dt, this.time);
      this.weather.update(dt, { x: 130, z: 130 });
    } else if (this.state === 'playing' && !this.paused) {
      const p = this.player;
      this.vehicles.update(dt);
      this.characters.update(dt, this.input);
      this.police.update(dt);
      this.missions.update(dt);
      if (this.city.update) this.city.update(dt, this.time);
      this.crew.update(dt);
      this.stations.update(dt);
      this.ambience.update(dt);
      if (this.biz) this.biz.update(dt);
      if (this.jobs) this.jobs.update(dt);
      if (this.score) this.score.update(dt);
      if (this.cust) this.cust.update(dt);
      if (this.animals) this.animals.update(dt);
      if (this.market) this.market.update(dt);
      if (this.island) this.island.update(dt);
      if (this.trailer) this.trailer.update(dt);
      this.weather.update(dt, p);
      if (this.audio) this.audio.setSeaLevel(this.city.isInWater(p.x) ? 1 : 0);
      // Garage drive-in: slow car at Manny's door stores it.
      const car = this.vehicles.playerCar;
      if (car && this.garageCooldown <= 0 && Math.abs(car.speed) < 1.5
        && Math.hypot(car.x - PLACES.garage.x, car.z - PLACES.garage.y) < 4.5) {
        this.enterGarage();
      }
      // Busted flow (once).
      if (p.dead && !this._bustedT) {
        this._bustedT = true;
        this.hud.showBusted();
        if (this.audio) this.audio.busted();
        this.police.busted();
        p.dead = false;
        p.health = 100;
        this._bustedT = false;
      }
      // Auto-save when the next mission index advances.
      if (this.missions.nextIdx !== this._lastNextIdx) {
        this._lastNextIdx = this.missions.nextIdx;
        if (this.save) this.save.save(1, true);
      }
      this._updateCamera(dt);
      this.hud.update(dt);
    } else if (this.state === 'garage') {
      this.city.update(dt, this.time);
    }
    this._renderer.render(this._scene, this._camera);
  }

  _updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    const dist = p.inCar ? this.camDist + 2 : this.camDist;
    const cx = p.x + Math.sin(this.camYaw) * dist * Math.cos(this.camPitch);
    const cz = p.z + Math.cos(this.camYaw) * dist * Math.cos(this.camPitch);
    const cy = (p.y || 0) + 2 + Math.sin(this.camPitch) * dist;
    // Snap when far (teleport / zoom change / load) so the camera never
    // takes seconds to catch up; lerp smoothly during normal play.
    const dErr = Math.hypot(cx - this._camera.position.x, cy - this._camera.position.y, cz - this._camera.position.z);
    if (dErr > 3) {
      this._camera.position.set(cx, cy, cz);
    } else {
      const k = 1 - Math.exp(-10 * dt);
      this._camera.position.x += (cx - this._camera.position.x) * k;
      this._camera.position.y += (cy - this._camera.position.y) * k;
      this._camera.position.z += (cz - this._camera.position.z) * k;
    }
    this._camera.lookAt(p.x, (p.y || 0) + 1.5, p.z);
  }
}
