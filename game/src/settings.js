// La Vega 3D — player settings (persisted in localStorage).
// Written in this session for the recorded build.
const KEY = 'la-vega-3d-settings-v1';

const DEFAULTS = {
  music: true,
  sfx: true,
  mute: false,
  quality: 'auto', // auto | high | medium | low
  controlMode: 'auto', // auto | touch | pc
  cameraShake: true,
  showHints: true,
  sensitivity: 1, // camera drag sensitivity multiplier (0.5 / 1 / 1.5 / 2)
  radio: 0, // station index
};

let _s = { ...DEFAULTS };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) _s = { ...DEFAULTS, ...JSON.parse(raw) };
} catch (e) { /* fresh settings */ }

export const settings = {
  get(k) { return _s[k]; },
  set(k, v) {
    // Validate the two enum settings so a bad stored value can never
    // break the control-mode / quality auto-detection downstream.
    if (k === 'quality' && !['auto', 'high', 'medium', 'low'].includes(v)) v = 'auto';
    if (k === 'controlMode' && !['auto', 'touch', 'pc'].includes(v)) v = 'auto';
    if (k === 'radio') v = ((v % 3) + 3) % 3;
    // R4: validate the settings that were never checked — a bad stored
    // sensitivity (NaN, 0, 99) used to break camera drag, and a stray
    // string in a boolean flag used to flip it truthy forever.
    if (k === 'sensitivity') v = Math.min(2, Math.max(0.5, Number(v) || 1));
    if (k === 'cameraShake' || k === 'showHints' || k === 'music' || k === 'sfx' || k === 'mute') v = !!v;
    _s[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(_s)); } catch (e) { /* ignore */ }
  },
  all() { return { ..._s }; },
  reset() {
    _s = { ...DEFAULTS };
    try { localStorage.setItem(KEY, JSON.stringify(_s)); } catch (e) { /* ignore */ }
  },
};

// Touch device detection (used for the auto control mode).
export function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

// Effective control mode: 'touch' or 'pc'.
export function effectiveControlMode() {
  const m = settings.get('controlMode');
  if (m === 'touch') return 'touch';
  if (m === 'pc') return 'pc';
  return isTouchDevice() ? 'touch' : 'pc';
}
