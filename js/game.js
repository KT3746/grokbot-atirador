// Nucleo do jogo: missao, mira, balistica, IA, regras, camera lenta
import * as THREE from 'three';
import { buildWorld, setupEnvironment } from './world.js?v=1.0.0';
import { Actor } from './actors.js?v=1.0.0';
import { FX } from './fx.js?v=1.0.0';
import { sfx } from './audio.js?v=1.0.0';
import { WEAPONS, MISSIONS } from './data.js?v=1.0.0';
import { rng, clamp, damp, lerp, smooth } from './util.js?v=1.0.0';

const GRAV = 9.81;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

function makeRifleModel(color) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.35, metalness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.5, emissive: 0x0a1a2a });
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  add(new THREE.BoxGeometry(0.07, 0.09, 0.62), body, 0, 0, 0.05);
  add(new THREE.BoxGeometry(0.06, 0.16, 0.26), body, 0, -0.06, 0.42);
  add(new THREE.BoxGeometry(0.05, 0.12, 0.05), body, 0, -0.09, 0.12);
  add(new THREE.CylinderGeometry(0.014, 0.017, 0.75, 12), metal, 0, 0.015, -0.6, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 12), metal, 0, 0.015, -0.98, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.024, 0.024, 0.34, 20), metal, 0, 0.095, 0.02, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.034, 0.026, 0.09, 20), metal, 0, 0.095, -0.17, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.03, 0.025, 0.07, 20), metal, 0, 0.095, 0.21, Math.PI / 2);
  add(new THREE.CircleGeometry(0.03, 20), glass, 0, 0.095, -0.216).rotation.y = Math.PI;
  add(new THREE.TorusGeometry(0.03, 0.004, 6, 20), metal, 0, 0.095, -0.215);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10), metal, 0.03, 0.095, 0.0, 0).rotation.z = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10), metal, 0, 0.125, 0.0, 0);
  add(new THREE.BoxGeometry(0.02, 0.06, 0.03), metal, 0, 0.065, -0.05); add(new THREE.BoxGeometry(0.02, 0.06, 0.03), metal, 0, 0.065, 0.1);
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), metal, 0.05, 0.02, 0.12, 0).rotation.z = Math.PI / 2;
  const bl = add(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), metal, 0.04, -0.12, -0.45); bl.rotation.z = 0.35;
  const br = add(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), metal, -0.04, -0.12, -0.45); br.rotation.z = -0.35;
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  g.userData.muzzle = new THREE.Vector3(0, 0.015, -1.03);
  return g;
}

export class Game {
  constructor(renderer, ui, store) {
    this.renderer = renderer; this.ui = ui; this.store = store;
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 4000);
    this.scene = null; this.mode = 'none'; this.timeScale = 1; this.ray = new THREE.Raycaster(); this.ray.firstHitOnly = true;
    this.input = { aimDX: 0, aimDY: 0, hold: false };
    this.flashLight = new THREE.PointLight(0xffc070, 0, 12, 2);
    this.baseFov = 60; this.quality = 'media';
  }
  get save() { return this.store.save; }
  weapon() { return WEAPONS.find(w => w.id === this.save.weapon) || WEAPONS[0]; }
  stats() {
    const w = this.weapon(), u = this.save.up;
    return { ...w, zooms: w.zooms.map(z => z * (1 + u.mira * 0.15)), stab: Math.min(0.95, w.stability + u.estab * 0.09), mag: w.mag + u.pente * 2, breath: 3 + u.folego * 1.3, predict: u.mira >= 3 };
  }
  disposeScene() {
    if (!this.scene) return;
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
    if (this.envInfo) this.envInfo.env.dispose();
    this.scene = null; this.ui.clearMarkers();
  }
  load(mission, menuMode = false) {
    this.disposeScene();
    const scene = this.scene = new THREE.Scene();
    this.mission = mission; this.menuMode = menuMode;
    this.envInfo = setupEnvironment(scene, this.renderer, mission.sky, mission.map);
    this.world = buildWorld(mission.map, scene, this.quality, mission.sky);
    this.fx = new FX(scene);
    scene.add(this.camera); this.camera.add(this.flashLight); this.flashLight.position.set(0.2, -0.1, -1.2);
    if (this.rifle) this.camera.remove(this.rifle);
    this.rifle = makeRifleModel(this.weapon().color); this.rifle.scale.setScalar(0.85); this.rifle.rotation.y = -0.03; this.camera.add(this.rifle);
    const r = rng(mission.id.charCodeAt(0) * 13 + mission.id.charCodeAt(1));
    this.actors = mission.actors.map(d => { const a = new Actor(d, this.world, r); scene.add(a.root); return a; });
    if (menuMode) this.actors.forEach(a => { if (a.kind === 'hostage') a.state = 'idle'; });
    const p = this.world.player; this.camera.position.copy(p.pos); this.baseYaw = p.yaw; this.yaw = p.yaw; this.pitch = p.pitch;
    this.windBase = mission.wind; this.wind = new THREE.Vector3(); this.t = 0;
    this.scoped = false; this.zoomIdx = 0; this.fov = this.baseFov; this.scopeK = 0;
    this.ammo = this.stats().mag; this.boltT = 0; this.reloadT = 0; this.breath = 1; this.shake = 0; this.holding = false; this.heartT = 0;
    this.kick = 0; this.kickYaw = 0; this.bullets = []; this.range = 300; this.rangeT = 0; this.rangeHit = null;
    this.alertMeter = 0; this.timeLeft = mission.time; this.elapsed = 0;
    this.st = { shots: 0, hits: 0, kills: 0, heads: 0, civil: 0, optional: 0 };
    this.result = null; this.killcam = null; this.endT = 0; this.timeScale = 1;
    sfx.setEnv(this.world.env);
    this.ui.buildMarkers(this.actors);
    this.applyQuality(this.quality, false);
    this.mode = menuMode ? 'menu' : 'brief';
    this.renderer.compile(scene, this.camera);
  }
  applyQuality(q) {
    this.quality = q; if (!this.envInfo) return;
    const dir = this.envInfo.dir;
    const on = q !== 'baixa'; this.renderer.shadowMap.enabled = on; dir.castShadow = on;
    const size = q === 'alta' ? 2048 : 1024;
    if (dir.shadow.mapSize.x !== size) { dir.shadow.mapSize.set(size, size); if (dir.shadow.map) { dir.shadow.map.dispose(); dir.shadow.map = null; } }
    this.camera.far = q === 'baixa' ? 1800 : q === 'media' ? 2800 : 4000; this.camera.updateProjectionMatrix();
    if (this.scene) this.scene.traverse(o => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); } });
  }
  begin() { this.mode = 'play'; this.ui.showHud(true); }
  // ---------- ENTRADAS ----------
  aim(dx, dy) {
    if (this.mode !== 'play') return;
    const k = (this.fov * Math.PI / 180) / innerHeight * this.save.settings.sens;
    this.yaw -= dx * k; this.pitch -= dy * k;
    this.yaw = clamp(this.yaw, this.baseYaw - 1.35, this.baseYaw + 1.35); this.pitch = clamp(this.pitch, -0.8, 0.35);
  }
  toggleScope(force) {
    if (this.mode !== 'play') return;
    const zs = this.stats().zooms;
    if (force === false) { this.scoped = false; }
    else if (!this.scoped) { this.scoped = true; this.zoomIdx = 0; }
    else if (force === true) return;
    else { this.zoomIdx++; if (this.zoomIdx >= zs.length) { this.scoped = false; this.zoomIdx = 0; } }
    sfx.zoom(); this.ui.scope(this.scoped);
  }
  zoomStep(d) {
    if (this.mode !== 'play') return; const zs = this.stats().zooms;
    if (!this.scoped) { if (d > 0) { this.scoped = true; this.zoomIdx = 0; this.ui.scope(true); sfx.zoom(); } return; }
    const n = this.zoomIdx + d; if (n < 0) { this.scoped = false; this.ui.scope(false); sfx.zoom(); return; }
    this.zoomIdx = clamp(n, 0, zs.length - 1); sfx.zoom();
  }
  setHold(v) {
    if (v && this.shake > 0) { this.holding = false; return; }
    if (v && !this.holding && this.breath > 0.1) { this.holding = true; this.heartT = 0; }
    if (!v) this.holding = false;
  }
  reload() {
    const s = this.stats(); if (this.mode !== 'play' || this.reloadT > 0 || this.ammo >= s.mag) return;
    this.reloadT = s.reload; sfx.reload(); this.ui.toast('Recarregando...');
  }
  // ---------- TIRO ----------
  fire() {
    if (this.mode !== 'play') return;
    const s = this.stats();
    if (this.reloadT > 0 || this.boltT > 0) return;
    if (this.ammo <= 0) { sfx.empty(); this.reload(); return; }
    this.ammo--; this.st.shots++; this.boltT = s.bolt;
    sfx.shot(s.id === 'trovao' ? 1.5 : 1);
    if (s.bolt > 0.5) sfx.bolt(0.35); else sfx.shell(0.3);
    const cam = this.camera; cam.updateMatrixWorld();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const origin = cam.position.clone().addScaledVector(dir, 0.6);
    const v = dir.clone().multiplyScalar(s.velocity);
    const R = this.measureRange(cam.position, dir).dist;
    const zero = this.save.settings.assist ? clamp(R, 30, 1500) : 100;
    const tf = zero / s.velocity; v.y += 0.5 * GRAV * tf;
    const b = { p: origin.clone(), v, start: origin.clone(), life: 0, s, trail: [origin.clone()], alive: true, dist: 0 };
    this.bullets.push(b);
    this.kick = s.recoil * (this.scoped ? 1 : 0.6); this.kickYaw = (Math.random() - 0.5) * s.recoil * 0.4;
    this.flashT = 0.06; this.flashLight.intensity = 30;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    if (!this.scoped) { const mz = this.rifle.userData.muzzle.clone(); this.rifle.localToWorld(mz); this.fx.muzzle(mz, dir); this.fx.spawn(mz, dir.clone().multiplyScalar(0.5), { size: 0.5, grow: 0.5, life: 0.07, spark: true }); }
    setTimeout(() => this.fx && this.fx.ejectShell(cam.position.clone().addScaledVector(dir, 0.35).addScaledVector(right, 0.2).addScaledVector(up, -0.1), right, up), s.bolt > 0.5 ? 500 : 50);
    this.ui.shotFx(this.scoped, s.bolt > 0.5);
    // camera lenta no tiro final
    const pred = this.predict(b);
    if (pred && pred.actor && this.wouldFinish(pred.actor, pred.part)) {
      const flight = Math.max(0.15, pred.t);
      this.killcam = { b, actor: pred.actor, t: 0, phase: 'fly', flight, scale: clamp(flight / 2.4, 0.03, 0.25), dist: pred.dist };
      this.mode = 'killcam'; this.ui.killcam(true, Math.round(pred.dist)); sfx.whoosh();
    }
    if (this.ammo === 0) setTimeout(() => this.reload(), (s.bolt + 0.1) * 1000);
  }
  wouldFinish(actor, part) {
    if (actor.kind === 'hostage' || actor.kind === 'civil' || !actor.alive) return false;
    const dmg = this.stats().damage * (part === 'head' ? 3 : part === 'torso' ? 1 : 0.55);
    if (actor.hp - dmg > 0) return false;
    const goal = this.mission.goal;
    if (goal === 'hvt') return actor.kind === 'hvt';
    return this.actors.filter(a => a.alive && (a.kind === 'merc' || a.kind === 'hvt')).length === 1;
  }
  hitTargets() { const list = [...this.world.colliders]; for (const a of this.actors) if (a.alive) list.push(...a.hitboxes); return list; }
  castSeg(p0, p1, targets) {
    const d = tmpV.subVectors(p1, p0); const len = d.length(); if (len <= 0) return null;
    this.ray.set(p0, d.divideScalar(len)); this.ray.far = len; this.ray.near = 0;
    const hits = this.ray.intersectObjects(targets, false);
    let best = hits.length ? hits[0] : null;
    // terreno / chao
    const g1 = this.world.groundAt(p1.x, p1.z);
    if (p1.y < g1) {
      let a = 0, b = 1; for (let i = 0; i < 12; i++) { const m = (a + b) / 2; const q = tmpV2.lerpVectors(p0, p1, m); if (q.y < this.world.groundAt(q.x, q.z)) b = m; else a = m; }
      const dist = len * b; if (!best || dist < best.distance) { const pt = p0.clone().lerp(p1, b); best = { distance: dist, point: pt, object: null, ground: true }; }
    }
    return best;
  }
  measureRange(origin, dir) {
    const p1 = origin.clone().addScaledVector(dir, 2000);
    const targets = this.hitTargets();
    this.ray.set(origin, dir); this.ray.far = 2000; this.ray.near = 0.5;
    const hits = this.ray.intersectObjects(targets, false); let best = hits[0] || null;
    // terreno por passos
    let gd = null; for (let s = 2; s < 2000; s *= 1.06) { const q = tmpV2.copy(origin).addScaledVector(dir, s); if (q.y < this.world.groundAt(q.x, q.z)) { gd = s; break; } if (best && s > best.distance) break; }
    if (gd != null && (!best || gd < best.distance)) return { dist: gd, actor: null };
    if (best) return { dist: best.distance, actor: best.object.userData.actor || null };
    return { dist: 600, actor: null, none: true };
  }
  windAccel(s) { return tmpV2.copy(this.wind).multiplyScalar(1.0 * (s.windRes || 1)); }
  predict(b) {
    const p = b.p.clone(), v = b.v.clone(); const targets = this.hitTargets(); let t = 0;
    const wa = this.windAccel(b.s).clone();
    for (let i = 0; i < 400; i++) {
      const dt = 1 / 120; const p1 = p.clone().addScaledVector(v, dt);
      const h = this.castSeg(p, p1, targets);
      if (h) { const pt = h.point; return { t: t + dt * (h.distance / p.distanceTo(p1)), actor: h.object && h.object.userData.actor, part: h.object && h.object.userData.part, dist: pt.distanceTo(b.start) }; }
      v.y -= GRAV * dt; v.addScaledVector(wa, dt); p.copy(p1); t += dt; if (p.distanceTo(b.start) > 1800) break;
    }
    return null;
  }
  stepBullets(dt) {
    if (!this.bullets.length) return;
    const targets = this.hitTargets();
    for (const b of this.bullets) {
      if (!b.alive) continue;
      let rem = dt;
      while (rem > 0 && b.alive) {
        const st = Math.min(rem, 1 / 120); rem -= st;
        const p1 = b.p.clone().addScaledVector(b.v, st);
        const h = this.castSeg(b.p, p1, targets);
        if (h) { b.alive = false; b.p.copy(h.point); this.onImpact(b, h); break; }
        b.v.y -= GRAV * st; b.v.addScaledVector(this.windAccel(b.s), st); b.v.multiplyScalar(1 - 0.015 * st);
        b.p.copy(p1); b.life += st;
        if (b.life > 3.5 || b.p.distanceTo(b.start) > 2000) { b.alive = false; }
      }
      b.trail.push(b.p.clone()); if (b.trail.length > 6) b.trail.shift();
      if (b.alive && !(this.killcam && this.killcam.b === b)) this.fx.showTracer(b.trail[0], b.p, this.camera.position, this.fov / 60); else if (this.killcam) this.fx.hideTracer();
    }
    this.bullets = this.bullets.filter(b => b.alive);
    if (!this.bullets.length) this.fx.hideTracer();
  }
  onImpact(b, h) {
    const p = h.point, dist = p.distanceTo(b.start), dir = b.v.clone().normalize();
    const actor = h.object && h.object.userData.actor;
    const scale = clamp(dist / 120, 1, 6) * (this.scoped ? 1 : 1.5);
    if (actor) {
      const part = h.object.userData.part; this.st.hits++;
      this.fx.impact(p, dir.clone().negate(), 'body', scale * 0.7); sfx.impact('body', dist);
      if (actor.kind === 'hostage') { actor.hp = 0; actor.kill(dir, part); this.ui.popup('Você acertou um refém!', 'bad'); this.finish(false, 'Você acertou um refém. Nunca atire perto dos reféns sem ter certeza.'); return; }
      if (actor.kind === 'civil') { actor.hp = 0; actor.kill(dir, part); this.st.civil++; this.ui.popup('Civil atingido! Penalidade', 'bad'); sfx.fail(); this.alertNear(p, 30, 20); return; }
      const dmg = b.s.damage * (part === 'head' ? 3 : part === 'torso' ? 1 : 0.55);
      actor.hp -= dmg;
      if (actor.hp <= 0) {
        actor.kill(dir, part); this.st.kills++; if (part === 'head') this.st.heads++;
        if (this.mission.goal === 'hvt' && actor.kind !== 'hvt') this.st.optional++;
        this.ui.popup(part === 'head' ? 'NA CABEÇA!' : actor.kind === 'hvt' ? 'ALVO PRINCIPAL ABATIDO' : 'Abatido', part === 'head' ? 'gold' : 'ok', Math.round(dist) + ' m');
        this.ui.hitmark(true);
        // testemunhas
        let w = 0; for (const a of this.actors) if (a !== actor && a.alive && (a.kind === 'merc' || a.kind === 'hvt') && a.pos.distanceTo(actor.pos) < 22) { if (a.alert(actor.pos)) w++; }
        if (w) { this.alertMeter += Math.min(35, 14 * w); sfx.alert(); this.ui.toast('Um inimigo viu o corpo cair!'); }
        for (const a of this.actors) if (a.kind === 'civil' && a.alive && a.pos.distanceTo(actor.pos) < 25) a.alert(actor.pos);
        this.checkWin(actor);
      } else {
        this.ui.popup('Ferido! Atire de novo', 'ok'); this.ui.hitmark(false);
        actor.alert(this.camera.position); this.alertMeter += 15; sfx.alert();
      }
    } else {
      const surf = h.ground ? (this.world.env === 'deserto' ? 'sand' : this.world.env === 'cidade' ? 'stone' : 'dirt') : (h.object.userData.surf || 'stone');
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      this.fx.impact(p, n, surf, scale); sfx.impact(surf === 'metal' ? 'metal' : 'ground', dist);
      this.alertNear(p, 9, 18);
      this.ui.hitmark(null);
    }
    if (this.killcam && this.killcam.b === b) { this.killcam.phase = 'after'; this.killcam.t = 0; this.killcam.hitPoint = p.clone(); this.killcam.hitDir = dir; }
  }
  alertNear(p, radius, add) {
    let n = 0;
    for (const a of this.actors) {
      if (!a.alive) continue; const d = a.pos.distanceTo(p);
      if ((a.kind === 'merc' || a.kind === 'hvt') && d < radius) { if (a.alert(p)) n++; }
      if (a.kind === 'civil' && d < radius * 1.8) a.alert(p);
    }
    if (n) { this.alertMeter += Math.min(40, add * n); sfx.alert(); this.ui.toast(n > 1 ? 'Inimigos ouviram o tiro!' : 'Um inimigo ouviu o tiro!'); }
    else this.alertMeter += 2;
  }
  checkWin(lastActor) {
    const goal = this.mission.goal;
    const done = goal === 'hvt' ? this.actors.some(a => a.kind === 'hvt' && !a.alive) : this.actors.every(a => !(a.kind === 'merc' || a.kind === 'hvt') || !a.alive);
    if (done) this.finish(true, '', lastActor);
  }
  finish(win, reason, lastActor) {
    if (this.result) return;
    const m = this.mission, st = this.st;
    const acc = st.shots ? st.hits / st.shots : 0;
    let stars = 0, money = 0;
    if (win) {
      stars = 1 + (acc >= 0.7 ? 1 : 0) + (this.elapsed <= m.par ? 1 : 0); if (st.civil) stars = 1;
      money = m.reward + st.heads * 150 + st.optional * 120 + stars * 150; if (st.civil) money = Math.round(money * 0.5);
    }
    this.result = { win, reason, stars, money, acc, time: this.elapsed, heads: st.heads, kills: st.kills, shots: st.shots, civil: st.civil };
    if (win) { const sv = this.save; sv.money += money; sv.done[m.id] = true; sv.stars[m.id] = Math.max(sv.stars[m.id] || 0, stars); const bt = sv.best[m.id]; if (!bt || this.elapsed < bt) sv.best[m.id] = Math.round(this.elapsed); this.store.writeSave(sv); }
    this.endT = 0;
    if (!this.killcam) { this.mode = 'ending'; if (win) this.ui.banner('MISSÃO CUMPRIDA', true); else { this.ui.banner('MISSÃO FALHOU', false); sfx.fail(); } }
  }
  // ---------- LACO PRINCIPAL ----------
  update(rdt) {
    if (!this.scene) return;
    const real = rdt; let dt = rdt * this.timeScale;
    this.t += dt;
    // vento com rajadas
    const wb = this.windBase, gust = 1 + 0.28 * Math.sin(this.t * 0.31) * Math.sin(this.t * 0.17 + 2), dang = (wb.dir + 8 * Math.sin(this.t * 0.07)) * Math.PI / 180;
    const ws = wb.speed * gust; this.wind.set(Math.sin(dang) * ws, 0, -Math.cos(dang) * ws);
    sfx.setWind(ws, this.t);
    const cam = this.camera;
    if (this.mode === 'menu') {
      this.yaw = this.baseYaw + Math.sin(this.t * 0.05) * 0.35; this.pitch = this.world.player.pitch * 0.7 + Math.sin(this.t * 0.07) * 0.03;
      cam.position.copy(this.world.player.pos).add(tmpV.set(Math.sin(this.yaw) * 6, 5, Math.cos(this.yaw) * 6));
      cam.fov = 55; cam.updateProjectionMatrix(); cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); this.rifle.visible = false;
    } else if (this.mode === 'killcam') {
      this.updateKillcam(real);
      dt = real * this.timeScale;
    } else {
      this.updatePlayer(real);
    }
    if (this.mode === 'play') {
      this.elapsed += dt; this.timeLeft -= dt;
      const alerted = this.actors.filter(a => a.alive && (a.state === 'alert' || a.state === 'flee') && (a.kind === 'merc' || a.kind === 'hvt')).length;
      this.alertMeter = clamp(this.alertMeter + (alerted ? alerted * 1.5 : -3.5) * dt, 0, 100);
      if (this.alertMeter >= 100) this.finish(false, 'Os Corvos Negros descobriram você. Tente errar menos perto deles.');
      if (this.timeLeft <= 0) this.finish(false, 'O tempo acabou.');
      if (this.actors.some(a => a.escaped && a.alive)) this.finish(false, 'O alvo principal fugiu. Quando ele correr, atire rápido.');
    }
    if (this.mode === 'ending') { this.endT += real; if (this.endT > 1.8) { this.mode = 'result'; this.ui.showResult(this.result); } }
    const pp = cam.position;
    for (const a of this.actors) a.update(dt, pp);
    this.stepBullets(dt);
    this.fx.update(dt);
    for (const f of this.world.flags) f.update(this.t, this.wind);
    for (const d of this.world.drift) d.update(dt, this.wind);
    if (this.world.fire) { const s = 1 + Math.sin(this.t * 13) * 0.15 + Math.sin(this.t * 7) * 0.1; this.world.fire.scale.set(s, 1.4 * s, s); if (Math.random() < dt * 6) this.fx.spawn(this.world.fire.position.clone().add(new THREE.Vector3(0, 0.8, 0)), new THREE.Vector3(this.wind.x * 0.3, 1.2, this.wind.z * 0.3), { size: 0.8, grow: 4, life: 3.5, color: 0x777777, opacity: 0.3, drag: 0.3 }); }
    if (this.flashT > 0) { this.flashT -= real; if (this.flashT <= 0) this.flashLight.intensity = 0; }
    // sombra segue o ponto de mira
    const dir = this.envInfo.dir; const fwd = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const focus = this.mode === 'killcam' && this.killcam ? this.killcam.actor.pos : cam.position.clone().addScaledVector(fwd, clamp(this.range, 40, this.scoped ? 700 : 260));
    const ext = this.scoped || this.mode === 'killcam' ? 45 : 140; const sc = dir.shadow.camera;
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
    dir.target.position.copy(focus); dir.position.copy(focus).addScaledVector(this.envInfo.sunDir, 800);
    this.envInfo.sky.position.copy(cam.position);
    this.ui.updateHud(this);
  }
  updatePlayer(dt) {
    const s = this.stats(), cam = this.camera;
    if (this.boltT > 0) this.boltT -= dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.ammo = s.mag; this.ui.toast('Pronto!'); } }
    // respiracao
    if (this.holding && this.mode === 'play') { this.breath -= dt / s.breath; this.heartT -= dt; if (this.heartT <= 0) { sfx.heart(); this.heartT = 0.85; } if (this.breath <= 0) { this.breath = 0; this.holding = false; this.shake = 2.5; this.ui.toast('Sem fôlego! Espere um pouco.'); } }
    else { this.breath = Math.min(1, this.breath + dt * 0.22); }
    if (this.shake > 0) this.shake -= dt;
    // zoom
    const zs = s.zooms; const target = this.scoped ? this.baseFov / zs[Math.min(this.zoomIdx, zs.length - 1)] : this.baseFov;
    this.fov = damp(this.fov, target, 14, dt); this.scopeK = damp(this.scopeK, this.scoped ? 1 : 0, 14, dt);
    cam.fov = this.fov; cam.updateProjectionMatrix();
    this.rifle.visible = this.scopeK < 0.6;
    this.rifle.position.set(0.2 - this.scopeK * 0.2, -0.21 + this.scopeK * 0.1 + Math.sin(this.t * 1.5) * 0.002, -0.46 + this.kick * 2);
    // balanco da mira
    const t = this.t; let amp = (0.0034 * (1 - s.stab) + 0.00025) * (this.scoped ? 1 : 0.5);
    if (this.holding) amp *= 0.1; if (this.shake > 0) amp *= 2.4;
    const swx = amp * (Math.sin(t * 0.83) * 0.7 + Math.sin(t * 1.91 + 1) * 0.3);
    const swy = amp * (Math.sin(t * 1.13 + 2) * 0.6 + Math.sin(t * 0.47) * 0.4) + (this.holding ? 0 : Math.sin(t * 1.5) * amp * 0.6);
    this.kick = damp(this.kick, 0, 7, dt); this.kickYaw = damp(this.kickYaw, 0, 7, dt);
    cam.rotation.set(this.pitch + swy + this.kick, this.yaw + swx + this.kickYaw, 0, 'YXZ');
    cam.position.copy(this.world.player.pos);
    cam.updateMatrixWorld();
    // distancia na mira (rangefinder)
    this.rangeT -= dt; if (this.rangeT <= 0 && this.scene) { this.rangeT = 0.12; const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); const m = this.measureRange(cam.position, d); this.range = m.dist; this.rangeNone = !!m.none; this.rangeHit = m.actor; }
  }
  updateKillcam(dt) {
    const k = this.killcam, cam = this.camera; k.t += dt;
    this.rifle.visible = false;
    if (k.phase === 'fly') {
      const b = k.b; const near = b.p.distanceTo(k.actor.pos) < 12;
      this.timeScale = near ? k.scale * 0.25 : k.scale;
      const dir = b.v.clone().normalize(); const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const want = b.p.clone().addScaledVector(dir, -0.45).addScaledVector(side, 0.16).add(new THREE.Vector3(0, 0.06, 0));
      cam.position.copy(want); cam.fov = 38; cam.updateProjectionMatrix();
      cam.lookAt(b.p.clone().addScaledVector(dir, 2));
      this.fx.bullet.visible = true; this.fx.bullet.position.copy(b.p); this.fx.bullet.lookAt(b.p.clone().sub(dir));
      this.fx.trail.visible = true; this.fx.trail.position.copy(b.p); this.fx.trail.lookAt(b.p.clone().sub(dir)); this.fx.trail.scale.set(1, 1, 3);
      if (!b.alive && !k.hitPoint) { k.phase = 'after'; k.t = 0; k.hitPoint = b.p.clone(); }
    } else {
      this.fx.bullet.visible = false; this.fx.trail.visible = false;
      this.timeScale = k.t < 1.4 ? 0.22 : 0.6;
      const c = k.actor.pos.clone().add(new THREE.Vector3(0, 0.9, 0)); const a = k.t * 0.5 + 0.6; const rr = 4.5;
      const toP = this.world.player.pos.clone().sub(c).setY(0).normalize();
      const ang = Math.atan2(toP.x, toP.z) + a;
      cam.position.set(c.x + Math.sin(ang) * rr, c.y + 1.0 + k.t * 0.3, c.z + Math.cos(ang) * rr);
      const gy = this.world.groundAt(cam.position.x, cam.position.z) + 0.5; if (cam.position.y < gy) cam.position.y = gy;
      cam.fov = 45; cam.updateProjectionMatrix(); cam.lookAt(c);
      if (k.t > 2.6 || (!this.result && k.t > 1.2)) { this.timeScale = 1; this.killcam = null; this.ui.killcam(false); if (this.result) { this.mode = 'result'; this.ui.showResult(this.result); } else { this.mode = 'play'; this.ui.scope(this.scoped); } }
    }
  }
  // distancia que o vento empurra a bala e queda prevista (para o ponto de impacto)
  predictOffset() {
    const s = this.stats(); const R = this.range; const t = R / s.velocity;
    const wa = this.windAccel(s); const drift = 0.5 * t * t;
    const cam = this.camera; const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const lat = wa.dot(right) * drift;
    const drop = this.save.settings.assist ? 0 : 0.5 * GRAV * t * (t - 100 / s.velocity);
    return { lat, drop, R, t };
  }
}
