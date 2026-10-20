// Interface: telas, HUD, marcadores, resultados
import * as THREE from 'three';
import { WEAPONS, UPGRADES, MAPS, MISSIONS, missionUnlocked, writeSave, resetSave, totalStars } from './data.js?v=1.2.0';
import { sfx } from './audio.js?v=1.2.0';
import { fmtTime, fmtMoney, clamp } from './util.js?v=1.2.0';

const $ = (id) => document.getElementById(id);
const ART = {
  cidade: '<svg class="art" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6a04d"/><stop offset=".55" stop-color="#8d4a5e"/><stop offset="1" stop-color="#1e2638"/></linearGradient></defs><rect width="300" height="200" fill="url(#gc)"/><circle cx="210" cy="86" r="22" fill="#ffd9a0" opacity=".9"/><g fill="#2a2333"><rect x="0" y="110" width="30" height="90"/><rect x="28" y="80" width="26" height="120"/><rect x="56" y="98" width="34" height="102"/><rect x="92" y="60" width="22" height="140"/><rect x="116" y="104" width="30" height="96"/><rect x="150" y="74" width="28" height="126"/><rect x="180" y="118" width="40" height="82"/><rect x="222" y="66" width="24" height="134"/><rect x="248" y="96" width="52" height="104"/></g><g fill="#ffcf7a" opacity=".55"><rect x="34" y="90" width="4" height="4"/><rect x="44" y="104" width="4" height="4"/><rect x="98" y="72" width="4" height="4"/><rect x="156" y="86" width="4" height="4"/><rect x="230" y="80" width="4" height="4"/><rect x="164" y="110" width="4" height="4"/></g></svg>',
  montanha: '<svg class="art" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3f2"/><stop offset=".6" stop-color="#6f8ea3"/><stop offset="1" stop-color="#24323a"/></linearGradient></defs><rect width="300" height="200" fill="url(#gm)"/><polygon points="0,140 60,60 100,110 150,40 210,120 250,70 300,130 300,200 0,200" fill="#4c6170"/><polygon points="150,40 135,62 150,58 165,66" fill="#f4f8fb"/><polygon points="60,60 50,74 62,70 72,78" fill="#f4f8fb"/><polygon points="0,170 50,130 110,160 170,120 240,165 300,140 300,200 0,200" fill="#22362c"/><g fill="#18281f"><polygon points="30,180 38,150 46,180"/><polygon points="60,185 70,148 80,185"/><polygon points="220,182 230,150 240,182"/><polygon points="255,186 263,160 271,186"/></g></svg>',
  deserto: '<svg class="art" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd58a"/><stop offset=".55" stop-color="#d08a45"/><stop offset="1" stop-color="#5a3220"/></linearGradient></defs><rect width="300" height="200" fill="url(#gd)"/><circle cx="90" cy="80" r="26" fill="#fff0c0" opacity=".9"/><path d="M180 120 h60 v-30 h20 v30 h40 v80 h-120z" fill="#8a4a2a"/><path d="M0 150 Q70 110 150 150 T300 140 V200 H0z" fill="#b8763e"/><path d="M0 175 Q90 145 180 175 T300 170 V200 H0z" fill="#8f5530"/><g fill="#5a3320"><rect x="40" y="150" width="20" height="14"/><rect x="62" y="146" width="14" height="18"/></g></svg>',
};
const RIFLE_SVG = '<svg viewBox="0 0 200 40"><path d="M4 22 L40 18 L60 18 L64 14 L120 14 L124 17 L196 17 L196 20 L124 21 L110 26 L74 26 L66 34 L52 34 L56 26 L40 26 L4 30 Z" fill="#cfd4d8"/><rect x="72" y="6" width="44" height="7" rx="3" fill="#9aa3aa"/><rect x="66" y="7" width="8" height="5" fill="#9aa3aa"/><rect x="114" y="5" width="9" height="9" rx="2" fill="#9aa3aa"/></svg>';

export class UI {
  constructor(store, app) {
    this.store = store; this.app = app; this.markers = []; this.cache = {}; this.toastT = 0; this.returnTo = 'title';
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { sfx.init(); sfx.ui(); this.show(b.dataset.go); }));
    $('b-start').onclick = () => { sfx.init(); sfx.ui(); this.app.startMission(this.briefIdx); };
    $('b-change').onclick = () => { sfx.ui(); this.returnTo = 'brief'; this.show('arsenal', true); };
    $('a-back').onclick = () => { sfx.uiBack(); this.show(this.returnTo); };
    $('s-back').onclick = () => { sfx.uiBack(); this.show(this.settingsReturn || 'title'); };
    $('p-resume').onclick = () => { sfx.ui(); this.app.resume(); };
    $('p-restart').onclick = () => { sfx.ui(); this.app.restart(); };
    $('p-settings').onclick = () => { sfx.ui(); this.settingsReturn = 'pause'; this.show('settings', true); };
    $('p-quit').onclick = () => { sfx.uiBack(); this.app.quit(); };
    $('r-menu').onclick = () => { sfx.uiBack(); this.app.quit('maps'); };
    $('r-retry').onclick = () => { sfx.ui(); this.app.restart(); };
    $('r-next').onclick = () => { sfx.ui(); this.app.next(); };
    $('tut-ok').onclick = () => { sfx.ui(); $('tutorial').classList.add('hidden'); this.store.save.settings.tutorial = false; writeSave(this.store.save); this.app.resume(true); };
    this.bindSettings();
  }
  get save() { return this.store.save; }
  hideScreens() { document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden')); }
  show(id, keepReturn) {
    this.hideScreens();
    if (id === 'settings' && !keepReturn) this.settingsReturn = 'title';
    if (id === 'arsenal' && !keepReturn) this.returnTo = 'title';
    const el = $(id); if (!el) return; el.classList.remove('hidden');
    if (id === 'title') $('t-money').textContent = fmtMoney(this.save.money) + '   ★ ' + totalStars(this.save);
    if (id === 'maps') this.renderMaps();
    if (id === 'arsenal') this.renderArsenal();
    if (id === 'settings') this.renderSettings();
    if (id === 'brief') this.renderBrief(this.briefIdx);
    this.current = id;
  }
  renderMaps() {
    $('m-money').textContent = fmtMoney(this.save.money);
    const list = $('map-list'); list.innerHTML = '';
    MAPS.forEach(m => {
      const c = document.createElement('div'); c.className = 'mapcard';
      const ms = MISSIONS.map((x, i) => ({ x, i })).filter(o => o.x.map === m.id);
      c.innerHTML = ART[m.id] + `<div class="info"><h3>${m.name}</h3><p>${m.desc}</p><div class="mlist"></div></div>`;
      const ml = c.querySelector('.mlist');
      ms.forEach(({ x, i }, k) => {
        const un = missionUnlocked(this.save, i); const st = this.save.stars[x.id] || 0;
        const b = document.createElement('button'); b.className = 'mbtn' + (un ? '' : ' locked') + (un && !this.save.done[x.id] ? ' new' : '');
        b.innerHTML = `<span class="n">${un ? k + 1 : '🔒'}</span><span>${x.name}</span><span class="st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>`;
        b.onclick = () => { if (!un) { sfx.empty(); this.toastScreen('Termine a missão anterior para liberar.'); return; } sfx.ui(); this.briefIdx = i; this.show('brief'); };
        ml.appendChild(b);
      });
      list.appendChild(c);
    });
  }
  toastScreen(t) { this.toast(t); $('hud').classList.remove('hidden'); clearTimeout(this._ts); this._ts = setTimeout(() => { if (!this.app.playing()) $('hud').classList.add('hidden'); }, 1800); }
  renderBrief(i) {
    const m = MISSIONS[i]; const w = WEAPONS.find(x => x.id === this.save.weapon);
    $('b-title').textContent = m.name; $('b-desc').textContent = m.brief; $('b-money').textContent = fmtMoney(this.save.money);
    const mercs = m.actors.filter(a => a.kind === 'merc').length, hv = m.actors.find(a => a.kind === 'hvt'), hos = m.actors.filter(a => a.kind === 'hostage').length, civ = m.actors.filter(a => a.kind === 'civil').length;
    const obj = [];
    if (m.goal === 'hvt') obj.push(`Derrube o alvo principal: <b>${hv.name}</b>`), obj.push(`Guardas (opcional, dá bônus): ${mercs}`);
    else obj.push(`Derrube todos os inimigos: <b>${mercs + (hv ? 1 : 0)}</b>`);
    if (hos) obj.push(`Não acerte ${hos > 1 ? 'os reféns' : 'o refém'} (${hos}). Se acertar, a missão falha.`);
    if (civ) obj.push(`Cuidado com os civis (${civ}). Acertar um tira dinheiro e estrelas.`);
    obj.push('Errar perto dos inimigos enche o alerta. Alerta cheio: missão falha.');
    obj.push(`Estrelas: completar, acertar 70% dos tiros, terminar em até ${fmtTime(m.par)}.`);
    $('b-obj').innerHTML = obj.map(o => `<li>${o}</li>`).join('');
    $('b-wind').textContent = m.wind.speed.toFixed(1).replace('.', ',') + ' m/s'; $('b-time').textContent = fmtTime(m.time); $('b-reward').textContent = fmtMoney(m.reward); $('b-weapon').textContent = w.name;
  }
  renderArsenal() {
    const s = this.save; $('a-money').textContent = fmtMoney(s.money);
    const wl = $('w-list'); wl.innerHTML = '';
    const maxZ = 18 * 1.45;
    WEAPONS.forEach(w => {
      const own = s.owned.includes(w.id), eq = s.weapon === w.id;
      const c = document.createElement('div'); c.className = 'wcard' + (eq ? ' eq' : '');
      const bar = (lab, v) => `<div class="stat"><span>${lab}</span><div class="b"><i style="width:${Math.round(clamp(v, 0.05, 1) * 100)}%"></i></div></div>`;
      c.innerHTML = `<h4>${w.name}</h4>${RIFLE_SVG}<div class="d">${w.desc}</div>` + bar('Dano', w.damage / 220) + bar('Zoom máx.', w.zooms[w.zooms.length - 1] / 24) + bar('Estabilidade', w.stability) + bar('Balas', w.mag / 10) + bar('Cadência', 0.3 / w.bolt);
      const b = document.createElement('button'); b.className = 'btn small' + (!own ? ' primary' : '');
      if (eq) { b.textContent = 'EQUIPADA'; b.disabled = true; }
      else if (own) { b.textContent = 'EQUIPAR'; b.onclick = () => { sfx.ui(); s.weapon = w.id; writeSave(s); this.renderArsenal(); }; }
      else { b.textContent = 'COMPRAR ' + fmtMoney(w.price); if (s.money < w.price) b.disabled = true; b.onclick = () => { if (s.money < w.price) return; s.money -= w.price; s.owned.push(w.id); s.weapon = w.id; writeSave(s); sfx.reload(); this.renderArsenal(); }; }
      c.appendChild(b); wl.appendChild(c);
    });
    const ul = $('u-list'); ul.innerHTML = '';
    UPGRADES.forEach(u => {
      const lv = s.up[u.id] || 0; const el = document.createElement('div'); el.className = 'up';
      el.innerHTML = `<div><div class="t">${u.name}</div><div class="d">${u.desc}</div><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>`;
      const b = document.createElement('button'); b.className = 'btn small';
      if (lv >= u.max) { b.textContent = 'MÁXIMO'; b.disabled = true; }
      else { const c = u.cost[lv]; b.textContent = fmtMoney(c); if (s.money < c) b.disabled = true; b.onclick = () => { if (s.money < c) return; s.money -= c; s.up[u.id] = lv + 1; writeSave(s); sfx.bolt(); this.renderArsenal(); }; }
      el.appendChild(b); ul.appendChild(el);
    });
  }
  bindSettings() {
    $('s-quality').querySelectorAll('button').forEach(b => b.onclick = () => { sfx.ui(); this.save.settings.quality = b.dataset.q; writeSave(this.save); this.app.applySettings(); this.renderSettings(); });
    $('s-sens').oninput = (e) => { this.save.settings.sens = +e.target.value; writeSave(this.save); };
    $('s-vol').oninput = (e) => { this.save.settings.vol = +e.target.value; sfx.setVolume(this.save.settings.vol); writeSave(this.save); };
    $('s-vol').onchange = () => sfx.ui();
    $('s-assist').onclick = () => { sfx.ui(); this.save.settings.assist = !this.save.settings.assist; writeSave(this.save); this.renderSettings(); };
    $('s-fps').onclick = () => { sfx.ui(); this.save.settings.fps = !this.save.settings.fps; writeSave(this.save); this.renderSettings(); };
    $('s-reset').onclick = () => {
      const b = $('s-reset'); if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'TEM CERTEZA?'; sfx.empty(); setTimeout(() => { delete b.dataset.sure; b.textContent = 'APAGAR'; }, 3000); return; }
      this.store.save = resetSave(); writeSave(this.store.save); delete b.dataset.sure; b.textContent = 'APAGADO'; this.app.applySettings(); this.renderSettings();
    };
  }
  renderSettings() {
    const st = this.save.settings;
    $('s-quality').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.q === st.quality));
    $('s-sens').value = st.sens; $('s-vol').value = st.vol;
    $('s-assist').classList.toggle('on', !!st.assist); $('s-fps').classList.toggle('on', !!st.fps);
    $('fps').classList.toggle('hidden', !st.fps);
  }
  tutorial(touch) {
    const items = touch ? [
      'Arraste o dedo em qualquer lugar da tela para mirar.',
      'Toque em <b>ZOOM</b> para abrir a luneta. Toque de novo para aumentar o zoom.',
      'Segure <b>PRENDER RESPIRAÇÃO</b> para a mira parar de balançar.',
      'Toque em <b>ATIRAR</b>. A bala demora um pouco e cai com a distância.',
      'Toque em <b>BINÓCULO</b> e deixe o centro sobre um inimigo: ele fica <b>marcado</b> com um quadro vermelho.',
      'Olhe o <b>vento</b> no alto da tela: ele empurra a bala para o lado.',
      'Mire na cabeça para ganhar mais dinheiro. Nunca acerte reféns ou civis (marcados em azul).',
    ] : [
      'Clique na tela para prender o mouse. Mexa o mouse para mirar.',
      '<b>Botão direito</b>: abre a luneta. <b>Rodinha</b>: muda o zoom.',
      '<b>Shift</b> (segure): prende a respiração e a mira para de balançar.',
      '<b>Botão esquerdo</b>: atira. <b>R</b>: recarrega. <b>Esc</b>: pausa.',
      '<b>B</b>: binóculo. Deixe o centro sobre um inimigo para <b>marcar</b> ele com um quadro vermelho.',
      'Olhe o <b>vento</b> no alto da tela: ele empurra a bala para o lado.',
      'Mire na cabeça para ganhar mais dinheiro. Nunca acerte reféns ou civis (marcados em azul).',
    ];
    $('tut-body').innerHTML = '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';
    $('tutorial').classList.remove('hidden');
  }
  // ---------- HUD ----------
  showHud(v) { $('hud').classList.toggle('hidden', !v); if (!v) { $('scope').classList.add('hidden'); } }
  scope(v) { $('scope').classList.toggle('hidden', !v); $('b-zoom').classList.toggle('on', v); }
  scopeLift(v) { if (this._lift !== v) { this._lift = v; $('scope').classList.toggle('lift', v); } }
  binoc(v) { $('binoc').classList.toggle('hidden', !v); $('b-spot').classList.toggle('on', v); }
  clearMarkers() { $('markers').innerHTML = ''; this.markers = []; }
  buildMarkers(actors) {
    this.clearMarkers();
    actors.forEach(a => {
      const el = document.createElement('div'); el.className = 'mk ' + a.kind;
      const label = a.kind === 'hvt' ? (a.name || 'ALVO') : a.kind === 'hostage' ? 'REFÉM: NÃO ATIRE' : a.kind === 'civil' ? 'CIVIL' : '!';
      el.innerHTML = `<div class="tx">${label}</div><div class="ic"></div><div class="br"></div>`;
      $('markers').appendChild(el); this.markers.push({ a, el, tx: el.querySelector('.tx'), br: el.querySelector('.br'), vis: true, cls: '' });
    });
  }
  toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(this._tt); this._tt = setTimeout(() => e.classList.remove('on'), 1800); }
  popup(a, cls = 'ok', b = '') { const e = $('popup'); e.className = ''; void e.offsetWidth; e.className = 'show ' + cls; e.querySelector('.p1').textContent = a; e.querySelector('.p2').textContent = b; }
  hitmark(kill) { const e = $('hitmark'); e.className = ''; if (kill === null) return; void e.offsetWidth; e.className = kill ? 'kill' : 'hit'; }
  shotFx(scoped, bolt) { const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); if (bolt || true) { const s = $('shell'); s.classList.remove('go'); void s.offsetWidth; setTimeout(() => s.classList.add('go'), bolt ? 450 : 30); } }
  killcam(v, dist) { $('letterbox').classList.toggle('hidden', !v); if (v) { $('kc-dist').textContent = dist + ' m'; $('scope').classList.add('hidden'); } }
  banner(t, win) { const b = $('banner'); b.textContent = t; b.className = win ? 'win' : 'lose'; }
  hideBanner() { $('banner').className = 'hidden'; }
  setText(id, v) { if (this.cache[id] !== v) { this.cache[id] = v; $(id).textContent = v; } }
  updateHud(g) {
    if (g.mode === 'menu' || !g.mission) return;
    const s = g.stats(), m = g.mission;
    this.setText('h-name', m.name.toUpperCase());
    const foes = g.actors.filter(a => a.kind === 'merc' || a.kind === 'hvt'); const dead = foes.filter(a => !a.alive).length;
    if (m.goal === 'hvt') { const h = g.actors.find(a => a.kind === 'hvt'); this.setText('h-obj', h.alive ? 'Alvo: ' + h.name : 'Alvo abatido'); }
    else this.setText('h-obj', 'Inimigos: ' + dead + '/' + foes.length);
    this.setText('h-time', fmtTime(g.timeLeft)); $('h-time').classList.toggle('low', g.timeLeft < 30);
    const al = $('h-alert'); al.style.width = g.alertMeter.toFixed(0) + '%'; al.style.background = g.alertMeter > 66 ? '#ff4b3b' : g.alertMeter > 33 ? '#ffc93a' : '#5bd36a';
    // vento relativo a camera
    const cam = g.camera; const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize(); const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
    const wx = g.wind.dot(right), wz = g.wind.dot(fwd); const ang = Math.atan2(wx, wz) * 180 / Math.PI;
    $('h-warrow').style.transform = `rotate(${(ang - 90).toFixed(0)}deg)`;
    this.setText('h-wspeed', g.wind.length().toFixed(1).replace('.', ',') + ' m/s');
    this.setText('h-wtext', Math.abs(wx) < 0.4 ? 'Vento quase não desvia' : 'Empurra a bala para a ' + (wx > 0 ? 'direita' : 'esquerda'));
    // municao
    const bl = $('h-bullets'); if (this.cache.mag !== s.mag + ':' + g.ammo) { this.cache.mag = s.mag + ':' + g.ammo; bl.innerHTML = Array.from({ length: s.mag }, (_, i) => `<i class="${i < g.ammo ? '' : 'off'}"></i>`).join(''); }
    this.setText('h-ammo', g.reloadT > 0 ? 'RECARREGANDO' : g.ammo + '/' + s.mag);
    $('h-reload').style.width = (g.reloadT > 0 ? (1 - g.reloadT / s.reload) * 100 : g.boltT > 0 ? (1 - g.boltT / s.bolt) * 100 : 100).toFixed(0) + '%';
    $('h-breath').style.width = (g.breath * 100).toFixed(0) + '%'; $('h-breath').style.background = g.shake > 0 ? '#ff6b5e' : g.holding ? '#bfe8ff' : '#8fd0ff';
    $('b-breath').classList.toggle('on', g.holding);
    // mira
    const zs = s.zooms; const sd = Math.min(innerHeight * 0.94, innerWidth * 0.62); document.documentElement.style.setProperty('--sd', sd.toFixed(0) + 'px');
    if (g.scoped) {
      this.setText('s-zoom', zs[Math.min(g.zoomIdx, zs.length - 1)].toFixed(0) + 'x');
      this.setText('s-dist', g.rangeNone ? '--- m' : 'Distância ' + Math.round(g.range) + ' m');
      const ra = g.rangeHit; this.setText('s-target', ra && ra.alive ? (ra.kind === 'hostage' ? 'REFÉM! NÃO ATIRE' : ra.kind === 'civil' ? 'CIVIL! NÃO ATIRE' : ra.kind === 'hvt' ? 'ALVO PRINCIPAL' : 'INIMIGO') : '');
      const pd = $('predict');
      if (s.predict && !g.rangeNone) { const o = g.predictOffset(); const fr = g.fov * Math.PI / 180; const px = (o.lat / o.R) / fr * innerHeight; const py = (o.drop / o.R) / fr * innerHeight; pd.classList.remove('hidden'); pd.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`; }
      else pd.classList.add('hidden');
    }
    // marcadores
    const v = new THREE.Vector3(), v2 = new THREE.Vector3(), W = innerWidth, H = innerHeight, R2 = (sd / 2) * (sd / 2);
    for (const mk of this.markers) {
      const a = mk.a; let show = a.alive && g.mode !== 'killcam';
      if (show) { a.headWorld(v); v.y += 0.12; v.project(cam); show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; }
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H - 10;
      if (show && g.scoped) { const dx = x - W / 2, dy = y - H / 2; if (dx * dx + dy * dy > R2 * 0.92) show = false; }
      if (show && a.kind === 'merc' && !g.scoped && a.state !== 'alert') { /* sem luneta, marcador discreto */ }
      if (show !== mk.vis) { mk.el.style.display = show ? '' : 'none'; mk.vis = show; }
      if (!show) continue;
      mk.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      // quadro em volta do corpo para inimigos marcados
      if (a.tagged) {
        if (!mk.tg) { mk.tg = true; mk.el.classList.add('tag'); }
        const fv = v2.copy(a.pos).project(cam); const hpx = Math.max(10, ((-fv.y * 0.5 + 0.5) * H) - y); const wpx = Math.max(8, hpx * 0.5);
        const key = (hpx | 0) + ':' + (wpx | 0); if (mk.bk !== key) { mk.bk = key; mk.br.style.height = (hpx + 6).toFixed(0) + 'px'; mk.br.style.width = (wpx + 6).toFixed(0) + 'px'; }
        if (a.kind === 'merc') { const t = Math.round(a.pos.distanceTo(cam.position)) + ' m'; if (mk.lt !== t) { mk.tx.textContent = t; mk.lt = t; } }
      }
      const alert = a.state === 'alert' || a.state === 'flee';
      const cls = alert ? 'alert' : ''; if (cls !== mk.cls) { mk.el.classList.toggle('alert', alert); mk.cls = cls; }
      if (a.kind === 'hvt') { const d = Math.round(a.pos.distanceTo(cam.position)); const t = (a.name || 'ALVO') + ' ' + d + ' m' + (a.state === 'flee' ? ' FUGINDO!' : ''); if (mk.lt !== t) { mk.tx.textContent = t; mk.lt = t; } }
    }
  }
  showResult(r) {
    this.showHud(false); this.hideBanner(); this.hideScreens();
    const el = $('result'); el.classList.remove('hidden'); const p = el.querySelector('.res');
    p.className = 'panel res ' + (r.win ? 'win' : 'lose');
    $('r-title').textContent = r.win ? 'MISSÃO CUMPRIDA' : 'MISSÃO FALHOU';
    $('r-reason').textContent = r.win ? (r.civil ? 'Você acertou um civil. Recompensa cortada pela metade.' : 'Trabalho limpo, atirador.') : r.reason;
    const stars = $('r-stars').querySelectorAll('i'); stars.forEach(s => s.classList.remove('on'));
    for (let i = 0; i < r.stars; i++) setTimeout(() => { stars[i].classList.add('on'); sfx.star(i); }, 450 + i * 420);
    $('r-grid').innerHTML = `<div>Precisão<b>${Math.round(r.acc * 100)}%</b></div><div>Na cabeça<b>${r.heads}</b></div><div>Abatidos<b>${r.kills}</b></div><div>Tempo<b>${fmtTime(r.time)}</b></div>`;
    $('r-money').textContent = r.win ? '+ ' + fmtMoney(r.money) : '';
    const rk = $('r-rank'); if (r.win && r.rank) { rk.classList.remove('hidden'); rk.className = 'r-rank lv' + r.rank.i; rk.innerHTML = `<span>PATENTE</span><b>${r.rank.name.toUpperCase()}</b>${r.newRank ? '<em>NOVA!</em>' : ''}<div class="rk-bar">${Array.from({ length: 8 }, (_, i) => `<i class="${i <= r.rank.i ? 'on' : ''}"></i>`).join('')}</div>`; } else rk.className = 'r-rank hidden';
    const idx = MISSIONS.indexOf(this.app.currentMission());
    $('r-next').disabled = !(r.win && idx < MISSIONS.length - 1); $('r-next').textContent = idx < MISSIONS.length - 1 ? 'PRÓXIMA' : 'FIM';
    if (!r.win) sfx.fail();
  }
}
