// crew.js — La Vega crew system (round 12).
// Recruit pedestrians into the player's crew: they follow, fight beside
// the player, and can be dismissed from the crew panel. Pure logic, no
// rendering of its own — the character manager owns NPC movement and
// animation; this module owns membership, follow targets and combat assist.

export const MAX_CREW = 4;

const CREW_NAMES = ['Rico', 'Lena', 'Marco', 'Tari', 'Dono', 'Sari', 'Bima', 'Nia'];
const RECRUITABLE_STATES = ['walk', 'chat', 'sit', 'wait', 'shop', 'work'];

export class CrewManager {
  constructor(game) {
    this.game = game;
    this.members = [];
    this.holdPosition = false;
    this.attackOrderT = 0;
    this._nameIdx = 0;
  }

  get count() { return this.members.length; }
  get full() { return this.members.length >= MAX_CREW; }

  isRecruitable(npc) {
    if (!npc || npc.dead) return false;
    if (npc.isCrew) return false;
    if (npc.kind !== 'ped') return false;
    if (!RECRUITABLE_STATES.includes(npc.state)) return false;
    return true;
  }

  nearestRecruitable(x, z, range = 3.2) {
    const g = this.game;
    let best = null;
    let bestD = range;
    for (const npc of g.characters.npcs) {
      if (!this.isRecruitable(npc)) continue;
      const d = Math.hypot(npc.x - x, npc.z - z);
      if (d < bestD) { bestD = d; best = npc; }
    }
    return best;
  }

  recruit(npc) {
    if (!this.isRecruitable(npc)) return { ok: false, reason: 'not recruitable' };
    if (this.full) return { ok: false, reason: 'crew full' };
    let name = null;
    for (let i = 0; i < CREW_NAMES.length; i++) {
      const cand = CREW_NAMES[(this._nameIdx + i) % CREW_NAMES.length];
      if (!this.members.some((m) => m.crewName === cand)) { name = cand; break; }
    }
    this._nameIdx += 1;
    npc.isCrew = true;
    npc.kind = 'crew';
    npc.state = 'crew';
    npc.crewName = name || 'Crew';
    npc.crewSlot = this.members.length;
    npc.moveSpeed = 0;
    this.members.push(npc);
    const g = this.game;
    if (g.hud) g.hud.notify(`${npc.crewName} joined your crew! (${this.members.length}/${MAX_CREW})`);
    if (g.hud) g.hud.updateCrewPanel();
    if (g.audio) g.audio.cash();
    return { ok: true, name: npc.crewName };
  }

  dismiss(member) {
    const idx = this.members.indexOf(member);
    if (idx < 0) return false;
    this.members.splice(idx, 1);
    member.isCrew = false;
    member.kind = 'ped';
    member.state = 'walk';
    member.crewName = null;
    member.crewSlot = -1;
    member.moveSpeed = 0;
    this.members.forEach((m, i) => { m.crewSlot = i; });
    const g = this.game;
    if (g.hud) { g.hud.notify('Crew member dismissed.'); g.hud.updateCrewPanel(); }
    return true;
  }

  dismissAll() {
    while (this.members.length) this.dismiss(this.members[0]);
  }

  // Z/X/C abilities: regroup (come to the player), attack (rush the
  // nearest hostile), hold (stay where they are).
  command(cmd) {
    const g = this.game;
    if (cmd === 'regroup') {
      this.holdPosition = false;
      for (const m of this.members) m.crewOrder = 'follow';
      if (g.hud) g.hud.notify('Crew: regroup on me.');
    } else if (cmd === 'attack') {
      this.holdPosition = false;
      this.attackOrderT = 6;
      for (const m of this.members) m.crewOrder = 'attack';
      if (g.hud) g.hud.notify('Crew: take them down!');
    } else if (cmd === 'hold') {
      this.holdPosition = true;
      for (const m of this.members) { m.crewOrder = 'hold'; m.holdX = m.x; m.holdZ = m.z; }
      if (g.hud) g.hud.notify('Crew: hold position.');
    }
  }

  _nearestHostile(x, z, range) {
    const g = this.game;
    let best = null;
    let bestD = range;
    for (const npc of g.characters.npcs) {
      if (npc.dead || npc.isCrew) continue;
      const hostile = npc.kind === 'gang' || (npc.kind === 'cop' && g.police && g.police.wanted > 0);
      if (!hostile) continue;
      const d = Math.hypot(npc.x - x, npc.z - z);
      if (d < bestD) { bestD = d; best = npc; }
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    if (this.attackOrderT > 0) this.attackOrderT -= dt;
    for (const m of this.members) {
      if (m.dead) continue;
      m.punchCd = Math.max(0, (m.punchCd || 0) - dt);
      // --- follow target ---
      let tx;
      let tz;
      let wantRun = false;
      if (m.crewOrder === 'hold' || this.holdPosition) {
        tx = m.holdX !== undefined ? m.holdX : m.x;
        tz = m.holdZ !== undefined ? m.holdZ : m.z;
      } else if (p.inCar) {
        // Wait by the car while the player drives.
        const car = g.vehicles.playerCar;
        const ang = (m.crewSlot / Math.max(1, this.members.length)) * Math.PI * 2 + 0.6;
        tx = (car ? car.x : p.x) + Math.cos(ang) * 3.2;
        tz = (car ? car.z : p.z) + Math.sin(ang) * 3.2;
      } else if (m.crewOrder === 'attack' || this.attackOrderT > 0) {
        const foe = this._nearestHostile(m.x, m.z, 26);
        if (foe) { tx = foe.x; tz = foe.z; wantRun = true; }
        else { m.crewOrder = 'follow'; }
      }
      if (tx === undefined) {
        const ang = (m.crewSlot / Math.max(1, this.members.length)) * Math.PI * 2;
        tx = p.x + Math.cos(ang) * 2.4;
        tz = p.z + Math.sin(ang) * 2.4;
      }
      const dx = tx - m.x;
      const dz = tz - m.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.35) {
        const speed = (wantRun || dist > 6) ? 6.5 : 3.4;
        const step = Math.min(dist, speed * dt);
        // Axis-separated movement: try X, then Z. Walking straight into
        // a building would pin the member against its wall forever;
        // sliding along one axis at a time routes around it.
        const nx = m.x + (dx / dist) * step;
        const nz = m.z + (dz / dist) * step;
        if (!this._blocked(nx, m.z)) m.x = nx;
        if (!this._blocked(m.x, nz)) m.z = nz;
        m.heading = Math.atan2(dx, dz);
        m.moveSpeed = speed;
      } else {
        m.moveSpeed = 0;
        // Face the player when idle.
        if (!p.inCar) m.heading = Math.atan2(p.x - m.x, p.z - m.z);
      }
      // Keep crew on the island (characters.js resolves NPC building
      // collisions for crew members too).
      if (g.city) {
        const c = g.city.clampPlayer(m.x, m.z);
        m.x = c.x; m.z = c.z;
      }
      // --- combat assist: punch a hostile in reach ---
      const foe = this._nearestHostile(m.x, m.z, 2.4);
      if (foe && m.punchCd <= 0) {
        m.punchCd = 0.9;
        m.punchAnimT = 0.35;
        foe.health = (foe.health === undefined ? 100 : foe.health) - 34;
        if (foe.health <= 0 && !foe.dead) {
          foe.state = 'dying';
          foe.deadT = 0;
          if (foe.kind === 'cop' && g.police) g.police.addHeat(1, 'crew fight');
        }
      }
    }
  }

  _blocked(x, z) {
    const g = this.game;
    if (!g.city) return false;
    for (const col of g.city.colliders) {
      if (Math.hypot(x - col.x, z - col.z) < col.r + 0.5) return true;
    }
    return false;
  }

  serialize() {
    return this.members.map((m) => ({ name: m.crewName, x: m.x, z: m.z }));
  }
}
