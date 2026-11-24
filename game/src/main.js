// La Vega 3D — Game: boot, loop, camera, input, interactions, shops,
// interiors, taxi jobs, collectibles, stunts, crew abilities, random events,
// animals, trailer, save/load. Written in this session for the recorded build.
import * as THREE from 'three';
import { STEP, WORLD, PLACES, PLACE_DIMS, ROADS, CAR_MODELS, CAR_CATALOG, WEAPONS, DISTRICTS } from './config.js';
import { settings, effectiveControlMode } from './settings.js';
import { loadModels, loadBuyCar, MODELS } from './loader.js';
import { buildCity, groundHeight, isInRiver, isSea } from './city.js';
import { Weather } from './weather.js';
import { VehicleManager } from './vehicles.js';
import { Player, CharacterManager, NPC } from './characters.js';
import { WantedManager } from './police.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { SaveManager } from './save.js';
import { mulberry32, clamp, damp, dist2d, rand, pick } from './rng.js';

const INTERIOR_KEYS = ['club', 'bank', 'jewelry', 'minimarket', 'gunShop', 'safehouse', 'garage', 'workshop', 'restaurant', 'clotheshop', 'salon', 'tattoo', 'mall', 'hospital', 'station', 'dealer'];

export class Game {
  constructor() {
    this.rng = mulberry32((Date.now() % 2147483647) || 12345);
    this.state = 'menu'; // menu | playing | trailer
    this.paused = false;
    this.phoneOpen = false;
    this.cutsceneT = 0;
    this.shake = 0;
    this.trafficRed = false;
    this.trafficT = 0;
    this.selectedChar = 'jax';
    this.standing = { marina: 0, downtown: 0, neon: 0, south: 0 };
    this.rank = 0;
    this.ownedCars = [];
    // Buyable businesses (P17-E): Neon Bar $2,000 +$50/h, Manny's shares
    // $1,500 +$35/h, Beach House $1,200 (second safehouse).
    this.businesses = { neonBar: false, garageShares: false, beachHouse: false };
    this.items = { snack: 2, armor: 0 };
    this.crewCd = { plates: 0, fix: 0, eyes: 0 };
    this.safeCd = 0;
    this.eventT = 75;
    this.promptT = 0;
    this.currentPrompt = null;
    this.trailerT = 0;
    this.downT = 0;
    this.taxi = null;
    this.dog = null;
    this.collectibles = [];
    this.stunts = [];
    this.birds = [];
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 8;
    this.camAutoT = 0;
    this.mouseDown = false;
    this.input = {
      keys: {},
      aim: false, // right-mouse hold (PC) = aim down sights
      touch: { mx: 0, mz: 0, jump: false, punch: false, fire: false, enter: false, gas: false, brake: false, aim: false },
    };
    this._last = performance.now();
    this._acc = 0;
  }

  // -- boot --------------------------------------------------------------------
  async boot() {
    const hud = this.hud = new HUD(this);
    const audio = this.audio = new AudioSys(settings);
    audio.setMuted(settings.get('mute'));
    hud.setLoading(5, 'Starting renderer…');
    // Renderer.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // CE-style filmic look: ACES tone mapping (1 line, big night-neon effect).
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    document.body.appendChild(this.renderer.domElement);
    this.applyQuality();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87c5e8, 180, 700);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
    this.camera.position.set(130, 90, 320);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    // Lazy-load safety: never hang the loading screen forever.
    const bootTimeout = setTimeout(() => {
      hud.setLoading(100, 'Still loading — slow connection. The game will start with procedural fallbacks.');
    }, 20000);
    try {
      hud.setLoading(15, 'Loading models (Quaternius CC0)…');
      // Models load with per-file fallback; a timeout still boots the game.
      await Promise.race([
        loadModels('models/'),
        new Promise((res) => setTimeout(res, 25000)),
      ]);
      hud.setLoading(55, 'Building La Vega…');
      this.weather = new Weather(this.scene);
      this.city = buildCity(this.scene, MODELS);
      this.vehicles = new VehicleManager(this);
      this.characters = new CharacterManager(this);
      this.police = new WantedManager(this);
      this.missions = new MissionManager(this);
      this.saves = new SaveManager(this);
      hud.setLoading(70, 'Spawning the city…');
      this.player = new Player(this);
      await this.player.build();
      await this.characters.build();
      this.vehicles.spawnTraffic(24);
      this.vehicles.spawnParked(14);
      this.vehicles.spawnDealerLot(); // Auto Palms display cars (mission 8)
      this.vehicles.spawnBus();
      this.vehicles.spawnBoats();
      this.vehicles.spawnHeli(320, 130); // airport heli, on the tarmac
      // Motorbikes, vans + emergency vehicles parked around town.
      this.vehicles.spawn('motor', 150, 100, Math.PI / 2, { parked: true });
      this.vehicles.spawn('motor', 60, 120, 0, { parked: true });
      this.vehicles.spawn('motor', 24, 90, Math.PI, { parked: true });
      this.vehicles.spawn('van', 200, 150, 0, { parked: true });
      this.vehicles.spawn('van', 90, 210, Math.PI / 2, { parked: true });
      this.vehicles.spawn('ambulance', PLACES.hospital.x + 8, PLACES.hospital.y + 14, Math.PI / 2, { parked: true });
      this.vehicles.spawn('firetruck', PLACES.station.x + 10, PLACES.station.y - 6, 0, { parked: true });
      this._spawnCollectibles();
      this._spawnBirds();
      this._spawnStunts();
      hud.setLoading(90, 'Warming up the radio…');
      this._bindInput();
      hud.updateMissionPanel();
      clearTimeout(bootTimeout);
      hud.setLoading(100, 'Ready.');
      setTimeout(() => { hud.hideLoading(); hud.showMenu(); }, 250);
    } catch (e) {
      clearTimeout(bootTimeout);
      console.error('Boot error (continuing with fallbacks):', e);
      hud.setLoading(100, 'Loaded with fallbacks — press NEW GAME.');
      setTimeout(() => { hud.hideLoading(); hud.showMenu(); }, 250);
    }
    // Main loop.
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dtMs = Math.min(100, now - this._last);
      this._last = now;
      this._acc += dtMs / 1000;
      let steps = 0;
      while (this._acc >= STEP && steps < 4) {
        this._acc -= STEP;
        steps++;
        this.update(STEP);
      }
      if (steps === 4) this._acc = 0;
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  // -- quality ------------------------------------------------------------------
  applyQuality() {
    if (!this.renderer) return;
    const q = settings.get('quality');
    let level = q;
    if (q === 'auto') level = (window.innerWidth < 700 || effectiveControlMode() === 'touch') ? 'medium' : 'high';
    this.renderer.setPixelRatio(level === 'high' ? Math.min(window.devicePixelRatio, 2) : level === 'medium' ? 1.5 : 1);
    this.renderer.shadowMap.enabled = level !== 'low';
  }

  // -- input ----------------------------------------------------------------------
  _bindInput() {
    const k = this.input.keys;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      k[e.code] = true;
      this.audio.unlock();
      // Skip the trailer / opening cutscene (Enter, Space or Escape).
      if (this.state === 'trailer' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape')) { this._endTrailer(); return; }
      if (this.cutscene?.kind === 'intro' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape')) { this._finishIntro(); return; }
      if (this.state !== 'playing') {
        if (e.code === 'Enter' && this.state === 'menu') this.startNewGame(this.selectedChar);
        return;
      }
      if (this.paused) {
        if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
        return;
      }
      switch (e.code) {
        case 'KeyE': this._interact(); break;
        case 'KeyQ': this.player.punch(); break;
        case 'KeyF': this._tryRobOrShoot(); break;
        case 'KeyX': this.player.reload(); break;
        case 'Tab': e.preventDefault(); this.hud.showWheel(this.hud.wheelEl.classList.contains('hidden')); break;
        case 'KeyT': this.togglePhone(); break;
        case 'KeyP': case 'Escape': this.togglePause(); break;
        case 'KeyM': { const m = !settings.get('mute'); settings.set('mute', m); this.audio.setMuted(m); this.hud.notify(m ? 'Muted.' : 'Sound on.'); break; }
        case 'KeyR': this.hud.notify(`Radio: ${this.audio.nextStation()}`); break;
        case 'KeyV': if (!this.player.inCar && !this.player.inInterior) this.player.switchCharacter(); break;
        case 'KeyH': if (this.player.inCar) this.audio.honk(); break;
        case 'KeyB': this._quickBuy(); break;
        case 'KeyZ': this._crewAbility('plates'); break;
        case 'KeyC': this._crewAbility('fix'); break;
        case 'KeyG': this._crewAbility('eyes'); break;
        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': {
          const ids = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];
          const id = ids[+e.code.slice(-1) - 1];
          if (!this.hud.dealerEl.classList.contains('hidden')) {
            const quick = { 1: 'sedan', 2: 'truck', 3: 'sport' }[+e.code.slice(-1)];
            if (quick) this.buyCar(quick);
          } else if (id) this.player.setWeapon(id);
          break;
        }
      }
    });
    window.addEventListener('keyup', (e) => { k[e.code] = false; });
    // Mouse: drag to orbit, wheel to zoom, click to shoot.
    const cv = this.renderer.domElement;
    cv.addEventListener('mousedown', (e) => { this.mouseDown = true; this._mx = e.clientX; this._my = e.clientY; this.audio.unlock(); });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.mouseDown || this.state !== 'playing') return;
      this.camYaw -= (e.clientX - this._mx) * 0.005;
      this.camPitch = clamp(this.camPitch + (e.clientY - this._my) * 0.003, 0.05, 1.1);
      this._mx = e.clientX; this._my = e.clientY;
      this.camAutoT = 2.5;
    });
    cv.addEventListener('wheel', (e) => { this.camDist = clamp(this.camDist + Math.sign(e.deltaY), 4, 16); }, { passive: true });
    cv.addEventListener('click', () => { if (this.state === 'playing' && !this.paused && !this.player.inCar) this.player.shoot(); });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    // Right mouse hold = aim down sights (ADS): camera pulls in close.
    cv.addEventListener('mousedown', (e) => { if (e.button === 2) this.input.aim = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) this.input.aim = false; });
    // Touch: one finger drags the camera (direct, no inertia — same feel as
    // the mouse drag), two fingers pinch-zoom. Spread = zoom in, pinch = out.
    // (Ported from the Claude reference file: jn *= prevDist/curDist.)
    const swipes = new Map();
    let pinchDist = 0;
    cv.addEventListener('touchstart', (e) => {
      // Tap skips the trailer / opening cutscene (P8/P9).
      if (this.state === 'trailer') { this._endTrailer(); return; }
      if (this.cutscene?.kind === 'intro') { this._finishIntro(); return; }
      for (const t of e.changedTouches) swipes.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (swipes.size >= 2) {
        const pts = [...swipes.values()];
        pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    }, { passive: true });
    cv.addEventListener('touchmove', (e) => {
      if (this.state !== 'playing' || this.paused) return;
      if (swipes.size >= 2) {
        // Pinch zoom: spread fingers = zoom in (camera distance shrinks).
        for (const t of e.changedTouches) {
          if (swipes.has(t.identifier)) swipes.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
        const pts = [...swipes.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchDist > 0 && d > 0) this.camDist = clamp(this.camDist * (pinchDist / d), 4, 16);
        pinchDist = d;
        this.camAutoT = 2.5;
        return;
      }
      // Single finger: direct camera drag, 0.005 rad/px, no inertia.
      for (const t of e.changedTouches) {
        const prev = swipes.get(t.identifier);
        if (!prev) continue;
        this.camYaw -= (t.clientX - prev.x) * 0.005 * settings.get('sensitivity');
        this.camPitch = clamp(this.camPitch + (t.clientY - prev.y) * 0.005 * settings.get('sensitivity'), 0.05, 1.1);
        this.camAutoT = 2.5;
        swipes.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }, { passive: true });
    const endTouch = (e) => {
      for (const t of e.changedTouches) swipes.delete(t.identifier);
      if (swipes.size < 2) pinchDist = 0;
    };
    cv.addEventListener('touchend', endTouch, { passive: true });
    cv.addEventListener('touchcancel', endTouch, { passive: true });
    // Touch enter button (edge-triggered in update via flag).
    this._touchEnterPrev = false;
  }

  _moveInput() {
    const k = this.input.keys, t = this.input.touch;
    return {
      fwd: !!(k.KeyW || k.ArrowUp || t.mz < -0.3 || t.gas),
      back: !!(k.KeyS || k.ArrowDown || t.mz > 0.3 || t.brake),
      left: !!(k.KeyA || k.ArrowLeft || t.mx < -0.3),
      right: !!(k.KeyD || k.ArrowRight || t.mx > 0.3),
      run: !!(k.ShiftLeft || k.ShiftRight),
      jump: !!(k.Space || t.jump),
      handbrake: !!k.Space,
      nitro: !!k.KeyN,
      up: !!k.Space,
      down: !!(k.ShiftLeft || k.ShiftRight),
      aim: !!(this.input.aim || t.aim),
    };
  }

  // -- game flow -------------------------------------------------------------------
  startNewGame(charId) {
    this.audio.unlock();
    this.selectedChar = charId || 'jax';
    this.player.charId = this.selectedChar;
    this.player.money = 0;
    this.player.health = 100;
    this.player.armor = 0;
    this.player.weapons = { fists: { ammo: Infinity, mag: Infinity } };
    this.player.weapon = 'fists';
    this.player.magAmmo = Infinity;
    this.player.giveWeapon('pistol', 0); // pistol unlocks after mission 1
    if (this.player.weapons.pistol) delete this.player.weapons.pistol;
    this.player.x = 104; this.player.z = 65;
    this.player.heading = Math.PI;
    this.player.positions = { jax: { x: 104, z: 65 }, maya: { x: 104, z: 65 } };
    this.player.build();
    // The partner swaps to the protagonist you are NOT playing as.
    this.characters.swapPartner();
    this.police.clearWanted('new game');
    this.missions.nextIdx = 0;
    this.missions.current = null;
    this.standing = { marina: 0, downtown: 0, neon: 0, south: 0 };
    this.rank = 0;
    this.ownedCars = [];
    this.businesses = { neonBar: false, garageShares: false, beachHouse: false };
    this.items = { snack: 2, armor: 0 };
    this.state = 'playing';
    this.paused = false;
    this.hud.hideMenu();
    this.hud.updateMissionPanel();
    // OPENING CUTSCENE (P9): a real 12 s cinematic — the camera sweeps from
    // the ferry at the harbour, along the beach, over downtown, and down to
    // Jax. Skippable with Enter / Space / tap. The mission card + dialogue
    // play AFTER the cutscene (before, the dialogue covered the 3 s dolly
    // and ilham never saw any cutscene at all).
    this.cutscene = { kind: 'intro', dur: 12, cardStage: 0 };
    this.cutsceneT = 12;
    this.hud.showMissionCard('LA VEGA', 'A CITY THAT OWES YOU A LIVING', 'Jax Vega steps off the ferry with one ticket and no cash. (Enter / tap to skip)');
    this.hud.notify('Opening cutscene — Enter or tap to skip.');
  }

  // The intro cutscene camera: ferry -> beach -> downtown -> player.
  _updateIntroCutscene() {
    const f = clamp(1 - this.cutsceneT / 12, 0, 1);
    const wps = [
      { x: -30, y: 12, z: 130, lx: 20, ly: 4, lz: 130 },   // ferry at the harbour
      { x: 24, y: 7, z: 170, lx: 130, ly: 8, lz: 130 },    // along the beach
      { x: 130, y: 42, z: 60, lx: 156, ly: 6, lz: 104 },   // over downtown, the club
      { x: 88, y: 8, z: 65, lx: 104, ly: 1.7, lz: 65 },   // down to Jax, on the road facing downtown
    ];
    const seg = Math.min(wps.length - 2, Math.floor(f * (wps.length - 1)));
    const u = f * (wps.length - 1) - seg;
    const a = wps[seg], b = wps[seg + 1];
    const L = (p, q) => p + (q - p) * u;
    this.camera.position.set(L(a.x, b.x), L(a.y, b.y), L(a.z, b.z));
    this.camera.lookAt(L(a.lx, b.lx), L(a.ly, b.ly), L(a.lz, b.lz));
    // Title card mid-cutscene.
    if (this.cutscene && f > 0.55 && this.cutscene.cardStage === 0) {
      this.cutscene.cardStage = 1;
      this.hud.showMissionCard('ACT I — FRESH OFF THE FERRY', 'LA VEGA', 'La Rosa is waiting at the club. Talk to her to start the first job.');
    }
  }

  // The intro cutscene ends (timer or skip): mission card + dialogue.
  _finishIntro() {
    this.cutsceneT = 0;
    this.cutscene = null;
    // Spawn on the road centre (104,65) with the camera WEST of the player
    // (camYaw -PI/2), so W walks EAST down the open road toward downtown.
    // The old spawn (100,60) was a sidewalk 0.5 m from a building face with
    // the camera north — the first W press walked straight into a wall (P14).
    this.camYaw = -Math.PI / 2;
    this.camAutoT = 0;
    this.hud.showMissionCard('ACT I — FRESH OFF THE FERRY', 'LA VEGA', 'Jax Vega steps off the ferry with one ticket and no cash. La Rosa is waiting at the club.');
    this.hud.showDialogueSequence([
      { who: 'Jax', text: 'One ferry ticket. Zero dollars. One city that owes me a living.' },
      { who: 'La Rosa', text: 'Jax Vega! Baby, you made it. Come see me at the club — I have work for those fast hands.' },
    ]);
    this.hud.notify('Talk to La Rosa at the club (walk to the pink marker, press E).');
  }

  // Stage a shot for the dossier / trailer: positions the player + camera
  // and sets the weather. Presets: 'beach' (golden hour, sea + city),
  // 'downtown' (mission + wanted, dispatch board visible),
  // 'harbor' (dusk, cranes + containers + ship).
  stageShot(preset) {
    const g = this;
    if (g.vehicles.playerCar) g.vehicles.exitCar();
    if (preset === 'beach') {
      g.weather.setGoldenHour();
      g.player.x = 26; g.player.z = 130; g.player.heading = Math.PI / 2;
      g.camYaw = Math.PI * 0.5; g.camDist = 10;
    } else if (preset === 'downtown') {
      g.weather.setTime(17.6); g.weather.kind = 'sun';
      g.player.x = 130; g.player.z = 130; g.player.heading = Math.PI;
      g.police.setWanted(3, 'staging');
      g.camYaw = Math.PI; g.camDist = 12;
    } else if (preset === 'harbor') {
      g.weather.setTime(18.4); g.weather.kind = 'cloud';
      g.player.x = 250; g.player.z = 60; g.player.heading = Math.PI / 2;
      g.camYaw = Math.PI * 0.5; g.camDist = 14;
    }
    g.camPitch = 0.32;
    return preset;
  }

  loadGame(slot) {
    const data = this.saves.load(slot);
    if (!data) { this.hud.notify(`Slot ${slot} is empty.`); return; }
    this.audio.unlock();
    this.player.charId = data.charId || 'jax';
    this.player.x = data.x; this.player.z = data.z; this.player.heading = data.heading || 0;
    this.player.health = data.health ?? 100;
    this.player.armor = data.armor ?? 0;
    this.player.stamina = data.stamina ?? 100;
    this.player.money = data.money ?? 0;
    this.player.weapons = data.weapons || { fists: { ammo: Infinity, mag: Infinity } };
    this.player.weapon = data.weapon || 'fists';
    this.player.setWeapon(this.player.weapon);
    this.standing = data.standing || this.standing;
    this.rank = data.rank || 0;
    this.businesses = data.businesses || { neonBar: false, garageShares: false, beachHouse: false };
    if (data.stats) this.player.stats = data.stats;
    this.weather.day = data.day || 1;
    this.weather.time = data.time ?? 12;
    if (data.weatherKind) this.weather.kind = data.weatherKind;
    if (data.station != null && this.audio) this.audio.stationIdx = data.station;
    this.ownedCars = data.ownedCars || [];
    this.player.build();
    this.characters.swapPartner();
    this.missions.restore(data.missions);
    this.state = 'playing';
    this.paused = false;
    this.hud.hideMenu();
    this.hud.updateMissionPanel();
    this.hud.notify(`Loaded slot ${slot} — welcome back to La Vega.`);
  }

  saveGame(auto = false, slot = 1) {
    if (this.state !== 'playing') return false;
    const ok = this.saves.save(slot, auto);
    if (ok && auto) this.hud.notify('Auto-saved.');
    return ok;
  }

  quitToMenu() {
    this.state = 'menu';
    this.paused = false;
    this.phoneOpen = false;
    this.player.phoneOpen = false;
    this.hud.showPhone(false);
    this.hud.showPause(false);
    this.hud.showMenu();
    if (this.vehicles.playerCar) this.vehicles.exitCar();
  }

  togglePause() {
    if (this.state !== 'playing') return;
    this.paused = !this.paused;
    this.hud.showPause(this.paused);
    this.audio.setMuted(this.paused ? true : settings.get('mute'));
    if (!this.paused) this.audio.setMuted(settings.get('mute'));
  }

  togglePhone() {
    if (this.state !== 'playing' || this.paused) return;
    this.phoneOpen = !this.phoneOpen;
    this.player.phoneOpen = this.phoneOpen;
    this.hud.showPhone(this.phoneOpen);
    if (this.phoneOpen) { this.audio.phoneNotify(); this.audio.bark('greet'); }
  }

  playTrailer() {
    if (this.state === 'trailer') return;
    this.audio.unlock();
    this.state = 'trailer';
    this.trailerT = 26;
    this.hud.hideMenu();
    // Title card + skip hint so the trailer is unmistakable (P8: ilham
    // said there was no trailer — the old one had no title and no skip).
    this.hud.showMissionCard('LA VEGA', 'OFFICIAL TRAILER', 'A cinematic tour of the city. (Enter / tap to skip)');
    this.hud.notify('LA VEGA — official trailer. Press Enter or tap to skip.');
  }

  _endTrailer() {
    this.state = 'menu';
    this.hud.showMenu();
  }

  // -- per-frame ----------------------------------------------------------------------
  update(dt) {
    if (this.state === 'menu') { this._updateMenuCamera(dt); this.weather?.update(dt, { x: 130, z: 130 }); return; }
    if (this.state === 'trailer') { this._updateTrailer(dt); this.weather?.update(dt, { x: 130, z: 130 }); return; }
    if (this.paused) return;
    const p = this.player;
    // Downed / respawn.
    if (p.dead) {
      this.downT -= dt;
      if (this.downT <= 0) this._respawn();
      return;
    }
    // Cooldowns.
    for (const k of Object.keys(this.crewCd)) if (this.crewCd[k] > 0) this.crewCd[k] -= dt;
    if (this.safeCd > 0) this.safeCd -= dt;
    if (this.cutsceneT > 0) this.cutsceneT -= dt;
    // Opening cutscene: scripted camera, the world waits, skippable.
    if (this.cutscene?.kind === 'intro') {
      if (this.cutsceneT > 0) {
        this._updateIntroCutscene();
        this.weather.update(dt, p);
        this.hud.update(dt);
        return;
      }
      this._finishIntro();
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.4);
    if (this.camAutoT > 0) this.camAutoT -= dt;
    // Traffic lights cycle (red ~8s / green ~8s).
    this.trafficT += dt;
    if (this.trafficT > 8) {
      this.trafficT = 0;
      this.trafficRed = !this.trafficRed;
      for (const l of this.city.trafficLights) {
        if (l.red) l.red.visible = this.trafficRed;
        if (l.green) l.green.visible = !this.trafficRed;
      }
    }
    // CE power poles: a car at >= 7 m/s knocks one down (fall + sparks).
    if (this.city.updatePoles) this.city.updatePoles(dt, this.vehicles.cars);
    // Sea + beach animation (foam + wave strips) — without this call the
    // shoreline is a static painted edge (GAP 1 / V1).
    if (this.city.updateSea) this.city.updateSea(dt);
    // Input.
    const input = this._moveInput();
    const t = this.input.touch;
    this.aiming = input.aim && !p.inCar && !p.inBoat && !p.inHeli && !p.inInterior;
    if (t.enter && !this._touchEnterPrev) this._interact();
    this._touchEnterPrev = t.enter;
    if (t.punch) { this.player.punch(); t.punch = false; }
    if (t.fire) this.player.shoot();
    // Player / world updates.
    this.weather.update(dt, p);
    if (p.inInterior) this._updateInterior(dt, input);
    else p.update(dt, input, this.camYaw);
    this.vehicles.update(dt, input);
    this.characters.update(dt, p);
    this.police.update(dt);
    this.missions.update(dt);
    this.missions.updateIdleMarker(); // GPS beam to La Rosa when idle
    this._updateCarNpcHits(dt);
    this._updateCollectibles();
    this._updateStunts();
    this._updateTaxi(dt);
    this._updateEvents(dt);
    this._updateBirds(dt);
    this._updateDog(dt);
    // Engine audio follows speed.
    const car = this.vehicles.playerCar || this.vehicles.playerBoat || this.vehicles.playerHeli;
    this.audio.engine(car ? clamp(Math.abs(car.speed || 0) / 30, 0, 1) : 0, !!car);
    // Surf ambience follows the distance to the shoreline (round 3).
    this.audio.setSeaLevel?.(clamp(1 - Math.max(0, p.x - 15) / 120, 0, 1));
    // Rank from campaign progress.
    this.rank = clamp(Math.floor(this.missions.nextIdx / 2), 0, 5);
    // Business income (P17-E): Neon Bar +$50/h, Manny's shares +$35/h
    // (1 game hour = 60 real seconds, so rate/60 per real second).
    const bizRate = (this.businesses.neonBar ? 50 : 0) + (this.businesses.garageShares ? 35 : 0);
    if (bizRate > 0) this.player.money += bizRate * dt / 60;
    // Drive skill grows while driving.
    if (this.vehicles.playerCar) this.player.stats.drive += dt;
    // Interaction prompt.
    this.promptT -= dt;
    if (this.promptT <= 0) { this.promptT = 0.2; this._updatePrompt(); }
    // Camera + HUD.
    this._updateCamera(dt);
    this.hud.update(dt);
  }

  // -- camera ----------------------------------------------------------------------------
  _updateMenuCamera(dt) {
    const a = performance.now() * 0.00003;
    this.camera.position.set(130 + Math.sin(a) * 190, 95, 130 + Math.cos(a) * 190);
    this.camera.lookAt(130, 0, 130);
  }

  _updateTrailer(dt) {
    this.trailerT -= dt;
    const wps = [
      { x: 20, y: 30, z: 60 }, { x: 120, y: 45, z: 40 }, { x: 220, y: 40, z: 120 },
      { x: 180, y: 55, z: 230 }, { x: 60, y: 35, z: 200 }, { x: 30, y: 25, z: 130 },
    ];
    const total = 26;
    const f = clamp(1 - this.trailerT / total, 0, 1) * (wps.length - 1);
    const i = Math.min(wps.length - 2, Math.floor(f));
    const u = f - i;
    const a = wps[i], b = wps[i + 1];
    this.camera.position.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
    this.camera.lookAt(130, 5, 130);
    if (this.trailerT <= 0) this._endTrailer();
  }

  _updateCamera(dt) {
    const p = this.player;
    let target, dist = this.camDist, height = 2.2;
    if (p.inCar || p.inBoat) {
      const v = this.vehicles.playerCar || this.vehicles.playerBoat;
      target = new THREE.Vector3(v.x, v.y + 1.5, v.z);
      dist = 10; height = 3.2;
      if (this.camAutoT <= 0) this.camYaw = damp(this.camYaw, v.heading + Math.PI, 1.2, dt);
    } else if (p.inHeli) {
      const v = this.vehicles.playerHeli;
      target = new THREE.Vector3(v.x, v.y + 1, v.z);
      dist = 16; height = 5;
      if (this.camAutoT <= 0) this.camYaw = damp(this.camYaw, v.heading + Math.PI, 1.2, dt);
    } else if (p.inInterior) {
      const room = this.city.interiors[p.inInterior];
      target = new THREE.Vector3(p.x, -40 + 1.6, p.z);
      dist = 5; height = 1.2;
    } else {
      target = new THREE.Vector3(p.x, p.y + 1.7, p.z);
      // ADS: pull the camera in close so the weapon sits at eye level.
      if (this.aiming) dist = 4.5;
      if (this.camAutoT <= 0 && p.speed > 1) {
        // Auto-align behind the player while moving (with a deadzone).
        let dh = (p.heading + Math.PI) - this.camYaw;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        if (Math.abs(dh) > 0.4) this.camYaw += dh * Math.min(1, 1.1 * dt);
      }
    }
    // Cinematic dolly during cutscenes.
    if (this.cutsceneT > 0) {
      const a = performance.now() * 0.0004;
      const cx = target.x + Math.sin(a) * 14, cz = target.z + Math.cos(a) * 14;
      this.camera.position.set(cx, target.y + 6, cz);
      this.camera.lookAt(target);
      return;
    }
    const cx = target.x + Math.sin(this.camYaw) * dist * Math.cos(this.camPitch);
    const cz = target.z + Math.cos(this.camYaw) * dist * Math.cos(this.camPitch);
    const cy = target.y + height + Math.sin(this.camPitch) * dist;
    const k = 1 - Math.exp(-10 * dt); // smooth follow, no jitter
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (cy - this.camera.position.y) * k;
    this.camera.position.z += (cz - this.camera.position.z) * k;
    if (this.shake > 0 && settings.get('cameraShake')) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(target);
  }

  // -- interactions ---------------------------------------------------------------------------
  _nearestPlaceAt(x, z, maxD) {
    let best = null, bd = maxD;
    for (const k of Object.keys(PLACES)) {
      const d = dist2d(x, z, PLACES[k].x, PLACES[k].y);
      if (d < bd) { bd = d; best = k; }
    }
    return best ? { key: best, dist: bd } : null;
  }
  _nearestPlace(maxD) {
    return this._nearestPlaceAt(this.player.x, this.player.z, maxD);
  }

  // Door position of a named place (buildings face -z; the door is on the
  // south face, d/2 + 1 m out). _nearestPlace() measures to the building
  // CENTRE, but the player can only ever stand at the door — for a 12 m
  // deep building the door is 6 m from the centre, so a 5 m centre radius
  // can never trigger (P15: only car entry worked, all other prompts dead).
  _doorPos(key) {
    const p = PLACES[key];
    const dims = PLACE_DIMS[key];
    if (!p || !dims) return null;
    return { x: p.x, z: p.y - dims.d / 2 - 1 };
  }
  _doorDist(key) {
    const d = this._doorPos(key);
    if (!d) return Infinity;
    return dist2d(this.player.x, this.player.z, d.x, d.z);
  }
  _nearDoor(key, maxD) {
    return this._doorDist(key) < maxD;
  }

  _updatePrompt() {
    const p = this.player;
    if (p.inInterior) { this.hud.showPrompt('[E] Exit'); this.currentPrompt = 'exitInterior'; return; }
    if (p.inCar || p.inBoat || p.inHeli) {
      // Measure from the VEHICLE, not the player: player.x/z stays at the
      // spot where they got in (Player.update returns early while driving),
      // so measuring from the player made refuel/repair prompts NEVER fire
      // while driving (P14: prompt showed 'exitVehicle' at the gas station).
      // Only offer refuel/repair when the vehicle NEEDS it — otherwise the
      // prompt is always repair/refuel at the workshop/gas station and the
      // player can never exit the car there with E (P14 re-run).
      const v = p.inCar || p.inBoat || p.inHeli;
      const near = this._nearestPlaceAt(v.x, v.z, 9);
      if (near && near.key === 'gas' && v.fuel < 95) { this.hud.showPrompt('[E] Refuel ($20)'); this.currentPrompt = 'refuel'; return; }
      if (near && (near.key === 'workshop' || near.key === 'garage') && v.cond < 95) { this.hud.showPrompt('[E] Repair + respray ($50)'); this.currentPrompt = 'repair'; return; }
      if (near && near.key === 'garage') { this.hud.showPrompt('[E] Store car in garage'); this.currentPrompt = 'storeCar'; return; }
      this.hud.showPrompt('[E] Get out'); this.currentPrompt = 'exitVehicle'; return;
    }
    // On foot: La Rosa first (she stands at the club door).
    if (this.characters.laRosa && dist2d(p.x, p.z, this.characters.laRosa.x, this.characters.laRosa.z) < 4) {
      this.hud.showPrompt(this.missions.current ? '[E] Current job' : '[E] Talk to La Rosa'); this.currentPrompt = 'larosa'; return;
    }
    // Everything else: the NEAREST interaction wins (P14 re-run). A fixed
    // priority let a shop door shadow a car parked right beside the player
    // (the LVPD station door beat a car 2 m away), and the reverse hid shop
    // doors behind parked cars (P15). Distance decides; priority breaks ties
    // (a buy offer beats the same door's interior prompt).
    const cands = [];
    const add = (key, d, maxD, label, prio) => { if (d < maxD) cands.push({ key, d, label, prio }); };
    if (!this.businesses.neonBar) add('buyBusiness:neonBar', this._doorDist('club'), 4.5, '[E] Buy Neon Bar ($2,000)', 0);
    if (!this.businesses.garageShares) add('buyBusiness:garageShares', this._doorDist('garage'), 4.5, "[E] Buy Manny's shares ($1,500)", 0);
    if (!this.businesses.beachHouse) add('buyBusiness:beachHouse', this._doorDist('villa2'), 4.5, '[E] Buy Beach House ($1,200)', 0);
    for (const key of INTERIOR_KEYS) {
      const label = { dealer: 'Auto Palms', gunShop: 'Vega Arms', safehouse: 'Safehouse (sleep = save)', minimarket: 'Vega Mart', bank: 'Bank', jewelry: 'Vega Jewels', clotheshop: 'Vega Threads', salon: 'Neon Cuts', tattoo: 'Ink Vega', restaurant: 'Warung La Vega', hospital: 'La Vega General', station: 'LVPD Station', mall: 'La Vega Mall', club: "La Rosa's Club", garage: "Manny's Garage", workshop: "Manny's Workshop" }[key];
      add('interior:' + key, this._doorDist(key), 4.5, `[E] Enter ${label}`, 1);
    }
    add('petshop', this._doorDist('petshop'), 4.5, '[E] Adopt a dog ($100)', 1);
    add('snack', this._doorDist('gas'), 4.5, '[E] Buy snack $25 (B)', 1);
    const car = this.vehicles.nearestCar(p.x, p.z, 4.5, (c) => !c.isBus && c.kind === 'car');
    if (car) add('car', dist2d(p.x, p.z, car.x, car.z), 4.5, '[E] Steal car', 2);
    const boat = this.vehicles.cars.find((c) => (c.kind === 'boat' || c.kind === 'jetski') && dist2d(p.x, p.z, c.x, c.z) < 4.5);
    if (boat) add('boat', dist2d(p.x, p.z, boat.x, boat.z), 4.5, '[E] Board boat', 2);
    const heli = this.vehicles.cars.find((c) => c.kind === 'heli' && dist2d(p.x, p.z, c.x, c.z) < 5 && c.y < 4);
    if (heli) add('heli', dist2d(p.x, p.z, heli.x, heli.z), 5, '[E] Fly helicopter', 2);
    const cashier = this.characters.cashiers.find((c) => !c.dead && dist2d(p.x, p.z, c.x, c.z) < 3);
    if (cashier) add('rob', dist2d(p.x, p.z, cashier.x, cashier.z), 3, '[F] Rob the cashier', 3);
    const taxi = this.vehicles.cars.find((c) => c.specKey === 'taxi' && c.kind === 'car' && dist2d(p.x, p.z, c.x, c.z) < 4.5);
    if (taxi && !this.taxi) add('taxi', dist2d(p.x, p.z, taxi.x, taxi.z), 4.5, '[E] Taxi job', 3);
    if (!cands.length) { this.hud.hidePrompt(); this.currentPrompt = null; return; }
    cands.sort((a, b) => (a.d - b.d) || (a.prio - b.prio));
    this.hud.showPrompt(cands[0].label); this.currentPrompt = cands[0].key;
  }

  _interact() {
    const p = this.player;
    const what = this.currentPrompt;
    if (!what) return;
    if (what === 'exitInterior') return this._exitInterior();
    if (what === 'exitVehicle') {
      if (this.vehicles.playerCar) this.vehicles.exitCar();
      else if (this.vehicles.playerBoat) this._exitBoat();
      else if (this.vehicles.playerHeli) this._exitHeli();
      return;
    }
    if (what === 'larosa') return this.missions.talkToLaRosa();
    if (what.startsWith('buyBusiness:')) {
      const key = what.split(':')[1];
      const price = { neonBar: 2000, garageShares: 1500, beachHouse: 1200 }[key];
      const name = { neonBar: 'Neon Bar', garageShares: "Manny's Garage shares", beachHouse: 'Beach House' }[key];
      const rate = { neonBar: 50, garageShares: 35, beachHouse: 0 }[key];
      if (p.money >= price) {
        p.money -= price;
        this.businesses[key] = true;
        this.hud.notify(`${name} is yours${rate ? ` — +$${rate}/hour.` : ' — sleep here to save.'}`);
        this.audio.cash();
        this.saveGame(true);
      } else this.hud.notify(`Need $${price} for ${name}.`);
      return;
    }
    if (what === 'car') {
      const car = this.vehicles.nearestCar(p.x, p.z, 4.5, (c) => !c.isBus && c.kind === 'car');
      if (!car) return;
      if (car.isTraffic && Math.abs(car.speed) > 1) { this.hud.notify('Too fast to jack!'); return; }
      if (this.vehicles.stealCar(car)) {
        this.police.rememberVehicle(car);
        this.missions.onCarEntered();
      }
      return;
    }
    if (what === 'boat') {
      const boat = this.vehicles.cars.find((c) => (c.kind === 'boat' || c.kind === 'jetski') && dist2d(p.x, p.z, c.x, c.z) < 4.5);
      if (boat) { this.vehicles.playerBoat = boat; p.inBoat = boat; p.group.visible = false; this.hud.notify(boat.kind === 'jetski' ? 'Jet ski! Stay in the sea.' : 'Speedboat — the bay is yours.'); }
      return;
    }
    if (what === 'heli') {
      const heli = this.vehicles.cars.find((c) => c.kind === 'heli' && dist2d(p.x, p.z, c.x, c.z) < 5 && c.y < 4);
      if (heli) { this.vehicles.playerHeli = heli; p.inHeli = heli; p.group.visible = false; this.hud.notify('Helicopter — W/S fly, Space up, Shift down.'); }
      return;
    }
    if (what === 'refuel') {
      const car = this.vehicles.playerCar;
      if (car && p.money >= 20) { p.money -= 20; car.refuel(); this.hud.notify('Tank full — $20.'); this.audio.cash(); }
      else this.hud.notify('Need $20 for fuel.');
      return;
    }
    if (what === 'repair') {
      const car = this.vehicles.playerCar;
      if (car && p.money >= 50) {
        p.money -= 50; car.repair(); car.refuel();
        this.police.clearVehicleHeat(car);
        if (this.police.wanted > 0) this.police.clearWanted('respray — clean plates');
        this.hud.notify('Repaired + resprayed — the cops lost the car. $50.');
        this.audio.cash();
      } else this.hud.notify('Need $50 for repair + respray.');
      return;
    }
    if (what === 'storeCar') return this._storeCar();
    if (what === 'snack') return this._buySnack();
    if (what === 'petshop') {
      if (this.dog) { this.hud.notify('Your dog is already following you.'); return; }
      if (p.money < 100) { this.hud.notify('Adopting a dog costs $100.'); return; }
      p.money -= 100;
      this.adoptDog();
      return;
    }
    if (what === 'rob') return this._robCashier();
    if (what === 'taxi') return this._startTaxi();
    if (what && what.startsWith('interior:')) return this._enterInterior(what.slice(9));
  }

  _enterInterior(key) {
    const p = this.player;
    const room = this.city.interiors[key];
    const place = PLACES[key];
    if (!room || !place) return;
    p._exitPos = { x: p.x, z: p.z };
    p.inInterior = key;
    p.x = room.x; p.z = room.z; p.y = -40;
    p.group.position.set(room.x, -40, room.z);
    this.hud.notify(`Inside ${place.name}. Press E at the blue door to exit.`);
    // Place-specific actions.
    if (key === 'dealer') this.hud.showDealer();
    if (key === 'garage') this.hud.showGarage(); // stored-car collection
    if (key === 'safehouse') { this.hud.notify('Safehouse — press B to sleep & save.'); }
    if (key === 'gunShop') this.hud.notify('Vega Arms — press B to buy ammo / armor.');
    if (key === 'clotheshop') this._customize('clothes');
    if (key === 'salon') this._customize('salon');
    if (key === 'tattoo') this._customize('tattoo');
    if (key === 'restaurant') {
      if (p.money >= 20 && p.health < 100) { p.money -= 20; p.heal(30); this.hud.notify('Warung meal — +30 HP, $20.'); this.audio.cash(); }
      else this.hud.notify('Warung La Vega — best food in the bay. ($20, +30 HP)');
    }
    if (key === 'hospital') {
      if (p.money >= 50) { p.money -= 50; p.health = 100; this.hud.notify('Treated at La Vega General — full health, $50.'); }
      else this.hud.notify('La Vega General — treatment costs $50.');
    }
    if (key === 'station') {
      if (this.police.wanted > 0 && p.money >= 200) { p.money -= 200; this.police.clearWanted('fine paid'); this.hud.notify('Fine paid ($200) — record clean.'); }
      else if (this.police.wanted > 0) this.hud.notify('LVPD Station — pay a $200 fine to clear your record.');
      else this.hud.notify('LVPD Station — stay out of trouble, Vega.');
    }
    if (key === 'bank' || key === 'jewelry') this._crackSafe(key);
  }

  _exitInterior() {
    const p = this.player;
    if (!p.inInterior) return;
    const exit = p._exitPos || { x: 100, z: 60 };
    p.inInterior = null;
    p.x = exit.x; p.z = exit.z; p.y = groundHeight(exit.x, exit.z);
    p.group.position.set(p.x, p.y, p.z);
    this.hud.hideDealer();
  }

  _updateInterior(dt, input) {
    const p = this.player;
    const room = this.city.interiors[p.inInterior];
    if (!room) { p.inInterior = null; return; }
    // Simple walk inside the room (clamped to the walls).
    let mx = 0, mz = 0;
    if (input.fwd) { mx += -Math.sin(this.camYaw); mz += -Math.cos(this.camYaw); }
    if (input.back) { mx += Math.sin(this.camYaw); mz += Math.cos(this.camYaw); }
    if (input.left) { mx += -Math.cos(this.camYaw); mz += Math.sin(this.camYaw); }
    if (input.right) { mx += Math.cos(this.camYaw); mz += -Math.sin(this.camYaw); }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      const want = Math.atan2(mx, mz);
      p.heading = want;
      p.x = clamp(p.x + Math.sin(want) * 3.5 * dt, room.x - room.w / 2 + 1, room.x + room.w / 2 - 1);
      p.z = clamp(p.z + Math.cos(want) * 3.5 * dt, room.z - room.d / 2 + 1, room.z + room.d / 2 - 1);
    }
    p.y = -40;
    p.group.position.set(p.x, -40, p.z);
    p.group.rotation.y = p.heading;
    if (p.char?.mixer) p.char.mixer.update(dt);
    // Exit at the blue door (south wall).
    if (p.z > room.z + room.d / 2 - 1.2) this._exitInterior();
  }

  _exitBoat() {
    const p = this.player;
    const b = this.vehicles.playerBoat;
    if (!b) return;
    this.vehicles.playerBoat = null;
    p.inBoat = null;
    p.x = clamp(b.x + 3, 15, 400); p.z = b.z;
    p.y = groundHeight(p.x, p.z);
    p.group.position.set(p.x, p.y, p.z);
    p.group.visible = true;
  }

  _exitHeli() {
    const p = this.player;
    const h = this.vehicles.playerHeli;
    if (!h) return;
    this.vehicles.playerHeli = null;
    p.inHeli = null;
    h.y = Math.max(h.y, 2);
    p.x = h.x + 3; p.z = h.z;
    p.y = groundHeight(p.x, p.z);
    p.group.position.set(p.x, p.y, p.z);
    p.group.visible = true;
  }

  // -- shops / crime ----------------------------------------------------------------------
  async buyCar(key) {
    const p = this.player;
    const m = CAR_MODELS[key];
    if (!m) return;
    if (p.money < m.price) { this.hud.notify(`Need $${m.price.toLocaleString()} for the ${m.name}.`); return; }
    p.money -= m.price;
    // Load the buy-car GLB (20s timeout, procedural fallback inside the loader).
    if (m.buycar && m.file) {
      const gltf = await loadBuyCar(m.file);
      if (gltf) { MODELS.cars[key] = gltf; m.glb = key; }
    }
    const car = this.vehicles.spawn(key, PLACES.garage.x + 6, PLACES.garage.y + 4, Math.PI / 2, { parked: true });
    this.ownedCars.push({ specKey: key, color: car.color, cond: 100, fuel: 100 });
    this.hud.notify(`${m.name} is yours — parked at Manny's Garage.`);
    this.hud.hideDealer();
    this.audio.cash();
    this.missions.onCarBought();
    this.saveGame(true, 1);
  }

  // Garage: take a stored car out (spawned outside the garage door; the
  // player steps out of the interior and presses E to drive it).
  takeOutCar(i) {
    const c = this.ownedCars[i];
    if (!c) return;
    this.ownedCars.splice(i, 1);
    this.hud.hideGarage();
    this._exitInterior();
    this.vehicles.spawn(c.specKey, PLACES.garage.x + 6, PLACES.garage.y + 4, Math.PI / 2, { parked: true, color: c.color, cond: c.cond, fuel: c.fuel });
    this.hud.notify(`${CAR_MODELS[c.specKey]?.name || c.specKey} is parked outside — press E to drive it.`);
    this.saveGame(true, 1);
  }

  // Garage: store the car the player is driving (simpan mobil).
  _storeCar() {
    const v = this.vehicles.playerCar;
    if (!v) return;
    this.ownedCars.push({ specKey: v.specKey, color: v.color, cond: v.cond, fuel: v.fuel });
    this.vehicles.exitCar();
    const idx = this.vehicles.cars.indexOf(v);
    if (idx >= 0) this.vehicles.cars.splice(idx, 1);
    this.scene.remove(v.group);
    this.hud.notify(`${CAR_MODELS[v.specKey]?.name || v.specKey} stored in Manny's Garage.`);
    this.audio.cash();
    this.saveGame(true, 1);
  }

  _quickBuy() {
    const p = this.player;
    // Door-based: _nearestPlace(6) measured to the building centre, and a
    // 12 m deep shop's door is 6 m from its centre — the old check could
    // never trigger (same P15 root cause as _updatePrompt).
    if (this._nearDoor('dealer', 5)) { this.hud.showDealer(); return; }
    if (this._nearDoor('gunShop', 5)) {
      const w = p.weapon === 'fists' ? 'pistol' : p.weapon;
      const spec = WEAPONS[w];
      if (p.money >= spec.price) {
        p.money -= spec.price;
        p.giveWeapon(w, spec.pack);
        this.hud.notify(`${spec.name} ammo +${spec.pack} — $${spec.price}.`);
        this.audio.cash();
      } else this.hud.notify(`Need $${spec.price} for ${spec.name} ammo.`);
      return;
    }
    if (this._nearDoor('minimarket', 5)) return this._buySnack();
    if (this._nearDoor('safehouse', 5)) { this.saveGame(false, 1); p.health = 100; this.hud.notify('Slept at the safehouse — saved + full health.'); return; }
    // Beach House (owned) is a second safehouse.
    if (this.businesses.beachHouse && this._nearDoor('villa2', 5)) { this.saveGame(false, 1); p.health = 100; this.hud.notify('Slept at the Beach House — saved + full health.'); return; }
  }

  _buySnack() {
    const p = this.player;
    if (p.money >= 25) { p.money -= 25; this.items.snack++; this.hud.notify(`Snack bought ($25). Press Tab → use it to heal.`); this.audio.cash(); }
    else this.hud.notify('Need $25 for a snack.');
  }

  useItem(kind) {
    const p = this.player;
    if (kind === 'snack') {
      if (this.items.snack <= 0) { this.hud.notify('No snacks — buy some at Vega Mart.'); return; }
      if (p.health >= 100) { this.hud.notify('Already full health.'); return; }
      this.items.snack--; p.heal(25); this.hud.notify('Ate a snack — +25 HP.');
    } else if (kind === 'armor') {
      if (this.items.armor <= 0) {
        if (p.money >= 100) { p.money -= 100; this.items.armor++; this.hud.notify('Armor bought ($100).'); }
        else { this.hud.notify('No armor — $100 at Vega Arms.'); return; }
      }
      if (p.armor >= 100) { this.hud.notify('Armor already full.'); return; }
      this.items.armor--; p.armor = Math.min(100, p.armor + 50); this.hud.notify('Armor on — +50.');
    }
    this.hud.showWheel(false);
  }

  _tryRobOrShoot() {
    const p = this.player;
    const cashier = this.characters.cashiers.find((c) => !c.dead && dist2d(p.x, p.z, c.x, c.z) < 3);
    if (cashier && !p.inCar) return this._robCashier();
    this.player.shoot();
  }

  _robCashier() {
    const p = this.player;
    const cashier = this.characters.cashiers.find((c) => !c.dead && dist2d(p.x, p.z, c.x, c.z) < 3.5);
    if (!cashier) return;
    const take = 200 + Math.floor(this.rng() * 200);
    p.money += take;
    this.police.addHeat(1, 'robbery');
    this.characters.npcFlee(cashier, p.x, p.z);
    this.hud.notify(`Robbed the register — +$${take}. The cops heard that.`);
    this.audio.cash();
    this.characters.onGunshot(p.x, p.z);
  }

  _crackSafe(key) {
    const p = this.player;
    if (this.safeCd > 0) { this.hud.notify(`The safe is empty — come back in ${Math.ceil(this.safeCd)}s.`); return; }
    const take = key === 'bank' ? 800 : 500;
    p.money += take;
    this.safeCd = 120;
    this.police.addHeat(2, 'safe cracked');
    this.hud.notify(`${key === 'bank' ? 'Bank vault' : 'Jewelry safe'} cracked — +$${take}! Run!`);
    this.audio.cash();
  }

  _customize(kind) {
    const p = this.player;
    const costs = { clothes: 50, salon: 80, tattoo: 100 };
    const cost = costs[kind];
    if (p.money < cost) { this.hud.notify(`Need $${cost} for that.`); return; }
    p.money -= cost;
    if (kind === 'clothes') {
      const colors = [0x3d7dd9, 0xd94f3d, 0x2a9d8f, 0xe0a13c, 0x7a1fa2, 0x22c3aa, 0xff2a9d];
      p.customShirt = pick(this.rng, colors);
      p.build();
      this.hud.notify('New threads — fresh look, $50.');
    } else if (kind === 'salon') {
      this.hud.notify('Neon Cuts — fresh fade, $80. Looking sharp, Vega.');
    } else {
      this.hud.notify('Ink Vega — new ink, $100. The crew will notice.');
    }
    this.audio.cash();
  }

  callContact(name) {
    const p = this.player;
    if (name === 'larosa') {
      const n = this.missions.nextMission;
      this.hud.showDialogue('La Rosa', n ? `Next job is "${n.name}", baby. Come to the club and press E.` : 'La Vega is yours. Go enjoy it — and stay out of the morgue.');
    } else if (name === 'manny') {
      this.hud.showDialogue('Manny', 'Bring the car to my garage and press E — repair plus respray, $50, and the cops forget the plates.');
    } else if (name === 'crew') {
      this.hud.showDialogue('Crew', 'Abilities: Z swap plates (lose a star) · C quick fix (repair on the road) · G eyes out (vanish from the cops).');
    } else if (name === 'gps') {
      this.hud.notify("GPS marked: La Rosa's Club. Follow the gold beam.");
      this.hud.showDialogue('GPS', "La Rosa's Club — Neon Ave. Drive safe, Vega.");
    }
    this.audio.bark('greet');
  }

  _crewAbility(kind) {
    const p = this.player;
    if (this.crewCd[kind] > 0) { this.hud.notify(`${kind} is recharging (${Math.ceil(this.crewCd[kind])}s).`); return; }
    if (kind === 'plates') {
      const car = this.vehicles.playerCar;
      if (!car) { this.hud.notify('Swap plates needs a car.'); return; }
      this.police.clearVehicleHeat(car);
      if (this.police.wanted > 0) this.police.setWanted(this.police.wanted - 1, 'plates swapped');
      this.crewCd.plates = 45;
      this.hud.notify('Crew swapped the plates — heat down.');
    } else if (kind === 'fix') {
      const car = this.vehicles.playerCar;
      if (!car) { this.hud.notify('Quick fix needs a car.'); return; }
      car.repair();
      this.crewCd.fix = 60;
      this.hud.notify('Crew patched the car — condition 100%.');
    } else if (kind === 'eyes') {
      if (this.police.wanted === 0) { this.hud.notify('No heat to lose.'); return; }
      this.police.setWanted(Math.max(0, this.police.wanted - 2), 'crew eyes out');
      this.crewCd.eyes = 90;
      this.hud.notify('Crew eyes out — the cops lost your trail.');
    }
    this.audio.radioBlip();
  }

  // -- world life --------------------------------------------------------------------------
  _spawnCollectibles() {
    const spots = [
      [24, 60], [60, 240], [250, 60], [250, 240], [130, 30], [330, 200],
      [300, 60], [60, 330], [200, 330], [330, 330],
    ];
    for (const [x, z] of spots) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd34d }),
      );
      m.position.set(x, groundHeight(x, z) + 1.2, z);
      this.scene.add(m);
      this.collectibles.push({ x, z, mesh: m, taken: false });
    }
  }

  _spawnBirds() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x20242c });
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.2, 6), mat);
      body.rotation.x = Math.PI / 2;
      b.add(body);
      b.position.set(rand(this.rng, 40, 240), rand(this.rng, 40, 70), rand(this.rng, 40, 240));
      this.scene.add(b);
      this.birds.push({ g: b, a: this.rng() * Math.PI * 2, r: rand(this.rng, 30, 90), h: b.position.y, sp: rand(this.rng, 0.1, 0.25) });
    }
  }

  _spawnStunts() {
    // 3 stunt jump spots (in the park — never on a road). Each gets a
    // VISIBLE yellow ramp wedge + flag pole, so the player can actually
    // find them (GAP 9: the old spots were bare coordinates — invisible).
    const spots = [[104, 70], [112, 86], [96, 86]];
    for (const [x, z] of spots) {
      this.stunts.push({ x, z, cd: 0, hinted: false });
      const gy = groundHeight(x, z);
      const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(3, 1.4, 4.5),
        new THREE.MeshLambertMaterial({ color: 0xf7c948 }),
      );
      ramp.position.set(x, gy + 0.7, z);
      ramp.rotation.x = -0.35;
      ramp.castShadow = true;
      this.scene.add(ramp);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6),
        new THREE.MeshLambertMaterial({ color: 0x2a2a2e }),
      );
      pole.position.set(x + 2.2, gy + 1.6, z);
      this.scene.add(pole);
      const flag = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.6, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xd92038 }),
      );
      flag.position.set(x + 2.65, gy + 2.9, z);
      this.scene.add(flag);
    }
  }

  _updateCollectibles() {
    const p = this.player;
    for (const c of this.collectibles) {
      if (c.taken) continue;
      c.mesh.rotation.y += 0.03;
      c.mesh.position.y = groundHeight(c.x, c.z) + 1.2 + Math.sin(performance.now() / 300) * 0.2;
      if (dist2d(p.x, p.z, c.x, c.z) < 2.2) {
        c.taken = true;
        this.scene.remove(c.mesh);
        p.money += 100;
        this.hud.notify('Collectible found — +$100!');
        this.audio.cash();
      }
    }
  }

  _updateStunts() {
    const car = this.vehicles.playerCar;
    if (!car) return;
    for (const s of this.stunts) {
      if (s.cd > 0) { s.cd -= 1 / 60; continue; }
      const d = dist2d(car.x, car.z, s.x, s.z);
      if (d < 12 && !s.hinted) {
        s.hinted = true;
        this.hud.notify('Stunt ramp ahead — hit it fast in a car! +$50');
      }
      if (d > 20) s.hinted = false;
      if (d < 3 && Math.abs(car.speed) > 15) {
        s.cd = 30;
        this.player.money += 50;
        this.hud.showDrift(50);
        this.hud.notify('STUNT JUMP! +$50');
      }
    }
  }

  _startTaxi() {
    const car = this.vehicles.nearestCar(this.player.x, this.player.z, 4.5, (c) => c.specKey === 'taxi');
    if (!car) return;
    this.vehicles.enterCar(car);
    const dest = pick(this.rng, [PLACES.club, PLACES.hospital, PLACES.casino, PLACES.mall, PLACES.airport]);
    this.taxi = { dest, t: 90, stage: 'drive' };
    this.hud.notify(`Taxi job: take the fare to ${dest.name} (90s). +$150.`);
    this.missions.markerPos = { x: dest.x, z: dest.y };
  }

  _updateTaxi(dt) {
    if (!this.taxi) return;
    this.taxi.t -= dt;
    const p = this.player;
    if (this.taxi.t <= 0) { this.hud.notify('Taxi fare cancelled — too slow.'); this.taxi = null; this.missions.markerPos = this.missions.current?.step?.marker ? { x: this.missions.current.step.marker.x, z: this.missions.current.step.marker.y } : null; return; }
    if (dist2d(p.x, p.z, this.taxi.dest.x, this.taxi.dest.y) < 7) {
      p.money += 150;
      this.hud.notify('Fare delivered — +$150. Thanks, Vega!');
      this.audio.cash();
      this.taxi = null;
    }
  }

  _updateEvents(dt) {
    this.eventT -= dt;
    if (this.eventT > 0) return;
    this.eventT = 60 + this.rng() * 60;
    const roll = this.rng();
    const p = this.player;
    if (roll < 0.35) {
      // Gang ambush near the player.
      for (let i = 0; i < 3; i++) {
        const npc = new NPC(this, {
          kind: 'gang',
          x: p.x + rand(this.rng, -12, 12), z: p.z + rand(this.rng, -12, 12),
          modelKey: 'npcMale', shirt: 0x8a1a1a,
          home: { x: p.x, z: p.z },
        });
        npc.build();
        npc.state = 'chase';
        npc.fleeFrom = { x: p.x, z: p.z };
        this.characters.npcs.push(npc);
      }
      this.hud.notify('Vultures spotted nearby — watch your back!');
      this.audio.bark('shout');
    } else if (roll < 0.6) {
      this.hud.socialPost(pick(this.rng, ['@beachbum', '@neonrider', '@vegalocal', '@clubkid']), pick(this.rng, [
        'Sunset at the Marina hits different. #LaVega',
        'Someone just did a stunt jump in Palm Court Park?!',
        'The LVPD is everywhere tonight. Stay low. #LaVega',
        'La Rosa\'s Club is PACKED tonight.',
      ]));
    } else if (roll < 0.8) {
      this.weather.pickWeather();
      this.hud.notify(`Weather changing: ${this.weather.weatherName()}.`);
    } else {
      this.hud.notify('A stray dog follows you for a while, then trots off.');
    }
  }

  _updateBirds(dt) {
    for (const b of this.birds) {
      b.a += b.sp * dt;
      b.g.position.set(130 + Math.sin(b.a) * b.r, b.h + Math.sin(b.a * 2) * 3, 130 + Math.cos(b.a) * b.r);
      b.g.rotation.y = -b.a;
    }
  }

  _updateDog(dt) {
    if (!this.dog) return;
    const p = this.player;
    const d = dist2d(this.dog.g.position.x, this.dog.g.position.z, p.x, p.z);
    if (d > 4) {
      const a = Math.atan2(p.x - this.dog.g.position.x, p.z - this.dog.g.position.z);
      this.dog.g.position.x += Math.sin(a) * 5 * dt;
      this.dog.g.position.z += Math.cos(a) * 5 * dt;
      this.dog.g.rotation.y = a;
    }
  }

  adoptDog() {
    if (this.dog) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a5a2a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.9), mat);
    body.position.y = 0.45; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.4), mat);
    head.position.set(0, 0.65, 0.55); g.add(head);
    g.position.set(this.player.x + 2, groundHeight(this.player.x + 2, this.player.z), this.player.z);
    this.scene.add(g);
    this.dog = { g };
    this.hud.notify('You adopted a dog from Paws & Claws! He follows you now.');
  }

  _updateCarNpcHits() {
    const car = this.vehicles.playerCar;
    if (!car || Math.abs(car.speed) < 4) return;
    const p = this.player;
    for (const npc of this.characters.npcs) {
      if (npc.dead || npc.kind === 'laRosa') continue;
      if (dist2d(car.x, car.z, npc.x, npc.z) < 2.2) {
        npc.damage(120, car.x, car.z, 'car');
        this.shake = Math.min(0.6, this.shake + 0.3);
        this.audio.crash(0.5);
        if (this.police.wanted === 0) this.police.addHeat(0.5, 'hit and run');
        break;
      }
    }
    void p;
  }

  // -- scoring callbacks (called from vehicles.js / characters.js) --------------------------
  onNearMiss() {
    this.player.money += 15;
    this.hud.showDrift(15);
    this.hud.notify('Near miss! +$15');
  }
  onDrift(score) {
    this.player.money += Math.max(1, Math.round(score / 10));
    this.hud.showDrift(score);
  }
  onPlayerDown() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    this.downT = 2.0;
    this.hud.notify('You went down…');
  }
  _respawn() {
    const p = this.player;
    const lost = Math.min(p.money, 100);
    p.money -= lost;
    p.health = 100;
    p.armor = 0;
    p.dead = false;
    p.deadT = 0;
    if (this.vehicles.playerCar) this.vehicles.exitCar();
    p.x = PLACES.hospital.x; p.z = PLACES.hospital.y + 8;
    p.y = groundHeight(p.x, p.z);
    p.group.position.set(p.x, p.y, p.z);
    p.group.visible = true;
    this.police.clearWanted('respawn');
    this.missions.onBusted();
    this.hud.notify(`You woke up at La Vega General. Lost $${lost}.`);
  }
}
