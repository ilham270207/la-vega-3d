// La Vega 3D — HUD (round 8 re-author).
//
// Rebuilt from REFERENCE.md and the old build's HUD, which ilham liked:
// circular minimap top-left, mission panel under it, money / stars /
// rank / clock across the top, a big district banner that appears once
// and leaves, a prompt pill at bottom-centre, health at bottom-left,
// and a clean left-column menu over the live city.
//
// THE OVERLAP FIXES (ilham's phone screenshots, 24 Nov 10:08 WIB):
//  (a) the menu title "LA VEGA" bled through the "OFFICIAL TRAILER"
//      card — because the card stayed visible when the menu returned.
//      Now showMenu() ALWAYS hides the mission card, the dialogue, and
//      every in-game panel first. Nothing can bleed through the menu.
//  (b) the "ACT I" mission card and the Jax dialogue overlapped the
//      "LA VEGA Free roam" panel AND the touch buttons (FIRE/JUMP/ENTER/
//      PUNCH covered the dialogue text). Now a single layer manager
//      (_refreshLayers) owns visibility: while a card or a dialogue is
//      open, the touch controls, the mission panel, the prompt, the
//      hint, the dispatch board, the toasts and the social feed are ALL
//      hidden; the dialogue dismisses the card first, so a card and a
//      dialogue never share the screen. Touch controls also stay hidden
//      during cutscenes and the trailer.
//  (c) the district banner ("DOWNTOWN") is a separate, short-lived
//      element: it shows once per district entry, fades after 3.5 s,
//      and is suppressed entirely while a card, dialogue, cutscene or
//      menu is up.
//
// Exports: HUD. The game drives it through setLoading / hideLoading /
// showMenu / hideMenu / updateMissionPanel / showMissionCard /
// showDialogue / showDialogueSequence / showReward / showBusted /
// flashWanted / flashDamage / updateWeapon / updateCharacter / hint /
// socialPost / districtName / notify / showPrompt / hidePrompt /
// showPhone / showPause / showDealer / hideDealer / showGarage /
// hideGarage / showWheel / hideWheel / showDrift / update(dt).
import { WEAPONS, CAR_MODELS, CAR_CATALOG, DISTRICTS, STREET_NS, STREET_EW, ROADS } from './config.js';
import { settings, effectiveControlMode } from './settings.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const RANK_NAMES = ['NEWCOMER', 'STREET HUSTLER', 'WHEELMAN', 'CREW RUNNER', 'MADE DRIVER', 'LA VEGA LEGEND'];
const $ = (tag, cls, parent) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (parent) parent.appendChild(el);
  return el;
};

export class HUD {
  constructor(game) {
    this.game = game;
    this._dialogueQueue = [];
    this._dialogueIdx = 0;
    this._cardTimer = 0;
    this._districtTimer = 0;
    this._lastDistrict = '';
    this._hintTimer = 0;
    this._toastTimer = 0;
    this._posts = [];
    this._mapT = 0;
    this._build();
  }

  // -- DOM construction --------------------------------------------------------
  _build() {
    const g = this.game;
    // Loading screen.
    this.loadingEl = $('div', 'lv-loading', document.body);
    $('div', 'lv-loading-title', this.loadingEl).textContent = 'LA VEGA';
    this.loadingSub = $('div', 'lv-loading-sub', this.loadingEl);
    this.loadingSub.textContent = 'Starting up…';
    const bar = $('div', 'lv-loading-bar', this.loadingEl);
    this.loadingFill = $('div', 'lv-loading-fill', bar);
    this.loadingPct = $('div', 'lv-loading-pct', this.loadingEl);
    this.loadingPct.textContent = '0%';
    this.loadingTip = $('div', 'lv-loading-tip', this.loadingEl);
    this.loadingTip.textContent = 'A living city, smart cops, and four wild biomes beyond the bay.';

    // Menu (centred column over the live city — one clean stack, no
    // element can overlap another).
    this.menuEl = $('div', 'lv-menu hidden', document.body);
    const inner = $('div', 'lv-menu-inner', this.menuEl);
    const title = $('div', 'lv-title', inner);
    title.textContent = 'LA VEGA';
    const sub = $('div', 'lv-subtitle', inner);
    sub.textContent = 'A STORY OF TWO LIVES · BUILT BY MUSE';
    const btns = $('div', 'lv-menu-btns', inner);
    const mkBtn = (label, primary, fn) => {
      const b = $('button', 'lv-btn' + (primary ? ' lv-btn-primary' : ''), btns);
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };
    mkBtn('▶  NEW GAME', true, () => g.startNewGame(g.selectedChar || 'jax'));
    mkBtn('↻  LOAD GAME', false, () => this._showLoadSlots());
    mkBtn('▶  WATCH TRAILER', false, () => g.playTrailer());
    mkBtn('⚙  SETTINGS', false, () => this.showSettings());
    mkBtn('★  CREDITS', false, () => this.showCredits());
    // Character switcher.
    const charRow = $('div', 'lv-char-row', inner);
    $('span', 'lv-char-label', charRow).textContent = 'Protagonist:';
    this.charBtns = {};
    for (const [id, label, desc] of [['jax', 'JAX VEGA', 'Fast hands, faster cars'], ['maya', 'MAYA VEGA', 'Cool head, hot temper']]) {
      const b = $('button', 'lv-btn lv-btn-char' + (id === 'jax' ? ' active' : ''), charRow);
      b.innerHTML = `<b>${label}</b><br><small>${desc}</small>`;
      b.addEventListener('click', () => {
        g.selectedChar = id;
        for (const [k, btn] of Object.entries(this.charBtns)) btn.classList.toggle('active', k === id);
        if (g.player) { g.player.charId = id; }
      });
      this.charBtns[id] = b;
    }
    // Save slots.
    this.loadRow = $('div', 'lv-load-row', inner);
    this._refreshSlots();
    const note = $('div', 'lv-menu-note', inner);
    note.textContent = 'WASD / arrows move · Shift run · Space jump · Q punch · E enter / talk · F shoot · P pause · T phone · V switch character. On Android: left joystick to move, right buttons to drive & fight.';

    // In-game HUD root.
    this.hudEl = $('div', 'lv-hud', document.body);
    // Top bar.
    const top = $('div', 'lv-top', this.hudEl);
    this.moneyEl = $('span', 'lv-money', top);
    this.moneyEl.textContent = '$0';
    this.rankEl = $('span', 'lv-rank', top);
    this.rankEl.textContent = 'RANK 0 · NEWCOMER';
    this.missionTopEl = $('span', 'lv-mission-top', top);
    this.clockEl = $('span', 'lv-clock', top);
    this.radioEl = $('span', 'lv-radio', top);
    this.weaponEl = $('span', 'lv-weapon', top);
    this.collectEl = $('span', 'lv-collect hidden', top);
    this.qualityPill = $('span', 'lv-quality-pill', top);
    this.qualityPill.textContent = 'Quality: auto';
    this.qualityPill.title = 'Tap to change quality';
    this.qualityPill.addEventListener('click', () => {
      const order = ['auto', 'high', 'medium', 'low'];
      const next = order[(order.indexOf(settings.get('quality')) + 1) % order.length];
      settings.set('quality', next);
      if (g.applyQuality) g.applyQuality();
      this.qualityPill.textContent = `Quality: ${next}`;
      this.notify(`Quality: ${next}.`);
    });
    // Wanted stars (top-right, under the top bar).
    this.starsEl = $('div', 'lv-stars', this.hudEl);
    // Health / armor / stamina bars (top-left, under the top bar).
    const bars = $('div', 'lv-bars', this.hudEl);
    const mkBar = (cls) => {
      const b = $('div', `lv-bar ${cls}`, bars);
      const f = $('div', 'lv-fill', b);
      return f;
    };
    this.hpFill = mkBar('lv-bar-hp');
    this.armorFill = mkBar('lv-bar-armor');
    this.stamFill = mkBar('lv-bar-stam');
    // Location label (bottom-left, above the minimap on desktop; the
    // minimap itself is bottom-right per the recorded layout).
    this.locEl = $('div', 'lv-loc', this.hudEl);
    // Minimap (bottom-right, circular).
    const mapWrap = $('div', 'lv-map-wrap', this.hudEl);
    this.mapCanvas = $('canvas', 'lv-map', mapWrap);
    this.mapCanvas.width = 200;
    this.mapCanvas.height = 200;
    // Mission panel (left, below the bars).
    this.missionPanelEl = $('div', 'lv-mission-panel', this.hudEl);
    // Dispatch board (right, under the stars).
    this.dispatchEl = $('div', 'lv-dispatch hidden', this.hudEl);
    // Car HUD (bottom-right, left of the minimap).
    this.carHudEl = $('div', 'lv-carhud hidden', this.hudEl);
    // Toasts + social feed.
    this.toastsEl = $('div', 'lv-toasts', this.hudEl);
    this.socialEl = $('div', 'lv-social', this.hudEl);
    // Hint + prompt (bottom-centre).
    this.hintEl = $('div', 'lv-hint hidden', this.hudEl);
    this.promptEl = $('div', 'lv-prompt hidden', this.hudEl);
    // Dialogue box (bottom-centre, above the prompt).
    this.dialogueEl = $('div', 'lv-dialogue hidden', this.hudEl);
    this.dialogueNameEl = $('div', 'lv-dialogue-name', this.dialogueEl);
    this.dialogueTextEl = $('div', 'lv-dialogue-text', this.dialogueEl);
    const dlgHint = $('div', '', this.dialogueEl);
    dlgHint.style.cssText = 'text-align:right;color:#8ab;font-size:12px;margin-top:6px';
    dlgHint.textContent = 'tap / click to continue ▸';
    this.dialogueEl.addEventListener('click', () => this._advanceDialogue());
    // Mission card (centred, upper third).
    this.cardEl = $('div', 'lv-card hidden', this.hudEl);
    this.cardActEl = $('div', 'lv-card-act', this.cardEl);
    this.cardTitleEl = $('div', 'lv-card-title', this.cardEl);
    this.cardTextEl = $('div', 'lv-card-text', this.cardEl);
    this.cardEl.addEventListener('click', () => this._hideCard());
    // District banner (own element, inline styles, short-lived).
    this.districtEl = $('div', '', this.hudEl);
    this.districtEl.style.cssText = 'position:absolute;top:17%;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;z-index:15;display:none';
    this.districtNameEl = $('div', '', this.districtEl);
    this.districtNameEl.style.cssText = 'font-size:44px;font-weight:900;letter-spacing:6px;color:#ffd34d;text-shadow:0 2px 0 #ff2a9d,0 4px 14px rgba(0,0,0,.8)';
    this.districtSubEl = $('div', '', this.districtEl);
    this.districtSubEl.style.cssText = 'font-size:14px;color:#fff;text-shadow:0 1px 3px #000';
    // Reward / drift popups.
    this.rewardEl = $('div', 'lv-reward hidden', this.hudEl);
    this.driftEl = $('div', 'lv-drift hidden', this.hudEl);
    // Damage flash + crosshair.
    this.flashEl = $('div', 'lv-flash', this.hudEl);
    this.crosshairEl = $('div', 'lv-crosshair hidden', this.hudEl);
    this.crosshairEl.textContent = '+';
    // Busted overlay.
    this.bustedEl = $('div', 'lv-busted hidden', this.hudEl);
    $('div', 'lv-busted-title', this.bustedEl).textContent = 'BUSTED';
    this.bustedTextEl = $('div', 'lv-busted-text', this.bustedEl);
    $('div', 'lv-busted-sub', this.bustedEl).textContent = 'The LVPD has you. (tap to continue)';
    this.bustedEl.addEventListener('click', () => this.bustedEl.classList.add('hidden'));
    // Keyboard help (PC only — CSS hides it in touch mode).
    this.helpEl = $('div', 'lv-help', this.hudEl);
    this.helpEl.innerHTML = 'WASD move / drive · Shift run<br>Space jump / handbrake · Q punch · F shoot<br>E enter car / talk · T phone · H horn<br>N nitro · R radio · Tab weapon wheel (1-5 pick)<br>B buy (garage / shop) · P pause · M mute';
    // Phone button.
    this.phoneBtn = $('button', 'lv-phone-btn', this.hudEl);
    this.phoneBtn.textContent = '📱';
    this.phoneBtn.addEventListener('click', () => g.togglePhone());
    // Touch controls.
    this.touchEl = $('div', 'lv-touch', this.hudEl);
    const stick = $('div', 'lv-stick', this.touchEl);
    this.stickKnob = $('div', 'lv-stick-knob', stick);
    this._bindStick(stick);
    const btnsWrap = $('div', 'lv-touch-btns', this.touchEl);
    const tbtn = (label, key) => {
      const b = $('button', 'lv-tbtn', btnsWrap);
      b.textContent = label;
      const on = (e) => { e.preventDefault(); g.input.touch[key] = true; };
      const off = (e) => { e.preventDefault(); g.input.touch[key] = false; };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off, { passive: false });
      b.addEventListener('mousedown', on);
      b.addEventListener('mouseup', off);
      return b;
    };
    tbtn('FIRE', 'fire');
    tbtn('JUMP', 'jump');
    tbtn('ENTER', 'enter');
    tbtn('PUNCH', 'punch');
    tbtn('AIM', 'aim');
    // Weapon wheel.
    this.wheelEl = $('div', 'lv-wheel hidden', this.hudEl);
    $('div', 'lv-wheel-title', this.wheelEl).textContent = 'WEAPONS';
    this.wheelSlotsEl = $('div', '', this.wheelEl);
    const wheelItems = $('div', 'lv-wheel-items', this.wheelEl);
    const mkItem = (label, fn) => {
      const b = $('button', 'lv-wheel-item', wheelItems);
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };
    mkItem('🍔 Snack (+25 HP)', () => {
      const p = g.player;
      if ((g.items?.snack || 0) > 0 && p.health < 100) { g.items.snack--; p.heal(25); this.notify('Snack — +25 HP.'); this.updateWeapon(); }
      else this.notify('No snacks left.');
    });
    mkItem('🛡 Armor ($150)', () => {
      const p = g.player;
      if (p.money >= 150 && p.armor < 100) { p.money -= 150; p.armor = 100; this.notify('Armor fitted — 100%.'); this.updateWeapon(); }
      else this.notify('Need $150 for armor.');
    });
    // Dealer panel (Auto Palms).
    this.dealerEl = $('div', 'lv-dealer hidden', this.hudEl);
    $('div', 'lv-dealer-title', this.dealerEl).textContent = 'AUTO PALMS — BUY A CAR';
    this.dealerRowsEl = $('div', '', this.dealerEl);
    const dClose = $('button', 'lv-btn', this.dealerEl);
    dClose.textContent = 'CLOSE  (B / Esc)';
    dClose.addEventListener('click', () => this.hideDealer());
    // Garage panel (Manny's).
    this.garageEl = $('div', 'lv-dealer hidden', this.hudEl);
    $('div', 'lv-dealer-title', this.garageEl).textContent = "MANNY'S GARAGE";
    this.garageRowsEl = $('div', '', this.garageEl);
    const gClose = $('button', 'lv-btn', this.garageEl);
    gClose.textContent = 'CLOSE  (B / Esc)';
    gClose.addEventListener('click', () => this.hideGarage());
    // Pause panel.
    this.pauseEl = $('div', 'lv-pause hidden', this.hudEl);
    $('div', 'lv-pause-title', this.pauseEl).textContent = 'PAUSED';
    this.pauseStatsEl = $('div', 'lv-pause-stats', this.pauseEl);
    const pBtn = (label, fn) => {
      const b = $('button', 'lv-btn', this.pauseEl);
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };
    pBtn('▶  RESUME', () => g.togglePause());
    pBtn('⚙  SETTINGS', () => this.showSettings());
    pBtn('💾  SAVE GAME', () => { g.saveGame(false, 1); });
    pBtn('🏠  QUIT TO MENU', () => g.quitToMenu());
    // Settings panel.
    this.settingsEl = $('div', 'lv-settings hidden', this.hudEl);
    $('div', 'lv-settings-title', this.settingsEl).textContent = 'SETTINGS';
    this.settingsRowsEl = $('div', '', this.settingsEl);
    this._buildSettings();
    const sBack = $('button', 'lv-btn', this.settingsEl);
    sBack.textContent = '←  BACK';
    sBack.addEventListener('click', () => {
      this.settingsEl.classList.add('hidden');
      if (g.state === 'playing' && g.paused) this.pauseEl.classList.remove('hidden');
      else if (g.state === 'menu') this.menuEl.classList.remove('hidden');
      this._refreshLayers();
    });
    // Credits panel.
    this.creditsEl = $('div', 'lv-credits hidden', this.hudEl);
    $('div', 'lv-credits-title', this.creditsEl).textContent = 'CREDITS';
    const cBody = $('div', 'lv-credits-body', this.creditsEl);
    cBody.innerHTML = '<b>LA VEGA</b> — an open-world story of two lives.<br><br>Built by Muse.<br><br>Story, code, art and audio are original or procedural.<br><br><b>Attribution (CC-BY / CC0):</b><br>· Character, car and weapon models: Quaternius (CC0, via Poly Pizza).<br>· Engine: Three.js (MIT).<br>· Voice barks: CC0 clips (Freesound / OpenGameArt / Sonniss) when present, otherwise synthesized mumbles.<br><br>No copyrighted music, models or textures are used.';
    const cBack = $('button', 'lv-btn', this.creditsEl);
    cBack.textContent = '←  BACK';
    cBack.addEventListener('click', () => {
      this.creditsEl.classList.add('hidden');
      this.menuEl.classList.remove('hidden');
      this._refreshLayers();
    });
    // Phone panel.
    this.phoneEl = $('div', 'lv-phone hidden', this.hudEl);
    $('div', 'lv-phone-title', this.phoneEl).textContent = '📱  LA VEGA PHONE';
    const tabs = $('div', 'lv-phone-tabs', this.phoneEl);
    this.phoneBodyEl = $('div', '', this.phoneEl);
    for (const [tab, label] of [['contacts', 'Contacts'], ['social', 'Social'], ['gps', 'GPS']]) {
      const b = $('button', 'lv-phone-tab' + (tab === 'contacts' ? ' active' : ''), tabs);
      b.textContent = label;
      b.addEventListener('click', () => {
        for (const t of tabs.children) t.classList.remove('active');
        b.classList.add('active');
        this._renderPhone(tab);
      });
    }
    this._refreshLayers();
  }

  _buildSettings() {
    const g = this.game;
    const row = (label, control) => {
      const r = $('div', 'lv-settings-row', this.settingsRowsEl);
      const l = $('span', '', r);
      l.textContent = label;
      r.appendChild(control);
      return r;
    };
    const sel = (key, options) => {
      const s = $('select', 'lv-select');
      for (const [v, label] of options) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = label;
        if (String(settings.get(key)) === String(v)) o.selected = true;
        s.appendChild(o);
      }
      s.addEventListener('change', () => {
        settings.set(key, s.value);
        if (key === 'quality' && g.applyQuality) g.applyQuality();
        if (key === 'mute' && g.audio) g.audio.setMuted(settings.get('mute'));
        this._refreshLayers();
      });
      return s;
    };
    row('Music', sel('music', [['true', 'On'], ['false', 'Off']]));
    row('Sound effects', sel('sfx', [['true', 'On'], ['false', 'Off']]));
    row('Mute all', sel('mute', [['false', 'Off'], ['true', 'On']]));
    row('Quality', sel('quality', [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]));
    row('Controls', sel('controlMode', [['auto', 'Auto'], ['touch', 'Touch'], ['pc', 'Keyboard']]));
    row('Camera sensitivity', sel('sensitivity', [['0.5', '0.5×'], ['1', '1×'], ['1.5', '1.5×'], ['2', '2×']]));
    row('Camera shake', sel('cameraShake', [['true', 'On'], ['false', 'Off']]));
    row('Hints', sel('showHints', [['true', 'On'], ['false', 'Off']]));
    const resetBtn = $('button', 'lv-btn', this.settingsRowsEl);
    resetBtn.textContent = 'RESET SAVE (all slots)';
    resetBtn.addEventListener('click', () => {
      if (g.saves) for (const s of [1, 2, 3]) g.saves.deleteSlot(s);
      settings.reset();
      this.notify('Saves + settings reset.');
      this._refreshSlots();
    });
  }

  // -- touch joystick ------------------------------------------------------------
  _bindStick(stick) {
    const g = this.game;
    let active = null;
    const setFromEvent = (e) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / (r.width / 2);
      const dy = (e.clientY - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      const cl = len > 1 ? 1 / len : 1;
      g.input.touch.mx = dx * cl;
      g.input.touch.mz = dy * cl;
      this.stickKnob.style.transform = `translate(${dx * cl * 34}px, ${dy * cl * 34}px)`;
    };
    const reset = () => {
      active = null;
      g.input.touch.mx = 0;
      g.input.touch.mz = 0;
      this.stickKnob.style.transform = '';
    };
    stick.addEventListener('touchstart', (e) => { e.preventDefault(); active = e.changedTouches[0].identifier; setFromEvent(e.changedTouches[0]); }, { passive: false });
    stick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === active) setFromEvent(t);
    }, { passive: false });
    stick.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === active) reset(); }, { passive: false });
    stick.addEventListener('mousedown', (e) => { active = 'mouse'; setFromEvent(e); });
    window.addEventListener('mousemove', (e) => { if (active === 'mouse') setFromEvent(e); });
    window.addEventListener('mouseup', () => { if (active === 'mouse') reset(); });
  }

  // -- layer manager: ONE place decides what can be seen ----------------------
  // Rules: menu open → hide everything in-game. Card or dialogue open →
  // hide touch, mission panel, prompt, hint, dispatch, toasts, social and
  // the district banner. Cutscene / trailer / pause / phone / dealer /
  // garage / wheel / busted → hide touch + prompt. Nothing overlaps.
  _refreshLayers() {
    const g = this.game;
    const menuOpen = !this.menuEl.classList.contains('hidden');
    const cardOpen = !this.cardEl.classList.contains('hidden');
    const dlgOpen = !this.dialogueEl.classList.contains('hidden');
    const modalOpen = cardOpen || dlgOpen
      || !this.dealerEl.classList.contains('hidden')
      || !this.garageEl.classList.contains('hidden')
      || !this.wheelEl.classList.contains('hidden')
      || !this.pauseEl.classList.contains('hidden')
      || !this.phoneEl.classList.contains('hidden')
      || !this.bustedEl.classList.contains('hidden');
    const cutscene = (g.cutsceneT || 0) > 0 || g.state === 'trailer';
    const touchMode = effectiveControlMode() === 'touch';
    document.body.classList.toggle('lv-touch-mode', touchMode);
    document.body.classList.toggle('lv-pc-mode', !touchMode);
    // Touch controls: only in touch mode, in-game, no modal, no cutscene.
    this.touchEl.style.display = (!menuOpen && !modalOpen && !cutscene && touchMode && g.state === 'playing') ? '' : 'none';
    // Mission panel: hidden under a card or dialogue (they say the same
    // thing) and under the menu.
    this.missionPanelEl.style.display = (!menuOpen && !cardOpen && !dlgOpen) ? '' : 'none';
    // Prompt + hint: hidden under any modal or the menu.
    this.promptEl.style.display = (!menuOpen && !modalOpen) ? '' : 'none';
    this.hintEl.style.display = (!menuOpen && !modalOpen && settings.get('showHints')) ? '' : 'none';
    // Dispatch / toasts / social: hidden under card, dialogue, menu.
    this.dispatchEl.style.display = (!menuOpen && !cardOpen && !dlgOpen) ? '' : 'none';
    this.toastsEl.style.display = (!menuOpen && !cardOpen && !dlgOpen) ? '' : 'none';
    this.socialEl.style.display = (!menuOpen && !cardOpen && !dlgOpen) ? '' : 'none';
    // Phone button: in-game only.
    this.phoneBtn.style.display = (!menuOpen && !modalOpen && g.state === 'playing') ? '' : 'none';
    // District banner: never under a card, dialogue, cutscene or menu.
    if (menuOpen || cardOpen || dlgOpen || cutscene) this.districtEl.style.display = 'none';
    else if (this._districtTimer > 0) this.districtEl.style.display = '';
    // Top bar / bars / location / minimap: in-game only.
    const inGame = !menuOpen && (g.state === 'playing' || g.state === 'trailer');
    this.hudEl.style.visibility = menuOpen ? 'hidden' : '';
    void inGame;
  }

  // -- loading -------------------------------------------------------------------
  setLoading(pct, text) {
    this.loadingFill.style.width = `${pct}%`;
    this.loadingPct.textContent = `${Math.round(pct)}%`;
    if (text) this.loadingSub.textContent = text;
  }
  hideLoading() {
    this.loadingEl.classList.add('lv-fade');
    setTimeout(() => this.loadingEl.classList.add('hidden'), 600);
  }

  // -- menu ----------------------------------------------------------------------
  _refreshSlots() {
    this.loadRow.innerHTML = '';
    const g = this.game;
    const slots = g.saves ? g.saves.listSlots() : [];
    for (const { slot, info } of slots) {
      const b = $('button', 'lv-btn lv-btn-small', this.loadRow);
      b.textContent = info
        ? `SLOT ${slot} · $${(info.money || 0).toLocaleString()} · ${info.charId === 'maya' ? 'Maya' : 'Jax'} · job ${info.mission || 0}`
        : `SLOT ${slot} · empty`;
      b.addEventListener('click', () => { if (info) g.loadGame(slot); else this.notify(`Slot ${slot} is empty.`); });
    }
  }
  _showLoadSlots() {
    this._refreshSlots();
    this.loadRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.notify('Pick a slot to load.');
  }
  showMenu() {
    // THE FIX: the menu never shows over a stale card, dialogue, panel or
    // touch control — hide all of them first.
    this._hideCard();
    this._hideDialogue();
    this.hideDealer();
    this.hideGarage();
    this.hideWheel();
    this.showPause(false);
    this.showPhone(false);
    this.bustedEl.classList.add('hidden');
    this.districtEl.style.display = 'none';
    this._districtTimer = 0;
    this._refreshSlots();
    this.menuEl.classList.remove('hidden');
    this._refreshLayers();
  }
  hideMenu() {
    this.menuEl.classList.add('hidden');
    this._refreshLayers();
  }

  // -- mission card + dialogue ------------------------------------------------------
  showMissionCard(act, title, text) {
    this._hideDialogue();
    this.cardActEl.textContent = act || '';
    this.cardTitleEl.textContent = title || '';
    this.cardTextEl.textContent = text || '';
    this.cardEl.classList.remove('hidden');
    this.cardEl.classList.remove('lv-fade');
    this._cardTimer = 5;
    this._refreshLayers();
  }
  _hideCard() {
    if (this.cardEl.classList.contains('hidden')) return;
    this.cardEl.classList.add('hidden');
    this._cardTimer = 0;
    this._refreshLayers();
  }
  showDialogue(name, text) {
    this.showDialogueSequence([{ who: name, text }]);
  }
  showDialogueSequence(lines) {
    if (!lines || !lines.length) return;
    // The card steps aside: a card and a dialogue never share the screen.
    this._hideCard();
    this._dialogueQueue = lines.slice();
    this._dialogueIdx = 0;
    this._showDialogueLine();
    this._refreshLayers();
  }
  _showDialogueLine() {
    const line = this._dialogueQueue[this._dialogueIdx];
    if (!line) { this._hideDialogue(); return; }
    this.dialogueNameEl.textContent = (line.who || '???').toUpperCase();
    this.dialogueTextEl.textContent = line.text || '';
    this.dialogueEl.classList.remove('hidden');
    this._refreshLayers();
  }
  _advanceDialogue() {
    this._dialogueIdx++;
    if (this._dialogueIdx >= this._dialogueQueue.length) this._hideDialogue();
    else this._showDialogueLine();
  }
  _hideDialogue() {
    if (this.dialogueEl.classList.contains('hidden') && !this._dialogueQueue.length) return;
    this.dialogueEl.classList.add('hidden');
    this._dialogueQueue = [];
    this._dialogueIdx = 0;
    this._refreshLayers();
  }

  // -- toasts / social / hints / prompts ---------------------------------------------
  notify(text) {
    if (!text) return;
    const t = $('div', 'lv-toast', this.toastsEl);
    t.textContent = text;
    setTimeout(() => { t.style.opacity = '0'; }, 3400);
    setTimeout(() => t.remove(), 4100);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild.remove();
  }
  socialPost(text) {
    const p = $('div', 'lv-social-post', this.socialEl);
    p.textContent = text;
    this._posts.unshift(text);
    if (this._posts.length > 6) this._posts.pop();
    setTimeout(() => { p.style.opacity = '0'; }, 5200);
    setTimeout(() => p.remove(), 5900);
    while (this.socialEl.children.length > 3) this.socialEl.firstChild.remove();
  }
  hint(text) {
    if (!text) return;
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
    this._hintTimer = 4;
    this._refreshLayers();
  }
  showPrompt(text) {
    this.promptEl.textContent = text || '';
    this.promptEl.classList.remove('hidden');
  }
  hidePrompt() {
    this.promptEl.classList.add('hidden');
  }
  showReward(text, sub) {
    this.rewardEl.textContent = text || '';
    this.rewardEl.classList.remove('hidden');
    if (sub) this.notify(sub);
    setTimeout(() => this.rewardEl.classList.add('hidden'), 3000);
  }
  showDrift(score) {
    this.driftEl.textContent = `DRIFT +$${score}`;
    this.driftEl.classList.remove('hidden');
    setTimeout(() => this.driftEl.classList.add('hidden'), 1500);
  }
  showBusted(paid) {
    this.bustedTextEl.textContent = paid
      ? `Bail paid — $${paid}. You wake up at La Vega General.`
      : 'The LVPD has you. You wake up at La Vega General.';
    this.bustedEl.classList.remove('hidden');
    this._refreshLayers();
    setTimeout(() => { this.bustedEl.classList.add('hidden'); this._refreshLayers(); }, 3500);
  }
  flashWanted() {
    this.starsEl.classList.add('lv-blink');
    setTimeout(() => this.starsEl.classList.remove('lv-blink'), 1200);
  }
  flashDamage() {
    this.flashEl.style.opacity = '1';
    setTimeout(() => { this.flashEl.style.opacity = '0'; }, 180);
  }

  // -- dealer / garage / wheel ---------------------------------------------------------
  showDealer() {
    const g = this.game;
    this.dealerRowsEl.innerHTML = '';
    for (const key of CAR_CATALOG) {
      const m = CAR_MODELS[key];
      if (!m) continue;
      const row = $('div', 'lv-dealer-row', this.dealerRowsEl);
      const name = $('span', '', row);
      name.textContent = `${m.name} — top ${m.top} m/s`;
      const price = $('b', '', row);
      price.textContent = `$${m.price.toLocaleString()}`;
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => g.buyCar(key));
    }
    this.dealerEl.classList.remove('hidden');
    this._refreshLayers();
  }
  hideDealer() {
    this.dealerEl.classList.add('hidden');
    this._refreshLayers();
  }
  showGarage() {
    const g = this.game;
    this.garageRowsEl.innerHTML = '';
    const cars = g.ownedCars || [];
    if (!cars.length) {
      const row = $('div', 'lv-dealer-row', this.garageRowsEl);
      row.textContent = 'No cars stored yet — buy one at Auto Palms.';
    }
    cars.forEach((c, i) => {
      const m = CAR_MODELS[c.specKey];
      const row = $('div', 'lv-dealer-row', this.garageRowsEl);
      const name = $('span', '', row);
      name.textContent = `${m?.name || c.specKey} — cond ${Math.round(c.cond)}% · fuel ${Math.round(c.fuel)}%`;
      const btn = $('button', 'lv-btn lv-btn-small', row);
      btn.textContent = 'TAKE OUT';
      btn.addEventListener('click', () => g.takeOutCar(i));
    });
    this.garageEl.classList.remove('hidden');
    this._refreshLayers();
  }
  hideGarage() {
    this.garageEl.classList.add('hidden');
    this._refreshLayers();
  }
  showWheel(open) {
    if (!open) { this.hideWheel(); return; }
    const p = this.game.player;
    this.wheelSlotsEl.innerHTML = '';
    for (const id of Object.keys(p.weapons || { fists: {} })) {
      const w = WEAPONS[id];
      if (!w) continue;
      const owned = p.weapons[id];
      const mag = w.mag ? (p.weapon === id ? p.magAmmo : w.mag) : '∞';
      const res = w.mag ? (owned?.ammo === Infinity ? '∞' : owned?.ammo ?? 0) : '∞';
      const b = $('button', 'lv-wheel-slot' + (p.weapon === id ? ' active' : ''), this.wheelSlotsEl);
      b.textContent = w.mag ? `${w.name}  ${mag} / ${res}` : w.name;
      b.addEventListener('click', () => { p.setWeapon(id); this.updateWeapon(); this.hideWheel(); });
    }
    this.wheelEl.classList.remove('hidden');
    this._refreshLayers();
  }
  hideWheel() {
    this.wheelEl.classList.add('hidden');
    this._refreshLayers();
  }

  // -- phone / pause / settings / credits -------------------------------------------------
  showPhone(open) {
    if (!open) { this.phoneEl.classList.add('hidden'); this._refreshLayers(); return; }
    this._renderPhone('contacts');
    this.phoneEl.classList.remove('hidden');
    this._refreshLayers();
  }
  _renderPhone(tab) {
    const g = this.game;
    this.phoneBodyEl.innerHTML = '';
    if (tab === 'contacts') {
      for (const [name, desc, tip] of [
        ['LA ROSA', 'Club owner — at the club', 'La Rosa is waiting at the club. Talk to her to start the first job.'],
        ['MANNY', 'Mechanic — at the garage', "Manny's Garage repairs, refuels and resprays your car."],
        ['MAYA', 'Crew driver — your partner', 'Press V to switch to Maya. You share money and progress.'],
        ['CREW', 'Muscle · Driver · Hacker', 'Crew abilities: Z swap plates, C quick fix, G eyes out.'],
      ]) {
        const c = $('div', 'lv-contact', this.phoneBodyEl);
        $('div', 'lv-contact-name', c).textContent = name;
        $('div', 'lv-contact-desc', c).textContent = desc;
        c.addEventListener('click', () => this.notify(tip));
      }
    } else if (tab === 'social') {
      if (!this._posts.length) {
        const p = $('div', 'lv-phone-post', this.phoneBodyEl);
        p.textContent = 'La Vega Social — quiet for now. Make some noise and the city will talk.';
      }
      for (const post of this._posts.slice(0, 6)) {
        const p = $('div', 'lv-phone-post', this.phoneBodyEl);
        p.textContent = post;
      }
    } else {
      const d = this.districtName();
      const m = g.missions;
      const obj = m?.current && m.step ? m.step.text : (m?.nextMission ? `Next job: ${m.nextMission.name} — talk to La Rosa at the club.` : 'Free roam — La Vega is yours.');
      const p = $('div', 'lv-phone-post', this.phoneBodyEl);
      p.textContent = `You are in ${d}. ${obj}`;
      const p2 = $('div', 'lv-phone-post', this.phoneBodyEl);
      p2.textContent = 'GPS: follow the yellow beam to your objective.';
    }
  }
  showPause(open) {
    if (!open) { this.pauseEl.classList.add('hidden'); this._refreshLayers(); return; }
    const g = this.game;
    const p = g.player;
    this.pauseStatsEl.textContent = `$${(p.money || 0).toLocaleString()} · job ${(g.missions?.nextIdx || 0)}/12 · DAY ${g.weather?.day || 1} · ${g.weather?.clockText ? g.weather.clockText() : ''}`;
    this.pauseEl.classList.remove('hidden');
    this._refreshLayers();
  }
  showSettings() {
    this.menuEl.classList.add('hidden');
    this.pauseEl.classList.add('hidden');
    this.settingsEl.classList.remove('hidden');
    this._refreshLayers();
  }
  showCredits() {
    this.menuEl.classList.add('hidden');
    this.creditsEl.classList.remove('hidden');
    this._refreshLayers();
  }

  // -- mission panel / weapon / character / district --------------------------------------
  updateMissionPanel() {
    const g = this.game;
    const m = g.missions;
    if (!m) return;
    if (m.current && m.step) {
      this.missionPanelEl.innerHTML = '';
      const t1 = $('div', '', this.missionPanelEl);
      t1.style.cssText = 'color:#ffd34d;font-weight:900';
      t1.textContent = `MISSION ${m.current.id}/12 — ${m.current.name}`;
      const t2 = $('div', '', this.missionPanelEl);
      t2.textContent = m.step.text || '';
      if (g.taxi) {
        const t3 = $('div', '', this.missionPanelEl);
        t3.textContent = `Taxi: ${g.taxi.dest?.name || ''} — ${Math.ceil(g.taxi.t || 0)}s left.`;
      }
    } else if (m.nextMission) {
      this.missionPanelEl.innerHTML = '';
      const t1 = $('div', '', this.missionPanelEl);
      t1.style.cssText = 'color:#ffd34d;font-weight:900';
      t1.textContent = `NEXT JOB ${m.nextMission.id}/12 — ${m.nextMission.name}`;
      const t2 = $('div', '', this.missionPanelEl);
      t2.textContent = 'Talk to La Rosa at the club (press E).';
    } else {
      this.missionPanelEl.innerHTML = '';
      const t1 = $('div', '', this.missionPanelEl);
      t1.style.cssText = 'color:#7dff8a;font-weight:900';
      t1.textContent = 'LA VEGA IS YOURS';
      const t2 = $('div', '', this.missionPanelEl);
      t2.textContent = 'Free roam — find work at the club.';
    }
  }
  updateWeapon() {
    const p = this.game.player;
    if (!p) return;
    const w = WEAPONS[p.weapon] || WEAPONS.fists;
    if (!w.mag) { this.weaponEl.textContent = w.name; return; }
    const mag = p.magAmmo === Infinity ? '∞' : p.magAmmo;
    const res = p.weapons[p.weapon]?.ammo;
    const resTxt = res === Infinity || res === undefined ? '∞' : res;
    this.weaponEl.textContent = `${w.name} ${mag} / ${resTxt}`;
  }
  updateCharacter() {
    const p = this.game.player;
    if (!p) return;
    this.rankEl.textContent = `RANK ${this.game.rank || 0} · ${RANK_NAMES[this.game.rank || 0] || 'NEWCOMER'}`;
  }
  districtName() {
    const p = this.game.player;
    if (!p) return 'LA VEGA';
    for (const d of DISTRICTS) {
      if (p.x >= d.x0 && p.x < d.x1 && p.z >= d.z0 && p.z < d.z1) return d.name;
    }
    return 'LA VEGA';
  }
  _streetName() {
    const p = this.game.player;
    if (!p) return '';
    let best = null, bd = Infinity, axis = 'x', idx = 0;
    ROADS.forEach((r, i) => {
      const d = Math.abs(p.x - r);
      if (d < bd) { bd = d; best = STREET_NS[i]; axis = 'x'; idx = i; }
      const d2 = Math.abs(p.z - r);
      if (d2 < bd) { bd = d2; best = STREET_EW[i]; axis = 'z'; idx = i; }
    });
    void axis; void idx;
    return best || '';
  }

  // -- per-frame update -----------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p || g.state !== 'playing') return;
    // Timers.
    if (this._cardTimer > 0) {
      this._cardTimer -= dt;
      if (this._cardTimer <= 0) this._hideCard();
    }
    if (this._districtTimer > 0) {
      this._districtTimer -= dt;
      if (this._districtTimer <= 0) { this.districtEl.style.display = 'none'; this._refreshLayers(); }
    }
    if (this._hintTimer > 0) {
      this._hintTimer -= dt;
      if (this._hintTimer <= 0) { this.hintEl.classList.add('hidden'); this._refreshLayers(); }
    }
    // Top bar.
    this.moneyEl.textContent = `$${Math.floor(p.money || 0).toLocaleString()}`;
    this.rankEl.textContent = `RANK ${g.rank || 0} · ${RANK_NAMES[g.rank || 0] || 'NEWCOMER'}`;
    if (g.weather?.clockText) this.clockEl.textContent = `DAY ${g.weather.day || 1} · ${g.weather.clockText()}`;
    if (g.audio?.stationIdx !== undefined) {
      const names = ['Neon Tide FM 98.6', 'Mango Radio 101', 'Static Dub 88.1'];
      this.radioEl.textContent = names[g.audio.stationIdx] || '';
    }
    this.updateWeapon();
    // Stars.
    const wanted = g.police?.wanted || 0;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<span class="lv-star${i < wanted ? ' on' : ''}">${i < wanted ? '★' : '☆'}</span>`;
    if (this.starsEl.innerHTML !== stars) this.starsEl.innerHTML = stars;
    // Bars.
    this.hpFill.style.width = `${clamp(p.health || 0, 0, 100)}%`;
    this.armorFill.style.width = `${clamp(p.armor || 0, 0, 100)}%`;
    this.stamFill.style.width = `${clamp(p.stamina || 0, 0, 100)}%`;
    // Location: district / street / standing.
    const dName = this.districtName();
    const street = this._streetName();
    const dKey = (DISTRICTS.find((d) => d.name === dName)?.key) || 'marina';
    const standing = Math.round(g.standing?.[dKey === 'beach' ? 'south' : dKey] || 0);
    this.locEl.textContent = `${dName}${street ? ` · ${street}` : ''} · ${standing}%`;
    // District banner: once per entry, short-lived, never under a modal.
    if (dName !== this._lastDistrict) {
      this._lastDistrict = dName;
      if (g.state === 'playing' && (g.cutsceneT || 0) <= 0) {
        this.districtNameEl.textContent = dName;
        this.districtSubEl.textContent = `${street} · standing ${standing}%`;
        this._districtTimer = 3.5;
        this._refreshLayers();
      }
    }
    // Car HUD.
    const car = g.vehicles?.playerCar || g.vehicles?.playerBoat || g.vehicles?.playerHeli;
    if (car) {
      this.carHudEl.classList.remove('hidden');
      const kmh = Math.round(Math.abs(car.speed || 0) * 3.6);
      const name = car.kind === 'heli' ? 'HELICOPTER' : car.kind === 'boat' ? 'SPEEDBOAT' : car.kind === 'jetski' ? 'JET SKI' : (CAR_MODELS[car.specKey]?.name || car.specKey).toUpperCase();
      this.carHudEl.innerHTML = `<div class="lv-car-name">${name}</div><div class="lv-car-speed">${kmh} km/h</div><div>FUEL ${Math.round(car.fuel || 0)}% · COND ${Math.round(car.cond || 0)}%</div>`;
    } else this.carHudEl.classList.add('hidden');
    // Dispatch board.
    if (wanted > 0 && g.police?.getDispatch) {
      const d = g.police.getDispatch();
      this.dispatchEl.classList.remove('hidden');
      const seen = d.units.some((u) => u.seen);
      let html = `<b>LVPD DISPATCH — ${wanted}★ ${seen ? '<span class="lv-blink">IN SIGHT</span>' : 'HIDDEN'}</b><br>`;
      for (const u of d.units.slice(0, 5)) html += `${u.tactic} · ${u.dist}m · ${u.seen ? 'SEEN' : 'searching'}<br>`;
      if (d.heli) html += 'LVPD AIR overhead — spotlight on you.<br>';
      if (d.swat) html += 'SWAT on scene.<br>';
      if (d.roadblock) html += 'Roadblock ahead — spike strips.<br>';
      if (this.dispatchEl.innerHTML !== html) this.dispatchEl.innerHTML = html;
    } else this.dispatchEl.classList.add('hidden');
    // Crosshair: aiming with a firearm on foot.
    const aiming = g.aiming && p.weapon !== 'fists' && !p.inCar && !p.inBoat && !p.inHeli;
    this.crosshairEl.classList.toggle('hidden', !aiming);
    // Collectibles counter.
    if (g.collectibles) {
      const got = g.collectibles.filter((c) => c.taken).length;
      this.collectEl.classList.remove('hidden');
      this.collectEl.textContent = `★ ${got}/${g.collectibles.length}`;
    }
    // Minimap (throttled to every other frame).
    this._mapT += dt;
    if (this._mapT > 0.05) { this._mapT = 0; this._drawMinimap(); }
  }

  _drawMinimap() {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    const ctx = this.mapCanvas.getContext('2d');
    const S = 200;
    const scale = S / 280;
    const X = (x) => x * scale;
    const Z = (z) => z * scale;
    ctx.clearRect(0, 0, S, S);
    // District quadrants.
    const quadCols = ['#2a4a6e', '#3a3a4a', '#4a2a5e', '#6e5a2a'];
    const quads = [[0, 0, 130, 130], [130, 0, 130, 130], [0, 130, 130, 130], [130, 130, 130, 130]];
    quads.forEach(([x0, z0, w, h], i) => {
      ctx.fillStyle = quadCols[i];
      ctx.fillRect(X(x0), Z(z0), w * scale, h * scale);
    });
    // Sea + sand (west edge).
    ctx.fillStyle = '#2f9fd8';
    ctx.fillRect(0, 0, X(15), S);
    ctx.fillStyle = '#f2d492';
    ctx.fillRect(X(15), 0, X(15), S);
    // Roads.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    for (const r of ROADS) {
      ctx.beginPath(); ctx.moveTo(X(r), Z(0)); ctx.lineTo(X(r), Z(260)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(0), Z(r)); ctx.lineTo(X(260), Z(r)); ctx.stroke();
    }
    // Mission marker (yellow diamond).
    const mp = g.missions?.markerPos;
    if (mp) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.moveTo(X(mp.x), Z(mp.z) - 7);
      ctx.lineTo(X(mp.x) + 7, Z(mp.z));
      ctx.lineTo(X(mp.x), Z(mp.z) + 7);
      ctx.lineTo(X(mp.x) - 7, Z(mp.z));
      ctx.closePath();
      ctx.fill();
    }
    // Police blips (blue).
    if (g.police?.units) {
      ctx.fillStyle = '#4da3ff';
      for (const u of g.police.units) {
        if (!u.car) continue;
        ctx.beginPath();
        ctx.arc(X(u.car.x), Z(u.car.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Player car blip (green) + player arrow (white/pink, rotated).
    const pc = g.vehicles?.playerCar;
    if (pc) {
      ctx.fillStyle = '#7dff8a';
      ctx.beginPath();
      ctx.arc(X(pc.x), Z(pc.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(X(p.x), Z(p.z));
    ctx.rotate(-p.heading + Math.PI);
    ctx.fillStyle = '#ff2a9d';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
