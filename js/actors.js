// Personagens humanoides detalhados: geometria mesclada por segmento, cores por vertice,
// materiais compartilhados com luz de contorno, animacao misturada e queda tipo boneco de pano
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, damp, lerp } from './util.js?v=1.4.0';

// ---------- materiais compartilhados ----------
export const RIM = { uRim: { value: 0.32 }, uRimColor: { value: new THREE.Color(0xfff1d8) }, uFogK: { value: 0.45 } };
function patch(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = RIM.uRim; sh.uniforms.uRimColor = RIM.uRimColor; sh.uniforms.uFogK = RIM.uFogK;
    sh.fragmentShader = 'uniform float uRim; uniform vec3 uRimColor; uniform float uFogK;\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ vec3 vd = normalize(vViewPosition); float rim = pow(1.0 - clamp(abs(dot(normal, vd)), 0.0, 1.0), 2.6); totalEmissiveRadiance += mix(uRimColor, diffuseColor.rgb * 1.6, 0.6) * rim * uRim; }')
      .replace('#include <fog_fragment>', '#ifdef USE_FOG\n#ifdef FOG_EXP2\nfloat fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);\n#else\nfloat fogFactor = smoothstep(fogNear, fogFar, vFogDepth);\n#endif\ngl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * uFogK);\n#endif');
  };
  m.customProgramCacheKey = () => 'rim-actor';
  return m;
}
function grayTex(kind) {
  const W = 128, c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d');
  x.fillStyle = '#e6e6e6'; x.fillRect(0, 0, W, W);
  if (kind === 'camo') {
    const r = (a) => Math.random() * a;
    for (let i = 0; i < 70; i++) { const v = [150, 185, 120, 210][i % 4]; x.fillStyle = `rgb(${v},${v},${v})`; x.beginPath(); const cx = r(W), cy = r(W); for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = 5 + r(10); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill(); }
  }
  for (let i = 0; i < W; i += 2) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(i, 0, 1, W); x.fillRect(0, i, W, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
// pele: luz do ceu menos azul, um pouco de calor de dentro (subsuperficie barata)
function patchSkin(m) {
  patch(m); const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => { base(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= vec3(1.1, 0.93, 0.78); reflectedLight.indirectSpecular *= vec3(1.0, 0.9, 0.8);\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(0.085, 0.035, 0.02);'); };
  m.customProgramCacheKey = () => 'rim-skin'; return m;
}
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    camo: patch(new THREE.MeshStandardMaterial({ vertexColors: true, map: grayTex('camo'), roughness: 0.92 })),
    cloth: patch(new THREE.MeshStandardMaterial({ vertexColors: true, map: grayTex('plain'), roughness: 0.88 })),
    hard: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 })),
    skin: patchSkin(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0, envMapIntensity: 0.55 })),
  };
  return MATS;
}
export function resetActorMaterials() { if (MATS) Object.values(MATS).forEach(m => m.dispose()); MATS = null; BLOB = null; GLINT = null; TORCH = null; }
const HIT = new THREE.MeshBasicMaterial({ visible: false });
let BLOB = null, GLINT = null, TORCH = null;
// lanterna: cone de luz aditivo + mancha no chao (aparece na mira e na visao noturna)
function torchMats() {
  if (TORCH) return TORCH;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  const cone = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0xfff0c8, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const c2 = document.createElement('canvas'); c2.width = c2.height = 64; const y = c2.getContext('2d'); const r = y.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.4)'); r.addColorStop(1, 'rgba(255,255,255,0)'); y.fillStyle = r; y.fillRect(0, 0, 64, 64);
  const pool = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c2), color: 0xffe8b8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
  const lens = new THREE.MeshBasicMaterial({ color: 0xffffff }); lens.color.setScalar(4);
  TORCH = { cone, pool, lens, coneG: (() => { const g = new THREE.ConeGeometry(2.0, 13, 18, 1, true); g.translate(0, -6.5, 0); g.rotateX(-Math.PI / 2); return g; })(), poolG: (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; })() };
  return TORCH;
}
function blobMat() {
  if (BLOB) return BLOB;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.6, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  BLOB = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); return BLOB;
}
function glintMat() {
  if (GLINT) return GLINT;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,240,200,0.9)'); g.addColorStop(1, 'rgba(255,200,120,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(255,250,230,0.9)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 32); x.lineTo(64, 32); x.moveTo(32, 0); x.lineTo(32, 64); x.stroke();
  GLINT = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }); return GLINT;
}

// ---------- construtor de segmentos mesclados ----------
const E = new THREE.Euler(), Q = new THREE.Quaternion(), M4 = new THREE.Matrix4(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
class Seg {
  constructor() { this.parts = { camo: [], cloth: [], hard: [], skin: [] }; }
  add(geo, color, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    E.set(rx, ry, rz); Q.setFromEuler(E); M4.compose(V1.set(x, y, z), Q, V2.set(sx, sy, sz)); g.applyMatrix4(M4);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts[mat].push(g); return this;
  }
  build(parent) {
    const M = mats();
    for (const k of ['camo', 'cloth', 'hard', 'skin']) { const list = this.parts[k]; if (!list.length) continue; const g = mergeGeometries(list); list.forEach(x => x.dispose()); const m = new THREE.Mesh(g, M[k]); m.castShadow = true; parent.add(m); }
  }
}
const GC = {};
const gc = (k, f) => GC[k] || (GC[k] = f());
const capsule = (r, l) => gc('c' + r + l, () => new THREE.CapsuleGeometry(r, l, 5, 12));
const sphere = (r, w = 16, h = 12) => gc('s' + r + w, () => new THREE.SphereGeometry(r, w, h));
const cyl = (a, b, h, s = 12) => gc('y' + a + b + h + s, () => new THREE.CylinderGeometry(a, b, h, s));
const rbox = (w, h, d, r = 0.02) => gc('r' + w + h + d + r, () => new RoundedBoxGeometry(w, h, d, 2, r));
const box = (w, h, d) => gc('b' + w + h + d, () => new THREE.BoxGeometry(w, h, d));
// tronco por torno: peito largo, cintura estreita
const torsoGeo = gc('torso', () => { const p = [[0.001, 0], [0.13, 0.0], [0.145, 0.08], [0.15, 0.18], [0.17, 0.3], [0.185, 0.4], [0.18, 0.46], [0.14, 0.52], [0.06, 0.56], [0.001, 0.565]].map(([a, b]) => new THREE.Vector2(a, b)); return new THREE.LatheGeometry(p, 16); });
const limbGeo = (r0, r1, l) => gc('l' + r0 + r1 + l, () => { const p = []; for (let i = 0; i <= 8; i++) { const t = i / 8; const r = lerp(r0, r1, t) * (1 + Math.sin(t * Math.PI) * 0.12); p.push(new THREE.Vector2(i === 0 || i === 8 ? r * 0.55 : r, -t * l)); } p.unshift(new THREE.Vector2(0.001, 0.01)); p.push(new THREE.Vector2(0.001, -l - 0.01)); p.reverse(); return new THREE.LatheGeometry(p, 12); });
const helmetGeo = gc('helm', () => new THREE.SphereGeometry(0.138, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56));

const SKINS = [0xe0b48f, 0xc68e63, 0x9c6a45, 0x6e4a32, 0xf0c9a5, 0xb07a52];
const PAL = {
  cidade: [[0x7a818a, 0x3c4148], [0x5e636b, 0x2e3137], [0x8a8478, 0x45423c]],
  montanha: [[0x75805a, 0x464c34], [0x68744e, 0x3a4030], [0x86866a, 0x4c4c3a]],
  deserto: [[0xa08a62, 0x6e5c3c], [0x8f7c58, 0x5c4c32], [0xb09a72, 0x7a6644]],
};
const SHIRTS = [0xd9d4c7, 0x3f6fa8, 0xb0473b, 0x4e8a55, 0xd4a23c, 0x8a5aa0, 0xe8e0d0, 0x2f7f8f];

function lookFor(kind, r, env) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  if (kind === 'merc') {
    const [uni, vest] = pick(PAL[env] || PAL.cidade);
    return { uni, vest, mat: 'camo', head: pick(['helmet', 'helmet', 'cap', 'balaclava', 'beret']), pack: r() < 0.6, rifle: true, optic: r() < 0.35, band: true, gloves: true, boots: 0x1c1a17, pants: uni, goggles: r() < 0.4 };
  }
  if (kind === 'hvt') return { uni: 0x6b5a44, vest: null, mat: 'cloth', head: 'redberet', pack: false, rifle: false, band: true, glasses: true, boots: 0x2a1a10, pants: 0x2b2b30, coat: true };
  return { uni: pick(SHIRTS), vest: null, mat: 'cloth', head: kind === 'hostage' ? 'blind' : pick(['hat', 'hair', 'hair']), pack: kind === 'civil' && r() < 0.3, rifle: false, band: false, boots: 0x4a3a2a, pants: pick([0x3a4a66, 0x2e3a52, 0x5a5048, 0x3c3c3c]) };
}

const POSE0 = { by: 0.95, tx: 0.03, ty: 0, hx: 0, thL: 0, thR: 0, knL: 0.05, knR: 0.05, shL: 0, shR: 0, szL: 0.08, szR: 0.08, elL: -0.15, elR: -0.15, gx: 0.5, gy: 0.2, gz: 0.26 };
const KEYS = Object.keys(POSE0);
const GRIP_R = [0, -0.1, 0.1], GRIP_L = [0, -0.02, 0.17];

export class Actor {
  constructor(def, world, r) {
    this.r0 = Math.random() * 6; this.def = def; this.kind = def.kind; this.name = def.name || null; this.world = world;
    this.hitboxes = []; this.alive = true; this.hp = 100;
    this.state = def.pose === 'kneel' ? 'kneel' : (def.pose === 'idle' || def.path.length === 1) ? 'idle' : 'patrol';
    this.r = r; this.t = r() * 10; this.phase = r() * 6; this.wpi = 0; this.waitT = 0; this.alertT = 0; this.speedNow = 0; this.deadT = 0; this.escaped = false;
    this.wWalk = 0; this.cur = { ...POSE0 }; this.out = { ...POSE0 };
    const anc = world.anchors[def.a] || { x: 0, y: null, z: 0 };
    this.fixedY = anc.y != null ? anc.y : null;
    this.path = def.path.map(([x, z]) => new THREE.Vector3(anc.x + x, 0, anc.z + z));
    this.path.forEach(p => p.y = this.groundY(p.x, p.z));
    this.escape = def.escape ? new THREE.Vector3(anc.x + def.escape[0], 0, anc.z + def.escape[1]) : null;
    if (this.escape) this.escape.y = this.groundY(this.escape.x, this.escape.z);
    this.L = lookFor(this.kind, r, world.env);
    this.build(this.L);
    this.root.position.copy(this.path[0]);
    this.heading = this.path.length > 1 ? Math.atan2(this.path[1].x - this.path[0].x, this.path[1].z - this.path[0].z) : Math.atan2(-this.path[0].x, -this.path[0].z) + (r() - 0.5) * 2;
    this.root.rotation.y = this.heading; this.lookYaw = 0;
    this.scale = 1.02 + r() * 0.1; this.root.scale.setScalar(this.scale);
  }
  groundY(x, z) { return this.fixedY != null ? this.fixedY : this.world.groundAt(x, z); }
  build(L) {
    const r = this.r, skin = SKINS[Math.floor(r() * SKINS.length)];
    const root = this.root = new THREE.Group(); root.rotation.order = 'YXZ';
    const mUni = L.mat, dark = 0x17181a, metal = 0x26282b;
    // pelve
    const body = this.body = new THREE.Group(); body.position.y = 0.95; root.add(body);
    new Seg().add(capsule(0.13, 0.12), L.pants, mUni, 0, 0.0, 0, 0, 0, Math.PI / 2, 1, 1.12, 0.78).add(box(0.34, 0.05, 0.22), 0x2a2420, 'hard', 0, 0.07, 0).add(rbox(0.06, 0.04, 0.03, 0.01), 0x8a8a80, 'hard', 0, 0.07, 0.11).build(body);
    hit(box(0.38, 0.24, 0.26), 'torso', this, body);
    // tronco
    const torso = this.torso = new THREE.Group(); torso.position.y = 0.06; body.add(torso);
    const T = new Seg().add(torsoGeo, L.uni, mUni, 0, 0.0, 0, 0, 0, 0, 1.05, 1, 0.68);
    if (L.coat) T.add(torsoGeo, L.uni, 'cloth', 0, -0.05, 0, 0, 0, 0, 1.12, 1.02, 0.74).add(box(0.03, 0.4, 0.02), 0x2a2018, 'hard', 0, 0.22, 0.125);
    if (L.vest) {
      T.add(rbox(0.38, 0.36, 0.25, 0.04), L.vest, 'cloth', 0, 0.28, 0.0);
      for (let i = -1; i <= 1; i++) T.add(rbox(0.09, 0.11, 0.05, 0.015), L.vest, 'cloth', i * 0.105, 0.2, 0.14);
      T.add(rbox(0.12, 0.08, 0.04, 0.012), 0x2a2a28, 'cloth', 0.08, 0.36, 0.135);
      T.add(rbox(0.07, 0.04, 0.02, 0.008), 0x8c1c1a, 'hard', -0.1, 0.38, 0.13); // emblema dos Corvos Negros
    }
    if (L.pack) T.add(rbox(0.3, 0.38, 0.17, 0.05), L.vest || 0x4a4030, 'cloth', 0, 0.27, -0.2).add(rbox(0.24, 0.12, 0.08, 0.03), L.vest || 0x4a4030, 'cloth', 0, 0.13, -0.3).add(cyl(0.05, 0.05, 0.3, 8), 0x3a3a30, 'cloth', 0, 0.48, -0.2, 0, 0, Math.PI / 2);
    T.add(cyl(0.055, 0.062, 0.1, 10), skin, 'skin', 0, 0.58, 0.0);
    if (L.optic) T.add(rbox(0.1, 0.05, 0.06, 0.015), dark, 'hard', 0.14, 0.12, 0.12);
    T.build(torso);
    hit(box(0.42, 0.56, 0.3), 'torso', this, torso, 0, 0.28, 0);
    // cabeca
    const head = this.head = new THREE.Group(); head.position.y = 0.62; torso.add(head);
    const H = new Seg(); const bal = L.head === 'balaclava';
    H.add(sphere(0.108), bal ? 0x1b1b1d : skin, bal ? 'cloth' : 'skin', 0, 0.11, 0, 0, 0, 0, 0.9, 1.08, 0.98);
    H.add(sphere(0.04, 8, 6), bal ? 0x1b1b1d : skin, 'skin', 0, 0.035, 0.035, 0, 0, 0, 1.4, 0.9, 1.1); // queixo
    H.add(box(0.026, 0.045, 0.04), bal ? 0x1b1b1d : skin, 'skin', 0, 0.1, 0.1, -0.2);
    H.add(sphere(0.022, 6, 5), skin, 'skin', 0.1, 0.1, -0.005, 0, 0, 0, 0.5, 1, 0.8).add(sphere(0.022, 6, 5), skin, 'skin', -0.1, 0.1, -0.005, 0, 0, 0, 0.5, 1, 0.8);
    // rosto: olhos com pupila, sobrancelhas, boca, faces e barba em alguns
    const eyeY = 0.128, brow = r() < 0.5 ? 0x2a1c12 : 0x15110e;
    if (bal) H.add(box(0.13, 0.034, 0.02), skin, 'skin', 0, eyeY, 0.098);
    for (const sx of [1, -1]) {
      H.add(sphere(0.0135, 8, 6), 0xf2efe8, 'hard', 0.036 * sx, eyeY, 0.093, 0, 0, 0, 1.25, 0.8, 0.6).add(sphere(0.0075, 6, 5), 0x1d140e, 'hard', 0.036 * sx, eyeY, 0.1, 0, 0, 0, 1, 1, 0.5);
      if (!bal) H.add(rbox(0.034, 0.009, 0.012, 0.004), brow, 'hard', 0.037 * sx, eyeY + 0.024, 0.098, 0, 0, -0.12 * sx);
    }
    if (!bal) {
      H.add(rbox(0.04, 0.008, 0.01, 0.003), 0x6a3a30, 'hard', 0, 0.062, 0.096);
      H.add(sphere(0.03, 8, 6), skin, 'skin', 0.05, 0.085, 0.07, 0, 0, 0, 1, 0.8, 0.6).add(sphere(0.03, 8, 6), skin, 'skin', -0.05, 0.085, 0.07, 0, 0, 0, 1, 0.8, 0.6);
      if (this.kind !== 'hostage' && r() < 0.35) H.add(sphere(0.07, 12, 8), r() < 0.5 ? 0x2a1c12 : 0x4a3426, 'cloth', 0, 0.045, 0.04, 0, 0, 0, 1.25, 0.75, 1.0).add(rbox(0.05, 0.012, 0.014, 0.004), 0x2a1c12, 'cloth', 0, 0.077, 0.098);
    }
    if (L.head === 'helmet') { H.add(helmetGeo, 0x3a3d36, 'hard', 0, 0.12, -0.005, 0, 0, 0, 1, 0.95, 1.1).add(cyl(0.145, 0.15, 0.02, 18), 0x33362f, 'hard', 0, 0.13, -0.005, 0, 0, 0, 1, 1, 1.08); if (L.goggles) H.add(rbox(0.19, 0.045, 0.04, 0.015), 0x111111, 'hard', 0, 0.21, 0.1); }
    else if (L.head === 'cap') H.add(cyl(0.115, 0.117, 0.075, 16), 0x26282a, 'cloth', 0, 0.185, 0).add(box(0.15, 0.012, 0.1), 0x26282a, 'cloth', 0, 0.155, 0.11, 0.12);
    else if (L.head === 'beret' || L.head === 'redberet') H.add(cyl(0.125, 0.118, 0.05, 16), L.head === 'redberet' ? 0x8c1c1c : 0x161616, 'cloth', 0.02, 0.205, 0, 0, 0, 0.25);
    else if (L.head === 'hat') H.add(cyl(0.2, 0.2, 0.015, 18), 0xc8b07a, 'cloth', 0, 0.19, 0).add(cyl(0.1, 0.115, 0.09, 14), 0xc8b07a, 'cloth', 0, 0.235, 0);
    else if (L.head === 'hair' || L.head === 'blind') H.add(helmetGeo, r() < 0.5 ? 0x2a1a10 : 0x111111, 'cloth', 0, 0.12, -0.012, 0, 0, 0, 0.86, 0.85, 0.9);
    if (L.head === 'blind') H.add(cyl(0.112, 0.112, 0.04, 14), 0xd8d0c0, 'cloth', 0, 0.13, 0);
    if (L.glasses) H.add(box(0.17, 0.035, 0.02), 0x0c0c0c, 'hard', 0, 0.125, 0.1);
    H.build(head);
    hit(sphere(0.13, 8, 6), 'head', this, head, 0, 0.11, 0);
    // bracos
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(0.2 * side, 0.47, 0); torso.add(sh);
      const A = new Seg().add(sphere(0.06, 10, 8), L.uni, mUni, 0, 0, 0).add(limbGeo(0.068, 0.052, 0.28), L.uni, mUni, 0, 0, 0);
      if (L.band) A.add(cyl(0.058, 0.058, 0.045, 10), 0x9e1d1a, 'cloth', 0, -0.09, 0);
      A.build(sh);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      const hc = L.gloves ? 0x1f201d : skin;
      new Seg().add(limbGeo(0.056, 0.042, 0.25), L.coat || L.mat === 'camo' ? L.uni : skin, L.coat || L.mat === 'camo' ? mUni : 'skin', 0, 0, 0)
        .add(rbox(0.05, 0.07, 0.03, 0.012), hc, L.gloves ? 'hard' : 'skin', 0, -0.285, 0.004)
        .add(rbox(0.048, 0.05, 0.026, 0.01), hc, L.gloves ? 'hard' : 'skin', 0, -0.33, 0.016, 0.55)
        .add(capsule(0.011, 0.03), hc, L.gloves ? 'hard' : 'skin', -0.026 * side, -0.29, 0.024, 0.6, 0, 0.5 * side)
        .add(cyl(0.024, 0.024, 0.02, 10), L.gloves ? 0x2c2d29 : (L.coat || L.mat === 'camo' ? L.uni : skin), 'hard', 0, -0.255, 0).build(el);
      return { sh, el };
    };
    this.armL = arm(1); this.armR = arm(-1);
    // pernas
    const leg = (side) => {
      const hp = new THREE.Group(); hp.position.set(0.1 * side, -0.04, 0); body.add(hp);
      const P = new Seg().add(limbGeo(0.1, 0.07, 0.44), L.pants, mUni, 0, 0, 0);
      if (this.kind === 'merc') P.add(rbox(0.07, 0.12, 0.13, 0.02), L.vest || L.pants, 'cloth', 0.07 * side, -0.2, 0.0);
      P.build(hp);
      hit(box(0.15, 0.45, 0.16), 'limb', this, hp, 0, -0.22, 0);
      const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
      new Seg().add(limbGeo(0.071, 0.05, 0.42), L.pants, mUni, 0, 0, 0).add(rbox(0.11, 0.1, 0.26, 0.03), L.boots, 'hard', 0, -0.45, 0.04).add(box(0.115, 0.025, 0.27), 0x0e0e0e, 'hard', 0, -0.495, 0.04).build(kn);
      hit(box(0.13, 0.45, 0.14), 'limb', this, kn, 0, -0.21, 0);
      return { hp, kn };
    };
    this.legL = leg(1); this.legR = leg(-1);
    // arma nas maos
    if (L.rifle) {
      const g = this.gun = new THREE.Group();
      new Seg().add(rbox(0.05, 0.08, 0.42, 0.012), metal, 'hard', 0, 0, 0.05).add(cyl(0.014, 0.014, 0.34, 8), 0x111214, 'hard', 0, 0.012, 0.42, Math.PI / 2)
        .add(rbox(0.04, 0.14, 0.05, 0.01), metal, 'hard', 0, -0.1, 0.1, 0.2).add(rbox(0.045, 0.1, 0.2, 0.015), 0x2e2a24, 'hard', 0, -0.015, -0.24)
        .add(cyl(0.022, 0.022, 0.14, 10), 0x111214, 'hard', 0, 0.07, 0.04, Math.PI / 2).add(rbox(0.03, 0.08, 0.035, 0.008), metal, 'hard', 0, -0.07, -0.05, -0.3).build(g);
      g.position.set(-0.04, 0.2, 0.26); torso.add(g);
    }
    // sombra de contato
    const blob = this.blob = new THREE.Mesh(gc('blobg', () => new THREE.CircleGeometry(0.55, 16).rotateX(-Math.PI / 2)), blobMat()); blob.renderOrder = 1; this.blobY = 0.02;
    // brilho de lente (binoculo ou luneta)
    if (L.optic) { this.glint = new THREE.Sprite(glintMat()); this.glint.visible = false; }
  }
  setRide(v, off) { this.ride = v; this.rideOff = new THREE.Vector3(off ? off[0] : 0, 0, off ? off[1] : 0); this.followRide(); this.state = 'idle'; }
  followRide() { const v = this.ride; V2.copy(v.bedLocal).add(this.rideOff).applyMatrix4(v.root.matrixWorld); this.root.position.copy(V2); this.fixedY = V2.y; }
  attach(scene) { scene.add(this.root); scene.add(this.blob); if (this.glint) scene.add(this.glint); if (this.def.torch) this.makeTorch(scene); }
  makeTorch(scene) {
    const T = torchMats(); const g = new THREE.Group(); g.position.set(-0.16, 0.3, 0.17); this.torso.add(g);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), T.lens); lens.rotation.x = Math.PI / 2; g.add(lens);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.5 })); body.rotation.x = Math.PI / 2; body.position.z = -0.09; g.add(body);
    const cone = new THREE.Mesh(T.coneG, T.cone); cone.rotation.x = 0.2; cone.renderOrder = 2; g.add(cone);
    const pool = new THREE.Mesh(T.poolG, T.pool); pool.scale.set(4.5, 1, 6); scene.add(pool);
    this.torch = { g, cone, pool, lens, wp: new THREE.Vector3(), fw: new THREE.Vector3() };
  }
  get pos() { return this.root.position; }
  headWorld(v) { return this.head.getWorldPosition(v).add(V1.set(0, 0.1, 0)); }
  alert(src) {
    if (!this.alive || this.kind === 'hostage') return false;
    const was = this.state === 'alert' || this.state === 'flee';
    if (this.kind === 'hvt' && (this.escape || this.ride)) this.state = 'flee';
    else if (this.ride) { this.state = 'alert'; this.alertT = 12; this.ride.flee(); }
    else if (this.kind === 'civil') { this.state = 'flee'; this.civTarget = this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 50, 0, (Math.random() - 0.5) * 50)); this.civTarget.y = this.groundY(this.civTarget.x, this.civTarget.z); }
    else { this.state = 'alert'; this.alertT = 12; this.scramble = null; this.scrambleWait = 0.6 + Math.random() * 0.8; }
    this.alertSrc = src ? src.clone() : null;
    return !was;
  }
  kill(dir, part) {
    if (!this.alive) return; if (this.ride && this.kind === 'hvt') this.ride.stop(); this.alive = false; this.state = 'dead'; this.deadT = 0; this.hitPart = part;
    const h = new THREE.Vector3(dir.x, 0, dir.z); if (h.lengthSq() < 1e-6) h.set(0, 0, 1); h.normalize();
    // cai na direcao da bala com um pouco de giro aleatorio
    h.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.8);
    this.fallAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), h).normalize();
    this.theta = 0.04; this.omega = part === 'head' ? 1.6 : 1.0; this.crumple = part !== 'head' && Math.random() < 0.4;
    this.baseQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.heading, 0, 'YXZ'));
    this.react = 1; this.limp = { shL: this.out.shL, shR: this.out.shR, vL: (Math.random() - 0.5) * 6, vR: (Math.random() - 0.5) * 6 };
    this.twist = (Math.random() - 0.5) * 0.8;
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
  turnTo(a, dt, k) { let dh = a - this.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2; this.heading += dh * Math.min(1, dt * k); }
  update(dt, playerPos) {
    this.t += dt;
    if (this.ride) this.followRide();
    if (this.state === 'dead') { this.animDead(dt); this.syncExtras(playerPos); return; }
    if (this.ride) {
      this.speedNow = 0; this.toPlayer = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      if (this.state === 'flee' || this.state === 'alert') this.ride.flee();
      if (this.ride.done && this.kind === 'hvt') this.escaped = true;
      this.heading = this.ride.heading + (this.rideOff.x >= 0 ? 0.5 : -2.6); this.lookYaw = Math.sin(this.t * 0.4 + this.phase) * 0.8;
      this.root.rotation.y = this.heading; this.animate(dt); this.syncExtras(playerPos); return;
    }
    this.speedNow = 0;
    const toPlayer = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z); this.toPlayer = toPlayer;
    if (this.state === 'patrol') {
      if (this.waitT > 0) this.waitT -= dt;
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
      if (tgt && this.moveTo(tgt, this.kind === 'hvt' ? 4.6 : 4, dt)) { if (this.kind === 'hvt') this.escaped = true; else this.state = 'cower'; }
    } else if (this.state === 'idle') this.lookYaw = Math.sin(this.t * 0.4 + this.phase) * 0.8;
    this.root.rotation.y = this.heading;
    this.animate(dt);
    this.syncExtras(playerPos);
  }
  syncExtras(playerPos) {
    const p = this.root.position; this.blob.position.set(p.x, this.groundY(p.x, p.z) + this.blobY, p.z);
    if (this.torch) { const T = this.torch; const on = this.alive; T.cone.visible = on; T.pool.visible = on; T.lens.visible = on;
      if (on) { T.g.getWorldPosition(T.wp); T.fw.set(0, 0, 1).applyQuaternion(this.root.quaternion); T.fw.y = 0; T.fw.normalize(); const sw = Math.sin(performance.now() * 0.0007 + this.r0) * 0.25; T.g.rotation.y = sw;
        const ang = Math.atan2(T.fw.x, T.fw.z) + sw; const px = T.wp.x + Math.sin(ang) * 7, pz = T.wp.z + Math.cos(ang) * 7; T.pool.position.set(px, this.groundY(px, pz) + 0.06, pz); T.pool.rotation.y = ang; } }
    if (this.glint) {
      let show = false;
      if (this.alive) { let d = this.toPlayer - (this.heading + this.head.rotation.y); while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; const f = Math.cos(d); show = f > 0.8 && Math.sin(this.t * 2.3 + this.phase) > 0.2; if (show) { this.headWorld(this.glint.position); this.glint.position.y -= 0.02; const dist = this.glint.position.distanceTo(playerPos); this.glint.scale.setScalar(dist * 0.007 * (0.6 + 0.4 * (f - 0.8) * 5) * (0.8 + 0.2 * Math.sin(this.t * 17))); } }
      this.glint.visible = show;
    }
  }
  targetPose(t) {
    const P = { ...POSE0 }; const br = Math.sin(t * 1.8 + this.phase) * 0.012; const alert = this.state === 'alert'; const armed = !!this.gun;
    P.tx = 0.03 + br; P.hx = 0;
    if (this.state === 'kneel') return Object.assign(P, { by: 0.5 + Math.sin(t * 2) * 0.004, tx: 0.12 + Math.sin(t * 1.3) * 0.02, hx: 0.25 + Math.sin(t * 0.8) * 0.05, thL: -0.05, thR: -0.05, knL: 1.6, knR: 1.6, shL: -2.7, shR: -2.7, szL: 0.55, szR: 0.55, elL: -2.0, elR: -2.0 });
    if (this.state === 'cower') return Object.assign(P, { by: 0.55, tx: 0.5, thL: -1.3, thR: -1.3, knL: 2.2, knR: 2.2, shL: -2.6, shR: -2.6, szL: 0.5, szR: 0.5, elL: -2.1, elR: -2.1 });
    if (alert && this.scrambleDone) return Object.assign(P, { by: 0.62, tx: 0.15, thL: -1.4, thR: -0.3, knL: 1.4, knR: 1.9, shL: -1.45, shR: -1.25, szL: 0.25, szR: 0.4, elL: -0.2, elR: -0.95, gx: 0.0, gy: 0.42, gz: 0.3 });
    if (armed) return Object.assign(P, alert ? { tx: 0.1, shL: -1.45, shR: -1.2, szL: 0.25, szR: 0.4, elL: -0.2, elR: -0.95, gx: 0.0, gy: 0.42, gz: 0.3 } : { shL: -0.7, shR: -0.4, szL: 0.35, szR: 0.25, elL: -1.15, elR: -1.25, gx: 0.55, gy: 0.2, gz: 0.26 });
    return Object.assign(P, { shL: br * 2, shR: -br * 2, elL: -0.15, elR: -0.15 });
  }
  animate(dt) {
    const t = this.t, s = this.speedNow, run = s > 2.5;
    this.head.rotation.y = damp(this.head.rotation.y, this.state === 'idle' ? this.lookYaw : (this.waitT > 0 ? Math.sin(t * 0.7) * 0.6 : 0), 3, dt);
    const tp = this.targetPose(t);
    for (const k of KEYS) this.cur[k] = damp(this.cur[k], tp[k], 9, dt);
    this.wWalk = damp(this.wWalk, s > 0.05 ? 1 : 0, 7, dt);
    const o = this.out; for (const k of KEYS) o[k] = this.cur[k];
    if (this.wWalk > 0.01) {
      this.phase += dt * Math.max(s, 0.6) * 4.4;
      const a = run ? 0.85 : 0.5, p = this.phase, w = this.wWalk, armed = !!this.gun;
      const W = { by: 0.95 - (run ? 0.06 : 0.015) + Math.abs(Math.sin(p)) * (run ? 0.06 : 0.03), tx: run ? 0.28 : 0.05, ty: Math.sin(p) * 0.09,
        thL: Math.sin(p) * a, thR: -Math.sin(p) * a, knL: Math.max(0, -Math.sin(p - 0.9)) * a * 1.5 + 0.06, knR: Math.max(0, Math.sin(p - 0.9)) * a * 1.5 + 0.06 };
      if (!armed) Object.assign(W, { shL: -Math.sin(p) * a * 0.8, shR: Math.sin(p) * a * 0.8, elL: -0.3 - (run ? 0.9 : 0), elR: -0.3 - (run ? 0.9 : 0) });
      for (const k in W) o[k] = lerp(o[k], W[k], w);
      if (armed && run) { o.gx = lerp(o.gx, 0.9, w); }
    }
    if (this.gun && this.ikOn()) { this.solveArm(o, 'R', GRIP_R); this.solveArm(o, 'L', GRIP_L); }
    this.apply(o);
  }
  ikOn() { return this.state !== 'kneel' && this.state !== 'cower'; }
  // IK de dois ossos: a mao vai ate o ponto de pegada da arma (no espaco do tronco)
  solveArm(o, side, grip) {
    const sx = side === 'L' ? 0.2 : -0.2, l1 = 0.28, l2 = 0.3;
    const cx = Math.cos(o.gx), sn = Math.sin(o.gx);
    const ty = o.gy + grip[1] * cx - grip[2] * sn, tz = o.gz + grip[1] * sn + grip[2] * cx, tx = -0.04 + grip[0];
    let vx = tx - sx, vy = ty - 0.47, vz = tz; let D = Math.hypot(vx, vy, vz); const maxD = (l1 + l2) * 0.985;
    if (D > maxD) { const k = maxD / D; vx *= k; vy *= k; vz *= k; D = maxD; }
    const cphi = clamp((D * D - l1 * l1 - l2 * l2) / (2 * l1 * l2), -1, 1); const phi = -Math.acos(cphi);
    const y0 = -l1 - l2 * Math.cos(phi), z0 = -l2 * Math.sin(phi);
    const sc = clamp(vx / -y0, -0.95, 0.95); const c = -Math.asin(sc) * -1; const cc = Math.cos(c);
    const y1 = y0 * cc, z1 = z0; const a = Math.atan2(vz, vy) - Math.atan2(z1, y1);
    if (side === 'L') { o.shL = a; o.szL = c; o.elL = phi; } else { o.shR = a; o.szR = -c; o.elR = phi; }
  }
  apply(o) {
    this.body.position.y = o.by; this.torso.rotation.x = o.tx; this.torso.rotation.y = o.ty; this.head.rotation.x = o.hx;
    this.legL.hp.rotation.x = o.thL; this.legR.hp.rotation.x = o.thR; this.legL.kn.rotation.x = o.knL; this.legR.kn.rotation.x = o.knR;
    this.armL.sh.rotation.set(o.shL, 0, o.szL); this.armR.sh.rotation.set(o.shR, 0, -o.szR); this.armL.el.rotation.x = o.elL; this.armR.el.rotation.x = o.elR;
    if (this.gun) { this.gun.rotation.x = o.gx; this.gun.position.y = o.gy; this.gun.position.z = o.gz; }
  }
  animDead(dt) {
    if (this.deadT > 3) return;
    this.deadT += dt; const t = this.deadT, o = this.out;
    // reacao ao impacto
    this.react = Math.max(0, this.react - dt * 6);
    // joelhos cedem
    const k1 = clamp(t / (this.crumple ? 0.4 : 0.22), 0, 1);
    o.by = lerp(o.by, this.crumple ? 0.55 : 0.78, k1 * 0.3); o.knL = lerp(o.knL, this.crumple ? 1.5 : 0.7, k1 * 0.3); o.knR = lerp(o.knR, this.crumple ? 1.7 : 0.5, k1 * 0.3);
    o.thL = lerp(o.thL, this.crumple ? -1.0 : -0.3, k1 * 0.3); o.thR = lerp(o.thR, this.crumple ? -0.8 : -0.15, k1 * 0.3);
    o.tx = lerp(o.tx, 0.3, 0.1); o.ty = lerp(o.ty, this.twist, 0.08); o.hx = -0.4 * this.react + lerp(o.hx, 0.2, 0.05);
    // bracos soltos com mola
    const L = this.limp; L.vL += (-0.6 - L.shL) * 20 * dt - L.vL * 3 * dt; L.vR += (-1.4 - L.shR) * 20 * dt - L.vR * 3 * dt; L.shL += L.vL * dt; L.shR += L.vR * dt;
    o.shL = L.shL; o.shR = L.shR; o.szL = lerp(o.szL, 1.0, 0.06); o.szR = lerp(o.szR, 1.2, 0.06); o.elL = lerp(o.elL, -0.3, 0.1); o.elR = lerp(o.elR, -0.5, 0.1);
    if (this.gun) { o.gx = lerp(o.gx, 1.3, 0.05); }
    this.apply(o);
    // pendulo invertido ate o chao
    if (!this.crumple || t > 0.3) {
      const lim = Math.PI / 2 - 0.1;
      this.omega += 9.0 * Math.sin(this.theta) * dt; this.theta += this.omega * dt;
      if (this.theta > lim) { this.theta = lim; this.omega = -Math.abs(this.omega) * 0.22; if (Math.abs(this.omega) < 0.15) this.omega = 0; }
    }
    Q.setFromAxisAngle(this.fallAxis, this.theta); this.root.quaternion.copy(Q).multiply(this.baseQ);
    const p = this.root.position; p.y = this.groundY(p.x, p.z) + 0.11 * Math.sin(this.theta);
    this.blobY = 0.02; this.blob.scale.set(1 + this.theta * 0.6, 1, 1 + this.theta * 0.6);
  }
}
function hit(g, part, actor, parent, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, HIT); o.position.set(x, y, z); o.userData = { actor, part }; parent.add(o); actor.hitboxes.push(o); return o; }
