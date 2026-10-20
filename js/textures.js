// Texturas procedurais feitas em canvas (sem arquivos externos)
import * as THREE from 'three';
import { rng, fbm, noise2, clamp } from './util.js?v=1.2.0';

const cache = new Map();
let maxAniso = 4;
export function setAniso(a) { maxAniso = a; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

// Gera mapa de normais a partir de um campo de altura (Float32Array w*h)
function normalFromHeight(hf, w, h, strength = 2) {
  const c = canvas(w, h); const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = hf[y * w + ((x - 1 + w) % w)], r = hf[y * w + ((x + 1) % w)];
    const u = hf[((y - 1 + h) % h) * w + x], d = hf[((y + 1) % h) * w + x];
    let nx = (l - r) * strength * 16, ny = (u - d) * strength * 16, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * w + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

// Campo de ruido periodico (tileable) por mistura nas bordas
function heightField(w, h, scale, oct, seed, fn) {
  const hf = new Float32Array(w * h);
  const ox = seed * 17.3, oy = seed * 9.1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    // mistura de 4 amostras para repetir sem emenda
    const s = (a, b) => (fn ? fn(a, b) : fbm(a, b, oct));
    const sx = scale, A = s(u * sx + ox, v * sx + oy), B = s((u - 1) * sx + ox, v * sx + oy), C = s(u * sx + ox, (v - 1) * sx + oy), D = s((u - 1) * sx + ox, (v - 1) * sx + oy);
    hf[y * w + x] = (A * (1 - u) + B * u) * (1 - v) + (C * (1 - u) + D * u) * v;
  }
  return hf;
}

function paintField(hf, w, h, colorFn) {
  const c = canvas(w, h); const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const [r, g, b] = colorFn(hf[i], i % w, Math.floor(i / w)); img.data[i * 4] = clamp(r, 0, 255); img.data[i * 4 + 1] = clamp(g, 0, 255); img.data[i * 4 + 2] = clamp(b, 0, 255); img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0); return c;
}

export function groundSet(kind) {
  return cached('ground_' + kind, () => {
    const S = 256;
    const cfg = {
      grass: { sc: 8, oct: 5, col: (v) => { const k = v * 0.5 + 0.5; return [70 + k * 50, 92 + k * 55, 45 + k * 25]; }, ns: 3 },
      rock: { sc: 6, oct: 6, col: (v) => { const k = v * 0.5 + 0.5; return [95 + k * 70, 92 + k * 66, 88 + k * 60]; }, ns: 6 },
      sand: { sc: 5, oct: 4, col: (v) => { const k = v * 0.5 + 0.5; return [196 + k * 40, 160 + k * 36, 108 + k * 30]; }, ns: 4, fn: (a, b) => fbm(a, b, 3) * 0.4 + Math.sin(a * 6 + fbm(a * 0.5, b * 0.5, 2) * 6) * 0.25 },
      dirt: { sc: 7, oct: 5, col: (v) => { const k = v * 0.5 + 0.5; return [110 + k * 45, 88 + k * 35, 62 + k * 25]; }, ns: 3 },
      asphalt: { sc: 30, oct: 3, col: (v) => { const k = v * 0.5 + 0.5; const g = 52 + k * 30; return [g, g, g + 3]; }, ns: 1.5 },
      concrete: { sc: 10, oct: 4, col: (v) => { const k = v * 0.5 + 0.5; const g = 150 + k * 40; return [g, g - 2, g - 6]; }, ns: 1.5 },
      detail: { sc: 9, oct: 5, col: (v) => { const k = v * 0.5 + 0.5; const g = 200 + k * 55; return [g, g, g]; }, ns: 4 },
      snow: { sc: 6, oct: 4, col: (v) => { const k = v * 0.5 + 0.5; const g = 225 + k * 25; return [g - 6, g, g + 6]; }, ns: 1.2 },
    }[kind];
    const hf = heightField(S, S, cfg.sc, cfg.oct, kind.length, cfg.fn);
    const c = paintField(hf, S, S, (v, x, y) => { const [r, g, b] = cfg.col(v); const n = (Math.random() - 0.5) * 14; return [r + n, g + n, b + n]; });
    return { map: tex(c), normalMap: normalFromHeight(hf, S, S, cfg.ns) };
  });
}

// Fachada de predio com janelas; retorna mapa de cor e mapa de brilho
export function facade(style, seed = 1) {
  return cached('fac_' + style + seed, () => {
    const W = 256, H = 256, r = rng(seed * 31 + style.length);
    const c = canvas(W, H), e = canvas(W, H); const x = c.getContext('2d'), ex = e.getContext('2d');
    ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
    const base = { concrete: ['#a9a49b', '#8f8a82'], brick: ['#8a4b38', '#6f3a2b'], glass: ['#2c3c4c', '#22303d'], light: ['#cfc6b4', '#b5ab97'] }[style];
    x.fillStyle = base[0]; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 1800; i++) { x.fillStyle = Math.random() < 0.5 ? base[1] : 'rgba(255,255,255,0.06)'; x.globalAlpha = 0.25; x.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 1 + Math.random() * 3); }
    x.globalAlpha = 1;
    const cols = 4, rows = 4, cw = W / cols, rh = H / rows;
    // campo de altura para o mapa de normais (janelas fundas, peitoris salientes, juntas)
    const hf = new Float32Array(W * H); for (let i = 0; i < W * H; i++) hf[i] = 0.5 + (Math.random() - 0.5) * 0.03;
    const hrect = (x0, y0, w0, h0, v) => { for (let yy = Math.max(0, y0 | 0); yy < Math.min(H, (y0 + h0) | 0); yy++) for (let xx = Math.max(0, x0 | 0); xx < Math.min(W, (x0 + w0) | 0); xx++) hf[yy * W + xx] = v; };
    if (style === 'brick') for (let yy = 0; yy < H; yy += 6) { hrect(0, yy, W, 1, 0.42); const off = (yy / 6) % 2 ? 6 : 0; for (let xx = off; xx < W; xx += 12) hrect(xx, yy, 1, 6, 0.42); }
    if (style !== 'glass') for (let j = 0; j < rows; j++) hrect(0, j * rh, W, 2, 0.62);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const px = i * cw, py = j * rh;
      if (style === 'glass') {
        const g = x.createLinearGradient(px, py, px + cw, py + rh); g.addColorStop(0, '#6f8ea8'); g.addColorStop(1, '#2a3e52');
        x.fillStyle = g; x.fillRect(px + 2, py + 2, cw - 4, rh - 6);
        x.fillStyle = '#1b2530'; x.fillRect(px, py + rh - 6, cw, 6);
      } else {
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(px + cw * 0.18, py + rh * 0.2 + 3, cw * 0.64, rh * 0.58);
        const g = x.createLinearGradient(px, py, px, py + rh); g.addColorStop(0, '#3d4a57'); g.addColorStop(1, '#1d242b');
        x.fillStyle = g; x.fillRect(px + cw * 0.2, py + rh * 0.2, cw * 0.6, rh * 0.56);
        x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(px + cw * 0.2, py + rh * 0.2, cw * 0.6, 3);
        x.fillStyle = base[1]; x.fillRect(px + cw * 0.15, py + rh * 0.78, cw * 0.7, 4);
        x.fillStyle = '#20262c'; x.fillRect(px + cw * 0.49, py + rh * 0.2, 3, rh * 0.56); x.fillRect(px + cw * 0.2, py + rh * 0.45, cw * 0.6, 2);
        if (r() < 0.3) { x.fillStyle = r() < 0.5 ? 'rgba(200,190,160,0.55)' : 'rgba(120,60,50,0.5)'; x.fillRect(px + cw * 0.2, py + rh * 0.2, cw * (0.15 + r() * 0.2), rh * 0.56); }
        if (r() < 0.12) { x.fillStyle = '#c9c9c4'; x.fillRect(px + cw * 0.62, py + rh * 0.8, cw * 0.22, rh * 0.14); x.fillStyle = '#8a8a86'; x.fillRect(px + cw * 0.64, py + rh * 0.82, cw * 0.18, rh * 0.1); hrect(px + cw * 0.62, py + rh * 0.8, cw * 0.22, rh * 0.14, 0.9); }
        hrect(px + cw * 0.2, py + rh * 0.2, cw * 0.6, rh * 0.56, 0.12); hrect(px + cw * 0.49, py + rh * 0.2, 3, rh * 0.56, 0.3);
        hrect(px + cw * 0.15, py + rh * 0.78, cw * 0.7, 4, 0.8); hrect(px + cw * 0.18, py + rh * 0.17, cw * 0.64, 3, 0.68);
      }
      if (style === 'glass') { hrect(px, py + rh - 6, cw, 6, 0.75); hrect(px, py, 2, rh, 0.7); }
      if (r() < 0.35) {
        const warm = r() < 0.7; ex.fillStyle = warm ? `rgb(255,${190 + r() * 40},${110 + r() * 40})` : 'rgb(190,215,255)';
        if (style === 'glass') ex.fillRect(px + 2, py + 2, cw - 4, rh - 6); else ex.fillRect(px + cw * 0.2, py + rh * 0.2, cw * 0.6, rh * 0.56);
        x.fillStyle = 'rgba(255,220,160,0.25)'; if (style !== 'glass') x.fillRect(px + cw * 0.2, py + rh * 0.2, cw * 0.6, rh * 0.56);
      }
    }
    return { map: tex(c), emissiveMap: tex(e), normalMap: normalFromHeight(hf, W, H, 0.22) };
  });
}

export function roadTex() {
  return cached('road', () => {
    const W = 256, H = 256; const g = groundSet('asphalt');
    const c = canvas(W, H), x = c.getContext('2d'); x.drawImage(g.map.image, 0, 0, W, H);
    x.fillStyle = '#e8d070'; x.fillRect(W / 2 - 4, 0, 3, H); x.fillRect(W / 2 + 2, 0, 3, H);
    x.fillStyle = '#ddd'; for (let y = 0; y < H; y += 64) { x.fillRect(W * 0.25 - 2, y, 4, 32); x.fillRect(W * 0.75 - 2, y, 4, 32); }
    x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, 5, H); x.fillRect(W - 5, 0, 5, H);
    return { map: tex(c), normalMap: g.normalMap };
  });
}

export function tilesTex() {
  return cached('tiles', () => {
    const W = 256, c = canvas(W, W), x = c.getContext('2d');
    x.fillStyle = '#9d988e'; x.fillRect(0, 0, W, W);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const v = 140 + Math.random() * 40; x.fillStyle = `rgb(${v},${v - 4},${v - 10})`; x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); }
    return { map: tex(c) };
  });
}

export function woodTex() {
  return cached('wood', () => {
    const W = 128, c = canvas(W, W), x = c.getContext('2d');
    for (let y = 0; y < W; y++) { const v = 120 + Math.sin(y * 0.6 + noise2(0, y * 0.1) * 6) * 18 + noise2(y * 0.3, 2) * 20; x.fillStyle = `rgb(${v + 30},${v},${v * 0.55})`; x.fillRect(0, y, W, 1); }
    x.strokeStyle = 'rgba(40,25,10,0.8)'; x.lineWidth = 6; x.strokeRect(3, 3, W - 6, W - 6);
    x.beginPath(); x.moveTo(6, 6); x.lineTo(W - 6, W - 6); x.stroke();
    return { map: tex(c) };
  });
}

export function brickTex() {
  return cached('mud', () => {
    const W = 256, c = canvas(W, W), x = c.getContext('2d');
    x.fillStyle = '#b38a62'; x.fillRect(0, 0, W, W);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 8; i++) { const v = Math.random() * 25; x.fillStyle = `rgb(${190 + v},${150 + v},${108 + v})`; x.fillRect(i * 32 + (j % 2) * 16 - 16, j * 16 + 1, 30, 14); }
    for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(80,55,30,${Math.random() * 0.15})`; x.fillRect(Math.random() * W, Math.random() * W, 3, 3); }
    return { map: tex(c) };
  });
}

export function fabricTex(color = '#7c7454', stripes = false) {
  return cached('fab' + color + stripes, () => {
    const W = 128, c = canvas(W, W), x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, W, W);
    for (let i = 0; i < W; i += 2) { x.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`; x.fillRect(i, 0, 1, W); x.fillRect(0, i, W, 1); }
    if (stripes) { x.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < W; i += 32) x.fillRect(i, 0, 14, W); }
    return { map: tex(c) };
  });
}

export function camoTex(seed = 3) {
  return cached('camo' + seed, () => {
    const W = 128; const hf = heightField(W, W, 4, 3, seed);
    const c = paintField(hf, W, W, (v) => v > 0.12 ? [58, 60, 52] : v > -0.05 ? [96, 98, 84] : v > -0.2 ? [128, 122, 100] : [78, 80, 70]);
    return { map: tex(c) };
  });
}

export function metalTex(color = '#5c6066') {
  return cached('metal' + color, () => {
    const W = 128, c = canvas(W, W), x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, W, W);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},0.05)`; x.fillRect(Math.random() * W, Math.random() * W, Math.random() * 40, 1); }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(120,60,20,${Math.random() * 0.2})`; x.beginPath(); x.arc(Math.random() * W, Math.random() * W, Math.random() * 6, 0, 7); x.fill(); }
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, W * 0.3, W, 4); x.fillRect(0, W * 0.7, W, 4);
    return { map: tex(c) };
  });
}

export function spriteTex(kind) {
  return cached('spr' + kind, () => {
    const W = 64, c = canvas(W, W), x = c.getContext('2d');
    const g = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    if (kind === 'smoke') { g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
    else if (kind === 'flash') { g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.2, 'rgba(255,210,120,0.9)'); g.addColorStop(0.5, 'rgba(255,120,30,0.35)'); g.addColorStop(1, 'rgba(255,80,0,0)'); }
    else { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,220,150,0.8)'); g.addColorStop(1, 'rgba(255,150,50,0)'); }
    x.fillStyle = g; x.fillRect(0, 0, W, W);
    if (kind === 'flash') { x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(255,230,170,0.8)'; x.lineWidth = 3; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; x.beginPath(); x.moveTo(W / 2, W / 2); x.lineTo(W / 2 + Math.cos(a) * W * 0.48, W / 2 + Math.sin(a) * W * 0.48); x.stroke(); } }
    const t = tex(c, { repeat: false }); return t;
  });
}

export function flagTex() {
  return cached('flag', () => {
    const c = canvas(128, 80), x = c.getContext('2d');
    x.fillStyle = '#1a1a1a'; x.fillRect(0, 0, 128, 80); x.fillStyle = '#a3201c'; x.fillRect(0, 30, 128, 20);
    // corvo estilizado inventado
    x.fillStyle = '#e8e2d0'; x.beginPath(); x.moveTo(40, 40); x.lineTo(64, 22); x.lineTo(70, 34); x.lineTo(92, 30); x.lineTo(74, 44); x.lineTo(64, 58); x.closePath(); x.fill();
    return tex(c, { repeat: false });
  });
}
