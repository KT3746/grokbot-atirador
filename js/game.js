// Nucleo do jogo: missao, mira, balistica, IA, regras, camera lenta
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildWorld, setupEnvironment } from './world.js?v=1.6.1';
import { Actor, RIM, resetActorMaterials } from './actors.js?v=1.6.1';
import { LIFE } from './life.js?v=1.6.1';
import { FX } from './fx.js?v=1.6.1';
import { Vehicle } from './vehicle.js?v=1.6.1';
import { sfx } from './audio.js?v=1.6.1';
import { WEAPONS, MISSIONS } from './data.js?v=1.6.1';
import { rng, clamp, damp, lerp, smooth } from './util.js?v=1.6.1';

const GRAV = 9.81;
const BINOC_ZOOM = 9;
export const RANKS = ['Recruta', 'Soldado', 'Cabo', 'Sargento', 'Tenente', 'Capitão', 'Elite', 'Lenda'];
// patente da missao: estrelas, precisao, tiros na cabeca, rapidez e discricao
function rankFor(stars, acc, headR, timeR, civil, alertM) {
  let pts = stars * 14 + acc * 22 + headR * 18 + clamp(1.6 - timeR, 0, 1) * 12 + (alertM < 20 ? 6 : 0);
  if (civil) pts -= 30;
  const i = clamp(Math.floor(pts / 11.5), 0, RANKS.length - 1);
  return { i, name: RANKS[i], pts: Math.round(pts) };
}
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

let LENS = null;
function lensTex() {
  // vidro com revestimento: fundo azul esverdeado, reflexo em arco e brilho do ceu
  if (LENS) return LENS;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let g = x.createRadialGradient(S * 0.45, S * 0.4, 4, S / 2, S / 2, S / 2); g.addColorStop(0, '#2a5a6a'); g.addColorStop(0.55, '#0e2430'); g.addColorStop(0.85, '#1a1030'); g.addColorStop(1, '#05060a');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  g = x.createLinearGradient(0, 0, 0, S * 0.5); g.addColorStop(0, 'rgba(210,235,255,0.55)'); g.addColorStop(1, 'rgba(210,235,255,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(S * 0.5, S * 0.32, S * 0.36, S * 0.18, 0, Math.PI, 0); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 4; x.beginPath(); x.arc(S * 0.5, S * 0.5, S * 0.34, Math.PI * 1.1, Math.PI * 1.45); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(S * 0.66, S * 0.3, 5, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(160,90,220,0.35)'; x.lineWidth = 3; x.beginPath(); x.arc(S * 0.5, S * 0.5, S * 0.44, 0, Math.PI * 2); x.stroke();
  LENS = new THREE.CanvasTexture(c); LENS.colorSpace = THREE.SRGBColorSpace; return LENS;
}
function makeRifleModel(color) {
  // rifle em primeira pessoa detalhado: coronha, cano, freio de boca, luneta, ferrolho animado
  const g = new THREE.Group();
  const poly = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.32, metalness: 0.92 });
  const metal2 = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.45, metalness: 0.8 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.95 });
  const glass = new THREE.MeshBasicMaterial({ map: lensTex(), toneMapped: true });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };
  const RB = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
  // coronha e chassi
  add(RB(0.07, 0.09, 0.5, 0.02), poly, 0, -0.005, 0.06);
  add(RB(0.06, 0.15, 0.26, 0.025), poly, 0, -0.055, 0.42, 0.06);
  add(RB(0.05, 0.05, 0.16, 0.02), poly, 0, 0.055, 0.36);
  add(RB(0.065, 0.17, 0.03, 0.01), rubber, 0, -0.06, 0.56, 0.06);
  add(RB(0.045, 0.12, 0.05, 0.015), poly, 0, -0.1, 0.16, -0.35);
  add(new THREE.TorusGeometry(0.03, 0.006, 6, 14, Math.PI), metal, 0, -0.06, 0.1, 0, Math.PI / 2, Math.PI);
  add(RB(0.012, 0.035, 0.01, 0.004), metal, 0, -0.06, 0.1);
  add(RB(0.05, 0.1, 0.07, 0.012), metal2, 0, -0.09, -0.02, 0.1);
  add(RB(0.075, 0.07, 0.3, 0.012), metal2, 0, 0.012, -0.06);
  // trilho
  add(new THREE.BoxGeometry(0.03, 0.012, 0.32), metal, 0, 0.052, -0.04);
  for (let i = 0; i < 12; i++) add(new THREE.BoxGeometry(0.034, 0.006, 0.012), metal, 0, 0.06, -0.19 + i * 0.026);
  // guarda mao com furos
  add(RB(0.062, 0.06, 0.34, 0.02), poly, 0, 0.0, -0.36);
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.064, 0.016, 0.04), metal, 0, 0.0, -0.24 - i * 0.055);
  // cano
  const barrel = new THREE.CylinderGeometry(0.0125, 0.016, 0.7, 14);
  add(barrel, metal, 0, 0.015, -0.78, Math.PI / 2);
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.004, 0.004, 0.36), metal2, Math.cos(i) * 0.014, 0.015 + Math.sin(i) * 0.014, -0.75);
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 14), metal, 0, 0.015, -1.17, Math.PI / 2);
  for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.05, 0.008, 0.012), rubber, 0, 0.015, -1.15 - i * 0.022);
  // luneta por torno
  const prof = [[0.0, -0.2], [0.04, -0.2], [0.042, -0.17], [0.034, -0.12], [0.025, -0.1], [0.025, 0.12], [0.03, 0.15], [0.032, 0.2], [0.0, 0.2]].map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y));
  const scope = add(new THREE.LatheGeometry(prof, 22), metal, 0, 0.105, -0.05, -Math.PI / 2);
  add(new THREE.CircleGeometry(0.038, 22), glass, 0, 0.105, -0.252, 0, Math.PI);
  add(new THREE.CircleGeometry(0.029, 18), glass, 0, 0.105, 0.152);
  add(new THREE.TorusGeometry(0.04, 0.004, 6, 22), metal2, 0, 0.105, -0.25);
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.035, 14), metal2, 0, 0.145, -0.02);
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.035, 14), metal2, 0.042, 0.105, -0.02, 0, 0, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 10), metal2, -0.036, 0.105, 0.04, 0, 0, Math.PI / 2);
  for (const z of [-0.08, 0.06]) { add(new THREE.TorusGeometry(0.028, 0.006, 6, 16), metal, 0, 0.105, z); add(RB(0.02, 0.05, 0.02, 0.005), metal, 0, 0.07, z); }
  // carregador
  add(RB(0.045, 0.08, 0.09, 0.01), metal2, 0, -0.075, -0.12, 0.08);
  // ferrolho animado
  const bolt = new THREE.Group(); bolt.position.set(0.0, 0.03, 0.05); g.add(bolt);
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 12), metal, 0, 0, 0, Math.PI / 2, 0, 0, bolt);
  const handle = new THREE.Group(); bolt.add(handle); handle.position.z = 0.05;
  add(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 8), metal, 0.035, -0.012, 0, 0, 0, Math.PI / 2 + 0.4, handle);
  add(new THREE.SphereGeometry(0.014, 12, 10), metal, 0.068, -0.026, 0, 0, 0, 0, handle);
  // bipe
  // bipe dobrado sob o guarda mao
  add(RB(0.05, 0.02, 0.04, 0.006), metal2, 0, -0.035, -0.5);
  for (const sx of [1, -1]) { add(new THREE.CylinderGeometry(0.0065, 0.0065, 0.24, 6), metal2, 0.016 * sx, -0.042, -0.39, Math.PI / 2 + 0.04); add(RB(0.014, 0.012, 0.02, 0.004), rubber, 0.016 * sx, -0.044, -0.265); }
  // maos com luva
  const glove = new THREE.MeshStandardMaterial({ color: 0x24251f, roughness: 0.9 });
  add(new THREE.CapsuleGeometry(0.035, 0.06, 4, 10), glove, 0.0, -0.06, 0.13, 0.5, 0, 0);
  add(new THREE.CapsuleGeometry(0.04, 0.22, 4, 10), new THREE.MeshStandardMaterial({ color: 0x3a3d33, roughness: 0.95 }), 0.04, -0.12, 0.33, -1.1, 0, 0.2);
  add(new THREE.CapsuleGeometry(0.034, 0.07, 4, 10), glove, -0.01, -0.04, -0.33, 0.3, 0, 0.4);
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  g.userData.muzzle = new THREE.Vector3(0, 0.015, -1.22);
  g.userData.bolt = bolt; g.userData.handle = handle; g.userData.ejector = new THREE.Vector3(0.04, 0.04, 0.02);
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
    if (this.envInfo) this.envInfo.env.dispose(); resetActorMaterials();
    this.scene = null; this.ui.clearMarkers();
  }
  load(mission, menuMode = false) {
    this.disposeScene();
    const scene = this.scene = new THREE.Scene();
    this.mission = mission; this.menuMode = menuMode;
    this.envInfo = setupEnvironment(scene, this.renderer, mission.sky, mission.map);
    this.world = buildWorld(mission.map, scene, this.quality, { ...mission.sky, weather: mission.weather }, this.envInfo.sunDir);
    this.fx = new FX(scene);
    scene.add(this.camera); this.camera.add(this.flashLight); this.flashLight.position.set(0.2, -0.1, -1.2);
    if (this.rifle) this.camera.remove(this.rifle);
    this.rifle = makeRifleModel(this.weapon().color); this.rifle.scale.setScalar(0.85); this.rifle.rotation.y = -0.03; this.camera.add(this.rifle);
    const r = rng(mission.id.charCodeAt(0) * 13 + mission.id.charCodeAt(1));
    this.vehicles = (mission.vehicles || []).map(v => { const o = new Vehicle(v, this.world, scene); this.world.colliders.push(...o.colliders); return o; });
    this.actors = mission.actors.map(d => { const a = new Actor(d, this.world, r); if (d.ride != null && this.vehicles[d.ride]) a.setRide(this.vehicles[d.ride], d.rideOff); a.attach(scene); return a; });
    this.binoc = false; this.binK = 0; this.boltLift = 0; this.tagCount = 0; this.tagHintShown = false;
    if (menuMode) this.actors.forEach(a => { if (a.kind === 'hostage') a.state = 'idle'; });
    const p = this.world.player; this.camera.position.copy(p.pos); this.baseYaw = p.yaw; this.yaw = p.yaw; this.pitch = p.pitch;
    this.windBase = mission.wind; this.wind = new THREE.Vector3(); this.t = 0; this.fogBase = scene.fog ? scene.fog.density : 0; this.gustOn = false;
    this.nv = false; this.nvK = 0; this.ui.nvAvail(!!mission.sky.dark && !menuMode);
    this.scoped = false; this.zoomIdx = 0; this.fov = this.baseFov; this.scopeK = 0;
    this.ammo = this.stats().mag; this.boltT = 0; this.reloadT = 0; this.breath = 1; this.shake = 0; this.holding = false; this.heartT = 0;
    this.kick = 0; this.kickYaw = 0; this.aimVX = 0; this.aimVY = 0; this.lagX = 0; this.lagY = 0; this.rk = 0; this.rkv = 0; this.boltAnim = -1; this.camShake = 0; this.bullets = []; this.range = 300; this.rangeT = 0; this.rangeHit = null;
    this.alertMeter = 0; this.timeLeft = mission.time; this.elapsed = 0;
    this.st = { shots: 0, hits: 0, kills: 0, heads: 0, civil: 0, optional: 0 };
    this.result = null; this.killcam = null; this.endT = 0; this.timeScale = 1; this.rec = null; this.lastRec = null; this.replay = null;
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
    if (this.world && this.world.life) for (const l of this.world.life) l.setQuality(q);
    const size = q === 'alta' ? 2048 : 1024;
    if (dir.shadow.mapSize.x !== size) { dir.shadow.mapSize.set(size, size); if (dir.shadow.map) { dir.shadow.map.dispose(); dir.shadow.map = null; } }
    this.camera.far = q === 'baixa' ? 1800 : q === 'media' ? 2800 : 4000; this.camera.updateProjectionMatrix();
    if (this.scene) this.scene.traverse(o => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); } });
  }
  begin() {
    this.mode = 'play'; this.ui.showHud(true); this.ui.binoc(false);
    const m = this.mission; const tip = m.hint || (MISSIONS.indexOf(m) < 2 ? 'Dica: use o BINÓCULO para marcar os inimigos.' : null);
    if (tip) setTimeout(() => { if (this.mission === m && this.mode === 'play') this.ui.toast(tip); }, 1200);
  }
  // ---------- ENTRADAS ----------
  aim(dx, dy) {
    if (this.mode !== 'play') return;
    const k = (this.fov * Math.PI / 180) / innerHeight * this.save.settings.sens;
    this.yaw -= dx * k; this.pitch -= dy * k; this.aimVX += dx; this.aimVY += dy;
    this.yaw = clamp(this.yaw, this.baseYaw - 1.35, this.baseYaw + 1.35); this.pitch = clamp(this.pitch, -0.8, 0.35);
  }
  buzz(p) { if (this.save.settings.haptics === false || !navigator.vibrate) return; try { navigator.vibrate(p); } catch (_) { } }
  toggleNV(force) {
    if (this.mode !== 'play' || !this.mission.sky.dark) return;
    const v = force != null ? force : !this.nv; if (v === this.nv) return;
    this.nv = v; sfx.zoom(); this.ui.nv(v);
    if (v && !this.scoped && !this.binoc) this.ui.toast('Visão noturna liga na mira e no binóculo');
  }
  toggleBinoc(force) {
    if (this.mode !== 'play') return;
    const v = force != null ? force : !this.binoc; if (v === this.binoc) return;
    this.binoc = v; if (v && this.scoped) { this.scoped = false; this.ui.scope(false); }
    sfx.zoom(); this.ui.binoc(v);
    if (v && !this.tagHintShown) { this.tagHintShown = true; this.ui.toast('Mantenha o centro sobre um inimigo para marcar'); }
  }
  // marcacao: olhar um inimigo pelo binoculo (ou pela luneta) por um instante deixa ele marcado
  updateTags(dt) {
    if (this.mode !== 'play') return;
    const look = this.binoc ? 0.16 : (this.scoped && this.scopeK > 0.8 ? 0.07 : 0); if (!look) return;
    const cam = this.camera; const v = tmpV2;
    for (const a of this.actors) {
      if (!a.alive || a.tagged || !(a.kind === 'merc' || a.kind === 'hvt')) continue;
      v.copy(a.pos); v.y += 1.0 * a.scale; v.project(cam);
      const d = Math.hypot(v.x * cam.aspect, v.y) * 0.5;
      if (v.z < 1 && d < look) { a.tagT = (a.tagT || 0) + dt; if (a.tagT > (this.binoc ? 0.3 : 0.45)) { a.tagged = true; this.tagCount++; sfx.ui(); this.ui.toast(a.kind === 'hvt' ? 'Alvo principal marcado' : 'Inimigo marcado'); } }
      else a.tagT = Math.max(0, (a.tagT || 0) - dt * 0.5);
    }
  }
  toggleScope(force) {
    if (this.mode !== 'play') return;
    if (this.binoc) this.toggleBinoc(false);
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
    if (this.binoc) { this.toggleBinoc(false); return; }
    const s = this.stats();
    if (this.reloadT > 0 || this.boltT > 0) return;
    if (this.ammo <= 0) { sfx.empty(); this.reload(); return; }
    this.ammo--; this.st.shots++; this.boltT = s.bolt; this.buzz(s.id === 'trovao' ? 45 : 28);
    if (this.world.life) for (const l of this.world.life) if (l.scatter) l.scatter(this.camera.position);
    this.hearShot(s);
    if (this.world.patrol) this.world.patrol.call(LIFE.focus, this.camera.position);
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
    this.rkv += 9 + s.recoil * 60; this.camShake = Math.min(1, this.camShake + 0.35 + s.recoil * 4); if (s.bolt > 0.5) this.boltAnim = 0;
    this.flashT = 0.06; this.flashLight.intensity = 30;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    if (!this.scoped) { const mz = this.rifle.userData.muzzle.clone(); this.rifle.localToWorld(mz); this.fx.muzzle(mz, dir); this.fx.spawn(mz, dir.clone().multiplyScalar(0.5), { size: 0.5, grow: 0.5, life: 0.07, spark: true }); }
    setTimeout(() => this.fx && this.fx.ejectShell(cam.position.clone().addScaledVector(dir, 0.35).addScaledVector(right, 0.2).addScaledVector(up, -0.1), right, up), s.bolt > 0.5 ? 500 : 50);
    this.ui.shotFx(this.scoped, s.bolt > 0.5);
    // camera lenta no tiro final
    const pred = this.predict(b);
    if (pred && pred.actor && this.wouldFinish(pred.actor, pred.part)) {
      const flight = Math.max(0.15, pred.t);
      this.killcam = { b, actor: pred.actor, t: 0, phase: 'fly', flight, scale: clamp(flight / 2.4, 0.03, 0.25), dist: pred.dist, vel: pred.actor.vel ? pred.actor.vel.clone() : new THREE.Vector3(), veh: pred.actor.ride || null };
      this.mode = 'killcam'; this.ui.killcam(true, Math.round(pred.dist)); sfx.whoosh();
      // gravacao para o replay na tela de resultado
      const nodes = []; pred.actor.root.traverse(o => nodes.push(o)); const vr = pred.actor.ride ? pred.actor.ride.root : null;
      // atores perto do alvo tambem entram na gravacao
      const near = this.actors.filter(a => a !== pred.actor && a.pos.distanceTo(pred.actor.pos) < 30).sort((a, b) => a.pos.distanceTo(pred.actor.pos) - b.pos.distanceTo(pred.actor.pos)).slice(0, 6);
      for (const a of near) a.root.traverse(o => nodes.push(o));
      this.rec = { frames: [], nodes, veh: vr, dist: Math.round(pred.dist), hitFrame: -1, hitPoint: null, hitDir: null, mission: this.mission.id };
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
  // previsao do tiro: alvos que andam (a pe ou no caminhao) sao avancados no tempo com a velocidade atual
  predict(b) {
    const p = b.p.clone(), v = b.v.clone(); let t = 0;
    const vehCols = new Set(); for (const vh of (this.vehicles || [])) vh.colliders.forEach(c => vehCols.add(c));
    const stat = this.world.colliders.filter(c => !vehCols.has(c));
    const movers = [];
    for (const a of this.actors) if (a.alive) { const vel = a.vel && a.vel.lengthSq() > 0.01 ? a.vel : null; if (vel) movers.push({ objs: a.hitboxes, vel }); else stat.push(...a.hitboxes); }
    for (const vh of (this.vehicles || [])) { if (vh.vel && vh.vel.lengthSq() > 0.01) movers.push({ objs: vh.colliders, vel: vh.vel }); else stat.push(...vh.colliders); }
    const wa = this.windAccel(b.s).clone(); const q0 = new THREE.Vector3(), q1 = new THREE.Vector3(), dd = new THREE.Vector3();
    for (let i = 0; i < 400; i++) {
      const dt = 1 / 120; const p1 = p.clone().addScaledVector(v, dt); const seg = p.distanceTo(p1);
      let best = this.castSeg(p, p1, stat); let bestK = best ? best.distance / seg : 2;
      for (const m of movers) {
        q0.copy(p).addScaledVector(m.vel, -t); q1.copy(p1).addScaledVector(m.vel, -(t + dt)); const L = dd.subVectors(q1, q0).length();
        this.ray.set(q0, dd.divideScalar(L)); this.ray.far = L; this.ray.near = 0;
        const hs = this.ray.intersectObjects(m.objs, false); if (hs.length && hs[0].distance / L < bestK) { bestK = hs[0].distance / L; best = hs[0]; }
      }
      if (best) { const tt = t + dt * Math.min(1, bestK); const pt = p.clone().lerp(p1, Math.min(1, bestK)); return { t: tt, actor: best.object && best.object.userData.actor, part: best.object && best.object.userData.part, dist: pt.distanceTo(b.start) }; }
      v.y -= GRAV * dt; v.addScaledVector(wa, dt); v.multiplyScalar(1 - 0.015 * dt); p.copy(p1); t += dt; if (p.distanceTo(b.start) > 1800) break;
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
    const inKc = this.killcam && this.killcam.b === b; const scale = inKc ? 1 : clamp(dist / 120, 1, 6) * (this.scoped ? 1 : 1.5);
    if (actor) {
      const part = h.object.userData.part; this.st.hits++;
      this.fx.impact(p, dir.clone().negate(), 'body', inKc ? 0.35 : scale * 0.7); sfx.impact('body', dist);
      if (actor.kind === 'hostage') { actor.hp = 0; actor.kill(dir, part); this.ui.popup('Você acertou um refém!', 'bad'); this.finish(false, 'Você acertou um refém. Nunca atire perto dos reféns sem ter certeza.'); return; }
      if (actor.kind === 'civil') { actor.hp = 0; actor.kill(dir, part); this.st.civil++; this.ui.popup('Civil atingido! Penalidade', 'bad'); sfx.fail(); this.alertNear(p, 30, 20); return; }
      const dmg = b.s.damage * (part === 'head' ? 3 : part === 'torso' ? 1 : 0.55);
      actor.hp -= dmg;
      if (actor.hp <= 0) {
        actor.kill(dir, part); this.st.kills++; if (part === 'head') this.st.heads++;
        if (this.mission.goal === 'hvt' && actor.kind !== 'hvt') this.st.optional++;
        this.ui.popup(part === 'head' ? 'NA CABEÇA!' : actor.kind === 'hvt' ? 'ALVO PRINCIPAL ABATIDO' : 'Abatido', part === 'head' ? 'gold' : 'ok', Math.round(dist) + ' m');
        this.ui.hitmark(true); this.buzz(part === 'head' ? [40, 40, 90] : [30, 40, 60]);
        // testemunhas
        let w = 0; for (const a of this.actors) if (a !== actor && a.alive && (a.kind === 'merc' || a.kind === 'hvt') && a.pos.distanceTo(actor.pos) < 22) { if (a.alert(actor.pos)) w++; }
        if (w) { this.alertMeter += Math.min(35, 14 * w); sfx.alert(); this.ui.toast('Um inimigo viu o corpo cair!'); }
        for (const a of this.actors) if (a.kind === 'civil' && a.alive && a.pos.distanceTo(actor.pos) < 25) a.alert(actor.pos);
        this.checkWin(actor);
      } else {
        this.ui.popup('Ferido! Atire de novo', 'ok'); this.ui.hitmark(false); this.buzz(18);
        actor.alert(this.camera.position); this.alertMeter += 15; sfx.alert();
      }
    } else {
      const surf = h.ground ? (this.world.env === 'deserto' ? 'sand' : this.world.env === 'cidade' ? 'stone' : 'dirt') : (h.object.userData.surf || 'stone');
      let fsurf = surf; if (!h.ground && h.object.userData.onHit) { fsurf = h.object.userData.onHit(h.instanceId, p); this.alertNear(p, 14, 10); }
      if (fsurf === 'civil') { fsurf = 'body'; this.st.civil++; this.st.hits++; this.ui.popup('Civil atingido! Penalidade', 'bad'); sfx.fail(); this.alertNear(p, 30, 20); }
      const n = h.face ? (h.instanceId != null ? dir.clone().negate() : h.face.normal.clone().transformDirection(h.object.matrixWorld)) : new THREE.Vector3(0, 1, 0);
      this.fx.impact(p, n, fsurf, scale); sfx.impact(fsurf === 'metal' || fsurf === 'glass' ? 'metal' : 'ground', dist);
      this.alertNear(p, 9, 18);
      this.ui.hitmark(null);
    }
    if (this.killcam && this.killcam.b === b) { this.killcam.phase = 'after'; this.killcam.t = 0; this.killcam.hitPoint = p.clone(); this.killcam.hitDir = dir; }
  }
  // tiro ouvido pela distancia: guardas vao olhar na direcao do som
  hearShot(s) {
    const cp = this.camera.position; const hear = 260 * (s.id === 'trovao' ? 1.4 : 1); let n = 0;
    for (const a of this.actors) {
      if (!a.alive || a.kind !== 'merc' || a.ride) continue; const d = a.pos.distanceTo(cp);
      if (d > hear || Math.random() > 1.2 - d / hear) continue;
      const dir = new THREE.Vector3(cp.x - a.pos.x, 0, cp.z - a.pos.z).normalize(); const spot = a.pos.clone().addScaledVector(dir, Math.min(30, d * 0.22));
      if (a.investigate(spot, 'shot')) { a.inv.t += d / 343; n++; }
    }
    if (n) { this.alertMeter += 3 * n; this.ui.toast(n > 1 ? 'Guardas ouviram o tiro e vão olhar' : 'Um guarda ouviu o tiro e vai olhar'); }
  }
  // guardas veem corpos (e lanternas caidas a noite) e vao ver de perto
  lookAround() {
    const night = !!(this.mission.sky && this.mission.sky.night); let msg = null;
    const bodies = this.actors.filter(b => !b.alive && b.deadT > 1.5 && b.kind !== 'hostage');
    if (!bodies.length) return;
    for (const a of this.actors) {
      if (!a.alive || a.kind !== 'merc' || a.ride || a.state === 'alert' || a.state === 'flee' || (a.state === 'investigate' && a.inv.why === 'body')) continue;
      const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
      for (const b of bodies) {
        b.seenBy = b.seenBy || new Set(); if (b.seenBy.has(a)) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 1; const lit = !!(b.torch && night);
        if (Math.abs(b.pos.y - a.pos.y) > 2.5) continue; const range = lit ? 85 : night ? 16 : 30; const dot = (dx * fx + dz * fz) / d;
        if (d < range && dot > (lit ? -0.3 : 0.25)) { b.seenBy.add(a); if (a.investigate(b.pos, 'body')) msg = lit ? 'Um guarda viu a lanterna caída e vai olhar' : 'Um guarda viu um corpo e vai olhar'; break; }
      }
    }
    if (msg) { this.alertMeter += 6; sfx.alert(); this.ui.toast(msg); }
  }
  alertNear(p, radius, add) {
    let n = 0;
    for (const a of this.actors) {
      if (!a.alive) continue; const d = a.pos.distanceTo(p);
      if (a.kind === 'merc' && d >= radius && d < radius * 3.5) a.investigate(p, 'impact');
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
    if (this.binoc) { this.binoc = false; this.ui.binoc(false); }
    const m = this.mission, st = this.st;
    const acc = st.shots ? st.hits / st.shots : 0;
    let stars = 0, money = 0;
    if (win) {
      stars = 1 + (acc >= 0.7 ? 1 : 0) + (this.elapsed <= m.par ? 1 : 0); if (st.civil) stars = 1;
      money = m.reward + st.heads * 150 + st.optional * 120 + stars * 150; if (st.civil) money = Math.round(money * 0.5);
    }
    const rank = win ? rankFor(stars, acc, st.kills ? st.heads / st.kills : 0, this.elapsed / m.par, st.civil, this.alertMeter) : null;
    this.result = { win, reason, stars, money, acc, time: this.elapsed, heads: st.heads, kills: st.kills, shots: st.shots, civil: st.civil, rank };
    if (win && rank) { const sv = this.save; sv.rank = sv.rank || {}; const prev = sv.rank[m.id] ?? -1; this.result.newRank = rank.i > prev; sv.rank[m.id] = Math.max(prev, rank.i); }
    if (win) { const sv = this.save; sv.money += money; sv.done[m.id] = true; sv.stars[m.id] = Math.max(sv.stars[m.id] || 0, stars); const bt = sv.best[m.id]; if (!bt || this.elapsed < bt) sv.best[m.id] = Math.round(this.elapsed); this.store.writeSave(sv); }
    this.endT = 0;
    if (!this.killcam) { this.mode = 'ending'; if (win) this.ui.banner('MISSÃO CUMPRIDA', true); else { this.ui.banner('MISSÃO FALHOU', false); sfx.fail(); } }
  }
  // ---------- LACO PRINCIPAL ----------
  update(rdt) {
    if (!this.scene) return;
    if (this.mode === 'replay') { this.updateReplay(rdt); this.envInfo.sky.position.copy(this.camera.position); return; }
    const real = rdt; let dt = rdt * this.timeScale;
    this.t += dt;
    // vento com rajadas
    const wb = this.windBase; let gust = 1 + 0.28 * Math.sin(this.t * 0.31) * Math.sin(this.t * 0.17 + 2), dang = (wb.dir + 8 * Math.sin(this.t * 0.07)) * Math.PI / 180;
    if (wb.gust) {
      // tempestade: o vento muda de forca e de direcao
      gust = Math.max(0.25, 1 + 0.5 * Math.sin(this.t * 0.13) + 0.3 * Math.sin(this.t * 0.37 + 1)); dang = (wb.dir + 26 * Math.sin(this.t * 0.05) + 9 * Math.sin(this.t * 0.21)) * Math.PI / 180;
      if (this.scene.fog && this.fogBase) this.scene.fog.density = this.fogBase * (0.75 + 0.3 * gust) * (1 - 0.42 * (this.scopeK || 0));
      if (this.mode === 'play' && gust > 1.55 && !this.gustOn) { this.gustOn = true; this.ui.toast('Rajada forte! Espere o vento acalmar'); } else if (gust < 1.2) this.gustOn = false;
    }
    sfx.setRain(this.mission.weather === 'rain' && this.mode !== 'menu' ? 1 : 0);
    sfx.setSiren(this.world.patrol && (this.mode === 'play' || this.mode === 'killcam') ? this.world.patrol.siren(this.camera.position) : 0, this.t);
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
      const inv = this.actors.filter(a => a.alive && a.state === 'investigate').length;
      this.alertMeter = clamp(this.alertMeter + (alerted ? alerted * 1.5 : inv ? inv * 0.15 : -3.5) * dt, 0, 100);
      if (this.world.patrol && this.world.patrol.news) { this.world.patrol.news = false; this.ui.toast('Patrulha de segurança chegando com luzes piscando'); }
      this.lookT = (this.lookT || 0) - dt; if (this.lookT <= 0) { this.lookT = 0.4; this.lookAround(); }
      for (const a of this.actors) if (a.arrived) {
        const why = a.arrived; a.arrived = null;
        if (why === 'body' && a.alive) { a.alert(a.inv.spot); let w = 0; for (const o of this.actors) if (o !== a && o.alive && o.kind === 'merc' && o.pos.distanceTo(a.pos) < 30 && o.alert(a.pos)) w++; this.alertMeter += 25 + 8 * w; sfx.alert(); this.ui.toast('Um guarda achou o corpo! Alerta!'); }
      }
      if (this.alertMeter >= 100) this.finish(false, 'Os Corvos Negros descobriram você. Tente errar menos perto deles.');
      if (this.timeLeft <= 0) this.finish(false, 'O tempo acabou.');
      if (this.actors.some(a => a.escaped && a.alive)) this.finish(false, 'O alvo principal fugiu. Quando ele correr, atire rápido.');
    }
    if (this.mode === 'ending') { this.endT += real; if (this.endT > 1.8) { this.mode = 'result'; this.ui.showResult(this.result); } }
    const pp = cam.position;
    // na camera lenta o alvo fica parado ate a bala chegar: o tiro mostrado e o tiro previsto
    const freeze = this.mode === 'killcam' && this.killcam && this.killcam.phase === 'fly';
    const adt = freeze ? 0 : dt; const K = freeze ? this.killcam : null;
    // camera lenta: so o alvo continua andando, em linha reta, como na previsao
    if (this.vehicles) for (const v of this.vehicles) { if (K && K.veh === v) { v.root.position.addScaledVector(K.vel, dt); v.root.updateMatrixWorld(); } else v.update(adt); }
    for (const a of this.actors) {
      a._pp = a._pp || a.pos.clone(); a._pp.copy(a.pos);
      if (K && K.actor === a && !a.ride) a.pos.addScaledVector(K.vel, dt);
      a.update(adt, pp); a.root.updateMatrixWorld();
      if (adt > 0) { const nv = tmpV.subVectors(a.pos, a._pp).divideScalar(adt); a.vel = a.vel || new THREE.Vector3(); if (nv.lengthSq() < 400) a.vel.lerp(nv, Math.min(1, adt * 12)); }
    }
    if (this.vehicles) for (const v of this.vehicles) { v.vel = v.vel || new THREE.Vector3(); if (adt > 0) v.vel.set(Math.sin(v.heading) * v.v, 0, Math.cos(v.heading) * v.v); }
    this.stepBullets(dt);
    this.fx.update(dt);
    for (const f of this.world.flags) f.update(this.t, this.wind);
    for (const d of this.world.drift) d.update(dt, this.wind);
    LIFE.floor.copy(this.world.player.pos); LIFE.floor.y -= 1.62;
    { const fw = tmpV2.set(0, 0, -1).applyQuaternion(cam.quaternion); LIFE.focus.copy(cam.position).addScaledVector(fw, clamp(this.range || 100, 10, 900)); }
    if (this.world.life) for (const l of this.world.life) l.update(dt, this.t, this.wind, cam);
    if (this.world.fire) { const s = 1 + Math.sin(this.t * 13) * 0.15 + Math.sin(this.t * 7) * 0.1; this.world.fire.scale.set(s, 1.4 * s, s); if (Math.random() < dt * 6) this.fx.spawn(this.world.fire.position.clone().add(new THREE.Vector3(0, 0.8, 0)), new THREE.Vector3(this.wind.x * 0.3, 1.2, this.wind.z * 0.3), { size: 0.8, grow: 4, life: 3.5, color: 0x777777, opacity: 0.3, drag: 0.3 }); }
    if (this.flashT > 0) { this.flashT -= real; if (this.flashT <= 0) this.flashLight.intensity = 0; }
    // sombra segue o ponto de mira
    const dir = this.envInfo.dir; const fwd = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const focus = this.mode === 'killcam' && this.killcam ? this.killcam.actor.pos : cam.position.clone().addScaledVector(fwd, clamp(this.range, 40, this.scoped ? 700 : 260));
    const ext = this.scoped || this.mode === 'killcam' ? 45 : 140; const sc = dir.shadow.camera;
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
    dir.target.position.copy(focus); dir.position.copy(focus).addScaledVector(this.envInfo.sunDir, 800);
    this.envInfo.sky.position.copy(cam.position);
    if (this.mode === 'killcam' && this.rec) this.recFrame(real);
    this.ui.updateHud(this);
  }
  recFrame(real) {
    const R = this.rec, cam = this.camera, fx = this.fx; if (R.frames.length > 900) return;
    const n = R.nodes.length; const a = new Float32Array(n * 10);
    for (let i = 0; i < n; i++) { const o = R.nodes[i]; o.position.toArray(a, i * 10); o.quaternion.toArray(a, i * 10 + 3); o.scale.toArray(a, i * 10 + 7); }
    const tr = (o) => o.visible ? [o.position.clone(), o.quaternion.clone(), o.scale.clone()] : null;
    R.frames.push({ dt: real, cp: cam.position.clone(), cq: cam.quaternion.clone(), fov: cam.fov, b: tr(fx.bullet), tr: tr(fx.trail), a, v: R.veh ? [R.veh.position.clone(), R.veh.quaternion.clone()] : null });
    if (R.hitFrame < 0 && this.killcam && this.killcam.hitPoint) { R.hitFrame = R.frames.length - 1; R.hitPoint = this.killcam.hitPoint.clone(); R.hitDir = (this.killcam.hitDir || new THREE.Vector3(0, 0, -1)).clone(); }
  }
  applyRecFrame(f) {
    const R = this.replay.rec, cam = this.camera, fx = this.fx;
    for (let i = 0; i < R.nodes.length; i++) { const o = R.nodes[i]; o.position.fromArray(f.a, i * 10); o.quaternion.fromArray(f.a, i * 10 + 3); o.scale.fromArray(f.a, i * 10 + 7); }
    R.nodes[0].updateMatrixWorld(true);
    if (R.veh && f.v) { R.veh.position.copy(f.v[0]); R.veh.quaternion.copy(f.v[1]); R.veh.updateMatrixWorld(true); }
    cam.position.copy(f.cp); cam.quaternion.copy(f.cq); cam.fov = f.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    for (const [o, d] of [[fx.bullet, f.b], [fx.trail, f.tr]]) { o.visible = !!d; if (d) { o.position.copy(d[0]); o.quaternion.copy(d[1]); o.scale.copy(d[2]); } }
  }
  hasReplay() { return !!(this.lastRec && this.lastRec.frames.length > 8 && this.mission && this.lastRec.mission === this.mission.id); }
  startReplay() {
    if (!this.hasReplay() || this.mode !== 'result') return false;
    const rec = this.lastRec; const snap = new Float32Array(rec.nodes.length * 10);
    rec.nodes.forEach((o, i) => { o.position.toArray(snap, i * 10); o.quaternion.toArray(snap, i * 10 + 3); o.scale.toArray(snap, i * 10 + 7); });
    this.replay = { rec, i: 0, acc: 0, speed: 1, camMode: 0, snap, veh: rec.veh ? [rec.veh.position.clone(), rec.veh.quaternion.clone()] : null, cam: [this.camera.position.clone(), this.camera.quaternion.clone(), this.camera.fov], hit: false };
    this.mode = 'replay'; this.rifle.visible = false; this.ui.replay(true, rec.dist); sfx.whoosh(); this.applyRecFrame(rec.frames[0]);
    return true;
  }
  updateReplay(dt) {
    const P = this.replay, R = P.rec; if (!P.drag) P.acc += dt * P.speed;
    while (!P.drag && P.i < R.frames.length - 1 && P.acc >= R.frames[P.i].dt) { P.acc -= R.frames[P.i].dt; P.i++; }
    const f = R.frames[P.i]; this.applyRecFrame(f);
    if (P.camMode === 1) {
      // segunda camera: de lado da bala, depois parada perto do alvo
      const cam = this.camera; const tgt = R.nodes[0].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.9, 0));
      if (f.b) { const bp = f.b[0]; const d = tgt.clone().sub(bp); d.y = 0; if (d.lengthSq() < 1e-4) d.set(0, 0, -1); d.normalize(); const side = new THREE.Vector3(-d.z, 0, d.x);
        cam.position.copy(bp).addScaledVector(side, 2.4).addScaledVector(d, -0.6).add(new THREE.Vector3(0, 0.5, 0)); cam.lookAt(bp.clone().addScaledVector(d, 1.5)); }
      else { if (!P.side) { const toCam = this.world.player.pos.clone().sub(tgt); toCam.y = 0; toCam.normalize(); P.side = new THREE.Vector3(-toCam.z, 0, toCam.x); }
        cam.position.copy(tgt).addScaledVector(P.side, 5.5).add(new THREE.Vector3(0, 1.2, 0)); const gy = this.world.groundAt(cam.position.x, cam.position.z) + 0.6; if (cam.position.y < gy) cam.position.y = gy; cam.lookAt(tgt); }
      cam.fov = 40; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    } else if (P.camMode === 2) {
      // terceira camera: do alvo, olhando para tras, a bala vindo na direcao dele
      const cam = this.camera; const root = R.nodes[0]; const tgt = root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.55, 0));
      if (!P.back) { const s = this.world.player.pos.clone().sub(tgt).normalize(); const side = new THREE.Vector3(-s.z, 0, s.x).normalize(); P.back = { s, side, eye: tgt.clone().addScaledVector(s, -1.7).addScaledVector(side, 0.85).add(new THREE.Vector3(0, 0.35, 0)), after: tgt.clone().addScaledVector(s, 3.2).addScaledVector(side, 2.2).add(new THREE.Vector3(0, 0.5, 0)) }; }
      const B = P.back;
      if (f.b) { cam.position.copy(B.eye); const bp = f.b[0]; const dd = bp.distanceTo(B.eye); cam.lookAt(dd > 3 ? bp : tgt.clone().addScaledVector(B.s, 2)); cam.fov = clamp(2 * Math.atan(12 / Math.max(dd, 1)) * 180 / Math.PI, 22, 50); }
      else { cam.position.copy(B.after); const gy = this.world.groundAt(cam.position.x, cam.position.z) + 0.5; if (cam.position.y < gy) cam.position.y = gy; cam.lookAt(root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.8, 0))); cam.fov = 45; }
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    }
    this.ui.replayPos(P.i / Math.max(1, R.frames.length - 1));
    if (!P.hit && R.hitFrame >= 0 && P.i >= R.hitFrame) { P.hit = true; this.fx.impact(R.hitPoint, R.hitDir.clone().negate(), 'body', 0.35); sfx.impact('body', 100); }
    this.fx.update(dt * 0.3 * P.speed);
    if (P.i >= R.frames.length - 1 && !P.drag) this.stopReplay();
  }
  replayDrag(v) { if (this.replay) { this.replay.drag = !!v; this.replay.acc = 0; } }
  replaySeek(f) { const P = this.replay; if (!P) return; const R = P.rec; P.i = clamp(Math.round(f * (R.frames.length - 1)), 0, R.frames.length - 1); P.acc = 0; P.hit = R.hitFrame >= 0 && P.i >= R.hitFrame; }
  replaySlow() { if (this.replay) { this.replay.speed = this.replay.speed < 1 ? 1 : 0.35; this.ui.replayState(this.replay); } }
  replayCam() { if (this.replay) { this.replay.camMode = (this.replay.camMode + 1) % 3; this.replay.side = null; this.replay.back = null; this.ui.replayState(this.replay); } }
  stopReplay() {
    const P = this.replay; if (!P) return; const R = P.rec;
    R.nodes.forEach((o, i) => { o.position.fromArray(P.snap, i * 10); o.quaternion.fromArray(P.snap, i * 10 + 3); o.scale.fromArray(P.snap, i * 10 + 7); }); R.nodes[0].updateMatrixWorld(true);
    if (R.veh && P.veh) { R.veh.position.copy(P.veh[0]); R.veh.quaternion.copy(P.veh[1]); R.veh.updateMatrixWorld(true); }
    this.camera.position.copy(P.cam[0]); this.camera.quaternion.copy(P.cam[1]); this.camera.fov = P.cam[2]; this.camera.updateProjectionMatrix();
    this.fx.bullet.visible = false; this.fx.trail.visible = false;
    this.replay = null; this.mode = 'result'; this.ui.replay(false); this.ui.showResult(this.result);
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
    // ferrolho: em armas de ferrolho a luneta sai um instante para mostrar o ciclo
    const lifting = this.scoped && this.boltAnim >= 0 && this.boltAnim < 0.88 && s.bolt > 0.5 && this.save.settings.boltLift !== false;
    this.boltLift = damp(this.boltLift, lifting ? 1 : 0, 16, dt); this.ui.scopeLift(this.scoped && this.boltLift > 0.5);
    const zs = s.zooms; const sc = this.scoped && this.boltLift < 0.5;
    const target = this.binoc ? this.baseFov / BINOC_ZOOM : sc ? this.baseFov / zs[Math.min(this.zoomIdx, zs.length - 1)] : this.scoped ? this.baseFov / 2.2 : this.baseFov;
    this.fov = damp(this.fov, target, 14, dt); this.scopeK = damp(this.scopeK, sc ? 1 : 0, 14, dt);
    this.binK = damp(this.binK || 0, this.binoc ? 1 : 0, 12, dt);
    { const on = this.nv && (this.scopeK > 0.5 || this.binK > 0.5 || this.mode === 'killcam'); this.nvK = damp(this.nvK || 0, on ? 1 : 0, on ? 3.2 : 10, dt); if (on && !this._nvWas) sfx.nvOn(); this._nvWas = on; }
    cam.fov = this.fov; cam.updateProjectionMatrix();
    this.rifle.visible = this.scopeK < 0.6 && this.binK < 0.3;
    this.updateTags(dt);
    // atraso da arma ao mover a mira, mola do recuo e ciclo do ferrolho
    this.lagX = damp(this.lagX, clamp(this.aimVX * 0.0016, -0.05, 0.05), 10, dt); this.lagY = damp(this.lagY, clamp(this.aimVY * 0.0016, -0.04, 0.04), 10, dt); this.aimVX = 0; this.aimVY = 0;
    this.rkv += (-this.rk * 220 - this.rkv * 18) * dt; this.rk += this.rkv * dt;
    const bob = Math.sin(this.t * 1.5) * 0.002;
    this.rifle.position.set(0.2 - this.scopeK * 0.2 - this.lagX, -0.21 + this.scopeK * 0.1 + bob + this.lagY, -0.46 + this.rk * 0.012);
    this.rifle.rotation.set(this.rk * 0.012 + this.lagY * 1.5, -0.03 + this.lagX * 2.2, this.lagX * 1.2);
    const ud = this.rifle.userData;
    if (this.boltAnim >= 0) {
      this.boltAnim += dt / Math.max(0.5, s.bolt); const b = this.boltAnim;
      const up = b < 0.2 ? b / 0.2 : b < 0.75 ? 1 : b < 0.92 ? 1 - (b - 0.75) / 0.17 : 0;
      const back = b < 0.2 ? 0 : b < 0.45 ? (b - 0.2) / 0.25 : b < 0.72 ? 1 - (b - 0.45) / 0.27 : 0;
      ud.handle.rotation.z = up * 1.1; ud.bolt.position.z = 0.05 + back * 0.1;
      if (b >= 1) { this.boltAnim = -1; ud.handle.rotation.z = 0; ud.bolt.position.z = 0.05; }
    }
    // balanco da mira
    const t = this.t; let amp = (0.0034 * (1 - s.stab) + 0.00025) * (this.scoped ? 1 : 0.5);
    if (this.holding) amp *= 0.1; if (this.shake > 0) amp *= 2.4; if (this.binoc) amp = 0.0006;
    const swx = amp * (Math.sin(t * 0.83) * 0.7 + Math.sin(t * 1.91 + 1) * 0.3);
    const swy = amp * (Math.sin(t * 1.13 + 2) * 0.6 + Math.sin(t * 0.47) * 0.4) + (this.holding ? 0 : Math.sin(t * 1.5) * amp * 0.6);
    this.kick = damp(this.kick, 0, 7, dt); this.kickYaw = damp(this.kickYaw, 0, 7, dt);
    this.camShake = Math.max(0, this.camShake - dt * 3.5); const cs = this.camShake * this.camShake * (this.scoped ? 0.004 : 0.012);
    cam.rotation.set(this.pitch + swy + this.kick + (Math.random() - 0.5) * cs, this.yaw + swx + this.kickYaw + (Math.random() - 0.5) * cs, (Math.random() - 0.5) * cs * 0.5, 'YXZ');
    RIM.uRim.value = (this.scoped ? 0.5 : 0.15) * (1 + 1.4 * (this.nvK || 0)); RIM.uFogK.value = this.scoped ? (this.windBase && this.windBase.gust ? 0.12 : 0.3) : 0.45;
    cam.position.copy(this.world.player.pos);
    cam.updateMatrixWorld();
    // distancia na mira (rangefinder)
    this.rangeT -= dt; if (this.rangeT <= 0 && this.scene) { this.rangeT = 0.12; const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); const m = this.measureRange(cam.position, d); this.range = m.dist; this.rangeNone = !!m.none; this.rangeHit = m.actor; }
  }
  updateKillcam(dt) {
    const k = this.killcam, cam = this.camera; k.t += dt;
    RIM.uRim.value = 0.14 * (1 + 0.8 * (this.nvK || 0)); RIM.uFogK.value = 0.2;
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
      if (k.t > 2.6 || (!this.result && k.t > 1.2)) { this.timeScale = 1; this.killcam = null; if (this.rec) { this.lastRec = this.rec; this.rec = null; } this.ui.killcam(false); if (this.result) { this.mode = 'result'; this.ui.showResult(this.result); } else { this.mode = 'play'; this.ui.scope(this.scoped); } }
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
