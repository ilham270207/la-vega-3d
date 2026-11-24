// hud.js — La Vega HUD (round 12).
// Builds every DOM panel the game needs (the HTML shell has no HUD
// markup) and keeps it in sync with the game state. Round 12 adds the
// crew panel, the station panel (refuel / repair) and the fuel gauge.
// There is no credits screen in the game.
import { WEAPONS, CAR_MODELS, DISTRICTS, ROADS, STREET_NS, STREET_EW } from './config.js';
import { MAX_CREW } from './crew.js';

const RADIO_NAMES = ['Neon Tide FM 98.6', 'Mango Radio 101', 'Static Dub 88.1'];

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export class HUD {
  constructor(game) {
    this.game = game;
    this.dialogueQueue = [];
    this.dialogueCb = null;
    this.cardT = 0;
    this.rewardT = 0;
    this.hintT = 0;
    this.toastT = 0;
    this.mapT = 0;
    this._build();
  }

  _build() {
    const g = this.game;
    // Loading overlay.
    this.loadingEl = el('div', 'lv-loading', document.body);
    el('div', 'lv-loading-title', this.loadingEl, 'LA VEGA');
    el('div', 'lv-loading-sub', this.loadingEl, 'Open-world crime · La Vega');
    const bar = el('div', 'lv-loading-bar', this.loadingEl);
    this.loadingFill = el('div', 'lv-loading-fill', bar);
    this.loadingPct = el('div', 'lv-loading-pct', this.loadingEl, '0%');
    this.loadingTip = el('div', 'lv-loading-tip', this.loadingEl, 'Loading La Vega…');
    // Menu (translucent: the live 3D city shows through).
    this.menuEl = el('div', 'lv-menu hidden', document.body);
    const inner = el('div', 'lv-menu-inner', this.menuEl);
    el('div', 'lv-title', inner, 'LA VEGA');
    el('div', 'lv-subtitle', inner, 'Twelve jobs. One island. No rules but yours.');
    const btns = el('div', 'lv-menu-btns', inner);
    this.btnNew = el('button', 'lv-btn lv-btn-primary', btns, 'NEW GAME');
    this.btnNew.onclick = () => g.newGame(g.menuChar || 'jax');
    this.btnLoad = el('button', 'lv-btn', btns, 'LOAD GAME');
    this.btnLoad.onclick = () => this.showLoadMenu();
    this.btnSettings = el('button', 'lv-btn', btns, 'SETTINGS');
    this.btnSettings.onclick = () => this.showSettings();
    this.btnTrailer = el('button', 'lv-btn', btns, 'WATCH TRAILER');
    this.btnTrailer.onclick = () => g.playTrailer();
    const charRow = el('div', 'lv-char-row', inner);
    el('span', 'lv-char-label', charRow, 'DRIVER:');
    this.btnJax = el('button', 'lv-btn lv-btn-small lv-btn-char active', charRow, 'JAX');
    this.btnJax.onclick = () => this._pickChar('jax');
    this.btnMaya = el('button', 'lv-btn lv-btn-small lv-btn-char', charRow, 'MAYA');
    this.btnMaya.onclick = () => this._pickChar('maya');
    this.loadRow = el('div', 'lv-load-row hidden', inner);
    // HUD root.
    this.root = el('div', 'lv-hud hidden', document.body);
    const top = el('div', 'lv-top', this.root);
    this.moneyEl = el('span', 'lv-money', top, '$0');
    this.rankEl = el('span', 'lv-rank', top, 'RANK 0 · NEWCOMER');
    this.missionTopEl = el('span', 'lv-mission-top', top, '');
    this.clockEl = el('span', 'lv-clock', top, 'DAY 1 · 12:00');
    this.radioEl = el('span', 'lv-radio', top, 'Neon Tide FM 98.6');
    this.weaponEl = el('span', 'lv-weapon', top, 'FISTS');
    this.collectEl = el('span', 'lv-collect hidden', top, '');
    this.qualityEl = el('span', 'lv-quality-pill', top, 'Quality: auto');
    this.qualityEl.onclick = () => g.cycleQuality();
    this.crewPill = el('span', 'lv-crew-pill lv-pill', top, 'CREW 0/4');
    this.crewPill.onclick = () => this.toggleCrewPanel();
    this.starsEl = el('div', 'lv-stars', this.root);
    this.starEls = [];
    for (let i = 0; i < 5; i++) this.starEls.push(el('span', 'lv-star', this.starsEl, '★'));
    const bars = el('div', 'lv-bars', this.root);
    this.hpFill = el('div', 'lv-fill', el('div', 'lv-bar lv-bar-hp', bars));
    this.armorFill = el('div', 'lv-fill', el('div', 'lv-bar lv-bar-armor', bars));
    this.stamFill = el('div', 'lv-fill', el('div', 'lv-bar lv-bar-stam', bars));
    this.locEl = el('div', 'lv-loc', this.root, 'MARINA');
    const mapWrap = el('div', 'lv-map-wrap', this.root);
    this.mapCanvas = el('canvas', 'lv-map', mapWrap);
    this.mapCanvas.width = 200; this.mapCanvas.height = 200;
    this.missionPanel = el('div', 'lv-mission-panel', this.root, '');
    this.dispatchEl = el('div', 'lv-dispatch hidden', this.root, '');
    this.carhud = el('div', 'lv-carhud hidden', this.root);
    this.carNameEl = el('div', 'lv-car-name', this.carhud, '');
    this.carSpeedEl = el('div', 'lv-car-speed', this.carhud, '');
    this.carFuelEl = el('div', 'lv-car-fuel', this.carhud, '');
    this.carCondEl = el('div', 'lv-car-cond', this.carhud, '');
    this.carNitroEl = el('div', 'lv-car-nitro', this.carhud, '');
    this.toastsEl = el('div', 'lv-toasts', this.root);
    this.socialEl = el('div', 'lv-social', this.root);
    this.hintEl = el('div', 'lv-hint hidden', this.root, '');
    this.promptEl = el('div', 'lv-prompt hidden', this.root, '');
    this.dialogueEl = el('div', 'lv-dialogue hidden', this.root);
    this.dialogueName = el('div', 'lv-dialogue-name', this.dialogueEl, '');
    this.dialogueText = el('div', 'lv-dialogue-text', this.dialogueEl, '');
    this.dialogueEl.onclick = () => this._advanceDialogue();
    this.cardEl = el('div', 'lv-card hidden', this.root);
    this.cardAct = el('div', 'lv-card-act', this.cardEl, '');
    this.cardTitle = el('div', 'lv-card-title', this.cardEl, '');
    this.cardText = el('div', 'lv-card-text', this.cardEl, '');
    this.rewardEl = el('div', 'lv-reward hidden', this.root, '');
    this.driftEl = el('div', 'lv-drift hidden', this.root, '');
    this.flashEl = el('div', 'lv-flash', this.root);
    this.bustedEl = el('div', 'lv-busted hidden', this.root);
    el('div', 'lv-busted-title', this.bustedEl, 'BUSTED');
    el('div', 'lv-busted-text', this.bustedEl, 'The LVPD got you. Bail posted — you wake up at La Vega General.');
    this.helpEl = el('div', 'lv-help', this.root,
      'WASD drive · E interact · F fire · Q punch · Tab weapons · T phone · P pause · R radio · H horn · N nitro · V camera · Space jump · Z crew regroup · X crew attack · C crew hold · B business');
    this.phoneBtn = el('button', 'lv-phone-btn', this.root, '☏');
    this.phoneBtn.onclick = () => this.togglePhone();
    this.phoneEl = el('div', 'lv-phone hidden', this.root);
    el('div', 'lv-phone-title', this.phoneEl, 'PHONE');
    const tabs = el('div', 'lv-phone-tabs', this.phoneEl);
    const tabC = el('button', 'lv-phone-tab active', tabs, 'CONTACTS');
    const tabS = el('button', 'lv-phone-tab', tabs, 'SOCIAL');
    tabC.onclick = () => { this._phoneTab('contacts'); tabC.classList.add('active'); tabS.classList.remove('active'); };
    tabS.onclick = () => { this._phoneTab('social'); tabS.classList.add('active'); tabC.classList.remove('active'); };
    this.phoneBody = el('div', '', this.phoneEl);
    this._phoneTab('contacts');
    // Weapon wheel.
    this.wheelEl = el('div', 'lv-wheel hidden', this.root);
    el('div', 'lv-wheel-title', this.wheelEl, 'WEAPONS');
    this.wheelSlots = el('div', '', this.wheelEl);
    const wItems = el('div', 'lv-wheel-items', this.wheelEl);
    const healBtn = el('button', 'lv-wheel-item', wItems, 'SNACK +25 HP ($5)');
    healBtn.onclick = () => g.useSnack();
    const closeW = el('button', 'lv-wheel-item', wItems, 'CLOSE');
    closeW.onclick = () => this.hideWeaponMenu();
    // Dealer.
    this.dealerEl = el('div', 'lv-dealer hidden', this.root);
    el('div', 'lv-dealer-title', this.dealerEl, 'AUTO PALMS — BUY A CAR');
    this.dealerRows = el('div', '', this.dealerEl);
    const dClose = el('button', 'lv-btn', this.dealerEl, 'CLOSE');
    dClose.onclick = () => this.hideDealer();
    // Garage.
    this.garageEl = el('div', 'lv-garage hidden', this.root);
    el('div', 'lv-dealer-title', this.garageEl, "MANNY'S GARAGE");
    this.garageRows = el('div', '', this.garageEl);
    const driveOut = el('button', 'lv-btn lv-btn-primary', this.garageEl, 'DRIVE OUT');
    driveOut.onclick = () => g.exitGarage();
    const gClose = el('button', 'lv-btn', this.garageEl, 'STAY');
    gClose.onclick = () => this.hideGarageMenu();
    // Crew panel.
    this.crewEl = el('div', 'lv-crew hidden', this.root);
    el('div', 'lv-dealer-title', this.crewEl, 'CREW');
    this.crewRows = el('div', '', this.crewEl);
    const crewHint = el('div', '', this.crewEl);
    crewHint.style.cssText = 'font-size:12px;color:#bcd;margin-top:6px';
    crewHint.textContent = 'Walk up to a pedestrian and press E to recruit. Z regroup · X attack · C hold.';
    const crewClose = el('button', 'lv-btn', this.crewEl, 'CLOSE');
    crewClose.onclick = () => this.crewEl.classList.add('hidden');
    // Station panel.
    this.stationEl = el('div', 'lv-station hidden', this.root);
    this.stationTitle = el('div', 'lv-dealer-title', this.stationEl, 'PETRO VEGA');
    this.stationInfo = el('div', '', this.stationEl);
    this.stationInfo.style.cssText = 'font-size:13px;color:#cde;margin-bottom:8px';
    this.btnRefuel = el('button', 'lv-btn lv-btn-primary lv-station-refuel', this.stationEl, 'REFUEL $20');
    this.btnRefuel.onclick = () => g.refuelCar();
    this.btnRepair = el('button', 'lv-btn lv-station-repair', this.stationEl, 'REPAIR');
    this.btnRepair.onclick = () => g.repairCar();
    const stClose = el('button', 'lv-btn', this.stationEl, 'CLOSE');
    stClose.onclick = () => this.hideStationPanel();
    // Pause + settings.
    this.pauseEl = el('div', 'lv-pause hidden', this.root);
    el('div', 'lv-pause-title', this.pauseEl, 'PAUSED');
    this.pauseStats = el('div', 'lv-pause-stats', this.pauseEl, '');
    const bResume = el('button', 'lv-btn lv-btn-primary', this.pauseEl, 'RESUME');
    bResume.onclick = () => g.togglePause(false);
    const bSave = el('button', 'lv-btn', this.pauseEl, 'SAVE GAME');
    bSave.onclick = () => { g.saveGame(1); this.notify('Saved to slot 1.'); };
    const bSet = el('button', 'lv-btn', this.pauseEl, 'SETTINGS');
    bSet.onclick = () => this.showSettings();
    const bQuit = el('button', 'lv-btn', this.pauseEl, 'QUIT TO MENU');
    bQuit.onclick = () => g.quitToMenu();
    this.settingsEl = el('div', 'lv-settings hidden', this.root);
    el('div', 'lv-settings-title', this.settingsEl, 'SETTINGS');
    this._settingsRow('Quality', this._select(['auto', 'low', 'medium', 'high'], (v) => g.setQuality(v)));
    this._settingsRow('Music', this._slider(0, 100, 70, (v) => g.setMusicVolume(v / 100)));
    this._settingsRow('Effects', this._slider(0, 100, 80, (v) => g.setSfxVolume(v / 100)));
    this._settingsRow('Mute', this._select(['off', 'on'], (v) => g.setMuted(v === 'on')));
    this._settingsRow('Controls', this._select(['auto', 'touch', 'keyboard'], (v) => g.setControlMode(v)));
    const sClose = el('button', 'lv-btn', this.settingsEl, 'CLOSE');
    sClose.onclick = () => this.settingsEl.classList.add('hidden');
    // Touch controls.
    this.touchEl = el('div', 'lv-touch hidden', this.root);
    this.stickEl = el('div', 'lv-stick', this.touchEl);
    this.stickKnob = el('div', 'lv-stick-knob', this.stickEl);
    const btnWrap = el('div', 'lv-touch-btns', this.touchEl);
    this.touchBtns = {};
    for (const label of ['GAS', 'BRAKE', 'LEFT', 'RIGHT', 'ENTER', 'PUNCH', 'JUMP', 'FIRE']) {
      const b = el('button', 'lv-tbtn', btnWrap, label);
      b.style.width = '48px'; b.style.height = '48px';
      b.dataset.act = label.toLowerCase();
      this.touchBtns[label.toLowerCase()] = b;
      const down = (e) => { e.preventDefault(); g.touchAction(label.toLowerCase(), true); };
      const up = (e) => { e.preventDefault(); g.touchAction(label.toLowerCase(), false); };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      b.addEventListener('mousedown', down);
      b.addEventListener('mouseup', up);
      b.addEventListener('mouseleave', up);
    }
    this._bindStick();
    this.crosshairEl = el('div', 'lv-crosshair hidden', this.root, '+');
  }

  _settingsRow(label, control) {
    const row = el('div', 'lv-settings-row', this.settingsEl);
    el('span', '', row, label);
    row.appendChild(control);
    return row;
  }

  _select(options, onChange) {
    const s = document.createElement('select');
    s.className = 'lv-select';
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o;
      s.appendChild(opt);
    }
    s.onchange = () => onChange(s.value);
    return s;
  }

  _slider(min, max, val, onChange) {
    const s = document.createElement('input');
    s.type = 'range'; s.min = min; s.max = max; s.value = val;
    s.style.width = '140px';
    s.oninput = () => onChange(+s.value);
    return s;
  }

  _bindStick() {
    const stick = this.stickEl;
    const knob = this.stickKnob;
    let active = null;
    const setFromEvent = (t) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = (t.clientX - cx) / (r.width / 2);
      let dy = (t.clientY - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
      const g = this.game;
      g.input.moveX = dx;
      g.input.moveZ = dy;
      if (g.player && (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1)) {
        // Stick up = forward: face away from the camera, turned by the
        // stick angle (right = clockwise = heading decreases).
        g.player.heading = g.camYaw + Math.PI - Math.atan2(dx, -dy);
      }
    };
    stick.addEventListener('touchstart', (e) => { e.preventDefault(); active = e.changedTouches[0].identifier; setFromEvent(e.changedTouches[0]); }, { passive: false });
    stick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === active) setFromEvent(t);
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === active) {
          active = null;
          knob.style.transform = '';
          this.game.input.moveX = 0;
          this.game.input.moveZ = 0;
        }
      }
    };
    stick.addEventListener('touchend', end);
    stick.addEventListener('touchcancel', end);
  }

  _pickChar(id) {
    this.game.menuChar = id;
    this.btnJax.classList.toggle('active', id === 'jax');
    this.btnMaya.classList.toggle('active', id === 'maya');
    if (this.game.state === 'playing' && this.game.player) this.game.characters.switchCharacter(id);
  }

  _phoneTab(tab) {
    const g = this.game;
    this.phoneBody.innerHTML = '';
    if (tab === 'contacts') {
      for (const [name, desc, fn] of [
        ['La Rosa', 'Club owner · jobs', () => g.callContact('larosa')],
        ['Manny', 'Garage · repairs', () => g.callContact('manny')],
        ['Crew', 'Manage your crew', () => this.toggleCrewPanel()],
      ]) {
        const c = el('div', 'lv-contact', this.phoneBody);
        el('div', 'lv-contact-name', c, name);
        el('div', 'lv-contact-desc', c, desc);
        c.onclick = fn;
      }
    } else {
      for (const post of (g.socialFeed || ['Welcome to La Vega Social!'])) {
        el('div', 'lv-phone-post', this.phoneBody, post);
      }
    }
  }

  // ---------- visibility ----------
  showMenu() {
    this.menuEl.classList.remove('hidden');
    this.root.classList.add('hidden');
    this.loadingEl.classList.add('hidden');
  }

  hideMenu() {
    this.menuEl.classList.add('hidden');
    this.root.classList.remove('hidden');
  }

  showLoading(pct, tip) {
    this.loadingEl.classList.remove('hidden');
    this.loadingFill.style.width = `${pct}%`;
    this.loadingPct.textContent = `${Math.round(pct)}%`;
    if (tip) this.loadingTip.textContent = tip;
  }

  hideLoading() { this.loadingEl.classList.add('hidden'); }

  showLoadMenu() {
    const g = this.game;
    this.loadRow.classList.remove('hidden');
    this.loadRow.innerHTML = '';
    const slots = g.save ? g.save.listSlots() : [];
    if (!slots.length) {
      const note = el('div', '', this.loadRow, 'No saves yet.');
      note.style.cssText = 'color:#789;font-size:12px;margin-top:8px';
    }
    for (const s of slots) {
      const b = el('button', 'lv-btn lv-btn-small', this.loadRow, `LOAD SLOT ${s.slot} — ${s.savedAt || ''}`);
      b.onclick = () => g.loadGame(s.slot);
    }
  }

  // ---------- toasts / hints / prompts ----------
  notify(text) {
    const t = el('div', 'lv-toast', this.toastsEl, text);
    setTimeout(() => { t.style.opacity = '0'; }, 3200);
    setTimeout(() => t.remove(), 4000);
  }

  toast(text) { this.notify(text); }

  hint(text) {
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
    this.hintT = 4;
  }

  setPrompt(text) {
    if (!text) { this.promptEl.classList.add('hidden'); return; }
    this.promptEl.textContent = text;
    this.promptEl.classList.remove('hidden');
  }

  flashWanted() {
    this.flashEl.style.opacity = '1';
    setTimeout(() => { this.flashEl.style.opacity = '0'; }, 180);
  }

  showBusted() {
    this.bustedEl.classList.remove('hidden');
    setTimeout(() => this.bustedEl.classList.add('hidden'), 3200);
  }

  // ---------- dialogue / cards ----------
  showDialogue(a, b, c) {
    let name = a;
    let role = '';
    let text = b;
    if (c !== undefined) { role = b; text = c; }
    this.dialogueName.textContent = role ? `${name} · ${role}` : name;
    this.dialogueText.textContent = text;
    this.dialogueEl.classList.remove('hidden');
  }

  showDialogueSequence(seq) {
    this.dialogueQueue = Array.isArray(seq) ? [...seq] : [];
    this._advanceDialogue();
  }

  _advanceDialogue() {
    const next = this.dialogueQueue.shift();
    if (!next) { this.hideDialogue(); return; }
    this.showDialogue(next.name || '???', next.role || '', next.text || '');
  }

  hideDialogue() {
    this.dialogueQueue = [];
    this.dialogueEl.classList.add('hidden');
  }

  showMissionCard(act, title, text) {
    this.cardAct.textContent = act || '';
    this.cardTitle.textContent = title || '';
    this.cardText.textContent = text || '';
    this.cardEl.classList.remove('hidden');
    this.cardT = 3.2;
  }

  hideMissionCard() {
    this.cardEl.classList.add('hidden');
    this.cardT = 0;
  }

  showReward(text, sub) {
    this.rewardEl.textContent = sub ? `${text} — ${sub}` : text;
    this.rewardEl.classList.remove('hidden');
    this.rewardT = 2.5;
  }

  updateMissionPanel() {
    const g = this.game;
    const m = g.missions ? g.missions.current : null;
    if (!m) {
      const next = g.missions ? g.missions.nextMission : null;
      this.missionPanel.innerHTML = next
        ? `<b>JOB ${next.id}/12 · ACT ${next.act} — ${next.name}</b><br>Talk to La Rosa at the club — press E near her`
        : '<b>FREE ROAM</b><br>La Vega is yours.';
      this.missionTopEl.textContent = next ? `MISSION ${next.id}/12 · ACT ${next.act} — ${next.name}` : 'FREE ROAM';
      return;
    }
    const step = g.missions.step;
    const idx = g.missions.stepIdx || 0;
    const total = m.steps ? m.steps.length : 1;
    this.missionPanel.innerHTML = `<b>JOB ${m.id}/12 · ACT ${m.act} — ${m.name}</b><br>${step ? step.text : ''}<br>STAGE ${idx + 1}/${total}`;
    this.missionTopEl.textContent = `MISSION ${m.id}/12 · ACT ${m.act} — ${m.name}`;
  }

  // ---------- weapon wheel / dealer / garage ----------
  showWeaponMenu() {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    this.wheelSlots.innerHTML = '';
    for (const [id, def] of Object.entries(WEAPONS)) {
      if (!p.weapons[id]) continue;
      const slot = p.weapons[id];
      const b = el('button', 'lv-wheel-slot' + (p.weapon === id ? ' active' : ''), this.wheelSlots,
        `${def.name} ${def.mag ? `${slot.mag} / ${slot.reserve}` : ''}`);
      b.onclick = () => { p.setWeapon(id); this.hideWeaponMenu(); };
    }
    this.wheelEl.classList.remove('hidden');
  }

  hideWeaponMenu() { this.wheelEl.classList.add('hidden'); }

  showDealer() {
    const g = this.game;
    this.dealerRows.innerHTML = '';
    for (const [key, m] of Object.entries(CAR_MODELS)) {
      if (!m.buycar) continue;
      const row = el('div', 'lv-dealer-row', this.dealerRows);
      el('span', '', row, `${m.name} — $${m.price} · top ${m.top} m/s`);
      const b = el('button', 'lv-btn lv-btn-small', row, 'BUY');
      b.onclick = () => g.buyCar(key);
    }
    this.dealerEl.classList.remove('hidden');
  }

  hideDealer() { this.dealerEl.classList.add('hidden'); }

  showGarageMenu(cars) {
    this.garageRows.innerHTML = '';
    for (const c of cars) {
      const row = el('button', 'lv-garage-row', this.garageRows,
        `${c.name || c.specKey} — COND ${Math.round(c.cond || 100)}% · FUEL ${Math.round(c.fuel || 100)}%  [SELECT]`);
      row.onclick = () => {
        for (const r of this.garageRows.children) r.style.borderColor = '';
        row.style.borderColor = '#ffd34d';
        this.game.garageSelected = c;
      };
    }
    if (!cars.length) el('div', 'lv-garage-row', this.garageRows, 'No cars stored yet — steal one and drive it in.');
    this.garageEl.classList.remove('hidden');
  }

  hideGarageMenu() { this.garageEl.classList.add('hidden'); }

  // ---------- crew / station panels ----------
  toggleCrewPanel() {
    if (this.crewEl.classList.contains('hidden')) this.updateCrewPanel();
    else this.crewEl.classList.add('hidden');
  }

  updateCrewPanel() {
    const g = this.game;
    const members = g.crew ? g.crew.members : [];
    this.crewRows.innerHTML = '';
    if (!members.length) {
      el('div', '', this.crewRows, 'No crew yet — walk up to a pedestrian and press E to recruit.');
    }
    for (const m of members) {
      const row = el('div', 'lv-dealer-row', this.crewRows);
      el('span', '', row, `${m.crewName} · FOLLOWING`);
      const b = el('button', 'lv-btn lv-btn-small lv-crew-dismiss', row, 'DISMISS');
      b.onclick = () => { g.crew.dismiss(m); this.updateCrewPanel(); };
    }
    this.crewPill.textContent = `CREW ${members.length}/${MAX_CREW}`;
    if (members.length) this.crewEl.classList.remove('hidden');
  }

  showStationPanel(prompt) {
    this.stationTitle.textContent = prompt.station.name.toUpperCase();
    this.stationInfo.textContent = `Fuel ${prompt.fuel}% · Condition ${prompt.cond}%`;
    this.btnRefuel.style.display = prompt.canRefuel ? '' : 'none';
    this.btnRefuel.textContent = `REFUEL $${prompt.refuelCost}`;
    this.btnRepair.style.display = prompt.canRepair ? '' : 'none';
    this.btnRepair.textContent = `REPAIR $${prompt.repairCost}`;
    this.stationEl.classList.remove('hidden');
  }

  hideStationPanel() { this.stationEl.classList.add('hidden'); }

  togglePhone() {
    this.phoneEl.classList.toggle('hidden');
    this._phoneTab('contacts');
  }

  showSettings() {
    this.settingsEl.classList.remove('hidden');
  }

  showPause(statsText) {
    if (statsText) this.pauseStats.textContent = statsText;
    this.pauseEl.classList.remove('hidden');
  }

  hidePause() { this.pauseEl.classList.add('hidden'); }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) this.hideMissionCard();
    }
    if (this.rewardT > 0) {
      this.rewardT -= dt;
      if (this.rewardT <= 0) this.rewardEl.classList.add('hidden');
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.classList.add('hidden');
    }
    this.moneyEl.textContent = `$${Math.floor(p.money).toLocaleString()}`;
    this.rankEl.textContent = `RANK ${g.rank || 0} · ${g.rankName || 'NEWCOMER'}`;
    this.weaponEl.textContent = p.weapon === 'fists' ? 'FISTS'
      : `${WEAPONS[p.weapon].name} ${p.weapons[p.weapon].mag} / ${p.weapons[p.weapon].reserve}`;
    this.clockEl.textContent = g.weather ? g.weather.clockText() : 'DAY 1 · 12:00';
    this.radioEl.textContent = g.audio ? RADIO_NAMES[(g.audio.stationIdx || 0) % RADIO_NAMES.length] : RADIO_NAMES[0];
    const wanted = g.police ? g.police.wanted : 0;
    this.starEls.forEach((s, i) => {
      s.classList.toggle('on', i < wanted);
      s.classList.toggle('blink', i < wanted && g.police && g.police.seenPlayer);
    });
    this.hpFill.style.width = `${clamp(p.health, 0, 100)}%`;
    this.armorFill.style.width = `${clamp(p.armor, 0, 100)}%`;
    this.stamFill.style.width = `${clamp(p.stamina, 0, 100)}%`;
    const d = DISTRICTS.find((dd) => p.x >= dd.x0 && p.x < dd.x1 && p.z >= dd.z0 && p.z < dd.z1);
    this.locEl.textContent = d ? `${d.name} · ${this._streetName(p.x, p.z)} · ${Math.round((g.standing && g.standing[d.key]) || 0)}%` : '';
    // Dispatch board.
    if (g.police && wanted > 0 && g.police.getDispatch) {
      const disp = g.police.getDispatch();
      this.dispatchEl.classList.remove('hidden');
      this.dispatchEl.innerHTML = disp;
    } else {
      this.dispatchEl.classList.add('hidden');
    }
    // Car HUD.
    const car = g.vehicles ? g.vehicles.playerCar : null;
    if (car && p.inCar) {
      this.carhud.classList.remove('hidden');
      this.carNameEl.textContent = car.name || car.specKey;
      this.carSpeedEl.textContent = `${Math.round(Math.abs(car.speed) * 3.6)} km/h`;
      this.carFuelEl.textContent = `FUEL ${Math.round(car.fuel)}%${car.stalled ? ' — OUT OF FUEL!' : ''}`;
      this.carFuelEl.style.color = car.fuel < 20 ? '#ff5a5a' : '#7dff8a';
      this.carCondEl.textContent = `COND ${Math.round(car.cond)}%`;
      this.carNitroEl.textContent = `NITRO ${Math.round(car.nitro)}%`;
    } else {
      this.carhud.classList.add('hidden');
    }
    // Crosshair when aiming a firearm on foot.
    this.crosshairEl.classList.toggle('hidden', !(p.aimT > 0.05 && !p.inCar && p.weapon !== 'fists'));
    // Touch layer visibility follows the control mode.
    const touchMode = document.body.classList.contains('lv-touch-mode');
    this.touchEl.classList.toggle('hidden', !touchMode);
    this.helpEl.style.display = touchMode ? 'none' : '';
    // Station prompt (in-car, stopped, in a zone).
    if (g.stations) {
      const prompt = g.stations.promptFor(p);
      if (prompt) this.showStationPanel(prompt);
      else this.hideStationPanel();
    }
    // Minimap (throttled).
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 0.12;
      this._drawMinimap();
    }
  }

  _streetName(x, z) {
    let best = null;
    let bestD = Infinity;
    ROADS.forEach((L, i) => {
      const dx = Math.abs(x - L);
      if (dx < bestD) { bestD = dx; best = STREET_NS[i] || ''; }
      const dz = Math.abs(z - L);
      if (dz < bestD) { bestD = dz; best = STREET_EW[i] || ''; }
    });
    return best || '';
  }

  _drawMinimap() {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    const ctx = this.mapCanvas.getContext('2d');
    if (!ctx) return;
    const S = 200;
    const k = S / 400;
    ctx.fillStyle = '#12233a';
    ctx.fillRect(0, 0, S, S);
    // Sea (west strip).
    ctx.fillStyle = '#1e6fb0';
    ctx.fillRect(0, 0, 15 * k, S);
    // Sand.
    ctx.fillStyle = '#f2d492';
    ctx.fillRect(15 * k, 0, 15 * k, S);
    // Roads.
    ctx.strokeStyle = '#4a505c';
    ctx.lineWidth = 5;
    for (const L of [39, 65, 91, 117, 143, 169, 195, 221, 247]) {
      ctx.beginPath(); ctx.moveTo(L * k, 0); ctx.lineTo(L * k, 260 * k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, L * k); ctx.lineTo(260 * k, L * k); ctx.stroke();
    }
    // Stations.
    if (g.stations) {
      ctx.fillStyle = '#ff8c1a';
      for (const s of g.stations.stations) ctx.fillRect(s.x * k - 3, s.z * k - 3, 6, 6);
    }
    // Mission marker.
    if (g.missions && g.missions.markerPos) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(g.missions.markerPos.x * k, g.missions.markerPos.y * k, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Crew (green).
    if (g.crew) {
      ctx.fillStyle = '#7dff8a';
      for (const m of g.crew.members) {
        ctx.beginPath(); ctx.arc(m.x * k, m.z * k, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Police blips.
    if (g.police) {
      for (const u of g.police.units) {
        if (!u.car) continue;
        ctx.fillStyle = u.roadblock ? '#ff2222' : '#4da3ff';
        ctx.beginPath(); ctx.arc(u.car.x * k, u.car.z * k, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Player arrow.
    const px = p.x * k;
    const py = p.z * k;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - p.heading);
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
