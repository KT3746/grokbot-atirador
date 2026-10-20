// Dados do jogo: armas, melhorias, mapas, missoes e progresso salvo
export const VERSION = '1.3.0';

export const WEAPONS = [
  { id: 'falcao', name: 'Falcão R7', desc: 'Rifle de ferrolho leve. Bom para começar.', price: 0, zooms: [8, 14], damage: 90, stability: 0.55, mag: 5, velocity: 820, bolt: 1.0, reload: 2.4, recoil: 0.035, color: 0x3b3f33 },
  { id: 'lince', name: 'Lince M9', desc: 'Mais zoom e mais firme na mão. Derruba com um tiro no peito.', price: 2500, zooms: [8, 14, 20], damage: 110, stability: 0.7, mag: 5, velocity: 880, bolt: 0.9, reload: 2.2, recoil: 0.04, color: 0x2a2d30 },
  { id: 'gaviao', name: 'Gavião SX', desc: 'Semiautomático. Atira rápido, ótimo contra alvos em grupo.', price: 4200, zooms: [7, 12, 16], damage: 85, stability: 0.8, mag: 10, velocity: 850, bolt: 0.28, reload: 2.6, recoil: 0.03, color: 0x4a4436 },
  { id: 'trovao', name: 'Trovão .50', desc: 'Calibre pesado. Zoom enorme e a bala sofre menos com o vento.', price: 7500, zooms: [10, 18, 26], damage: 220, stability: 0.6, mag: 4, velocity: 930, bolt: 1.3, reload: 3.0, recoil: 0.07, windRes: 0.6, color: 0x1f2226 },
];

export const UPGRADES = [
  { id: 'mira', name: 'Mira melhor', desc: 'Mais zoom. No nível máximo mostra onde a bala vai cair com o vento.', max: 3, cost: [700, 1500, 3000] },
  { id: 'estab', name: 'Estabilidade', desc: 'A mira balança menos.', max: 3, cost: [600, 1300, 2600] },
  { id: 'pente', name: 'Carregador', desc: 'Mais balas antes de recarregar.', max: 2, cost: [800, 1800] },
  { id: 'folego', name: 'Fôlego', desc: 'Segura a respiração por mais tempo.', max: 3, cost: [500, 1100, 2200] },
];

export const MAPS = [
  { id: 'cidade', name: 'Cidade', desc: 'Telhados, avenidas e praças. Você fica no alto de um prédio.', grad: 'linear-gradient(160deg,#f6a04d 0%,#8d4a5e 45%,#1e2638 100%)' },
  { id: 'montanha', name: 'Montanha', desc: 'Vale com pinheiros e neblina. Tiros longos e com eco.', grad: 'linear-gradient(160deg,#cfe3f2 0%,#6f8ea3 45%,#24323a 100%)' },
  { id: 'deserto', name: 'Deserto', desc: 'Dunas, vilas de barro e vento forte.', grad: 'linear-gradient(160deg,#ffd58a 0%,#d08a45 45%,#5a3220 100%)' },
];

// Tipos de ator: merc (mercenário), hvt (alvo principal), hostage (refém), civil
// path: pontos [x,z] relativos a uma ancora do mapa (a). y vem do mapa.
export const MISSIONS = [
  {
    id: 'c1', map: 'cidade', name: 'Primeiro Contato', time: 240, par: 90, reward: 900,
    sky: { elev: 11, azim: 320, turb: 8, ray: 2.5, fog: 0.00066, exposure: 0.55 },
    wind: { speed: 1.0, dir: 90 },
    brief: 'Três mercenários dos Corvos Negros estão na praça central. Derrube todos sem ser descoberto.',
    goal: 'all',
    actors: [
      { kind: 'merc', a: 'praca', path: [[-20, -10], [20, -10], [20, 25], [-20, 25]], speed: 1.3, wait: 2 },
      { kind: 'merc', a: 'praca', path: [[25, 0]], pose: 'idle' },
      { kind: 'merc', a: 'praca', path: [[-5, 30], [-30, 5]], speed: 1.1, wait: 4 },
    ],
  },
  {
    id: 'c2', map: 'cidade', name: 'Telhado Vigiado', time: 240, par: 110, reward: 1400,
    sky: { elev: 35, azim: 60, turb: 4, ray: 1.4, fog: 0.00054, exposure: 0.5 },
    wind: { speed: 2.5, dir: 270 },
    brief: 'O Barão, chefe de uma célula dos Corvos Negros, vai atravessar a praça. Guardas vigiam os telhados. Civis passam pela avenida: não acerte eles.',
    goal: 'hvt',
    actors: [
      { kind: 'hvt', name: 'O Barão', a: 'praca', path: [[-40, 28], [-10, 0], [15, -25], [40, -40]], speed: 1.0, wait: 3, escape: [90, -80] },
      { kind: 'merc', a: 'praca', path: [[-37, 31], [-12, 4], [12, -21], [36, -36]], speed: 1.0, wait: 3 },
      { kind: 'merc', a: 'telhadoA', path: [[-8, -8], [8, -8], [8, 8], [-8, 8]], speed: 1.0, wait: 3 },
      { kind: 'merc', a: 'telhadoB', path: [[0, -6], [0, 6]], speed: 0.9, wait: 5 },
      { kind: 'civil', a: 'avenida', path: [[-4, 0], [-4, -150]], speed: 1.2, wait: 1 },
      { kind: 'civil', a: 'avenida', path: [[5, -140], [5, 10]], speed: 1.1, wait: 1 },
    ],
  },
  {
    id: 'c3', map: 'cidade', name: 'Refém na Praça', time: 180, par: 80, reward: 1900,
    sky: { elev: 1.5, azim: 250, turb: 9, ray: 3, fog: 0.00084, exposure: 0.62, night: true },
    wind: { speed: 3.0, dir: 60 },
    brief: 'Os Corvos Negros prenderam um refém no meio da praça. Derrube os quatro guardas antes que percebam você. Não acerte o refém!',
    goal: 'all',
    actors: [
      { kind: 'hostage', a: 'praca', path: [[4, 12]], pose: 'kneel' },
      { kind: 'merc', a: 'praca', path: [[-2, 16], [10, 16]], speed: 0.8, wait: 3 },
      { kind: 'merc', a: 'praca', path: [[12, 6]], pose: 'idle' },
      { kind: 'merc', a: 'praca', path: [[-25, -20], [25, -20], [25, 40], [-25, 40]], speed: 1.4, wait: 1 },
      { kind: 'merc', a: 'telhadoA', path: [[-6, 0], [6, 0]], speed: 1, wait: 4 },
    ],
  },
  {
    id: 'm1', map: 'montanha', name: 'Acampamento na Neblina', time: 240, par: 100, reward: 1600,
    sky: { elev: 7, azim: 110, turb: 8, ray: 2, fog: 0.00095, exposure: 0.52, fogTint: 0xc9d4dc },
    wind: { speed: 2.0, dir: 120 },
    brief: 'Um grupo dos Corvos Negros acampou no vale. Cinco mercenários. A bala demora mais para chegar: mire um pouco à frente de quem anda.',
    goal: 'all',
    actors: [
      { kind: 'merc', a: 'acampamento', path: [[-6, 4]], pose: 'idle' },
      { kind: 'merc', a: 'acampamento', path: [[8, 6]], pose: 'idle' },
      { kind: 'merc', a: 'acampamento', path: [[-25, 20], [25, 20], [25, -10], [-25, -10]], speed: 1.3, wait: 2 },
      { kind: 'merc', a: 'acampamento', path: [[30, 30], [50, 0]], speed: 1.0, wait: 4 },
      { kind: 'merc', a: 'acampamento', path: [[-30, -15], [-40, 15]], speed: 1.0, wait: 3 },
    ],
  },
  {
    id: 'm2', map: 'montanha', name: 'Comboio do Vale', time: 220, par: 100, reward: 2200,
    sky: { elev: 30, azim: 40, turb: 5, ray: 1.5, fog: 0.00072, exposure: 0.5 },
    wind: { speed: 3.5, dir: 250 },
    brief: 'O Contador dos Corvos Negros viaja na carroceria de um caminhão que vai e volta pela estrada do vale. Mire um pouco à frente do caminhão. Se ele perceber você, o caminhão foge. Um lenhador trabalha por perto: não acerte ele.',
    hint: 'O caminhão anda: mire um pouco à frente dele.',
    goal: 'hvt',
    vehicles: [{ a: 'acampamento', route: [[-20, -75], [-130, -75], [-250, -75]], exit: [-430, -75], speed: 4.2, wait: 4 }],
    actors: [
      { kind: 'hvt', name: 'O Contador', a: 'acampamento', path: [[0, 0]], ride: 0, rideOff: [0.35, -0.4] },
      { kind: 'merc', a: 'acampamento', path: [[0, 0]], ride: 0, rideOff: [-0.4, -1.4] },
      { kind: 'merc', a: 'acampamento', path: [[-10, -10], [4, -34], [24, -60]], speed: 0.9, wait: 5 },
      { kind: 'merc', a: 'acampamento', path: [[30, -66]], pose: 'idle' },
      { kind: 'merc', a: 'acampamento', path: [[-30, 10], [10, 10]], speed: 1.2, wait: 3 },
      { kind: 'civil', a: 'acampamento', path: [[-55, -20], [-60, 10]], speed: 0.8, wait: 6 },
    ],
  },
  {
    id: 'm3', map: 'montanha', name: 'Posto de Rádio', time: 220, par: 110, reward: 2800,
    sky: { elev: 18, azim: 230, turb: 10, ray: 2.5, fog: 0.00060, exposure: 0.5 },
    wind: { speed: 5.0, dir: 80 },
    brief: 'Na colina distante os Corvos Negros guardam um rádio. Tiro longo e vento forte. Use o indicador de vento e a distância na mira.',
    goal: 'all',
    actors: [
      { kind: 'hvt', name: 'O Operador', a: 'radio', path: [[3, 2], [-3, 4]], speed: 0.6, wait: 6, escape: [-60, 40] },
      { kind: 'merc', a: 'radio', path: [[-12, -8], [12, -8]], speed: 1.0, wait: 3 },
      { kind: 'merc', a: 'radio', path: [[10, 8]], pose: 'idle' },
      { kind: 'merc', a: 'radio', path: [[-14, 10], [-4, 14]], speed: 0.9, wait: 4 },
    ],
  },
  {
    id: 'd1', map: 'deserto', name: 'Vila de Areia', time: 240, par: 100, reward: 2400,
    sky: { elev: 55, azim: 180, turb: 3, ray: 1, fog: 0.00042, exposure: 0.38, fogMul: 0.8, fogTint: 0xe6d3b0 },
    wind: { speed: 4.0, dir: 100 },
    brief: 'Os Corvos Negros tomaram uma vila no deserto. Cinco mercenários. Moradores andam por lá: atire só nos inimigos.',
    goal: 'all',
    actors: [
      { kind: 'merc', a: 'vila', path: [[-12, -2], [12, -2], [12, -20]], speed: 1.2, wait: 2 },
      { kind: 'merc', a: 'vila', path: [[0, -10]], pose: 'idle' },
      { kind: 'merc', a: 'casaAlta', path: [[-3, -2], [3, 2]], speed: 0.8, wait: 4 },
      { kind: 'merc', a: 'vila', path: [[-55, -10], [-60, 15]], speed: 1.0, wait: 3 },
      { kind: 'merc', a: 'vila', path: [[48, 30], [60, 10]], speed: 1.1, wait: 3 },
      { kind: 'civil', a: 'vila', path: [[-15, -25], [15, -25]], speed: 0.9, wait: 3 },
      { kind: 'civil', a: 'vila', path: [[-45, 40], [-10, 45]], speed: 1.0, wait: 2 },
    ],
  },
  {
    id: 'd2', map: 'deserto', name: 'Reféns no Pátio', time: 180, par: 80, reward: 3000,
    sky: { elev: 24, azim: 300, turb: 5, ray: 1.4, fog: 0.00048, exposure: 0.42, fogMul: 0.85, fogTint: 0xe2c79c },
    wind: { speed: 5.0, dir: 290 },
    brief: 'Dois reféns no pátio da vila, vigiados por quatro mercenários. Se o alerta encher, você perde. Não acerte os reféns!',
    goal: 'all',
    actors: [
      { kind: 'hostage', a: 'vila', path: [[2, -18]], pose: 'kneel' },
      { kind: 'hostage', a: 'vila', path: [[-6, -16]], pose: 'kneel' },
      { kind: 'merc', a: 'vila', path: [[-10, -24], [10, -24]], speed: 0.8, wait: 3 },
      { kind: 'merc', a: 'vila', path: [[8, -10]], pose: 'idle' },
      { kind: 'merc', a: 'casaAlta', path: [[-3, 0], [3, 0]], speed: 0.8, wait: 5 },
      { kind: 'merc', a: 'vila', path: [[-30, 40], [30, 40]], speed: 1.3, wait: 1 },
    ],
  },
  {
    id: 'd3', map: 'deserto', name: 'O Chefe dos Corvos', time: 240, par: 120, reward: 4500,
    sky: { elev: 3, azim: 265, turb: 8, ray: 3, fog: 0.00054, exposure: 0.6, fogTint: 0xe0a070 },
    wind: { speed: 6.5, dir: 75 },
    brief: 'O Chefe dos Corvos Negros está no forte, a mais de 500 metros. Seis guardas. Vento forte no pôr do sol. Este é o tiro da sua vida.',
    goal: 'hvt',
    actors: [
      { kind: 'hvt', name: 'O Chefe', a: 'forte', path: [[-6, 0], [6, 2], [4, -8]], speed: 0.7, wait: 6, escape: [-70, -40] },
      { kind: 'merc', a: 'forte', path: [[-14, 10], [14, 10]], speed: 1.0, wait: 3 },
      { kind: 'merc', a: 'torre', path: [[0, 0]], pose: 'idle' },
      { kind: 'merc', a: 'forte', path: [[-8, -12], [-8, 12]], speed: 0.9, wait: 3 },
      { kind: 'merc', a: 'forte', path: [[14, 6]], pose: 'idle' },
      { kind: 'merc', a: 'vila', path: [[-12, -2], [12, -2]], speed: 1.1, wait: 2 },
      { kind: 'merc', a: 'vila', path: [[0, -12]], pose: 'idle' },
    ],
  },
  {
    id: 'c4', map: 'cidade', name: 'Chuva na Madrugada', time: 240, par: 110, reward: 2400, req: 'c3',
    sky: { elev: -6, azim: 230, turb: 2, ray: 0.6, fog: 0.0011, exposure: 0.95, night: true, dark: true },
    weather: 'rain',
    wind: { speed: 3.5, dir: 120 },
    brief: 'Madrugada com chuva forte. Os Corvos Negros vão trocar uma carga na praça. Está muito escuro: use a VISÃO NOTURNA da mira (botão VISÃO ou tecla N). O Coletor é o alvo principal.',
    goal: 'hvt', hint: 'Na mira, aperte VISÃO (ou N) para ver no escuro.',
    actors: [
      { kind: 'hvt', name: 'O Coletor', a: 'praca', path: [[-30, 20], [0, 6], [22, -12], [0, -24]], speed: 0.9, wait: 5, escape: [-90, -70] },
      { kind: 'merc', a: 'praca', path: [[-27, 23], [3, 9], [25, -9]], speed: 0.9, wait: 5 },
      { kind: 'merc', a: 'praca', path: [[18, 18]], pose: 'idle' },
      { kind: 'merc', a: 'telhadoA', path: [[-6, -6], [6, 6]], speed: 0.9, wait: 4 },
      { kind: 'merc', a: 'telhadoB', path: [[0, 0]], pose: 'idle' },
      { kind: 'civil', a: 'avenida', path: [[-5, 10], [-5, -140]], speed: 1.4, wait: 1 },
    ],
  },
  {
    id: 'd4', map: 'deserto', name: 'Tempestade de Areia', time: 240, par: 120, reward: 5200, req: 'd3',
    sky: { elev: 18, azim: 200, turb: 14, ray: 2.2, fog: 0.0019, exposure: 0.5, fogMul: 0.8, fogTint: 0xc8945a },
    weather: 'sand',
    wind: { speed: 7.0, dir: 100, gust: true },
    brief: 'Uma tempestade de areia cobre a vila. O vento muda de força e de direção o tempo todo. Derrube os cinco guardas dos Corvos Negros. Espere o vento acalmar para atirar.',
    goal: 'all', hint: 'Olhe a seta do vento: atire quando ele acalmar.',
    actors: [
      { kind: 'merc', a: 'vila', path: [[-12, -20], [12, -20]], speed: 0.9, wait: 3 },
      { kind: 'merc', a: 'vila', path: [[6, -6]], pose: 'idle' },
      { kind: 'merc', a: 'casaAlta', path: [[-3, -2], [3, 2]], speed: 0.8, wait: 4 },
      { kind: 'merc', a: 'vila', path: [[-40, 20], [-20, 35]], speed: 1.1, wait: 2 },
      { kind: 'merc', a: 'torre', path: [[0, 0]], pose: 'idle' },
      { kind: 'civil', a: 'vila', path: [[-20, -35], [20, -35]], speed: 0.9, wait: 3 },
    ],
  },
];

const KEY = 'atirador_elite_v1';
const DEF = { money: 0, owned: ['falcao'], weapon: 'falcao', up: { mira: 0, estab: 0, pente: 0, folego: 0 }, stars: {}, done: {}, best: {}, settings: { quality: 'auto', sens: 1, vol: 0.8, assist: true, fps: false, tutorial: true, haptics: true, boltLift: true, lead: true } };

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s) return structuredClone(DEF);
    return { ...structuredClone(DEF), ...s, up: { ...DEF.up, ...(s.up || {}) }, settings: { ...DEF.settings, ...(s.settings || {}) } };
  } catch (e) { return structuredClone(DEF); }
}
export function writeSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }
export function resetSave() { try { localStorage.removeItem(KEY); } catch (e) { } return structuredClone(DEF); }
export function missionUnlocked(save, idx) { const m = MISSIONS[idx]; if (m && m.req) return !!save.done[m.req]; return idx === 0 || !!save.done[MISSIONS[idx - 1].id]; }
export function totalStars(save) { return Object.values(save.stars).reduce((a, b) => a + b, 0); }
