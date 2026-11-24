// La Vega 3D — HUD (round 6 re-author).
//
// Builds every DOM panel itself (index.html has no pre-built HUD) and keeps
// it in sync with the game: money / health / armor / wanted stars, the
// weapon label ("PISTOL 12 / 60"), the minimap canvas, the mission panel,
// prompts, dialogue, the weapon wheel, the dealer + garage panels, the
// phone, pause, menu, loading screen and touch controls.
import { WEAPONS, CAR_MODELS, CAR_CATALOG, DISTRICTS, ROADS } from './config.js';
import { clamp } from './rng.js';
import { settings } from './settings.js';

const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

const CSS = `
#lv-hud{position:fixed;inset:0;pointer-events:none;font-family:'Segoe UI',system-ui,sans-serif;color:#f2f5f7;z-index:10;overflow:hidden}
#lv-hud .hidden{display:none!important}
.lv-panel{background:rgba(10,12,20,.82);border:1px solid rgba(255,255,255,.14);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.5);backdrop-filter:blur(3px)}
.lv-btn{pointer-events:auto;cursor:pointer;background:linear-gradient(180deg,#ff2a9d,#d92038);color:#fff;border:none;border-radius:8px;padding:10px 18px;font-weight:700;font-size:15px;letter-spacing:.4px}
.lv-btn:hover{filter:brightness(1.15)}
.lv-btn.ghost{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25)}
.lv-topbar{position:absolute;top:10px;left:10px;display:flex;gap:10px;align-items:flex-start}
.lv-stats{padding:8px 12px;min-width:210px}
.lv-money{font-size:20px;font-weight:800;color:#7dff8a;text-shadow:0 1px 2px #000}
.lv-bar{height:8px;background:rgba(255,255,255,.15);border-radius:4px;margin-top:5px;overflow:hidden}
.lv-bar>i{display:block;height:100%;border-radius:4px}
.lv-hp>i{background:linear-gradient(90deg,#22c3aa,#7dff8a)}
.lv-armor>i{background:linear-gradient(90deg,#2a6fd6,#9ecfff)}
.lv-barlabel{font-size:11px;opacity:.85;margin-top:2px}
.lv-wanted{padding:8px 12px;text-align:center}
.lv-stars{font-size:20px;letter-spacing:2px;color:#ffd34d;text-shadow:0 0 8px rgba(255,211,77,.7)}
.lv-stars .off{color:rgba(255,255,255,.25);text-shadow:none}
.lv-clock{padding:8px 12px;text-align:right;font-size:13px;line-height:1.5}
.lv-clock b{font-size:16px}
.lv-mission{position:absolute;top:10px;left:240px;max-width:340px;padding:10px 14px}
.lv-mission h3{margin:0 0 4px;font-size:14px;color:#ffd34d;letter-spacing:.5px}
.lv-mission p{margin:0;font-size:13px;line-height:1.45}
.lv-minimap{position:absolute;left:10px;bottom:10px;width:190px;height:190px;border-radius:10px;border:2px solid rgba(255,255,255,.35);box-shadow:0 4px 16px rgba(0,0,0,.6);background:#0a1a2a}
.lv-weapon{position:absolute;right:12px;bottom:12px;text-align:right;padding:8px 12px}
.lv-weapon .lv-wname{font-size:20px;font-weight:800;letter-spacing:1px}
.lv-weapon .lv-wammo{font-size:13px;opacity:.9}
.lv-weapon .lv-wnitro{height:6px;background:rgba(255,255,255,.15);border-radius:3px;margin-top:5px;overflow:hidden}
.lv-weapon .lv-wnitro>i{display:block;height:100%;background:linear-gradient(90deg,#ff8c1a,#ffd34d)}
.lv-prompt{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);padding:9px 18px;font-size:15px;font-weight:700;background:rgba(10,12,20,.85);border:1px solid rgba(255,255,255,.2);border-radius:8px;white-space:nowrap}
.lv-dialogue{position:absolute;left:50%;bottom:170px;transform:translateX(-50%);width:min(560px,86vw);padding:14px 18px;cursor:pointer;pointer-events:auto}
.lv-dialogue .lv-who{color:#ff8cb8;font-weight:800;font-size:14px;letter-spacing:.5px}
.lv-dialogue .lv-line{font-size:16px;line-height:1.5;margin-top:4px}
.lv-dialogue .lv-next{font-size:11px;opacity:.6;text-align:right;margin-top:6px}
.lv-card{position:absolute;left:50%;top:22%;transform:translate(-50%,-50%);text-align:center;padding:22px 34px;pointer-events:none}
.lv-card .lv-act{color:#ff8cb8;font-weight:800;letter-spacing:3px;font-size:13px}
.lv-card h2{margin:6px 0;font-size:34px;letter-spacing:2px}
.lv-card p{margin:0;font-size:15px;opacity:.9;max-width:520px}
.lv-feed{position:absolute;top:64px;right:10px;width:300px;display:flex;flex-direction:column;gap:6px}
.lv-toast{padding:8px 12px;font-size:13.5px;line-height:1.4;animation:lv-in .25s ease-out}
@keyframes lv-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
.lv-wheel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:10px;padding:14px;pointer-events:auto}
.lv-wheel-slot{width:104px;padding:12px 8px;text-align:center;cursor:pointer;border-radius:8px;background:rgba(255,255,255,.08);border:2px solid transparent}
.lv-wheel-slot:hover{border-color:#ff2a9d}
.lv-wheel-slot.owned{border-color:rgba(255,211,77,.7)}
.lv-wheel-slot.sel{border-color:#ff2a9d;background:rgba(255,42,157,.25)}
.lv-wheel-slot .lv-sname{font-weight:800;font-size:14px}
.lv-wheel-slot .lv-sammo{font-size:12px;opacity:.85;margin-top:4px}
.lv-wheel-slot.locked{opacity:.45}
.lv-shop{position:absolute;right:16px;top:50%;transform:translateY(-50%);width:340px;max-height:76vh;overflow:auto;padding:16px;pointer-events:auto}
.lv-dealer-title{font-size:19px;font-weight:800;letter-spacing:1px;color:#ffd34d;margin-bottom:4px}
.lv-dealer-sub{font-size:12.5px;opacity:.8;margin-bottom:10px}
.lv-dealer-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 10px;margin-top:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;cursor:pointer;font-size:13.5px}
.lv-dealer-row:hover{border-color:#ff2a9d;background:rgba(255,42,157,.15)}
.lv-dealer-row .lv-price{color:#7dff8a;font-weight:800;white-space:nowrap}
.lv-shop .lv-close{margin-top:12px;width:100%}
.lv-phone{position:absolute;right:16px;bottom:90px;width:230px;padding:14px;pointer-events:auto;text-align:center}
.lv-phone h3{margin:0 0 2px;font-size:17px}
.lv-phone .lv-ptime{font-size:12px;opacity:.75;margin-bottom:10px}
.lv-app{display:inline-block;width:60px;margin:6px 4px;padding:10px 0;background:rgba(255,255,255,.08);border-radius:10px;font-size:12px;cursor:pointer}
.lv-app:hover{background:rgba(255,42,157,.3)}
.lv-pause{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:300px;padding:22px;text-align:center;pointer-events:auto}
.lv-pause h2{margin:0 0 14px;font-size:26px;letter-spacing:3px}
.lv-pause .lv-btn{display:block;width:100%;margin-top:10px}
.lv-menu{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 30%,rgba(255,42,157,.35),rgba(5,5,15,.88) 70%);pointer-events:auto;text-align:center}
.lv-menu h1{font-size:64px;margin:0;letter-spacing:6px;text-shadow:0 0 30px rgba(255,42,157,.8),0 4px 0 #000}
.lv-menu .lv-tag{font-size:16px;letter-spacing:4px;color:#9ecfff;margin:6px 0 22px}
.lv-menu .lv-btn{width:260px;margin-top:10px;font-size:17px}
.lv-charpick{display:flex;gap:12px;margin:6px 0 10px}
.lv-char{width:120px;padding:12px;border-radius:10px;background:rgba(255,255,255,.08);border:2px solid transparent;cursor:pointer}
.lv-char.sel{border-color:#ffd34d;background:rgba(255,211,77,.15)}
.lv-char b{display:block;font-size:16px}
.lv-char span{font-size:12px;opacity:.8}
.lv-sub{width:min(480px,88vw);max-height:70vh;overflow:auto;padding:20px;text-align:left;pointer-events:auto}
.lv-sub h2{margin:0 0 10px}
.lv-sub label{display:block;margin:10px 0;font-size:14px}
.lv-sub select,.lv-sub input{margin-left:8px}
.lv-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#07070f;pointer-events:auto}
.lv-loading h1{font-size:44px;letter-spacing:6px;margin:0}
.lv-loadbar{width:min(420px,80vw);height:12px;background:rgba(255,255,255,.15);border-radius:6px;margin-top:22px;overflow:hidden}
.lv-loadbar>i{display:block;height:100%;background:linear-gradient(90deg,#ff2a9d,#ffd34d);width:0%}
.lv-loadtext{margin-top:10px;font-size:13px;opacity:.8}
.lv-touch{position:absolute;inset:0;pointer-events:none}
.lv-stick{position:absolute;left:22px;bottom:210px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.25);pointer-events:auto;touch-action:none}
.lv-knob{position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.35)}
.lv-tbtn{position:absolute;right:22px;bottom:210px;display:flex;flex-direction:column;gap:10px;pointer-events:auto}
.lv-tbtn button{width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,.3);background:rgba(10,12,20,.6);color:#fff;font-weight:800;font-size:12px}
.lv-tbtn button:active{background:rgba(255,42,157,.6)}
.lv-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(255,0,0,.55) 100%);opacity:0;transition:opacity .12s}
.lv-busted{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(5,5,15,.82);pointer-events:auto}
.lv-busted h2{font-size:52px;letter-spacing:8px;color:#ff5a5a;margin:0}
.lv-busted p{font-size:16px}
.lv-reward{position:absolute;left:50%;top:32%;transform:translateX(-50%);text-align:center;padding:14px 26px;pointer-events:none}
.lv-reward b{font-size:28px;color:#7dff8a}
.lv-reward span{display:block;font-size:14px;opacity:.9;margin-top:2px}
.lv-drift{position:absolute;left:50%;top:58%;transform:translateX(-50%);font-size:22px;font-weight:800;color:#ffd34d;text-shadow:0 2px 6px #000;pointer-events:none}
.lv-hint{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);padding:7px 14px;font-size:13px;background:rgba(42,111,214,.85);border-radius:8px;white-space:nowrap}
.lv-district{position:absolute;left:50%;top:16%;transform:translateX(-50%);font-size:30px;font-weight:800;letter-spacing:6px;text-shadow:0 2px 10px #000;pointer-events:none}
.lv-social{position:absolute;left:10px;top:200px;width:280px;display:flex;flex-direction:column;gap:6px}
.lv-post{padding:8px 12px;font-size:13px;line-height:1.4}
.lv-post b{color:#9ecfff}
`;

function el(tag, cls, parent, html) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html !== undefined) d.innerHTML = html;
  if (parent) parent.appendChild(d);
  return d;
}

export class HUD {
  constructor(game) {
    this.game = game;
    this._dlgQueue = [];
    this._dlgTimer = 0;
    this._cardTimer = 0;
    this._mapT = 0;
    this._lastDistrict = null;
    this._districtT = 0;
    this._notifyT = [];
    this._selectedChar = 'jax';
    this.root = el('div', null, document.body);
    this.root.id = 'lv-hud';
    const style = document.createElement('style');
    style.textContent = CSS;
    this.root.appendChild(style);

    // Loading screen.
    this.loadingEl = el('div', 'lv-loading', this.root);
    el('h1', null, this.loadingEl, 'LA VEGA');
    el('div', 'lv-tag', this.loadingEl, 'OPEN WORLD • 12 MISSIONS • TWO LIVES');
    this.loadBar = el('div', 'lv-loadbar', this.loadingEl);
    this.loadFill = el('i', null, this.loadBar);
    this.loadText = el('div', 'lv-loadtext', this.loadingEl, 'Loading…');

    // Main menu.
    this.menuEl = el('div', 'lv-menu hidden', this.root);
    el('h1', null, this.menuEl, 'LA VEGA');
    el('div', 'lv-tag', this.menuEl, 'A STORY OF TWO LIVES • BUILT BY MUSE');
    const pick = el('div', 'lv-charpick', this.menuEl);
    this.charJax = el('div', 'lv-char sel', pick, '<b>JAX VEGA</b><span>Fast hands, faster cars</span>');
    this.charMaya = el('div', 'lv-char', pick, '<b>MAYA VEGA</b><span>Cool head, hot temper</span>');
    this.charJax.addEventListener('click', () => this._pickChar('jax'));
    this.charMaya.addEventListener('click', () => this._pickChar('maya'));
    const btnNew = el('button', 'lv-btn', this.menuEl, '▶ &nbsp;NEW GAME');
    btnNew.addEventListener('click', () => game.startNewGame(this._selectedChar));
    const btnContinue = el('button', 'lv-btn ghost', this.menuEl, 'CONTINUE');
    btnContinue.addEventListener('click', () => game.loadGame(1));
    const btnTrailer = el('button', 'lv-btn ghost', this.menuEl, '🎬 &nbsp;WATCH TRAILER');
    btnTrailer.addEventListener('click', () => game.playTrailer());
    const btnSettings = el('button', 'lv-btn ghost', this.menuEl, '⚙ &nbsp;SETTINGS');
    btnSettings.addEventListener('click', () => this._toggleSub(this.settingsEl));
    const btnCredits = el('button', 'lv-btn ghost', this.menuEl, 'CREDITS');
    btnCredits.addEventListener('click', () => this._toggleSub(this.creditsEl));

    // Settings + credits sub-panels (inside the menu).
    this.settingsEl = el('div', 'lv-panel lv-sub hidden', this.menuEl);
    el('h2', null, this.settingsEl, 'SETTINGS');
    this._settingRow(this.settingsEl, 'Sound', 'mute', 'checkbox', settings.get('mute'));
    this._settingRow(this.settingsEl, 'Music', 'music', 'checkbox', settings.get('music') !== false);
    this._settingRow(this.settingsEl, 'Sound effects', 'sfx', 'checkbox', settings.get('sfx') !== false);
    this._settingRow(this.settingsEl, 'Camera shake', 'cameraShake', 'checkbox', settings.get('cameraShake') !== false);
    this._settingRow(this.settingsEl, 'Show hints', 'showHints', 'checkbox', settings.get('showHints') !== false);
    this._settingRow(this.settingsEl, 'Sensitivity', 'sensitivity', 'range', settings.get('sensitivity'));
    this._settingRow(this.settingsEl, 'Quality', 'quality', 'select', settings.get('quality'));
    const btnCloseSet = el('button', 'lv-btn', this.settingsEl, 'CLOSE');
    btnCloseSet.addEventListener('click', () => this.settingsEl.classList.add('hidden'));
    this.creditsEl = el('div', 'lv-panel lv-sub hidden', this.menuEl);
    el('h2', null, this.creditsEl, 'CREDITS');
    el('p', null, this.creditsEl, 'LA VEGA — an open-world story game.<br>Built by Muse.<br><br>Starring Jax Vega &amp; Maya Vega.<br>City of La Vega, Neon Row, Marina, South Beach.<br><br>Third-party assets are credited in the repository.<br>All characters and places are fictional.');
    const btnCloseCred = el('button', 'lv-btn', this.creditsEl, 'CLOSE');
    btnCloseCred.addEventListener('click', () => this.creditsEl.classList.add('hidden'));

    // Top bar: stats + wanted + clock.
    const top = el('div', 'lv-topbar', this.root);
    const stats = el('div', 'lv-panel lv-stats', top);
    this.moneyEl = el('div', 'lv-money', stats, '$0');
    this.hpBar = el('div', 'lv-bar lv-hp', stats);
    this.hpFill = el('i', null, this.hpBar);
    el('div', 'lv-barlabel', stats, 'HEALTH');
    this.armorBar = el('div', 'lv-bar lv-armor', stats);
    this.armorFill = el('i', null, this.armorBar);
    el('div', 'lv-barlabel', stats, 'ARMOR');
    const wanted = el('div', 'lv-panel lv-wanted', top);
    this.starsEl = el('div', 'lv-stars', wanted, '☆☆☆☆☆');
    el('div', 'lv-barlabel', wanted, 'LVPD HEAT');
    const clock = el('div', 'lv-panel lv-clock', top);
    this.clockEl = el('b', null, clock, '12:00');
    el('br', null, clock);
    this.weatherEl = el('span', null, clock, 'Clear');

    // Mission panel.
    this.missionEl = el('div', 'lv-panel lv-mission hidden', this.root);
    this.missionTitle = el('h3', null, this.missionEl, '');
    this.missionText = el('p', null, this.missionEl, '');

    // Minimap + weapon readout.
    this.mapCanvas = el('canvas', 'lv-minimap', this.root);
    this.mapCanvas.width = 190;
    this.mapCanvas.height = 190;
    const weapon = el('div', 'lv-panel lv-weapon', this.root);
    this.weaponName = el('div', 'lv-wname', weapon, 'FISTS');
    this.weaponAmmo = el('div', 'lv-wammo', weapon, '∞');
    const nitro = el('div', 'lv-wnitro', weapon);
    this.nitroFill = el('i', null, nitro);

    // Prompt, dialogue, mission card, feed, hints, district banner.
    this.promptEl = el('div', 'lv-prompt hidden', this.root);
    this.dialogueEl = el('div', 'lv-panel lv-dialogue hidden', this.root);
    this.dlgWho = el('div', 'lv-who', this.dialogueEl, '');
    this.dlgLine = el('div', 'lv-line', this.dialogueEl, '');
    el('div', 'lv-next', this.dialogueEl, 'click / E to continue ▸');
    this.dialogueEl.addEventListener('click', () => this._advanceDialogue());
    this.cardEl = el('div', 'lv-panel lv-card hidden', this.root);
    this.cardAct = el('div', 'lv-act', this.cardEl, '');
    this.cardTitle = el('h2', null, this.cardEl, '');
    this.cardText = el('p', null, this.cardEl, '');
    this.feedEl = el('div', 'lv-feed', this.root);
    this.hintEl = el('div', 'lv-hint hidden', this.root);
    this.districtEl = el('div', 'lv-district hidden', this.root);
    this.driftEl = el('div', 'lv-drift hidden', this.root);
    this.rewardEl = el('div', 'lv-panel lv-reward hidden', this.root);
    this.rewardMain = el('b', null, this.rewardEl, '');
    this.rewardSub = el('span', null, this.rewardEl, '');
    this.socialEl = el('div', 'lv-social', this.root);
    this.vignetteEl = el('div', 'lv-vignette', this.root);

    // Weapon wheel.
    this.wheelEl = el('div', 'lv-panel lv-wheel hidden', this.root);
    // Dealer + garage panels (same row markup; the probe reads
    // .lv-dealer-title / .lv-dealer-row from both).
    this.dealerEl = el('div', 'lv-panel lv-shop hidden', this.root);
    el('div', 'lv-dealer-title', this.dealerEl, 'AUTO PALMS — CARS FOR SALE');
    el('div', 'lv-dealer-sub', this.dealerEl, 'Click a car to buy it, or press 1 / 2 / 3 for a quick buy.');
    this.dealerRows = el('div', null, this.dealerEl);
    const btnCloseDealer = el('button', 'lv-btn lv-close', this.dealerEl, 'Close (E)');
    btnCloseDealer.addEventListener('click', () => this.hideDealer());
    this.garageEl = el('div', 'lv-panel lv-shop hidden', this.root);
    el('div', 'lv-dealer-title', this.garageEl, "MANNY'S GARAGE — your cars");
    el('div', 'lv-dealer-sub', this.garageEl, 'Your stored cars. Take one out to drive it.');
    this.garageRows = el('div', null, this.garageEl);
    const btnCloseGarage = el('button', 'lv-btn lv-close', this.garageEl, 'Close (E)');
    btnCloseGarage.addEventListener('click', () => this.hideGarage());

    // Phone + pause.
    this.phoneEl = el('div', 'lv-panel lv-phone hidden', this.root);
    el('h3', null, this.phoneEl, '📱 Vega Phone');
    this.phoneTime = el('div', 'lv-ptime', this.phoneEl, '');
    for (const [icon, name] of [['💬', 'Messages'], ['📇', 'Contacts'], ['📷', 'Camera'], ['🗺️', 'Map'], ['⚙️', 'Settings'], ['🎵', 'Radio']]) {
      const app = el('div', 'lv-app', this.phoneEl, `${icon}<br>${name}`);
      app.addEventListener('click', () => this.game.notify ? null : null);
    }
    const btnClosePhone = el('button', 'lv-btn ghost', this.phoneEl, 'Close (T)');
    btnClosePhone.addEventListener('click', () => this.game.togglePhone());
    this.pauseEl = el('div', 'lv-panel lv-pause hidden', this.root);
    el('h2', null, this.pauseEl, 'PAUSED');
    const btnResume = el('button', 'lv-btn', this.pauseEl, 'RESUME');
    btnResume.addEventListener('click', () => this.game.togglePause());
    const btnPauseSet = el('button', 'lv-btn ghost', this.pauseEl, 'SETTINGS');
    btnPauseSet.addEventListener('click', () => { this.game.togglePause(); this.showMenu(); });
    const btnQuit = el('button', 'lv-btn ghost', this.pauseEl, 'QUIT TO MENU');
    btnQuit.addEventListener('click', () => this.game.quitToMenu());

    // Busted overlay.
    this.bustedEl = el('div', 'lv-busted hidden', this.root);
    el('h2', null, this.bustedEl, 'BUSTED');
    this.bustedText = el('p', null, this.bustedEl, '');
    const btnBusted = el('button', 'lv-btn', this.bustedEl, 'CONTINUE');
    btnBusted.addEventListener('click', () => this.bustedEl.classList.add('hidden'));

    // Touch controls (shown on touch devices; hidden during cutscenes).
    this.touchEl = el('div', 'lv-touch hidden', this.root);
    const stick = el('div', 'lv-stick', this.touchEl);
    this.stickKnob = el('div', 'lv-knob', stick);
    const tbtns = el('div', 'lv-tbtn', this.touchEl);
    this._touchBtn(tbtns, 'FIRE', 'fire');
    this._touchBtn(tbtns, 'JUMP', 'jump');
    this._touchBtn(tbtns, 'ENTER', 'enter');
    this._touchBtn(tbtns, 'PUNCH', 'punch');
    if ('ontouchstart' in window) this.touchEl.classList.remove('hidden');
    this._bindStick(stick);

    this.updateMoney();
    this.updateWeapon();
    this.updateCharacter();
  }

  _pickChar(id) {
    this._selectedChar = id;
    this.charJax.classList.toggle('sel', id === 'jax');
    this.charMaya.classList.toggle('sel', id === 'maya');
    if (this.game) this.game.selectedChar = id;
  }

  _toggleSub(panelEl) {
    const other = panelEl === this.settingsEl ? this.creditsEl : this.settingsEl;
    other.classList.add('hidden');
    panelEl.classList.toggle('hidden');
  }

  _settingRow(parent, label, key, type, value) {
    const row = el('label', null, parent, label);
    let input;
    if (type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!value;
      input.addEventListener('change', () => { settings.set(key, input.checked); this.game.audio && this.game.audio.setMuted(settings.get('mute')); });
    } else if (type === 'range') {
      input = document.createElement('input');
      input.type = 'range'; input.min = 0.5; input.max = 2; input.step = 0.5; input.value = value;
      input.addEventListener('change', () => settings.set(key, Number(input.value)));
    } else {
      input = document.createElement('select');
      for (const opt of ['auto', 'high', 'medium', 'low']) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (opt === value) o.selected = true;
        input.appendChild(o);
      }
      input.addEventListener('change', () => settings.set(key, input.value));
    }
    row.appendChild(input);
    return row;
  }

  _touchBtn(parent, label, action) {
    const b = el('button', null, parent, label);
    const down = (e) => { e.preventDefault(); this.game.input.touch[action] = true; };
    const up = (e) => { e.preventDefault(); this.game.input.touch[action] = false; };
    b.addEventListener('touchstart', down, { passive: false });
    b.addEventListener('touchend', up);
    b.addEventListener('mousedown', down);
    b.addEventListener('mouseup', up);
    return b;
  }

  _bindStick(stick) {
    const t = this.game.input.touch;
    let active = null;
    const move = (e) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = clamp((e.clientX - cx) / 45, -1, 1);
      const dz = clamp((e.clientY - cy) / 45, -1, 1);
      this.stickKnob.style.left = `${35 + dx * 32}px`;
      this.stickKnob.style.top = `${35 + dz * 32}px`;
      t.mx = dx; t.mz = dz;
      t.gas = dz < -0.3; t.brake = dz > 0.3;
    };
    const end = () => {
      active = null;
      this.stickKnob.style.left = '35px';
      this.stickKnob.style.top = '35px';
      t.mx = 0; t.mz = 0; t.gas = false; t.brake = false;
    };
    stick.addEventListener('touchstart', (e) => { active = e.changedTouches[0].identifier; move(e.changedTouches[0]); }, { passive: true });
    stick.addEventListener('touchmove', (e) => { for (const c of e.changedTouches) if (c.identifier === active) move(c); }, { passive: true });
    stick.addEventListener('touchend', end);
    stick.addEventListener('mousedown', (e) => { active = 'mouse'; move(e); });
    window.addEventListener('mousemove', (e) => { if (active === 'mouse') move(e); });
    window.addEventListener('mouseup', end);
  }

  // -- loading / menu ----------------------------------------------------------
  setLoading(pct, text) {
    this.loadingEl.classList.remove('hidden');
    this.loadFill.style.width = `${clamp(pct, 0, 100)}%`;
    if (text) this.loadText.textContent = text;
  }

  hideLoading() {
    this.loadingEl.classList.add('hidden');
  }

  showMenu() {
    this.menuEl.classList.remove('hidden');
    this.pauseEl.classList.add('hidden');
    this.phoneEl.classList.add('hidden');
    this.hideDealer();
    this.hideGarage();
    this.hideWheel();
  }

  hideMenu() {
    this.menuEl.classList.add('hidden');
    this.settingsEl.classList.add('hidden');
    this.creditsEl.classList.add('hidden');
  }

  // -- per-frame ----------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    this.updateMoney();
    // Health / armor bars + wanted stars + clock.
    this.hpFill.style.width = `${clamp(p.health || 0, 0, 100)}%`;
    this.armorFill.style.width = `${clamp(p.armor || 0, 0, 100)}%`;
    const wanted = g.police ? g.police.wanted : 0;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < wanted ? '★' : '<span class="off">☆</span>';
    this.starsEl.innerHTML = stars;
    if (g.weather) {
      const h = g.weather.hour || 12;
      const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      this.clockEl.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      this.weatherEl.textContent = g.weather.isNight && g.weather.isNight() ? 'Night' : (g.weather.name || 'Clear');
    }
    // Nitro bar + weapon label refresh (cheap, keeps ammo always current).
    const car = g.vehicles ? (g.vehicles.playerCar || g.vehicles.playerBoat || g.vehicles.playerHeli) : null;
    this.nitroFill.style.width = `${car ? clamp(car.nitro || 0, 0, 100) : 0}%`;
    this.updateWeapon();
    // Dialogue auto-advance + mission card timer.
    if (this._dlgTimer > 0) {
      this._dlgTimer -= dt;
      if (this._dlgTimer <= 0) this._advanceDialogue();
    }
    if (this._cardTimer > 0) {
      this._cardTimer -= dt;
      if (this._cardTimer <= 0) this.cardEl.classList.add('hidden');
    }
    // District banner on change — never while the mission card is up or a
    // cutscene is running: both are centred and their titles jumble into
    // one unreadable mess (round 6 fix).
    const suppressBanner = !this.cardEl.classList.contains('hidden') || !!(g.cutsceneT > 0);
    const d = this.districtName();
    if (d !== this._lastDistrict) {
      this._lastDistrict = d;
      this.districtEl.textContent = d;
      if (!suppressBanner) {
        this.districtEl.classList.remove('hidden');
        this._districtT = 2.5;
      }
    }
    if (this._districtT > 0) {
      this._districtT -= dt;
      if (this._districtT <= 0) this.districtEl.classList.add('hidden');
    }
    if (suppressBanner) this.districtEl.classList.add('hidden');
    // Touch controls hide during cutscenes (round 3 fix) — enforced every
    // frame, not gated on touch detection, so a control forced visible by
    // any path is re-hidden while the cutscene runs and returns after it
    // ends (round 6 fix).
    if (this.touchEl) {
      const showTouch = ('ontouchstart' in window) && !(g.cutsceneT > 0);
      this.touchEl.classList.toggle('hidden', !showTouch);
    }
    // Minimap, throttled.
    this._mapT -= dt;
    if (this._mapT <= 0) {
      this._mapT = 0.15;
      this._drawMinimap();
    }
  }

  updateMissionPanel() {
    const g = this.game;
    const m = g.missions ? g.missions.current : null;
    if (m) {
      const step = g.missions.step;
      this.missionTitle.textContent = m.name || 'JOB';
      this.missionText.textContent = step ? step.text : '';
      this.missionEl.classList.remove('hidden');
    } else {
      this.missionTitle.textContent = 'LA VEGA';
      this.missionText.textContent = 'Free roam — find work at the club.';
      this.missionEl.classList.remove('hidden');
    }
  }

  // -- toasts / prompts / hints ---------------------------------------------------
  notify(text) {
    const t = el('div', 'lv-panel lv-toast', this.feedEl, text);
    this._notifyT.push(t);
    if (this._notifyT.length > 5) this._notifyT.shift().remove();
    setTimeout(() => { t.remove(); const i = this._notifyT.indexOf(t); if (i >= 0) this._notifyT.splice(i, 1); }, 4500);
  }

  showPrompt(text) {
    this.promptEl.textContent = text;
    this.promptEl.classList.remove('hidden');
  }

  hidePrompt() {
    this.promptEl.classList.add('hidden');
  }

  hint(text) {
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
    clearTimeout(this._hintTO);
    this._hintTO = setTimeout(() => this.hintEl.classList.add('hidden'), 4000);
  }

  // -- dialogue / mission card -----------------------------------------------------
  showDialogue(who, text) {
    this._dlgQueue = [{ who, text }];
    this._showDlgHead();
  }

  showDialogueSequence(arr) {
    this._dlgQueue = (arr || []).slice();
    this._showDlgHead();
  }

  _showDlgHead() {
    const head = this._dlgQueue[0];
    if (!head) { this.dialogueEl.classList.add('hidden'); return; }
    this.dlgWho.textContent = head.who || '';
    this.dlgLine.textContent = head.text || '';
    this.dialogueEl.classList.remove('hidden');
    this._dlgTimer = 5;
  }

  _advanceDialogue() {
    this._dlgQueue.shift();
    this._dlgTimer = 0;
    if (this._dlgQueue.length) this._showDlgHead();
    else this.dialogueEl.classList.add('hidden');
  }

  showMissionCard(act, title, text) {
    this.cardAct.textContent = act || '';
    this.cardTitle.textContent = title || '';
    this.cardText.textContent = text || '';
    this.cardEl.classList.remove('hidden');
    this._cardTimer = 5;
  }

  // -- weapon wheel ---------------------------------------------------------------
  showWheel(show) {
    if (show) {
      const p = this.game.player;
      this.wheelEl.innerHTML = '';
      for (const id of WEAPON_ORDER) {
        const w = WEAPONS[id];
        const owned = p.weapons && p.weapons[id];
        const slot = el('div', `lv-wheel-slot${owned ? ' owned' : ' locked'}${p.weapon === id ? ' sel' : ''}`, this.wheelEl);
        const ammo = id === 'fists' ? '∞' : (owned ? `${p.weapon === id ? p.magAmmo : w.mag} / ${owned.ammo}` : `$${w.price}`);
        slot.innerHTML = `<div class="lv-sname">${w.name}</div><div class="lv-sammo">${ammo}</div>`;
        slot.addEventListener('click', () => {
          if (owned) { p.setWeapon(id); this.hideWheel(); }
          else this.notify(`Buy the ${w.name} at Vega Arms ($${w.price}).`);
        });
      }
      this.wheelEl.classList.remove('hidden');
    } else {
      this.hideWheel();
    }
  }

  hideWheel() {
    this.wheelEl.classList.add('hidden');
  }

  // -- dealer + garage --------------------------------------------------------------
  showDealer() {
    this.dealerRows.innerHTML = '';
    for (const key of CAR_CATALOG) {
      const m = CAR_MODELS[key];
      if (!m) continue;
      const row = el('div', 'lv-dealer-row', this.dealerRows);
      row.innerHTML = `<span>${m.name}</span><span class="lv-price">$${m.price.toLocaleString()}</span>`;
      row.addEventListener('click', () => this.game.buyCar(key));
    }
    this.dealerEl.classList.remove('hidden');
  }

  hideDealer() {
    this.dealerEl.classList.add('hidden');
  }

  showGarage() {
    this.garageRows.innerHTML = '';
    const owned = this.game.ownedCars || [];
    if (!owned.length) {
      el('div', 'lv-dealer-row', this.garageRows, '<span>No cars stored yet.</span>');
    }
    owned.forEach((c, i) => {
      const m = CAR_MODELS[c.specKey] || { name: c.specKey };
      const row = el('div', 'lv-dealer-row', this.garageRows);
      row.innerHTML = `<span>${m.name} · cond ${c.cond}% · fuel ${c.fuel}%</span><span class="lv-price">Take out</span>`;
      row.addEventListener('click', () => this.game.takeOutCar(i));
    });
    this.garageEl.classList.remove('hidden');
  }

  hideGarage() {
    this.garageEl.classList.add('hidden');
  }

  // -- phone / pause -------------------------------------------------------------------
  showPhone(show) {
    this.phoneEl.classList.toggle('hidden', !show);
    if (show) {
      const g = this.game;
      const h = g.weather ? Math.floor(g.weather.hour || 12) : 12;
      this.phoneTime.textContent = `${String(h).padStart(2, '0')}:00 — La Vega`;
    }
  }

  showPause(show) {
    this.pauseEl.classList.toggle('hidden', !show);
  }

  // -- feedback popups ---------------------------------------------------------------------
  showDrift(score) {
    this.driftEl.textContent = `DRIFT +${Math.round(score)}`;
    this.driftEl.classList.remove('hidden');
    clearTimeout(this._driftTO);
    this._driftTO = setTimeout(() => this.driftEl.classList.add('hidden'), 1300);
  }

  socialPost(user, text) {
    const post = el('div', 'lv-panel lv-post', this.socialEl, `<b>${user}</b><br>${text}`);
    while (this.socialEl.children.length > 3) this.socialEl.lastChild.remove();
    setTimeout(() => post.remove(), 9000);
  }

  showReward(text, sub) {
    this.rewardMain.textContent = text || '';
    this.rewardSub.textContent = sub || '';
    this.rewardEl.classList.remove('hidden');
    clearTimeout(this._rewardTO);
    this._rewardTO = setTimeout(() => this.rewardEl.classList.add('hidden'), 4000);
  }

  flashWanted() {
    this.starsEl.style.transform = 'scale(1.3)';
    this.starsEl.style.color = '#ff5a5a';
    setTimeout(() => { this.starsEl.style.transform = ''; this.starsEl.style.color = ''; }, 350);
  }

  showBusted(paid) {
    this.bustedText.textContent = paid ? `The LVPD impounded your ride. You paid $${paid} in fines.` : 'Busted — the LVPD let you go with a warning.';
    this.bustedEl.classList.remove('hidden');
  }

  flashDamage() {
    this.vignetteEl.style.opacity = '1';
    setTimeout(() => { this.vignetteEl.style.opacity = '0'; }, 180);
  }

  // -- district + character + money + weapon ----------------------------------------------------
  districtName() {
    const p = this.game.player;
    if (!p) return 'LA VEGA';
    if (p.x < 15) return 'THE BAY';
    for (const d of DISTRICTS) {
      if (p.x >= d.x0 && p.x < d.x1 && p.z >= d.z0 && p.z < d.z1) return d.name;
    }
    return 'LA VEGA';
  }

  updateCharacter() {
    const p = this.game.player;
    if (!p) return;
    this._selectedChar = p.charId || 'jax';
    this.charJax.classList.toggle('sel', this._selectedChar === 'jax');
    this.charMaya.classList.toggle('sel', this._selectedChar === 'maya');
  }

  updateMoney() {
    const p = this.game.player;
    if (!p) return;
    this.moneyEl.textContent = `$${Math.floor(p.money || 0).toLocaleString()}`;
  }

  updateWeapon() {
    const p = this.game.player;
    if (!p) return;
    const w = WEAPONS[p.weapon] || WEAPONS.fists;
    if (p.weapon === 'fists' || !w.mag) {
      this.weaponName.textContent = 'FISTS ∞';
      this.weaponAmmo.textContent = 'Unarmed — press Q to punch';
      return;
    }
    const reserve = p.weapons && p.weapons[p.weapon] ? p.weapons[p.weapon].ammo : 0;
    // One text node holds the full label ("PISTOL 12 / 60").
    this.weaponName.textContent = `${w.name} ${p.magAmmo} / ${reserve}`;
    this.weaponAmmo.textContent = `Reserve ${reserve} — X to reload`;
  }

  // -- minimap ---------------------------------------------------------------------------
  _drawMinimap() {
    const g = this.game;
    const ctx = this.mapCanvas.getContext('2d');
    if (!ctx) return;
    const S = 190 / 400;
    ctx.fillStyle = '#20301e';
    ctx.fillRect(0, 0, 190, 190);
    ctx.fillStyle = '#1a4a6a';
    ctx.fillRect(0, 0, 15 * S, 190);
    ctx.fillStyle = '#c8b078';
    ctx.fillRect(15 * S, 0, 15 * S, 190);
    ctx.strokeStyle = '#5a5a66';
    ctx.lineWidth = 3;
    for (const r of ROADS) {
      ctx.beginPath(); ctx.moveTo(r * S, 0); ctx.lineTo(r * S, 190); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, r * S); ctx.lineTo(190, r * S); ctx.stroke();
    }
    if (g.city && g.city.colliders) {
      ctx.fillStyle = '#3a3a44';
      for (const c of g.city.colliders) {
        ctx.fillRect(c.x0 * S, c.z0 * S, Math.max(1, (c.x1 - c.x0) * S), Math.max(1, (c.z1 - c.z0) * S));
      }
    }
    const step = g.missions ? g.missions.step : null;
    if (step && typeof step.x === 'number' && typeof step.z === 'number') {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath(); ctx.arc(step.x * S, step.z * S, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd34d';
      ctx.beginPath(); ctx.arc(step.x * S, step.z * S, 8, 0, Math.PI * 2); ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x * S, z * S, r, 0, Math.PI * 2); ctx.fill();
    };
    if (g.characters && g.characters.npcs) {
      for (const n of g.characters.npcs.slice(0, 60)) if (!n.dead) dot(n.x, n.z, '#7dff8a', 1.6);
    }
    if (g.vehicles) {
      for (const c of g.vehicles.cars.slice(0, 60)) dot(c.x, c.z, '#ff8c1a', 1.8);
    }
    if (g.police && g.police.units) {
      for (const u of g.police.units) if (u.car) dot(u.car.x, u.car.z, '#2a6fd6', 2.2);
    }
    const p = g.player;
    if (p) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x * S, p.z * S);
      ctx.lineTo((p.x + Math.sin(p.heading) * 10) * S, (p.z + Math.cos(p.heading) * 10) * S);
      ctx.stroke();
      dot(p.x, p.z, '#ffffff', 3.2);
      ctx.strokeStyle = '#ff2a9d';
      ctx.beginPath(); ctx.arc(p.x * S, p.z * S, 5, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
