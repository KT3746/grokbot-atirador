// Controles: toque (celular) e mouse/teclado (PC)
import { sfx } from './audio.js?v=1.5.0';

export class Input {
  constructor(game, app, canvas) {
    this.g = game; this.app = app; this.canvas = canvas; this.aimId = null; this.last = null; this.locked = false; this.drag = null;
    this.desktop = matchMedia('(hover: hover) and (pointer: fine)').matches && !('ontouchstart' in window);
    document.body.classList.toggle('desktop', this.desktop);
    const $ = (id) => document.getElementById(id);
    const btn = (id, down, up) => { const el = $(id); el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); sfx.init(); el.classList.add('on'); down && down(); try { el.setPointerCapture(e.pointerId); } catch (_) { } }); const rel = (e) => { el.classList.remove('on'); up && up(); }; el.addEventListener('pointerup', rel); el.addEventListener('pointercancel', rel); el.addEventListener('lostpointercapture', rel); };
    btn('b-fire', () => this.g.fire());
    btn('b-zoom', () => this.g.toggleScope());
    btn('b-reload', () => this.g.reload());
    btn('b-spot', () => this.g.toggleBinoc());
    btn('b-nv', () => this.g.toggleNV());
    btn('b-breath', () => this.g.setHold(true), () => this.g.setHold(false));
    btn('b-pause', () => this.app.pause());
    // mirar arrastando o dedo
    window.addEventListener('pointerdown', (e) => {
      if (this.g.mode !== 'play') return;
      if (e.target.closest && e.target.closest('button, .screen, #tutorial')) return;
      if (e.pointerType === 'mouse') {
        if (this.locked) { if (e.button === 0) this.g.fire(); else if (e.button === 2) this.g.toggleScope(); return; }
        this.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
        return;
      }
      if (this.aimId === null) { this.aimId = e.pointerId; this.last = { x: e.clientX, y: e.clientY }; }
    }, { passive: false });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        if (this.locked) { this.g.aim(e.movementX * 0.9, e.movementY * 0.9); return; }
        if (this.drag) { const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y; this.drag.moved += Math.abs(dx) + Math.abs(dy); this.drag.x = e.clientX; this.drag.y = e.clientY; this.g.aim(dx, dy); }
        return;
      }
      if (e.pointerId !== this.aimId) return;
      const dx = e.clientX - this.last.x, dy = e.clientY - this.last.y; this.last = { x: e.clientX, y: e.clientY };
      this.g.aim(dx * 1.0, dy * 1.0);
    }, { passive: true });
    const end = (e) => {
      if (e.pointerType === 'mouse') {
        if (this.drag && this.g.mode === 'play') { if (this.drag.moved < 5) { if (this.drag.button === 2) this.g.toggleScope(); else this.requestLock(); } }
        this.drag = null; return;
      }
      if (e.pointerId === this.aimId) { this.aimId = null; }
    };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (this.g.mode === 'play') { e.preventDefault(); this.g.zoomStep(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.g.mode !== 'play') { if ((e.key === 'Escape' || e.key === 'p') && this.g.mode === 'paused') this.app.resume(); return; }
      if (e.key === 'Shift' || e.code === 'Space') { this.g.setHold(true); e.preventDefault(); }
      else if (e.key === 'r' || e.key === 'R') this.g.reload();
      else if (e.key === 'b' || e.key === 'B') this.g.toggleBinoc();
      else if (e.key === 'n' || e.key === 'N') this.g.toggleNV();
      else if (e.key === 'e' || e.key === 'E' || e.key === 'z' || e.key === 'Z') this.g.toggleScope();
      else if (e.key === 'q' || e.key === 'Q') this.g.toggleScope(false);
      else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') this.app.pause();
      else if (e.key === 'f' || e.key === 'F') this.g.fire();
    });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift' || e.code === 'Space') this.g.setHold(false); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.g.mode === 'play' && this.desktop && this.wasLocked) this.app.pause();
      this.wasLocked = this.locked; this.app.lockHint();
    });
    window.addEventListener('blur', () => { this.g.setHold(false); if (this.g.mode === 'play') this.app.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.g.mode === 'play') this.app.pause(); });
  }
  requestLock() { if (!this.desktop) return; try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (_) { } }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }
}
