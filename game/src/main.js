// La Vega 3D — main game (round 10 re-author).
//
// The Game owns the renderer, the loop and every module: city,
// vehicles, characters, missions, police, weather, HUD, audio, saves.
// It is the contract index.html boots (`new Game(); game.boot()`)
// and the contract hud.js / missions.js / police.js / save.js read:
//   game.player, game.vehicles, game.characters, game.missions,
//   game.police, game.weather, game.audio, game.hud, game.saves,
//   game.city, game.scene, game.rng, game.standing, game.ownedCars,
//   game.selectedChar, game.input, game.trafficRed, game.trafficT,
//   game.cutscene / cutsceneT, game.taxi, game.rank, game.businesses,
//   game.saveGame(), game.startNewGame(), game.loadGame(),
//   game.quitToMenu(), game.togglePause(), game.togglePhone(),
//   game.playTrailer(), game.buyCar(), game.takeOutCar(),
//   game._finishIntro(), game.stageShot(), game.onNPCAttack(),
//   game.onNPCDeath().
//
// Two round-10 fixes live here: the follow camera is CLOSE (on foot
// 6.5 m, 15% closer in portrait, so a 1.81 m character fills 1/6–1/4
// of a 390x844 screen) and every character is runtime-normalised to
// its design height (Jax 1.81 m) by measuring its group bounds, so a
// wrong scale can never shrink the player to a dot again. The renderer
// uses ACES filmic tone mapping (P1).

import * as THREE from 'three';
import {
  STEP, WORLD, ROADS, STREET_NS, STREET_EW, DISTRICTS, PLACES, PLACE_DIMS,
  PALETTE, CITY_TUNING, BIOMES, PLAYER, WANTED_MAX, SAVE_KEY, WEAPONS,
  CAR_MODELS, CAR_CATALOG, MISSIONS,
} from './config.js';
import { buildCity, groundHeight } from './city.js';
import { VehicleManager } from './vehicles.js';
import { NPC, CharacterManager } from './characters.js';
import { MissionManager } from './missions.js';
import { WantedManager } from './police.js';
import { HUD } from './hud.js';
import { Weather } from './weather.js';
import { SaveManager } from './save.js';
import { settings, isTouchDevice, effectiveControlMode } from './settings.js';
import { AudioSys } from './audio.js';
import { mulberry32, rand, randInt, pick, clamp, lerp, damp, angleLerp, dist2d } from './rng.js';

export class Game {
  constructor() {
    this.rng = mulberry32(2026);
    this.state = 'menu'; // menu | playing | paused | cutscene | trailer | busted
    this.paused = false;
    this.phoneOpen = false;
    this.cutscene = false;
    this.cutsceneT = 0;
    this.shake = 0;
    this.trafficRed = true;
    this.trafficT = 6;
    this.selectedChar = 'jax';
    this.standing = { marina: 0, downtown: 0, neon: 0, beach: 0 };
    this.rank = 0;
    this.ownedCars = [];
    this.businesses = {};
    this.items = {};
    this.crewCd = 0;
    this.safeCd = 0;
    this.eventT = 0;
    this.promptT = 0;
    this.currentPrompt = null;
    this.trailerT = 0;
    this.downT = 0;
    this.taxi = null;
    this.dog = null;
    this.collectibles = [];
    this.stunts = [];
    this.birds = [];
    this.camYaw = Math.PI / 2;
    this.camPitch = 0.32;
    this.camDist = 6.5;
    this.camAutoT = 0;
    this.mouseDown = false;
    this.input = {
      up: false, down: false, left: false, right: false,
      brake: false, nitro: false, jump: false, fire: false, aim: false,
      touch: {},
    };
    this._keys = {};
    this._pressed = { punch: false, enter: false, reload: false };
    this._last = 0;
    this._acc = 0;
    this._touchEnterPrev = false;
    this.aiming = false;
    this.player = null;
    this.hud = null;
    this.audio = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.weather = null;
    this.city = null;
    this.vehicles = null;
    this.characters = null;
    this.police = null;
    this.missions = null;
    this.saves = null;
    this.sun = null;
    this.booted = false;
    this._pickups = [];
    this._menuAngle = 0;
    this._interiorNear = null;
  }

  async boot() {
    if (this.booted) return;
    this.booted = true;
    this.hud = new HUD(this);
    this.hud.setLoading(5, 'Building La Vega…');

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // ACES filmic tone mapping (P1): warmer sun, deeper night sky
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5d6);
    this.scene.fog = new THREE.Fog(0x9fc3dd, 120, 420);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(60, 40, 220);
    this.camera.lookAt(130, 0, 130);

    this.audio = new AudioSys(settings);
    this.hud.setLoading(20, 'Painting the island…');
    this.weather = new Weather(this.scene);
    this.city = buildCity(this);
    this.scene.add(this.city.group);

    this.hud.setLoading(45, 'Parking the traffic…');
    this.vehicles = new VehicleManager(this);
    this.vehicles.spawnTraffic(26);
    this.vehicles.spawnParked(6);
    this.vehicles.spawnBus();
    this.vehicles.spawnBoat(10, 138, { isPlayer: false });
    this.vehicles.spawnBoat(10, 122, { isPlayer: false });
    this.vehicles.spawnHeli(330, 150, { isPlayer: false });

    this.hud.setLoading(65, 'Waking up the city…');
    this.characters = new CharacterManager(this);
    this.characters.spawnPeds(28);
    this.characters.spawnBeachLife();
    this.characters.spawnLaRosa();

    this.hud.setLoading(80, 'Briefing La Rosa…');
    this.missions = new MissionManager(this);
    this.police = new WantedManager(this);
    this.saves = new SaveManager(this);
    this._spawnPickups();

    this._bindInput();
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.hud.setLoading(100, 'Ready.');
    this.hud.hideLoading();
    this.hud.showMenu();
    this.state = 'menu';

    this._last = performance.now();
    const loop = (t) => {
      this._loop(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ground height for the player: terrain + pier deck + bridge decks
  _groundY(x, z) {
    if (x >= 6 && x <= 24 && z >= 124 && z <= 136) return 0.5; // pier planks
    if (Math.abs(x - 278) < 20 && (Math.abs(z - 39) < 6 || Math.abs(z - 247) < 6)) return 0.7; // bridges
    return groundHeight(x, z);
  }

  _spawnPickups() {
    // a little cash lying around the city for the player to find
    const spots = [
      [52, 78], [104, 52], [182, 130], [221, 91], [78, 208], [156, 221],
      [39, 195], [247, 117], [91, 247], [130, 26], [208, 182], [65, 143],
      [143, 65], [234, 234], [26, 78], [104, 104], [182, 208], [117, 169],
    ];
    for (const [x, z] of spots) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.1, 0.35),
        new THREE.MeshBasicMaterial({ color: 0x7dff8a }),
      );
      mesh.position.set(x, this._groundY(x, z) + 0.25, z);
      this.scene.add(mesh);
      this._pickups.push({ x, z, amount: randInt(this.rng, 15, 60), mesh, kind: 'cash' });
    }
  }

  _bindInput() {
    const keyMap = {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      KeyF: 'fire', ShiftLeft: 'run', ShiftRight: 'run',
      Space: 'jump', KeyN: 'nitro', KeyB: 'brake',
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') { e.preventDefault(); if (this.state === 'playing') this.hud.showWheel(true); return; }
      if (e.code === 'Space') e.preventDefault();
      this._keys[e.code] = true;
      if (e.code === 'KeyQ') this._pressed.punch = true;
      if (e.code === 'KeyE') this._pressed.enter = true;
      if (e.code === 'KeyX') this._pressed.reload = true;
      if (e.code === 'KeyR') { if (this.audio) this.audio.nextStation(); }
      if (e.code === 'KeyH') { if (this.audio) this.audio.honk(); }
      if (e.code === 'KeyT') this.togglePhone();
      if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
      if (e.code === 'KeyV') this.camDist = this.camDist > 8 ? 6.5 : 11;
      if (e.code === 'Enter') {
        if (this.cutscene) this._finishIntro();
        else if (this.state === 'trailer') this._endTrailer();
      }
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
        const step = this.missions && this.missions.current ? this.missions.step : null;
        if (step && step.type === 'buy' && this.player && dist2d(this.player.x, this.player.z, PLACES.dealer.x, PLACES.dealer.y) < 30) {
          this.buyCar(e.code === 'Digit1' ? 'sedan' : e.code === 'Digit2' ? 'truck' : 'sport');
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
    });
    const cv = this.renderer.domElement;
    let lx = 0, ly = 0;
    cv.addEventListener('pointerdown', (e) => {
      this.mouseDown = true; lx = e.clientX; ly = e.clientY;
      if (this.cutscene) this._finishIntro();
      else if (this.state === 'trailer') this._endTrailer();
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.mouseDown) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      this.camYaw -= dx * 0.005;
      this.camPitch = clamp(this.camPitch + dy * 0.003, 0.05, 0.9);
      this.camAutoT = 0;
    });
    window.addEventListener('pointerup', () => { this.mouseDown = false; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 1.2, 4, 14);
    }, { passive: false });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.togglePause();
    });
  }

  // ---- game flow ------------------------------------------------------------
  startNewGame(charId) {
    this.selectedChar = charId || 'jax';
    this.state = 'playing';
    this.paused = false;
    this.phoneOpen = false;
    this.standing = { marina: 0, downtown: 0, neon: 0, beach: 0 };
    this.rank = 0;
    this.ownedCars = [];
    this.businesses = {};
    this.items = {};
    this._createPlayer(this.selectedChar, 23, 130); // the Docks — dry land by the pier
    const p = this.player;
    p.money = 0;
    p.health = 100; p.armor = 0; p.stamina = 100;
    p.weapons = { fists: { mag: 0, reserve: 0 } };
    p.weapon = 'fists'; p.magAmmo = 0;
    p.dead = false; p.deadT = 0;
    this.missions.nextIdx = 0;
    this.missions.current = null;
    this.missions.stepIdx = 0;
    this.police.clearWanted('new game');
    if (this.weather) this.weather.setTime(12);
    this.camYaw = Math.PI / 2;
    this.camPitch = 0.32;
    this.camDist = 6.5;
    this.hud.hideMenu();
    if (this.audio) { this.audio.unlock(); this.audio.missionStart(); }
    this.missions.startMission(1);
    this._startIntroCutscene();
  }

  _startIntroCutscene() {
    this.cutscene = true;
    this.cutsceneT = 0;
    this.state = 'cutscene';
  }

  _finishIntro() {
    if (!this.cutscene) return;
    this.cutscene = false;
    this.cutsceneT = 0;
    if (this.state === 'cutscene') this.state = 'playing';
    if (this.hud) this.hud.hideLoading();
  }

  loadGame(slot) {
    const data = this.saves.load(slot);
    if (!data) { this.hud.notify('No save in that slot.'); return; }
    this.selectedChar = data.charId || 'jax';
    this.state = 'playing';
    this.paused = false;
    this._createPlayer(this.selectedChar, data.x || 23, data.z || 130);
    const p = this.player;
    p.heading = data.heading || 0;
    p.health = data.health !== undefined ? data.health : 100;
    p.armor = data.armor || 0;
    p.stamina = data.stamina !== undefined ? data.stamina : 100;
    p.money = data.money || 0;
    p.weapons = data.weapons || { fists: { mag: 0, reserve: 0 } };
    p.weapon = data.weapon || 'fists';
    p.magAmmo = p.weapons[p.weapon] ? p.weapons[p.weapon].mag : 0;
    p.stats = data.stats || { drive: 0, shoot: 0 };
    this.standing = data.standing || { marina: 0, downtown: 0, neon: 0, beach: 0 };
    this.rank = data.rank || 0;
    this.businesses = data.businesses || {};
    this.ownedCars = data.ownedCars || [];
    if (data.missions) this.missions.restore(data.missions);
    if (this.weather && data.time !== undefined) {
      this.weather.day = data.day || 1;
      this.weather.setTime(data.time);
      if (data.weatherKind) this.weather.kind = data.weatherKind;
    }
    if (this.audio && data.station !== undefined) this.audio.stationIdx = data.station;
    this.hud.hideMenu();
    this.hud.notify(`Loaded slot ${slot} — welcome back to La Vega.`);
    this._finishIntro();
  }

  saveGame(auto = false, slot = 1) {
    if (!this.player) return false;
    // keep the live car's condition in the garage record
    if (this.vehicles.playerCar) {
      const live = this.vehicles.playerCar;
      const rec = this.ownedCars.find((c) => c.specKey === live.specKey);
      if (rec) { rec.cond = Math.round(live.cond); rec.fuel = Math.round(live.fuel); }
    }
    return this.saves.save(slot, auto);
  }

  quitToMenu() {
    this.state = 'menu';
    this.paused = false;
    this.phoneOpen = false;
    this.cutscene = false;
    if (this.vehicles.playerCar) this.vehicles.exitCar();
    this.hud.showMenu();
    this.hud.notify('Back at the menu — La Vega waits.');
  }

  togglePause() {
    if (this.state === 'playing' && !this.paused) {
      this.paused = true;
      this.state = 'paused';
      this.hud.showPause(true);
    } else if (this.state === 'paused') {
      this.paused = false;
      this.state = 'playing';
      this.hud.showPause(false);
    }
  }

  togglePhone() {
    if (this.state !== 'playing') return;
    this.phoneOpen = !this.phoneOpen;
    if (this.player) this.player.phoneOpen = this.phoneOpen;
    this.hud.showPhone(this.phoneOpen);
  }

  playTrailer() {
    this.hud.hideMenu();
    this.state = 'trailer';
    this.trailerT = 0;
    if (this.audio) this.audio.unlock();
  }

  _endTrailer() {
    if (this.state !== 'trailer') return;
    this.state = this.player ? 'playing' : 'menu';
    if (!this.player) this.hud.showMenu();
  }

  buyCar(specKey) {
    const spec = CAR_MODELS[specKey];
    if (!spec || !this.player) return;
    if (this.player.money < spec.price) {
      this.hud.notify(`Not enough cash — a ${spec.name} costs $${spec.price}.`);
      return;
    }
    this.player.money -= spec.price;
    const color = pick(this.rng, spec.colors);
    this.ownedCars.push({ specKey, color, cond: 100, fuel: 100 });
    // the car is parked at Manny's Garage, ready to collect
    this.vehicles.makeCar(specKey, 78 + rand(this.rng, -4, 4), 168 + rand(this.rng, -2, 2), {
      isParked: true, heading: Math.PI, color,
    });
    if (this.audio) this.audio.cash();
    this.hud.notify(`${spec.name} is yours — parked at Manny's Garage.`);
    this.missions.onCarBought();
    this.saveGame(true, 1);
  }

  takeOutCar(i) {
    const rec = this.ownedCars[i];
    if (!rec || !this.player) return;
    const x = this.player.x + Math.sin(this.player.heading + Math.PI / 2) * 4;
    const z = this.player.z + Math.cos(this.player.heading + Math.PI / 2) * 4;
    const car = this.vehicles.makeCar(rec.specKey, x, z, { color: rec.color, heading: this.player.heading });
    car.cond = rec.cond; car.fuel = rec.fuel;
    this._enterCar(car);
    this.hud.notify(`${CAR_MODELS[rec.specKey].name} — out of the garage.`);
  }

  // ---- the player -----------------------------------------------------------
  _createPlayer(charId, x, z) {
    if (this.player && this.player.group && this.player.group.parent) {
      this.player.group.parent.remove(this.player.group);
    }
    const char = this.characters.createPlayerCharacter(charId);
    this._normalizeCharacter(char, charId === 'maya' ? 1.70 : 1.81);
    const p = {
      game: this,
      x, y: this._groundY(x, z), z,
      heading: Math.PI / 2, speed: 0,
      charId, money: 0, health: 100, armor: 0, stamina: 100,
      weapons: { fists: { mag: 0, reserve: 0 } },
      weapon: 'fists', magAmmo: 0,
      inCar: false, inBoat: false, inHeli: false, inInterior: false,
      dead: false, deadT: 0, phoneOpen: false,
      group: char.group, positions: [], stats: { drive: 0, shoot: 0 },
      customShirt: charId === 'maya' ? 0x2a6fd6 : 0xd92038,
      char,
      reloading: false, reloadT: 0, punchT: 0, shootT: 0,
      _exitPos: null, _walkPhase: 0, _action: 'idle',
      giveWeapon: (id, reserve) => {
        const w = WEAPONS[id];
        if (!w) return;
        if (!p.weapons[id]) p.weapons[id] = { mag: w.mag, reserve: 0 };
        p.weapons[id].reserve += reserve || 0;
        p.setWeapon(id);
        if (this.hud) this.hud.updateWeapon();
      },
      setWeapon: (id) => {
        if (!p.weapons[id]) return;
        p.weapon = id;
        p.magAmmo = p.weapons[id].mag;
        if (this.hud) this.hud.updateWeapon();
      },
    };
    char.group.position.set(x, this._groundY(x, z), z);
    char.group.rotation.y = p.heading;
    this.scene.add(char.group);
    this.player = p;
    return p;
  }

  // BUG 1 fix: measure the character's real height in the world and
  // rescale the group so it is exactly the design height. A wrong
  // scale (or a bad model) can never shrink the player to a dot again.
  _normalizeCharacter(char, targetHeight) {
    char.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(char.group);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y < 0.05) return;
    const s = targetHeight / size.y;
    if (Math.abs(s - 1) > 0.005) char.group.scale.setScalar(s);
    char.group.updateMatrixWorld(true);
  }

  // ---- NPC hooks ------------------------------------------------------------
  onNPCAttack(npc, dmg) {
    if (!this.player || this.player.dead) return;
    this._damagePlayer(dmg);
  }

  onNPCDeath(npc) {
    if (!this.player) return;
    // a little cash on the body, auto-collected when walked over
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 0.35),
      new THREE.MeshBasicMaterial({ color: 0x7dff8a }),
    );
    mesh.position.set(npc.x, this._groundY(npc.x, npc.z) + 0.25, npc.z);
    this.scene.add(mesh);
    this._pickups.push({ x: npc.x, z: npc.z, amount: randInt(this.rng, 10, 50), mesh, kind: 'cash' });
    if (npc.kind === 'ped') this.police.addHeat(1, 'ped down');
    else if (npc.kind === 'cop') this.police.addHeat(2, 'cop down');
  }

  _damagePlayer(amount) {
    const p = this.player;
    if (!p || p.dead) return;
    let left = amount;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, left);
      p.armor -= absorbed;
      left -= absorbed;
    }
    p.health -= left;
    if (this.hud) this.hud.flashDamage();
    if (this.audio) this.audio.crash(0.4);
    if (p.health <= 0) {
      p.health = 0;
      p.dead = true;
      p.deadT = 0;
      p.char.setPose('dead');
    }
  }

  // ---- entering / exiting cars, boats, interiors ----------------------------
  _nearestCar(maxD) {
    let best = null, bestD = maxD;
    for (const c of this.vehicles.cars) {
      if (c.dead) continue;
      const d = dist2d(this.player.x, this.player.z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  _enterCar(car) {
    const p = this.player;
    if (car.isTraffic && car.speed > 0.5) {
      // carjacking a moving car: the driver bails, the heat is on
      this.police.addHeat(1, 'carjacking');
      if (this.audio) this.audio.alarm();
      this.hud.notify('Carjacked! The LVPD is on you.');
    } else if (car.isParked && !this.ownedCars.some((c) => c.specKey === car.specKey && c.cond === Math.round(car.cond))) {
      // stealing a parked car that is not the player's own
      const owned = this.ownedCars.some((c) => c.specKey === car.specKey);
      if (!owned) {
        this.police.addHeat(1, 'stolen car');
        car.alarmOn = true;
        if (this.audio) this.audio.alarm();
      }
    }
    this.vehicles.enterCar(car);
    p.inCar = true;
    p.group.visible = false;
    this.police.onPlayerEnterCar(car);
    this.missions.onCarEntered();
    this.camDist = 9.5;
  }

  _exitCar() {
    const car = this.vehicles.exitCar();
    if (!car) return;
    const p = this.player;
    p.inCar = false;
    p.group.visible = true;
    const side = 2.2;
    p.x = car.x + Math.cos(car.heading) * side;
    p.z = car.z - Math.sin(car.heading) * side;
    p.y = this._groundY(p.x, p.z);
    p.heading = car.heading;
    p._exitPos = { x: p.x, z: p.z };
    p.group.position.set(p.x, p.y, p.z);
    this.camDist = 6.5;
    // sync the garage record
    const rec = this.ownedCars.find((c) => c.specKey === car.specKey);
    if (rec) { rec.cond = Math.round(car.cond); rec.fuel = Math.round(car.fuel); }
  }

  _interact() {
    const p = this.player;
    if (!p || p.dead) return;
    if (p.inCar) {
      // at the gas station with an empty-ish tank? refuel instead of exiting
      const car = this.vehicles.playerCar;
      if (car && car.fuel < 95 && dist2d(car.x, car.z, 30, 206) < 12) {
        if (p.money >= 20) {
          p.money -= 20;
          car.refuel();
          if (this.audio) this.audio.cash();
          this.hud.notify('Tank full — $20 at Petro Vega.');
        } else {
          this.hud.notify('Not enough cash for fuel ($20).');
        }
        return;
      }
      this._exitCar(); return;
    }
    if (p.inBoat) {
      const boat = this.vehicles.playerBoat;
      p.inBoat = false;
      if (boat) {
        boat.isPlayer = false;
        this.vehicles.playerBoat = null;
        p.x = 18; p.z = clamp(boat.z, 10, 250); p.y = this._groundY(p.x, p.z);
        p.group.position.set(p.x, p.y, p.z);
        p.group.visible = true;
      }
      return;
    }
    if (p.inHeli) {
      const heli = this.vehicles.playerHeli;
      if (heli && heli.y > this._groundY(heli.x, heli.z) + 3) {
        this.hud.notify('Land the helicopter first — release JUMP to descend.');
        return;
      }
      p.inHeli = false;
      if (heli) {
        heli.isPlayer = false;
        this.vehicles.playerHeli = null;
        p.x = heli.x; p.z = heli.z; p.y = this._groundY(p.x, p.z);
        p.group.position.set(p.x, p.y, p.z);
        p.group.visible = true;
      }
      return;
    }
    // near a car? get in
    const car = this._nearestCar(3.2);
    if (car) { this._enterCar(car); return; }
    // near a parked boat or helicopter?
    for (const boat of this.vehicles.boats) {
      if (!boat.isPlayer && dist2d(p.x, p.z, boat.x, boat.z) < 3.5) {
        boat.isPlayer = true;
        this.vehicles.playerBoat = boat;
        p.inBoat = true;
        p.group.visible = false;
        this.hud.notify('Speedboat — hold GAS to sail.');
        return;
      }
    }
    for (const heli of this.vehicles.helis) {
      if (!heli.isPlayer && dist2d(p.x, p.z, heli.x, heli.z) < 4) {
        heli.isPlayer = true;
        this.vehicles.playerHeli = heli;
        p.inHeli = true;
        p.group.visible = false;
        this.hud.notify('Helicopter — hold JUMP to climb.');
        return;
      }
    }
    // near an interior door?
    if (this._interiorNear) {
      const place = this._interiorNear;
      if (place.id === 'dealer') { this.hud.showDealer(); return; }
      if (place.id === 'garage') { this.hud.showGarage(); return; }
      if (place.id === 'gunShop') { this.hud.showWheel(true); return; }
      if (place.id === 'club' && !this.missions.current) { this.missions.talkToLaRosa(); return; }
      if (place.id === 'gas') {
        const pc = this.vehicles.playerCar;
        this.hud.notify('Petro Vega — fuel up your car here. (Drive a car in and press E.)');
        return;
      }
      this.hud.notify(`Inside ${place.name} — nothing to do here right now.`);
      return;
    }
    // near the club with no mission? talk to La Rosa
    if (dist2d(p.x, p.z, PLACES.club.x, PLACES.club.y) < 14 && !this.missions.current) {
      this.missions.talkToLaRosa();
    }
  }

  // dossier / trailer helper: put the player somewhere photogenic
  stageShot(kind) {
    if (!this.player) return;
    const p = this.player;
    if (this.weather) this.weather.setGoldenHour();
    if (kind === 'beach') { p.x = 24; p.z = 78; }
    else if (kind === 'harbor') { p.x = 24; p.z = 130; }
    else { p.x = 156; p.z = 91; }
    p.y = this._groundY(p.x, p.z);
    p.heading = Math.PI / 2;
    p.group.position.set(p.x, p.y, p.z);
    this.camYaw = p.heading;
    this.camPitch = 0.3;
    this.camDist = 7;
    this.police.setWanted(3, 'dossier');
    if (this.hud) this.hud.updateMissionPanel();
  }

  // ---- the loop ---------------------------------------------------------------
  _loop(t) {
    const now = t || performance.now();
    let frame = (now - this._last) / 1000;
    this._last = now;
    frame = Math.min(frame, 0.1);
    if (!this.paused) {
      this._acc += frame;
      let n = 0;
      while (this._acc >= STEP && n < 5) {
        this.update(STEP);
        this._acc -= STEP;
        n++;
      }
      if (n === 5) this._acc = 0;
    }
    if (this.renderer) this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    // the ambient world always runs — menu backdrop, cutscene, trailer, game
    if (this.weather) {
      this.weather.update(dt, this.player ? { x: this.player.x, z: this.player.z } : { x: 130, z: 130 });
    }
    this.trafficT -= dt;
    if (this.trafficT <= 0) { this.trafficT = 6; this.trafficRed = !this.trafficRed; }
    if (this.city) { this.city.updatePoles(dt); this.city.updateSea(dt); }
    if (this.vehicles) this.vehicles.update(dt);
    if (this.characters) this.characters.update(dt);
    if (this.state === 'menu') {
      this._updateMenuCamera(dt);
      if (this.hud) this.hud.update(dt);
      return;
    }
    if (this.state === 'trailer') {
      this._updateTrailer(dt);
      if (this.hud) this.hud.update(dt);
      return;
    }
    if (this.state === 'cutscene') {
      this.cutsceneT += dt;
      this._updateCutscene(dt);
      if (this.cutsceneT > 6) this._finishIntro();
      if (this.hud) this.hud.update(dt);
      return;
    }
    if (this.state !== 'playing') {
      if (this.hud) this.hud.update(dt);
      return;
    }
    // ---- playing ----
    this._mergeInput();
    this._updatePlayer(dt);
    if (this.missions) this.missions.update(dt);
    if (this.police) this.police.update(dt);
    if (this.missions && !this.missions.current) this.missions.updateIdleMarker();
    this._updateCamera(dt);
    this._updatePickups(dt);
    this._updateInteriors(dt);
    if (this.audio) {
      const car = this.vehicles.playerCar;
      this.audio.engine(car ? clamp(Math.abs(car.speed) / car.spec.top, 0, 1) : 0, !!car);
      const dSea = this.player ? Math.max(0, this.player.x - 15) : 60;
      this.audio.setSeaLevel(clamp(1 - dSea / 60, 0, 1));
    }
    if (this.hud) this.hud.update(dt);
    this._pressed.punch = false;
    this._pressed.enter = false;
    this._pressed.reload = false;
  }

  _mergeInput() {
    const k = this._keys, t = this.input.touch;
    const joyX = t.mx || 0, joyY = t.mz || 0;
    this.input.up = !!k.KeyW || !!k.ArrowUp || !!t.gas || joyY < -0.3;
    this.input.down = !!k.KeyS || !!k.ArrowDown || !!t.brake || joyY > 0.3;
    this.input.left = !!k.KeyA || !!k.ArrowLeft || joyX < -0.3;
    this.input.right = !!k.KeyD || !!k.ArrowRight || joyX > 0.3;
    this.input.jump = !!k.Space || !!t.jump;
    this.input.fire = !!k.KeyF || !!t.fire;
    this.input.aim = !!k.KeyC || !!t.aim;
    this.input.brake = !!k.KeyB || !!t.brake;
    this.input.nitro = !!k.KeyN;
    this.input.run = !!k.ShiftLeft || !!k.ShiftRight || Math.abs(joyY) > 0.85 || Math.abs(joyX) > 0.85;
    this.input.joyX = joyX;
    this.input.joyY = joyY;
  }

  _canWalk(x, z) {
    if (x < 2 || x > 398 || z < 2 || z > 398) return false;
    if (this.city) {
      for (const b of this.city.colliders.boxes) {
        if (x > b.x0 - 0.45 && x < b.x1 + 0.45 && z > b.z0 - 0.45 && z < b.z1 + 0.45) return false;
      }
      for (const c of this.city.colliders.circles) {
        if (dist2d(x, z, c.x, c.z) < c.r + 0.45) return false;
      }
    }
    return true;
  }

  _updatePlayer(dt) {
    const p = this.player;
    if (!p) return;
    if (p.dead) {
      p.deadT += dt;
      if (p.deadT > 3) {
        const bill = Math.min(p.money, Math.floor(p.money * 0.1));
        p.money -= bill;
        p.health = 100; p.armor = 0; p.dead = false; p.deadT = 0;
        p.x = 208; p.z = 52; p.y = this._groundY(208, 52);
        p.heading = 0;
        p.char.setPose('idle');
        p.group.position.set(p.x, p.y, p.z);
        this.police.clearWanted('hospital');
        this.hud.notify(`You woke up at La Vega General — hospital bill $${bill}.`);
      }
      return;
    }
    p.punchT = Math.max(0, p.punchT - dt);
    p.shootT = Math.max(0, p.shootT - dt);
    if (p.reloading) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        p.reloading = false;
        const w = p.weapons[p.weapon];
        const spec = WEAPONS[p.weapon];
        if (w && spec && spec.mag > 0) {
          const need = spec.mag - w.mag;
          const take = Math.min(need, w.reserve);
          w.mag += take; w.reserve -= take;
          p.magAmmo = w.mag;
        }
        if (this.hud) this.hud.updateWeapon();
      }
    }
    const moving = this.input.up || this.input.down || this.input.left || this.input.right;
    const running = this.input.run && moving;
    if (running && p.stamina > 0) p.stamina = Math.max(0, p.stamina - 12 * dt);
    else p.stamina = Math.min(100, p.stamina + 8 * dt);

    if (p.inCar) { this._updatePlayerInCar(dt); return; }
    if (p.inBoat) {
      this.vehicles.updateBoat(dt);
      const b = this.vehicles.playerBoat;
      if (b) { p.x = b.x; p.z = b.z; p.y = 0.02; p.heading = b.heading; p.group.position.set(p.x, p.y, p.z); }
      return;
    }
    if (p.inHeli) {
      this.vehicles.updateHeli(dt);
      const h = this.vehicles.playerHeli;
      if (h) { p.x = h.x; p.z = h.z; p.y = h.y; p.heading = h.heading; p.group.position.set(p.x, p.y, p.z); }
      return;
    }

    // --- on foot ---
    const speed = (running && p.stamina > 0 ? PLAYER.run : PLAYER.walk);
    const fwdX = Math.sin(this.camYaw), fwdZ = Math.cos(this.camYaw);
    const rightX = -Math.cos(this.camYaw), rightZ = Math.sin(this.camYaw);
    let mx = 0, mz = 0;
    if (this.input.up) { mx += fwdX; mz += fwdZ; }
    if (this.input.down) { mx -= fwdX; mz -= fwdZ; }
    if (this.input.right) { mx += rightX; mz += rightZ; }
    if (this.input.left) { mx -= rightX; mz -= rightZ; }
    const jx = this.input.joyX || 0, jy = this.input.joyY || 0;
    mx += rightX * jx - fwdX * jy;
    mz += rightZ * jx - fwdZ * jy;
    const len = Math.hypot(mx, mz);
    // hop (jump): a little vertical bounce, no physics engine
    if (p._hopV === undefined) { p._hopV = 0; p._hopY = 0; }
    if (this.input.jump && p._hopY <= 0.01) p._hopV = 4.5;
    p._hopV -= 12 * dt;
    p._hopY = Math.max(0, p._hopY + p._hopV * dt);
    if (len > 0.01) {
      mx /= Math.max(1, len); mz /= Math.max(1, len);
      const targetHeading = Math.atan2(mx, mz);
      p.heading = angleLerp(p.heading, targetHeading, Math.min(1, dt * 10));
      const nx = p.x + mx * speed * dt;
      const nz = p.z + mz * speed * dt;
      if (this._canWalk(nx, nz)) { p.x = nx; p.z = nz; }
      p.speed = speed;
      p._walkPhase += dt * speed * 1.6;
      p.char.setWalk(p._walkPhase, 1);
      p._action = 'walk';
      this.camAutoT += dt;
      if (this.camAutoT > 2.5) this.camYaw = angleLerp(this.camYaw, p.heading, Math.min(1, dt * 1.2));
    } else {
      p.speed = 0;
      p.char.setWalk(p._walkPhase, 0);
      if (p.punchT <= 0 && !this.aiming) p.char.setPose('idle');
      p._action = 'idle';
    }
    p.y = this._groundY(p.x, p.z) + p._hopY;
    p.group.position.set(p.x, p.y + p.char.bob, p.z);
    p.group.rotation.y = p.heading;
    p.positions.push({ x: p.x, z: p.z });
    if (p.positions.length > 40) p.positions.shift();

    this.aiming = !!this.input.aim && p.weapon !== 'fists';
    if (this.aiming) p.char.setPose('aim');
    if (this._pressed.punch) this._punch();
    if (this._pressed.enter) this._interact();
    if (this._pressed.reload) this._startReload();
    if (this.input.fire) this._shoot();
  }

  _updatePlayerInCar(dt) {
    const p = this.player;
    const car = this.vehicles.playerCar;
    if (!car) { p.inCar = false; return; }
    p.x = car.x; p.z = car.z; p.y = car.y;
    p.heading = car.heading;
    p.speed = car.speed;
    p.stats.drive += Math.abs(car.speed) * dt;
    p.group.position.set(p.x, p.y, p.z);
    p.group.rotation.y = p.heading;
    if (this._pressed.enter) this._interact();
    if (car.cond <= 0) {
      this.hud.notify('Your car is wrecked.');
      this._exitCar();
    }
  }

  _punch() {
    const p = this.player;
    if (p.punchT > 0 || p.inCar) return;
    p.punchT = 0.4;
    p.char.setPose('punch');
    if (this.audio) this.audio.punch();
    for (const npc of this.characters.npcs) {
      if (npc.dead) continue;
      const d = dist2d(p.x, p.z, npc.x, npc.z);
      if (d > PLAYER.punchRange) continue;
      const ang = Math.atan2(npc.x - p.x, npc.z - p.z);
      const diff = Math.abs(((ang - p.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > 0.9) continue;
      npc.damage(PLAYER.punchDamage);
      return;
    }
    const car = this._nearestCar(PLAYER.punchRange + 1);
    if (car) {
      car.cond = Math.max(0, car.cond - 5);
      if (this.audio) this.audio.crash(0.2);
    }
  }

  _shoot() {
    const p = this.player;
    if (p.inCar || p.weapon === 'fists' || p.shootT > 0 || p.reloading) return;
    const w = p.weapons[p.weapon];
    const spec = WEAPONS[p.weapon];
    if (!w || !spec) return;
    if (w.mag <= 0) {
      if (this.audio) this.audio.dryFire();
      this._startReload();
      return;
    }
    p.shootT = spec.interval;
    w.mag--; p.magAmmo = w.mag;
    p.stats.shoot++;
    if (this.audio) this.audio.shoot();
    p.char.setPose('aim');
    const aimDir = this.aiming ? this.camYaw : p.heading;
    let best = null, bestD = spec.range;
    for (const npc of this.characters.npcs) {
      if (npc.dead) continue;
      const d = dist2d(p.x, p.z, npc.x, npc.z);
      if (d > spec.range) continue;
      const ang = Math.atan2(npc.x - p.x, npc.z - p.z);
      const diff = Math.abs(((ang - aimDir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > 0.22) continue;
      if (d < bestD) { bestD = d; best = npc; }
    }
    if (best) {
      best.damage(spec.damage);
      for (const npc of this.characters.npcs) {
        if (!npc.dead && npc !== best && npc.state !== 'chase' && dist2d(p.x, p.z, npc.x, npc.z) < 25) npc.panic();
      }
    } else {
      for (const car of this.vehicles.cars) {
        const d = dist2d(p.x, p.z, car.x, car.z);
        if (d > spec.range) continue;
        const ang = Math.atan2(car.x - p.x, car.z - p.z);
        const diff = Math.abs(((ang - aimDir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (diff > 0.22) continue;
        car.cond = Math.max(0, car.cond - spec.damage * 0.5);
        if (car.cond <= 0) { car.dead = true; car.speed = 0; }
        break;
      }
    }
    // gunfire near a cop draws heat
    let copNear = false;
    for (const npc of this.characters.npcs) {
      if (!npc.dead && npc.kind === 'cop' && dist2d(p.x, p.z, npc.x, npc.z) < 40) { copNear = true; break; }
    }
    if (copNear) this.police.addHeat(1, 'shots fired');
    if (this.hud) this.hud.updateWeapon();
  }

  _startReload() {
    const p = this.player;
    const w = p.weapons[p.weapon];
    const spec = WEAPONS[p.weapon];
    if (!w || !spec || spec.mag === 0 || p.reloading) return;
    if (w.mag >= spec.mag || w.reserve <= 0) return;
    p.reloading = true;
    p.reloadT = spec.reload;
    if (this.audio) this.audio.reload();
  }

  // ---- camera (BUG 1 fix: close follow, closer in portrait) ---------------
  _updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    const portrait = this.camera.aspect < 1;
    const distScale = portrait ? 0.9 : 1;
    const dist = (this.aiming ? 4 : this.camDist) * distScale;
    const height = dist * Math.tan(this.camPitch) + 1.4;
    const anchor = p.inCar && this.vehicles.playerCar ? this.vehicles.playerCar : p;
    if (p.inCar && this.vehicles.playerCar) {
      this.camYaw = angleLerp(this.camYaw, this.vehicles.playerCar.heading, Math.min(1, dt * 2.5));
    }
    const cx = anchor.x - Math.sin(this.camYaw) * dist;
    const cz = anchor.z - Math.cos(this.camYaw) * dist;
    const cy = Math.max(anchor.y + height, this._groundY(cx, cz) + 0.6);
    const k = Math.min(1, dt * 8);
    this.camera.position.x = lerp(this.camera.position.x, cx, k);
    this.camera.position.y = lerp(this.camera.position.y, cy, k);
    this.camera.position.z = lerp(this.camera.position.z, cz, k);
    this.camera.lookAt(anchor.x, anchor.y + 1.5, anchor.z);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
  }

  _updateMenuCamera(dt) {
    this._menuAngle += dt * 0.05;
    const r = 190;
    this.camera.position.set(130 + Math.cos(this._menuAngle) * r, 70, 130 + Math.sin(this._menuAngle) * r);
    this.camera.lookAt(130, 0, 130);
  }

  _updateCutscene(dt) {
    const p = this.player;
    const t = Math.min(1, this.cutsceneT / 5);
    const ex = p ? p.x - Math.sin(p.heading) * 7 : 23;
    const ez = p ? p.z - Math.cos(p.heading) * 7 : 123;
    const x = lerp(-40, ex, t), z = lerp(130, ez, t);
    const y = lerp(14, 4.5, t);
    this.camera.position.set(x, y, z);
    if (p) this.camera.lookAt(p.x, p.y + 1.2, p.z);
    else this.camera.lookAt(130, 0, 130);
  }

  _updateTrailer(dt) {
    this.trailerT += dt;
    const pts = [
      [-30, 20, 60], [60, 14, 200], [200, 18, 240], [260, 16, 120],
      [130, 22, 30], [40, 10, 130],
    ];
    const total = 24;
    const t = (this.trailerT % total) / total;
    const seg = t * pts.length;
    const i = Math.floor(seg) % pts.length;
    const j = (i + 1) % pts.length;
    const f = seg - Math.floor(seg);
    const a = pts[i], b = pts[j];
    this.camera.position.set(lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f));
    this.camera.lookAt(130, 0, 130);
    if (this.trailerT > total) this._endTrailer();
  }

  _updatePickups(dt) {
    const p = this.player;
    if (!p) return;
    for (let i = this._pickups.length - 1; i >= 0; i--) {
      const pk = this._pickups[i];
      pk.mesh.rotation.y += dt * 2;
      if (dist2d(p.x, p.z, pk.x, pk.z) < 1.6) {
        p.money += pk.amount;
        if (this.audio) this.audio.cash();
        this.hud.notify(`+$${pk.amount} found.`);
        this.scene.remove(pk.mesh);
        this._pickups.splice(i, 1);
      }
    }
  }

  _updateInteriors(dt) {
    const p = this.player;
    if (!p || p.inCar || !this.city) { this._interiorNear = null; return; }
    let best = null, bestD = 3;
    for (const it of this.city.interiors) {
      const d = dist2d(p.x, p.z, it.x, it.z);
      if (d < bestD) { bestD = d; best = it; }
    }
    this._interiorNear = best;
    if (best) {
      if (this.currentPrompt !== best.id) {
        this.currentPrompt = best.id;
        const action = best.id === 'dealer' ? 'Browse cars' : best.id === 'garage' ? 'Garage' : best.id === 'gunShop' ? 'Buy weapons' : best.id === 'club' ? 'Talk to La Rosa' : `Enter ${best.name}`;
        this.hud.showPrompt(`[E] ${action}`);
      }
      return;
    }
    const car = this._nearestCar(3.2);
    if (car) {
      if (this.currentPrompt !== 'car') {
        this.currentPrompt = 'car';
        const name = CAR_MODELS[car.specKey] ? CAR_MODELS[car.specKey].name : 'car';
        this.hud.showPrompt(`[E] Get in the ${name}`);
      }
      return;
    }
    if (this.currentPrompt) {
      this.currentPrompt = null;
      this.hud.hidePrompt();
    }
  }
}
