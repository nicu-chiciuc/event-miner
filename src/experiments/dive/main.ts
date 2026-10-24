import './style.css';
import { fieldFromQuery, stretchAt } from '../../core/field.ts';
import { formatDuration, formatStretch, exchangeSentence } from '../../core/format.ts';
import { runFixedLoop } from '../../core/loop.ts';
import { createRng } from '../../core/rng.ts';
import { createSim, step, STEP, IDLE, DEFAULT_FIELDS, WIDTH, METRES, CALENDAR_SCALE, LAYER_NAMES, ORE_NAMES, ROCK_COLORS, ORE_COLORS, depth, layerAt, atBase, fuelCapacity, cargoCapacity, energyCapacity, safeSeconds, offers, tileAt } from './sim.ts';
import type { Mode, Action, Command } from './sim.ts';

const query = new URLSearchParams(location.search);
const mode: Mode = query.get('mode') === 'years' ? 'years' : 'waves';
const DEFAULT_FIELD = DEFAULT_FIELDS[mode];
const field = fieldFromQuery(new URLSearchParams(location.search), DEFAULT_FIELD);
let sim = createSim(mode, field);
const random = createRng(1907);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.title = `Dive / ${mode} / Event Miner`;
document.body.innerHTML = `
<canvas aria-label="A mining vehicle in a layered underground world"></canvas>
<header><a href="/" aria-label="All experiments">↖ All</a><strong>DIVE</strong><nav><a href="?mode=waves" class="${mode === 'waves' ? 'selected' : ''}">Waves</a><a href="?mode=years" class="${mode === 'years' ? 'selected' : ''}">Years</a></nav><button id="help" aria-label="Help">H</button></header>
<div id="ticker" role="status"></div>
<section id="hud" aria-label="Instruments"><div id="readings"><div><small>Below the surface</small><strong id="depth"></strong></div><div><small>Your watch</small><strong id="watch"></strong></div><div><small id="calendar-label">Surface</small><strong id="calendar"></strong></div><div><small>Time exchange</small><strong id="stretch"></strong></div></div><div id="exchange"></div><div id="status"></div></section>
<div id="meters"><div class="meter-label"><span>FUEL</span><span id="fuel"></span></div><div class="meter"><i id="fuel-fill"></i></div><div class="meter-label"><span>CARGO</span><span id="cargo"></span></div><div class="meter"><i id="cargo-fill"></i></div></div><div id="progress"></div>
<footer><span class="keyboard-help">← ↓ → drill · ↑ / Space fly</span><button id="restart">R restart</button><button id="workshop-toggle">E workshop</button></footer>
<section id="workshop" hidden aria-label="Workshop"><h2>${mode === 'waves' ? 'Surface workshop' : 'Colony research'}</h2><div id="stock"></div><div id="shop-list"></div><p id="shop-note"></p></section>
<div id="touch"><button data-key="ArrowLeft" aria-label="Move or drill left">←</button><button data-key="ArrowDown" aria-label="Drill down">↓</button><button data-key="ArrowRight" aria-label="Move or drill right">→</button><button data-key="Space" aria-label="Thrust upward">↑ FLY</button></div>
<div id="overlay" role="dialog" aria-modal="true" aria-label="Dive information"><div class="paper"></div></div>`;
function element(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node;
}
const canvas = document.querySelector('canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas unavailable');
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D unavailable');
const ctx = context;
const overlay = element('overlay');
const paperNode = overlay.querySelector('.paper');
if (!(paperNode instanceof HTMLElement)) throw new Error('Overlay unavailable');
const paper = paperNode;
const workshop = element('workshop');
const keys = new Set<string>();
let help = true;
let shopOpen = false;
let queuedAction: Action | undefined;
let overlayKind = '';
let audio: AudioContext | null = null;
let pixelScale = 2;
let tileSize = 16;
let width = 640;
let height = 400;
let gameTop = 110;
let cameraX = 0;
let cameraY = -64;
let visualTime = 0;
let shake = 0;
let waveFlash = 0;
let hudClock = 0;
let dustClock = 0;
let previousMined = 0;
let previousImpact = 0;
let previousEvent = 0;
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
let particles: Particle[] = [];
function resize(): void {
  if (!canvas) return;
  pixelScale = Math.max(1, Math.floor(innerWidth / 600));
  width = Math.ceil(innerWidth / pixelScale); height = Math.ceil(innerHeight / pixelScale);
  canvas.width = width; canvas.height = height;
  canvas.style.width = `${width * pixelScale}px`; canvas.style.height = `${height * pixelScale}px`;
  tileSize = pixelScale === 1 ? 24 : 16;
  gameTop = element('hud').getBoundingClientRect().bottom / pixelScale + 3;
  ctx.imageSmoothingEnabled = false;
}
addEventListener('resize', resize);
resize();
function sound(frequency: number, duration = 0.06, type: OscillatorType = 'square'): void {
  if (!audio) return;
  const oscillator = audio.createOscillator(); const gain = audio.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * 0.5), audio.currentTime + duration);
  gain.gain.setValueAtTime(0.025, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
}
function startAudio(): void {
  if (!audio) audio = new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
}
function restart(): void {
  sim = createSim(mode, field); keys.clear(); particles = []; shopOpen = false; help = false;
  previousMined = 0; previousImpact = 0; previousEvent = 0; cameraY = -4 * tileSize; overlayKind = ''; queuedAction = undefined;
  updateHud();
}
function dismissOverlay(): boolean {
  if (help) { help = false; overlayKind = ''; return true; }
  if (sim.receipt && sim.outcome === 'playing') { step(sim, { ...IDLE, dismiss: true }); overlayKind = ''; return true; }
  return false;
}
const actionKeys: Record<string, Action> = { Digit1: 'drill', Digit2: 'tank', Digit3: 'cargo', Digit4: mode === 'waves' ? 'battery' : 'beacon', Digit5: 'generator', Digit6: 'shield', Digit7: 'repair', Digit8: 'anchor' };
addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space'].includes(event.code)) event.preventDefault();
  startAudio();
  if (event.code === 'KeyR') { restart(); return; }
  if (event.code === 'KeyH') { help = !help; keys.clear(); return; }
  if (dismissOverlay()) { keys.clear(); return; }
  if (event.code === 'KeyE' || event.code === 'Escape') { shopOpen = event.code === 'Escape' ? false : !shopOpen; return; }
  if (!event.repeat && actionKeys[event.code] && shopOpen) queuedAction = actionKeys[event.code];
  keys.add(event.code);
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); });
element('help').addEventListener('click', () => { startAudio(); help = !help; });
element('restart').addEventListener('click', () => { startAudio(); restart(); });
element('workshop-toggle').addEventListener('click', () => { startAudio(); if (!dismissOverlay()) shopOpen = !shopOpen; });
overlay.addEventListener('pointerdown', () => { startAudio(); if (sim.outcome !== 'playing' && !help) restart(); else dismissOverlay(); });
for (const button of document.querySelectorAll<HTMLButtonElement>('#touch button')) {
  const key = button.dataset.key;
  if (!key) continue;
  button.addEventListener('pointerdown', event => {
    event.preventDefault(); startAudio(); button.setPointerCapture(event.pointerId);
    if (dismissOverlay()) return;
    keys.add(key); button.classList.add('held');
  });
  const release = (): void => { keys.delete(key); button.classList.remove('held'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
function calendar(seconds: number): string {
  const days = Math.floor(seconds * CALENDAR_SCALE / 86400);
  return `Year ${Math.floor(days / 365) + 1}, day ${days % 365 + 1}`;
}
function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return `${Math.round(seconds)} s`;
  if (minutes < 60) return `${minutes} min ${Math.floor(seconds % 60)} s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}
function showOverlay(): void {
  const kind = help ? 'help' : sim.outcome !== 'playing' ? sim.outcome : sim.receipt ? `receipt-${sim.dives.length}` : '';
  overlay.hidden = !kind;
  if (kind === overlayKind) return;
  overlayKind = kind;
  if (!kind) return;
  if (help) {
    paper.innerHTML = `<small>Event Miner / ${mode}</small><h1>The deeper you go,<br>the faster home moves.</h1><p>← ↓ → drill · ↑ / Space fly · E workshop</p><p>${mode === 'waves' ? 'Feed the shield with coal. Upgrade your drill.<br>Bring the Heart home from 174 metres.' : 'Deliver coal and ore. Queue research.<br>Dive to pass years. Build the Beacon.'}</p><p class="prompt">Any key or tap to descend · H brings this back</p>`;
  } else if (sim.outcome !== 'playing') {
    paper.innerHTML = `<small>${sim.outcome === 'win' ? 'Welcome home' : 'Signal lost'} / ${mode}</small><h1>${sim.outcome === 'win' ? (mode === 'waves' ? 'The Heart is home.' : 'They left a light on.') : 'Time ran out up there.'}</h1><p>${sim.reason}</p><div class="receipt-grid"><div>Your watch<strong>${duration(sim.local)}</strong></div><div>At the surface<strong>${mode === 'years' ? formatDuration(sim.surface * 60) : duration(sim.surface)}</strong></div><div>Deepest point<strong>${Math.floor(sim.deepest)} m</strong></div><div>Dives / rescues<strong>${sim.dives.length} / ${sim.tows}</strong></div></div><p>${mode === 'waves' ? `${sim.wave} waves. Base ${Math.ceil(sim.hp)} HP.` : `${calendar(sim.surface)}. ${Math.floor(sim.population)} settlers.`}</p><p class="prompt">R or tap to restart · <a href="/">All experiments</a></p>`;
  } else if (sim.receipt) {
    const receipt = sim.receipt;
    const passed = mode === 'years' ? formatDuration(receipt.surface * CALENDAR_SCALE) : duration(receipt.surface);
    paper.innerHTML = `<small>Return receipt / Dive ${String(sim.dives.length).padStart(2, '0')}${receipt.towed ? ' / rescue' : ''}</small><h1>You were gone<br>${duration(receipt.local)}.</h1><p><strong class="big">${passed} passed up here.</strong>${mode === 'years' ? calendar(sim.surface) : `Surface ${clock(sim.surface)}`}</p><div class="receipt-grid"><div>Delivered<strong>${receipt.items} items</strong></div><div>${mode === 'waves' ? 'Waves weathered' : 'Colony change'}<strong>${mode === 'waves' ? receipt.waves : `${receipt.population >= 0 ? '+' : ''}${receipt.population.toFixed(1)} people`}</strong></div></div><p>${receipt.towed ? 'Cargo lost. Rescue cost: 2 coal.' : mode === 'waves' ? `${Math.round(receipt.produced)} energy generated. ${Math.round(Math.max(0, receipt.damage))} damage.<br>${receipt.coalUsed.toFixed(1)} coal burned. Battery ${Math.round(sim.energy)}.` : `${Math.floor(sim.population)} settlers. ${receipt.coalUsed.toFixed(1)} coal burned.<br>${sim.coal.toFixed(1)} coal remains.`}${receipt.research ? `<br>${receipt.research} finished while you were away.` : ''}</p><p class="prompt">Any key or tap to continue · E opens the workshop</p>`;
    sound(540, 0.14, 'triangle');
  }
}
function updateHud(): void {
  const metres = depth(sim); const stretch = stretchAt(field, metres);
  element('depth').textContent = `${Math.floor(metres)} m / ${LAYER_NAMES[layerAt(field, metres)]}`;
  element('watch').textContent = clock(sim.local);
  element('calendar').textContent = mode === 'waves' ? clock(sim.surface) : calendar(sim.surface);
  element('calendar-label').textContent = mode === 'waves' ? 'Surface' : 'Calendar / 1 s = 1 min';
  element('stretch').textContent = formatStretch(stretch);
  element('exchange').textContent = exchangeSentence(stretch);
  const anchorActive = sim.anchor && sim.ores[sim.layers - 2] > 0;
  const compact = innerWidth < 650;
  const waveTime = clock((sim.nextWave - sim.baseClock) * (anchorActive ? 4 : 1));
  element('status').textContent = mode === 'waves'
    ? compact ? `HP ${Math.ceil(sim.hp)} · Energy ${Math.round(sim.energy)} · Coal ${sim.coal.toFixed(0)} · Wave ${sim.wave + 1} in ${waveTime}` : `BASE ${Math.ceil(sim.hp)} HP · ${Math.round(sim.energy)}/${energyCapacity(sim)} energy · Coal ${sim.coal.toFixed(1)} · Wave ${sim.wave + 1} in ${waveTime} surface${sim.anchor ? ` · Anchor ${anchorActive ? 'ON' : 'EMPTY'}` : ''}`
    : `${Math.floor(sim.population)} SETTLERS · Coal ${sim.coal.toFixed(1)} · Safe here for about ${formatDuration(safeSeconds(sim))}`;
  element('ticker').textContent = sim.event;
  element('fuel').textContent = `${Math.ceil(sim.player.fuel)} / ${fuelCapacity(sim)}`;
  element('cargo').textContent = `${sim.player.cargo.length} / ${cargoCapacity(sim)}`;
  element('fuel-fill').style.width = `${100 * sim.player.fuel / fuelCapacity(sim)}%`;
  element('fuel-fill').style.background = sim.player.fuel < depth(sim) / 7 + 12 ? '#f48c79' : '#e8ba68';
  element('cargo-fill').style.width = `${100 * sim.player.cargo.length / cargoCapacity(sim)}%`;
  const progress = element('progress');
  if (sim.research) progress.textContent = `${sim.research.label}: ${Math.floor(100 * (1 - sim.research.remaining / sim.research.total))}% · ${formatDuration(sim.research.remaining * CALENDAR_SCALE)} left up there`;
  else if (sim.beacon) progress.textContent = 'Beacon complete. Come home.';
  else if (sim.anchor) progress.textContent = `Anchor upkeep: ${Math.floor(sim.ores[sim.layers - 2])} ${ORE_NAMES[sim.layers - 2]} · 1 / 12 base min`;
  else if (atBase(sim)) progress.textContent = mode === 'waves' ? 'Coal unloads here. E to upgrade.' : 'Queue research before you leave. E';
  else progress.textContent = `Drill ${sim.tier + 1} · ${ORE_NAMES[layerAt(field, metres)]} ${sim.player.cargo.filter(ore => ore === layerAt(field, metres)).length} · Coal ${sim.player.cargo.filter(ore => ore === 'coal').length}`;
  workshop.hidden = !shopOpen || help || Boolean(sim.receipt);
  if (shopOpen) updateWorkshop();
  showOverlay();
}
let shopSignature = '';
function updateWorkshop(): void {
  const available = offers(sim);
  const signature = JSON.stringify([available, sim.ores, Math.floor(sim.coal), atBase(sim), sim.research?.label]);
  if (signature === shopSignature) return;
  shopSignature = signature;
  element('stock').textContent = `Coal ${sim.coal.toFixed(1)} · ` + sim.ores.flatMap((count, layer) => count > 0 ? [`${ORE_NAMES[layer]} ${count}`] : []).join(' · ');
  element('shop-note').textContent = !atBase(sim) ? 'Return to the surface to buy or queue research.' : sim.research ? `${sim.research.label} underway. Research advances on the surface clock. Dive to help it finish.` : mode === 'waves' ? 'Coal feeds the generator automatically. Rescue costs 2 coal and your cargo.' : 'Research needs ore and surface time. Delivered coal keeps the colony warm.';
  const list = element('shop-list'); list.replaceChildren();
  for (const offer of available) {
    const key = Object.entries(actionKeys).find(([, action]) => action === offer.action)?.[0].replace('Digit', '') ?? '';
    const button = document.createElement('button');
    button.disabled = !offer.available;
    button.textContent = `${key}  ${offer.label} · ${offer.cost} ${ORE_NAMES[offer.layer]}`;
    const detail = document.createElement('span'); detail.textContent = `${offer.detail}${offer.duration ? ` · ${formatDuration(offer.duration * CALENDAR_SCALE)}` : ''}`;
    button.append(detail); button.addEventListener('click', () => { startAudio(); queuedAction = offer.action; }); list.append(button);
  }
}
function rect(x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h));
}
function label(text: string, x: number, y: number, color = '#b8cbd0', size = 7): void {
  ctx.font = `${size}px ui-monospace, monospace`; ctx.fillStyle = color; ctx.fillText(text, Math.round(x), Math.round(y));
}
function house(x: number, y: number, size: number, lit: boolean, broken = false): void {
  rect(x, y - size, size * 1.4, size, broken ? '#39424c' : '#61777b');
  rect(x - 1, y - size - 3, size * 1.4 + 2, 3, '#bbc1aa');
  if (!broken) rect(x + 2, y - size + 3, 3, 4, lit ? '#ffd181' : '#203b4c');
  rect(x + size - 2, y - 5, 3, 5, '#22313c');
}
function drawSurfaceStrip(): void {
  const top = 38 / pixelScale; const bottom = 84 / pixelScale;
  const day = (mode === 'years' ? sim.surface * CALENDAR_SCALE / 86400 : sim.surface / 120) % 1;
  const daylight = day < 0.5;
  rect(0, top, width, bottom - top, daylight ? '#779f9e' : '#243c55');
  const sunX = (day % 0.5) * 2 * (width - 20) + 10;
  rect(sunX, top + 4, 5, 5, daylight ? '#edce8a' : '#a9c6d8');
  rect(0, bottom - 3, width, 3, '#718071');
  const count = mode === 'years' ? Math.floor(Math.max(12, sim.population) / 4) : 5;
  for (let i = 0; i < count; i++) house(width / 2 - 50 + i * 13 - count * 3, bottom - 3, 7 + i % 3 * 2, !daylight && sim.coal > 0, mode === 'years' && sim.coal < 0.01);
  if (mode === 'waves') {
    rect(width / 2 + 25, bottom - 17, 20, 14, '#b6bba5');
    rect(width / 2 + 30, bottom - 23, 5, 8, '#708d91');
    rect(width / 2 + 30, bottom - 25, 14, 3, '#d5d8bc');
    rect(width / 2 + 28, bottom - 9, 14 * sim.hp / 100, 2, '#a7d7c2');
  }
  if (sim.anchor && sim.ores[sim.layers - 2] > 0) {
    ctx.strokeStyle = '#b8a5f4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(width / 2, bottom - 3, 85, 22, 0, Math.PI, Math.PI * 2); ctx.stroke();
    label('1/4', width / 2 + 78, top + 9, '#dacaff');
  }
  if (sim.beacon) { rect(width / 2, top, 2, bottom - top, '#ffe6a1'); rect(width / 2 - 4, bottom - 10, 10, 7, '#fff0be'); }
  if (waveFlash > 0) { ctx.globalAlpha = waveFlash * 0.35; rect(0, top, width, bottom - top, sim.hp < 80 ? '#ef846a' : '#a9dccc'); ctx.globalAlpha = 1; }
  label('SURFACE LIVE', 9, top + 10, daylight ? '#244754' : '#a6c0ce', pixelScale === 1 ? 9 : 6);
}
function draw(): void {
  ctx.imageSmoothingEnabled = false;
  rect(0, 0, width, height, '#131e29');
  const sx = (x: number): number => Math.round(x * tileSize - cameraX);
  const sy = (y: number): number => Math.round(y * tileSize - cameraY + gameTop);
  ctx.save(); ctx.beginPath(); ctx.rect(0, gameTop, width, height - gameTop); ctx.clip();
  if (!reducedMotion && shake > 0) ctx.translate(Math.round((random() - 0.5) * shake), Math.round((random() - 0.5) * shake));
  rect(sx(0), sy(-5), WIDTH * tileSize, tileSize * 5, '#335767');
  for (let i = 0; i < 25; i++) rect(sx((i * 19 % 32) + 0.2), sy(-1.5 - i % 4 * 0.65), 1, 1, '#7b9da2');
  rect(sx(0), sy(0) - 3, WIDTH * tileSize, 3, '#98a685');
  for (let i = 0; i < 5; i++) house(sx(11 + i * 2), sy(0) - 3, tileSize * (i === 2 ? 1.3 : 0.8), true);
  label('SURFACE SERVICE / REFUEL + UNLOAD', sx(7), sy(-2.5), '#c6d2bf', pixelScale === 1 ? 10 : 7);
  const first = Math.max(0, Math.floor(cameraY / tileSize) - 1);
  const last = Math.min(sim.rows, Math.ceil((cameraY + height - gameTop) / tileSize) + 1);
  for (let y = first; y < last; y++) for (let x = 0; x < WIDTH; x++) {
    const px = sx(x); const py = sy(y);
    if (px < -tileSize || px > width) continue;
    const tile = tileAt(sim, x, y);
    if (!tile) { rect(px, py, tileSize, tileSize, '#202b32'); continue; }
    rect(px, py, tileSize, tileSize, ROCK_COLORS[tile.layer]);
    rect(px, py + tileSize - 1, tileSize, 1, '#17242a');
    rect(px + tileSize - 1, py, 1, tileSize, '#273039');
    rect(px + 2 + tile.fleck, py + 3, 3, 1, '#ffffff0c');
    if (tile.ore !== null) {
      const color = tile.ore === 'coal' ? '#19272b' : tile.ore === 'heart' ? '#fff3c0' : ORE_COLORS[tile.ore];
      const o = Math.max(3, Math.floor(tileSize / 4));
      rect(px + o, py + o + tile.fleck, o, o, color);
      rect(px + o * 2 + 1, py + o * 2, o - 1, o - 1, color);
      if (tile.ore === 'heart') rect(px + tileSize / 2 - 1, py + 2, 2, tileSize - 4, '#e6a9c6');
    }
    if (sim.drill?.index === y * WIDTH + x) {
      const progress = sim.drill.progress / sim.drill.duration;
      rect(px + 2, py + tileSize - 4, tileSize - 4, 2, '#18242c');
      rect(px + 2, py + tileSize - 4, (tileSize - 4) * progress, 2, '#ffde92');
      rect(px + tileSize / 2, py + 2, 1, progress * (tileSize - 6), '#1a252b');
    }
  }
  for (const particle of particles) rect(sx(particle.x), sy(particle.y), 2, 2, particle.color);
  const p = sim.player;
  const wobble = sim.drill && !reducedMotion ? Math.sin(visualTime * 100) * 0.7 : 0;
  const px = sx(p.x) + wobble; const py = sy(p.y); const u = tileSize / 16;
  if (p.thrust > 0.1) {
    rect(px - 4 * u, py + 3 * u, 3 * u, (4 + random() * 5) * u * p.thrust, '#f4a65d');
    rect(px + 2 * u, py + 3 * u, 3 * u, (4 + random() * 5) * u * p.thrust, '#ffe6a1');
  }
  rect(px - 5 * u, py - 3 * u, 10 * u, 7 * u, '#eeb45f');
  rect(px - 3 * u, py - 6 * u, 7 * u, 5 * u, '#f6cc7e');
  rect(px - 2 * u, py - 5 * u, 5 * u, 3 * u, '#355968');
  rect(px - 6 * u, py + 2 * u, 12 * u, 3 * u, '#1c2a33');
  for (let i = 0; i < 3; i++) rect(px + (i * 4 - 5) * u, py + 3 * u, 2 * u, u, '#98aa9c');
  const drillDown = sim.drill && Math.floor(sim.drill.index / WIDTH) > Math.floor(p.y);
  if (drillDown) { rect(px - 2 * u, py + 5 * u, 4 * u, 3 * u, '#c4d0c7'); rect(px - u, py + 8 * u, 2 * u, u, '#f6e0a1'); }
  else { const facing = p.vx < -0.1 || keys.has('ArrowLeft') || keys.has('KeyA') ? -1 : 1; rect(px + facing * 6 * u - 2 * u, py, 4 * u, 3 * u, '#c4d0c7'); }
  rect(sx(0) - 5, sy(0), 4, sim.rows * tileSize, '#3c515d');
  // Doubling marks follow the selected field, including linear and step laws.
  let lastLayer = -1;
  for (let y = 0; y < sim.rows; y++) {
    const layer = layerAt(field, y * METRES);
    if (layer === lastLayer) continue;
    lastLayer = layer;
    const markY = sy(y);
    if (markY < gameTop || markY > height - 50 / pixelScale) continue;
    const rulerX = Math.min(width - (pixelScale === 1 ? 105 : 62), sx(WIDTH) + 6);
    rect(rulerX, markY + 1, pixelScale === 1 ? 105 : 62, 22, '#172630e8');
    rect(rulerX, markY, 12, 1, '#c6b98d');
    label(`${formatStretch(2 ** layer)} ${LAYER_NAMES[layer]}`, rulerX + 2, markY + 10, '#b9c0ad', pixelScale === 1 ? 10 : 7);
    label(`${y * METRES} m`, rulerX + 2, markY + 19, '#809a9e', pixelScale === 1 ? 9 : 6);
  }
  if (sim.drill) label(`${Math.round(100 * sim.drill.progress / sim.drill.duration)}%`, px + 10 * u, py - 8 * u, '#ffdf9c', pixelScale === 1 ? 10 : 7);
  ctx.restore(); drawSurfaceStrip();
}
updateHud();
resize();
runFixedLoop(STEP, dt => {
  visualTime += dt;
  if (!help) {
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    const command: Command = { move: left === right ? 0 : left ? -1 : 1, down: keys.has('ArrowDown') || keys.has('KeyS'), thrust: keys.has('ArrowUp') || keys.has('KeyW') || keys.has('Space'), action: queuedAction };
    step(sim, command);
    queuedAction = undefined;
  }
  if (sim.mined !== previousMined && sim.lastBreak) {
    previousMined = sim.mined; shake = 2.5; sound(110 + sim.lastBreak.layer * 25);
    for (let i = 0; i < 9; i++) particles.push({ x: sim.lastBreak.x, y: sim.lastBreak.y, vx: (random() - 0.5) * 3, vy: -random() * 3, life: 0.3 + random() * 0.35, color: ORE_COLORS[sim.lastBreak.layer] });
  }
  dustClock -= dt;
  if (sim.drill && !help && dustClock <= 0) {
    dustClock = 0.09;
    const tx = sim.drill.index % WIDTH + 0.5;
    const ty = Math.floor(sim.drill.index / WIDTH) + 0.5;
    particles.push({ x: (sim.player.x + tx) / 2, y: (sim.player.y + ty) / 2, vx: (random() - 0.5) * 2, vy: -random() * 2, life: 0.3, color: '#d6b384' });
  }
  if (sim.impact !== previousImpact) { previousImpact = sim.impact; waveFlash = 1; sound(65, 0.18, 'triangle'); }
  if (sim.eventSerial !== previousEvent) { previousEvent = sim.eventSerial; hudClock = 1; }
  for (const particle of particles) { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += dt * 8; particle.life -= dt; }
  particles = particles.filter(particle => particle.life > 0);
  shake = Math.max(0, shake - dt * 14); waveFlash = Math.max(0, waveFlash - dt * 2);
  const targetX = WIDTH * tileSize <= width ? -(width - WIDTH * tileSize) / 2 : Math.max(0, Math.min(WIDTH * tileSize - width, sim.player.x * tileSize - width / 2 + sim.player.vx * tileSize * 0.3));
  const targetY = Math.max(-4 * tileSize, sim.player.y * tileSize - (height - gameTop) * 0.35 + sim.player.vy * tileSize * 0.22);
  cameraX += (targetX - cameraX) * 0.12; cameraY += (targetY - cameraY) * 0.1;
  hudClock += dt;
  if (hudClock >= 0.1) { hudClock = 0; updateHud(); }
}, draw);
