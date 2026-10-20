// Vida no cenario: nuvens, passaros, colunas de fumaca, grama e sombra de contato barata
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, fbm, clamp } from './util.js?v=1.4.0';

export const LIFE = { pr: 1, height: 800, focus: new THREE.Vector3(0, 0, -200), floor: new THREE.Vector3() };
const QN = { baixa: 0, media: 1, alta: 2 };

// ---------- textura de nuvem (ruido periodico) ----------
let cloudTex = null;
function makeCloudTex() {
  if (cloudTex) return cloudTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'); const img = x.createImageData(S, S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S, sc = 5;
    const s = (a, b) => fbm(a, b, 5);
    const A = s(u * sc, v * sc), B = s((u - 1) * sc, v * sc), C = s(u * sc, (v - 1) * sc), D = s((u - 1) * sc, (v - 1) * sc);
    const n = (A * (1 - u) + B * u) * (1 - v) + (C * (1 - u) + D * u) * v;
    const k = (j * S + i) * 4; const g = clamp((n * 0.5 + 0.5) * 255, 0, 255); img.data[k] = img.data[k + 1] = img.data[k + 2] = g; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  cloudTex = new THREE.CanvasTexture(c); cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.colorSpace = THREE.NoColorSpace;
  return cloudTex;
}

export function makeClouds(scene, sp, sunDir) {
  const geo = new THREE.SphereGeometry(1400, 32, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const night = !!sp.night; const low = clamp((25 - sp.elev) / 25, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tN: { value: makeCloudTex() }, uT: { value: 0 }, uWind: { value: new THREE.Vector2() },
      uCover: { value: sp.clouds ?? (sp.fog > 0.002 ? 0.62 : 0.45) }, uSun: { value: sunDir.clone().normalize() },
      uLit: { value: new THREE.Color(night ? 0x6a7090 : 0xffffff).lerp(new THREE.Color(0xffc090), night ? 0 : low * 0.8) },
      uShade: { value: new THREE.Color(night ? 0x20243a : 0x8a96aa).lerp(new THREE.Color(0x8a6a70), night ? 0 : low * 0.6) },
      uAlpha: { value: night ? 0.45 : 0.85 },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tN; uniform float uT, uCover, uAlpha; uniform vec2 uWind; uniform vec3 uSun, uLit, uShade; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); if (d.y < 0.0) discard; vec2 p = d.xz / (d.y + 0.12) * 0.32 + uWind;
        float n = texture2D(tN, p).r * 0.65 + texture2D(tN, p * 2.3 + 0.37).r * 0.35;
        float a = smoothstep(uCover, uCover + 0.22, n);
        float n2 = texture2D(tN, p + uSun.xz * 0.03).r * 0.65 + texture2D(tN, (p + uSun.xz * 0.03) * 2.3 + 0.37).r * 0.35;
        float lit = clamp(1.0 - (n2 - n) * 6.0, 0.0, 1.0);
        float sunGlow = pow(max(dot(d, uSun), 0.0), 8.0);
        vec3 c = mix(uShade, uLit, lit * 0.7 + 0.3) + uLit * sunGlow * 0.6;
        float fade = smoothstep(0.02, 0.22, d.y);
        gl_FragColor = vec4(c, a * fade * uAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -9; m.frustumCulled = false; scene.add(m);
  return {
    obj: m,
    update(dt, t, wind, cam) { m.position.copy(cam.position); mat.uniforms.uWind.value.x += (0.004 + wind.x * 0.0012) * dt; mat.uniforms.uWind.value.y += wind.z * 0.0012 * dt; },
    setQuality(q) { m.visible = q !== 'baixa'; },
  };
}

// ---------- passaros (InstancedMesh, voo em circulos) ----------
export function makeBirds(scene, center, count, opts = {}) {
  const wing = new THREE.BufferGeometry();
  const s = opts.size || 1;
  const v = [0, 0, -0.35, 0, 0, 0.3, -1, 0.05, 0.05, 0, 0, -0.35, 1, 0.05, 0.05, 0, 0, 0.3, -0.12, 0, 0.1, 0.12, 0, 0.1, 0, 0.05, -0.5].map(x => x * s);
  wing.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); wing.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: opts.color || 0x1a1a1e, side: THREE.DoubleSide, fog: true });
  const im = new THREE.InstancedMesh(wing, mat, count); im.frustumCulled = false; scene.add(im);
  const r = rng(opts.seed || 5);
  const B = []; for (let i = 0; i < count; i++) B.push({ rad: (opts.radius || 60) * (0.5 + r()), ph: r() * 6.28, h: (opts.h || 40) + r() * 20, sp: (0.12 + r() * 0.1) * (r() < 0.5 ? -1 : 1), flap: 5 + r() * 4, fp: r() * 6.28, ox: (r() - 0.5) * 40, oz: (r() - 0.5) * 40 });
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler();
  let panic = 0, pv = 0; const out = B.map(() => new THREE.Vector3());
  return {
    obj: im,
    // tiro: os passaros se espalham e depois voltam a circular
    scatter(from) { if (panic > 0.5) return; pv = 1; B.forEach((b, i) => { const a = r() * 6.28; out[i].set(Math.cos(a), 0.6 + r() * 0.8, Math.sin(a)).multiplyScalar(40 + r() * 50); }); },
    update(dt, t) {
      if (pv > 0) { panic = Math.min(1, panic + dt * 1.6); if (panic >= 1) pv = 0; } else panic = Math.max(0, panic - dt * 0.08);
      const pe = panic * panic * (3 - 2 * panic);
      for (let i = 0; i < count; i++) {
        const b = B[i]; const a = b.ph + t * b.sp;
        P.set(center.x + b.ox + Math.cos(a) * b.rad, center.y + b.h + Math.sin(t * 0.3 + b.ph) * 3, center.z + b.oz + Math.sin(a) * b.rad).addScaledVector(out[i], pe);
        const head = -a + (b.sp > 0 ? 0 : Math.PI); E.set(0, head, (b.sp > 0 ? -1 : 1) * 0.25); Q.setFromEuler(E);
        const fl = Math.sin(t * b.flap * (1 + pe * 1.5) + b.fp); const glide = pe > 0.05 ? 1 : Math.sin(t * 0.5 + b.ph) > 0.3 ? 0.15 : 1;
        S.set(1, 1 + fl * 6 * glide, 1); M.compose(P, Q, S); im.setMatrixAt(i, M);
      }
      im.instanceMatrix.needsUpdate = true;
    },
    setQuality() { },
  };
}

// ---------- colunas de fumaca (um unico Points com shader) ----------
let smokeTex = null;
function makeSmokeTex() {
  if (smokeTex) return smokeTex;
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  for (let k = 0; k < 7; k++) { const px = 20 + Math.random() * 24, py = 20 + Math.random() * 24, rr = 12 + Math.random() * 12; const g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); }
  smokeTex = new THREE.CanvasTexture(c); return smokeTex;
}
export function makeSmoke(scene, sources, q) {
  const per = q === 'baixa' ? 18 : q === 'media' ? 26 : 40; const n = sources.length * per;
  const base = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  sources.forEach((s, j) => { for (let i = 0; i < per; i++) { const k = j * per + i; base[k * 3] = s.x; base[k * 3 + 1] = s.y; base[k * 3 + 2] = s.z; seed[k * 4] = i / per; seed[k * 4 + 1] = Math.random(); seed[k * 4 + 2] = s.scale || 1; seed[k * 4 + 3] = s.dark ? 1 : 0; } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(base, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { tS: { value: makeSmokeTex() }, uT: { value: 0 }, uWind: { value: new THREE.Vector3() }, uScale: { value: 500 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, uLight: { value: new THREE.Color(0xd8d4cc) } },
    vertexShader: `attribute vec4 seed; uniform float uT, uScale; uniform vec3 uWind; varying float vA; varying float vDark; varying float vFog; uniform float fogDensity; varying float vRot;
      void main(){ float life = fract(seed.x + uT * 0.035 * (0.8 + seed.y * 0.4)); float sc = seed.z;
        vec3 p = position; float h = life * 70.0 * sc; p.y += h; p.x += uWind.x * h * 0.55 + sin(seed.y * 40.0 + uT * 0.4) * life * 6.0 * sc; p.z += uWind.z * h * 0.55 + cos(seed.y * 31.0 + uT * 0.3) * life * 6.0 * sc;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float size = (2.5 + life * 18.0) * sc; gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 400.0);
        vA = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.55, 1.0, life)); vDark = seed.w; vRot = seed.y * 6.28 + life * 2.0;
        float fd = fogDensity * 0.6 * length(mv.xyz); vFog = 1.0 - exp(-fd * fd); }`,
    fragmentShader: `uniform sampler2D tS; uniform vec3 fogColor, uLight; varying float vA, vDark, vFog, vRot;
      void main(){ vec2 c = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot); c = mat2(cs, -sn, sn, cs) * c; vec4 t = texture2D(tS, c + 0.5);
        vec3 col = mix(uLight, vec3(0.16, 0.15, 0.14), vDark * 0.85); col = mix(col, fogColor, vFog);
        gl_FragColor = vec4(col, t.a * vA * (0.55 + vDark * 0.3));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  return {
    obj: pts,
    update(dt, t, wind, cam) {
      const u = mat.uniforms; u.uT.value = t; u.uWind.value.set(wind.x * 0.12, 0, wind.z * 0.12);
      u.uScale.value = LIFE.height * LIFE.pr / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      if (scene.fog) { u.fogColor.value.copy(scene.fog.color); u.fogDensity.value = scene.fog.density; }
    },
    setQuality() { },
  };
}

// ---------- grama / arbustos instanciados (so Media e Alta) ----------
function grassTex(dry) {
  const W = 128, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const bx = 8 + Math.random() * (W - 16), h = H * (0.45 + Math.random() * 0.55), lean = (Math.random() - 0.5) * 30, w = 2 + Math.random() * 3;
    const g = x.createLinearGradient(0, H, 0, H - h);
    if (dry) { g.addColorStop(0, '#5a4630'); g.addColorStop(1, '#c8aa78'); } else { g.addColorStop(0, '#2c3d1c'); g.addColorStop(1, '#9cb468'); }
    x.fillStyle = g; x.beginPath(); x.moveTo(bx - w, H); x.quadraticCurveTo(bx + lean * 0.3, H - h * 0.6, bx + lean, H - h); x.quadraticCurveTo(bx + lean * 0.3 + w * 0.4, H - h * 0.6, bx + w, H); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeGrass(scene, groundAt, area, opts = {}) {
  const max = opts.count || 6000; const dry = !!opts.dry;
  const quads = []; for (let k = 0; k < 3; k++) { const p = new THREE.PlaneGeometry(1.2, 0.8); p.translate(0, 0.4, 0); p.rotateY(k * Math.PI / 3); quads.push(p); }
  const geo = mergeGeometries(quads);
  const mat = new THREE.MeshStandardMaterial({ map: grassTex(dry), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  const uT = { value: 0 };
  mat.onBeforeCompile = (sh) => { sh.uniforms.uGT = uT; sh.vertexShader = 'uniform float uGT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float sway = sin(uGT * 1.7 + ip.x * 0.15 + ip.z * 0.11) * 0.12 + sin(uGT * 3.1 + ip.x) * 0.04;
      transformed.x += sway * uv.y; transformed.z += sway * 0.6 * uv.y;
      #endif
      `); sh.vertexShader = sh.vertexShader.replace('#include <normal_vertex>', '#include <normal_vertex>\n'); };
  mat.customProgramCacheKey = () => 'grass';
  // normal para cima para luz suave
  const nor = geo.attributes.normal; for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
  const im = new THREE.InstancedMesh(geo, mat, max); im.castShadow = false; im.receiveShadow = true;
  const r = rng(opts.seed || 11); const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
  let n = 0, tries = 0;
  while (n < max && tries < max * 6) {
    tries++;
    const x = area.x0 + r() * (area.x1 - area.x0), z = area.z0 + r() * (area.z1 - area.z0);
    if (opts.skip && opts.skip(x, z)) continue;
    // patches: densidade por ruido
    if (fbm(x * 0.02, z * 0.02, 2) + 0.25 < r() * 0.9) continue;
    const y = groundAt(x, z), y2 = groundAt(x + 1.5, z), y3 = groundAt(x, z + 1.5);
    if (Math.abs(y2 - y) > 0.9 || Math.abs(y3 - y) > 0.9) continue;
    const s = (opts.scale || 1) * (0.6 + r() * 0.8);
    P.set(x, y - 0.05, z); E.set(0, r() * 6.28, 0); Q.setFromEuler(E); S.set(s, s * (0.8 + r() * 0.5), s); M.compose(P, Q, S); im.setMatrixAt(n, M);
    C.setHSL(dry ? 0.09 + r() * 0.03 : 0.22 + r() * 0.06, dry ? 0.3 : 0.35, 0.5 + r() * 0.25); im.setColorAt(n, C); n++;
  }
  im.count = n; im.userData.full = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
  return {
    obj: im,
    update(dt, t) { uT.value = t; },
    setQuality(q) { im.visible = q !== 'baixa'; im.count = q === 'alta' ? im.userData.full : Math.floor(im.userData.full * 0.25); },
  };
}

// ---------- sombra de contato barata na base dos predios ----------
export function makeBaseAO(scene, boxes, y = 0.22, width = 3.2) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.4, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  const parts = [];
  for (const b of boxes) {
    const sides = [[b.w, 0, b.d / 2, 0], [b.w, 0, -b.d / 2, Math.PI], [b.d, b.w / 2, 0, Math.PI / 2], [b.d, -b.w / 2, 0, -Math.PI / 2]];
    for (const [L, ox, oz, ry] of sides) { const p = new THREE.PlaneGeometry(L + width, width); p.translate(0, -width / 2, 0); p.rotateX(-Math.PI / 2); p.rotateY(ry); p.translate(b.x + ox, y, b.z + oz); parts.push(p); }
  }
  if (!parts.length) return null;
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: t, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(mergeGeometries(parts), mat); m.renderOrder = 1; scene.add(m);
  return { obj: m, update() { }, setQuality(q) { m.visible = q !== 'baixa'; } };
}

// ---------- transito de civis na cidade (InstancedMesh, so cenario) ----------
function carGeometry() {
  const parts = []; const col = (g, c) => { const cc = new THREE.Color(c); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); parts.push(g.index ? g.toNonIndexed() : g); };
  let g = new THREE.BoxGeometry(1.85, 0.62, 4.3); g.translate(0, 0.62, 0); col(g, 0xffffff);
  g = new THREE.BoxGeometry(1.62, 0.55, 2.2); g.translate(0, 1.2, -0.25); col(g, 0xffffff);
  g = new THREE.BoxGeometry(1.66, 0.42, 2.0); g.translate(0, 1.2, -0.25); col(g, 0x1a2430);
  g = new THREE.BoxGeometry(1.5, 0.16, 0.05); g.translate(0, 0.7, 2.16); col(g, 0xfff4d0);
  g = new THREE.BoxGeometry(1.5, 0.14, 0.05); g.translate(0, 0.72, -2.16); col(g, 0xc01810);
  for (const [x, z] of [[0.86, 1.35], [-0.86, 1.35], [0.86, -1.35], [-0.86, -1.35]]) { g = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10); g.rotateZ(Math.PI / 2); g.translate(x, 0.34, z); col(g, 0x0e0e0e); }
  return mergeGeometries(parts);
}
export function makeTraffic(scene, q, lanes, opts = {}) {
  // transito: semaforo, fila sem bater, freio suave, conversoes, pedestres na faixa, panico com tiros, carros que levam tiro
  const per = q === 'baixa' ? 2 : q === 'media' ? 3 : 4; const r = rng(23);
  const CYC = 24, ZG = [0, 9], XG = [11, 20]; let T = 0;
  const phase = () => T % CYC;
  const green = (axis) => { const ph = phase(), g = axis === 'z' ? ZG : XG; return ph >= g[0] && ph < g[1]; };
  const dirV = (L) => L.axis === 'z' ? { x: 0, z: L.dir > 0 ? -1 : 1 } : { x: L.dir > 0 ? 1 : -1, z: 0 };
  const posOf = (L, s) => L.axis === 'z' ? { x: L.c, z: L.dir > 0 ? L.b - s : L.a + s } : { z: L.c, x: L.dir > 0 ? L.a + s : L.b - s };
  const sOf = (L, x, z) => L.axis === 'z' ? (L.dir > 0 ? L.b - z : z - L.a) : (L.dir > 0 ? x - L.a : L.b - x);
  const STOP = 16.5;
  lanes.forEach((L) => {
    L.len = L.b - L.a; L.d = dirV(L); L.cross = [];
    const cs = L.axis === 'z' ? Array.from({ length: 9 }, (_, j) => -j * 70) : Array.from({ length: 9 }, (_, i) => (i - 4) * 70);
    for (const c of cs) { const sc = L.axis === 'z' ? sOf(L, L.c, c) : sOf(L, c, L.c); if (sc > STOP && sc < L.len - 10) L.cross.push({ s: sc, c }); }
    L.cross.sort((a, b) => a.s - b.s);
  });
  // conversoes curtas: para a faixa perpendicular do lado da faixa atual
  lanes.forEach((L) => {
    for (const cr of L.cross) {
      cr.turns = [];
      const street = L.axis === 'z' ? Math.round(L.c / 70) * 70 : Math.round(L.c / 70) * 70; const side = Math.sign(L.c - street);
      for (const L2 of lanes) {
        if (L2.axis === L.axis || Math.abs(Math.round(L2.c / 70) * 70 - cr.c) > 0.1) continue;
        const d2 = L2.d; if (Math.sign(L.axis === 'z' ? d2.x : d2.z) !== side) continue;
        const P = L.axis === 'z' ? { x: L.c, z: L2.c } : { x: L2.c, z: L.c }; const sP = sOf(L, P.x, P.z); if (Math.abs(sP - cr.s) > 6) continue;
        const sB = sOf(L2, P.x + d2.x * 7, P.z + d2.z * 7); if (sB < 5 || sB > L2.len - 20) continue;
        cr.turns.push({ L2, P, sA: sP - 7, sB });
      }
    }
  });
  const cars = []; const byLane = lanes.map(() => []);
  lanes.forEach((L, li) => {
    for (let k = 0; k < per; k++) { const c = { L, li, s: (k + r() * 0.4) / per * L.len, v: L.v, vmax: L.v * (0.9 + r() * 0.2), panic: 0, hit: 0, idx: cars.length, turn: null, plan: null, yaw: 0, x: 0, z: 0 }; cars.push(c); byLane[li].push(c); }
  });
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const im = new THREE.InstancedMesh(carGeometry(), mat, cars.length); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -340), 2000);
  const pal = [0x8a1c1c, 0x1c3a6a, 0xdedede, 0x2a2a2a, 0x7a7a7a, 0x2a5a3a, 0xc8a040, 0xb0b8c0, 0x5a2a5a]; const C = new THREE.Color();
  cars.forEach((c, i) => im.setColorAt(i, C.set(pal[Math.floor(r() * pal.length)])));
  scene.add(im);
  const M = new THREE.Matrix4(), P3 = new THREE.Vector3(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  const baseY = (axis) => axis === 'z' ? 0.04 : 0.12;
  const place = (c) => {
    let x, z, yaw;
    if (c.turn) { const t = c.turn, u = Math.min(1, t.u), A = t.Ap, B = t.Bp, Pp = t.P; const iu = 1 - u;
      x = iu * iu * A.x + 2 * iu * u * Pp.x + u * u * B.x; z = iu * iu * A.z + 2 * iu * u * Pp.z + u * u * B.z;
      const tx = 2 * iu * (Pp.x - A.x) + 2 * u * (B.x - Pp.x), tz = 2 * iu * (Pp.z - A.z) + 2 * u * (B.z - Pp.z); yaw = Math.atan2(tx, tz); }
    else { const p = posOf(c.L, c.s); x = p.x; z = p.z; yaw = Math.atan2(c.L.d.x, c.L.d.z); }
    c.x = x; c.z = z; c.yaw = yaw;
    P3.set(x, c.turn ? 0.08 : baseY(c.L.axis), z); Q.setFromAxisAngle(Y, yaw + (c.hit > 0 ? Math.sin(c.idx) * 0.08 : 0)); M.compose(P3, Q, S1); im.setMatrixAt(c.idx, M);
  };
  im.userData.surf = 'car';
  im.userData.onHit = (id, point) => { const c = cars[id]; if (!c) return 'metal'; c.hit = 25; c.panic = 0; return point.y - 0.06 > 0.98 ? 'glass' : 'metal'; };
  cars.forEach(place);

  // ---------- pedestres nas faixas ----------
  const crossings = [];
  const xs = opts.cwX || [-70, 70], zs = opts.cwZ || [-70, -350];
  for (const X of xs) for (const Z of zs) {
    crossings.push({ axis: 'z', X, Z, fixed: Z + 11.5, a: X - 9.5, b: X + 9.5, open: [9.5, 22.5] }); // atravessa a rua norte sul
    crossings.push({ axis: 'x', X, Z, fixed: X + 11.5, a: Z - 9.5, b: Z + 9.5, open: [20.5, 33.5] }); // atravessa a rua leste oeste
  }
  const perCw = q === 'baixa' ? 1 : 2; const peds = [];
  crossings.forEach((cw) => { for (let k = 0; k < perCw; k++) peds.push({ cw, side: r() < 0.5 ? 0 : 1, u: 0, state: 'wait', delay: r() * 2.2, sp: 1.35 + r() * 0.3, off: (r() - 0.5) * 2.2, panic: 0, down: false, idx: peds.length, x: 0, z: 0, ph: r() * 6 }); });
  const pedBody = (() => { const parts = []; const col = (g, c) => { const cc = new THREE.Color(c); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g.toNonIndexed ? g : g); };
    let g = new THREE.BoxGeometry(0.15, 0.82, 0.18); g.translate(0.1, 0.41, 0); col(g, 0x2a2c33);
    g = new THREE.BoxGeometry(0.15, 0.82, 0.18); g.translate(-0.1, 0.41, 0); col(g, 0x2a2c33);
    g = new THREE.BoxGeometry(0.42, 0.62, 0.24); g.translate(0, 1.13, 0); col(g, 0xffffff);
    g = new THREE.BoxGeometry(0.11, 0.56, 0.12); g.translate(0.27, 1.1, 0); col(g, 0xffffff);
    g = new THREE.BoxGeometry(0.11, 0.56, 0.12); g.translate(-0.27, 1.1, 0); col(g, 0xffffff);
    g = new THREE.SphereGeometry(0.115, 10, 8); g.translate(0, 1.6, 0); col(g, 0xd8a888);
    return mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)); })();
  const pim = new THREE.InstancedMesh(pedBody, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), Math.max(1, peds.length)); pim.castShadow = true; pim.frustumCulled = false; pim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pim.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -340), 2000); pim.count = peds.length;
  const ppal = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xecf0f1, 0x8e44ad, 0xe67e22, 0x5d6d7e];
  peds.forEach((p, i) => pim.setColorAt(i, C.set(ppal[Math.floor(r() * ppal.length)])));
  scene.add(pim);
  pim.userData.surf = 'body';
  pim.userData.onHit = (id) => { const p = peds[id]; if (!p || p.down) return 'body'; p.down = true; for (const o of peds) o.panic = 12; for (const c of cars) if (c.hit <= 0) c.panic = 10; return 'civil'; };
  const inWin = (ph, w) => { const a = w[0] % CYC, e = w[1] % CYC; return a < e ? ph >= a && ph < e : ph >= a || ph < e; };
  const winAge = (ph, w) => ((ph - w[0]) % CYC + CYC) % CYC;
  const placePed = (p, t) => {
    const cw = p.cw; const span = cw.b - cw.a; const f = p.state === 'cross' ? (p.side === 0 ? p.u : 1 - p.u) : (p.side === 0 ? 0 : 1);
    const along = cw.a - 1.2 + f * (span + 2.4); const lat = p.off;
    let x, z, yaw; if (cw.axis === 'z') { x = along; z = cw.fixed + lat; yaw = p.state === 'cross' ? (p.side === 0 ? Math.PI / 2 : -Math.PI / 2) : (p.side === 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(t * 0.3 + p.ph) * 0.6; }
    else { z = along; x = cw.fixed + lat; yaw = p.state === 'cross' ? (p.side === 0 ? 0 : Math.PI) : (p.side === 0 ? 0 : Math.PI) + Math.sin(t * 0.3 + p.ph) * 0.6; }
    p.x = x; p.z = z; const walking = p.state === 'cross' && !p.down; const bob = walking ? Math.abs(Math.sin(t * (p.panic > 0 ? 9 : 5.5) + p.ph)) * 0.05 : 0;
    P3.set(x, (cw.axis === 'z' ? 0.04 : 0.12) + (f > 0.02 && f < 0.98 ? 0 : 0.11) + bob, z);
    if (p.down) { const qd = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); Q.setFromAxisAngle(Y, yaw).multiply(qd); P3.y = 0.18; } else Q.setFromAxisAngle(Y, yaw + (walking ? Math.sin(t * 5.5 + p.ph) * 0.06 : 0));
    M.compose(P3, Q, S1); pim.setMatrixAt(p.idx, M);
  };
  peds.forEach(p => placePed(p, 0));
  // pedestre na frente do carro (na faixa dele)
  const pedAhead = (c) => {
    let best = 1e9; const L = c.L;
    for (const p of peds) {
      if (!(p.state === 'cross' || p.down)) continue; const cw = p.cw; if (cw.axis !== L.axis) continue; // atravessa a rua desta faixa
      if (L.axis === 'z' ? Math.abs(p.x - L.c) > 2.8 : Math.abs(p.z - L.c) > 2.8) continue;
      const sp = sOf(L, p.x, p.z); const d = sp - c.s; if (d > 0 && d < best) best = d;
    }
    return best;
  };
  const brakeV = (d, b) => Math.sqrt(Math.max(0, 2 * b * Math.max(0, d)));

  return {
    obj: im, collider: im, colliders: [im, pim], _dbgHit: () => cars.some(c => c.hit > 0), _peds: peds, _cars: cars,
    scatter() { for (const c of cars) if (c.hit <= 0) c.panic = 10 + (c.idx % 5); for (const p of peds) p.panic = 10; },
    update(dt, t) {
      T += dt; const ph = phase();
      // pedestres
      for (const p of peds) {
        p.panic = Math.max(0, p.panic - dt); if (p.down) { placePed(p, t); continue; }
        const cw = p.cw; const span = cw.b - cw.a + 2.4;
        if (p.state === 'wait') { if (inWin(ph, cw.open) && winAge(ph, cw.open) > p.delay && winAge(ph, cw.open) < 3.5) { p.state = 'cross'; p.u = 0; } }
        else { p.u += dt * p.sp * (p.panic > 0 ? 2.4 : 1) / span; if (p.u >= 1) { p.state = 'wait'; p.side = 1 - p.side; p.delay = r() * 2.2; } }
        placePed(p, t);
      }
      pim.instanceMatrix.needsUpdate = true;
      // carros
      lanes.forEach((L, li) => {
        const list = byLane[li]; list.sort((a, b) => a.s - b.s); const n = list.length;
        for (let k = 0; k < n; k++) {
          const c = list[k]; if (c.turn && c.turn.L2 !== L) { /* fantasma na faixa antiga */ }
          const ahead = n > 1 ? list[(k + 1) % n] : null; let gap = ahead ? ahead.s - c.s : 1e9; if (ahead && gap <= 0) gap += L.len;
          if (c.turn) continue;
          c.panic = Math.max(0, c.panic - dt); c.hit = Math.max(0, c.hit - dt);
          const pk = c.panic > 0 ? 1.7 : 1; const vmax = c.hit > 0 ? 0 : c.vmax * pk;
          let want = Math.min(vmax, brakeV(gap - 7.5, 4) + (ahead ? Math.min(ahead.v, 3) * 0.6 : 0)); if (gap < 7) want = 0;
          const next = L.cross.find(x => x.s - STOP > c.s - 0.3);
          if (next) {
            const dStop = next.s - STOP - c.s;
            if (!green(L.axis)) { if (dStop > c.v * c.v / (2 * 6) - 0.5 || c.v < 2) want = Math.min(want, brakeV(dStop - 0.3, 3.2)); }
            // plano de conversao ao chegar perto
            if (c.plan == null && dStop < 40) { c.plan = next.turns.length && r() < 0.3 ? next : false; }
          }
          // conversao: freia para uns 5 m/s e entra na curva
          if (c.plan && c.plan.turns.length) {
            const tp = c.plan.turns[0]; const dA = tp.sA - c.s;
            if (dA < 0.4 && dA > -3) {
              const L2 = tp.L2, li2 = lanes.indexOf(L2); const busy = byLane[li2].some(o => { let d = o.s - tp.sB; return d > -18 && d < 12; }) || peds.some(p => (p.state === 'cross' || p.down) && p.cw.axis === L2.axis && Math.abs((L2.axis === 'z' ? p.x - L2.c : p.z - L2.c)) < 2.8 && Math.abs(sOf(L2, p.x, p.z) - tp.sB) < 16);
              if (!busy) { const A = posOf(L, tp.sA), B = posOf(L2, tp.sB); c.turn = { L2, li2, sB: tp.sB, Ap: A, Bp: B, P: tp.P, u: 0, len: 11.5, from: li }; c.plan = null; }
              else c.plan = false;
            } else if (dA > 0) want = Math.min(want, 5 + brakeV(dA, 2.5));
          }
          const pd = pedAhead(c); if (pd < 40) want = Math.min(want, brakeV(pd - 5.5, 4.5));
          if (c.hit > 0) want = 0;
          const acc = want > c.v ? 2.6 * (c.panic > 0 ? 1.6 : 1) : (c.v - want > 4 ? 7 : 4.5);
          c.v += Math.sign(want - c.v) * Math.min(Math.abs(want - c.v), acc * dt); if (c.v < 0) c.v = 0;
          c.s += c.v * dt; if (c.s >= L.len) { c.s -= L.len; c.plan = null; }
          if (next && c.s > next.s) c.plan = null;
          if (!c.turn) place(c);
        }
      });
      // carros fazendo a curva
      for (const c of cars) {
        if (!c.turn) continue; const t2 = c.turn; c.v += (Math.min(5.5, c.vmax) - c.v) * Math.min(1, dt * 2); t2.u += c.v * dt / t2.len;
        if (t2.u < 0.5) c.s += c.v * dt; // ainda ocupa a faixa antiga
        else if (t2.from != null) { const old = byLane[t2.from]; const i = old.indexOf(c); if (i >= 0) old.splice(i, 1); t2.from = null; }
        if (t2.u >= 1) { if (t2.from != null) { const old = byLane[t2.from]; const i = old.indexOf(c); if (i >= 0) old.splice(i, 1); } c.L = t2.L2; c.li = t2.li2; c.s = t2.sB; c.turn = null; c.plan = null; byLane[c.li].push(c); }
        place(c);
      }
      im.instanceMatrix.needsUpdate = true;
    },
    setQuality() { },
  };
}

// ---------- estrelas (noite escura) ----------
export function makeStars(scene, q) {
  const n = q === 'baixa' ? 500 : 1400; const r = rng(91); const pos = new Float32Array(n * 3); const sd = new Float32Array(n);
  for (let i = 0; i < n; i++) { const az = r() * Math.PI * 2, el = Math.asin(0.05 + r() * 0.95); pos[i * 3] = Math.cos(el) * Math.sin(az) * 1400; pos[i * 3 + 1] = Math.sin(el) * 1400; pos[i * 3 + 2] = Math.cos(el) * Math.cos(az) * 1400; sd[i] = r(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('sd', new THREE.BufferAttribute(sd, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uPR: { value: 1 } },
    vertexShader: 'attribute float sd; uniform float uT, uPR; varying float vA; void main(){ vA = (0.25 + 0.75 * sd * sd) * (0.75 + 0.25 * sin(uT * (1.0 + sd * 3.0) + sd * 40.0)); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (1.0 + sd * 1.6) * uPR; }',
    fragmentShader: 'varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(d)) * vA; gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a * 1.6, a); }' });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = -9.5; scene.add(pts);
  return { obj: pts, update(dt, t, wind, cam) { pts.position.copy(cam.position); mat.uniforms.uT.value = t; mat.uniforms.uPR.value = LIFE.pr; }, setQuality() { } };
}

// ---------- chuva: tracos em volta da camera ----------
export function makeRain(scene, q) {
  const N = { baixa: 800, media: 2500, alta: 6000 }; const max = N.alta; const r = rng(57);
  const a = new Float32Array(max * 2 * 4);
  for (let i = 0; i < max; i++) { const x = r(), y = r(), z = r(); for (let e = 0; e < 2; e++) { const o = (i * 2 + e) * 4; a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = e; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 2 * 3), 3)); g.setAttribute('a', new THREE.BufferAttribute(a, 4));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { uT: { value: 0 }, uBox: { value: new THREE.Vector3(60, 36, 60) }, uVel: { value: new THREE.Vector3(0, -15, 0) }, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 1 }, uLen: { value: 0.9 } },
    vertexShader: `attribute vec4 a; uniform float uT, uLen; uniform vec3 uBox, uVel, uCam; varying float vA;
      void main(){ vec3 p = a.xyz * uBox + uVel * uT - uCam; p = mod(p, uBox) - uBox * 0.5; float d = length(p);
        p += normalize(uVel) * a.w * uLen; vA = smoothstep(3.0, 9.0, d) * (1.0 - smoothstep(22.0, 30.0, d)) * (0.4 + 0.6 * a.w);
        gl_Position = projectionMatrix * viewMatrix * vec4(uCam + p, 1.0); }`,
    fragmentShader: 'uniform float uAlpha; varying float vA; void main(){ gl_FragColor = vec4(0.62, 0.68, 0.78, vA * uAlpha * 0.5); }' });
  const lines = new THREE.LineSegments(g, mat); lines.frustumCulled = false; scene.add(lines);
  const setQ = (qq) => g.setDrawRange(0, (N[qq] || N.media) * 2); setQ(q);
  return { obj: lines, update(dt, t, wind, cam) { const u = mat.uniforms; u.uT.value = t % 600; u.uCam.value.copy(cam.position); u.uVel.value.set(wind.x * 0.7, -15, wind.z * 0.7); u.uAlpha.value = cam.fov < 20 ? 0.4 : 1; }, setQuality: setQ };
}

// ---------- tempestade de areia: graos rapidos e nuvens de poeira ----------
export function makeSand(scene, q) {
  const N = { baixa: 600, media: 1800, alta: 3600 }; const max = N.alta; const r = rng(63);
  const a = new Float32Array(max * 4); for (let i = 0; i < max; i++) { a[i * 4] = r(); a[i * 4 + 1] = r(); a[i * 4 + 2] = r(); a[i * 4 + 3] = r(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3)); g.setAttribute('a', new THREE.BufferAttribute(a, 4));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { uT: { value: 0 }, uBox: { value: new THREE.Vector3(90, 26, 90) }, uVel: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uScale: { value: 500 }, uAlpha: { value: 1 } },
    vertexShader: `attribute vec4 a; uniform float uT, uScale; uniform vec3 uBox, uVel, uCam; varying float vA; varying float vBig;
      void main(){ float big = step(0.96, a.w); vBig = big; vec3 v = uVel * (0.7 + 0.6 * a.w);
        vec3 p = a.xyz * uBox + v * uT - uCam + vec3(0.0, 6.0, 0.0); p = mod(p, uBox) - uBox * 0.5; p.y += sin(uT * 0.7 + a.w * 30.0) * 1.2; float d = length(p);
        vA = smoothstep(1.5, 5.0, d) * (1.0 - smoothstep(30.0, 45.0, d));
        vec4 mv = viewMatrix * vec4(uCam + p, 1.0); gl_Position = projectionMatrix * mv;
        float s = mix(0.05 + a.w * 0.06, 5.0, big); gl_PointSize = clamp(s * uScale / -mv.z, 1.0, mix(5.0, 260.0, big)); }`,
    fragmentShader: `uniform float uAlpha; varying float vA; varying float vBig; void main(){ float r = length(gl_PointCoord - 0.5);
        float a = mix(smoothstep(0.5, 0.2, r) * 0.6, smoothstep(0.5, 0.0, r) * 0.1, vBig) * vA * uAlpha; gl_FragColor = vec4(0.82, 0.62, 0.4, a); }` });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  const setQ = (qq) => g.setDrawRange(0, N[qq] || N.media); setQ(q);
  return { obj: pts, update(dt, t, wind, cam) { const u = mat.uniforms; u.uT.value = t % 600; u.uCam.value.copy(cam.position); u.uVel.value.set(wind.x * 2.2, 0, wind.z * 2.2);
    u.uScale.value = LIFE.height * LIFE.pr / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)); u.uAlpha.value = cam.fov < 20 ? 0.5 : 1; }, setQuality: setQ };
}

// ---------- respingos de chuva: no telhado do jogador e onde a mira olha ----------
export function makeSplashes(scene, q) {
  const N = { baixa: 60, media: 160, alta: 320 }; const max = N.alta; const r = rng(71);
  const a = new Float32Array(max * 4); for (let i = 0; i < max; i++) { a[i * 4] = r(); a[i * 4 + 1] = r(); a[i * 4 + 2] = r(); a[i * 4 + 3] = i % 2; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3)); g.setAttribute('a', new THREE.BufferAttribute(a, 4));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { uT: { value: 0 }, uC0: { value: new THREE.Vector3() }, uC1: { value: new THREE.Vector3() }, uR0: { value: 10 }, uR1: { value: 10 }, uScale: { value: 500 } },
    vertexShader: `attribute vec4 a; uniform float uT, uR0, uR1, uScale; uniform vec3 uC0, uC1; varying float vL;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){ float rate = 1.6 + a.z * 1.2; float k = uT * rate + a.x * 7.0; float ci = floor(k); vL = fract(k);
        float rr = mix(uR0, uR1, a.w); vec3 c = mix(uC0, uC1, a.w); float an = h(ci * 1.7 + a.y * 91.0) * 6.2832; float rd = sqrt(h(ci * 3.1 + a.x * 57.0)) * rr;
        vec3 p = c + vec3(cos(an) * rd, 0.03, sin(an) * rd); vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((0.05 + vL * 0.17) * uScale / -mv.z, 1.0, 14.0); }`,
    fragmentShader: `varying float vL; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float ring = smoothstep(0.55, 0.85, d) * (1.0 - smoothstep(0.85, 1.0, d)); float a = (ring + (1.0 - d) * 0.25 * (1.0 - vL)) * (1.0 - vL) * 0.6; if (a < 0.01) discard; gl_FragColor = vec4(0.75, 0.8, 0.88, a); }` });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  const setQ = (qq) => g.setDrawRange(0, N[qq] || N.media); setQ(q);
  return { obj: pts, update(dt, t, wind, cam) { const u = mat.uniforms; u.uT.value = t % 600; u.uC0.value.copy(LIFE.floor); u.uR0.value = 9; u.uC1.value.copy(LIFE.focus); const d = LIFE.focus.distanceTo(cam.position); u.uR1.value = Math.min(30, Math.max(4, d * 0.035));
    u.uScale.value = LIFE.height * LIFE.pr / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)); }, setQuality: setQ };
}

// ---------- brilho dos postes a noite (halo + mancha de luz no chao) ----------
let glowTex = null;
function makeGlowTex() {
  if (glowTex) return glowTex; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace; return glowTex;
}
export function makeLampGlow(scene, heads, wet) {
  const n = heads.length; if (!n) return null; const pos = new Float32Array(n * 3); heads.forEach((h, i) => { pos[i * 3] = h.x; pos[i * 3 + 1] = h.y; pos[i * 3 + 2] = h.z; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { tG: { value: makeGlowTex() }, uScale: { value: 500 }, uT: { value: 0 } },
    vertexShader: 'uniform float uScale; varying float vF; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vF = clamp(1.0 - (-mv.z - 600.0) / 500.0, 0.25, 1.0); gl_PointSize = clamp(1.5 * uScale / -mv.z, 2.0, 70.0); }',
    fragmentShader: 'uniform sampler2D tG; varying float vF; void main(){ float a = texture2D(tG, gl_PointCoord).r; gl_FragColor = vec4(vec3(1.0, 0.8, 0.52) * a * a * 1.2 * vF, a); }' });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  // manchas no chao (mais fortes com chao molhado)
  const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
  const pm = new THREE.MeshBasicMaterial({ map: makeGlowTex(), color: new THREE.Color(1.0, 0.78, 0.5).multiplyScalar(wet ? 0.75 : 0.45), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const pool = new THREE.InstancedMesh(pg, pm, n); const M = new THREE.Matrix4();
  heads.forEach((h, i) => { M.makeScale(wet ? 13 : 11, 1, wet ? 17 : 11); M.setPosition(h.x, 0.07, h.z); pool.setMatrixAt(i, M); }); pool.frustumCulled = false; scene.add(pool);
  return { obj: pts, update(dt, t, wind, cam) { mat.uniforms.uScale.value = LIFE.height * LIFE.pr / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)); }, setQuality() { } };
}
