// Caminhao que anda pela estrada levando um alvo na carroceria
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, damp } from './util.js?v=1.2.0';

export class Vehicle {
  constructor(def, world, scene) {
    const anc = world.anchors[def.a] || { x: 0, z: 0 };
    this.world = world; this.route = def.route.map(([x, z]) => new THREE.Vector3(anc.x + x, 0, anc.z + z));
    this.exit = def.exit ? new THREE.Vector3(anc.x + def.exit[0], 0, anc.z + def.exit[1]) : null;
    this.speed = def.speed || 5; this.v = 0; this.i = 1; this.dirN = 1; this.fleeing = false; this.stopped = false; this.done = false; this.wait = def.wait || 3; this.waitT = 1.5;
    const g = this.root = new THREE.Group(); g.rotation.order = 'YXZ';
    const paint = new THREE.MeshStandardMaterial({ color: def.color || 0x4a5236, roughness: 0.7, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.85 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.6 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
    const RB = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 2, r);
    const add = (geo, m, x, y, z, col = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); if (col) { o.userData.surf = 'metal'; this.colliders.push(o); } return o; };
    this.colliders = [];
    // chassi, cabine, capo e carroceria aberta (laterais baixas: o alvo fica exposto)
    add(new THREE.BoxGeometry(2.2, 0.35, 6.4), dark, 0, 0.75, 0);
    add(RB(2.3, 1.5, 1.9), paint, 0, 1.75, 2.15); add(RB(2.2, 0.8, 1.3), paint, 0, 1.3, 3.55);
    add(new THREE.BoxGeometry(2.0, 0.6, 0.05), glass, 0, 2.05, 3.11, false); add(new THREE.BoxGeometry(0.05, 0.55, 1.1), glass, 1.16, 2.05, 2.2, false); add(new THREE.BoxGeometry(0.05, 0.55, 1.1), glass, -1.16, 2.05, 2.2, false);
    add(new THREE.BoxGeometry(2.4, 0.12, 4.0), paint, 0, 1.0, -1.2);
    add(new THREE.BoxGeometry(0.08, 0.55, 4.0), paint, 1.18, 1.33, -1.2); add(new THREE.BoxGeometry(0.08, 0.55, 4.0), paint, -1.18, 1.33, -1.2); add(new THREE.BoxGeometry(2.4, 0.55, 0.08), paint, 0, 1.33, -3.18);
    add(new THREE.BoxGeometry(2.0, 0.25, 0.1), dark, 0, 1.0, 4.22, false);
    for (const lx of [0.75, -0.75]) { const l = add(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffeecc, emissiveIntensity: 0.6 }), lx, 1.3, 4.21, false); l.rotation.x = Math.PI / 2; }
    this.wheels = [];
    const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 14); wg.rotateZ(Math.PI / 2);
    for (const [x, z] of [[1.05, 3.2], [-1.05, 3.2], [1.05, -0.6], [-1.05, -0.6], [1.05, -2.1], [-1.05, -2.1]]) { const w = new THREE.Mesh(wg, tire); w.position.set(x, 0.5, z); w.castShadow = true; g.add(w); this.wheels.push(w); }
    // lona enrolada atras da cabine
    add(new THREE.CylinderGeometry(0.2, 0.2, 2.3, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6a6448, roughness: 1 }), 0, 1.3, 0.9, false);
    this.bedLocal = new THREE.Vector3(0, 1.06, -1.4);
    const p0 = this.route[0]; g.position.set(p0.x, world.groundAt(p0.x, p0.z), p0.z);
    const p1 = this.route[1]; this.heading = Math.atan2(p1.x - p0.x, p1.z - p0.z); g.rotation.y = this.heading;
    scene.add(g); g.updateMatrixWorld();
  }
  bedWorld(v) { return v.copy(this.bedLocal).applyMatrix4(this.root.matrixWorld); }
  flee() { if (!this.fleeing && this.exit) { this.fleeing = true; this.waitT = 0; } }
  stop() { this.stopped = true; }
  update(dt) {
    if (this.done) return;
    const p = this.root.position;
    let target = this.fleeing ? this.exit : this.route[this.i];
    let want = this.stopped ? 0 : this.fleeing ? this.speed * 1.8 : this.speed;
    if (this.waitT > 0 && !this.fleeing) { this.waitT -= dt; want = 0; }
    const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    if (!this.stopped && d < 3) {
      if (this.fleeing) { this.done = true; want = 0; }
      else { if (this.i + this.dirN >= this.route.length || this.i + this.dirN < 0) this.dirN *= -1; this.i += this.dirN; this.waitT = this.wait; target = this.route[this.i]; }
    }
    if (d > 0.01 && Math.abs(this.v) > 0.05) { const wantH = Math.atan2(dx, dz); let dh = wantH - this.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2; this.heading += clamp(dh, -dt * 0.9, dt * 0.9); }
    this.v = damp(this.v, want, this.stopped ? 1.5 : 0.9, dt);
    p.x += Math.sin(this.heading) * this.v * dt; p.z += Math.cos(this.heading) * this.v * dt;
    const ga = this.world.groundAt; const f = ga(p.x + Math.sin(this.heading) * 2.5, p.z + Math.cos(this.heading) * 2.5), b = ga(p.x - Math.sin(this.heading) * 2.5, p.z - Math.cos(this.heading) * 2.5);
    p.y = (f + b) / 2; this.root.rotation.set(-Math.atan2(f - b, 5), this.heading, Math.sin(performance.now() * 0.008) * 0.004 * this.v, 'YXZ');
    for (const w of this.wheels) w.rotation.x += this.v * dt / 0.5;
    this.root.updateMatrixWorld();
  }
}
