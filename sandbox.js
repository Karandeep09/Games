const canvas = document.querySelector("#sandbox");
const ctx = canvas.getContext("2d");
const clearButton = document.querySelector("#clear-button");
const brushInput = document.querySelector("#brush-size");
const brushReadout = document.querySelector("#brush-readout");
const materialReadout = document.querySelector("#material-readout");
const gravityReadout = document.querySelector("#gravity-readout");
const tiltButton = document.querySelector("#tilt-button");
const toolButtons = [...document.querySelectorAll(".tool")];

const width = canvas.width;
const height = canvas.height;
const EMPTY = 0;
const SAND = 1;
const WATER = 2;
const POWDER = 3;
const FIRE = 4;
const STONE = 5;
const SMOKE = 6;
const STEAM = 7;

const materialIds = {
  erase: EMPTY,
  sand: SAND,
  water: WATER,
  powder: POWDER,
  fire: FIRE,
  stone: STONE,
};

const colors = {
  [EMPTY]: [6, 9, 16, 255],
  [SAND]: [236, 204, 104, 255],
  [WATER]: [61, 139, 255, 232],
  [POWDER]: [48, 42, 34, 255],
  [FIRE]: [255, 116, 34, 255],
  [STONE]: [128, 137, 145, 255],
  [SMOKE]: [86, 94, 102, 168],
  [STEAM]: [205, 230, 238, 150],
};

const cells = new Uint8Array(width * height);
const life = new Uint8Array(width * height);
const image = ctx.createImageData(width, height);
let currentMaterial = SAND;
let brushSize = Number(brushInput.value);
let drawing = false;
let gravityX = 0;
let gravityY = 1;
let tiltEnabled = false;
let sensorMode = "manual";
let lastMotionAt = 0;

seedWalls();
resizeCanvas();
requestAnimationFrame(loop);

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentMaterial = materialIds[button.dataset.material];
    toolButtons.forEach((item) => item.classList.toggle("active", item === button));
    materialReadout.textContent = button.textContent.trim();
  });
});

brushInput.addEventListener("input", () => {
  brushSize = Number(brushInput.value);
  brushReadout.textContent = brushInput.value;
});

clearButton.addEventListener("click", () => {
  cells.fill(EMPTY);
  life.fill(0);
  seedWalls();
});

canvas.addEventListener("pointerdown", (event) => {
  drawing = true;
  canvas.setPointerCapture(event.pointerId);
  paint(event);
});

canvas.addEventListener("pointermove", (event) => {
  if (drawing) paint(event);
});

canvas.addEventListener("pointerup", () => {
  drawing = false;
});

canvas.addEventListener("pointercancel", () => {
  drawing = false;
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", updateKeyboardGravity);
window.addEventListener("deviceorientation", updateTiltGravity);
window.addEventListener("devicemotion", updateMotionGravity);

tiltButton.addEventListener("click", async () => {
  const hasOrientation = typeof DeviceOrientationEvent !== "undefined";
  const hasMotion = typeof DeviceMotionEvent !== "undefined";

  if (!hasOrientation && !hasMotion) {
    gravityReadout.textContent = "Gravity: sensors unavailable";
    return;
  }

  const permissions = [];
  if (hasOrientation && typeof DeviceOrientationEvent.requestPermission === "function") {
    permissions.push(DeviceOrientationEvent.requestPermission());
  }
  if (hasMotion && typeof DeviceMotionEvent.requestPermission === "function") {
    permissions.push(DeviceMotionEvent.requestPermission());
  }

  let results = [];
  try {
    results = await Promise.all(permissions);
  } catch {
    gravityReadout.textContent = "Gravity: permission blocked";
    return;
  }

  if (results.some((permission) => permission !== "granted")) {
    gravityReadout.textContent = "Gravity: permission blocked";
    return;
  }

  tiltEnabled = !tiltEnabled;
  sensorMode = tiltEnabled ? "sensor" : "manual";
  tiltButton.classList.toggle("active", tiltEnabled);
  gravityReadout.textContent = tiltEnabled ? "Gravity: mobile sensors active" : "Gravity: arrows active";
});

function index(x, y) {
  return y * width + x;
}

function inBounds(x, y) {
  return x >= 0 && x < width && y >= 0 && y < height;
}

function get(x, y) {
  return inBounds(x, y) ? cells[index(x, y)] : STONE;
}

function setCell(x, y, material) {
  if (!inBounds(x, y)) return;
  const i = index(x, y);
  cells[i] = material;
  if (material === FIRE) life[i] = 16 + Math.floor(Math.random() * 22);
  else if (material === STEAM) life[i] = 70 + Math.floor(Math.random() * 80);
  else life[i] = 0;
}

function swap(a, b) {
  const material = cells[a];
  cells[a] = cells[b];
  cells[b] = material;
  const savedLife = life[a];
  life[a] = life[b];
  life[b] = savedLife;
}

function setGravity(x, y, label = "Custom") {
  const length = Math.hypot(x, y) || 1;
  gravityX = x / length;
  gravityY = y / length;
  gravityReadout.textContent = `Gravity: ${label}`;
}

function updateKeyboardGravity(event) {
  if (event.key === "ArrowDown") setManualGravity(0, 1, "Down");
  else if (event.key === "ArrowUp") setManualGravity(0, -1, "Up");
  else if (event.key === "ArrowLeft") setManualGravity(-1, 0, "Left");
  else if (event.key === "ArrowRight") setManualGravity(1, 0, "Right");
  else return;
  event.preventDefault();
}

function setManualGravity(x, y, label) {
  tiltEnabled = false;
  sensorMode = "manual";
  tiltButton.classList.remove("active");
  setGravity(x, y, label);
}

function updateMotionGravity(event) {
  if (!tiltEnabled || !event.accelerationIncludingGravity) return;
  const { x, y } = event.accelerationIncludingGravity;
  if (x === null || y === null) return;

  const nextX = clamp(x / 9.8, -1, 1);
  const nextY = clamp(y / 9.8, -1, 1);
  const gravity = rotateForScreen(nextX, -nextY);
  if (Math.hypot(gravity.x, gravity.y) < 0.18) return;

  lastMotionAt = performance.now();
  sensorMode = "accelerometer";
  setGravity(gravity.x, gravity.y, sensorLabel(gravity.x, gravity.y, "Accel"));
}

function updateTiltGravity(event) {
  if (!tiltEnabled || event.beta === null || event.gamma === null) return;
  if (performance.now() - lastMotionAt < 350) return;

  const x = clamp(event.gamma / 28, -1, 1);
  const y = clamp(event.beta / 28, -1, 1);
  const gravity = rotateForScreen(x, y);
  if (Math.hypot(gravity.x, gravity.y) < 0.18) return;
  sensorMode = "gyroscope";
  setGravity(gravity.x, gravity.y, sensorLabel(gravity.x, gravity.y, "Gyro"));
}

function sensorLabel(x, y, prefix) {
  const direction = Math.abs(x) > Math.abs(y) ? (x > 0 ? "Right" : "Left") : y > 0 ? "Down" : "Up";
  return `${prefix} ${direction}`;
}

function rotateForScreen(x, y) {
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  if (angle === 90) return { x: -y, y: x };
  if (angle === -90 || angle === 270) return { x: y, y: -x };
  if (angle === 180) return { x: -x, y: -y };
  return { x, y };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function paint(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * width);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * height);

  for (let dy = -brushSize; dy <= brushSize; dy += 1) {
    for (let dx = -brushSize; dx <= brushSize; dx += 1) {
      if (dx * dx + dy * dy > brushSize * brushSize) continue;
      if (Math.random() < 0.1 && currentMaterial !== EMPTY && currentMaterial !== WATER) continue;
      setCell(x + dx, y + dy, currentMaterial);
    }
  }
}

function loop() {
  step();
  render();
  requestAnimationFrame(loop);
}

function step() {
  const yStart = gravityY >= 0 ? height - 2 : 1;
  const yEnd = gravityY >= 0 ? 0 : height - 1;
  const yStep = gravityY >= 0 ? -1 : 1;
  const xStart = gravityX >= 0 ? width - 2 : 1;
  const xEnd = gravityX >= 0 ? 0 : width - 1;
  const xStep = gravityX >= 0 ? -1 : 1;

  for (let y = yStart; y !== yEnd; y += yStep) {
    const leftFirst = Math.random() < 0.5;
    for (let scan = xStart; scan !== xEnd; scan += xStep) {
      const x = leftFirst ? scan : width - 1 - scan;
      if (x <= 0 || x >= width - 1) continue;
      const i = index(x, y);
      const material = cells[i];
      if (material === SAND) updateSand(x, y);
      else if (material === WATER) updateWater(x, y);
      else if (material === POWDER) updatePowder(x, y);
      else if (material === FIRE) updateFire(x, y);
      else if (material === SMOKE) updateSmoke(x, y);
      else if (material === STEAM) updateSteam(x, y);
    }
  }
}

function canMoveInto(material) {
  return material === EMPTY || material === WATER || material === SMOKE || material === STEAM;
}

function tryMove(x, y, nx, ny) {
  if (!inBounds(nx, ny)) return false;
  const from = index(x, y);
  const to = index(nx, ny);
  if (!canMoveInto(cells[to])) return false;
  swap(from, to);
  return true;
}

function updateSand(x, y) {
  const moves = gravityMoves(false);
  moves.some(([dx, dy]) => tryMove(x, y, x + dx, y + dy));
}

function updateWater(x, y) {
  if (touching(x, y, FIRE)) {
    setCell(x, y, STEAM);
    return;
  }

  const moves = gravityMoves(true);
  moves.some(([dx, dy]) => tryMove(x, y, x + dx, y + dy));
}

function updatePowder(x, y) {
  if (touching(x, y, FIRE)) {
    explode(x, y, 5);
    return;
  }
  updateSand(x, y);
}

function updateFire(x, y) {
  const i = index(x, y);
  life[i] -= 1;
  igniteNeighbors(x, y);
  if (get(x, y + 1) === WATER || life[i] === 0) {
    setCell(x, y, Math.random() < 0.45 ? SMOKE : EMPTY);
    return;
  }
  const moves = gravityMoves(true, true);
  if (Math.random() < 0.5) moves.some(([dx, dy]) => tryMove(x, y, x + dx, y + dy));
}

function updateSmoke(x, y) {
  const i = index(x, y);
  life[i] = life[i] || 50;
  life[i] -= 1;
  if (life[i] === 0) {
    setCell(x, y, EMPTY);
    return;
  }
  const moves = gravityMoves(true, true);
  moves.some(([dx, dy]) => tryMove(x, y, x + dx, y + dy));
}

function updateSteam(x, y) {
  const i = index(x, y);
  life[i] = life[i] || 90;
  life[i] -= 1;

  if (life[i] === 0 || x <= 1 || x >= width - 2 || y <= 1 || y >= height - 2) {
    setCell(x, y, Math.random() < 0.18 ? WATER : EMPTY);
    return;
  }

  if (Math.random() < 0.04 && !touching(x, y, FIRE)) {
    setCell(x, y, WATER);
    return;
  }

  const moves = gravityMoves(true, true);
  moves.some(([dx, dy]) => tryMove(x, y, x + dx, y + dy));
}

function gravityMoves(spread = false, reverse = false) {
  const forceX = reverse ? -gravityX : gravityX;
  const forceY = reverse ? -gravityY : gravityY;
  const dx = Math.abs(forceX) > 0.18 ? Math.sign(forceX) : 0;
  const dy = Math.abs(forceY) > 0.18 ? Math.sign(forceY) : 0;
  const dominantX = Math.abs(forceX) > Math.abs(forceY);
  const sideA = dominantX ? [0, Math.random() < 0.5 ? -1 : 1] : [Math.random() < 0.5 ? -1 : 1, 0];
  const sideB = [-sideA[0], -sideA[1]];
  const primary = [dx || (dominantX ? Math.sign(forceX) : 0), dy || (!dominantX ? Math.sign(forceY) : 0)];
  const moves = [];

  if (primary[0] || primary[1]) moves.push(primary);
  if (spread) {
    moves.push([primary[0] + sideA[0], primary[1] + sideA[1]]);
    moves.push([primary[0] + sideB[0], primary[1] + sideB[1]]);
    moves.push(sideA, sideB);
  } else {
    moves.push([primary[0] + sideA[0], primary[1] + sideA[1]]);
    moves.push([primary[0] + sideB[0], primary[1] + sideB[1]]);
  }

  return moves.filter(([moveX, moveY]) => moveX || moveY);
}

function touching(x, y, material) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (get(x + dx, y + dy) === material) return true;
    }
  }
  return false;
}

function igniteNeighbors(x, y) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      const material = get(nx, ny);
      if (material === POWDER && Math.random() < 0.28) explode(nx, ny, 4);
      if (material === WATER && Math.random() < 0.42) setCell(nx, ny, STEAM);
    }
  }
}

function explode(cx, cy, radius) {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > radius || !inBounds(x, y)) continue;
      const material = get(x, y);
      if (material === STONE && dist > radius * 0.55) continue;
      setCell(x, y, dist < radius * 0.52 ? FIRE : SMOKE);
    }
  }
}

function render() {
  const data = image.data;
  for (let i = 0; i < cells.length; i += 1) {
    const material = cells[i];
    const color = colors[material];
    const shade = material === EMPTY ? 0 : Math.floor(Math.random() * 16);
    const sparkle = material === FIRE ? Math.floor(Math.random() * 52) : 0;
    const p = i * 4;
    data[p] = Math.min(255, Math.max(0, color[0] - shade + sparkle));
    data[p + 1] = Math.min(255, Math.max(0, color[1] - shade + sparkle * 0.35));
    data[p + 2] = Math.max(0, color[2] - shade);
    data[p + 3] = color[3];
  }
  ctx.putImageData(image, 0, 0);
}

function resizeCanvas() {
  const wrap = canvas.parentElement;
  const bounds = wrap.getBoundingClientRect();
  const ratio = width / height;
  const targetHeight = Math.min(window.innerHeight - 190, bounds.width / ratio);
  wrap.style.height = `${Math.max(320, targetHeight)}px`;
}

function seedWalls() {
  for (let x = 0; x < width; x += 1) {
    setCell(x, height - 1, STONE);
    setCell(x, 0, STONE);
  }
  for (let y = 0; y < height; y += 1) {
    setCell(0, y, STONE);
    setCell(width - 1, y, STONE);
  }
}
