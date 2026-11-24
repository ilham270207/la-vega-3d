// La Vega 3D — campaign: 12 missions in 4 acts ("LA VEGA").
// Step engine: steal / reach / deliver / evade / killAll / defeat /
// checkpoint / reachWanted / buy / heat / bridge. World marker beacon,
// timers, cutscene cards, dialogue, rewards, district standing, auto-save.
// Written in this session for the recorded build.
import * as THREE from 'three';
import { MISSIONS, PLACES, DISTRICTS } from './config.js';
import { clamp, dist2d, rand } from './rng.js';
import { groundHeight } from './city.js';
import { NPC } from './characters.js';

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.nextIdx = 0;        // index of the next mission to offer
    this.current = null;     // mission object currently active
    this.stepIdx = 0;
    this.stepT = 0;          // countdown for timed steps (0 = no timer)
    this.enemies = [];
    this.marker = null;      // THREE.Group beacon at the current objective
    this.markerPos = null;   // {x, z} for the minimap blip
    this.failedT = 0;
  }

  get step() { return this.current ? this.current.steps[this.stepIdx] : null; }
  get stepTimeLeft() { return this.stepT; }
  get active() { return !!this.current; }
  get nextMission() { return MISSIONS[this.nextIdx] || null; }

  // Talk to La Rosa (E near the club) to start the next job.
  talkToLaRosa() {
    const g = this.game;
    if (this.current) {
      g.hud.notify(`Current job: ${this.current.name} — ${this.step ? this.step.text : ''}`);
      return;
    }
    const m = this.nextMission;
    if (!m) {
      g.hud.showDialogue('La Rosa', "La Vega is yours, baby. Every street, every star, every dollar. The city is your playground now — go enjoy it.");
      return;
    }
    this.startMission(m.id);
  }

  startMission(id) {
    const g = this.game;
    const m = MISSIONS.find((x) => x.id === id);
    if (!m) return;
    this.current = m;
    this.stepIdx = 0;
    this.enemies = [];
    g.cutsceneT = 2.6;
    g.hud.showMissionCard(m.act, `MISSION ${m.id}/12 — ${m.name}`, m.intro);
    g.audio?.missionStart();
    if (m.dialogueBefore) g.hud.showDialogueSequence(m.dialogueBefore);
    this._setupStep();
  }

  _setupStep() {
    const g = this.game;
    const step = this.step;
    if (!step) { this._completeMission(); return; }
    this.stepT = step.time || 0;
    this.markerPos = step.marker ? { x: step.marker.x, z: step.marker.y } : null;
    // 'steal' steps have no fixed marker: point at the nearest parked car
    // so the player can always find the objective.
    if (step.type === 'steal' && !this.markerPos) {
      const p = g.player;
      let best = null, bd = Infinity;
      for (const c of g.vehicles.cars) {
        if (!c.isParked || c.kind !== 'car' || c.dead) continue;
        const d = dist2d(p.x, p.z, c.x, c.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) this.markerPos = { x: best.x, z: best.z };
    }
    this._setMarker(this.markerPos);
    // Step-specific setup.
    if ((step.type === 'killAll' || step.type === 'defeat') && step.marker) {
      const n = step.count || 4;
      for (let i = 0; i < n; i++) {
        const npc = new NPC(g, {
          kind: 'gang',
          x: step.marker.x + rand(g.rng, -8, 8),
          z: step.marker.y + rand(g.rng, -8, 8),
          modelKey: 'npcMale',
          shirt: 0x8a1a1a,
          home: { x: step.marker.x, z: step.marker.y },
        });
        npc.build();
        npc.state = 'chase';
        npc.fleeFrom = { x: g.player.x, z: g.player.z };
        g.characters.npcs.push(npc);
        this.enemies.push(npc);
      }
      g.hud.notify(`${n} Vultures incoming — deal with them!`);
    }
    if (step.type === 'evade' && g.police.wanted === 0) {
      // The job says "lose the heat" — so there must be heat to lose.
      g.police.setWanted(2, 'the heat is on');
    }
    if (step.type === 'heat' && step.wanted) {
      g.police.setWanted(step.wanted, 'the harbor patrol is on you');
    }
    if (step.type === 'reachWanted') {
      g.hud.notify(`Make some noise — get to ${step.wanted} stars!`);
    }
    if (step.type === 'buy') {
      g.hud.notify('At Auto Palms press 1 sedan $800 · 2 truck $1,000 · 3 sport $1,500');
    }
    g.hud.updateMissionPanel();
  }

  // GPS beam to La Rosa when no mission is active (GAP 9): the player
  // spawns with no marker and no way to find mission 1 — the idle beam
  // points at the club so the first job is always findable. A taxi job
  // owns the marker while it runs, so it is left alone.
  updateIdleMarker() {
    if (this.current || this.game.taxi) return;
    const m = this.nextMission;
    if (!m) {
      if (this.markerPos) { this.markerPos = null; this._setMarker(null); }
      return;
    }
    const target = { x: PLACES.club.x, z: PLACES.club.y };
    if (!this.markerPos || this.markerPos.x !== target.x || this.markerPos.z !== target.z) {
      this.markerPos = target;
      this._setMarker(target);
    }
  }

  _setMarker(pos) {
    const g = this.game;
    if (this.marker) { g.scene.remove(this.marker); this.marker = null; }
    if (!pos) return;
    const grp = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 30; grp.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; grp.add(ring);
    const gy = groundHeight(pos.x, pos.z);
    grp.position.set(pos.x, gy, pos.z);
    g.scene.add(grp);
    this.marker = grp;
    this.marker.userData.baseY = gy;
  }

  // Called by the dealer purchase flow (main.js).
  onCarBought() {
    if (this.current && this.step && this.step.type === 'buy') this._advanceStep();
  }
  // Called when the player steals/enters a car (main.js polls inCar instead;
  // this hook is for the dealer/steal flows that need an instant check).
  onCarEntered() {
    if (this.current && this.step && this.step.type === 'steal') this._advanceStep();
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!this.current || !this.step) return;
    // Marker pulse.
    if (this.marker) {
      this.marker.rotation.y += dt * 0.8;
      this.marker.position.y = this.marker.userData.baseY + Math.sin(performance.now() / 400) * 0.4;
    }
    // Timed steps.
    if (this.stepT > 0) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this._failMission('Out of time!'); return; }
    }
    // Keep spawned enemies hunting the player.
    for (const e of this.enemies) {
      if (!e.dead && e.state === 'chase') e.fleeFrom = { x: p.x, z: p.z };
    }
    const step = this.step;
    const inCar = !!p.inCar;
    switch (step.type) {
      case 'steal':
        if (inCar) this._advanceStep();
        break;
      case 'reach':
      case 'checkpoint':
      case 'bridge':
        if (this.markerPos && dist2d(p.x, p.z, this.markerPos.x, this.markerPos.z) < 7) this._advanceStep();
        break;
      case 'deliver': {
        const ok = this.markerPos && dist2d(p.x, p.z, this.markerPos.x, this.markerPos.z) < 7;
        if (ok && (!step.needCar || inCar)) this._advanceStep();
        else if (ok && step.needCar && !inCar) g.hud.hint('You need to be in a car for this drop.');
        break;
      }
      case 'evade':
        if (g.police.wanted === 0) this._advanceStep();
        break;
      case 'reachWanted':
        if (g.police.wanted >= (step.wanted || 3)) this._advanceStep();
        break;
      case 'heat':
        if (g.police.wanted >= (step.wanted || 5)) this._advanceStep();
        break;
      case 'killAll':
      case 'defeat': {
        this.enemies = this.enemies.filter((e) => !e.dead && e.state !== 'dead');
        if (this.enemies.length === 0) this._advanceStep();
        break;
      }
      case 'buy':
        break; // completed via onCarBought()
    }
    g.hud.updateMissionPanel();
  }

  _advanceStep() {
    const g = this.game;
    g.audio?.stepDone();
    this.stepIdx++;
    if (this.stepIdx >= this.current.steps.length) this._completeMission();
    else this._setupStep();
  }

  _completeMission() {
    const g = this.game;
    const m = this.current;
    if (this.marker) { g.scene.remove(this.marker); this.marker = null; }
    this.markerPos = null;
    // Rewards.
    if (m.reward) {
      g.player.money += m.reward;
      g.hud.showReward(`+$${m.reward.toLocaleString()}`, m.onComplete || '');
    }
    // District standing +8% where the job ended.
    const d = DISTRICTS.find((dd) => g.player.x >= dd.x0 && g.player.x < dd.x1 && g.player.z >= dd.z0 && g.player.z < dd.z1);
    if (d) {
      g.standing[d.key] = clamp((g.standing[d.key] || 0) + 8, 0, 100);
      g.hud.notify(`${d.name} standing +8% (now ${Math.round(g.standing[d.key])}%)`);
    }
    // Mission 1 unlocks the pistol.
    if (m.id === 1) {
      g.player.giveWeapon('pistol', 36);
      g.hud.notify('PISTOL unlocked — press Tab for the weapon wheel.');
    }
    if (m.id === 8) g.player.giveWeapon('smg', 60);
    if (m.id === 11) g.player.giveWeapon('shotgun', 12);
    if (m.dialogueAfter) g.hud.showDialogueSequence(m.dialogueAfter);
    g.hud.showMissionCard('JOB DONE', m.name, m.onComplete || `+$${m.reward}`);
    g.audio?.missionComplete();
    g.cutsceneT = 1.8;
    this.current = null;
    this.stepIdx = 0;
    this.nextIdx = Math.max(this.nextIdx, m.id); // ids are 1-based, next index = id
    this.enemies = [];
    g.saveGame?.(true); // auto-save after every job
    const next = this.nextMission;
    if (next) g.hud.notify(`Next job: "${next.name}" — talk to La Rosa at the club.`);
    else g.hud.notify('Campaign complete! La Vega is yours. Free roam, Vega.');
    g.hud.updateMissionPanel();
  }

  _failMission(reason) {
    const g = this.game;
    g.hud.notify(`${reason} Job failed — talk to La Rosa to try again.`);
    g.audio?.missionFail();
    if (this.marker) { g.scene.remove(this.marker); this.marker = null; }
    this.markerPos = null;
    for (const e of this.enemies) if (!e.dead) g.characters.recycleNPC(e);
    this.enemies = [];
    this.current = null;
    this.stepIdx = 0;
    g.hud.updateMissionPanel();
  }

  onBusted() {
    if (!this.current) return;
    this._failMission('BUSTED! The LVPD caught you.');
  }

  // Save/load state.
  serialize() {
    return { nextIdx: this.nextIdx, currentId: this.current ? this.current.id : null, stepIdx: this.stepIdx };
  }
  restore(data) {
    if (!data) return;
    this.nextIdx = data.nextIdx || 0;
    if (data.currentId) {
      const m = MISSIONS.find((x) => x.id === data.currentId);
      if (m) {
        this.current = m;
        this.stepIdx = clamp(data.stepIdx || 0, 0, m.steps.length - 1);
        this._setupStep();
      }
    }
  }
}
