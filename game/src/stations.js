// stations.js — La Vega fuel + repair (round 12).
// Petro Vega sells fuel, the Tune-Up Workshop repairs body damage. Both
// are real interactions now: drive in, stop, pay, and the car actually
// changes. Fuel drains while driving; an empty tank stalls the car, and
// roadside fuel can rescue a stalled car anywhere for a fee.
import { PLACES } from './config.js';

export const FUEL_PRICE = 20;      // full tank, flat (matches the old price list)
export const REPAIR_BASE = 50;     // base repair price, scaled by damage
export const ROADSIDE_PRICE = 25;  // roadside rescue fee
export const ROADSIDE_FUEL = 25;   // fuel delivered by roadside rescue
export const FUEL_DRAIN = 0.015;   // fuel % per metre-per-second per second

export class StationsManager {
  constructor(game) {
    this.game = game;
    this.stations = [
      {
        key: 'gas', name: 'Petro Vega', kind: 'gas',
        x: PLACES.gas.x, z: PLACES.gas.y, r: 11,
        fuelPrice: FUEL_PRICE, repairPrice: REPAIR_BASE,
      },
      {
        key: 'workshop', name: 'Tune-Up Workshop', kind: 'workshop',
        x: PLACES.workshop.x, z: PLACES.workshop.y, r: 9,
        fuelPrice: FUEL_PRICE, repairPrice: REPAIR_BASE,
      },
    ];
  }

  stationByKey(key) {
    return this.stations.find((s) => s.key === key) || null;
  }

  nearestStation(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const s of this.stations) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best ? { station: best, dist: bestD } : null;
  }

  inZone(station, x, z) {
    return Math.hypot(station.x - x, station.z - z) < station.r;
  }

  inGasZone(x, z) {
    const s = this.stationByKey('gas');
    return s && this.inZone(s, x, z);
  }

  inWorkshopZone(x, z) {
    const s = this.stationByKey('workshop');
    return s && this.inZone(s, x, z);
  }

  repairCost(car) {
    const missing = Math.max(0, 100 - (car.cond ?? 100));
    return Math.max(10, Math.round(REPAIR_BASE * (missing / 100)));
  }

  // What the HUD should offer right now (null = nothing nearby).
  promptFor(player) {
    const g = this.game;
    if (!player || !player.inCar) return null;
    const car = g.vehicles ? g.vehicles.playerCar : null;
    if (!car) return null;
    if (Math.abs(car.speed) > 1) return null;
    const near = this.nearestStation(car.x, car.z);
    if (!near || near.dist > near.station.r) return null;
    const s = near.station;
    const canRefuel = s.kind === 'gas' && car.fuel < 99.5;
    const canRepair = car.cond < 99.5;
    if (!canRefuel && !canRepair) return null;
    return {
      station: s,
      gas: s.kind === 'gas',
      workshop: s.kind === 'workshop',
      canRefuel,
      refuelCost: s.fuelPrice,
      canRepair,
      repairCost: this.repairCost(car),
      fuel: Math.round(car.fuel),
      cond: Math.round(car.cond),
    };
  }

  refuel(car) {
    const g = this.game;
    const p = g.player;
    if (!car) return { ok: false, reason: 'no car' };
    if (car.fuel >= 99.5) return { ok: false, reason: 'tank full' };
    if (p.money < FUEL_PRICE) return { ok: false, reason: 'not enough cash' };
    p.money -= FUEL_PRICE;
    car.fuel = 100;
    car.stalled = false;
    if (g.audio) g.audio.cash();
    if (g.hud) g.hud.notify(`Tank full — $${FUEL_PRICE}.`);
    return { ok: true, cost: FUEL_PRICE };
  }

  repair(car) {
    const g = this.game;
    const p = g.player;
    if (!car) return { ok: false, reason: 'no car' };
    if (car.cond >= 99.5) return { ok: false, reason: 'already mint' };
    const cost = this.repairCost(car);
    if (p.money < cost) return { ok: false, reason: 'not enough cash' };
    p.money -= cost;
    car.cond = 100;
    if (g.audio) g.audio.cash();
    if (g.hud) g.hud.notify(`Repaired to 100% — $${cost}.`);
    return { ok: true, cost };
  }

  // Rescue a stalled car anywhere: roadside delivery, +25 fuel for $25.
  roadside(car) {
    const g = this.game;
    const p = g.player;
    if (!car) return { ok: false, reason: 'no car' };
    if (!car.stalled && car.fuel > 0) return { ok: false, reason: 'not stalled' };
    if (p.money < ROADSIDE_PRICE) return { ok: false, reason: 'not enough cash' };
    p.money -= ROADSIDE_PRICE;
    car.fuel = Math.min(100, car.fuel + ROADSIDE_FUEL);
    car.stalled = false;
    if (g.audio) g.audio.cash();
    if (g.hud) g.hud.notify(`Roadside fuel +${ROADSIDE_FUEL} — $${ROADSIDE_PRICE}.`);
    return { ok: true, cost: ROADSIDE_PRICE };
  }

  update() {
    // Stations are event-driven (prompts + buttons); nothing ticks here.
  }
}
