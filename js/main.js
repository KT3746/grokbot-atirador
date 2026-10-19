// Inicializacao: renderizador, pos-processamento, qualidade automatica, fluxo de telas
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Game } from './game.js?v=1.0.0';
import { UI } from './ui.js?v=1.0.0';
import { Input } from './input.js?v=1.0.0';
import { sfx } from './audio.js?v=1.0.0';
import { loadSave, writeSave, MISSIONS, VERSION } from './data.js?v=1.0.0';
import { setAniso } from './textures.js?v=1.0.0';

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

// Pos-processamento
const ScopeShader = {
  uniforms: { tDiffuse: { value: null }, uK: { value: 0 }, uR: { value: 0.45 }, uAspect: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uK, uR, uAspect; varying vec2 vUv;
    void main(){ vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0); float d = length(p);
      float b = smoothstep(uR * 0.5, uR, d) * uK; vec3 c = vec3(0.0);
      vec2 dir = -(vUv - 0.5) * 0.045 * b;
      for (int i = 0; i < 8; i++) { float t = float(i) / 7.0; c.r += texture2D(tDiffuse, vUv + dir * t * 1.2).r; c.g += texture2D(tDiffuse, vUv + dir * t).g; c.b += texture2D(tDiffuse, vUv + dir * t * 0.8).b; }
      c /= 8.0;
      float vig = 1.0 - smoothstep(uR * 0.55, uR * 1.02, d) * 0.6 * uK - (1.0 - uK) * smoothstep(0.35, 1.0, d) * 0.4;
      gl_FragColor = vec4(c * vig, 1.0); }`,
};
const composer = new EffectComposer(renderer);
const game = new Game(renderer, null, store);
const renderPass = new RenderPass(new THREE.Scene(), game.camera); composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.5, 0.88); composer.addPass(bloom);
const scopePass = new ShaderPass(ScopeShader); composer.addPass(scopePass);
composer.addPass(new OutputPass());

const app = {
  playing: () => ['play', 'killcam', 'ending'].includes(game.mode),
  currentMission: () => MISSIONS[missionIdx],
  startMission(i) {
    missionIdx = i; requestFS();
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
  quit(screen = 'title') { input.releaseLock(); ui.showHud(false); ui.hideBanner(); ui.killcam(false); game.mode = 'menu'; game.scoped = false; game.timeScale = 1; game.killcam = null; ui.clearMarkers(); ui.show(screen); },
  applySettings() { sfx.setVolume(store.save.settings.vol); applyQuality(); ui.renderSettings(); },
  lockHint() { $('lockhint').classList.toggle('hidden', !(input.desktop && game.mode === 'play' && !input.locked)); },
};
const ui = new UI(store, app); game.ui = ui;
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
  bloom.enabled = q !== 'baixa'; game.applyQuality(q);
  $('fps').classList.toggle('hidden', !store.save.settings.fps);
}
function resize() {
  const a = innerWidth / innerHeight; game.baseFov = a > 1.9 ? 50 : 58;
  game.camera.aspect = a; game.camera.updateProjectionMatrix(); applyQuality();
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// Qualidade automatica pelo FPS medido
let fpsAcc = 0, fpsN = 0, fpsT = 0, goodWins = 0, ups = 0, lastFps = 60;
function autoTune(dt) {
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT < 2) return;
  const fps = fpsN / fpsAcc; lastFps = fps; fpsAcc = 0; fpsN = 0; fpsT = 0;
  if (store.save.settings.fps) $('fps').textContent = Math.round(fps) + ' FPS  ' + effQ().toUpperCase() + '  ' + renderer.getPixelRatio().toFixed(2) + 'x';
  if (store.save.settings.quality !== 'auto' || document.hidden) return;
  if (fps < 45) { goodWins = 0; if (autoQ === 'alta') autoQ = 'media'; else if (autoQ === 'media') autoQ = 'baixa'; else if (prScale > 0.7) prScale -= 0.15; else return; applyQuality(); }
  else if (fps > 58) { goodWins++; if (goodWins >= 4 && ups < 2) { goodWins = 0; if (autoQ === 'baixa' && prScale < 1) prScale = Math.min(1, prScale + 0.15); else if (autoQ === 'baixa') { autoQ = 'media'; ups++; } else if (autoQ === 'media' && !touch) { autoQ = 'alta'; ups++; } else return; applyQuality(); } }
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
  if (q === 'baixa') renderer.render(game.scene, game.camera);
  else {
    const sd = Math.min(innerHeight * 0.94, innerWidth * 0.62);
    scopePass.uniforms.uK.value = game.mode === 'killcam' ? 0 : game.scopeK; scopePass.uniforms.uR.value = sd / 2 / innerHeight; scopePass.uniforms.uAspect.value = innerWidth / innerHeight;
    bloom.strength = game.mode === 'killcam' ? 0.5 : 0.32;
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
