import { fieldFromQuery, stretchAt } from '../../core/field.ts';
import { exchangeSentence, formatDuration, formatStretch } from '../../core/format.ts';
import { runFixedLoop } from '../../core/loop.ts';
import { createRng } from '../../core/rng.ts';
import { DEFAULT_FIELD, KINDS, LEVELS } from './levels.ts';
import type { Kind } from './levels.ts';
import { allowed, command, createSim, localRate, RULES, stars, step, STEP, surfaceRate } from './sim.ts';
import { COLORS, hitSlot, layout, paint, rulerDepth, yAt } from './view.ts';
import type { Focus, Particle } from './view.ts';
import './style.css';

document.body.innerHTML = `
  <canvas tabindex="0" aria-label="Mine shaft. Up and down visit depths, left and right choose a bay, 1 to 6 choose a tool, Enter builds, Delete removes."></canvas>
  <header class="hud">
    <div class="topbar"><span class="brand">CHAIN</span><span class="edition">EVENT MINER<br>PRODUCTION / TIME</span><a href="/">All experiments ↗</a>
      <select aria-label="Level">${LEVELS.map((l, i) => `<option value="${i}">${i + 1}. ${l.name}</option>`).join('')}</select>
      <button id="pause" title="Space or P">Pause</button><button id="restart" title="R" aria-label="Restart level">↻</button><button id="help" title="H" aria-label="Help">?</button>
    </div>
    <div class="clockbar">
      <div><div class="eyebrow">Your watch</div><div class="clock" id="local-clock"></div></div>
      <div><div class="eyebrow">Surface clock</div><div class="clock" id="surface-clock"></div></div>
      <div class="view-control"><div class="eyebrow">Observation depth</div><div class="depth-control"><output id="depth"></output><input id="view" type="range" min="-20" max="160" step="1" value="0" aria-label="Observation depth"></div><div class="exchange"></div></div>
    </div>
    <div class="mobile-goal"></div>
  </header>
  <aside class="sidebar">
    <div class="mission"><div class="level-number"></div><h1></h1><p class="intro"></p><div class="goal"><span>Surface delivery</span><strong id="delivery"></strong></div><div class="meter"><span></span></div><div class="targets"></div><button class="hint">Need a nudge?</button><p class="hint-text" hidden></p></div>
    <div class="inspector"><h2></h2><p class="rate"></p><p class="cycle"></p><p class="throughput"></p><p class="description"></p></div>
  </aside>
  <footer class="footer"><div class="status" role="status"></div><div class="palette"></div>
    <div class="touch-controls"><button id="up" aria-label="Visit shallower depth">↑ Up</button><button id="down" aria-label="Visit deeper depth">↓ Down</button><button id="build">Build</button><button id="remove">Remove</button><button id="inspect">Info</button></div>
    <div class="footer-meta"><span class="keyboard-help">↑↓ visit · ←→ bay · Enter build · Del remove · H help · R restart</span><span class="budget"></span></div>
  </footer>
  <div class="paused-label" hidden>PAUSED</div>
  <div class="overlay" id="help-overlay" role="dialog" aria-label="How to play"><div class="card"><div class="eyebrow">Build a chain across clocks</div><h2>Depth is your speed.</h2><p>↑↓ or drag the ruler to visit a depth.</p><p>1-6 choose a tool. ←→ choose a bay.<br>Enter or tap to build. Del or hold to remove.</p><p id="help-goal"></p><div class="start">Any key or tap to begin · H reopens this</div></div></div>
  <div class="overlay" id="result-overlay" role="dialog" aria-label="Level result" hidden><div class="card"><div class="eyebrow" id="result-label"></div><h2 id="result-title"></h2><div class="result-stars"></div><div class="result-grid"></div><p id="result-note"></p><div class="result-actions"><button id="retry">Try again</button><button id="next">Next level →</button></div></div></div>
`;

function element<T extends Element>(selector: string, constructor: { new(): T }): T {
  const found = document.querySelector(selector);
  if (!(found instanceof constructor)) throw new Error(`Missing ${selector}`);
  return found;
}
const canvas = element('canvas', HTMLCanvasElement);
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D unavailable');
const ctx = context;
const hud = element('.hud', HTMLElement);
const footer = element('.footer', HTMLElement);
const sidebar = element('.sidebar', HTMLElement);
const palette = element('.palette', HTMLElement);
const status = element('.status', HTMLElement);
const helpOverlay = element('#help-overlay', HTMLElement);
const resultOverlay = element('#result-overlay', HTMLElement);
const levelSelect = element('select', HTMLSelectElement);
const viewInput = element('#view', HTMLInputElement);
const localClock = element('#local-clock', HTMLElement);
const surfaceClock = element('#surface-clock', HTMLElement);
const depthOutput = element('#depth', HTMLElement);
const exchange = element('.exchange', HTMLElement);
const delivery = element('#delivery', HTMLElement);
const meter = element('.meter span', HTMLElement);
const targets = element('.targets', HTMLElement);
const budget = element('.budget', HTMLElement);
const mobileGoal = element('.mobile-goal', HTMLElement);
const pauseButton = element('#pause', HTMLButtonElement);
const pausedLabel = element('.paused-label', HTMLElement);
const inspectorTitle = element('.inspector h2', HTMLElement);
const inspectorRate = element('.rate', HTMLElement);
const inspectorCycle = element('.cycle', HTMLElement);
const inspectorThroughput = element('.throughput', HTMLElement);
const inspectorDescription = element('.description', HTMLElement);

const field = fieldFromQuery(new URLSearchParams(location.search), DEFAULT_FIELD);
let sim = createSim(field);
let selected: Kind = 'drill';
let selectedPreview: Kind | null = null;
let anchorMode: 4 | 0.25 = 4;
let focus: Focus = { depth: 0, bay: 0 };
let hovered: Focus | null = null;
let help = true;
let board = layout(innerWidth, hud.getBoundingClientRect().bottom + 8, footer.getBoundingClientRect().top - 10);
let visualDepth = 0;
let particles: Particle[] = [];
let shake = 0;
let uiTicks = 0;
let lastDelivered = 0;
let shownResult = false;
let messageOverride = '';
let messageAge = 0;
let lastMessage = '';
let commandAge = 0;
const rng = createRng(491);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let audio: AudioContext | null = null;

function sound(frequency: number): void {
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.7, audio.currentTime + 0.08);
  gain.gain.setValueAtTime(0.035, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.1);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.1);
}

function activate(): void {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
}

function resize(): void {
  const scale = Math.max(1, Math.round(devicePixelRatio));
  canvas.width = Math.round(innerWidth * scale);
  canvas.height = Math.round(innerHeight * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  board = layout(innerWidth, hud.getBoundingClientRect().bottom + 8, footer.getBoundingClientRect().top - 10);
}

function burst(x: number, y: number, color: string): void {
  if (reducedMotion) return;
  shake = 1.7;
  for (let i = 0; i < 12; i++) particles.push({ x, y, vx: (rng() - 0.5) * 90, vy: -20 - rng() * 70, life: 0.3 + rng() * 0.5, color });
}

function tell(text: string): void { messageOverride = text; messageAge = 4; }

function text(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function html(node: HTMLElement, value: string): void {
  if (node.innerHTML !== value) node.innerHTML = value;
}

function updatePalette(): void {
  selectedPreview = null;
  palette.replaceChildren();
  for (const [index, kind] of KINDS.entries()) {
    if (!allowed(sim, kind)) continue;
    const button = document.createElement('button');
    button.innerHTML = `<span class="key">${index + 1}</span>${kind[0].toUpperCase()}${kind.slice(1)}<span class="price">1</span>`;
    button.setAttribute('aria-pressed', String(selected === kind));
    button.addEventListener('click', () => { selected = kind; updatePalette(); updateUI(); canvas.focus(); });
    button.addEventListener('pointerenter', () => { if (!board.mobile) { selectedPreview = kind; updateUI(); } });
    button.addEventListener('pointerleave', () => { selectedPreview = null; });
    palette.append(button);
  }
  if (sim.level.anchors) {
    const mode = document.createElement('button');
    mode.textContent = anchorMode === 4 ? 'Bubble x4' : 'Bubble x1/4';
    mode.title = 'A switches the next anchor between fast and slow';
    mode.addEventListener('click', () => { anchorMode = anchorMode === 4 ? 0.25 : 4; selected = 'anchor'; updatePalette(); canvas.focus(); });
    palette.append(mode);
  }
  resize();
}

function reset(index: number): void {
  sim = createSim(field, index);
  selected = 'drill';
  selectedPreview = null;
  focus = { depth: 0, bay: 0 };
  hovered = null;
  particles = [];
  visualDepth = 0;
  lastDelivered = 0;
  shownResult = false;
  sidebar.classList.remove('inspect-open');
  messageAge = 0;
  resultOverlay.hidden = true;
  levelSelect.value = String(index);
  element('.level-number', HTMLElement).textContent = `CONTRACT 0${index + 1} / 05`;
  element('h1', HTMLElement).textContent = sim.level.name;
  element('.intro', HTMLElement).textContent = sim.level.intro;
  element('.hint-text', HTMLElement).textContent = sim.level.hint;
  element('.hint-text', HTMLElement).hidden = true;
  element('#help-goal', HTMLElement).textContent = `Deliver ${sim.level.goal} ingots before ${formatDuration(sim.level.deadline)} on the surface clock.`;
  updatePalette();
  updateUI();
  canvas.focus();
}

function visit(direction: number): void {
  const target = Math.max(-20, Math.min(160, Math.round(sim.targetDepth / 20) * 20 + direction * 20));
  command(sim, { type: 'view', depth: target });
  focus = { ...focus, depth: target };
  hovered = null;
}

function build(): void {
  const okay = command(sim, { type: 'build', placement: { kind: selected, depth: focus.depth, bay: focus.bay, mode: anchorMode } });
  if (okay) burst(board.slots + focus.bay * board.bay + board.bay / 2, yAt(board, focus.depth), COLORS[selected]);
  sound(okay ? 330 : 110);
  messageAge = 0;
  updateUI();
}

function remove(): void {
  const okay = command(sim, { type: 'remove', depth: focus.depth, bay: focus.bay });
  sound(okay ? 180 : 110);
  messageAge = 0;
  updateUI();
}

function togglePause(): void { command(sim, { type: 'pause' }); updateUI(); }

function inspect(): void {
  const slot = hovered ?? focus;
  const building = sim.buildings.find(b => b.depth === slot.depth && b.bay === slot.bay);
  const kind = selectedPreview ?? building?.kind ?? selected;
  const rate = surfaceRate(sim, slot.depth);
  const cycles: Record<Kind, number> = { drill: RULES.drillCycle, smelter: RULES.smeltCycle, generator: RULES.coalCycle, lift: RULES.dispatch, vault: RULES.oreLife, anchor: RULES.anchorCharge };
  const cycle = cycles[kind];
  text(inspectorTitle, `${kind} / ${slot.depth} m${building ? ' / installed' : ''}`);
  text(inspectorRate, `${localRate(sim, slot.depth).toFixed(2)} local s / your s`);
  text(inspectorCycle, `${cycle} local s = ${formatDuration(cycle / rate)} surface`);
  const descriptions: Record<Kind, string> = {
    drill: `Only on the ${sim.level.seam} m seam. Stops when its 18-item output is full.`,
    smelter: `3 ore → 1 stable ingot. ${sim.level.power ? 'Needs 1 power per local second.' : 'Shore power included for this contract.'}${building?.kind === 'smelter' && building.work !== null ? ` Power: ${Math.round(building.power * 100)}%.` : ''}`,
    generator: '0.6 power / local s, within 90 m. A high generator feeds more deep consumers. 1 coal / 20 local s; 240 coal per hopper.',
    lift: `${sim.level.cars} cars, ${sim.level.speed} m / local s. Travel integrates each depth's clock. Empty cars return here; a high station dispatches faster.`,
    vault: 'Stores 30 items at this depth. Ore ages on this clock. Catches overflow, releases to the nearest hungry machine.',
    anchor: `${building?.kind === 'anchor' ? (building.mode === 4 ? 'Fast x4' : 'Slow x1/4') : (anchorMode === 4 ? 'Fast x4' : 'Slow x1/4')}, radius 22 m. 1 ore / 6 local s. Bubbles do not stack. Your watch stays on the natural field.`,
  };
  const throughput: Record<Kind, string> = {
    drill: `${(60 * rate).toFixed(2)} ore / surface min`,
    smelter: `${(60 * rate / RULES.smeltCycle).toFixed(2)} ingots / surface min at full power`,
    generator: `${(RULES.power * rate).toFixed(3)} power / surface s${building?.kind === 'generator' ? ` · ${Math.ceil(building.coal)} coal left` : ''}`,
    lift: `${sim.level.cars} fixed cars · one item per car`,
    vault: `Ore life: about ${formatDuration(RULES.oreLife / rate)} surface`,
    anchor: `${(60 * rate / RULES.anchorCharge).toFixed(2)} ore upkeep / surface min`,
  };
  text(inspectorThroughput, throughput[kind]);
  text(inspectorDescription, descriptions[kind]);
}

function updateUI(): void {
  const stretch = stretchAt(field, sim.viewDepth);
  text(localClock, formatDuration(sim.localTime));
  html(surfaceClock, `${formatDuration(sim.surfaceTime)} <em>${formatStretch(stretch)}</em>`);
  text(depthOutput, `${Math.round(sim.viewDepth)} m`);
  viewInput.value = String(sim.targetDepth);
  text(exchange, exchangeSentence(stretch));
  text(delivery, `${sim.delivered} / ${sim.level.goal}`);
  meter.style.width = `${Math.min(100, sim.delivered / sim.level.goal * 100)}%`;
  const left = formatDuration(Math.max(0, sim.level.deadline - sim.surfaceTime));
  html(targets, `<span>☆ Finish · ${left} surface left</span><span class="${sim.surfaceTime <= sim.level.early ? 'passed' : ''}">☆ Early · before ${formatDuration(sim.level.early)}</span><span class="${sim.peakBuildings <= sim.level.par ? 'passed' : ''}">☆ Lean · use at most ${sim.level.par} buildings</span>`);
  text(mobileGoal, `${sim.levelIndex + 1}. ${sim.level.name} · ${sim.delivered}/${sim.level.goal} ingots · ${left} left`);
  mobileGoal.title = sim.level.intro;
  text(budget, `${sim.buildings.length}/${sim.level.budget} built · ${sim.level.par} for ★`);
  text(pauseButton, sim.paused ? 'Resume' : 'Pause');
  pausedLabel.hidden = !sim.paused || help || sim.result !== 'playing';
  if (sim.message !== lastMessage) { lastMessage = sim.message; commandAge = 5; }
  const riding = sim.cars.filter(car => car.journey.kind === 'loaded').length;
  const stock = sim.buildings.reduce((count, b) => count + b.items.filter(item => item.kind === 'ore').length, 0);
  const activity = `${riding}/${sim.level.cars} cars loaded · ${stock} ore waiting${sim.level.volatile ? ` · ${sim.expired} spoiled` : ''}. Visit deeper to speed up.`;
  text(status, messageAge > 0 ? messageOverride : commandAge > 0 || sim.buildings.length < 3 ? sim.message : activity);
  inspect();
  if (sim.result !== 'playing' && !shownResult) {
    shownResult = true;
    resultOverlay.hidden = false;
    element('#result-label', HTMLElement).textContent = `CONTRACT 0${sim.levelIndex + 1} / ${sim.level.name.toUpperCase()}`;
    element('#result-title', HTMLElement).textContent = sim.result === 'won' ? 'Shipment complete.' : 'The dock has closed.';
    element('.result-stars', HTMLElement).textContent = '★'.repeat(stars(sim)) + '☆'.repeat(3 - stars(sim));
    element('.result-grid', HTMLElement).innerHTML = `Delivered<strong>${sim.delivered} / ${sim.level.goal} ingots</strong>Surface elapsed<strong>${formatDuration(sim.surfaceTime)}</strong>Your watch<strong>${formatDuration(sim.localTime)}</strong>Peak buildings<strong>${sim.peakBuildings} / ${sim.level.budget}</strong>Ore lost to decay<strong>${sim.expired}</strong>`;
    element('#result-note', HTMLElement).textContent = sim.result === 'won' ? `${sim.surfaceTime <= sim.level.early ? 'Early star earned.' : `Early target: ${formatDuration(sim.level.early)}.`} ${sim.peakBuildings <= sim.level.par ? 'Budget star earned.' : `Budget target: ${sim.level.par} buildings.`}` : sim.level.hint;
    element('#next', HTMLButtonElement).textContent = sim.levelIndex === 4 ? 'Play again →' : 'Next level →';
    sound(sim.result === 'won' ? 880 : 140);
  }
}

function dismissHelp(): void { help = false; helpOverlay.hidden = true; canvas.focus(); }
helpOverlay.addEventListener('pointerdown', event => { activate(); dismissHelp(); event.preventDefault(); });
document.addEventListener('pointerdown', activate, true);
document.addEventListener('keydown', event => {
  activate();
  if (help) { dismissHelp(); event.preventDefault(); return; }
  if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
  const key = event.key.toLowerCase();
  if (key === 'h' || key === '?') { help = true; helpOverlay.hidden = false; }
  else if (key === 'r') reset(sim.levelIndex);
  else if (key === ' ' || key === 'p') { event.preventDefault(); togglePause(); }
  else if (key === 'arrowup') { event.preventDefault(); visit(-1); canvas.focus(); }
  else if (key === 'arrowdown') { event.preventDefault(); visit(1); canvas.focus(); }
  else if (key === 'arrowleft' || key === 'arrowright') { event.preventDefault(); focus = { ...focus, bay: (focus.bay + (key === 'arrowright' ? 1 : 2)) % 3 }; hovered = null; canvas.focus(); }
  else if (key === 'enter' && (event.target === canvas || event.target === document.body)) { event.preventDefault(); build(); }
  else if (key === 'delete' || key === 'backspace') { event.preventDefault(); remove(); }
  else if (key === 'a' && sim.level.anchors) { anchorMode = anchorMode === 4 ? 0.25 : 4; updatePalette(); }
  else {
    const kind = KINDS[Number(key) - 1];
    if (kind && allowed(sim, kind)) { selected = kind; updatePalette(); canvas.focus(); }
  }
});

viewInput.addEventListener('input', () => { command(sim, { type: 'view', depth: Number(viewInput.value) }); focus.depth = Math.round(Number(viewInput.value) / 20) * 20; });
levelSelect.addEventListener('change', () => { reset(Number(levelSelect.value)); canvas.focus(); });
pauseButton.addEventListener('click', togglePause);
element('#restart', HTMLButtonElement).addEventListener('click', () => reset(sim.levelIndex));
element('#retry', HTMLButtonElement).addEventListener('click', () => reset(sim.levelIndex));
element('#next', HTMLButtonElement).addEventListener('click', () => reset((sim.levelIndex + 1) % LEVELS.length));
element('#help', HTMLButtonElement).addEventListener('click', () => { help = true; helpOverlay.hidden = false; });
element('.hint', HTMLButtonElement).addEventListener('click', () => { const hint = element('.hint-text', HTMLElement); hint.hidden = !hint.hidden; });
element('#up', HTMLButtonElement).addEventListener('click', () => visit(-1));
element('#down', HTMLButtonElement).addEventListener('click', () => visit(1));
element('#build', HTMLButtonElement).addEventListener('click', build);
element('#remove', HTMLButtonElement).addEventListener('click', remove);
element('#inspect', HTMLButtonElement).addEventListener('click', () => { sidebar.classList.toggle('inspect-open'); updateUI(); });

let dragging = false;
let pointerStart: { x: number; y: number; slot: Focus | null } | null = null;
let holdTimer = 0;
let removeTimer = 0;
let held = false;
function clearHold(): void { window.clearTimeout(holdTimer); window.clearTimeout(removeTimer); }
canvas.addEventListener('pointerdown', event => {
  canvas.focus();
  const { clientX: x, clientY: y } = event;
  if (event.button !== 0) return;
  dragging = x < board.slots - 10 && y >= board.top && y <= board.bottom;
  canvas.setPointerCapture(event.pointerId);
  if (dragging) { command(sim, { type: 'view', depth: rulerDepth(board, y) }); return; }
  const slot = hitSlot(board, x, y);
  pointerStart = { x, y, slot };
  held = false;
  if (slot) {
    focus = slot;
    holdTimer = window.setTimeout(() => { held = true; sidebar.classList.add('inspect-open'); updateUI(); tell('Release to keep. Hold a little longer to remove.'); }, 450);
    removeTimer = window.setTimeout(() => { held = true; remove(); sidebar.classList.remove('inspect-open'); }, 1400);
  }
});
canvas.addEventListener('pointermove', event => {
  if (dragging) { command(sim, { type: 'view', depth: rulerDepth(board, event.clientY) }); focus.depth = Math.round(sim.targetDepth / 20) * 20; }
  else hovered = hitSlot(board, event.clientX, event.clientY);
  if (pointerStart && Math.hypot(pointerStart.x - event.clientX, pointerStart.y - event.clientY) > 12) { clearHold(); pointerStart = null; }
});
canvas.addEventListener('pointerleave', () => { hovered = null; });
canvas.addEventListener('pointerup', event => {
  clearHold();
  if (!dragging && pointerStart?.slot && !held) {
    focus = pointerStart.slot;
    sidebar.classList.remove('inspect-open');
    if (Math.abs(sim.viewDepth - focus.depth) > RULES.buildReach) {
      command(sim, { type: 'view', depth: focus.depth });
      tell(`Visiting ${focus.depth} m. Tap the bay again when your watch arrives.`);
    } else if (sim.buildings.some(b => b.depth === focus.depth && b.bay === focus.bay)) {
      if (board.mobile) sidebar.classList.add('inspect-open');
    } else build();
  }
  pointerStart = null;
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener('pointercancel', () => { clearHold(); pointerStart = null; dragging = false; });
canvas.addEventListener('contextmenu', event => { event.preventDefault(); const slot = hitSlot(board, event.clientX, event.clientY); if (slot) { focus = slot; remove(); } });
canvas.addEventListener('wheel', event => { event.preventDefault(); command(sim, { type: 'view', depth: sim.targetDepth + Math.sign(event.deltaY) * 10 }); focus.depth = Math.round(sim.targetDepth / 20) * 20; }, { passive: false });
window.addEventListener('resize', resize);
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(hud);
resizeObserver.observe(footer);
document.addEventListener('visibilitychange', () => { if (document.hidden && !sim.paused && sim.result === 'playing') command(sim, { type: 'pause' }); });

reset(0);
runFixedLoop(STEP, dt => {
  if (!help) step(sim, dt);
  visualDepth += (sim.viewDepth - visualDepth) * (reducedMotion ? 1 : 0.2);
  messageAge -= dt;
  commandAge -= dt;
  shake = Math.max(0, shake - dt * 8);
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
  if (sim.delivered > lastDelivered) { burst(board.rail, yAt(board, 0), '#8ddcc9'); sound(640); lastDelivered = sim.delivered; }
  if (++uiTicks % 3 === 0) updateUI();
}, () => paint(ctx, sim, board, focus, selected, visualDepth, particles, shake));
