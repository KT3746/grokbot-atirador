// Construcao procedural dos cenarios: cidade, montanha e deserto
import * as THREE from 'three';
import * as L_ from './life.js?v=1.5.0';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js?v=1.5.0';
import { rng, fbm, ridged, noise2, smooth, lerp, clamp } from './util.js?v=1.5.0';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });

// Ajusta UVs de uma caixa para repetir a textura pelo tamanho real
function boxUV(g, w, h, d, sx, sy, topSolid = false) {
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; let u = uv.getX(i), v = uv.getY(i);
    if (f === 2 || f === 3) { if (topSolid) { u = 0.01 + u * 0.01; v = 0.01 + v * 0.01; } else { u *= w / sx; v *= d / sx; } }
    else if (f < 2) { u *= d / sx; v *= h / sy; } else { u *= w / sx; v *= h / sy; }
    uv.setXY(i, u, v);
  }
  return g;
}

class Batch {
  constructor() { this.map = new Map(); }
  add(key, g, m) { if (!this.map.has(key)) this.map.set(key, { geos: [], mat: null }); const e = this.map.get(key); e.geos.push(g); return g; }
  box(key, w, h, d, x, y, z, ry = 0, sx = 4, sy = 4, topSolid = false) {
    const g = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, sx, sy, topSolid);
    if (ry) g.rotateY(ry); g.translate(x, y, z); return this.add(key, g);
  }
  geo(key, g, x, y, z, ry = 0, s = 1) { if (s !== 1) g.scale(s, s, s); if (ry) g.rotateY(ry); g.translate(x, y, z); return this.add(key, g); }
  build(scene, mats, colliders, surf = {}) {
    const out = [];
    for (const [key, e] of this.map) {
      const geom = mergeGeometries(e.geos.map(g => g.index ? g : g), false); if (!geom) continue;
      const m = new THREE.Mesh(geom, mats[key]); m.castShadow = true; m.receiveShadow = true; m.userData.surf = surf[key] || 'stone';
      scene.add(m); out.push(m); if (colliders && surf[key] !== 'none') colliders.push(m);
      e.geos.forEach(g => g.dispose());
    }
    return out;
  }
}

// Terreno em grade com interpolacao igual a da malha
class Terrain {
  constructor(size, seg, cx, cz, hfn, colfn, mat) {
    this.size = size; this.seg = seg; this.cx = cx; this.cz = cz; this.step = size / seg;
    const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, n = seg + 1; this.h = new Float32Array(n * n);
    // apos rotacao: x = ix*step - size/2, z = iy*step - size/2  (indice iy cresce com z)
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + cx, z = pos.getZ(i) + cz; const y = hfn(x, z); pos.setY(i, y); pos.setX(i, x); pos.setZ(i, z); this.h[i] = y; }
    g.computeVertexNormals();
    const nor = g.attributes.normal, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      colfn(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getY(i), c);
      // oclusao barata: vertices em concavidades ficam mais escuros
      const ix = i % n, iz = (i / n) | 0; let sum = 0, cnt = 0;
      for (let dz = -2; dz <= 2; dz += 2) for (let dx = -2; dx <= 2; dx += 2) { const a = ix + dx, b = iz + dz; if ((dx || dz) && a >= 0 && b >= 0 && a < n && b < n) { sum += this.h[a + n * b]; cnt++; } }
      const conc = cnt ? (sum / cnt - this.h[i]) / this.step : 0; const ao = 1 - clamp(conc * 0.9, 0, 0.4) + clamp(-conc * 0.25, 0, 0.08);
      col[i * 3] = c.r * ao; col[i * 3 + 1] = c.g * ao; col[i * 3 + 2] = c.b * ao;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 9, uv.getY(i) * size / 9);
    this.mesh = new THREE.Mesh(g, mat); this.mesh.receiveShadow = true; this.mesh.castShadow = false; this.mesh.userData.surf = 'dirt';
  }
  at(x, z) {
    const n = this.seg + 1, fx = (x - this.cx + this.size / 2) / this.step, fz = (z - this.cz + this.size / 2) / this.step;
    // PlaneGeometry: linha iy do array corresponde a z crescente apos rotateX(-PI/2)? y original = -(iy*step - size/2) -> z = -y
    const ix = clamp(Math.floor(fx), 0, this.seg - 1), iz = clamp(Math.floor(fz), 0, this.seg - 1);
    const u = clamp(fx - ix, 0, 1), v = clamp(fz - iz, 0, 1);
    const H = (a, b) => this.h[a + n * b];
    const ha = H(ix, iz), hb = H(ix, iz + 1), hc = H(ix + 1, iz + 1), hd = H(ix + 1, iz);
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }
}

function pineGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 3, 6); trunk.translate(0, 1.5, 0); parts.push([trunk, 0x4a3524]);
  for (let i = 0; i < 4; i++) { const c = new THREE.ConeGeometry(2.6 - i * 0.55, 3.6 - i * 0.4, 8); c.translate(0, 2.6 + i * 2.1, 0); parts.push([c, [0x1f3a24, 0x24442a, 0x2a4d2f, 0x2f5534][i]]); }
  const gs = parts.map(([g, col]) => { const c = new THREE.Color(col); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const k = 0.85 + Math.random() * 0.3; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; });
  return mergeGeometries(gs);
}
function leafyGeometry() {
  const trunk = new THREE.CylinderGeometry(0.15, 0.25, 3, 6); trunk.translate(0, 1.5, 0);
  const crown = new THREE.IcosahedronGeometry(2.2, 1); const p = crown.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + noise2(p.getX(i) * 1.3, p.getY(i) * 1.3 + p.getZ(i)) * 0.35; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k); } crown.translate(0, 4.4, 0); crown.deleteAttribute('uv'); trunk.deleteAttribute('uv');
  const tc = crown.index ? crown.toNonIndexed() : crown, tt = trunk.toNonIndexed();
  const colr = (g, c0) => { const c = new THREE.Color(c0); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const k = 0.8 + Math.random() * 0.35; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); };
  colr(tt, 0x5a4030); colr(tc, 0x3d6b33); const g = mergeGeometries([tt, tc]); g.computeVertexNormals(); return g;
}
function palmGeometry() {
  const gs = [];
  for (let i = 0; i < 6; i++) { const s = new THREE.CylinderGeometry(0.2 - i * 0.012, 0.24 - i * 0.012, 1.3, 7); s.translate(i * 0.12, 0.65 + i * 1.25, 0); gs.push([s, 0x7a5a3a]); }
  for (let k = 0; k < 8; k++) { const l = new THREE.BoxGeometry(3.4, 0.05, 0.7); l.translate(1.7, 0, 0); l.rotateZ(-0.45); l.rotateY(k / 8 * Math.PI * 2); l.translate(0.7, 7.6, 0); gs.push([l, 0x3f7a2e]); }
  const out = gs.map(([g, c0]) => { g.deleteAttribute('uv'); const ng = g.toNonIndexed(); const c = new THREE.Color(c0); const n = ng.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const k = 0.85 + Math.random() * 0.3; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; } ng.setAttribute('color', new THREE.BufferAttribute(a, 3)); return ng; });
  return mergeGeometries(out);
}
function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + fbm(x * 1.6 + seed, y * 1.6 + z, 3) * 0.7; p.setXYZ(i, x * k, y * k * 0.7, z * k); }
  g.computeVertexNormals(); return g;
}

function instanced(geo, mat, list, scene, shadow = true) {
  const im = new THREE.InstancedMesh(geo, mat, list.length); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  list.forEach((o, i) => { p.set(o.x, o.y, o.z); q.setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)); s.set(o.sx || o.s, o.sy || o.s, o.sz || o.s); m.compose(p, q, s); im.setMatrixAt(i, m); });
  im.castShadow = shadow; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im); return im;
}

// Bandeira dos Corvos Negros que mostra o vento
function makeFlag(scene, x, y, z, poleH = 7) {
  const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, poleH, 6), std({ color: 0x888888, metalness: 0.8, roughness: 0.4 })); pole.position.y = poleH / 2; pole.castShadow = true; g.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 12, 6), std({ map: T.flagTex(), side: THREE.DoubleSide, roughness: 1 }));
  cloth.geometry.translate(1.2, 0, 0); const holder = new THREE.Group(); holder.position.y = poleH - 0.8; holder.add(cloth); g.add(holder); cloth.castShadow = true;
  const base = cloth.geometry.attributes.position.array.slice();
  return {
    update(t, wind) {
      const ws = Math.hypot(wind.x, wind.z); holder.rotation.y = Math.atan2(-wind.z, wind.x);
      const p = cloth.geometry.attributes.position; const amp = 0.08 + ws * 0.04;
      for (let i = 0; i < p.count; i++) { const bx = base[i * 3], by = base[i * 3 + 1]; const k = bx / 2.4; p.setZ(i, Math.sin(bx * 2.6 - t * (3 + ws)) * amp * k + Math.sin(by * 3 + t * 2) * 0.03 * k); p.setY(i, by - k * k * Math.max(0, 0.5 - ws * 0.08)); }
      p.needsUpdate = true; cloth.geometry.computeVertexNormals();
    }
  };
}

// Particulas de poeira/neblina flutuando com o vento
function makeDrift(scene, count, area, center, color, size, opacity, yRange) {
  const g = new THREE.BufferGeometry(); const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { pos[i * 3] = center.x + (Math.random() - 0.5) * area; pos[i * 3 + 1] = yRange[0] + Math.random() * (yRange[1] - yRange[0]); pos[i * 3 + 2] = center.z + (Math.random() - 0.5) * area; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color, size, map: T.spriteTex('smoke'), transparent: true, opacity, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  return { update(dt, wind) { const p = g.attributes.position.array; for (let i = 0; i < count; i++) { p[i * 3] += wind.x * dt * 0.8; p[i * 3 + 2] += wind.z * dt * 0.8; if (p[i * 3] - center.x > area / 2) p[i * 3] -= area; if (p[i * 3] - center.x < -area / 2) p[i * 3] += area; if (p[i * 3 + 2] - center.z > area / 2) p[i * 3 + 2] -= area; if (p[i * 3 + 2] - center.z < -area / 2) p[i * 3 + 2] += area; } g.attributes.position.needsUpdate = true; } };
}

// ---------- AMBIENTE (ceu, sol, neblina, luz) ----------
export function setupEnvironment(scene, renderer, sp, mapId) {
  const sky = new Sky(); sky.scale.setScalar(2000); sky.material.depthWrite = false; sky.material.depthTest = false; sky.renderOrder = -10; sky.frustumCulled = false;
  const u = sky.material.uniforms; u.turbidity.value = sp.turb; u.rayleigh.value = sp.ray; u.mieCoefficient.value = 0.0032; u.mieDirectionalG.value = 0.8;
  const sun = new THREE.Vector3(); sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - sp.elev), THREE.MathUtils.degToRad(sp.azim)); u.sunPosition.value.copy(sun);
  scene.add(sky);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = sp.exposure;
  const pmrem = new THREE.PMREMGenerator(renderer); const sk = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000); sky2.material.uniforms.sunPosition.value.copy(sun); ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'].forEach(k => sky2.material.uniforms[k].value = u[k].value); sk.add(sky2);
  // cor da neblina = cor real do ceu no horizonte (amostrada)
  let horizon = null;
  try {
    const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType }); const hc = new THREE.PerspectiveCamera(20, 1, 1, 5000);
    hc.lookAt(Math.sin(THREE.MathUtils.degToRad(sp.look || 0)), Math.tan(THREE.MathUtils.degToRad(2.5)), -Math.cos(THREE.MathUtils.degToRad(sp.look || 0)));
    const tm = renderer.toneMapping; renderer.setRenderTarget(rt); renderer.render(sk, hc); const buf = new Uint16Array(16 * 16 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 16, 16, buf); renderer.setRenderTarget(null); rt.dispose();
    let r = 0, g = 0, b = 0; for (let i = 0; i < 256; i++) { r += THREE.DataUtils.fromHalfFloat(buf[i * 4]); g += THREE.DataUtils.fromHalfFloat(buf[i * 4 + 1]); b += THREE.DataUtils.fromHalfFloat(buf[i * 4 + 2]); }
    if (r + g + b > 0.01 && isFinite(r + g + b)) horizon = new THREE.Color().setRGB(r / 256, g / 256, b / 256);
  } catch (e) { horizon = null; }
  const env = pmrem.fromScene(sk, 0, 1, 30000); scene.environment = env.texture; pmrem.dispose(); sky2.material.dispose();
  const low = smooth(25, 0, sp.elev);
  const sunCol = new THREE.Color(0xffffff).lerp(new THREE.Color(0xffa060), low);
  const dir = new THREE.DirectionalLight(sunCol, lerp(3.2, 2.0, low) * (sp.night ? 0.6 : 1)); dir.position.copy(sun).multiplyScalar(500); dir.castShadow = true;
  const sc = dir.shadow.camera; sc.near = 10; sc.far = 2000; sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; dir.shadow.bias = -0.0004; dir.shadow.normalBias = 0.04;
  if (sp.dark) { const me = 38 * Math.PI / 180, ma = (sp.azim + 150) * Math.PI / 180; dir.position.set(Math.cos(me) * Math.sin(ma), Math.sin(me), -Math.cos(me) * Math.cos(ma)).multiplyScalar(500); dir.color.set(0x9fb4e0); dir.intensity = 0.55; }
  scene.add(dir); scene.add(dir.target);
  const hemi = new THREE.HemisphereLight(sp.night ? 0x6070a0 : 0xbcd2ee, mapId === 'deserto' ? 0xb08a5a : 0x5a5040, sp.night ? 0.35 : 0.45); scene.add(hemi);
  scene.environmentIntensity = sp.dark ? 0.22 : sp.night ? 0.45 : 0.8; if (sp.dark) { hemi.intensity = 0.2; hemi.color.set(0x405080); }
  let fogC = new THREE.Color(0xb7c9da).lerp(new THREE.Color(0xd9a07a), low);
  if (sp.night) fogC.lerp(new THREE.Color(0x3a3a55), 0.5);
  if (horizon) fogC = horizon.multiplyScalar(sp.fogMul || 0.92);
  if (sp.fogTint != null) fogC.lerp(new THREE.Color(sp.fogTint), 0.35);
  if (sp.dark) fogC = new THREE.Color(0x0c1018).lerp(fogC, 0.3);
  scene.fog = new THREE.FogExp2(fogC, sp.fog);
  return { sky, sun, dir, hemi, env, sunDir: sun.clone() };
}

// ---------- CIDADE ----------
function buildCity(scene, q, sp) {
  const r = rng(77); const colliders = []; const B = new Batch(); const night = !!sp.night;
  const facs = ['concrete', 'brick', 'glass', 'light'];
  const mats = {};
  facs.forEach((f, i) => { const t = T.facade(f, i + 1); mats['f' + f] = std({ map: t.map, normalMap: q === 'baixa' ? null : t.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), emissiveMap: t.emissiveMap, emissive: new THREE.Color(0xffffff), emissiveIntensity: night ? 1.6 : (sp.elev < 12 ? 0.25 : 0), roughness: f === 'glass' ? 0.25 : 0.85, metalness: f === 'glass' ? 0.6 : 0 }); });
  const conc = T.groundSet('concrete'); mats.roof = std({ map: conc.map, normalMap: conc.normalMap, color: 0x9a9690 });
  mats.metal = std({ map: T.metalTex().map, metalness: 0.7, roughness: 0.45 });
  const tl = T.tilesTex(); mats.walk = std({ map: tl.map, roughness: 0.9 });
  mats.dark = std({ color: 0x2b3038, roughness: 0.8 });
  mats.stone = std({ color: 0xb8b0a0, map: conc.map, roughness: 0.8 });
  const surf = { metal: 'metal', fglass: 'metal' };
  // chao
  const asp = T.groundSet('asphalt'); asp.map.repeat.set(300, 300); asp.normalMap.repeat.set(300, 300);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), std({ map: asp.map, normalMap: asp.normalMap, color: 0x9a9a9a })); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.3, -600); ground.receiveShadow = true; scene.add(ground);
  const road = T.roadTex(); const roadMat = std({ map: road.map, normalMap: road.normalMap, roughness: 0.85 });
  const roadMeshes = [];
  for (let i = -4; i <= 4; i++) { const w = i === 0 ? 26 : 18; const g = new THREE.PlaneGeometry(w, 1100); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * 1100 / w); g.rotateX(-Math.PI / 2); g.translate(i * 70, 0.02, -450); roadMeshes.push(g); }
  for (let j = 0; j <= 8; j++) { const g = new THREE.PlaneGeometry(18, 700); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * 700 / 18); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.translate(0, 0.1, -j * 70); roadMeshes.push(g); }
  const roads = new THREE.Mesh(mergeGeometries(roadMeshes), roadMat); roads.receiveShadow = true; scene.add(roads);
  if (sp.weather === 'rain') { for (const m of [roadMat, mats.walk, mats.roof]) { m.roughness = 0.28; m.metalness = 0.12; m.envMapIntensity = 2.2; m.color.multiplyScalar(0.72); } }
  const anchors = {}; const plaza = { x0: -61, x1: 61, z0: -271, z1: -149 };
  const tall = { '1,4': 30, '-2,5': 38 };
  const detail = q === 'baixa' ? 0.4 : q === 'media' ? 0.7 : 1;
  const roofTops = [];
  for (let i = -5; i <= 4; i++) for (let j = 0; j <= 9; j++) {
    const cx = i * 70 + 35, cz = -(j * 70 + 35);
    if (cx > plaza.x0 && cx < plaza.x1 && cz > plaza.z0 && cz < plaza.z1) continue;
    if (Math.abs(cx) < 40 && j === 0) { /* quarteirao do jogador */ }
    B.box('walk', 52, 0.2, 52, cx, 0.1, cz, 0, 4, 4);
    const key = i + ',' + j;
    const far = j >= 6 || Math.abs(i) >= 4;
    let h;
    if (tall[key]) h = tall[key]; else if (j <= 1) h = 7 + r() * 8; else if (far) h = 25 + r() * (j >= 7 ? 90 : 50); else h = 10 + r() * 12 + (j - 2) * 3;
    const split = !tall[key] && r() < 0.45 && !far;
    const parts = split ? [[-12, -12, 24], [12, -12, 24], [-12, 12, 24], [12, 12, 24]].filter(() => r() < 0.85) : [[0, 0, tall[key] ? 36 : 44 + r() * 4]];
    parts.forEach(([ox, oz, s]) => {
      const hh = split ? h * (0.6 + r() * 0.6) : h; const f = facs[Math.floor(r() * facs.length)];
      const w = s - r() * 3, d = s - r() * 3, x = cx + ox, z = cz + oz;
      B.box('f' + f, w, hh, d, x, 0.2 + hh / 2, z, 0, 14, 13, true);
      B.box('roof', w, 0.3, d, x, 0.2 + hh + 0.12, z, 0, 6, 6);
      [[0, d / 2], [0, -d / 2]].forEach(([a, b]) => B.box('roof', w, 1, 0.3, x + a, 0.2 + hh + 0.5, z + b, 0, 6, 6));
      [[w / 2, 0], [-w / 2, 0]].forEach(([a, b]) => B.box('roof', 0.3, 1, d, x + a, 0.2 + hh + 0.5, z + b, 0, 6, 6));
      roofTops.push({ x, z, y: 0.2 + hh + 0.27, w, d });
      if (tall[key]) { anchors[key === '1,4' ? 'telhadoA' : 'telhadoB'] = { x, z, y: 0.2 + hh + 0.27 }; }
      if (r() < 0.8 * detail && !tall[key]) { const n = 1 + Math.floor(r() * 3); for (let k = 0; k < n; k++) B.box('metal', 2 + r() * 2, 1.2 + r(), 1.5 + r() * 2, x + (r() - 0.5) * (w - 6), 0.2 + hh + 0.9, z + (r() - 0.5) * (d - 6), 0, 2, 2); }
      if (r() < 0.35 * detail && !tall[key]) { const g = new THREE.CylinderGeometry(1.6, 1.6, 3, 12); B.geo('metal', g, x + (r() - 0.5) * (w - 8), 0.2 + hh + 2.2, z + (r() - 0.5) * (d - 8)); }
      if (tall[key]) { B.box('metal', 3, 2, 2, x - w / 2 + 3, 0.2 + hh + 1.2, z - d / 2 + 3, 0, 2, 2); const g = new THREE.CylinderGeometry(0.06, 0.06, 8, 5); B.geo('metal', g, x + w / 2 - 2, 0.2 + hh + 4, z - d / 2 + 2); }
    });
  }
  // predio do jogador
  B.box('fconcrete', 24, 62, 24, 0, 31, 30, 0, 14, 13, true); B.box('roof', 24, 0.3, 24, 0, 62.15, 30, 0, 6, 6);
  B.box('roof', 24, 0.6, 0.4, 0, 62.4, 18.2, 0, 6, 6); B.box('roof', 0.4, 1.0, 24, 12, 62.6, 30); B.box('roof', 0.4, 1.0, 24, -12, 62.6, 30);
  B.box('metal', 3, 1.6, 2, 7, 63.1, 26, 0, 2, 2); B.box('metal', 2, 1.2, 2, -8, 62.9, 28, 0, 2, 2);
  // praca central
  anchors.praca = { x: 0, z: -210, y: 0.15 }; anchors.avenida = { x: 0, z: -280, y: 0.04 };
  B.box('walk', 122, 0.15, 122, 0, 0.075, -210, 0, 4, 4);
  const fx = 0, fz = -258; B.geo('stone', new THREE.CylinderGeometry(7, 7.4, 0.8, 28), fx, 0.55, fz); B.geo('stone', new THREE.CylinderGeometry(1, 1.4, 3, 12), fx, 1.6, fz); B.geo('stone', new THREE.CylinderGeometry(2.6, 1.2, 0.5, 16), fx, 3.2, fz);
  const water = new THREE.Mesh(new THREE.CircleGeometry(6.6, 28), new THREE.MeshStandardMaterial({ color: 0x2a5a70, roughness: 0.05, metalness: 0.3 })); water.rotation.x = -Math.PI / 2; water.position.set(fx, 0.9, fz); scene.add(water);
  B.box('stone', 2, 9, 2, 40, 4.6, -250, 0.4, 2, 2); B.geo('stone', new THREE.ConeGeometry(1.4, 2.5, 4), 40, 10.3, -250, 0.4 + Math.PI / 4);
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; B.box('dark', 2, 0.5, 0.6, Math.cos(a) * 55 * 0.5 + (k % 2 ? 30 : -30), 0.5, -210 + Math.sin(a) * 25, a, 2, 2); }
  const trees = []; for (let k = 0; k < 16; k++) { const s = k / 16; const side = k % 4; const t = ((k >> 2) + 0.5) / 4; const p = side === 0 ? [-57 + t * 114, -153] : side === 1 ? [57, -153 - t * 114] : side === 2 ? [57 - t * 114, -267] : [-57, -267 + t * 114]; trees.push({ x: p[0], y: 0.15, z: p[1], s: 0.9 + r() * 0.4, ry: r() * 6 }); }
  const tmat = std({ vertexColors: true, roughness: 0.9 });
  const tm = instanced(leafyGeometry(), tmat, trees, scene); tm.userData.surf = 'wood';
  // postes e carros
  const lampPos = []; for (let z = 0; z > -700; z -= 32) { lampPos.push({ x: -14, y: 0, z, s: 1 }); lampPos.push({ x: 14, y: 0, z: z - 16, s: 1, ry: Math.PI }); }
  const lampG = (() => { const a = new THREE.CylinderGeometry(0.1, 0.14, 8, 6); a.translate(0, 4, 0); const b = new THREE.BoxGeometry(2, 0.12, 0.12); b.translate(1, 7.9, 0); return mergeGeometries([a, b]); })();
  instanced(lampG, std({ color: 0x3a3d40, metalness: 0.7, roughness: 0.5 }), lampPos, scene);
  const headG = new THREE.BoxGeometry(0.7, 0.18, 0.35); headG.translate(1.8, 7.8, 0);
  instanced(headG, new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd9a0, emissiveIntensity: night ? 6 : 0.2 }), lampPos, scene, false);
  const lampHeads = lampPos.map(l => ({ x: l.x + (l.ry ? -1.8 : 1.8), y: 7.7, z: l.z }));
  const carG = (() => { const a = new THREE.BoxGeometry(1.9, 0.75, 4.4); a.translate(0, 0.7, 0); const b = new THREE.BoxGeometry(1.7, 0.6, 2.3); b.translate(0, 1.35, -0.2); return mergeGeometries([a, b]); })();
  const cars = []; for (let k = 0; k < 70 * detail; k++) { const onAve = r() < 0.5; const lane = onAve ? (r() < 0.5 ? -10 : 10) : (Math.floor(r() * 8) - 4) * 70 + (r() < 0.5 ? -7 : 7); let z = -40 - r() * 600; if (onAve && z < -140 && z > -280) z -= 160; if (!onAve && z < -150 && z > -275 && Math.abs(lane) < 70) continue; cars.push({ x: lane, y: 0.03, z, s: 1, ry: (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.1 }); }
  const carMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.1 });
  const ci = instanced(carG, carMat, cars, scene); const cc = [0x8a1c1c, 0x1c3a6a, 0xdedede, 0x222222, 0x6a6a6a, 0x2a5a3a, 0xc8a040, 0x5a2a5a]; cars.forEach((c, i) => ci.setColorAt(i, new THREE.Color(cc[Math.floor(r() * cc.length)]))); ci.userData.surf = 'metal'; colliders.push(ci);
  const wheelG = new THREE.CylinderGeometry(0.36, 0.36, 2.0, 10); wheelG.rotateZ(Math.PI / 2); const wl = []; cars.forEach(c => { [1.35, -1.35].forEach(o => wl.push({ x: c.x + Math.sin(c.ry) * o, y: 0.38, z: c.z + Math.cos(c.ry) * o, s: 1, ry: c.ry })); }); instanced(wheelG, std({ color: 0x111111, roughness: 0.8 }), wl, scene);
  // horizonte distante
  const sk = []; for (let k = 0; k < 120; k++) { const a = -Math.PI * 0.95 + r() * Math.PI * 0.9 - Math.PI / 2 + Math.PI / 2; const d = 900 + r() * 500; const x = Math.sin(a) * d, z = -Math.abs(Math.cos(a)) * d - 200; sk.push({ x, y: 0, z, sx: 30 + r() * 40, sy: 40 + r() * 160, sz: 30 + r() * 40 }); }
  const skyG = new THREE.BoxGeometry(1, 1, 1); skyG.translate(0, 0.5, 0); instanced(skyG, std({ map: T.facade('glass', 9).map, emissiveMap: T.facade('glass', 9).emissiveMap, emissive: 0xffffff, emissiveIntensity: night ? 1.2 : 0, color: 0x8899aa }), sk, scene, false);
  B.build(scene, mats, colliders, surf);
  const flags = [makeFlag(scene, anchors.telhadoA.x - 10, anchors.telhadoA.y, anchors.telhadoA.z + 10, 6), makeFlag(scene, 40, 0.15, -170, 9)];
  const groundAt = (x, z) => (x > plaza.x0 && x < plaza.x1 && z > plaza.z0 && z < plaza.z1) ? 0.15 : 0.04;
  return { anchors, colliders, groundAt, flags, drift: [], roofTops, lampHeads, player: { pos: new THREE.Vector3(0, 63.5, 19.0), yaw: 0, pitch: -0.2 }, focus: new THREE.Vector3(0, 0, -230), env: 'cidade' };
}

// ---------- MONTANHA ----------
function buildMountain(scene, q, sp) {
  const r = rng(91); const colliders = []; const B = new Batch();
  const camp = { x: 30, z: -260 }, radio = { x: -150, z: -500 };
  const flat = (x, z, cx, cz, r0) => 1 - smooth(r0 * 0.55, r0, Math.hypot(x - cx, z - cz));
  const base = (x, z) => 8 + fbm(x * 0.004, z * 0.004, 4) * 30;
  const campH = base(camp.x, camp.z);
  const H = (x, z) => {
    let h = base(x, z);
    const rr = ridged(x * 0.0028 + 5, z * 0.0028, 5);
    const cc = clamp((z + 70) / 70, 0, 1); h += 92 * (0.7 * Math.pow(cc, 0.6) + 0.3 * cc * cc * (3 - 2 * cc)) * (1 - smooth(60, 160, Math.abs(x)) * 0.3);
    const fz = smooth(-430, -1100, z), sx = smooth(230, 700, Math.abs(x));
    h += fz * (170 + 300 * rr) + sx * (110 + 220 * rr) * (1 - fz * 0.5);
    const pd = Math.hypot(x, z - 10);
    h += 7 * fbm(x * 0.03, z * 0.03, 3) * smooth(20, 70, pd);
    const hill = 76 * Math.exp(-((x - radio.x) ** 2 + (z - radio.z) ** 2) / (85 * 85)); h += hill;
    const topH = base(radio.x, radio.z) + 76 + smooth(-430, -1100, radio.z) * (170 + 300 * ridged(radio.x * 0.0028 + 5, radio.z * 0.0028, 5));
    h = lerp(h, topH, flat(x, z, radio.x, radio.z, 32));
    h = lerp(h, campH, flat(x, z, camp.x, camp.z, 85));
    const road = 1 - smooth(5, 12, Math.abs(z + 335));
    if (road > 0 && Math.abs(x) < 600) h = lerp(h, Math.max(campH - 1, base(x, -335) * 0.6 + campH * 0.4), road * (1 - smooth(260, 400, Math.abs(x))));
    return h;
  };
  const det = T.groundSet('detail'); const rock = T.groundSet('rock');
  const tmat = std({ vertexColors: true, map: det.map, normalMap: rock.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95 });
  const seg = q === 'baixa' ? 150 : q === 'media' ? 200 : 260;
  const cg = new THREE.Color(0x4f6b38), cr = new THREE.Color(0x7d7468), cs = new THREE.Color(0xf2f5f8), cd = new THREE.Color(0x7a6448);
  const terr = new Terrain(2800, seg, 0, -700, H, (x, y, z, ny, c) => {
    const n = fbm(x * 0.02, z * 0.02, 3);
    c.copy(cg).lerp(new THREE.Color(0x6b7a3a), clamp(n + 0.5, 0, 1) * 0.6);
    c.lerp(cr, smooth(0.86, 0.7, ny)); c.lerp(cs, smooth(200, 260, y + n * 40) * smooth(0.55, 0.75, ny));
    const road = 1 - smooth(4, 8, Math.abs(z + 335)); if (Math.abs(x) < 400) c.lerp(cd, road);
    c.lerp(cd, flat(x, z, camp.x, camp.z, 55) * 0.7);
  }, tmat);
  scene.add(terr.mesh);
  const groundAt = (x, z) => terr.at(x, z);
  // pinheiros
  const nTrees = q === 'baixa' ? 500 : q === 'media' ? 1100 : 1800; const trees = [];
  for (let k = 0, tries = 0; k < nTrees && tries < nTrees * 6; tries++) {
    const x = (r() - 0.5) * 1500, z = -40 - r() * 1000; const y = groundAt(x, z);
    if (y > 210 || y < 2) continue; if (Math.hypot(x - camp.x, z - camp.z) < 95) continue; if (Math.hypot(x - radio.x, z - radio.z) < 45) continue; if (Math.abs(z + 335) < 12 && Math.abs(x) < 450) continue;
    if (z > -150 && Math.abs(x) < 120) continue;
    const ny = (groundAt(x + 2, z) - groundAt(x - 2, z)) ** 2 + (groundAt(x, z + 2) - groundAt(x, z - 2)) ** 2; if (ny > 9) continue;
    const s = 0.8 + r() * 0.9; trees.push({ x, y: y - 0.3, z, s, sy: s * (0.9 + r() * 0.4), ry: r() * 6 }); k++;
  }
  const pm = instanced(pineGeometry(), std({ vertexColors: true, roughness: 0.95 }), trees, scene); pm.userData.surf = 'wood'; colliders.push(pm);
  const rocks = []; for (let k = 0; k < (q === 'baixa' ? 60 : 160); k++) { const x = (r() - 0.5) * 900, z = -30 - r() * 700; if (Math.hypot(x - camp.x, z - camp.z) < 60) continue; rocks.push({ x, y: groundAt(x, z) + 0.2, z, s: 1 + r() * 3.5, ry: r() * 6 }); }
  const rm = instanced(rockGeometry(2), std({ color: 0x8a8378, map: T.groundSet('rock').map, normalMap: rock.normalMap, roughness: 0.95 }), rocks, scene); rm.userData.surf = 'stone'; colliders.push(rm);
  // pedras na frente do jogador
  const near = [{ x: -3.8, y: groundAt(-3.8, 2.5) - 0.3, z: 2.5, s: 1.4, sy: 0.9 }, { x: 4.4, y: groundAt(4.4, 3.5) - 0.3, z: 3.5, s: 1.7, sy: 1 }, { x: -7, y: groundAt(-7, 8), z: 8, s: 2.4 }];
  instanced(rockGeometry(7), std({ color: 0x8c857a, map: T.groundSet('rock').map, normalMap: rock.normalMap }), near, scene);
  // acampamento
  const mats = { wood: std({ map: T.woodTex().map, color: 0xb08860 }), tent: std({ map: T.fabricTex('#5e6447').map, side: THREE.DoubleSide }), metal: std({ map: T.metalTex('#4a5a3a').map, metalness: 0.5, roughness: 0.55 }), dark: std({ color: 0x222222 }), log: std({ color: 0x6a4a30, map: T.woodTex().map }) };
  const cy = campH;
  const tent = (x, z, ry) => { const g = new THREE.CylinderGeometry(0.01, 2.6, 2.4, 4, 1, true); g.rotateY(Math.PI / 4); g.scale(1.6, 1, 1); B.geo('tent', g, x, cy + 1.2, z, ry); };
  tent(camp.x - 20, camp.z - 25, 0.2); tent(camp.x + 18, camp.z - 22, -0.3); tent(camp.x - 34, camp.z + 2, 1.2);
  B.box('log', 10, 3.6, 7, camp.x - 14, cy + 1.8, camp.z - 10 - 6, 0, 3, 3); const roof = new THREE.CylinderGeometry(0.01, 6.2, 2.2, 4); roof.rotateY(Math.PI / 4); roof.scale(1.15, 1, 0.8); B.geo('wood', roof, camp.x - 14, cy + 4.7, camp.z - 16);
  for (let k = 0; k < 6; k++) B.box('wood', 1.1, 1.1, 1.1, camp.x + 10 + (k % 3) * 1.2, cy + 0.55 + Math.floor(k / 3) * 1.1, camp.z - 6, 0, 1.1, 1.1);
  for (let k = 0; k < 4; k++) B.geo('metal', new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10), camp.x + 22 + k * 0.9, cy + 0.6, camp.z + 4);
  // caminhao na estrada
  const tx = camp.x + 34, tz = -333; B.box('metal', 2.5, 2.4, 3, tx, cy + 1.6, tz, Math.PI / 2, 2, 2); B.box('tent', 2.5, 2.8, 5.5, tx - 4.2, cy + 1.9, tz, Math.PI / 2, 3, 3); B.box('dark', 2.6, 0.8, 9, tx - 2, cy + 0.6, tz, Math.PI / 2, 3, 3);
  const fire = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 })); fire.position.set(camp.x + 1, cy + 0.4, camp.z + 5); fire.scale.y = 1.4; scene.add(fire);
  for (let k = 0; k < 5; k++) B.box('log', 0.25, 0.25, 1.4, camp.x + 1, cy + 0.15, camp.z + 5, k * 1.2, 1, 1);
  // posto de radio
  const ry = groundAt(radio.x, radio.z); anchors_m = { acampamento: { x: camp.x, z: camp.z, y: null }, radio: { x: radio.x, z: radio.z, y: null } };
  B.box('metal', 5, 2.8, 4, radio.x - 6, ry + 1.4, radio.z - 8, 0.3, 2, 2);
  B.geo('metal', new THREE.CylinderGeometry(0.12, 0.25, 22, 6), radio.x + 6, ry + 11, radio.z - 5);
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; B.box('tent', 1.2, 0.5, 0.6, radio.x + Math.cos(a) * 19, ry + 0.25, radio.z + Math.sin(a) * 19, -a, 1, 1); }
  B.build(scene, mats, colliders, { tent: 'dirt', log: 'wood', wood: 'wood', metal: 'metal' });
  const flags = [makeFlag(scene, camp.x + 4, cy, camp.z - 2, 7), makeFlag(scene, radio.x + 3, ry, radio.z + 3, 6)];
  const drift = [makeDrift(scene, q === 'baixa' ? 40 : 90, 600, new THREE.Vector3(0, 0, -300), sp.dark ? 0x2a3242 : sp.night ? 0x8a92a8 : 0xe8eef2, 60, sp.dark ? 0.05 : sp.fog > 0.002 ? 0.22 : 0.08, [campH + 4, campH + 40])];
  const py = groundAt(0, 1.5) + 1.5;
  return { anchors: anchors_m, colliders, groundAt, flags, drift, fire, player: { pos: new THREE.Vector3(0, py, 1.5), yaw: 0.05, pitch: -0.3 }, focus: new THREE.Vector3(camp.x, campH, camp.z), env: 'montanha' };
}
let anchors_m = null;

// ---------- DESERTO ----------
function buildDesert(scene, q, sp) {
  const r = rng(55); const colliders = []; const B = new Batch();
  const vila = { x: 0, z: -300 }, forte = { x: 180, z: -560 };
  const flat = (x, z, cx, cz, r0) => 1 - smooth(r0 * 0.6, r0, Math.hypot(x - cx, z - cz));
  const H = (x, z) => {
    let h = 3 + 7 * Math.sin(x * 0.018 + 2.5 * fbm(x * 0.002, z * 0.002, 2)) * Math.sin(z * 0.011 + 1) + 10 * fbm(x * 0.003, z * 0.003, 4) + 2.5 * fbm(x * 0.02, z * 0.02, 2);
    const pd = Math.hypot(x, (z - 14) * 1.2);
    const mesa = 50 * (1 - smooth(16, 40, pd)) + 3 * fbm(x * 0.1, z * 0.1, 2) * smooth(14, 30, pd);
    h = Math.max(h, mesa + 2 * (1 - smooth(10, 20, pd)) * 0);
    const fh = 10 * Math.exp(-((x - forte.x) ** 2 + (z - forte.z) ** 2) / (90 * 90));
    h += fh;
    h = lerp(h, 2, flat(x, z, vila.x, vila.z, 110));
    h = lerp(h, 13, flat(x, z, forte.x, forte.z, 55));
    [[-420, -950, 110, 120], [380, -1000, 140, 150], [-80, -1300, 200, 180], [700, -700, 90, 100], [-750, -650, 100, 120]].forEach(([mx, mz, mr, mh]) => { const ang = Math.atan2(z - mz, x - mx); const rr = mr * (1 + 0.22 * noise2(Math.cos(ang) * 1.7 + mx * 0.01, Math.sin(ang) * 1.7 + mz * 0.01) + 0.08 * noise2(Math.cos(ang) * 6, Math.sin(ang) * 6)); const d = Math.hypot(x - mx, z - mz); const k = 1 - smooth(rr * 0.82, rr, d); const ter = Math.floor(k * 4) / 4 * 0.25 + k * 0.75; h = Math.max(h, mh * ter + fbm(x * 0.02, z * 0.02, 3) * 10 * k); });
    return h;
  };
  const sand = T.groundSet('sand');
  const tmat = std({ vertexColors: true, map: T.groundSet('detail').map, normalMap: sand.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 1 });
  const seg = q === 'baixa' ? 150 : q === 'media' ? 200 : 250;
  const cS = new THREE.Color(0xd9b07a), cR = new THREE.Color(0xa86a44), cD = new THREE.Color(0xc29a6a);
  const strata = [new THREE.Color(0xa45a38), new THREE.Color(0xc07a48), new THREE.Color(0x8a4a30), new THREE.Color(0xd09a68)];
  const terr = new Terrain(3000, seg, 0, -700, H, (x, y, z, ny, c) => { const n = fbm(x * 0.01, z * 0.01, 3); c.copy(cS).lerp(new THREE.Color(0xe8c48c), clamp(n + 0.5, 0, 1) * 0.5); c.lerp(cR, smooth(0.9, 0.6, ny)); if (y > 25 && Math.hypot(x, z) > 60) c.lerp(strata[Math.floor(y / 9 + n * 2) & 3], 0.75); c.lerp(cD, flat(x, z, vila.x, vila.z, 80) * 0.5); }, tmat);
  scene.add(terr.mesh); const groundAt = (x, z) => terr.at(x, z);
  const mud = std({ map: T.brickTex().map, roughness: 0.95 });
  const mats = { mud, mudp: std({ color: 0xc9a27a, map: T.brickTex().map }), wood: std({ map: T.woodTex().map }), tent: std({ map: T.fabricTex('#c8b48a', true).map, side: THREE.DoubleSide }), metal: std({ map: T.metalTex('#7a6a50').map, metalness: 0.5, roughness: 0.5 }), drum: std({ map: T.metalTex('#2a5a7a').map, metalness: 0.6, roughness: 0.4 }), rock: std({ color: 0xa36a48, map: T.groundSet('rock').map }) };
  const gy = 2;
  // muros da vila (frente com portao)
  const wall = (x0, z0, x1, z1, h = 3) => { const L = Math.hypot(x1 - x0, z1 - z0); B.box('mud', L, h, 0.8, (x0 + x1) / 2, gy + h / 2, (z0 + z1) / 2, -Math.atan2(z1 - z0, x1 - x0), 3, 3); };
  const vx = vila.x, vz = vila.z;
  wall(vx - 35, vz + 35, vx - 6, vz + 35); wall(vx + 6, vz + 35, vx + 35, vz + 35); wall(vx - 35, vz - 35, vx + 35, vz - 35); wall(vx - 35, vz + 35, vx - 35, vz - 35); wall(vx + 35, vz + 35, vx + 35, vz - 35);
  const house = (x, z, w, d, h) => { B.box('mudp', w, h, d, x, gy + h / 2, z, 0, 4, 4); B.box('mud', w + 0.4, 0.6, d + 0.4, x, gy + h + 0.3, z, 0, 4, 4); B.box('wood', 1.2, 2.2, 0.15, x, gy + 1.1, z + d / 2 + 0.05, 0, 1, 2); B.box('wood', 1, 1, 0.12, x + w / 3, gy + h * 0.6, z + d / 2 + 0.05, 0, 1, 1); };
  house(vx - 22, vz - 22, 12, 10, 4.5); house(vx + 22, vz - 22, 12, 10, 6.5); house(vx - 24, vz + 18, 10, 8, 4);
  const anchors = { vila: { x: vx, z: vz, y: null }, casaAlta: { x: vx + 22, z: vz - 22, y: gy + 6.5 + 0.6 }, forte: { x: forte.x, z: forte.z, y: null }, torre: { x: forte.x - 17, z: forte.z - 17, y: 13 + 8.6 } };
  // caixa d'agua
  const wt = [vx + 25, vz + 20]; [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]].forEach(([a, b]) => B.box('wood', 0.25, 7, 0.25, wt[0] + a, gy + 3.5, wt[1] + b, 0, 1, 2)); B.geo('metal', new THREE.CylinderGeometry(2.4, 2.4, 3, 14), wt[0], gy + 8.5, wt[1]);
  const tentD = (x, z, ry) => { const g = new THREE.CylinderGeometry(0.01, 3.4, 3, 4, 1, true); g.rotateY(Math.PI / 4); g.scale(1.5, 1, 1); B.geo('tent', g, x, gy + 1.5, z, ry); };
  tentD(vx - 72, vz - 30, 0.3); tentD(vx + 58, vz - 22, -0.2); tentD(vx - 48, vz - 60, 0.8);
  for (let k = 0; k < 8; k++) B.geo('drum', new THREE.CylinderGeometry(0.42, 0.42, 1.3, 12), vx + 10 + (k % 4) * 0.95, gy + 0.65, vz + 28 + Math.floor(k / 4));
  for (let k = 0; k < 6; k++) B.box('wood', 1.2, 1.2, 1.2, vx - 12 + (k % 3) * 1.3, gy + 0.6 + Math.floor(k / 3) * 1.2, vz - 30, 0, 1.2, 1.2);
  const truck = (x, z, ry) => { B.box('metal', 2.4, 2.2, 2.6, x + Math.sin(ry) * 3, gy + 1.5, z + Math.cos(ry) * 3, ry, 2, 2); B.box('tent', 2.5, 2.6, 5, x - Math.sin(ry) * 1, gy + 1.8, z - Math.cos(ry) * 1, ry, 3, 3); };
  truck(vx - 50, vz + 45, 0.4); truck(vx + 45, vz + 50, -0.8);
  // forte (muro baixo na frente)
  const fy = 13; const fwall = (x0, z0, x1, z1, h) => { const L = Math.hypot(x1 - x0, z1 - z0); B.box('mud', L, h, 1, (x0 + x1) / 2, fy + h / 2 - 0.3, (z0 + z1) / 2, -Math.atan2(z1 - z0, x1 - x0), 3, 3); };
  const fx = forte.x, fz = forte.z;
  fwall(fx - 20, fz - 20, fx + 20, fz - 20, 4); fwall(fx - 20, fz + 20, fx - 20, fz - 20, 3.5); fwall(fx + 20, fz + 20, fx + 20, fz - 20, 3.5); fwall(fx - 20, fz + 20, fx - 4, fz + 20, 1.1); fwall(fx + 4, fz + 20, fx + 20, fz + 20, 1.1);
  B.box('mudp', 6, 8.6, 6, fx - 17, fy + 4.3 - 0.3, fz - 17, 0, 3, 3); [[0, 3], [0, -3], [3, 0], [-3, 0]].forEach(([a, b]) => B.box('mud', a ? 0.4 : 6, 1, b ? 0.4 : 6, fx - 17 + a, fy + 8.8, fz - 17 + b, 0, 3, 3));
  B.box('mudp', 10, 4, 8, fx + 6, fy + 1.7, fz - 12, 0, 3, 3);
  // palmeiras
  const palms = []; for (let k = 0; k < (q === 'baixa' ? 10 : 22); k++) { const a = r() * 6.28, d = 45 + r() * 40; const x = vx + Math.cos(a) * d, z = vz + Math.sin(a) * d; if (z > vz + 38 && Math.abs(x) < 40) continue; palms.push({ x, y: groundAt(x, z) - 0.2, z, s: 0.9 + r() * 0.4, ry: r() * 6 }); }
  const pi = instanced(palmGeometry(), std({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), palms, scene); pi.userData.surf = 'wood'; colliders.push(pi);
  const rocks = []; for (let k = 0; k < (q === 'baixa' ? 40 : 110); k++) { const x = (r() - 0.5) * 1000, z = -60 - r() * 800; if (Math.hypot(x - vx, z - vz) < 70 || Math.hypot(x - fx, z - fz) < 50) continue; rocks.push({ x, y: groundAt(x, z), z, s: 0.8 + r() * 3, ry: r() * 6 }); }
  const rm = instanced(rockGeometry(4), mats.rock, rocks, scene); rm.userData.surf = 'stone'; colliders.push(rm);
  const near = [{ x: -3.8, y: groundAt(-3.8, 5) - 0.2, z: 5, s: 1.5, sy: 0.8 }, { x: 4.2, y: groundAt(4.2, 6) - 0.2, z: 6, s: 1.8, sy: 0.9 }];
  instanced(rockGeometry(9), mats.rock, near, scene);
  B.build(scene, mats, colliders, { mud: 'stone', mudp: 'stone', wood: 'wood', tent: 'dirt', metal: 'metal', drum: 'metal' });
  const flags = [makeFlag(scene, vx - 30, gy, vz + 30, 8), makeFlag(scene, fx - 17, fy + 8.6, fz - 17, 5)];
  const drift = [makeDrift(scene, q === 'baixa' ? 60 : 160, 500, new THREE.Vector3(0, 0, -300), 0xe2c08a, 3, 0.25, [1, 14])];
  const py = groundAt(0, 3) + 1.5;
  return { anchors, colliders, groundAt, flags, drift, player: { pos: new THREE.Vector3(0, py, 3), yaw: 0, pitch: -0.12 }, focus: new THREE.Vector3(vx, gy, vz), env: 'deserto' };
}

export function buildWorld(mapId, scene, quality, sp, sunDir) {
  const w = mapId === 'montanha' ? buildMountain(scene, quality, sp) : mapId === 'deserto' ? buildDesert(scene, quality, sp) : buildCity(scene, quality, sp);
  addLife(w, mapId, scene, quality, sp, sunDir || new THREE.Vector3(0, 1, 0));
  return w;
}

// Vida e detalhes extras do cenario (nuvens, passaros, fumaca, grama, sombra de contato)
function addLife(w, mapId, scene, q, sp, sunDir) {
  const L = []; const ga = w.groundAt;
  L.push(L_.makeClouds(scene, sp, sunDir));
  if (sp.dark) L.push(L_.makeStars(scene, q));
  if (sp.weather === 'rain') L.push(L_.makeRain(scene, q));
  if (sp.weather === 'rain') L.push(L_.makeSplashes(scene, q));
  if (sp.night && w.lampHeads) { const lg = L_.makeLampGlow(scene, w.lampHeads, sp.weather === 'rain'); if (lg) L.push(lg); }
  if (sp.weather === 'sand') L.push(L_.makeSand(scene, q));
  if (mapId === 'cidade') {
    const far = w.roofTops.filter(t => t.z < -430 && Math.abs(t.x) < 300);
    const src = [far[3], far[Math.floor(far.length * 0.6)]].filter(Boolean).map((t, i) => ({ x: t.x, y: t.y, z: t.z, scale: 1.2, dark: i === 0 }));
    L.push(L_.makeSmoke(scene, src, q));
    L.push(L_.makeBirds(scene, new THREE.Vector3(0, 0, -210), 14, { h: 28, radius: 45, size: 0.45, seed: 3 }));
    // transito: ruas norte sul (x = i*70) e leste oeste (z = -j*70), longe da praca
    const lanes = [];
    for (const i of [-3, -2, -1, 1, 2, 3]) { lanes.push({ axis: 'z', c: i * 70 - 3.5, a: -760, b: 80, dir: 1, v: 9 + (i & 1) * 2 }); lanes.push({ axis: 'z', c: i * 70 + 3.5, a: -760, b: 80, dir: -1, v: 10 }); }
    for (const j of [1, 5, 6]) { lanes.push({ axis: 'x', c: -j * 70 - 3.5, a: -340, b: 340, dir: 1, v: 10 }); lanes.push({ axis: 'x', c: -j * 70 + 3.5, a: -340, b: 340, dir: -1, v: 9 }); }
    const tr = L_.makeTraffic(scene, q, lanes, { night: !!sp.night, wet: sp.weather === 'rain' }); L.push(tr); w.colliders.push(...tr.colliders);
    const near = w.roofTops.filter(t => t.z > -520 && t.z < -10); const ao = L_.makeBaseAO(scene, near.map(t => ({ x: t.x, z: t.z, w: t.w, d: t.d })), 0.21, 3.5); if (ao) L.push(ao);
  } else if (mapId === 'montanha') {
    const f = w.fire ? w.fire.position : new THREE.Vector3(30, 0, -255);
    L.push(L_.makeSmoke(scene, [{ x: f.x, y: f.y + 0.5, z: f.z, scale: 0.7 }, { x: -380, y: ga(-380, -900) + 2, z: -900, scale: 1.6, dark: true }], q));
    L.push(L_.makeBirds(scene, new THREE.Vector3(-40, ga(-40, -320), -320), 6, { h: 70, radius: 90, size: 1.1, seed: 7 }));
    L.push(L_.makeGrass(scene, ga, { x0: -220, x1: 240, z0: -580, z1: -70 }, { count: 6000, seed: 13, skip: (x, z) => Math.hypot(x - 30, z - 260 * -1) < 8 }));
  } else {
    L.push(L_.makeSmoke(scene, [{ x: 22, y: 9, z: -322, scale: 0.6 }, { x: -260, y: ga(-260, -720) + 1, z: -720, scale: 1.7, dark: true }], q));
    L.push(L_.makeBirds(scene, new THREE.Vector3(180, 13, -560), 5, { h: 60, radius: 70, size: 1.3, seed: 9, color: 0x231c18 }));
    L.push(L_.makeGrass(scene, ga, { x0: -260, x1: 360, z0: -680, z1: -110 }, { count: 2600, dry: true, scale: 1.1, seed: 17, skip: (x, z) => (Math.abs(x) < 37 && Math.abs(z + 300) < 37) || Math.hypot(x - 180, z + 560) < 26 }));
  }
  for (const l of L) l.setQuality(q);
  w.life = L;
}
