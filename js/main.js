// Inicializacao: renderizador, pos-processamento, qualidade automatica, fluxo de telas
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Game } from './game.js?v=1.6.0';
import { UI } from './ui.js?v=1.6.0';
import { Input } from './input.js?v=1.6.0';
import { sfx } from './audio.js?v=1.6.0';
import { loadSave, writeSave, MISSIONS, VERSION } from './data.js?v=1.6.0';
import { setAniso } from './textures.js?v=1.6.0';
import { LIFE } from './life.js?v=1.6.0';

const $ = (id) => document.getElementById(id);
const showErr = (m) => { const e = $('err'); e.textContent = 'Erro: ' + m; e.classList.remove('hidden'); };
window.addEventListener('error', (e) => showErr(e.message));

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const store = { save: loadSave(), writeSave: (s) => writeSave(s) };
const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
let autoQ = touch ? 'media' : 'alta'; let missionIdx = 0; let prevMode = 'play';

// Pos-processamento: um passe final junta luneta, tonalizacao ACES, correcao de cor por mapa,
// vinheta, sujeira na lente e granulado (economiza preenchimento no celular)
function dirtTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) { const px = Math.random() * S, py = Math.random() * S, r = 3 + Math.random() * 22; const g = x.createRadialGradient(px, py, 0, px, py, r); const a = 0.05 + Math.random() * 0.18; g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.7, `rgba(255,255,255,${a * 0.4})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
  x.strokeStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 8; i++) { x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const px = Math.random() * S, py = Math.random() * S; x.moveTo(px, py); x.bezierCurveTo(px + 30, py + 10, px + 50, py - 20, px + 80 * Math.random(), py + 60 * Math.random()); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
const GRADES = {
  cidade: { lift: [0.0, 0.008, 0.022], gain: [1.03, 1.0, 0.97], sat: 1.06, con: 1.05 },
  montanha: { lift: [0.004, 0.012, 0.02], gain: [0.98, 1.0, 1.03], sat: 0.95, con: 1.03 },
  deserto: { lift: [0.022, 0.01, 0.0], gain: [1.05, 1.0, 0.92], sat: 1.08, con: 1.07 },
  noite: { lift: [0.0, 0.012, 0.04], gain: [0.9, 0.98, 1.1], sat: 0.85, con: 1.04 },
};
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, tDirt: { value: dirtTexture() }, uK: { value: 0 }, uR: { value: 0.45 }, uAspect: { value: 1 }, uExposure: { value: 1 }, uTime: { value: 0 },
    uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1 }, uCon: { value: 1 }, uGrain: { value: 0.035 }, uVig: { value: 0.32 },
    uSun: { value: new THREE.Vector2(0.5, 0.5) }, uSunVis: { value: 0 }, uDirt: { value: 1 }, uNV: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse, tDirt; uniform float uK, uR, uAspect, uExposure, uTime, uSat, uCon, uGrain, uVig, uSunVis, uDirt, uNV; uniform vec3 uLift, uGain; uniform vec2 uSun; varying vec2 vUv;
    vec3 rrtFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 acesTM(vec3 c){ const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
      const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
      c *= uExposure / 0.6; c = I * c; c = rrtFit(c); c = O * c; return clamp(c, 0.0, 1.0); }
    vec3 toSRGB(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 37.0) * 43758.5453); }
    void main(){ vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0); float d = length(p);
      vec3 c;
      if (uK > 0.001) {
        float b = smoothstep(uR * 0.5, uR, d) * uK; vec2 dir = -(vUv - 0.5) * 0.045 * b; c = vec3(0.0);
        for (int i = 0; i < 8; i++) { float t = float(i) / 7.0; c.r += texture2D(tDiffuse, vUv + dir * t * 1.2).r; c.g += texture2D(tDiffuse, vUv + dir * t).g; c.b += texture2D(tDiffuse, vUv + dir * t * 0.8).b; }
        c /= 8.0;
      } else c = texture2D(tDiffuse, vUv).rgb;
      // sujeira na lente: acende perto do sol e em pontos muito claros
      vec3 dirt = texture2D(tDirt, vUv * vec2(uAspect, 1.0) * 0.6).rgb;
      float sd = length((vUv - uSun) * vec2(uAspect, 1.0)); float sunAmt = uSunVis * (1.0 - smoothstep(0.0, 0.6, sd));
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c += dirt * (sunAmt * 0.1 + max(lum - 1.8, 0.0) * 0.06) * uDirt * vec3(1.0, 0.92, 0.8);
      c = acesTM(c); c = toSRGB(c);
      // correcao de cor do mapa
      c = c * uGain + uLift * (1.0 - c); c = (c - 0.5) * uCon + 0.5; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat);
      float vig = 1.0 - smoothstep(uR * 0.55, uR * 1.02, d) * 0.6 * uK - (1.0 - uK) * smoothstep(0.3, 1.05, d) * uVig;
      c *= vig;
      if (uNV > 0.001) { // visao noturna: verde, ganho alto, chiado e linhas
        float L = dot(c, vec3(0.2126, 0.7152, 0.0722)); float gg = smoothstep(0.0, 1.0, pow(clamp(L * 3.2, 0.0, 1.0), 0.8));
        vec3 nv = vec3(0.3, 1.0, 0.45) * (0.05 + gg * 0.95); nv *= 0.92 + 0.08 * sin(vUv.y * 1400.0); nv += (hash(vUv * 517.0) - 0.5) * 0.08;
        nv *= vig; c = mix(c, nv, uNV); }
      c += (hash(vUv * 913.0) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`,
};
const composer = new EffectComposer(renderer);
const game = new Game(renderer, null, store);
const renderPass = new RenderPass(new THREE.Scene(), game.camera); composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.26, 0.45, 0.93); composer.addPass(bloom);
const scopePass = new ShaderPass(FinalShader); composer.addPass(scopePass);
const _sv = new THREE.Vector3(), _fw = new THREE.Vector3();

const app = {
  playing: () => ['play', 'killcam', 'ending'].includes(game.mode),
  currentMission: () => MISSIONS[missionIdx],
  startMission(i) {
    missionIdx = i; requestFS(); game.mode = 'loading'; game.setHold(false);
    ui.hideScreens(); $('loading').classList.remove('hidden'); $('l-text').textContent = 'Preparando: ' + MISSIONS[i].name + '...';
    setTimeout(() => {
      try { game.quality = effQ(); game.load(MISSIONS[i]); renderPass.scene = game.scene; applyQuality(); } catch (e) { showErr(e.message); console.error(e); return; }
      $('loading').classList.add('hidden'); ui.hideBanner(); ui.scope(false); ui.showHud(true);
      game.begin(); ui.updateHud(game); this.lockHint();
      if (store.save.settings.tutorial) { game.mode = 'paused'; ui.tutorial(!input.desktop); }
      else if (input.desktop) input.requestLock();
    }, 60);
  },
  pause() { if (!['play'].includes(game.mode)) return; prevMode = game.mode; game.mode = 'paused'; game.setHold(false); input.releaseLock(); ui.show('pause'); },
  resume(fromTut) { if (game.mode !== 'paused') return; ui.hideScreens(); game.mode = 'play'; ui.showHud(true); ui.scope(game.scoped); if (input.desktop) input.requestLock(); this.lockHint(); },
  restart() { ui.hideScreens(); $('result').classList.add('hidden'); this.startMission(missionIdx); },
  next() { if (missionIdx < MISSIONS.length - 1) this.startMission(missionIdx + 1); },
  quit(screen = 'title') { game.binoc = false; ui.binoc(false); game.nv = false; game.nvK = 0; ui.nv(false); sfx.setRain(0); input.releaseLock(); ui.showHud(false); ui.hideBanner(); ui.killcam(false); game.mode = 'menu'; game.scoped = false; game.timeScale = 1; game.killcam = null; ui.clearMarkers(); ui.show(screen); },
  applySettings() { sfx.setVolume(store.save.settings.vol); applyQuality(); ui.renderSettings(); },
  lockHint() { $('lockhint').classList.toggle('hidden', !(input.desktop && game.mode === 'play' && !input.locked)); },
};
const ui = new UI(store, app); game.ui = ui; app.game = game;
const input = new Input(game, app, canvas);

function requestFS() {
  if (!touch) return;
  const el = document.documentElement;
  try {
    const p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' });
    const lock = () => { try { screen.orientation?.lock?.('landscape').catch(() => { }); } catch (_) { } };
    if (p && p.then) p.then(lock).catch(() => { }); else lock();
  } catch (_) { }
}
document.addEventListener('pointerdown', () => { sfx.init(); }, { once: true });

function effQ() { const q = store.save.settings.quality; return q === 'auto' ? autoQ : q; }
let prScale = 1;
function applyQuality() {
  const q = effQ(); const dpr = window.devicePixelRatio || 1;
  const pr = (q === 'alta' ? Math.min(dpr, 2) : q === 'media' ? Math.min(dpr, 1.5) : 1) * (q === 'baixa' ? prScale : 1);
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
  bloom.enabled = q !== 'baixa'; game.applyQuality(q); LIFE.pr = pr; LIFE.height = innerHeight;
  scopePass.uniforms.uGrain.value = q === 'alta' ? 0.035 : 0.025; scopePass.uniforms.uDirt.value = q === 'alta' ? 1 : 0.4;
  $('fps').classList.toggle('hidden', !store.save.settings.fps);
}
function resize() {
  const a = innerWidth / innerHeight; game.baseFov = a > 1.9 ? 50 : 58;
  game.camera.aspect = a; game.camera.updateProjectionMatrix(); applyQuality();
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// Qualidade automatica pelo FPS medido
let fpsAcc = 0, fpsN = 0, fpsT = 0, goodWins = 0, ups = 0, lastFps = 60, worst = 0, coolT = 0;
// no celular: cai rapido abaixo de 50 fps e sobe devagar (so depois de uns 12 s bons)
function autoTune(dt) {
  fpsAcc += dt; fpsN++; fpsT += dt; worst = Math.max(worst, dt); coolT = Math.max(0, coolT - dt);
  const win = touch ? 1.0 : 2.0; if (fpsT < win) return;
  const fps = fpsN / fpsAcc; lastFps = fps; const low = 1 / Math.max(worst, 1e-3); fpsAcc = 0; fpsN = 0; fpsT = 0; worst = 0;
  if (store.save.settings.fps) { const e = $('fps'); e.textContent = Math.round(fps) + ' FPS | pior ' + Math.round(Math.min(low, fps)) + ' | ' + ({ alta: 'ALTA', media: 'MÉDIA', baixa: 'BAIXA' }[effQ()] || effQ()) + (store.save.settings.quality === 'auto' ? ' (auto)' : '') + ' | ' + renderer.getPixelRatio().toFixed(2) + 'x';
    e.className = fps >= 55 ? 'good' : fps >= 40 ? 'mid' : 'bad'; }
  if (store.save.settings.quality !== 'auto' || document.hidden || !game.scene || game.mode === 'loading') return;
  const lowT = touch ? 50 : 45, highT = 58, need = touch ? 12 : 4, maxUps = touch ? 1 : 2;
  if (fps < lowT) { goodWins = 0; coolT = touch ? 25 : 10; if (autoQ === 'alta') autoQ = 'media'; else if (autoQ === 'media') autoQ = 'baixa'; else if (prScale > 0.7) prScale -= 0.15; else return; applyQuality(); }
  else if (fps > highT && coolT <= 0) { goodWins++; if (goodWins >= need && ups < maxUps) { goodWins = 0; if (autoQ === 'baixa' && prScale < 1) prScale = Math.min(1, prScale + 0.15); else if (autoQ === 'baixa') { autoQ = 'media'; ups++; } else if (autoQ === 'media' && !touch) { autoQ = 'alta'; ups++; } else return; applyQuality(); } }
  else goodWins = 0;
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0.0001, (now - last) / 1000); const dt = Math.min(0.05, raw); last = now;
  if (game.mode !== 'paused') game.update(dt);
  autoTune(Math.min(raw, 1));
  if (!game.scene) return;
  const q = effQ();
  if (q === 'baixa' && game.nvK < 0.01) renderer.render(game.scene, game.camera);
  else {
    const sd = Math.min(innerHeight * 0.94, innerWidth * 0.62);
    scopePass.uniforms.uK.value = game.mode === 'killcam' || game.mode === 'replay' ? 0 : game.scopeK; scopePass.uniforms.uR.value = sd / 2 / innerHeight; scopePass.uniforms.uAspect.value = innerWidth / innerHeight;
    bloom.strength = game.mode === 'killcam' || game.mode === 'replay' ? 0.32 : 0.26;
    const U = scopePass.uniforms; const m = game.mission; const gr = GRADES[m && m.sky.night ? 'noite' : (m ? m.map : 'cidade')] || GRADES.cidade;
    U.uLift.value.fromArray(gr.lift); U.uGain.value.fromArray(gr.gain); U.uSat.value = gr.sat; U.uCon.value = gr.con; U.uExposure.value = renderer.toneMappingExposure; U.uNV.value = game.nvK || 0; U.uTime.value = (now % 10000) / 1000;
    if (game.envInfo) { _sv.copy(game.envInfo.sunDir).multiplyScalar(1000).add(game.camera.position).project(game.camera); game.camera.getWorldDirection(_fw); const facing = _fw.dot(game.envInfo.sunDir);
      U.uSun.value.set(_sv.x * 0.5 + 0.5, _sv.y * 0.5 + 0.5); U.uSunVis.value = _sv.z < 1 ? Math.max(0, (facing - 0.7) / 0.3) * (m && m.sky.night ? 0 : 1) * (1 - game.scopeK * 0.7) : 0; }
    composer.render(dt);
  }
}

// Inicio: cenario do menu ao fundo
function boot() {
  try {
    sfx.setVolume(store.save.settings.vol);
    game.quality = effQ(); resize();
    game.load(MISSIONS[0], true); renderPass.scene = game.scene; applyQuality();
    ui.show('title'); $('boot').classList.add('hidden');
    requestAnimationFrame(frame);
  } catch (e) { showErr(e.message); console.error(e); }
}
boot();
// Atalho de teste (usado na verificacao automatica)
window.__atirador = { game, app, ui, store, version: VERSION, fps: () => lastFps, effQ };
