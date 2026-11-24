// La Vega 3D — HUD: every on-screen element, built from scratch in code.
// Written in this session for the recorded build (round 9).
//
// The HUD owns one hard rule: NO TWO LAYERS EVER SHARE THE SCREEN.
// The layer manager (_refreshLayers) is the single place that decides
// what is visible, from one state snapshot, every frame. The menu hides
// the card and the dialogue; the card and the dialogue hide the touch
// buttons, the mission panel, the prompt, the hint, the dispatch board,
// the toasts and the social feed; the district banner never shows during
// a card, a dialogue, a cutscene, the menu or the trailer; touch controls
// never show during a cutscene, the trailer, the menu or any modal.
// That is the whole fix for the phone playtest overlaps of 24 Nov.
//
// The index.html page ships an empty body: every HUD element below is
// created here with the .lv-* classes the page stylesheet styles.

import {
  STEP, WORLD, PLACES, PLACE_DIMS, ROADS, STREET_NS, STREET_EW,
  CAR_MODELS, CAR_CATALOG,
  WEAPONS, DISTRICTS, SAVE_KEY,
} from './config.js';
import { settings, effectiveControlMode } from './settings.js';

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function el(tag, cls, parent, text) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined && text !== null) d.textContent = text;
  if (parent) parent.appendChild(d);
  return d;
}

function fmtMoney(n) {
  return '$' + Math.floor(n || 0).toLocaleString('en-US');
}

const RANK_NAMES = ['Newcomer', 'Driver', 'Hustler', 'Enforcer', 'Kingpin', 'Legend'];
const STATION_NAMES = ['Neon Tide FM 98.6', 'Mango Radio 101', 'Static Dub 88.1'];
const WHEEL_IDS = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

export class HUD {
  constructor(game) {
    this.game = game;
    this._lastLayers = {};
    this._bannerT = 0;
    this._bannerDistrict = '';
    this._hintT = 0;
    this._flashT = 0;
    this._flashWantedT = 0;
    this._driftT = 0;
    this._rewardT = 0;
    this._dispatchT = 0;
    this._toastCount = 0;
    this._socialCount = 0;
    this._socialFeed = [];
    this._dialogueQueue = null;
    this._dialogueIdx = 0;
    this._dialogueTimer = 0;
    this._minimapT = 0;

    // Layer state — the single source of truth for _refreshLayers().
    this.menuOpen = false;
    this.cardOpen = false;
    this.dialogueOpen = false;
    this.dealerOpen = false;
    this.garageOpen = false;
    this.wheelOpen = false;
    this.pauseOpen = false;
    this.phoneOpen = false;
    this.bustedOpen = false;
    this.settingsOpen = false;
    this.creditsOpen = false;
    this.loadingOpen = true;
    this.promptVisible = false;
    this.hintVisible = false;

    const root = el('div', 'lv-hud', document.body);
    this.root = root;

    // -- top bar ------------------------------------------------------------
    const top = el('div', 'lv-top', root);
    this.topEl = top;
    this.moneyEl = el('span', 'lv-money', top, '$0');
    const stars = el('span', 'lv-stars', top);
    this.starEls = [];
    for (let i = 0; i < 5; i++) this.starEls.push(el('span', 'lv-star', stars, '★'));
    this.rankEl = el('span', 'lv-rank', top, 'RANK 0 · Newcomer');
    this.radioEl = el('span', 'lv-radio', top, '♪ Neon Tide FM 98.6');
    this.qualityEl = el('span', 'lv-quality-pill', top, 'Quality: auto');
    this.clockEl = el('span', 'lv-clock', top, 'DAY 1 · 12:00');
    const missionTop = el('div', 'lv-mission-top', top);
    this.missionTopEl = missionTop;
    this.missionTopEl.textContent = 'FREE ROAM';

    // -- mission panel (left) ------------------------------------------------
    const panel = el('div', 'lv-mission-panel', root);
    this.missionPanelEl = panel;
    this.missionPanelTitle = el('div', '', panel, 'FREE ROAM — LA VEGA');
    this.missionPanelBody = el('div', '', panel, 'No active job. Talk to La Rosa.');
    this.missionPanelLoc = el('div', '', panel, '');

    // -- district banner (big, centre, 3.5 s) --------------------------------
    const banner = el('div', 'lv-loc', root);
    banner.classList.add('hidden');
    this.bannerEl = banner;
    this.bannerName = el('div', '', banner, '');
    this.bannerSub = el('div', '', banner, '');

    // -- minimap ---------------------------------------------------------------
    const mapWrap = el('div', 'lv-map-wrap', root);
    this.mapWrapEl = mapWrap;
    const mapCanvas = document.createElement('canvas');
    mapCanvas.className = 'lv-map';
    mapCanvas.width = 200;
    mapCanvas.height = 200;
    mapWrap.appendChild(mapCanvas);
    this.mapCanvas = mapCanvas;
    this.mapCtx = mapCanvas.getContext('2d');

    // -- health / armour / stamina bars ---------------------------------------
    const bars = el('div', 'lv-bars', root);
    this.barsEl = bars;
    this.hpBar = el('div', 'lv-bar lv-bar-hp', bars);
    this.hpFill = el('div', 'lv-fill', this.hpBar);
    this.armorBar = el('div', 'lv-bar lv-bar-armor', bars);
    this.armorFill = el('div', 'lv-fill', this.armorBar);
    this.stamBar = el('div', 'lv-bar lv-bar-stam', bars);
    this.stamFill = el('div', 'lv-fill', this.stamBar);

    // -- weapon readout ---------------------------------------------------------
    // A pill INSIDE the top bar (the stylesheet styles .lv-weapon as a
    // top-bar pill next to .lv-clock/.lv-radio). As a bare child of the HUD
    // root it sat at the very top and overlapped the bar on phones.
    this.weaponEl = el('span', 'lv-weapon', top, 'FISTS');

    // -- car HUD -----------------------------------------------------------------
    const carhud = el('div', 'lv-carhud', root);
    carhud.classList.add('hidden');
    this.carhudEl = carhud;
    this.carNameEl = el('div', 'lv-car-name', carhud, '');
    this.carSpeedEl = el('div', 'lv-car-speed', carhud, '0 km/h');

    // -- keyboard help ------------------------------------------------------------
    this.helpEl = el('div', 'lv-help', root,
      'WASD drive · E interact · F enter car · Q weapon wheel · T phone · M map · P pause · R radio');

    // -- prompt / hint --------------------------------------------------------------
    this.promptEl = el('div', 'lv-prompt', root, '');
    this.promptEl.classList.add('hidden');
    this.hintEl = el('div', 'lv-hint', root, '');
    this.hintEl.classList.add('hidden');

    // -- toasts / social / dispatch --------------------------------------------------
    this.toastsEl = el('div', 'lv-toasts', root);
    this.socialEl = el('div', 'lv-social', root);
    this.dispatchEl = el('div', 'lv-dispatch', root);
    this.dispatchEl.classList.add('hidden');

    // -- crosshair + damage flash -------------------------------------------------------
    this.crosshairEl = el('div', 'lv-crosshair', root, '+');
    this.crosshairEl.classList.add('hidden');
    this.flashEl = el('div', 'lv-flash', root);
    this.flashEl.classList.add('hidden');

    // -- mission card ---------------------------------------------------------------
    const card = el('div', 'lv-card', root);
    card.classList.add('hidden');
    this.cardEl = card;
    this.cardActEl = el('div', 'lv-card-act', card, '');
    this.cardTitleEl = el('div', 'lv-card-title', card, '');
    this.cardTextEl = el('div', 'lv-card-text', card, '');
    const cardBtn = el('button', 'lv-btn lv-btn-primary', card, 'CONTINUE');
    cardBtn.addEventListener('click', () => this._advanceCard());

    // -- dialogue ---------------------------------------------------------------------
    const dlg = el('div', 'lv-dialogue', root);
    dlg.classList.add('hidden');
    this.dialogueEl = dlg;
    this.dialogueNameEl = el('div', 'lv-dialogue-name', dlg, '');
    this.dialogueTextEl = el('div', 'lv-dialogue-text', dlg, '');
    const dlgBtn = el('button', 'lv-btn lv-btn-primary', dlg, 'CONTINUE');
    dlgBtn.addEventListener('click', () => this._advanceDialogue());

    // -- reward + drift toasts ----------------------------------------------------------
    this.rewardEl = el('div', 'lv-reward', root, '');
    this.rewardEl.classList.add('hidden');
    this.driftEl = el('div', 'lv-drift', root, '');
    this.driftEl.classList.add('hidden');

    // -- weapon wheel ---------------------------------------------------------------------
    const wheel = el('div', 'lv-wheel', root);
    wheel.classList.add('hidden');
    this.wheelEl = wheel;
    el('div', 'lv-wheel-title', wheel, 'WEAPONS');
    const wheelItems = el('div', 'lv-wheel-items', wheel);
    this.wheelItemsEl = wheelItems;
    this._wheelSlots = {};
    for (const id of WHEEL_IDS) {
      const slot = el('button', 'lv-wheel-item', wheelItems, '');
      const slotName = el('span', 'lv-wheel-slot', slot, '');
      this._wheelSlots[id] = { slot, name: slotName };
      slot.addEventListener('click', () => {
        this.game.player.setWeapon(id);
        this.showWheel(false);
      });
    }
    this._refreshWheel();

    // -- touch controls --------------------------------------------------------------------
    const touch = el('div', 'lv-touch', root);
    touch.classList.add('hidden');
    this.touchEl = touch;
    const stick = el('div', 'lv-stick', touch);
    const knob = el('div', 'lv-stick-knob', stick);
    this._stickKnob = knob;
    this._bindStick(stick, knob);
    const tbtns = el('div', 'lv-touch-btns', touch);
    this._touchButtons = {};
    const defs = [
      ['gas', 'GAS'], ['brake', 'BRAKE'], ['jump', 'JUMP'],
      ['enter', 'ENTER'], ['punch', 'PUNCH'], ['fire', 'FIRE'], ['aim', 'AIM'],
    ];
    for (const [key, label] of defs) {
      const b = el('button', 'lv-tbtn', tbtns, label);
      this._touchButtons[key] = b;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.game.input.touch[key] = true;
      });
      const release = (e) => {
        e.preventDefault();
        this.game.input.touch[key] = false;
      };
      b.addEventListener('pointerup', release);
      b.addEventListener('pointerleave', release);
      b.addEventListener('pointercancel', release);
    }
    const pauseBtn = el('button', 'lv-tbtn', tbtns, 'II');
    pauseBtn.addEventListener('click', () => this.game.togglePause());

    // -- phone button (floating, hides during dialogue) --------------------------------------
    const phoneBtn = el('button', 'lv-phone-btn', root, '☎');
    phoneBtn.classList.add('hidden');
    this.phoneBtnEl = phoneBtn;
    phoneBtn.addEventListener('click', () => this.game.togglePhone());

    // -- main menu ------------------------------------------------------------------------------
    const menu = el('div', 'lv-menu', root);
    menu.classList.add('hidden');
    this.menuEl = menu;
    const menuInner = el('div', 'lv-menu-inner', menu);
    el('div', 'lv-title', menuInner, 'LA VEGA');
    el('div', 'lv-subtitle', menuInner, 'An open-world story in the sun.');
    const charRow = el('div', 'lv-char-row', menuInner);
    el('span', 'lv-char-label', charRow, 'PLAY AS:');
    this._charBtns = {};
    for (const [id, label] of [['jax', 'JAX'], ['maya', 'MAYA']]) {
      const b = el('button', 'lv-btn-char', charRow, label);
      this._charBtns[id] = b;
      b.addEventListener('click', () => {
        this.game.selectedChar = id;
        this.game.player.charId = id;
        this.updateCharacter();
      });
    }
    const menuBtns = el('div', 'lv-menu-btns', menuInner);
    const newBtn = el('button', 'lv-btn lv-btn-primary', menuBtns, 'NEW GAME');
    newBtn.addEventListener('click', () => this.game.startNewGame(this.game.selectedChar));
    const loadRow = el('div', 'lv-load-row', menuInner);
    this._loadBtns = [];
    for (let s = 1; s <= 3; s++) {
      const b = el('button', 'lv-btn lv-btn-small', loadRow, `SLOT ${s} — EMPTY`);
      this._loadBtns.push(b);
      b.addEventListener('click', () => this.game.loadGame(s));
    }
    const trailerBtn = el('button', 'lv-btn', menuBtns, 'WATCH TRAILER');
    trailerBtn.addEventListener('click', () => this.game.playTrailer());
    const settingsBtn = el('button', 'lv-btn', menuBtns, 'SETTINGS');
    settingsBtn.addEventListener('click', () => this.showSettings());
    const creditsBtn = el('button', 'lv-btn', menuBtns, 'CREDITS');
    creditsBtn.addEventListener('click', () => this.showCredits());
    el('div', 'lv-menu-note', menuInner,
      'An original game. Built by Muse. Three.js + procedural art.');
    this.updateCharacter();
    this._refreshLoadSlots();

    // -- loading screen -----------------------------------------------------------------------------
    const loading = el('div', 'lv-loading', root);
    this.loadingEl = loading;
    el('div', 'lv-loading-title', loading, 'LA VEGA');
    const loadBar = el('div', 'lv-loading-bar', loading);
    this.loadingFillEl = el('div', 'lv-loading-fill', loadBar);
    this.loadingPctEl = el('div', 'lv-loading-pct', loading, '0%');
    this.loadingSubEl = el('div', 'lv-loading-sub', loading, 'Loading the city…');
    this.loadingTipEl = el('div', 'lv-loading-tip', loading,
      'Tip: hold SHIFT to sprint. Press F near a car to steal it — the police will notice.');

    // -- pause menu ---------------------------------------------------------------------------------
    const pause = el('div', 'lv-pause', root);
    pause.classList.add('hidden');
    this.pauseEl = pause;
    el('div', 'lv-pause-title', pause, 'PAUSED');
    const pauseBtns = el('div', 'lv-menu-btns', pause);
    const resumeBtn = el('button', 'lv-btn lv-btn-primary', pauseBtns, 'RESUME');
    resumeBtn.addEventListener('click', () => this.game.togglePause());
    const pauseSettingsBtn = el('button', 'lv-btn', pauseBtns, 'SETTINGS');
    pauseSettingsBtn.addEventListener('click', () => this.showSettings());
    const saveBtn = el('button', 'lv-btn', pauseBtns, 'SAVE GAME');
    saveBtn.addEventListener('click', () => {
      this.game.saveGame(false, 1);
      this.notify('Game saved — slot 1.');
    });
    const quitBtn = el('button', 'lv-btn', pauseBtns, 'QUIT TO MENU');
    quitBtn.addEventListener('click', () => this.game.quitToMenu());
    this.pauseStatsEl = el('div', 'lv-pause-stats', pause, '');

    // -- settings ------------------------------------------------------------------------------------
    const settingsEl = el('div', 'lv-settings', root);
    settingsEl.classList.add('hidden');
    this.settingsEl = settingsEl;
    el('div', 'lv-settings-title', settingsEl, 'SETTINGS');
    this._settingsRows = {};
    this._buildSettingsRow(settingsEl, 'quality', 'Quality', ['auto', 'high', 'medium', 'low']);
    this._buildSettingsRow(settingsEl, 'controlMode', 'Controls', ['auto', 'touch', 'pc']);
    this._buildSettingsRow(settingsEl, 'sensitivity', 'Camera sensitivity', ['0.5', '1', '1.5', '2']);
    this._buildSettingsRow(settingsEl, 'music', 'Music', ['on', 'off']);
    this._buildSettingsRow(settingsEl, 'sfx', 'Sound effects', ['on', 'off']);
    this._buildSettingsRow(settingsEl, 'mute', 'Mute all', ['off', 'on']);
    this._buildSettingsRow(settingsEl, 'cameraShake', 'Camera shake', ['on', 'off']);
    this._buildSettingsRow(settingsEl, 'showHints', 'Show hints', ['on', 'off']);
    const settingsBtns = el('div', 'lv-menu-btns', settingsEl);
    const resetBtn = el('button', 'lv-btn', settingsBtns, 'RESET ALL SAVES');
    resetBtn.addEventListener('click', () => {
      for (let s = 1; s <= 3; s++) {
        try { localStorage.removeItem(`${SAVE_KEY}-slot${s}`); } catch (e) { /* ignore */ }
      }
      settings.reset();
      this._refreshLoadSlots();
      this.notify('Saves and settings reset.');
    });
    const settingsClose = el('button', 'lv-btn lv-btn-primary', settingsBtns, 'CLOSE');
    settingsClose.addEventListener('click', () => this.hideSettings());

    // -- credits ---------------------------------------------------------------------------------------
    const credits = el('div', 'lv-credits', root);
    credits.classList.add('hidden');
    this.creditsEl = credits;
    el('div', 'lv-credits-title', credits, 'CREDITS');
    el('div', 'lv-credits-body', credits,
      'LA VEGA — an original open-world game.\n\nBuilt by Muse.\n\n3D models: Quaternius (CC0) and procedural models built in code.\nMusic: generative WebAudio radio, composed in code.\nTextures: generated in code — no third-party images.\n\nA work of fiction. Any resemblance to real people or places is coincidental.');
    const creditsClose = el('button', 'lv-btn lv-btn-primary', credits, 'CLOSE');
    creditsClose.addEventListener('click', () => this.hideCredits());

    // -- dealer ------------------------------------------------------------------------------------------
    const dealer = el('div', 'lv-dealer', root);
    dealer.classList.add('hidden');
    this.dealerEl = dealer;
    el('div', 'lv-dealer-title', dealer, "AUTO PALMS — DEALER");
    this.dealerRowsEl = el('div', '', dealer);
    const dealerClose = el('button', 'lv-btn lv-btn-primary', dealer, 'CLOSE (ESC)');
    dealerClose.addEventListener('click', () => this.hideDealer());
    this._buildDealerRows();

    // -- garage ---------------------------------------------------------------------------------------------
    const garage = el('div', 'lv-dealer', root);
    garage.classList.add('hidden');
    this.garageEl = garage;
    el('div', 'lv-dealer-title', garage, "MANNY'S GARAGE — YOUR CARS");
    this.garageRowsEl = el('div', '', garage);
    const garageClose = el('button', 'lv-btn lv-btn-primary', garage, 'CLOSE (ESC)');
    garageClose.addEventListener('click', () => this.hideGarage());

    // -- phone ---------------------------------------------------------------------------------------------------
    const phone = el('div', 'lv-phone', root);
    phone.classList.add('hidden');
    this.phoneEl = phone;
    el('div', 'lv-phone-title', phone, 'PHONE');
    const phoneTabs = el('div', 'lv-phone-tabs', phone);
    this._phoneTabs = {};
    const phoneBody = el('div', '', phone);
    this._phoneBody = phoneBody;
    for (const [id, label] of [['contacts', 'CONTACTS'], ['gps', 'GPS'], ['social', 'SOCIAL']]) {
      const tab = el('button', 'lv-phone-tab', phoneTabs, label);
      this._phoneTabs[id] = tab;
      tab.addEventListener('click', () => this._showPhoneTab(id));
    }
    const phoneClose = el('button', 'lv-btn lv-btn-primary', phone, 'CLOSE (T)');
    phoneClose.addEventListener('click', () => this.game.togglePhone());
    this._phoneTab = 'contacts';
    this._showPhoneTab('contacts');

    // -- busted ------------------------------------------------------------------------------------------------------
    const busted = el('div', 'lv-busted', root);
    busted.classList.add('hidden');
    this.bustedEl = busted;
    el('div', 'lv-busted-title', busted, 'BUSTED');
    this.bustedTextEl = el('div', 'lv-busted-text', busted, '');
    this.bustedSubEl = el('div', 'lv-busted-sub', busted, '');
    const bustedBtn = el('button', 'lv-btn lv-btn-primary', busted, 'CONTINUE');
    bustedBtn.addEventListener('click', () => this.hideBusted());
  }

  // -- layer manager: the single place that decides visibility ------------------
  // Menu hides card/dialogue. Card/dialogue hide touch, mission panel,
  // prompt, hint, dispatch, toasts and social. The district banner never
  // shows during card/dialogue/cutscene/menu/trailer. Touch never shows
  // during cutscene/trailer/menu/any modal. Nothing overlaps.
  _refreshLayers() {
    const g = this.game;
    const playing = g.state === 'playing';
    const trailer = g.state === 'trailer';
    const cutscene = !!g.cutscene;
    const inCardOrDialogue = this.cardOpen || this.dialogueOpen;
    const modal = this.menuOpen || inCardOrDialogue || this.dealerOpen ||
      this.garageOpen || this.wheelOpen || this.pauseOpen || this.phoneOpen ||
      this.bustedOpen || this.settingsOpen || this.creditsOpen || this.loadingOpen;
    const mode = effectiveControlMode();
    const inCar = !!(g.player && g.player.inCar);
    const wanted = g.police ? g.police.wanted : 0;

    const layers = {
      top: playing && !this.menuOpen && !this.loadingOpen,
      missionPanel: playing && !inCardOrDialogue && !this.menuOpen && !trailer && !cutscene,
      banner: playing && !inCardOrDialogue && !this.menuOpen && !trailer && !cutscene && this._bannerT > 0,
      map: playing && !this.menuOpen && !this.loadingOpen && !inCardOrDialogue,
      bars: playing && !this.menuOpen && !this.loadingOpen,
      weapon: playing && !this.menuOpen && !this.loadingOpen,
      carhud: playing && !this.menuOpen && !this.loadingOpen && inCar,
      help: playing && !this.menuOpen && !this.loadingOpen && mode === 'pc' && !inCardOrDialogue,
      prompt: this.promptVisible && playing && !inCardOrDialogue && !modal && !trailer && !cutscene,
      hint: this.hintVisible && playing && !inCardOrDialogue && !modal && !trailer && !cutscene,
      toasts: playing && !inCardOrDialogue && !this.menuOpen && !trailer && !cutscene,
      social: playing && !inCardOrDialogue && !this.menuOpen && !trailer && !cutscene,
      dispatch: playing && !inCardOrDialogue && !this.menuOpen && !trailer && !cutscene && wanted > 0,
      crosshair: playing && !modal && !cutscene && !trailer && !!g.player && !inCar && g.player.weapon !== 'fists',
      touch: playing && !modal && !cutscene && !trailer && mode === 'touch',
      phoneBtn: playing && !modal && !cutscene && !trailer && !this.dialogueOpen && mode === 'touch',
      menu: this.menuOpen,
      card: this.cardOpen,
      dialogue: this.dialogueOpen,
      dealer: this.dealerOpen,
      garage: this.garageOpen,
      wheel: this.wheelOpen,
      pause: this.pauseOpen,
      phone: this.phoneOpen,
      busted: this.bustedOpen,
      settings: this.settingsOpen,
      credits: this.creditsOpen,
      loading: this.loadingOpen,
      reward: this._rewardT > 0 && !inCardOrDialogue,
      drift: this._driftT > 0 && !inCardOrDialogue,
      flash: this._flashT > 0,
      touchMode: mode === 'touch',
      pcMode: mode === 'pc',
    };
    const els = {
      top: this.topEl, missionPanel: this.missionPanelEl, banner: this.bannerEl,
      map: this.mapWrapEl, bars: this.barsEl, weapon: this.weaponEl,
      carhud: this.carhudEl, help: this.helpEl, prompt: this.promptEl,
      hint: this.hintEl, toasts: this.toastsEl, social: this.socialEl,
      dispatch: this.dispatchEl, crosshair: this.crosshairEl, touch: this.touchEl,
      phoneBtn: this.phoneBtnEl, menu: this.menuEl, card: this.cardEl,
      dialogue: this.dialogueEl, dealer: this.dealerEl, garage: this.garageEl,
      wheel: this.wheelEl, pause: this.pauseEl, phone: this.phoneEl,
      busted: this.bustedEl, settings: this.settingsEl, credits: this.creditsEl,
      loading: this.loadingEl, reward: this.rewardEl, drift: this.driftEl,
      flash: this.flashEl,
    };
    for (const key of Object.keys(layers)) {
      if (this._lastLayers[key] === layers[key]) continue;
      this._lastLayers[key] = layers[key];
      if (key === 'touchMode') {
        document.body.classList.toggle('lv-touch-mode', layers[key]);
      } else if (key === 'pcMode') {
        document.body.classList.toggle('lv-pc-mode', layers[key]);
      } else {
        const node = els[key];
        if (node) node.classList.toggle('hidden', !layers[key]);
      }
    }
  }

  // -- loading ---------------------------------------------------------------------
  setLoading(pct, text) {
    this.loadingOpen = true;
    const p = clamp(Math.round(pct || 0), 0, 100);
    this.loadingFillEl.style.width = `${p}%`;
    this.loadingPctEl.textContent = `${p}%`;
    if (text) this.loadingSubEl.textContent = text;
    this._refreshLayers();
  }

  hideLoading() {
    this.loadingOpen = false;
    this._refreshLayers();
  }

  // -- menu --------------------------------------------------------------------------
  showMenu() {
    this.cardOpen = false;
    this.dialogueOpen = false;
    this._dialogueQueue = null;
    this.dealerOpen = false;
    this.garageOpen = false;
    this.wheelOpen = false;
    this.pauseOpen = false;
    this.phoneOpen = false;
    this.bustedOpen = false;
    this.settingsOpen = false;
    this.creditsOpen = false;
    this.loadingOpen = false;
    this.menuOpen = true;
    this._refreshLoadSlots();
    this._refreshLayers();
  }

  hideMenu() {
    this.menuOpen = false;
    this._refreshLayers();
  }

  // -- mission card / dialogue ------------------------------------------------------------
  showMissionCard(act, title, text) {
    this.dialogueOpen = false;
    this._dialogueQueue = null;
    this.cardActEl.textContent = act || '';
    this.cardTitleEl.textContent = title || '';
    this.cardTextEl.textContent = text || '';
    this.cardOpen = true;
    this._refreshLayers();
  }

  _advanceCard() {
    this.cardOpen = false;
    this._refreshLayers();
  }

  showDialogue(name, text) {
    this.cardOpen = false;
    this._dialogueQueue = null;
    this.dialogueNameEl.textContent = name || '';
    this.dialogueTextEl.textContent = text || '';
    this.dialogueOpen = true;
    this._dialogueTimer = 8;
    this._refreshLayers();
  }

  showDialogueSequence(lines) {
    this.cardOpen = false;
    this._dialogueQueue = Array.isArray(lines) ? lines.slice() : [];
    this._dialogueIdx = 0;
    if (this._dialogueQueue.length === 0) {
      this.dialogueOpen = false;
      this._refreshLayers();
      return;
    }
    this._showDialogueLine();
    this.dialogueOpen = true;
    this._refreshLayers();
  }

  _showDialogueLine() {
    const line = this._dialogueQueue[this._dialogueIdx];
    if (!line) { this.dialogueOpen = false; this._dialogueQueue = null; return; }
    this.dialogueNameEl.textContent = line.name || line.speaker || '';
    this.dialogueTextEl.textContent = line.text || line.line || '';
    this._dialogueTimer = 8;
  }

  _advanceDialogue() {
    if (this._dialogueQueue) {
      this._dialogueIdx += 1;
      if (this._dialogueIdx < this._dialogueQueue.length) {
        this._showDialogueLine();
      } else {
        this._dialogueQueue = null;
        this.dialogueOpen = false;
      }
    } else {
      this.dialogueOpen = false;
    }
    this._refreshLayers();
  }

  // -- reward / drift / busted ---------------------------------------------------------------
  showReward(text, sub) {
    this.rewardEl.textContent = sub ? `${text}\n${sub}` : text;
    this._rewardT = 3;
    this._refreshLayers();
  }

  showDrift(score) {
    this.driftEl.textContent = `DRIFT +${Math.round(score)}`;
    this._driftT = 2.5;
    this._refreshLayers();
  }

  showBusted(paid) {
    this.bustedTextEl.textContent = 'You were busted by the LVPD.';
    this.bustedSubEl.textContent = `Bail paid: $${Math.round(paid || 0)}. You woke up at La Vega General.`;
    this.bustedOpen = true;
    this._refreshLayers();
  }

  hideBusted() {
    this.bustedOpen = false;
    this._refreshLayers();
  }

  // -- pause / phone / wheel / dealer / garage / settings / credits --------------------------------
  showPause(open) {
    this.pauseOpen = !!open;
    if (this.pauseOpen) {
      this.phoneOpen = false;
      this.dealerOpen = false;
      this.garageOpen = false;
      this.wheelOpen = false;
      const g = this.game;
      const jobs = g.missions ? g.missions.nextIdx : 0;
      this.pauseStatsEl.textContent =
        `${fmtMoney(g.player ? g.player.money : 0)} · ${jobs}/12 jobs done · RANK ${g.rank || 0} · ${g.player ? g.player.charId.toUpperCase() : ''}`;
    }
    this._refreshLayers();
  }

  showPhone(open) {
    this.phoneOpen = !!open;
    if (this.phoneOpen) this._showPhoneTab(this._phoneTab);
    this._refreshLayers();
  }

  showWheel(open) {
    this.wheelOpen = !!open;
    if (this.wheelOpen) this._refreshWheel();
    this._refreshLayers();
  }

  showDealer() {
    this.dealerOpen = true;
    this._buildDealerRows();
    this._refreshLayers();
  }

  hideDealer() {
    this.dealerOpen = false;
    this._refreshLayers();
  }

  showGarage() {
    this.garageOpen = true;
    this._buildGarageRows();
    this._refreshLayers();
  }

  hideGarage() {
    this.garageOpen = false;
    this._refreshLayers();
  }

  showSettings() {
    this.settingsOpen = true;
    this._refreshSettingsRows();
    this._refreshLayers();
  }

  hideSettings() {
    this.settingsOpen = false;
    this._refreshLayers();
  }

  showCredits() {
    this.creditsOpen = true;
    this._refreshLayers();
  }

  hideCredits() {
    this.creditsOpen = false;
    this._refreshLayers();
  }

  // -- mission panel / weapon / character ------------------------------------------------------------
  updateMissionPanel() {
    const g = this.game;
    const m = g.missions;
    if (m && m.active && m.current) {
      const cur = m.current;
      const act = cur.act || 'ACT I';
      const step = m.step;
      let body = `${cur.name} — ${step ? step.text : ''}`;
      if (m.stepTimeLeft > 0) body += `  [${Math.ceil(m.stepTimeLeft)}s]`;
      this.missionPanelTitle.textContent = `JOB ${Math.min((m.nextIdx || 0) + 1, 12)}/12 · ${act}`;
      this.missionPanelBody.textContent = body;
      this.missionTopEl.textContent = `MISSION ${Math.min((m.nextIdx || 0) + 1, 12)}/12 · ${act}`;
    } else {
      const next = m && m.next ? m.next() : null;
      this.missionPanelTitle.textContent = 'FREE ROAM — LA VEGA';
      this.missionPanelBody.textContent = next
        ? `Next job: ${next.name} — talk to La Rosa at the club.`
        : 'All jobs complete. La Vega is yours.';
      this.missionTopEl.textContent = 'FREE ROAM';
    }
    this.missionPanelLoc.textContent = this._locLine();
  }

  updateWeapon() {
    const p = this.game.player;
    if (!p) return;
    const w = WEAPONS[p.weapon];
    if (!w || p.weapon === 'fists') {
      this.weaponEl.textContent = 'FISTS';
    } else {
      const reserve = p.weapons[p.weapon] ? p.weapons[p.weapon].ammo : 0;
      const mag = p.magAmmo === Infinity ? '∞' : Math.round(p.magAmmo);
      this.weaponEl.textContent = `${w.name.toUpperCase()} ${mag}/${reserve === Infinity ? '∞' : Math.round(reserve)}`;
    }
    this._refreshWheel();
  }

  updateCharacter() {
    const id = this.game.selectedChar || (this.game.player && this.game.player.charId) || 'jax';
    for (const [key, btn] of Object.entries(this._charBtns)) {
      btn.classList.toggle('active', key === id);
    }
  }

  // -- notify / hint / prompt / flashes / social --------------------------------------------------------
  notify(text) {
    if (!text) return;
    const t = el('div', 'lv-toast', this.toastsEl, text);
    this._toastCount += 1;
    while (this.toastsEl.children.length > 4) this.toastsEl.removeChild(this.toastsEl.firstChild);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 4500);
  }

  hint(text) {
    if (!text) { this.hintVisible = false; this._refreshLayers(); return; }
    this.hintEl.textContent = text;
    this.hintVisible = true;
    this._hintT = 6;
    this._refreshLayers();
  }

  showPrompt(text) {
    this.promptEl.textContent = text || '';
    this.promptVisible = true;
    this._refreshLayers();
  }

  hidePrompt() {
    this.promptVisible = false;
    this._refreshLayers();
  }

  flashWanted() {
    this._flashWantedT = 0.6;
  }

  flashDamage() {
    this._flashT = 0.5;
  }

  socialPost(user, text) {
    const post = el('div', 'lv-social-post', this.socialEl, `${user}: ${text}`);
    this._socialCount += 1;
    this._socialFeed.push(`${user}: ${text}`);
    if (this._socialFeed.length > 20) this._socialFeed.shift();
    while (this.socialEl.children.length > 3) this.socialEl.removeChild(this.socialEl.firstChild);
    setTimeout(() => { if (post.parentNode) post.parentNode.removeChild(post); }, 8000);
  }

  // -- district + location --------------------------------------------------------------------------------
  districtName() {
    const p = this.game.player;
    if (!p) return 'La Vega';
    const d = DISTRICTS.find((dd) => p.x >= dd.x0 && p.x < dd.x1 && p.z >= dd.z0 && p.z < dd.z1);
    return d ? d.name : 'La Vega';
  }

  _districtAt(x, z) {
    return DISTRICTS.find((dd) => x >= dd.x0 && x < dd.x1 && z >= dd.z0 && z < dd.z1) || null;
  }

  _streetName(x, z) {
    let bestI = 0; let bestD = Infinity;
    for (let i = 0; i < ROADS.length; i++) {
      const d = Math.abs(x - ROADS[i]);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    const ns = STREET_NS[bestI] || '';
    let bestJ = 0; let bestE = Infinity;
    for (let j = 0; j < ROADS.length; j++) {
      const d = Math.abs(z - ROADS[j]);
      if (d < bestE) { bestE = d; bestJ = j; }
    }
    const ew = STREET_EW[bestJ] || '';
    if (bestD < 5) return ns;
    if (bestE < 5) return ew;
    return `${ns} & ${ew}`;
  }

  _locLine() {
    const g = this.game;
    const p = g.player;
    if (!p) return '';
    const d = this._districtAt(p.x, p.z);
    const standing = d ? Math.round(g.standing ? (g.standing[d.key] || 0) : 0) : 0;
    const name = d ? d.name.toUpperCase() : 'LA VEGA';
    return `${name} · ${this._streetName(p.x, p.z)} · standing ${standing}%`;
  }

  // -- per-frame -------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (this._bannerT > 0) this._bannerT -= dt;
    if (this._hintT > 0) {
      this._hintT -= dt;
      if (this._hintT <= 0) this.hintVisible = false;
    }
    if (this._flashT > 0) this._flashT -= dt;
    if (this._flashWantedT > 0) this._flashWantedT -= dt;
    if (this._driftT > 0) this._driftT -= dt;
    if (this._rewardT > 0) this._rewardT -= dt;
    if (this._dialogueTimer > 0 && this.dialogueOpen) {
      this._dialogueTimer -= dt;
      if (this._dialogueTimer <= 0) this._advanceDialogue();
    }

    // District banner: show 3.5 s when the player enters a new district.
    if (p && g.state === 'playing') {
      const d = this._districtAt(p.x, p.z);
      const key = d ? d.key : 'none';
      if (key !== this._bannerDistrict) {
        this._bannerDistrict = key;
        if (d) {
          this.bannerName.textContent = d.name.toUpperCase();
          this.bannerSub.textContent = `${this._streetName(p.x, p.z)} · standing ${Math.round((g.standing && g.standing[d.key]) || 0)}%`;
          this._bannerT = 3.5;
        }
      }
    }

    // Top bar.
    if (p) {
      this.moneyEl.textContent = fmtMoney(p.money);
      const wanted = g.police ? g.police.wanted : 0;
      for (let i = 0; i < 5; i++) this.starEls[i].classList.toggle('on', i < wanted);
      this.rankEl.textContent = `RANK ${g.rank || 0} · ${RANK_NAMES[clamp(g.rank || 0, 0, 5)]}`;
      const stIdx = g.audio ? g.audio.stationIdx : 0;
      this.radioEl.textContent = `♪ ${STATION_NAMES[clamp(stIdx, 0, 2)]}`;
      this.qualityEl.textContent = `Quality: ${settings.get('quality')}`;
      if (g.weather) {
        const hh = Math.floor(g.weather.time);
        const mm = Math.floor((g.weather.time - hh) * 60);
        const pad = (n) => String(n).padStart(2, '0');
        this.clockEl.textContent = `DAY ${g.weather.day} · ${pad(hh)}:${pad(mm)} · ${g.weather.weatherName()}`;
      }
      // Bars.
      this.hpFill.style.width = `${clamp(p.health, 0, 100)}%`;
      this.armorFill.style.width = `${clamp(p.armor, 0, 100)}%`;
      this.stamFill.style.width = `${clamp(p.stamina, 0, 100)}%`;
      // Weapon readout.
      const w = WEAPONS[p.weapon];
      if (!w || p.weapon === 'fists') {
        this.weaponEl.textContent = 'FISTS';
      } else {
        const reserve = p.weapons[p.weapon] ? p.weapons[p.weapon].ammo : 0;
        const mag = p.magAmmo === Infinity ? '∞' : Math.round(p.magAmmo);
        this.weaponEl.textContent = `${w.name.toUpperCase()} ${mag}/${reserve === Infinity ? '∞' : Math.round(reserve)}`;
      }
      // Car HUD.
      if (p.inCar && g.vehicles && g.vehicles.playerCar) {
        const car = g.vehicles.playerCar;
        this.carNameEl.textContent = car.spec ? car.spec.name : 'CAR';
        const kmh = Math.round(Math.abs(car.speed || 0) * 3.6);
        this.carSpeedEl.textContent = `${kmh} km/h · ⛽ ${Math.round(car.fuel || 0)}% · ❤ ${Math.round(car.cond || 0)}%`;
      }
    }

    // Damage flash + wanted blink.
    if (this.flashEl) this.flashEl.style.opacity = this._flashT > 0 ? '0.45' : '0';
    if (this._flashWantedT > 0) {
      this.starEls.forEach((s) => s.classList.add('lv-blink'));
    } else {
      this.starEls.forEach((s) => s.classList.remove('lv-blink'));
    }

    // Dispatch board (throttled).
    this._dispatchT -= dt;
    if (this._dispatchT <= 0) {
      this._dispatchT = 0.25;
      if (g.police && g.police.wanted > 0) {
        const d = g.police.getDispatch();
        const lines = [`LVPD DISPATCH — ${d.wanted}★`];
        for (const u of d.units.slice(0, 4)) lines.push(`${u.tactic} · ${u.dist}m${u.seen ? ' · SEEN' : ''}`);
        if (d.heli) lines.push('HELI AIRBORNE');
        if (d.swat) lines.push('SWAT DEPLOYED');
        if (d.roadblock) lines.push('ROADBLOCK AHEAD');
        this.dispatchEl.textContent = lines.join('\n');
      } else {
        this.dispatchEl.textContent = '';
      }
    }

    // Minimap (throttled).
    this._minimapT -= dt;
    if (this._minimapT <= 0) {
      this._minimapT = 0.1;
      this._drawMinimap();
    }

    this._refreshLayers();
  }

  // -- minimap -----------------------------------------------------------------------
  _drawMinimap() {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const S = 0.5; // world 400 -> 200 px
    const g = this.game;
    ctx.clearRect(0, 0, 200, 200);
    ctx.fillStyle = '#1b2b1f';
    ctx.fillRect(0, 0, 200, 200);
    // Sea (west strip).
    ctx.fillStyle = '#174a6e';
    ctx.fillRect(0, 0, 15 * S, 200);
    // River band (rough, east side).
    ctx.fillStyle = '#1d5a80';
    ctx.fillRect(272 * S, 0, 12 * S, 200);
    // Roads.
    ctx.strokeStyle = '#5a5a5a';
    ctx.lineWidth = 2;
    for (const r of ROADS) {
      ctx.beginPath(); ctx.moveTo(r * S, 0); ctx.lineTo(r * S, 200); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, r * S); ctx.lineTo(200, r * S); ctx.stroke();
    }
    // District tint: downtown brighter.
    ctx.fillStyle = 'rgba(255, 220, 120, 0.08)';
    ctx.fillRect(91 * S, 91 * S, (169 - 91) * S, (169 - 91) * S);
    // Mission marker.
    const m = g.missions;
    if (m && m.markerPos) {
      const pulse = 4 + Math.sin(performance.now() / 200) * 1.5;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(m.markerPos.x * S, m.markerPos.z * S, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Police blips.
    if (g.police && g.police.units) {
      ctx.fillStyle = '#ff4040';
      for (const u of g.police.units) {
        if (!u.car) continue;
        ctx.beginPath();
        ctx.arc(u.car.x * S, u.car.z * S, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Player arrow.
    const p = g.player;
    if (p) {
      ctx.save();
      ctx.translate(p.x * S, p.z * S);
      ctx.rotate(Math.PI - p.heading);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    // North label.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', 94, 12);
  }

  // -- settings rows ---------------------------------------------------------------------
  _buildSettingsRow(parent, key, label, options) {
    const row = el('div', 'lv-settings-row', parent);
    el('span', '', row, label);
    const select = el('select', 'lv-select', row);
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      select.appendChild(o);
    }
    select.addEventListener('change', () => {
      let v = select.value;
      if (key === 'sensitivity') v = Number(v);
      if (key === 'music' || key === 'sfx' || key === 'cameraShake' || key === 'showHints') v = (v === 'on');
      if (key === 'mute') v = (v === 'on');
      settings.set(key, v);
      if (key === 'mute' && this.game.audio) this.game.audio.setMuted(settings.get('mute'));
      if (key === 'music' || key === 'sfx') this.game.audio?.setMuted(settings.get('mute'));
    });
    this._settingsRows[key] = select;
  }

  _refreshSettingsRows() {
    for (const [key, select] of Object.entries(this._settingsRows)) {
      const v = settings.get(key);
      if (typeof v === 'boolean') select.value = v ? 'on' : 'off';
      else select.value = String(v);
    }
  }

  // -- dealer / garage rows ------------------------------------------------------------------
  _buildDealerRows() {
    this.dealerRowsEl.textContent = '';
    const p = this.game.player;
    for (const key of CAR_CATALOG) {
      const spec = CAR_MODELS[key];
      if (!spec) continue;
      const row = el('div', 'lv-dealer-row', this.dealerRowsEl);
      const owned = (this.game.ownedCars || []).some((c) => c.specKey === key);
      const afford = p ? p.money >= spec.price : false;
      el('span', '', row, `${spec.name} — ${fmtMoney(spec.price)} · top ${Math.round((spec.top || 0) * 3.6)} km/h${owned ? ' · OWNED' : ''}`);
      const buy = el('button', 'lv-btn lv-btn-small', row, owned ? 'OWNED' : 'BUY');
      buy.disabled = owned || !afford;
      buy.addEventListener('click', () => this.game.buyCar(key));
    }
  }

  _buildGarageRows() {
    this.garageRowsEl.textContent = '';
    const cars = this.game.ownedCars || [];
    if (cars.length === 0) {
      el('div', '', this.garageRowsEl, 'No cars stored. Buy one at Auto Palms.');
      return;
    }
    cars.forEach((c, i) => {
      const spec = CAR_MODELS[c.specKey];
      const row = el('div', 'lv-dealer-row', this.garageRowsEl);
      el('span', '', row, `${spec ? spec.name : c.specKey} · cond ${Math.round(c.cond)}% · fuel ${Math.round(c.fuel)}%`);
      const take = el('button', 'lv-btn lv-btn-small', row, 'TAKE OUT');
      take.addEventListener('click', () => {
        this.game.takeOutCar(i);
        this.hideGarage();
      });
    });
  }

  // -- weapon wheel ----------------------------------------------------------------------------
  _refreshWheel() {
    const p = this.game.player;
    for (const id of WHEEL_IDS) {
      const slot = this._wheelSlots[id];
      if (!slot) continue;
      const w = WEAPONS[id];
      const owned = !!(p && p.weapons && p.weapons[id]);
      const isCurrent = !!(p && p.weapon === id);
      const reserve = owned && p.weapons[id] ? p.weapons[id].ammo : 0;
      slot.name.textContent = owned
        ? `${w.name} ${p.magAmmo !== Infinity && isCurrent ? Math.round(p.magAmmo) : ''}/${reserve === Infinity ? '∞' : Math.round(reserve)}`
        : `${w.name} — LOCKED`;
      slot.slot.classList.toggle('active', isCurrent);
      slot.slot.style.opacity = owned ? '1' : '0.45';
    }
  }

  // -- save slots -----------------------------------------------------------------------------------
  _refreshLoadSlots() {
    for (let s = 1; s <= 3; s++) {
      const b = this._loadBtns[s - 1];
      if (!b) continue;
      let label = `SLOT ${s} — EMPTY`;
      try {
        const raw = localStorage.getItem(`${SAVE_KEY}-slot${s}`);
        if (raw) {
          const d = JSON.parse(raw);
          const when = d.savedAt ? new Date(d.savedAt).toLocaleDateString() : '';
          label = `SLOT ${s} — ${(d.charId || 'jax').toUpperCase()} · ${fmtMoney(d.money || 0)} · ${when}`;
        }
      } catch (e) { /* unreadable slot */ }
      b.textContent = label;
    }
  }

  // -- phone tabs --------------------------------------------------------------------------------------
  _showPhoneTab(id) {
    this._phoneTab = id;
    for (const [key, tab] of Object.entries(this._phoneTabs)) {
      tab.classList.toggle('active', key === id);
    }
    const body = this._phoneBody;
    if (!body) return;
    body.textContent = '';
    if (id === 'contacts') {
      const contacts = [
        ['La Rosa', 'Club owner — your boss. Call about work.', 'La Rosa', 'Jax, baby. The club needs you — come see me when you are ready for the next job.'],
        ['Manny', 'Mechanic — repairs and the garage.', 'Manny', 'Your ride needs love? Bring it to the garage, I will fix it up cheap.'],
        ['Crew', 'Plates · Fix · Eyes — call for backup.', 'Crew', 'We got you. Plates, a fix, or eyes on the street — say the word.'],
      ];
      for (const [name, desc, who, line] of contacts) {
        const row = el('div', 'lv-contact', body);
        el('div', 'lv-contact-name', row, name);
        el('div', 'lv-contact-desc', row, desc);
        row.addEventListener('click', () => {
          this.game.togglePhone();
          this.showDialogue(who, line);
        });
      }
    } else if (id === 'gps') {
      const spots = [
        ["La Rosa's Club", PLACES.club],
        ['Auto Palms Dealer', PLACES.dealer],
        ["Manny's Garage", PLACES.garage],
        ['La Vega General', PLACES.hospital],
        ['Airport', PLACES.airport],
      ];
      for (const [name, place] of spots) {
        const row = el('div', 'lv-contact', body);
        el('div', 'lv-contact-name', row, name);
        el('div', 'lv-contact-desc', row, place ? `(${Math.round(place.x)}, ${Math.round(place.y)})` : '');
        row.addEventListener('click', () => {
          this.notify(`GPS marked: ${name}.`);
          this.game.togglePhone();
        });
      }
    } else {
      const feed = (this._socialFeed || []).slice(-5).reverse();
      if (feed.length === 0) {
        el('div', 'lv-contact-desc', body, 'No posts yet. Cause some chaos and the city will talk.');
      }
      for (const post of feed) {
        el('div', 'lv-contact', body, post);
      }
    }
  }

  // -- touch joystick -------------------------------------------------------------------------------------
  _bindStick(stick, knob) {
    let active = null;
    const R = 40;
    const setFromEvent = (e) => {
      const rect = stick.getBoundingClientRect();
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const t = this.game.input.touch;
      t.mx = dx / R;
      t.mz = dy / R;
    };
    const reset = () => {
      active = null;
      knob.style.transform = 'translate(0px, 0px)';
      const t = this.game.input.touch;
      t.mx = 0;
      t.mz = 0;
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      active = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      setFromEvent(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (active !== e.pointerId) return;
      setFromEvent(e);
    });
    stick.addEventListener('pointerup', (e) => { if (active === e.pointerId) reset(); });
    stick.addEventListener('pointercancel', () => reset());
  }
}
