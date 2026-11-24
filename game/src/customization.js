// customization.js — clothes / salon / tattoo shops (round 13).
// Written from scratch by Thirteen (round 13, recording 01a20d7f).
// Changes are applied to the live player model and are visible in-game.
import * as THREE from 'three';
import { dist2d, resolveNotifier, makeTextTexture, box } from './twelve-utils.js';

export const SHIRT_COLORS = [
  { name: 'Crimson', hex: 0xd8232a }, { name: 'Ocean', hex: 0x2470c8 },
  { name: 'Lime', hex: 0x7ac74f }, { name: 'Gold', hex: 0xe0a52e },
  { name: 'Violet', hex: 0x7b4fd0 }, { name: 'White', hex: 0xf2f2f2 },
  { name: 'Black', hex: 0x1c1f26 }, { name: 'Teal', hex: 0x1f9e8e },
];
export const HAIR_STYLES = ['short', 'mohawk', 'buzz', 'long'];
export const HAIR_COLORS = [
  { name: 'Black', hex: 0x14100c }, { name: 'Brown', hex: 0x5a3a22 },
  { name: 'Blonde', hex: 0xd8b25a }, { name: 'Red', hex: 0xa83226 },
  { name: 'Silver', hex: 0xb8bcc4 }, { name: 'Blue', hex: 0x2a4fd0 },
];
export const TATTOOS = ['wave', 'star', 'skull', 'tribal'];

export const CUSTOM_SHOPS = [
  { id: 'threads', name: 'Vega Threads', kind: 'clothes', x: 104, z: 156 },
  { id: 'cuts', name: 'Neon Cuts', kind: 'salon', x: 117, z: 65 },
  { id: 'ink', name: 'Ink Wave', kind: 'tattoo', x: 195, z: 130 },
];

export class CustomizationSystem {
  constructor(ctx) {
    this.ctx = ctx || {};
    this.notify = resolveNotifier(this.ctx);
    this.state = { shirt: 0xd8232a, hairStyle: 'short', hairColor: 0x14100c, tattoo: null };
    this.applied = { shirtMeshes: [], hairMeshes: [], style: null, tattoo: null };
    this._panel = null;
    this._panelShop = null;
    this._hairCap = null;
    this._tattooMesh = null;
  }

  promptFor(player) {
    if (!player) return null;
    let best = null;
    let bestD = 7;
    for (const s of CUSTOM_SHOPS) {
      const d = dist2d(player.x, player.z, s.x, s.z);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) return null;
    return { id: best.id, name: best.name, kind: best.kind, label: `${best.name} — press E to customize` };
  }

  // Find the player's meshes by name, with a positional fallback for
  // models whose parts are unnamed (torso = meshes around y 1.0–1.5).
  _findParts(player) {
    const out = { shirt: [], hair: [], head: null };
    if (!player || !player.group) return out;
    const heads = [];
    player.group.traverse((o) => {
      if (!o.isMesh) return;
      const name = (o.name || '').toLowerCase();
      if (/shirt|torso|top|jacket|chest|body/.test(name)) out.shirt.push(o);
      else if (/hair/.test(name)) out.hair.push(o);
      else if (/head|face|skull/.test(name)) heads.push(o);
    });
    if (heads.length) out.head = heads[0];
    // Fallback: if no named shirt mesh, take the widest mesh in torso height
    // (world Y above the feet, so nested GLB parts still match).
    if (!out.shirt.length) {
      let best = null;
      let bestW = 0;
      const baseY = (player.group.position && player.group.position.y) || 0;
      player.group.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const wy = o.getWorldPosition(new THREE.Vector3()).y - baseY;
        if (wy > 0.95 && wy < 1.55) {
          o.geometry.computeBoundingBox();
          const b = o.geometry.boundingBox;
          if (!b) return;
          const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
          if (w > bestW) { bestW = w; best = o; }
        }
      });
      if (best) out.shirt.push(best);
    }
    return out;
  }

  _tint(meshes, hex) {
    const names = [];
    for (const m of meshes) {
      try {
        if (!m.material) continue;
        if (Array.isArray(m.material)) {
          m.material = m.material.map((mt) => { const c = mt.clone(); c.color.setHex(hex); return c; });
        } else {
          m.material = m.material.clone();
          m.material.color.setHex(hex);
        }
        names.push(m.name || 'mesh');
      } catch (e) { /* leave the mesh alone */ }
    }
    return names;
  }

  applyToPlayer(player) {
    if (!player) return this.applied;
    const parts = this._findParts(player);
    this.applied.shirtMeshes = this._tint(parts.shirt, this.state.shirt);
    this.applied.hairMeshes = this._tint(parts.hair, this.state.hairColor);
    // Hair cap for the chosen style, parented to the player group.
    if (this._hairCap && this._hairCap.parent) this._hairCap.parent.remove(this._hairCap);
    this._hairCap = null;
    const headY = 1.72;
    if (this.state.hairStyle === 'mohawk') {
      const cap = box(0.08, 0.22, 0.5, this.state.hairColor, { y: headY + 0.08 });
      cap.name = 'hair-mohawk';
      player.group.add(cap);
      this._hairCap = cap;
    } else if (this.state.hairStyle === 'long') {
      const cap = box(0.4, 0.55, 0.12, this.state.hairColor, { y: headY - 0.1, z: -0.16 });
      cap.name = 'hair-long';
      player.group.add(cap);
      this._hairCap = cap;
    } else if (this.state.hairStyle === 'short') {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: this.state.hairColor }),
      );
      cap.name = 'hair-short';
      cap.position.y = headY;
      player.group.add(cap);
      this._hairCap = cap;
    }
    this.applied.style = this.state.hairStyle;
    // Tattoo plane on the upper torso.
    if (this._tattooMesh && this._tattooMesh.parent) this._tattooMesh.parent.remove(this._tattooMesh);
    this._tattooMesh = null;
    if (this.state.tattoo) {
      const tex = makeTextTexture(this.state.tattoo === 'wave' ? '~' : this.state.tattoo === 'star' ? '★' : this.state.tattoo === 'skull' ? '☠' : '᛭', { color: '#14100c', w: 128, h: 128 });
      const t = new THREE.Mesh(
        new THREE.PlaneGeometry(0.26, 0.26),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      t.name = 'tattoo-' + this.state.tattoo;
      t.position.set(0.18, 1.32, 0.24);
      player.group.add(t);
      this._tattooMesh = t;
    }
    this.applied.tattoo = this.state.tattoo;
    return this.applied;
  }

  setShirt(hex) {
    this.state.shirt = hex;
    if (this.ctx.player) this.applyToPlayer(this.ctx.player);
    this.notify('New shirt color equipped.');
    this._refreshPanel();
  }

  setHair(style, hex) {
    if (style) this.state.hairStyle = style;
    if (hex !== undefined) this.state.hairColor = hex;
    if (this.ctx.player) this.applyToPlayer(this.ctx.player);
    this.notify('New hairstyle equipped.');
    this._refreshPanel();
  }

  setTattoo(name) {
    this.state.tattoo = name || null;
    if (this.ctx.player) this.applyToPlayer(this.ctx.player);
    this.notify(name ? `Tattoo applied: ${name}.` : 'Tattoo removed.');
    this._refreshPanel();
  }

  togglePanel(shopId) {
    const shop = CUSTOM_SHOPS.find((s) => s.id === shopId) || CUSTOM_SHOPS[0];
    if (this._panel && this._panelShop === shop.id && !this._panel.classList.contains('hidden')) {
      this._panel.classList.add('hidden');
      return;
    }
    this._panelShop = shop.id;
    if (!this._panel) this._buildPanel();
    this._refreshPanel();
    this._panel.classList.remove('hidden');
  }

  _buildPanel() {
    const el = document.createElement('div');
    el.className = 'lv-custom-panel hidden';
    el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:95;width:min(420px,92vw);background:rgba(10,14,26,0.96);border:2px solid #f5d76e;border-radius:12px;padding:16px;color:#fff;font:600 15px system-ui,sans-serif;';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><span class="lv-custom-title" style="font-size:18px;">CUSTOMIZE</span><button class="lv-custom-close" style="background:#222a3d;color:#fff;border:1px solid #555;border-radius:6px;padding:4px 10px;cursor:pointer;">CLOSE</button></div><div class="lv-custom-rows"></div>';
    el.querySelector('.lv-custom-close').addEventListener('click', () => el.classList.add('hidden'));
    document.body.appendChild(el);
    this._panel = el;
  }

  _swatch(hex, label, onClick) {
    const b = document.createElement('button');
    b.title = label;
    b.style.cssText = `width:34px;height:34px;border-radius:50%;border:2px solid #fff;background:#${hex.toString(16).padStart(6, '0')};cursor:pointer;margin:3px;`;
    b.addEventListener('click', onClick);
    return b;
  }

  _refreshPanel() {
    if (!this._panel) return;
    const shop = CUSTOM_SHOPS.find((s) => s.id === this._panelShop) || CUSTOM_SHOPS[0];
    this._panel.querySelector('.lv-custom-title').textContent = shop.name.toUpperCase();
    const rows = this._panel.querySelector('.lv-custom-rows');
    rows.innerHTML = '';
    const section = (title) => {
      const h = document.createElement('div');
      h.textContent = title;
      h.style.cssText = 'color:#9fb0c3;font-size:13px;margin:10px 0 4px;';
      rows.appendChild(h);
    };
    if (shop.kind === 'clothes') {
      section('SHIRT COLOR');
      for (const c of SHIRT_COLORS) rows.appendChild(this._swatch(c.hex, c.name, () => this.setShirt(c.hex)));
    } else if (shop.kind === 'salon') {
      section('HAIR STYLE');
      for (const s of HAIR_STYLES) {
        const b = document.createElement('button');
        b.textContent = s.toUpperCase();
        b.style.cssText = 'background:#222a3d;color:#fff;border:1px solid #555;border-radius:6px;padding:7px 10px;margin:3px;cursor:pointer;font-weight:700;';
        b.addEventListener('click', () => this.setHair(s));
        rows.appendChild(b);
      }
      section('HAIR COLOR');
      for (const c of HAIR_COLORS) rows.appendChild(this._swatch(c.hex, c.name, () => this.setHair(null, c.hex)));
    } else {
      section('TATTOO');
      for (const t of TATTOOS) {
        const b = document.createElement('button');
        b.textContent = t.toUpperCase();
        b.style.cssText = 'background:#222a3d;color:#fff;border:1px solid #555;border-radius:6px;padding:7px 10px;margin:3px;cursor:pointer;font-weight:700;';
        b.addEventListener('click', () => this.setTattoo(t));
        rows.appendChild(b);
      }
      const none = document.createElement('button');
      none.textContent = 'REMOVE';
      none.style.cssText = 'background:#8a1a1a;color:#fff;border:none;border-radius:6px;padding:7px 10px;margin:3px;cursor:pointer;font-weight:700;';
      none.addEventListener('click', () => this.setTattoo(null));
      rows.appendChild(none);
    }
  }

  update() { /* event-driven; nothing per frame */ }

  serialize() { return { ...this.state }; }

  deserialize(data) {
    if (!data) return;
    this.state = { ...this.state, ...data };
    if (this.ctx.player) this.applyToPlayer(this.ctx.player);
  }

  dispose() {
    if (this._panel && this._panel.parentNode) this._panel.parentNode.removeChild(this._panel);
    this._panel = null;
  }
}
