import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const canvas = document.querySelector("#game");
const scoreEl = document.querySelector("#score");
const shieldEl = document.querySelector("#shield");
const waveEl = document.querySelector("#wave");
const messageEl = document.querySelector("#message");
const startButton = document.querySelector("#start-button");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03050d);
scene.fog = new THREE.FogExp2(0x06101f, 0.028);

const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 260);
camera.position.set(0, 4.8, 12);
camera.lookAt(0, 0, -12);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.34;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.88,
  0.7,
  0.18,
);
composer.addPass(bloomPass);

const clock = new THREE.Clock();
const pointer = new THREE.Vector2();
const shipTarget = new THREE.Vector3();
const keyboard = new Set();

const game = {
  active: false,
  score: 0,
  shield: 100,
  wave: 1,
  speed: 16,
  boost: 0,
  shotCooldown: 0,
  spawnTimer: 0,
  alienTimer: 0,
  coreTimer: 0,
  shake: 0,
};

const world = {
  halfWidth: 8,
  top: 5,
  bottom: -3.7,
  frontZ: 14,
  backZ: -118,
};

const asteroidGeometry = new THREE.IcosahedronGeometry(1, 1);
const asteroidDetailGeometry = new THREE.DodecahedronGeometry(1.015, 0);
const coreGeometry = new THREE.OctahedronGeometry(0.55, 0);
const laserGeometry = new THREE.CylinderGeometry(0.055, 0.055, 2.25, 12);
const sparkGeometry = new THREE.SphereGeometry(0.08, 8, 6);
const alienHullGeometry = new THREE.SphereGeometry(0.8, 28, 14);
const alienDomeGeometry = new THREE.SphereGeometry(0.48, 24, 12);
const alienRingGeometry = new THREE.TorusGeometry(0.86, 0.08, 10, 36);
const alienShotGeometry = new THREE.CylinderGeometry(0.085, 0.16, 1.25, 14);

const asteroidMaterial = new THREE.MeshStandardMaterial({
  color: 0x6e332f,
  emissive: 0x21080b,
  emissiveIntensity: 0.26,
  roughness: 0.94,
  metalness: 0.18,
  flatShading: true,
});

const asteroidRidgeMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8794f,
  emissive: 0x5f150b,
  emissiveIntensity: 0.9,
  roughness: 0.72,
  metalness: 0.05,
  wireframe: true,
  transparent: true,
  opacity: 0.32,
});

const coreMaterial = new THREE.MeshStandardMaterial({
  color: 0x4ad9ff,
  emissive: 0x0da7ff,
  emissiveIntensity: 1.5,
  roughness: 0.22,
  metalness: 0.55,
});

const laserMaterial = new THREE.MeshBasicMaterial({
  color: 0x7ef7ff,
  transparent: true,
  opacity: 0.92,
});

const laserCoreMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.84,
});

const sparkMaterial = new THREE.MeshBasicMaterial({
  color: 0x95f6ff,
  transparent: true,
  opacity: 0.92,
});

const alienHullMaterial = new THREE.MeshStandardMaterial({
  color: 0x6fff36,
  emissive: 0x1ead12,
  emissiveIntensity: 1.35,
  roughness: 0.3,
  metalness: 0.42,
});

const alienDomeMaterial = new THREE.MeshStandardMaterial({
  color: 0xc6ff8a,
  emissive: 0x7dff32,
  emissiveIntensity: 1.1,
  roughness: 0.18,
  metalness: 0.22,
  transparent: true,
  opacity: 0.9,
});

const alienGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0x7dff32,
  transparent: true,
  opacity: 0.35,
});

const alienShotMaterial = new THREE.MeshBasicMaterial({
  color: 0x9cff3b,
  transparent: true,
  opacity: 0.9,
});

const obstacles = [];
const aliens = [];
const cores = [];
const lasers = [];
const alienShots = [];
const sparks = [];
const starLayers = [];

buildLights();
const ship = buildShip();
const engineLight = new THREE.PointLight(0x27d7ff, 6.5, 12);
engineLight.position.set(0, 0.2, 1.8);
ship.add(engineLight);
scene.add(ship);

buildStarfield();
buildNebula();
buildBackdropWorlds();
buildGateLines();
resetGame();
animate();

startButton.addEventListener("click", () => {
  if (game.shield <= 0) resetGame();
  if (game.active) game.boost = 0.7;
  game.active = true;
  startButton.textContent = "Boost";
  messageEl.textContent = "Arrow keys or WASD to steer. Space, click, or tap to fire.";
});

window.addEventListener("keydown", (event) => {
  keyboard.add(event.key.toLowerCase());
  if (event.code === "Space") {
    event.preventDefault();
    if (game.active) shoot();
    else startButton.click();
  }
});

window.addEventListener("keyup", (event) => keyboard.delete(event.key.toLowerCase()));
window.addEventListener("pointermove", updatePointer);
window.addEventListener("pointerdown", (event) => {
  updatePointer(event);
  if (event.target === startButton) return;
  if (game.active) shoot();
});
window.addEventListener("resize", resize);

function buildLights() {
  scene.add(new THREE.HemisphereLight(0xaadfff, 0x170817, 1.35));

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-7, 11, 10);
  scene.add(sun);

  const rim = new THREE.PointLight(0xff477e, 7.5, 44);
  rim.position.set(8, 2.4, -24);
  scene.add(rim);

  const blueFill = new THREE.PointLight(0x2adfff, 5.2, 36);
  blueFill.position.set(-7, -2, -12);
  scene.add(blueFill);
}

function buildShip() {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.ConeGeometry(0.72, 2.8, 5, 1),
    new THREE.MeshStandardMaterial({
      color: 0xcfdce9,
      emissive: 0x061322,
      emissiveIntensity: 0.25,
      metalness: 0.78,
      roughness: 0.22,
    }),
  );
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(0.92, 1.24, 1);
  group.add(hull);

  const spine = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.14, 2.1),
    new THREE.MeshStandardMaterial({
      color: 0x283f59,
      emissive: 0x102c45,
      emissiveIntensity: 0.35,
      metalness: 0.66,
      roughness: 0.24,
    }),
  );
  spine.position.set(0, 0.48, 0.1);
  group.add(spine);

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 18, 10),
    new THREE.MeshStandardMaterial({
      color: 0x1be2ff,
      emissive: 0x087eaa,
      emissiveIntensity: 1.45,
      metalness: 0.2,
      roughness: 0.12,
    }),
  );
  canopy.position.set(0, 0.26, 0.12);
  canopy.scale.set(0.72, 0.45, 1.05);
  group.add(canopy);

  const wingMaterial = new THREE.MeshStandardMaterial({
    color: 0xbd315f,
    emissive: 0x5e0026,
    emissiveIntensity: 0.75,
    metalness: 0.54,
    roughness: 0.27,
  });

  const wingGeometry = new THREE.BoxGeometry(1.95, 0.1, 0.62);
  const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
  leftWing.position.set(-1.02, -0.14, 0.42);
  leftWing.rotation.z = -0.18;
  group.add(leftWing);

  const rightWing = leftWing.clone();
  rightWing.position.x = 0.92;
  rightWing.rotation.z = 0.18;
  group.add(rightWing);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.36, 1.35, 28),
    new THREE.MeshBasicMaterial({
      color: 0x27d7ff,
      transparent: true,
      opacity: 0.82,
    }),
  );
  flame.name = "flame";
  flame.position.z = 1.68;
  flame.rotation.x = -Math.PI / 2;
  group.add(flame);

  const engineRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.045, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0x92f7ff }),
  );
  engineRing.position.z = 1.1;
  group.add(engineRing);

  group.position.set(0, 0, 4.5);
  group.scale.setScalar(0.92);
  return group;
}

function buildStarfield() {
  const colors = [0xffffff, 0x9fdcff, 0xffc2da];
  for (let layer = 0; layer < 3; layer += 1) {
    const positions = [];
    for (let i = 0; i < 900; i += 1) {
      positions.push(
        THREE.MathUtils.randFloatSpread(82),
        THREE.MathUtils.randFloatSpread(46),
        THREE.MathUtils.randFloat(-150, 22),
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: colors[layer],
      size: 0.038 + layer * 0.03,
      transparent: true,
      opacity: 0.48 + layer * 0.16,
      depthWrite: false,
    });
    const stars = new THREE.Points(geometry, material);
    stars.userData.speed = 4 + layer * 6;
    starLayers.push(stars);
    scene.add(stars);
  }
}

function buildNebula() {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 512;
  canvasTexture.height = 512;
  const ctx = canvasTexture.getContext("2d");
  const gradient = ctx.createRadialGradient(230, 210, 20, 250, 250, 260);
  gradient.addColorStop(0, "rgba(49, 215, 255, 0.72)");
  gradient.addColorStop(0.36, "rgba(147, 88, 255, 0.23)");
  gradient.addColorStop(0.62, "rgba(255, 64, 126, 0.2)");
  gradient.addColorStop(1, "rgba(4, 6, 16, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvasTexture);
  const nebula = new THREE.Mesh(
    new THREE.PlaneGeometry(95, 95),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.86,
    }),
  );
  nebula.position.set(2, 7, -92);
  scene.add(nebula);
}

function buildBackdropWorlds() {
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(7.8, 48, 28),
    new THREE.MeshStandardMaterial({
      color: 0x294260,
      emissive: 0x071328,
      emissiveIntensity: 0.7,
      roughness: 0.84,
      metalness: 0.02,
    }),
  );
  planet.position.set(-18, -6, -102);
  planet.rotation.z = -0.34;
  scene.add(planet);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(8.12, 48, 28),
    new THREE.MeshBasicMaterial({
      color: 0x6bdcff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  atmosphere.position.copy(planet.position);
  scene.add(atmosphere);

  const rings = new THREE.Mesh(
    new THREE.RingGeometry(10.4, 14.8, 96),
    new THREE.MeshBasicMaterial({
      color: 0xb5e6ff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  rings.position.copy(planet.position);
  rings.rotation.set(1.18, -0.18, -0.42);
  scene.add(rings);

  const debrisMaterial = new THREE.MeshStandardMaterial({
    color: 0x182538,
    emissive: 0x03070d,
    roughness: 0.9,
    metalness: 0.32,
  });
  for (let i = 0; i < 14; i += 1) {
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(THREE.MathUtils.randFloat(0.35, 1.2), 0), debrisMaterial);
    shard.position.set(
      THREE.MathUtils.randFloat(10, 27),
      THREE.MathUtils.randFloat(-8, 8),
      THREE.MathUtils.randFloat(-96, -62),
    );
    shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(shard);
  }
}

function buildGateLines() {
  const material = new THREE.LineBasicMaterial({
    color: 0x65eaff,
    transparent: true,
    opacity: 0.2,
  });

  for (let i = 0; i < 18; i += 1) {
    const z = -i * 7;
    const points = [
      new THREE.Vector3(-world.halfWidth, world.bottom, z),
      new THREE.Vector3(world.halfWidth, world.bottom, z),
      new THREE.Vector3(world.halfWidth, world.top, z),
      new THREE.Vector3(-world.halfWidth, world.top, z),
      new THREE.Vector3(-world.halfWidth, world.bottom, z),
    ];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    line.userData.gate = true;
    scene.add(line);
  }
}

function resetGame() {
  game.active = false;
  game.score = 0;
  game.shield = 100;
  game.wave = 1;
  game.speed = 16;
  game.boost = 0;
  game.shotCooldown = 0;
  game.spawnTimer = 0;
  game.alienTimer = 1.7;
  game.coreTimer = 0;
  game.shake = 0;
  ship.position.set(0, 0, 4.5);
  pointer.set(0, 0);
  clearObjects(obstacles);
  clearObjects(aliens);
  clearObjects(cores);
  clearObjects(lasers);
  clearObjects(alienShots);
  clearObjects(sparks);
  updateHud();
  startButton.textContent = "Launch";
  messageEl.textContent = "Pilot through the asteroid field. Collect blue cores, dodge red rocks.";
}

function clearObjects(list) {
  while (list.length) {
    const item = list.pop();
    scene.remove(item);
  }
}

function updatePointer(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.034);
  update(delta);
  composer.render();
}

function update(delta) {
  const elapsed = clock.elapsedTime;
  updateShip(delta, elapsed);
  updateStars(delta);
  updateGates(delta);

  if (game.active) {
    game.score += delta * 12 * game.wave;
    game.wave = Math.max(1, Math.floor(game.score / 450) + 1);
    game.boost = Math.max(0, game.boost - delta);
    game.shotCooldown = Math.max(0, game.shotCooldown - delta);
    game.speed = 16 + game.wave * 1.8 + game.boost * 10;
    game.spawnTimer -= delta;
    game.alienTimer -= delta;
    game.coreTimer -= delta;

    if (game.spawnTimer <= 0) {
      spawnAsteroid();
      game.spawnTimer = Math.max(0.22, 0.85 - game.wave * 0.055);
    }

    if (game.alienTimer <= 0) {
      spawnAlien();
      game.alienTimer = THREE.MathUtils.randFloat(
        Math.max(0.5, 2.35 - game.wave * 0.12),
        Math.max(0.95, 3.25 - game.wave * 0.13),
      );
    }

    if (game.coreTimer <= 0) {
      spawnCore();
      game.coreTimer = THREE.MathUtils.randFloat(2.4, 4.8);
    }
  }

  updateObjects(delta, obstacles, false);
  updateObjects(delta, aliens, false);
  updateObjects(delta, cores, true);
  updateLasers(delta);
  updateAlienShots(delta);
  updateSparks(delta);
  updateCamera(delta);
  updateHud();
}

function updateShip(delta, elapsed) {
  const keyX = Number(keyboard.has("arrowright") || keyboard.has("d")) - Number(keyboard.has("arrowleft") || keyboard.has("a"));
  const keyY = Number(keyboard.has("arrowup") || keyboard.has("w")) - Number(keyboard.has("arrowdown") || keyboard.has("s"));
  const inputX = THREE.MathUtils.clamp(pointer.x * world.halfWidth + keyX * 3.2, -world.halfWidth, world.halfWidth);
  const inputY = THREE.MathUtils.clamp(pointer.y * 4 + keyY * 2.2, world.bottom, world.top);

  shipTarget.set(inputX, inputY, 4.5);
  ship.position.lerp(shipTarget, game.active ? 7.5 * delta : 2.4 * delta);
  ship.rotation.z = THREE.MathUtils.lerp(ship.rotation.z, -ship.position.x * 0.065, 8 * delta);
  ship.rotation.x = THREE.MathUtils.lerp(ship.rotation.x, ship.position.y * 0.035, 8 * delta);
  ship.rotation.y = Math.sin(elapsed * 2.2) * 0.025;

  const flame = ship.getObjectByName("flame");
  flame.scale.setScalar(1 + Math.sin(elapsed * 34) * 0.13 + (game.active ? 0.16 : 0) + game.boost * 0.48);
}

function updateStars(delta) {
  for (const stars of starLayers) {
    const position = stars.geometry.attributes.position;
    for (let i = 2; i < position.array.length; i += 3) {
      position.array[i] += delta * (stars.userData.speed + game.speed * 0.28);
      if (position.array[i] > 20) position.array[i] = THREE.MathUtils.randFloat(-150, -120);
    }
    position.needsUpdate = true;
  }
}

function updateGates(delta) {
  scene.children.forEach((child) => {
    if (!child.userData.gate) return;
    child.position.z += delta * game.speed;
    if (child.position.z > 12) child.position.z -= 126;
  });
}

function spawnAsteroid() {
  const asteroid = new THREE.Group();
  const rock = new THREE.Mesh(asteroidGeometry, asteroidMaterial.clone());
  const ridges = new THREE.Mesh(asteroidDetailGeometry, asteroidRidgeMaterial.clone());
  asteroid.add(rock, ridges);
  const scale = THREE.MathUtils.randFloat(0.55, 1.55 + game.wave * 0.05);
  asteroid.scale.set(scale, scale * THREE.MathUtils.randFloat(0.78, 1.34), scale);
  asteroid.position.set(
    THREE.MathUtils.randFloat(-world.halfWidth, world.halfWidth),
    THREE.MathUtils.randFloat(world.bottom, world.top),
    world.backZ,
  );
  asteroid.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  asteroid.userData.radius = scale * 0.8;
  asteroid.userData.spin = new THREE.Vector3(
    THREE.MathUtils.randFloat(-1.6, 1.6),
    THREE.MathUtils.randFloat(-1.6, 1.6),
    THREE.MathUtils.randFloat(-1.6, 1.6),
  );
  obstacles.push(asteroid);
  scene.add(asteroid);
}

function spawnAlien() {
  const alien = new THREE.Group();
  const hull = new THREE.Mesh(alienHullGeometry, alienHullMaterial);
  hull.scale.set(1.28, 0.36, 0.82);

  const dome = new THREE.Mesh(alienDomeGeometry, alienDomeMaterial);
  dome.position.y = 0.26;
  dome.scale.set(0.82, 0.48, 0.82);

  const ring = new THREE.Mesh(alienRingGeometry, alienGlowMaterial.clone());
  ring.rotation.x = Math.PI / 2;

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.48, 1.35, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x7dff32,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  beam.position.y = -0.68;

  const eyes = new THREE.Group();
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x10260b });
  for (const x of [-0.22, 0.22]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), eyeMaterial);
    eye.position.set(x, 0.35, 0.42);
    eyes.add(eye);
  }

  alien.add(hull, dome, ring, beam, eyes, new THREE.PointLight(0x77ff33, 3.8, 10));
  alien.position.set(
    THREE.MathUtils.randFloat(-world.halfWidth * 0.9, world.halfWidth * 0.9),
    THREE.MathUtils.randFloat(world.bottom + 0.7, world.top - 0.7),
    world.backZ,
  );
  alien.userData.radius = 1.05;
  alien.userData.spin = new THREE.Vector3(0.2, THREE.MathUtils.randFloat(-1.1, 1.1), 0.18);
  alien.userData.phase = Math.random() * Math.PI * 2;
  alien.userData.sway = THREE.MathUtils.randFloat(2.1, 3.7 + game.wave * 0.08);
  alien.userData.fireCooldown = THREE.MathUtils.randFloat(0.55, 1.15);
  alien.userData.pursuit = THREE.MathUtils.randFloat(1.6, 2.8 + game.wave * 0.16);
  alien.userData.kind = "alien";
  alien.userData.points = 140;
  aliens.push(alien);
  scene.add(alien);
}

function spawnCore() {
  const core = new THREE.Group();
  const crystal = new THREE.Mesh(coreGeometry, coreMaterial);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.82, 20, 12),
    new THREE.MeshBasicMaterial({
      color: 0x4ad9ff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  core.add(crystal, halo, new THREE.PointLight(0x4ad9ff, 2.6, 9));
  core.position.set(
    THREE.MathUtils.randFloat(-world.halfWidth * 0.92, world.halfWidth * 0.92),
    THREE.MathUtils.randFloat(world.bottom + 0.4, world.top - 0.3),
    world.backZ,
  );
  core.userData.radius = 0.72;
  cores.push(core);
  scene.add(core);
}

function shoot() {
  if (game.shotCooldown > 0 || game.shield <= 0) return;
  game.shotCooldown = 0.16;

  const laser = new THREE.Group();
  const bolt = new THREE.Mesh(laserGeometry, laserMaterial);
  bolt.rotation.x = Math.PI / 2;
  laser.add(bolt);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 2.65, 10),
    laserCoreMaterial,
  );
  core.rotation.x = Math.PI / 2;
  laser.add(core);

  const glow = new THREE.PointLight(0x39e8ff, 2.8, 7);
  laser.add(glow);

  laser.position.set(ship.position.x, ship.position.y - 0.02, ship.position.z - 1.25);
  laser.userData.radius = 0.34;
  lasers.push(laser);
  scene.add(laser);
}

function updateLasers(delta) {
  for (let i = lasers.length - 1; i >= 0; i -= 1) {
    const laser = lasers[i];
    laser.position.z -= delta * 78;

    if (laser.position.z < world.backZ - 8) {
      scene.remove(laser);
      lasers.splice(i, 1);
      continue;
    }

    if (hitTargets(laser, obstacles, i, "Asteroid vaporized. Nice shot.")) continue;
    hitTargets(laser, aliens, i, "Alien ship neutralized.");
  }
}

function shootAlienPlasma(alien) {
  const shot = new THREE.Group();
  const bolt = new THREE.Mesh(alienShotGeometry, alienShotMaterial);
  bolt.rotation.x = Math.PI / 2;
  shot.add(bolt);
  shot.add(new THREE.PointLight(0x9cff3b, 2.6, 6));

  shot.position.copy(alien.position);
  shot.position.z += 0.9;
  shot.userData.radius = 0.44;
  shot.userData.velocity = new THREE.Vector3().subVectors(ship.position, shot.position).normalize();
  shot.userData.velocity.multiplyScalar(34 + game.wave * 2.4);
  alienShots.push(shot);
  scene.add(shot);
}

function updateAlienShots(delta) {
  for (let i = alienShots.length - 1; i >= 0; i -= 1) {
    const shot = alienShots[i];
    shot.position.addScaledVector(shot.userData.velocity, delta);
    shot.rotation.z += delta * 10;

    if (shot.position.z > world.frontZ + 8 || shot.position.z < world.backZ - 8) {
      scene.remove(shot);
      alienShots.splice(i, 1);
      continue;
    }

    if (!game.active || shot.position.z < 2.5 || shot.position.z > 6.3) continue;

    if (shot.position.distanceTo(ship.position) < shot.userData.radius + 0.66) {
      game.shield -= 18 + Math.min(12, game.wave * 1.5);
      game.shake = 0.42;
      spawnSparks(shot.position, 0.75, 0x9cff3b);
      pulseMessage("Alien plasma hit. Keep moving.");
      scene.remove(shot);
      alienShots.splice(i, 1);
      if (game.shield <= 0) endGame();
    }
  }
}

function hitTargets(laser, targets, laserIndex, message) {
  for (let j = targets.length - 1; j >= 0; j -= 1) {
    const target = targets[j];
    if (laser.position.distanceTo(target.position) > target.userData.radius + laser.userData.radius) continue;

    game.score += target.userData.points ?? 55;
    game.shake = Math.max(game.shake, target.userData.kind === "alien" ? 0.22 : 0.14);
    spawnSparks(target.position, target.scale.x, target.userData.kind === "alien" ? 0x7dff32 : 0x95f6ff);
    pulseMessage(message);

    scene.remove(target);
    scene.remove(laser);
    targets.splice(j, 1);
    lasers.splice(laserIndex, 1);
    return true;
  }
  return false;
}

function spawnSparks(position, scale = 1, color = 0x95f6ff) {
  for (let i = 0; i < 14; i += 1) {
    const spark = new THREE.Mesh(sparkGeometry, sparkMaterial.clone());
    spark.material.color.setHex(color);
    spark.position.copy(position);
    spark.scale.setScalar(THREE.MathUtils.randFloat(0.65, 1.45) * scale);
    spark.userData.velocity = new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(9),
      THREE.MathUtils.randFloatSpread(7),
      THREE.MathUtils.randFloat(-10, 12),
    );
    spark.userData.life = THREE.MathUtils.randFloat(0.28, 0.56);
    sparks.push(spark);
    scene.add(spark);
  }
}

function updateSparks(delta) {
  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const spark = sparks[i];
    spark.userData.life -= delta;
    spark.position.addScaledVector(spark.userData.velocity, delta);
    spark.material.opacity = Math.max(0, spark.userData.life * 2.2);
    spark.scale.multiplyScalar(1 + delta * 2.8);

    if (spark.userData.life <= 0) {
      scene.remove(spark);
      sparks.splice(i, 1);
    }
  }
}

function updateObjects(delta, list, isCore) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    const isAlien = item.userData.kind === "alien";
    item.position.z += delta * (isAlien ? game.speed * (1.16 + game.wave * 0.012) : game.speed);
    if (isAlien) {
      const pursuitRange = item.position.z > -62 && item.position.z < 7;
      const pursuitX = pursuitRange ? Math.sign(ship.position.x - item.position.x) * item.userData.pursuit * delta : 0;
      const pursuitY = pursuitRange ? Math.sign(ship.position.y - item.position.y) * item.userData.pursuit * 0.8 * delta : 0;
      item.position.x += Math.sin(clock.elapsedTime * item.userData.sway + item.userData.phase) * delta * 3.4 + pursuitX;
      item.position.y += Math.cos(clock.elapsedTime * item.userData.sway * 0.8 + item.userData.phase) * delta * 1.35 + pursuitY;
      item.position.x = THREE.MathUtils.clamp(item.position.x, -world.halfWidth, world.halfWidth);
      item.position.y = THREE.MathUtils.clamp(item.position.y, world.bottom, world.top);
      item.rotation.x = Math.sin(clock.elapsedTime * 3.8 + item.userData.phase) * 0.22;
      item.rotation.z = Math.sin(clock.elapsedTime * 2.8 + item.userData.phase) * 0.28;
      item.rotation.y += delta * item.userData.spin.y;

      if (game.active && item.position.z > -52 && item.position.z < 3) {
        item.userData.fireCooldown -= delta;
        if (item.userData.fireCooldown <= 0) {
          shootAlienPlasma(item);
          item.userData.fireCooldown = THREE.MathUtils.randFloat(
            Math.max(0.34, 1.2 - game.wave * 0.055),
            Math.max(0.58, 1.9 - game.wave * 0.07),
          );
        }
      }
    } else {
      item.rotation.x += delta * (isCore ? 2.2 : item.userData.spin.x);
      item.rotation.y += delta * (isCore ? 3.4 : item.userData.spin.y);
      item.rotation.z += delta * (isCore ? 1.6 : item.userData.spin.z);
    }

    if (item.position.z > world.frontZ) {
      scene.remove(item);
      list.splice(i, 1);
      continue;
    }

    if (!game.active || item.position.z < 2.5 || item.position.z > 6.1) continue;

    const distance = item.position.distanceTo(ship.position);
    if (distance < item.userData.radius + 0.72) {
      if (isCore) {
        game.score += 90;
        game.shield = Math.min(100, game.shield + 8);
        pulseMessage("Core absorbed. Shield restored.");
      } else if (isAlien) {
        game.shield -= 42;
        game.shake = 0.68;
        spawnSparks(item.position, item.scale.x, 0x7dff32);
        pulseMessage("Alien collision. Shield hit hard.");
        if (game.shield <= 0) endGame();
      } else {
        game.shield -= 22;
        game.shake = 0.45;
        pulseMessage("Impact. Keep moving.");
        if (game.shield <= 0) endGame();
      }
      scene.remove(item);
      list.splice(i, 1);
    }
  }
}

function pulseMessage(text) {
  messageEl.textContent = text;
  window.clearTimeout(pulseMessage.timeout);
  pulseMessage.timeout = window.setTimeout(() => {
    if (game.active) messageEl.textContent = "Arrow keys or WASD to steer. Space, click, or tap to fire.";
  }, 1100);
}

function endGame() {
  game.active = false;
  game.shield = 0;
  startButton.textContent = "Retry";
  messageEl.textContent = `Run ended at ${Math.floor(game.score)} points. Hit Retry for another launch.`;
}

function updateCamera(delta) {
  game.shake = Math.max(0, game.shake - delta);
  const shakeX = (Math.random() - 0.5) * game.shake;
  const shakeY = (Math.random() - 0.5) * game.shake;
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, ship.position.x * 0.12 + shakeX, 5 * delta);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, 4.8 + ship.position.y * 0.08 + shakeY, 5 * delta);
  camera.lookAt(ship.position.x * 0.16, ship.position.y * 0.1, -16);
}

function updateHud() {
  scoreEl.textContent = Math.floor(game.score).toString();
  shieldEl.textContent = Math.max(0, Math.ceil(game.shield)).toString();
  waveEl.textContent = game.wave.toString();
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.resolution.set(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
