import "./style.css";
import { fieldFromQuery, rateBetween, stretchAt } from "../../core/field.ts";
import { exchangeSentence, formatDuration, formatStretch } from "../../core/format.ts";
import { runFixedLoop } from "../../core/loop.ts";
import { createRng } from "../../core/rng.ts";
import { SandSim, DEFAULT_FIELD, WIDTH, HEIGHT, SURFACE, STEP, RATE_CAP, CHUNK, CHUNKS_X, CHUNKS_Y, TARGET, MATERIAL, depthAt } from "./sim.ts";
import type { Command } from "./sim.ts";

function element(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node;
}
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is required");
  return context;
}
const canvas = document.querySelector<HTMLCanvasElement>("#world");
if (!canvas) throw new Error("Missing canvas");
const screen = canvas;
const ctx = context2d(screen);
const terrain = document.createElement("canvas");
terrain.width = WIDTH;
terrain.height = HEIGHT;
const terrainCtx = context2d(terrain);
const pixels = terrainCtx.createImageData(WIDTH, HEIGHT);
const painted = new Uint32Array(CHUNKS_X * CHUNKS_Y);
const field = fieldFromQuery(new URLSearchParams(location.search), DEFAULT_FIELD);
let sim = new SandSim(field);
const keys = new Set<string>();
const overlay = element("overlay");
const title = element("overlay-title");
const copy = element("overlay-copy");
const begin = element("begin");
const coarsePointer = matchMedia("(pointer: coarse), (max-width: 600px)").matches;
if (coarsePointer) {
  copy.innerHTML = "<p>Arrows steer and aim. Hold ↑ to thrust. Hold DRILL to dig.</p><p>Bring 20 deep crystals back up. Release ↑ to refill fuel.</p><p>LOOK watches the shaft above. Tap Help for controls.</p>";
}
const helpCopy = copy.innerHTML;
const depthLabel = element("depth");
const stretchLabel = element("stretch");
const localLabel = element("local");
const surfaceLabel = element("surface");
const exchangeLabel = element("exchange");
const cargoLabel = element("cargo");
const objectiveLabel = element("objective");
const conditionLabel = element("condition");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const rateNote = element("rate-note");
const receipt = element("receipt");
const fuel = document.querySelector<HTMLMeterElement>("#fuel");
let help = true;
let ended = false;
let width = innerWidth;
let height = innerHeight;
const scale = 4;
let cameraX = 0;
let cameraY = -24;
let drawX = 0;
let drawY = 0;
let pointerX = 0;
let pointerY = 0;
let pointerDrill = false;
let pointerAim = false;
let previousDrilled = 0;
let previousCrystals = 0;
let previousReturns = 0;
let receiptUntil = 0;
let audioContext: AudioContext | null = null;
let lastSound = 0;
let frameCount = 0;
let measurementStart = performance.now();
let frameTime = performance.now();
let frameWork = 0;
let stepWork = 0;
let measuredSteps = 0;
const frameCosts = new Float64Array(600);
let costIndex = 0;
const cosmeticRandom = createRng(920);
const particles = Array.from({ length: 160 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, crystal: false }));
let particleIndex = 0;

function resize(): void {
  width = innerWidth;
  height = innerHeight;
  const ratio = Math.min(2, devicePixelRatio);
  screen.width = Math.floor(width * ratio);
  screen.height = Math.floor(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
addEventListener("resize", resize);
resize();

function unlockAudio(): void {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
}
function blip(crystal: boolean): void {
  if (!audioContext || sim.localTime - lastSound < 0.09) return;
  lastSound = sim.localTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = crystal ? "sine" : "triangle";
  oscillator.frequency.setValueAtTime(crystal ? 740 : 105, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(crystal ? 1480 : 45, audioContext.currentTime + 0.075);
  gain.gain.setValueAtTime(crystal ? 0.055 : 0.025, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.09);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.1);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
function restart(): void {
  sim = new SandSim(field);
  painted.fill(0);
  particles.forEach(particle => { particle.life = 0; });
  cameraY = -24;
  cameraX = 0;
  previousDrilled = previousCrystals = previousReturns = 0;
  receiptUntil = lastSound = 0;
  receipt.textContent = "";
  ended = false;
  help = false;
  overlay.hidden = true;
  keys.clear();
}
function dismiss(): void {
  unlockAudio();
  if (ended) { restart(); return; }
  help = false;
  overlay.hidden = true;
}
function showHelp(): void {
  if (ended) return;
  help = !help;
  overlay.hidden = !help;
  title.innerHTML = "The world<br>runs ahead.";
  copy.innerHTML = helpCopy;
  begin.textContent = "Any key or tap to descend";
  keys.clear();
}
element("restart-button").addEventListener("click", () => { unlockAudio(); restart(); });
element("help-button").addEventListener("click", showHelp);
begin.addEventListener("click", dismiss);
overlay.addEventListener("pointerdown", event => { event.preventDefault(); dismiss(); });
addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(event.code) && event.code !== "Tab") event.preventDefault();
  unlockAudio();
  if (event.code === "KeyR") { restart(); return; }
  if (event.code === "KeyH" && !event.repeat) { showHelp(); return; }
  if (help || ended) { dismiss(); return; }
  keys.add(event.code);
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) pointerAim = false;
});
addEventListener("keyup", event => keys.delete(event.code));
addEventListener("blur", () => { keys.clear(); pointerDrill = false; });
screen.addEventListener("pointerdown", event => {
  unlockAudio();
  if (help || ended) { dismiss(); return; }
  pointerX = event.clientX;
  pointerY = event.clientY;
  pointerDrill = true;
  pointerAim = true;
  screen.setPointerCapture(event.pointerId);
});
screen.addEventListener("pointermove", event => {
  pointerX = event.clientX;
  pointerY = event.clientY;
  if (event.pointerType === "mouse" && event.buttons === 1) pointerAim = true;
});
function releasePointer(): void { pointerDrill = false; }
screen.addEventListener("pointerup", releasePointer);
screen.addEventListener("pointercancel", releasePointer);
screen.addEventListener("contextmenu", event => event.preventDefault());
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-key]")) {
  const key = button.dataset.key;
  if (!key) continue;
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    unlockAudio();
    pointerAim = false;
    keys.add(key);
    button.classList.add("pressed");
    button.setPointerCapture(event.pointerId);
  });
  const release = () => { keys.delete(key); button.classList.remove("pressed"); };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}
function command(): Command {
  const left = keys.has("KeyA") || keys.has("ArrowLeft");
  const right = keys.has("KeyD") || keys.has("ArrowRight");
  const up = keys.has("KeyW") || keys.has("ArrowUp");
  const down = keys.has("KeyS") || keys.has("ArrowDown");
  let aimX = Number(right) - Number(left);
  let aimY = Number(down) - Number(up);
  if (keys.has("Space") && aimX === 0 && aimY === 0) aimY = -1;
  if (pointerAim) { aimX = (pointerX - drawX) / scale - sim.player.x; aimY = (pointerY - drawY) / scale - sim.player.y; }
  return { move: Number(right) - Number(left), aimX, aimY, thrust: up || keys.has("Space"), drill: pointerDrill || keys.has("KeyX") || keys.has("ShiftLeft") || keys.has("ShiftRight") };
}

const materials = [[14, 31, 39], [116, 81, 61], [55, 73, 83], [221, 175, 100], [62, 151, 183], [170, 201, 205], [232, 103, 57], [174, 247, 204], [102, 137, 81]];
const rocks = [[64, 82, 86], [59, 80, 90], [49, 70, 85], [58, 63, 83], [66, 57, 77], [75, 54, 67], [79, 51, 58]];
function paintTerrain(): void {
  for (let cy = 0; cy < CHUNKS_Y; cy++) for (let cx = 0; cx < CHUNKS_X; cx++) {
    const chunk = cy * CHUNKS_X + cx;
    if (painted[chunk] === sim.dirty[chunk]) continue;
    painted[chunk] = sim.dirty[chunk];
    const endY = Math.min(HEIGHT, (cy + 1) * CHUNK);
    const endX = Math.min(WIDTH, (cx + 1) * CHUNK);
    for (let y = cy * CHUNK; y < endY; y++) for (let x = cx * CHUNK; x < endX; x++) {
      const material = sim.cells[y * WIDTH + x];
      const color = material === MATERIAL.rock ? rocks[Math.min(6, Math.max(0, Math.floor((y - SURFACE) / 108)))] : materials[material];
      const hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
      const noise = material === MATERIAL.air ? 0 : (hash >>> 15 & 7) - 3;
      const band = material === MATERIAL.rock && (y + Math.floor(Math.sin(x * 0.04) * 4)) % 25 < 2 ? -9 : 0;
      const i = (y * WIDTH + x) * 4;
      pixels.data[i] = color[0] + noise + band;
      pixels.data[i + 1] = color[1] + noise + band;
      pixels.data[i + 2] = color[2] + noise + band;
      pixels.data[i + 3] = material === MATERIAL.air && y < SURFACE ? 0 : 255;
    }
    terrainCtx.putImageData(pixels, 0, 0, cx * CHUNK, cy * CHUNK, endX - cx * CHUNK, endY - cy * CHUNK);
  }
}
function sky(x: number, y: number, zoom: number): void {
  const daylight = (Math.sin(sim.surfaceTime / 90 * Math.PI * 2) + 1) / 2;
  ctx.fillStyle = daylight > 0.45 ? "#315869" : "#142d42";
  ctx.fillRect(x, y, WIDTH * zoom, SURFACE * zoom);
  if (daylight < 0.45) {
    ctx.fillStyle = "#8aa6b4";
    for (let star = 0; star < 22; star++) ctx.fillRect(x + ((star * 79 + 17) % WIDTH) * zoom, y + (4 + star * 13 % 27) * zoom, zoom, zoom);
  }
  ctx.fillStyle = daylight > 0.45 ? "#edcc8d" : "#afc7d3";
  const sunX = 25 + sim.surfaceTime % 90 / 90 * 185;
  ctx.fillRect(Math.floor(x + sunX * zoom), Math.floor(y + 9 * zoom), 6 * zoom, 6 * zoom);
  ctx.fillStyle = sim.raining ? "#526d7d" : "#91a4a6";
  for (let cloud = 0; cloud < 4; cloud++) {
    const cloudX = (cloud * 73 + sim.surfaceTime * 0.7) % (WIDTH + 25) - 25;
    ctx.fillRect(Math.floor(x + cloudX * zoom), y + (17 + cloud % 2 * 7) * zoom, 23 * zoom, 4 * zoom);
    ctx.fillRect(Math.floor(x + (cloudX + 5) * zoom), y + (14 + cloud % 2 * 7) * zoom, 13 * zoom, 4 * zoom);
  }
}
function plants(x: number, y: number, zoom: number): void {
  ctx.fillStyle = "#7f9d6a";
  for (let column = 0; column < WIDTH; column++) {
    const length = sim.plants[column];
    if (length === 0 || sim.cell(column, SURFACE) !== MATERIAL.grass) continue;
    const px = x + column * zoom;
    const py = y + (SURFACE - length) * zoom;
    ctx.fillRect(px, py, zoom, length * zoom);
    if (length > 4) ctx.fillRect(px - zoom, py + 2 * zoom, 3 * zoom, zoom);
    if (length > 8) { ctx.fillStyle = "#c5bd83"; ctx.fillRect(px, py, zoom, zoom); ctx.fillStyle = "#7f9d6a"; }
  }
}
function surfaceView(): void {
  const compact = width < 650;
  const viewWidth = compact ? 128 : 248;
  const left = width - viewWidth - 25;
  const top = compact ? 152 : 155;
  ctx.fillStyle = "#10232d";
  ctx.fillRect(left - 1, top - 17, viewWidth + 2, 92);
  ctx.strokeStyle = "#607e86";
  ctx.strokeRect(left - 0.5, top - 17.5, viewWidth + 1, 92);
  ctx.save();
  ctx.beginPath(); ctx.rect(left + 4, top, viewWidth - 8, 68); ctx.clip();
  const sx = left + 4 - (compact ? 60 : 0);
  sky(sx, top, 1);
  ctx.drawImage(terrain, 0, 0, WIDTH, 68, sx, top, WIDTH, 68);
  plants(sx, top, 1);
  if (stretchAt(field, depthAt(sim.player.y)) > RATE_CAP) {
    ctx.fillStyle = "#e2b46b25";
    for (let streak = 0; streak < 7; streak++) ctx.fillRect(left + 4, top + (streak * 11 + Math.floor(sim.surfaceTime * 3)) % 66, viewWidth - 8, 1);
  }
  ctx.restore();
  ctx.font = "9px monospace";
  ctx.fillStyle = "#b8cbcc";
  ctx.fillText(compact ? "SURFACE / LIVE" : `SURFACE / LIVE / ${sim.raining ? "RAIN" : "CLEAR"}`, left + 7, top - 6);
}
function rateGauge(): void {
  const gx = width - 12;
  const top = 260;
  const bottom = height - 120;
  for (let sy = top; sy < bottom; sy += 4) {
    const y = (sy - drawY) / scale;
    const rate = rateBetween(field, depthAt(sim.player.y), depthAt(y));
    ctx.fillStyle = rate > RATE_CAP ? "#e2b46b" : rate > 1.05 ? "#a39165" : rate < 0.95 ? "#557f9e" : "#b5f4cc";
    ctx.fillRect(gx, sy, 4, 4);
    if (rate > RATE_CAP && Math.floor(sy / 4) % 2 === 0) { ctx.fillStyle = "#10232d"; ctx.fillRect(gx, sy, 4, 1); }
  }
  const py = Math.floor(drawY + sim.player.y * scale);
  ctx.fillStyle = "#b5f4cc";
  if (py > top && py < bottom) ctx.fillRect(gx - 5, py, 9, 2);
  ctx.font = "9px monospace";
  ctx.textAlign = "right";
  ctx.fillStyle = "#c3d4d5";
  ctx.fillText(`${rateBetween(field, depthAt(sim.player.y), depthAt((top - drawY) / scale)).toFixed(1)}x`, gx - 4, top + 5);
  ctx.fillText(`${rateBetween(field, depthAt(sim.player.y), depthAt((bottom - drawY) / scale)).toFixed(1)}x`, gx - 4, bottom);
  ctx.textAlign = "left";
}
function worldDetails(): void {
  const worldLeft = drawX;
  ctx.font = "10px monospace";
  for (let band = 0; band <= 8; band++) {
    const row = SURFACE + band * field.doublingMetres / 0.5;
    const sy = Math.floor(drawY + row * scale);
    if (sy < 150 || sy > height - 110) continue;
    ctx.fillStyle = "#7f9aa8";
    const labelX = Math.max(18, worldLeft - 70);
    ctx.fillText(`${Math.round(depthAt(row))} m`, labelX, sy - 6);
    ctx.fillStyle = "#9cafae44";
    ctx.fillRect(labelX, sy, Math.max(10, worldLeft - labelX + 12), 1);
  }
  for (let seam = 0; seam < 18; seam++) {
    const cy = 460 + Math.floor(seam / 3) * 49;
    const cx = seam % 3 === 0 ? 120 : seam % 3 === 1 ? 88 : 157;
    const sx = drawX + cx * scale;
    const sy = drawY + cy * scale;
    if (sy < 130 || sy > height || sim.cell(cx, cy) !== MATERIAL.crystal) continue;
    ctx.strokeStyle = sim.ticks % 90 < 45 ? "#b5f4cc70" : "#b5f4cc30";
    ctx.strokeRect(sx - 14, sy - 14, 29, 29);
    ctx.fillStyle = "#b5f4cc90";
    ctx.fillRect(sx + 18, sy - 1, 5, 2);
    ctx.fillRect(sx + 20, sy - 3, 1, 6);
  }
  const horizonY = drawY + (HEIGHT - 5) * scale;
  if (horizonY > 130 && horizonY < height - 100) {
    ctx.fillStyle = "#d9a184";
    ctx.fillRect(drawX, horizonY, WIDTH * scale, 2);
    ctx.font = "10px monospace";
    ctx.fillText("EVENT HORIZON", Math.max(20, drawX + 25), horizonY - 12);
  }
  if (sim.player.crystals >= TARGET) {
    ctx.fillStyle = "#b5f4cc";
    ctx.font = "11px monospace";
    ctx.fillText("↑ BRING THEM HOME", Math.floor(drawX + sim.player.x * scale) - 57, Math.floor(drawY + sim.player.y * scale) - 35);
  }
}
function vehicle(): void {
  const p = sim.player;
  const x = Math.floor(drawX + p.x * scale);
  const y = Math.floor(drawY + p.y * scale);
  ctx.fillStyle = "#07141d";
  ctx.fillRect(x - 13, y - 12, 27, 25);
  ctx.fillStyle = "#b78c56";
  ctx.fillRect(x - 11, y - 9, 22, 18);
  ctx.fillStyle = "#e3c080";
  ctx.fillRect(x - 10, y - 10, 20, 4);
  ctx.fillStyle = "#578590";
  ctx.fillRect(x - 7, y - 5, 14, 7);
  ctx.fillStyle = "#b4d9d6";
  ctx.fillRect(x - 6, y - 5, 7, 3);
  ctx.fillStyle = "#273c48";
  ctx.fillRect(x - 13, y + 6, 5, 5);
  ctx.fillRect(x + 8, y + 6, 5, 5);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(p.aimY, p.aimX));
  ctx.fillStyle = "#d1d2be";
  ctx.beginPath(); ctx.moveTo(9, -5); ctx.lineTo(21, 0); ctx.lineTo(9, 5); ctx.fill();
  ctx.strokeStyle = "#6d828a";
  ctx.beginPath(); ctx.moveTo(12, -3); ctx.lineTo(15, 3); ctx.stroke();
  ctx.restore();
  if (p.thrusting) {
    ctx.fillStyle = "#ed965b";
    ctx.fillRect(x - 7, y + 10, 4, 7 + sim.ticks % 3 * 3);
    ctx.fillRect(x + 3, y + 10, 4, 7 + sim.ticks % 3 * 3);
    ctx.fillStyle = "#ffdaa0";
    ctx.fillRect(x - 6, y + 10, 2, 6);
    ctx.fillRect(x + 4, y + 10, 2, 6);
  }
}
function particleEffects(dt: number): void {
  const crystal = sim.player.crystals > previousCrystals;
  if (sim.drilled > previousDrilled) {
    const count = Math.min(16, sim.drilled - previousDrilled);
    for (let n = 0; n < count; n++) {
      const particle = particles[particleIndex++ % particles.length];
      particle.x = sim.player.x + sim.player.aimX * 4;
      particle.y = sim.player.y + sim.player.aimY * 4;
      particle.vx = (cosmeticRandom() - 0.5) * 35;
      particle.vy = -cosmeticRandom() * 28;
      particle.life = 0.25 + cosmeticRandom() * 0.4;
      particle.crystal = crystal;
    }
    blip(crystal);
  }
  previousDrilled = sim.drilled;
  previousCrystals = sim.player.crystals;
  for (const particle of particles) {
    if (particle.life <= 0) continue;
    particle.life -= dt;
    particle.vy += dt * 60;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    ctx.fillStyle = particle.crystal ? "#c7ffdc" : "#debd7f";
    ctx.fillRect(Math.floor(drawX + particle.x * scale), Math.floor(drawY + particle.y * scale), 2, 2);
  }
}
function returnLine(): string {
  return `While you were away: ${sim.rainEvents} rains, ${sim.grassGrown} grass shoots, rain seeped ${Math.floor(sim.waterDepth)} m down.`;
}
function hud(): void {
  const stretch = stretchAt(field, depthAt(sim.player.y));
  depthLabel.textContent = `${Math.max(0, depthAt(sim.player.y)).toFixed(0)} m`;
  stretchLabel.textContent = formatStretch(stretch);
  localLabel.textContent = formatDuration(sim.localTime);
  surfaceLabel.textContent = formatDuration(sim.surfaceTime);
  exchangeLabel.textContent = exchangeSentence(stretch);
  cargoLabel.textContent = `◇ ${sim.player.crystals} / ${TARGET}`;
  objectiveLabel.textContent = sim.player.crystals >= TARGET ? "Return to the surface ↑" : "Find crystals below 200 m";
  conditionLabel.textContent = sim.player.hull < 90 ? `HEAT ${Math.round(100 - sim.player.hull)}% / leave lava` : sim.player.fuel < 15 ? "Release thrust to refill" : "Release to refill";
  if (fuel) fuel.value = sim.player.fuel;
  rateNote.hidden = stretch <= RATE_CAP;
  if (sim.returnCount > previousReturns && sim.status === "playing") { receipt.textContent = returnLine(); receiptUntil = sim.localTime + 9; }
  previousReturns = sim.returnCount;
  if (sim.localTime > receiptUntil) receipt.textContent = "";
  if (sim.status !== "playing" && !ended) {
    ended = true;
    overlay.hidden = false;
    title.innerHTML = sim.status === "won" ? "Back before<br>you know it." : "Too close<br>to the fire.";
    copy.replaceChildren();
    const numbers = document.createElement("p");
    numbers.textContent = `${sim.player.crystals} crystals · ${Math.floor(sim.maxDepth)} m deepest · ${formatDuration(sim.localTime)} for you · ${formatDuration(sim.surfaceTime)} at the surface.`;
    const away = document.createElement("p");
    away.textContent = returnLine();
    copy.append(numbers, away);
    begin.textContent = "R or tap to dive again";
    keys.clear();
  }
}

runFixedLoop(STEP, () => {
  if (help || document.hidden || sim.status !== "playing") return;
  const start = performance.now();
  sim.step(command());
  stepWork += performance.now() - start;
  measuredSteps++;
}, () => {
  const start = performance.now();
  const dt = Math.min(0.05, (start - frameTime) / 1000);
  frameTime = start;
  const lookingUp = keys.has("KeyQ");
  const targetY = Math.max(-24, Math.min(HEIGHT - height / scale + 20, sim.player.y - height / scale * 0.55 - (lookingUp ? 90 : 0)));
  cameraY += (targetY - cameraY) * (1 - Math.exp(-dt * 8));
  const targetX = width < WIDTH * scale + 100 ? Math.max(0, Math.min(WIDTH - width / scale, sim.player.x - width / scale / 2)) : -(width / scale - WIDTH) / 2;
  cameraX += (targetX - cameraX) * (1 - Math.exp(-dt * 10));
  drawX = -Math.round(cameraX) * scale;
  drawY = -Math.round(cameraY) * scale;
  if (sim.impact > 0.12 && !help && !reducedMotion) { drawX += sim.ticks % 2 === 0 ? 1 : -1; drawY += sim.ticks % 3 === 0 ? 1 : 0; }
  ctx.fillStyle = "#10232d"; ctx.fillRect(0, 0, width, height);
  sky(drawX, drawY, scale);
  paintTerrain();
  const fromY = Math.max(0, Math.floor(cameraY));
  const rows = Math.min(HEIGHT - fromY, Math.ceil(height / scale) + 2);
  ctx.drawImage(terrain, 0, fromY, WIDTH, rows, drawX, drawY + fromY * scale, WIDTH * scale, rows * scale);
  plants(drawX, drawY, scale);
  worldDetails();
  vehicle();
  particleEffects(help ? 0 : dt);
  surfaceView();
  rateGauge();
  if (frameCount % 6 === 0) hud();
  frameCount++;
  frameWork += performance.now() - start;
  frameCosts[costIndex++ % frameCosts.length] = performance.now() - start;
  if (start - measurementStart >= 2000) {
    screen.dataset.fps = (frameCount * 1000 / (start - measurementStart)).toFixed(1);
    screen.dataset.renderMs = (frameWork / frameCount).toFixed(2);
    screen.dataset.simMs = (stepWork / Math.max(1, measuredSteps)).toFixed(2);
    const costs = frameCosts.slice(0, Math.min(costIndex, frameCosts.length)).sort();
    screen.dataset.renderP95Ms = costs[Math.floor(costs.length * 0.95)].toFixed(2);
    screen.dataset.world = `${WIDTH}x${HEIGHT}`;
    screen.dataset.field = `${field.law}/${field.doublingMetres}`;
    frameCount = frameWork = stepWork = measuredSteps = 0;
    measurementStart = start;
  }
});
