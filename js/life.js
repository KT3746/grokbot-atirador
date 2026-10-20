// Vida no cenario: nuvens, passaros, colunas de fumaca, grama e sombra de contato barata
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, fbm, clamp } from './util.js?v=1.2.0';

export const LIFE = { pr: 1, height: 800 };
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
export function makeTraffic(scene, q, lanes) {
  const per = q === 'baixa' ? 2 : q === 'media' ? 3 : 4; const r = rng(23);
  const cars = [];
  lanes.forEach((L, li) => { const len = L.b - L.a; for (let k = 0; k < per; k++) cars.push({ L, s: (k + r() * 0.5) / per * len, v: L.v * (0.9 + r() * 0.2) }); });
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const im = new THREE.InstancedMesh(carGeometry(), mat, cars.length); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const pal = [0x8a1c1c, 0x1c3a6a, 0xdedede, 0x2a2a2a, 0x7a7a7a, 0x2a5a3a, 0xc8a040, 0xb0b8c0, 0x5a2a5a]; const C = new THREE.Color();
  cars.forEach((c, i) => im.setColorAt(i, C.set(pal[Math.floor(r() * pal.length)])));
  scene.add(im);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  return {
    obj: im,
    update(dt) {
      cars.forEach((c, i) => {
        const L = c.L, len = L.b - L.a; c.s = (c.s + c.v * dt) % len; const u = L.a + c.s;
        if (L.axis === 'z') P.set(L.c, 0.04, L.dir > 0 ? L.b - c.s : u); else P.set(L.dir > 0 ? u : L.b - c.s, 0.12, L.c);
        const yaw = L.axis === 'z' ? (L.dir > 0 ? Math.PI : 0) : (L.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        Q.setFromAxisAngle(Y, yaw); M.compose(P, Q, S); im.setMatrixAt(i, M);
      });
      im.instanceMatrix.needsUpdate = true;
    },
    setQuality() { },
  };
}
