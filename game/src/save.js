// La Vega 3D — save system: 3 slots in localStorage.
// Saves character + position + Health/Armor/stamina, money, weapons + ammo,
// owned cars + condition + fuel, mission progress, district standing,
// day/time, radio station. Auto-save after every mission and every
// purchase; manual save at the safehouse (sleep). Written in this session.
import { SAVE_KEY } from './config.js';

function slotKey(slot) { return `${SAVE_KEY}-slot${slot}`; }

export class SaveManager {
  constructor(game) {
    this.game = game;
  }

  collect() {
    const g = this.game;
    const p = g.player;
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      charId: p.charId,
      x: p.x, z: p.z, heading: p.heading,
      health: p.health, armor: p.armor, stamina: p.stamina,
      money: p.money,
      weapons: p.weapons,
      weapon: p.weapon,
      standing: g.standing,
      missions: g.missions.serialize(),
      day: g.weather.day,
      time: g.weather.time,
      weatherKind: g.weather.kind,
      station: g.audio ? g.audio.stationIdx : 0,
      ownedCars: (g.ownedCars || []).map((c) => ({
        specKey: c.specKey, color: c.color, cond: Math.round(c.cond), fuel: Math.round(c.fuel),
      })),
      rank: g.rank || 0,
      businesses: g.businesses || {},
      stats: p.stats || { drive: 0, shoot: 0 },
    };
  }

  save(slot, auto = false) {
    try {
      const data = this.collect();
      // R4: keep the previous save as a backup before overwriting, so a
      // corrupt write (crash mid-save, storage quota) never loses the slot.
      try {
        const prev = localStorage.getItem(slotKey(slot));
        if (prev) localStorage.setItem(slotKey(slot) + '-bak', prev);
      } catch (e) { /* backup is best-effort */ }
      localStorage.setItem(slotKey(slot), JSON.stringify(data));
      if (!auto) this.game.hud.notify(`Game saved — slot ${slot}.`);
      return true;
    } catch (e) {
      this.game.hud.notify('Save failed — storage unavailable.');
      return false;
    }
  }

  load(slot) {
    try {
      const raw = localStorage.getItem(slotKey(slot));
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through to the backup below */ }
    // R4: main slot unreadable — fall back to the pre-overwrite backup.
    try {
      const bak = localStorage.getItem(slotKey(slot) + '-bak');
      if (bak) return JSON.parse(bak);
    } catch (e) { /* no usable backup */ }
    return null;
  }

  hasBackup(slot) {
    try { return !!localStorage.getItem(slotKey(slot) + '-bak'); } catch (e) { return false; }
  }

  hasSlot(slot) {
    try { return !!localStorage.getItem(slotKey(slot)); } catch (e) { return false; }
  }

  slotInfo(slot) {
    const d = this.load(slot);
    if (!d) return null;
    return { savedAt: d.savedAt, money: d.money, charId: d.charId, mission: d.missions ? d.missions.nextIdx : 0 };
  }

  // Summary of all three slots (for the load menu).
  listSlots() {
    return [1, 2, 3].map((s) => ({ slot: s, info: this.slotInfo(s) }));
  }

  deleteSlot(slot) {
    try { localStorage.removeItem(slotKey(slot)); } catch (e) {}
  }
}
