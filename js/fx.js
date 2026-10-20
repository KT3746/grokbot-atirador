// Efeitos visuais: tracante, clarao do disparo, poeira, faiscas, cartuchos, marcas
import * as THREE from 'three';
import { spriteTex } from './textures.js?v=1.2.0';

export class FX {
  constructor(scene) {
    this.scene = scene; this.parts = []; this.pool = [];
    for (let i = 0; i < 90; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex('smoke'), transparent: true, depthWrite: false, fog: true })); s.visible = false; scene.add(s); this.pool.push(s); }
    this.sparkMat = new THREE.SpriteMaterial({ map: spriteTex('spark'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    // tracante
    const tg = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); tg.rotateX(Math.PI / 2); tg.translate(0, 0, -0.5);
    this.tracer = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })); this.tracer.visible = false; this.tracer.frustumCulled = false; scene.add(this.tracer);
    // bala visivel na camera lenta
    const bg = new THREE.Group(); const bm = new THREE.MeshStandardMaterial({ color: 0xc9a050, metalness: 1, roughness: 0.25 });
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.03, 12), bm); b1.rotation.x = Math.PI / 2; bg.add(b1);
    const b2 = new THREE.Mesh(new THREE.ConeGeometry(0.0065, 0.022, 12), new THREE.MeshStandardMaterial({ color: 0xb06a3a, metalness: 1, roughness: 0.3 })); b2.rotation.x = -Math.PI / 2; b2.position.z = -0.026; bg.add(b2);
    this.bullet = bg; bg.visible = false; scene.add(bg);
    const trg = new THREE.CylinderGeometry(0.004, 0.02, 1, 8, 1, true); trg.rotateX(Math.PI / 2); trg.translate(0, 0, 0.5);
    this.trail = new THREE.Mesh(trg, new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.25, depthWrite: false })); this.trail.visible = false; scene.add(this.trail);
    // marcas de bala
    this.decals = []; const dm = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < 24; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), dm); d.visible = false; scene.add(d); this.decals.push(d); } this.di = 0;
    // cartuchos
    this.shells = []; const sg = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8); sg.rotateZ(Math.PI / 2); const sm = new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 1, roughness: 0.3 });
    // estilhacos (um unico InstancedMesh)
    const dg = new THREE.DodecahedronGeometry(1, 0); this.debMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    this.deb = new THREE.InstancedMesh(dg, this.debMat, 48); this.deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.deb.frustumCulled = false; this.deb.setColorAt(0, new THREE.Color(1, 1, 1)); this.deb.count = 0; scene.add(this.deb);
    this.debs = []; for (let i = 0; i < 48; i++) this.debs.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0, life: 0, floor: 0 }); this.dbi = 0; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(sg, sm); m.visible = false; scene.add(m); this.shells.push({ m, v: new THREE.Vector3(), life: 0 }); } this.si = 0;
  }
  spawn(pos, vel, { size = 0.5, grow = 1, life = 1, color = 0xffffff, opacity = 0.6, spark = false, g = 0, drag = 1.5 } = {}) {
    const s = this.pool.find(p => !p.visible); if (!s) return;
    s.visible = true; s.position.copy(pos); if (spark) s.material = this.sparkMat; else { if (s.material === this.sparkMat) s.material = new THREE.SpriteMaterial({ map: spriteTex('smoke'), transparent: true, depthWrite: false }); s.material.color.set(color); s.material.opacity = opacity; s.material.rotation = Math.random() * 6; }
    s.scale.setScalar(size);
    this.parts.push({ s, v: vel.clone(), size, grow, life, t: 0, opacity, spark, g, drag });
  }
  impact(p, normal, surf, distScale = 1) {
    const k = Math.max(1, distScale);
    const col = { sand: 0xd8b888, dirt: 0x9a8668, stone: 0xb0a898, metal: 0x9aa0a8, wood: 0x8a7050, body: 0x6a6a6a }[surf] || 0xaaaaaa;
    const n = normal || new THREE.Vector3(0, 1, 0);
    const nP = surf === 'body' ? 3 : 7;
    for (let i = 0; i < nP; i++) { const v = n.clone().multiplyScalar(1.5 + Math.random() * 2.5).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.8, (Math.random() - 0.5) * 2)); this.spawn(p, v, { size: 0.35 * k, grow: 2.2, life: 1.0 + Math.random() * 0.8, color: col, opacity: 0.55, drag: 2.2, g: -0.4 }); }
    if (surf === 'metal' || surf === 'stone') for (let i = 0; i < 10; i++) { const v = n.clone().multiplyScalar(4).add(new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9)); this.spawn(p, v, { size: 0.12 * k, grow: 0.1, life: 0.25 + Math.random() * 0.25, spark: true, g: 9.8, drag: 0.5 }); }
    // anel de poeira rente a superficie e estilhacos
    if (surf !== 'body' && surf !== 'metal') {
      const t1 = new THREE.Vector3(1, 0, 0); if (Math.abs(n.x) > 0.9) t1.set(0, 0, 1); const t2 = new THREE.Vector3().crossVectors(n, t1).normalize(); t1.crossVectors(t2, n).normalize();
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const v = t1.clone().multiplyScalar(Math.cos(a) * 3.2).addScaledVector(t2, Math.sin(a) * 3.2).addScaledVector(n, 0.3); this.spawn(p.clone().addScaledVector(n, 0.1 * k), v.multiplyScalar(k * 0.6), { size: 0.3 * k, grow: 3, life: 1.4, color: col, opacity: 0.35, drag: 2.5 }); }
    }
    if (surf !== 'body') { const nd = surf === 'metal' ? 3 : 7; for (let i = 0; i < nd; i++) { const d = this.debs[this.dbi++ % this.debs.length]; d.p.copy(p).addScaledVector(n, 0.05); d.v.copy(n).multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3)).multiplyScalar(Math.min(2, 0.7 + k * 0.25)); d.w.set(Math.random() * 20, Math.random() * 20, Math.random() * 20); d.s = (0.03 + Math.random() * 0.05) * Math.min(3, k); d.life = 1.2 + Math.random() * 0.6; d.floor = p.y - 0.05; d.col = col; } }
    if (surf !== 'body') { const d = this.decals[this.di++ % this.decals.length]; d.visible = true; d.position.copy(p).addScaledVector(n, 0.02); d.lookAt(p.clone().add(n)); d.scale.setScalar(Math.min(4, k)); }
  }
  muzzle(pos, dir) {
    for (let i = 0; i < 4; i++) this.spawn(pos.clone().addScaledVector(dir, i * 0.15), dir.clone().multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3(0, 0.4, 0)), { size: 0.25, grow: 2.5, life: 1.2, color: 0xcccccc, opacity: 0.25, drag: 1.5 });
  }
  ejectShell(pos, right, up) {
    const s = this.shells[this.si++ % this.shells.length]; s.m.visible = true; s.m.position.copy(pos); s.v.copy(right).multiplyScalar(1.6 + Math.random()).addScaledVector(up, 1.8); s.life = 1.6; s.spin = 20 + Math.random() * 10;
  }
  showTracer(from, to, camPos, fovFactor) {
    const t = this.tracer; t.visible = true; t.position.copy(to); const len = Math.min(30, from.distanceTo(to)); t.lookAt(to.clone().multiplyScalar(2).sub(from));
    const w = Math.max(0.02, camPos.distanceTo(to) * 0.0025 * fovFactor); t.scale.set(w, w, len);
  }
  hideTracer() { this.tracer.visible = false; }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.t += dt; const k = p.t / p.life;
      if (k >= 1) { p.s.visible = false; this.parts.splice(i, 1); continue; }
      p.v.y -= p.g * dt; p.v.multiplyScalar(Math.exp(-p.drag * dt)); p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(p.size * (1 + p.grow * k));
      if (!p.spark) p.s.material.opacity = p.opacity * (1 - k) * (1 - k);
    }
    let nd = 0;
    for (const d of this.debs) { if (d.life <= 0) continue; d.life -= dt; d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt); if (d.p.y < d.floor) { d.p.y = d.floor; d.v.multiplyScalar(0.4); d.v.y = Math.abs(d.v.y) * 0.3; }
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; this._q.setFromEuler(d.r); this._s.setScalar(d.s * Math.min(1, d.life * 2)); this._m.compose(d.p, this._q, this._s); this.deb.setMatrixAt(nd, this._m); this.deb.setColorAt(nd, this._c.set(d.col).multiplyScalar(0.7)); nd++; }
    this.deb.count = nd; if (nd) { this.deb.instanceMatrix.needsUpdate = true; if (this.deb.instanceColor) this.deb.instanceColor.needsUpdate = true; }
    for (const s of this.shells) { if (s.life <= 0) continue; s.life -= dt; s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += s.spin * dt; s.m.rotation.z += s.spin * 0.6 * dt; if (s.life <= 0) s.m.visible = false; }
  }
}
