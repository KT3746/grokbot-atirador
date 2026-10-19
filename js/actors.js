// Personagens humanoides feitos de primitivas, com animacao e IA simples
import * as THREE from 'three';
import { camoTex, fabricTex } from './textures.js?v=1.0.0';
import { clamp, damp, lerp } from './util.js?v=1.0.0';

const G = {}; const M = {};
function geo(key, fn) { return G[key] || (G[key] = fn()); }
function mat(key, fn) { return M[key] || (M[key] = fn()); }
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
const HIT = new THREE.MeshBasicMaterial({ visible: false });

const SKINS = [0xe0b48f, 0xc68e63, 0x9c6a45, 0x6e4a32, 0xf0c9a5, 0xb07a52];

function caps(r, l) { return geo('c' + r + l, () => new THREE.CapsuleGeometry(r, l, 4, 10)); }
function box(w, h, d) { return geo('b' + w + h + d, () => new THREE.BoxGeometry(w, h, d)); }
function sph(r, ws = 14, hs = 10) { return geo('s' + r + ws, () => new THREE.SphereGeometry(r, ws, hs)); }
function cyl(rt, rb, h, s = 10) { return geo('y' + rt + rb + h + s, () => new THREE.CylinderGeometry(rt, rb, h, s)); }

function mesh(g, m, x = 0, y = 0, z = 0, parent) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = false; if (parent) parent.add(o); return o; }
function hit(g, part, actor, parent, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, HIT); o.position.set(x, y, z); o.userData = { actor, part }; parent.add(o); actor.hitboxes.push(o); return o; }

function look(kind, r) {
  if (kind === 'merc') {
    const camo = mat('camo', () => { const t = camoTex(3); return std(0xffffff, { map: t.map, roughness: 0.95 }); });
    return { shirt: camo, pants: camo, vest: mat('vest', () => std(0x23262a, { roughness: 0.7 })), boots: mat('boots', () => std(0x151515, { roughness: 0.6 })), head: ['helmet', 'cap', 'balaclava', 'beret'][Math.floor(r() * 4)], band: true, rifle: true };
  }
  if (kind === 'hvt') {
    return { shirt: mat('hvtcoat', () => std(0x6b5a44, { map: fabricTex('#7a6a50').map })), pants: mat('hvtp', () => std(0x2b2b30)), vest: null, boots: mat('boots2', () => std(0x2a1a10, { roughness: 0.4 })), head: 'redberet', band: true, rifle: false, glasses: true };
  }
  const shirts = ['#d9d4c7', '#3f6fa8', '#b0473b', '#4e8a55', '#d4a23c', '#8a5aa0'];
  const sc = shirts[Math.floor(r() * shirts.length)];
  return { shirt: mat('sh' + sc, () => std(0xffffff, { map: fabricTex(sc).map })), pants: mat('jeans', () => std(0x3a4a66, { map: fabricTex('#3c4c6a').map })), vest: null, boots: mat('shoe', () => std(0x4a3a2a)), head: kind === 'hostage' ? 'blind' : (r() < 0.5 ? 'hat' : 'hair'), band: false, rifle: false };
}

export class Actor {
  constructor(def, world, r) {
    this.def = def; this.kind = def.kind; this.name = def.name || null; this.world = world;
    this.hitboxes = []; this.alive = true; this.hp = 100; this.state = def.pose === 'kneel' ? 'kneel' : (def.pose === 'idle' || def.path.length === 1) ? 'idle' : 'patrol';
    this.r = r; this.t = r() * 10; this.phase = r() * 6; this.wpi = 0; this.waitT = 0; this.alertT = 0; this.speedNow = 0; this.deadT = 0; this.escaped = false; this.fallDir = -1;
    const anc = world.anchors[def.a] || { x: 0, y: null, z: 0 };
    this.fixedY = anc.y != null ? anc.y : null;
    this.path = def.path.map(([x, z]) => new THREE.Vector3(anc.x + x, 0, anc.z + z));
    this.path.forEach(p => p.y = this.groundY(p.x, p.z));
    this.escape = def.escape ? new THREE.Vector3(anc.x + def.escape[0], 0, anc.z + def.escape[1]) : null;
    if (this.escape) this.escape.y = this.groundY(this.escape.x, this.escape.z);
    this.build(look(this.kind, r));
    this.root.position.copy(this.path[0]);
    this.root.rotation.y = this.path.length > 1 ? Math.atan2(this.path[1].x - this.path[0].x, this.path[1].z - this.path[0].z) : Math.atan2(-this.path[0].x, -this.path[0].z) + (r() - 0.5) * 2;
    this.heading = this.root.rotation.y; this.lookYaw = 0;
  }
  groundY(x, z) { return this.fixedY != null ? this.fixedY : this.world.groundAt(x, z); }
  build(L) {
    const r = this.r, root = this.root = new THREE.Group(); root.rotation.order = 'YXZ';
    const si = Math.floor(r() * SKINS.length); const skin = mat('skin' + si, () => std(SKINS[si], { roughness: 0.6 }));
    const body = this.body = new THREE.Group(); body.position.y = 0.95; root.add(body);
    mesh(box(0.34, 0.2, 0.21), L.pants, 0, 0, 0, body);
    hit(box(0.38, 0.24, 0.26), 'torso', this, body);
    const torso = this.torso = new THREE.Group(); torso.position.y = 0.08; body.add(torso);
    const tm = mesh(caps(0.17, 0.3), L.shirt, 0, 0.3, 0, torso); tm.scale.set(1.12, 1, 0.72);
    if (L.vest) { mesh(box(0.37, 0.36, 0.27), L.vest, 0, 0.3, 0, torso); mesh(box(0.1, 0.12, 0.05), L.vest, -0.1, 0.24, 0.15, torso); mesh(box(0.1, 0.12, 0.05), L.vest, 0.1, 0.24, 0.15, torso); }
    hit(box(0.42, 0.56, 0.3), 'torso', this, torso, 0, 0.3, 0);
    mesh(cyl(0.055, 0.06, 0.1), skin, 0, 0.56, 0, torso);
    const head = this.head = new THREE.Group(); head.position.y = 0.6; torso.add(head);
    const hm = mesh(sph(0.112), L.head === 'balaclava' ? mat('bala', () => std(0x1b1b1d, { roughness: 0.9 })) : skin, 0, 0.11, 0, head); hm.scale.set(0.92, 1.06, 1);
    mesh(box(0.03, 0.05, 0.04), L.head === 'balaclava' ? hm.material : skin, 0, 0.1, 0.11, head);
    hit(sph(0.13, 8, 6), 'head', this, head, 0, 0.11, 0.0);
    const dark = mat('dark', () => std(0x111214, { roughness: 0.5 }));
    if (L.head === 'helmet') { const h = mesh(geo('helm', () => new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), mat('helmm', () => std(0x3a3d36, { roughness: 0.7 })), 0, 0.13, -0.005, head); h.scale.set(1, 0.95, 1.08); mesh(box(0.2, 0.035, 0.03), dark, 0, 0.13, 0.12, head); }
    else if (L.head === 'cap') { mesh(cyl(0.118, 0.118, 0.07, 12), mat('capm', () => std(0x26282a)), 0, 0.18, 0, head); mesh(box(0.16, 0.012, 0.1), mat('capm', () => std(0x26282a)), 0, 0.15, 0.12, head); mesh(box(0.17, 0.03, 0.02), dark, 0, 0.12, 0.11, head); }
    else if (L.head === 'beret' || L.head === 'redberet') { const b = mesh(cyl(0.125, 0.12, 0.05, 12), L.head === 'redberet' ? mat('rb', () => std(0x8c1c1c)) : mat('bb', () => std(0x161616)), 0.02, 0.2, 0, head); b.rotation.z = 0.25; }
    else if (L.head === 'hat') { mesh(cyl(0.2, 0.2, 0.015, 14), mat('straw', () => std(0xc8b07a)), 0, 0.19, 0, head); mesh(cyl(0.1, 0.115, 0.09, 12), mat('straw', () => std(0xc8b07a)), 0, 0.23, 0, head); }
    else if (L.head === 'hair') { const h = mesh(geo('hair', () => new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), mat('hairm' + (r() < 0.5 ? 0 : 1), () => std(r() < 0.5 ? 0x2a1a10 : 0x111111)), 0, 0.13, -0.01, head); }
    else if (L.head === 'blind') { mesh(cyl(0.117, 0.117, 0.04, 12), mat('blindm', () => std(0xd8d0c0)), 0, 0.13, 0, head); mesh(geo('hair', () => new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), mat('hairm0', () => std(0x2a1a10)), 0, 0.14, -0.01, head); }
    if (L.glasses) mesh(box(0.17, 0.035, 0.02), dark, 0, 0.12, 0.11, head);
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(0.215 * side, 0.47, 0); torso.add(sh);
      mesh(caps(0.052, 0.2), L.shirt, 0, -0.14, 0, sh);
      if (L.band) mesh(cyl(0.058, 0.058, 0.05, 8), mat('band', () => std(0x9e1d1a)), 0, -0.1, 0, sh);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      mesh(caps(0.045, 0.2), L.shirt, 0, -0.12, 0, el);
      mesh(sph(0.045, 8, 6), L.rifle ? mat('glove', () => std(0x1c1c1c)) : skin, 0, -0.26, 0, el);
      return { sh, el };
    };
    this.armL = arm(1); this.armR = arm(-1);
    const leg = (side) => {
      const hp = new THREE.Group(); hp.position.set(0.1 * side, -0.05, 0); body.add(hp);
      mesh(caps(0.072, 0.3), L.pants, 0, -0.22, 0, hp);
      hit(box(0.15, 0.45, 0.16), 'limb', this, hp, 0, -0.22, 0);
      const kn = new THREE.Group(); kn.position.y = -0.45; hp.add(kn);
      mesh(caps(0.058, 0.32), L.pants, 0, -0.21, 0, kn);
      hit(box(0.13, 0.45, 0.14), 'limb', this, kn, 0, -0.21, 0);
      mesh(box(0.11, 0.08, 0.25), L.boots, 0, -0.44, 0.04, kn);
      return { hp, kn };
    };
    this.legL = leg(1); this.legR = leg(-1);
    if (L.rifle) {
      const g = new THREE.Group(); const gm = mat('gun', () => std(0x1d1f22, { metalness: 0.6, roughness: 0.45 }));
      mesh(box(0.05, 0.08, 0.7), gm, 0, 0, 0, g); mesh(cyl(0.012, 0.012, 0.3, 6), gm, 0, 0.01, 0.48, g).rotation.x = Math.PI / 2;
      mesh(box(0.04, 0.15, 0.06), gm, 0, -0.1, 0.05, g); mesh(cyl(0.025, 0.025, 0.16, 8), gm, 0, 0.06, 0.05, g).rotation.x = Math.PI / 2;
      g.position.set(-0.06, 0.2, 0.26); g.rotation.set(0.5, 0.35, 0); torso.add(g); this.gun = g;
    }
    root.traverse(o => { if (o.isMesh && o.material !== HIT) o.castShadow = true; });
  }
  get pos() { return this.root.position; }
  headWorld(v) { return this.head.getWorldPosition(v).add(new THREE.Vector3(0, 0.1, 0)); }
  alert(src, strong = true) {
    if (!this.alive || this.kind === 'hostage') return false;
    const was = this.state === 'alert' || this.state === 'flee';
    if (this.kind === 'hvt' && this.escape) { this.state = 'flee'; }
    else if (this.kind === 'civil') { this.state = 'flee'; this.civTarget = this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 50, 0, (Math.random() - 0.5) * 50)); this.civTarget.y = this.groundY(this.civTarget.x, this.civTarget.z); }
    else { this.state = 'alert'; this.alertT = 12; this.scramble = null; this.scrambleWait = 0.6 + Math.random() * 0.8; }
    this.alertSrc = src ? src.clone() : null;
    return !was;
  }
  kill(dir, part) {
    if (!this.alive) return; this.alive = false; this.state = 'dead'; this.deadT = 0; this.hitPart = part;
    const f = new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
    this.fallDir = dir.dot(f) < 0 ? -1 : 1; this.fallStartY = this.body.position.y;
  }
  setPose(o) {
    const { L, R, aL, aR } = { L: this.legL, R: this.legR, aL: this.armL, aR: this.armR };
    L.hp.rotation.x = o.thL; R.hp.rotation.x = o.thR; L.kn.rotation.x = o.knL; R.kn.rotation.x = o.knR;
    aL.sh.rotation.set(o.shL, 0, o.shzL || 0.08); aR.sh.rotation.set(o.shR, 0, -(o.shzR || 0.08)); aL.el.rotation.x = o.elL; aR.el.rotation.x = o.elR;
  }
  moveTo(target, speed, dt) {
    const p = this.pos, dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.25) return true;
    const want = Math.atan2(dx, dz); let dh = want - this.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += clamp(dh, -dt * 4, dt * 4);
    const st = Math.min(d, speed * dt * (Math.abs(dh) > 1.2 ? 0.3 : 1));
    p.x += Math.sin(this.heading) * st; p.z += Math.cos(this.heading) * st; p.y = this.groundY(p.x, p.z);
    this.speedNow = speed; return false;
  }
  update(dt, playerPos) {
    this.t += dt;
    if (this.state === 'dead') return this.animDead(dt);
    this.speedNow = 0;
    const toPlayer = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    if (this.state === 'patrol') {
      if (this.waitT > 0) { this.waitT -= dt; }
      else if (this.moveTo(this.path[this.wpi], this.def.speed || 1.2, dt)) { this.wpi = (this.wpi + 1) % this.path.length; this.waitT = this.def.wait || 2; }
    } else if (this.state === 'alert') {
      this.alertT -= dt;
      if (this.scrambleWait > 0) { this.scrambleWait -= dt; this.turnTo(toPlayer, dt, 5); }
      else if (!this.scramble) { const a = Math.random() * Math.PI * 2; this.scramble = this.pos.clone().add(new THREE.Vector3(Math.cos(a) * 7, 0, Math.sin(a) * 7)); this.scramble.y = this.groundY(this.scramble.x, this.scramble.z); this.scrambleDone = false; }
      else if (!this.scrambleDone) { if (this.moveTo(this.scramble, 3.8, dt)) this.scrambleDone = true; }
      else this.turnTo(toPlayer, dt, 3);
      if (this.alertT <= 0) { this.state = this.path.length > 1 && this.def.pose !== 'idle' ? 'patrol' : 'idle'; if (this.state === 'idle') this.path[0].copy(this.pos); }
    } else if (this.state === 'flee') {
      const tgt = this.kind === 'hvt' ? this.escape : this.civTarget;
      if (tgt && this.moveTo(tgt, this.kind === 'hvt' ? 4.6 : 4, dt)) { if (this.kind === 'hvt') this.escaped = true; else { this.state = 'cower'; } }
    } else if (this.state === 'idle') {
      this.lookYaw = Math.sin(this.t * 0.4 + this.phase) * 0.8;
    }
    this.root.rotation.y = this.heading;
    this.animate(dt);
  }
  turnTo(a, dt, k) { let dh = a - this.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2; this.heading += dh * Math.min(1, dt * k); }
  animate(dt) {
    const s = this.speedNow, run = s > 2.5, t = this.t;
    this.head.rotation.y = damp(this.head.rotation.y, this.state === 'idle' ? this.lookYaw : (this.waitT > 0 ? Math.sin(t * 0.7) * 0.6 : 0), 3, dt);
    if (this.state === 'kneel') {
      this.body.position.y = 0.5 + Math.sin(t * 2) * 0.004; this.torso.rotation.x = 0.12 + Math.sin(t * 1.3) * 0.02;
      this.setPose({ thL: -0.05, thR: -0.05, knL: 1.6, knR: 1.6, shL: -2.7, shR: -2.7, shzL: 0.55, shzR: 0.55, elL: -2.0, elR: -2.0 });
      this.head.rotation.x = 0.25 + Math.sin(t * 0.8) * 0.05; return;
    }
    if (this.state === 'cower') {
      this.body.position.y = damp(this.body.position.y, 0.55, 6, dt); this.torso.rotation.x = 0.5;
      this.setPose({ thL: -1.3, thR: -1.3, knL: 2.2, knR: 2.2, shL: -2.6, shR: -2.6, shzL: 0.5, shzR: 0.5, elL: -2.1, elR: -2.1 }); return;
    }
    if (s > 0.05) {
      this.phase += dt * s * 4.4;
      const a = run ? 0.85 : 0.5, p = this.phase;
      this.body.position.y = 0.95 - (run ? 0.06 : 0.01) + Math.abs(Math.sin(p)) * (run ? 0.06 : 0.03);
      this.torso.rotation.x = run ? 0.28 : 0.04; this.torso.rotation.y = Math.sin(p) * 0.08;
      const armed = !!this.gun;
      this.setPose({
        thL: Math.sin(p) * a, thR: -Math.sin(p) * a,
        knL: Math.max(0, -Math.sin(p - 0.9)) * a * 1.5 + 0.05, knR: Math.max(0, Math.sin(p - 0.9)) * a * 1.5 + 0.05,
        shL: armed ? -0.75 : -Math.sin(p) * a * 0.8, shR: armed ? -0.35 : Math.sin(p) * a * 0.8,
        elL: armed ? -1.1 : -0.3 - (run ? 0.9 : 0), elR: armed ? -1.25 : -0.3 - (run ? 0.9 : 0),
      });
      if (this.gun) this.gun.rotation.x = run ? 0.9 : 0.5;
    } else {
      const br = Math.sin(t * 1.8 + this.phase) * 0.012, alert = this.state === 'alert';
      this.body.position.y = damp(this.body.position.y, alert && this.scrambleDone ? 0.62 : 0.95, 6, dt);
      this.torso.rotation.x = (alert ? 0.1 : 0.02) + br; this.torso.rotation.y = 0;
      const crouch = alert && this.scrambleDone;
      this.setPose(crouch ? { thL: -1.4, thR: -0.3, knL: 1.4, knR: 1.9, shL: -1.35, shR: -1.1, elL: -0.25, elR: -1.0 } :
        this.gun ? { thL: 0.02, thR: -0.02, knL: 0.04, knR: 0.04, shL: alert ? -1.35 : -0.7, shR: alert ? -1.1 : -0.35, elL: alert ? -0.25 : -1.1, elR: alert ? -1.0 : -1.25 } :
          { thL: 0.02, thR: -0.02, knL: 0.04, knR: 0.04, shL: br * 2, shR: -br * 2, elL: -0.15, elR: -0.15 });
      if (this.gun) { this.gun.rotation.x = alert ? 0.0 : 0.5; this.gun.position.y = alert ? 0.4 : 0.2; this.gun.position.z = alert ? 0.3 : 0.26; }
    }
  }
  animDead(dt) {
    if (this.deadT > 1.6) return;
    this.deadT += dt; const t = this.deadT;
    const k1 = clamp(t / 0.25, 0, 1);
    this.body.position.y = lerp(this.fallStartY, this.fallStartY * 0.7, k1);
    this.setPose({ thL: -0.5 * k1, thR: -0.3 * k1, knL: 0.9 * k1, knR: 0.6 * k1, shL: -1.6 * k1 * -this.fallDir * 0.6, shR: -1.0 * k1, shzL: 0.9 * k1, shzR: 1.2 * k1, elL: -0.4, elR: -0.6 });
    const k2 = clamp((t - 0.12) / 0.75, 0, 1); let e = k2 * k2;
    if (k2 >= 1) { const b = clamp((t - 0.87) / 0.35, 0, 1); e = 1 - Math.sin(b * Math.PI) * 0.06 * (1 - b); }
    this.root.rotation.x = this.fallDir * e * (Math.PI / 2 - 0.08);
    this.head.rotation.x = this.fallDir * -0.3 * e;
    this.torso.rotation.x = 0.1;
    this.deadLift = (this.deadLift || 0); this.root.position.y = this.groundY(this.root.position.x, this.root.position.z) + 0.1 * e;
  }
}
