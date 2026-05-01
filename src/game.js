// ============================================================
// WHIMSICAL ISLAND ADVENTURE — Main Game Engine
// ============================================================
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { PALETTE, ISLANDS, getIsland } from './world.js';
import { Player } from './player.js';
import { ParticleSystem } from './particles.js';
import { initAudio, startExploreMusic, sfxCrystalCollect, sfxLanternPulse,
         sfxFootstep, sfxDialogue, sfxShrine, sfxClick, sfxWin, toggleMute, isMuted,
         setIslandMusic, sfxIslandArrive } from './audio.js';

// ── State ────────────────────────────────────────────────────
let state = 'title'; // title | playing | dialogue | map | win
let currentIslandId = 0;
let audioReady = false;
const keys = {};
const isMobile = window.matchMedia('(pointer:coarse)').matches || window.innerWidth < 768;
let joystickDir = { x: 0, z: 0 };

// ── Three.js ─────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
canvas.width = window.innerWidth; canvas.height = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
renderer.shadowMap.enabled = false;
renderer.setClearColor(0x9B9AE2);

const scene = new THREE.Scene();
const aspect = window.innerWidth / window.innerHeight;
const camD = 8;
const camera = new THREE.OrthographicCamera(-camD*aspect, camD*aspect, camD, -camD, 0.1, 200);
camera.position.set(12, 12, 12);
camera.lookAt(0, 0, 0);

// ── Scene objects ─────────────────────────────────────────────
let player, particles, islandMeshes = [], crystalMeshes = [], npcMeshes = [], shrineMesh;
let crystalOrbits = [];
let questStateMap = {};
function getQuestState(id) {
  if (!questStateMap[id]) questStateMap[id] = {};
  return questStateMap[id];
}
let questState = getQuestState(0);
let inventoryItems = [];
let pulseRevealTimer = 0;

// ── Dialogue ──────────────────────────────────────────────────
const dialogueBox  = document.getElementById('dialogue-box');
const dialogueText = document.getElementById('dialogue-body');
const dialogueSpeaker = document.getElementById('dialogue-speaker');
const dialogueContinue = document.getElementById('dialogue-continue');
let dialogueQueue = [], dialogueCallback = null, typewriterTimer = null, currentLine = '', currentFullLine = '';

// ── HUD ───────────────────────────────────────────────────────
function updateCrystalHUD() {
  const island = getIsland(currentIslandId);
  const count = island.crystalCount;
  const total = island.totalCrystals;
  for (let i = 0; i < 5; i++) {
    const gem = document.getElementById('gem'+i);
    if (i < total) {
      gem.style.display = '';
      gem.innerHTML = `<svg viewBox="0 0 18 18" fill="none"><polygon points="9,2 15,7 13,16 5,16 3,7" fill="#9B9AE2" stroke="#C6C3DC" stroke-width="1"/><polygon points="9,2 15,7 9,7" fill="#C6C3DC" opacity="0.5"/></svg>`;
      gem.classList.toggle('lit', count > i);
    } else {
      gem.style.display = 'none';
    }
  }
  document.getElementById('crystal-label').textContent = `${count} / ${total}`;
}

function showHUD(show) {
  document.getElementById('hud-crystals').style.display = show ? 'flex' : 'none';
  // compass removed
  document.getElementById('inventory').style.display = show ? 'flex' : 'none';
  document.getElementById('sound-toggle').style.display = show ? 'block' : 'none';
  document.getElementById('map-btn').style.display = show ? 'block' : 'none';
}

// ── Build Island ──────────────────────────────────────────────
function buildIsland(islandId) {
  // Clear previous
  islandMeshes.forEach(m => scene.remove(m));
  crystalMeshes.forEach(m => { if (m.userData.glowLight) scene.remove(m.userData.glowLight); scene.remove(m); });
  fireflyTargetMesh = null;
  npcMeshes.forEach(m => scene.remove(m));
  if (shrineMesh) scene.remove(shrineMesh);

  if (particles) particles.clearAll();
  crystalOrbits = [];
  islandMeshes = []; crystalMeshes = []; npcMeshes = [];
  if (scene._islandGlowMesh) { scene.remove(scene._islandGlowMesh); scene._islandGlowMesh = null; }
  // Reset per-visit auto-trigger flags
  if (typeof ISLANDS !== 'undefined') ISLANDS.forEach(il => { il._shrineAutoTriggered = false; });
  shrinBeamMesh = null; shrineBeamLight = null;

  const island = getIsland(islandId);
  scene.background = new THREE.Color(island.skyTop);
  scene.fog = new THREE.Fog(island.fogColor, island.fogNear, island.fogFar);
  // Spawn firefly at island load so it's visible before talking to elder
  if (islandId === 0) { setTimeout(() => spawnFireflyTarget(), 100); }

  // Lighting
  scene.children.filter(c=>c.isLight).forEach(l=>scene.remove(l));
  const ambient = new THREE.AmbientLight(island.ambientColor, island.ambientInt);
  const sun = new THREE.DirectionalLight(island.sunColor, island.sunInt);
  sun.position.set(20, 30, 20);
  const hemi = new THREE.HemisphereLight(island.skyTop, island.groundColor, 0.4);
  scene.add(ambient, sun, hemi);

  // Sky gradient plane (far background)
  const skyGeo = new THREE.PlaneGeometry(200, 200);
  const skyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(island.skyTop) });
  const skyPlane = new THREE.Mesh(skyGeo, skyMat);
  skyPlane.rotation.x = -Math.PI/2; skyPlane.position.y = -1;
  scene.add(skyPlane); islandMeshes.push(skyPlane);

  // Terrain tiles
  const tileGeo = new THREE.BoxGeometry(0.95, 0.3, 0.95);

  // Collect occupied positions (NPCs + shrine + crystals) to avoid decoration overlap
  const occupiedKeys = new Set();
  island.npcs.forEach(n => occupiedKeys.add(`${n.x},${n.z}`));
  occupiedKeys.add(`${island.shrinePos.x},${island.shrinePos.z}`);
  island.crystalPositions.forEach(cp => occupiedKeys.add(`${cp.x},${cp.z}`));

  // Biome decoration helpers
  function addTree(x, z) {
    // trunk
    const trunkGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.45, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6B4226 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 0.225, z);
    scene.add(trunk); islandMeshes.push(trunk);
    // canopy
    const canopyGeo = new THREE.SphereGeometry(0.28+Math.random()*0.1, 7, 6);
    const canopyMat = new THREE.MeshLambertMaterial({ color: island.groundColor });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(x, 0.62+Math.random()*0.08, z);
    canopy.userData = { bobOffset: Math.random()*Math.PI*2, bobBase: canopy.position.y, windSway: true, windOffset: Math.random()*Math.PI*2 };
    scene.add(canopy); islandMeshes.push(canopy);
  }

  function addRock(x, z) {
    const rGeo = new THREE.DodecahedronGeometry(0.13+Math.random()*0.08, 0);
    const rMat = new THREE.MeshLambertMaterial({ color: 0x8E8E8E });
    const r = new THREE.Mesh(rGeo, rMat);
    r.position.set(x+(Math.random()-0.5)*0.3, 0.13, z+(Math.random()-0.5)*0.3);
    r.rotation.y = Math.random()*Math.PI;
    scene.add(r); islandMeshes.push(r);
  }

  function addFlower(x, z, col) {
    const stemGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.22, 4);
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x5A8A3A });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(x, 0.11, z);
    scene.add(stem); islandMeshes.push(stem);
    const headGeo = new THREE.SphereGeometry(0.07, 6, 5);
    const headMat = new THREE.MeshLambertMaterial({ color: col });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x, 0.27, z);
    head.userData = { bobOffset: Math.random()*Math.PI*2, bobBase: head.position.y, windSway: true, windOffset: Math.random()*Math.PI*2 };
    scene.add(head); islandMeshes.push(head);
  }

  function addMushroom(x, z) {
    const stemGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.18, 6);
    const stemMat = new THREE.MeshLambertMaterial({ color: 0xF0E6D0 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(x, 0.09, z);
    scene.add(stem); islandMeshes.push(stem);
    const capGeo = new THREE.SphereGeometry(0.14, 8, 5);
    capGeo.scale(1, 0.55, 1);
    const capMat = new THREE.MeshLambertMaterial({ color: 0xC0392B });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(x, 0.22, z);
    scene.add(cap); islandMeshes.push(cap);
  }

  function addCactus(x, z) {
    const bodyGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.38, 6);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4A8A4A });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(x, 0.19, z);
    scene.add(body); islandMeshes.push(body);
    const armGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.2, 5);
    const arm = new THREE.Mesh(armGeo, bodyMat);
    arm.rotation.z = Math.PI/2.5;
    arm.position.set(x+0.14, 0.26, z);
    scene.add(arm); islandMeshes.push(arm);
  }

  function addCrystalSpire(x, z, col) {
    const spireGeo = new THREE.ConeGeometry(0.07, 0.35, 5);
    const spireMat = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.25 });
    const spire = new THREE.Mesh(spireGeo, spireMat);
    spire.position.set(x, 0.175, z);
    spire.rotation.y = Math.random()*Math.PI;
    spire.userData = { bobOffset: Math.random()*Math.PI*2, bobBase: spire.position.y };
    scene.add(spire); islandMeshes.push(spire);
  }

  function addHouse(x, z, wallCol, roofCol) {
    // Base/walls
    const wallGeo = new THREE.BoxGeometry(0.7, 0.5, 0.7);
    const wallMat = new THREE.MeshLambertMaterial({ color: wallCol || 0xF0DEC2 });
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.set(x, 0.4, z);
    scene.add(walls); islandMeshes.push(walls);
    // Roof (pyramid)
    const roofGeo = new THREE.ConeGeometry(0.58, 0.38, 4);
    const roofMat = new THREE.MeshLambertMaterial({ color: roofCol || 0xEB6259 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(x, 0.84, z);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof); islandMeshes.push(roof);
    // Door
    const doorGeo = new THREE.BoxGeometry(0.13, 0.2, 0.05);
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(x, 0.25, z + 0.35);
    scene.add(door); islandMeshes.push(door);
    // Window
    const winGeo = new THREE.BoxGeometry(0.14, 0.12, 0.05);
    const winMat = new THREE.MeshLambertMaterial({ color: 0xC6E0F0, emissive: 0x8BBBD0, emissiveIntensity: 0.25 });
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(x + 0.2, 0.4, z + 0.35);
    scene.add(win); islandMeshes.push(win);
  }

  function addLantern(x, z) {
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x4F4261 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 0.25, z);
    scene.add(pole); islandMeshes.push(pole);
    const boxGeo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
    const boxMat = new THREE.MeshLambertMaterial({ color: 0xEBB21A, emissive: 0xEBB21A, emissiveIntensity: 0.5 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(x, 0.57, z);
    box.userData = { bobOffset: Math.random()*Math.PI*2, bobBase: box.position.y };
    scene.add(box); islandMeshes.push(box);
  }

  // Biome decoration configs: [type, probability, color?]
  const biomeDecorations = [
    // 0 Mossy Forest: trees, mushrooms, rocks, flowers
    (tx, tz, r) => {
      if (r < 0.12) addTree(tx, tz);
      else if (r < 0.20) addMushroom(tx, tz);
      else if (r < 0.26) addRock(tx, tz);
      else if (r < 0.30) addFlower(tx, tz, 0xC6C3DC);
    },
    // 1 Sunflower Beach: flowers, rocks, cacti
    (tx, tz, r) => {
      if (r < 0.14) addFlower(tx, tz, 0xEBB21A);
      else if (r < 0.21) addRock(tx, tz);
      else if (r < 0.26) addCactus(tx, tz);
      else if (r < 0.30) addFlower(tx, tz, 0xF5F0E8);
    },
    // 2 Sakura Cove: trees, flowers, lanterns, rocks
    (tx, tz, r) => {
      if (r < 0.11) addTree(tx, tz);
      else if (r < 0.20) addFlower(tx, tz, 0xF5F0E8);
      else if (r < 0.24) addLantern(tx, tz);
      else if (r < 0.28) addRock(tx, tz);
    },
    // 3 Cozy Village: flowers, lanterns, trees, mushrooms
    (tx, tz, r) => {
      if (r < 0.10) addLantern(tx, tz);
      else if (r < 0.18) addFlower(tx, tz, 0xF5F0E8);
      else if (r < 0.24) addTree(tx, tz);
      else if (r < 0.28) addMushroom(tx, tz);
    },
    // 4 Crystal Cave: crystal spires, rocks, mushrooms
    (tx, tz, r) => {
      if (r < 0.14) addCrystalSpire(tx, tz, 0x9B9AE2);
      else if (r < 0.21) addRock(tx, tz);
      else if (r < 0.27) addMushroom(tx, tz);
      else if (r < 0.30) addCrystalSpire(tx, tz, 0xF5F0E8);
    },
    // 5 Lavender Highlands: flowers, trees, rocks, crystal spires
    (tx, tz, r) => {
      if (r < 0.12) addFlower(tx, tz, 0x9B9AE2);
      else if (r < 0.19) addTree(tx, tz);
      else if (r < 0.24) addRock(tx, tz);
      else if (r < 0.28) addCrystalSpire(tx, tz, 0xC6C3DC);
    },
  ];
  const decorFn = biomeDecorations[islandId] || biomeDecorations[0];

  // Deterministic hash per tile — stable across island revisits
  function tileHash(x, z) {
    let h = (x * 374761393 + z * 668265263 + islandId * 2246822519) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 1540483477); h ^= h >>> 15;
    return (h >>> 0) / 0xFFFFFFFF;
  }

  island.tiles.forEach(tile => {
    const isWater = tile.type === 'water';
    const h = tileHash(tile.x, tile.z);
    const color = isWater
      ? (islandId === 1 ? 0x9BC8D4 : islandId === 3 ? 0x2A4A6B : 0x8AAABB)
      : island.groundColor;
    // Slight height variation on ground tiles for organic feel
    const yOff = isWater ? -0.18 : (h < 0.3 ? -0.02 : h > 0.85 ? 0.03 : 0);
    const mat = new THREE.MeshLambertMaterial({ color, transparent: isWater, opacity: isWater ? 0.78 : 1 });
    const mesh = new THREE.Mesh(tileGeo, mat);
    mesh.position.set(tile.x, yOff, tile.z);
    // Water tiles get shimmer animation tag
    // Cycle 3: store biome water color pair for hue oscillation
    const WATER_COLORS_A = [0x8AAABB, 0x9BC8D4, 0xB8A8CC, 0xC4A882, 0x2A4A6B, 0x8899CC];
    const WATER_COLORS_B = [0x7ABBB0, 0x80E0F0, 0xC8C0EE, 0xD4BB99, 0x3A5A9B, 0x99AADE];
    if (isWater) {
      mesh.userData.waterTile = true;
      mesh.userData.waterPhase = h * Math.PI * 2;
      mesh.userData.baseMat = mat;
      mesh.userData.waterColorA = new THREE.Color(WATER_COLORS_A[islandId] || 0x8AAABB);
      mesh.userData.waterColorB = new THREE.Color(WATER_COLORS_B[islandId] || 0x7ABBB0);
    }
    scene.add(mesh); islandMeshes.push(mesh);

    // Terrain decorations — skip occupied tiles and centre, use stable hash for consistency
    if (!isWater && (tile.x!==0||tile.z!==0)) {
      const key = `${tile.x},${tile.z}`;
      const r = h;
      const ox = (tileHash(tile.x+7, tile.z)-0.5)*0.55;
      const oz = (tileHash(tile.x, tile.z+7)-0.5)*0.55;
      if (occupiedKeys.has(key)) {
        if (r < 0.35) addFlower(tile.x+ox, tile.z+oz, island.accentColor);
      } else {
        decorFn(tile.x+(tileHash(tile.x+1,tile.z)-0.5)*0.45, tile.z+(tileHash(tile.x,tile.z+1)-0.5)*0.45, r);
      }
    }
  });

  // Crystals are NOT spawned at island load — they appear when quests are completed (or are free)

  // Shrine
  const shrGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.6, 8);
  const shrMat = new THREE.MeshLambertMaterial({ color: PALETTE.goldenYellowN, emissive: 0x886600, emissiveIntensity: 0.3 });
  shrineMesh = new THREE.Mesh(shrGeo, shrMat);
  shrineMesh.position.set(island.shrinePos.x, 0.3, island.shrinePos.z);
  if (island.restored) { shrMat.emissive.set(PALETTE.goldenYellowN); shrMat.emissiveIntensity = 0.7; }
  scene.add(shrineMesh);
  if (island.crystalCount >= island.totalCrystals && !island.beamAdded) { island.beamAdded = true; addShrineBeam(island); }
  const shrLight = new THREE.PointLight(PALETTE.goldenYellowN, 0.6, 3);
  shrLight.position.set(island.shrinePos.x, 1, island.shrinePos.z);
  scene.add(shrLight); islandMeshes.push(shrLight);

  // Collectibles (quest items)
  if (island.collectibles) {
    island.collectibles.forEach(col => {
      if (questState[col.type]) return; // already collected
      const group = new THREE.Group();
      group.position.set(col.x, 0, col.z);
      group.userData = { collectibleType: col.type, bobBase: 0, bobOffset: Math.random()*Math.PI*2 };
      if (col.type === 'mochi') {
        // Small orange cat shape: body + head + ears
        const bodyGeo = new THREE.SphereGeometry(0.13, 8, 6);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0xF07830 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.18; body.scale.set(1, 0.8, 1);
        const headGeo = new THREE.SphereGeometry(0.1, 8, 6);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.y = 0.38;
        const earGeo = new THREE.ConeGeometry(0.04, 0.08, 4);
        const earL = new THREE.Mesh(earGeo, bodyMat); earL.position.set(-0.07, 0.48, 0); earL.rotation.z = 0.3;
        const earR = new THREE.Mesh(earGeo, bodyMat); earR.position.set(0.07, 0.48, 0); earR.rotation.z = -0.3;
        const tailGeo = new THREE.TorusGeometry(0.07, 0.025, 6, 8, Math.PI);
        const tail = new THREE.Mesh(tailGeo, bodyMat); tail.position.set(0.13, 0.12, 0); tail.rotation.z = -Math.PI/2;
        group.add(body, head, earL, earR, tail);
      } else if (col.type === 'shell') {
        // Spiral shell: torus + cone tip
        const shellRingGeo = new THREE.TorusGeometry(0.09, 0.04, 8, 14);
        const shellMat2 = new THREE.MeshLambertMaterial({ color: 0xF4DEB8 });
        const shellRing = new THREE.Mesh(shellRingGeo, shellMat2); shellRing.position.y = 0.12; shellRing.rotation.x = Math.PI/2;
        const shellTipGeo = new THREE.ConeGeometry(0.045, 0.14, 8);
        const shellTip = new THREE.Mesh(shellTipGeo, shellMat2); shellTip.position.y = 0.22; shellTip.rotation.z = 0.4;
        const shellInnerGeo = new THREE.TorusGeometry(0.055, 0.022, 6, 10);
        const shellInnerMat = new THREE.MeshLambertMaterial({ color: 0xF8C8A0 });
        const shellInner = new THREE.Mesh(shellInnerGeo, shellInnerMat); shellInner.position.y = 0.12; shellInner.rotation.x = Math.PI/2;
        group.add(shellRing, shellTip, shellInner);
      } else if (col.type === 'driftwood_note') {
        // Rolled parchment scroll
        const scrollGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.18, 8);
        const scrollMat = new THREE.MeshLambertMaterial({ color: 0xE8D4A0 });
        const scroll = new THREE.Mesh(scrollGeo, scrollMat); scroll.position.y = 0.14; scroll.rotation.z = 0.35;
        const capGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.025, 8);
        const capMat = new THREE.MeshLambertMaterial({ color: 0xD4B870 });
        const capT = new THREE.Mesh(capGeo, capMat); capT.position.set(0, 0.23, 0); capT.rotation.z = 0.35;
        const capB = new THREE.Mesh(capGeo, capMat); capB.position.set(0, 0.05, 0); capB.rotation.z = 0.35;
        // Wax seal dot
        const sealGeo = new THREE.SphereGeometry(0.025, 6, 5);
        const sealMat = new THREE.MeshLambertMaterial({ color: 0xC04040 });
        const seal = new THREE.Mesh(sealGeo, sealMat); seal.position.set(0.04, 0.14, 0.05);
        group.add(scroll, capT, capB, seal);
      } else if (col.type === 'petal_bundle') {
        // Bundle of petals tied with ribbon
        const stemBundleGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.22, 6);
        const stemBundleMat = new THREE.MeshLambertMaterial({ color: 0x5A8A3A });
        const stemBundle = new THREE.Mesh(stemBundleGeo, stemBundleMat); stemBundle.position.y = 0.14;
        const ribbonGeo = new THREE.TorusGeometry(0.04, 0.012, 5, 10);
        const ribbonMat = new THREE.MeshLambertMaterial({ color: 0xF5F0E8 });
        const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat); ribbon.position.y = 0.1; ribbon.rotation.x = Math.PI/2;
        for (let pi = 0; pi < 5; pi++) {
          const angle = (pi/5)*Math.PI*2;
          const petalBGeo = new THREE.SphereGeometry(0.055, 6, 5);
          const petalBMat = new THREE.MeshLambertMaterial({ color: 0xFFBBDD });
          const petal = new THREE.Mesh(petalBGeo, petalBMat);
          petal.position.set(Math.cos(angle)*0.07, 0.28+Math.sin(angle)*0.04, Math.sin(angle)*0.07);
          petal.scale.set(1, 0.55, 1);
          group.add(petal);
        }
        group.add(stemBundle, ribbon);
      } else if (col.type === 'spring_water') {
        // Leaf cup with water
        const leafCupGeo = new THREE.CylinderGeometry(0.09, 0.06, 0.08, 8);
        const leafCupMat = new THREE.MeshLambertMaterial({ color: 0x6A9A40 });
        const leafCup = new THREE.Mesh(leafCupGeo, leafCupMat); leafCup.position.y = 0.1;
        const waterTopGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.02, 8);
        const waterTopMat = new THREE.MeshLambertMaterial({ color: 0x70C0E8, transparent: true, opacity: 0.75 });
        const waterTop = new THREE.Mesh(waterTopGeo, waterTopMat); waterTop.position.y = 0.16;
        group.add(leafCup, waterTop);
      } else if (col.type === 'glowstone') {
        // Glowing amber stone
        const gsGeo = new THREE.DodecahedronGeometry(0.1, 0);
        const gsMat = new THREE.MeshLambertMaterial({ color: 0xFFCC44, emissive: 0xFF8800, emissiveIntensity: 0.5 });
        const gs = new THREE.Mesh(gsGeo, gsMat); gs.position.y = 0.18;
        group.add(gs);
      } else if (col.type === 'crystal_dust') {
        // Small pouch with sparkle
        const pouchGeo = new THREE.SphereGeometry(0.09, 8, 7);
        const pouchMat = new THREE.MeshLambertMaterial({ color: 0x9B9AE2 });
        const pouch = new THREE.Mesh(pouchGeo, pouchMat); pouch.position.y = 0.13; pouch.scale.set(1, 0.9, 1);
        const tieGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 6);
        const tieMat = new THREE.MeshLambertMaterial({ color: 0x7070BB });
        const tie = new THREE.Mesh(tieGeo, tieMat); tie.position.y = 0.22;
        group.add(pouch, tie);
      } else if (col.type === 'wind_chime') {
        // Small cluster of crystal rods
        const chimeBarGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.18, 5);
        const chimeMat = new THREE.MeshLambertMaterial({ color: 0xC6C3DC, emissive: 0x9999CC, emissiveIntensity: 0.3 });
        for (let ci2 = 0; ci2 < 4; ci2++) {
          const angle2 = (ci2/4)*Math.PI*2;
          const bar = new THREE.Mesh(chimeBarGeo, chimeMat);
          bar.position.set(Math.cos(angle2)*0.07, 0.22 - ci2*0.03, Math.sin(angle2)*0.07);
          group.add(bar);
        }
        const ringTopGeo = new THREE.TorusGeometry(0.08, 0.01, 4, 10);
        const ringTop = new THREE.Mesh(ringTopGeo, chimeMat); ringTop.position.y = 0.32; ringTop.rotation.x = Math.PI/2;
        group.add(ringTop);
      } else if (col.type === 'highland_flower') {
        // Lavender sprig
        const sprigGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.24, 5);
        const sprigMat = new THREE.MeshLambertMaterial({ color: 0x5A7A3A });
        const sprig = new THREE.Mesh(sprigGeo, sprigMat); sprig.position.y = 0.15;
        for (let li = 0; li < 5; li++) {
          const lAngle = (li/5)*Math.PI*2;
          const lvGeo = new THREE.SphereGeometry(0.035, 5, 4);
          const lvMat = new THREE.MeshLambertMaterial({ color: 0x9B6ABE });
          const lv = new THREE.Mesh(lvGeo, lvMat);
          lv.position.set(Math.cos(lAngle)*0.04, 0.2+li*0.028, Math.sin(lAngle)*0.04);
          group.add(lv);
        }
        group.add(sprig);
      } else if (col.type === 'water_jar') {
        // Blue ceramic jar
        const jarGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8);
        const jarMat = new THREE.MeshLambertMaterial({ color: 0x4A90C4, emissive: 0x1A3060, emissiveIntensity: 0.2 });
        const jar = new THREE.Mesh(jarGeo, jarMat); jar.position.y = 0.18;
        const lidGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 8);
        const lid = new THREE.Mesh(lidGeo, jarMat); lid.position.y = 0.31;
        const handleGeo = new THREE.TorusGeometry(0.04, 0.015, 6, 8, Math.PI);
        const handle = new THREE.Mesh(handleGeo, jarMat); handle.position.set(0.1, 0.2, 0); handle.rotation.y = Math.PI/2;
        group.add(jar, lid, handle);
      }
      // Scale up + emissive glow + point light + spin flag
      group.scale.setScalar(1.4);
      group.traverse(child => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          const ec = child.material.color.clone().multiplyScalar(0.4);
          child.material.emissive = ec;
          child.material.emissiveIntensity = 0.7;
        }
      });
      const colLight = new THREE.PointLight(0xFFFFCC, 1.0, 2.2);
      colLight.position.set(0, 0.8, 0);
      group.add(colLight);
      group.userData.spin = true;
      scene.add(group); islandMeshes.push(group);
    });
  }

  // NPCs
  island.npcs.forEach((npc, ni) => {
    const nGroup = new THREE.Group();
    nGroup.position.set(npc.x, 0, npc.z);
    nGroup.userData = { npcIdx: ni, bobBase: 0, bobOffset: Math.random()*Math.PI*2,
      homeX: npc.x, homeZ: npc.z,
      wanderTimer: Math.random()*3, wanderDx: 0, wanderDz: 0, wanderActive: false };

    if (npc.name === 'Baker Bun') {
      // Round baker: cream body, white apron, chef hat, rosy cheeks
      const bodyGeo = new THREE.SphereGeometry(0.22, 10, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xF5CBA7 });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.28; body.scale.set(1, 0.9, 1);
      const apronGeo = new THREE.PlaneGeometry(0.28, 0.3);
      const apronMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const apron = new THREE.Mesh(apronGeo, apronMat); apron.position.set(0, 0.26, 0.2); apron.rotation.x = 0.2;
      const headGeo = new THREE.SphereGeometry(0.16, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xFFDDB4 });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.6;
      const hatGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.22, 10);
      const hatMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const hat = new THREE.Mesh(hatGeo, hatMat); hat.position.y = 0.84;
      const hatBrimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.03, 10);
      const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat); hatBrim.position.y = 0.73;
      const eyeGeo = new THREE.SphereGeometry(0.025, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x3A2010 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.06, 0.63, 0.14);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.06, 0.63, 0.14);
      const cheekGeo = new THREE.SphereGeometry(0.04, 5, 5);
      const cheekMat = new THREE.MeshLambertMaterial({ color: 0xF4A0A0 });
      const cheekL = new THREE.Mesh(cheekGeo, cheekMat); cheekL.position.set(-0.1, 0.59, 0.12);
      const cheekR = new THREE.Mesh(cheekGeo, cheekMat); cheekR.position.set(0.1, 0.59, 0.12);
      nGroup.userData.headMesh = head;
      nGroup.add(body, apron, head, hat, hatBrim, eyeL, eyeR, cheekL, cheekR);

    } else if (npc.name === 'Gardener') {
      // Tall slim gardener: green overalls, wide straw hat, holding trowel
      const bodyGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.38, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5B8C3A });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.28;
      const headGeo = new THREE.SphereGeometry(0.15, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xE8C99A });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.62;
      const hatGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.14, 8);
      const hatMat = new THREE.MeshLambertMaterial({ color: 0xC8A850 });
      const hat = new THREE.Mesh(hatGeo, hatMat); hat.position.y = 0.82;
      const brimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.03, 12);
      const brim = new THREE.Mesh(brimGeo, hatMat); brim.position.y = 0.76;
      const eyeGeo = new THREE.SphereGeometry(0.025, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x2A4010 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.06, 0.64, 0.13);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.06, 0.64, 0.13);
      const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6);
      const arm = new THREE.Mesh(armGeo, bodyMat); arm.position.set(0.18, 0.32, 0); arm.rotation.z = -0.8;
      const trowelGeo = new THREE.BoxGeometry(0.04, 0.12, 0.06);
      const trowelMat = new THREE.MeshLambertMaterial({ color: 0xA0A0A0 });
      const trowel = new THREE.Mesh(trowelGeo, trowelMat); trowel.position.set(0.28, 0.22, 0); trowel.rotation.z = -0.5;
      nGroup.userData.headMesh = head;
      nGroup.add(body, head, hat, brim, eyeL, eyeR, arm, trowel);

    } else if (npc.name === 'Elder Owl') {
      // Owl: round body, big eyes, ear tufts, wing nubs, staff
      const bodyGeo = new THREE.SphereGeometry(0.2, 10, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4F4261 });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.28; body.scale.set(1, 1.1, 1);
      const bellyGeo = new THREE.SphereGeometry(0.13, 8, 6);
      const bellyMat = new THREE.MeshLambertMaterial({ color: 0xC6C3DC });
      const belly = new THREE.Mesh(bellyGeo, bellyMat); belly.position.set(0, 0.26, 0.12); belly.scale.set(1, 0.9, 0.6);
      const headGeo = new THREE.SphereGeometry(0.17, 10, 8);
      const head = new THREE.Mesh(headGeo, bodyMat); head.position.y = 0.62;
      const eyeGeo = new THREE.SphereGeometry(0.06, 8, 6);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0xEBB21A });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.08, 0.64, 0.12);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.08, 0.64, 0.12);
      const pupilGeo = new THREE.SphereGeometry(0.03, 6, 5);
      const pupilMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
      const pupilL = new THREE.Mesh(pupilGeo, pupilMat); pupilL.position.set(-0.08, 0.64, 0.17);
      const pupilR = new THREE.Mesh(pupilGeo, pupilMat); pupilR.position.set(0.08, 0.64, 0.17);
      const beakGeo = new THREE.ConeGeometry(0.035, 0.07, 5);
      const beakMat = new THREE.MeshLambertMaterial({ color: 0xD4A020 });
      const beak = new THREE.Mesh(beakGeo, beakMat); beak.position.set(0, 0.6, 0.17); beak.rotation.x = Math.PI/2;
      const tuftGeo = new THREE.ConeGeometry(0.04, 0.1, 4);
      const tuftMat = new THREE.MeshLambertMaterial({ color: 0x3A2E52 });
      const tuftL = new THREE.Mesh(tuftGeo, tuftMat); tuftL.position.set(-0.1, 0.82, 0); tuftL.rotation.z = -0.3;
      const tuftR = new THREE.Mesh(tuftGeo, tuftMat); tuftR.position.set(0.1, 0.82, 0); tuftR.rotation.z = 0.3;
      const staffGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6);
      const staffMat = new THREE.MeshLambertMaterial({ color: 0x8B6040 });
      const staff = new THREE.Mesh(staffGeo, staffMat); staff.position.set(0.22, 0.35, 0);
      const orbGeo = new THREE.SphereGeometry(0.055, 8, 6);
      const orbMat = new THREE.MeshLambertMaterial({ color: 0x9B9AE2, emissive: 0x5555CC, emissiveIntensity: 0.5 });
      const orb = new THREE.Mesh(orbGeo, orbMat); orb.position.set(0.22, 0.72, 0);
      nGroup.userData.headMesh = head;
      nGroup.add(body, belly, head, eyeL, eyeR, pupilL, pupilR, beak, tuftL, tuftR, staff, orb);

    } else if (npc.name === 'Elder Moss') {
      // Ancient mossy tree-spirit: hunched wide body, bark-like texture, branch staff, mossy cap
      const bodyGeo = new THREE.SphereGeometry(0.22, 10, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4A5C2A });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.26; body.scale.set(1.1, 0.85, 1);
      const mossGeo = new THREE.SphereGeometry(0.14, 8, 6);
      const mossMat = new THREE.MeshLambertMaterial({ color: 0x6F9A30 });
      const moss = new THREE.Mesh(mossGeo, mossMat); moss.position.set(0, 0.22, 0.1); moss.scale.set(1.2, 0.5, 0.7);
      const headGeo = new THREE.SphereGeometry(0.16, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0x5C6E35 });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.58;
      const capGeo = new THREE.SphereGeometry(0.18, 8, 4);
      const capMat = new THREE.MeshLambertMaterial({ color: 0x3D5C18 });
      const cap = new THREE.Mesh(capGeo, capMat); cap.position.y = 0.7; cap.scale.set(1, 0.5, 1);
      const eyeGeo = new THREE.SphereGeometry(0.022, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x8FCC44, emissive: 0x336600, emissiveIntensity: 0.4 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.06, 0.6, 0.14);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.06, 0.6, 0.14);
      const staffGeo = new THREE.CylinderGeometry(0.022, 0.03, 0.75, 5);
      const staffMat = new THREE.MeshLambertMaterial({ color: 0x5C3A1A });
      const staff = new THREE.Mesh(staffGeo, staffMat); staff.position.set(-0.24, 0.38, 0); staff.rotation.z = 0.15;
      const branchGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4);
      const branch = new THREE.Mesh(branchGeo, staffMat); branch.position.set(-0.28, 0.76, 0); branch.rotation.z = 0.9;
      const leafGeo = new THREE.SphereGeometry(0.055, 5, 4);
      const leafMat = new THREE.MeshLambertMaterial({ color: 0x5DA82A });
      const leaf = new THREE.Mesh(leafGeo, leafMat); leaf.position.set(-0.38, 0.8, 0); leaf.scale.set(1, 0.5, 0.8);
      nGroup.userData.headMesh = head;
      nGroup.add(body, moss, head, cap, eyeL, eyeR, staff, branch, leaf);

    } else if (npc.name === 'Fern') {
      // Delicate nature sprite: slim body, leaf-wing shapes on back, flower crown
      const bodyGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.35, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x7BAE5C });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.28;
      const headGeo = new THREE.SphereGeometry(0.14, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xC2DBA0 });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.6;
      const crownGeo = new THREE.TorusGeometry(0.1, 0.02, 6, 10);
      const crownMat = new THREE.MeshLambertMaterial({ color: 0xF5F0E8 });
      const crown = new THREE.Mesh(crownGeo, crownMat); crown.position.y = 0.73; crown.rotation.x = Math.PI/2;
      const eyeGeo = new THREE.SphereGeometry(0.02, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x2A5C10 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.055, 0.62, 0.12);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.055, 0.62, 0.12);
      const wingGeo = new THREE.SphereGeometry(0.12, 6, 4);
      const wingMat = new THREE.MeshLambertMaterial({ color: 0x9BCE6A, transparent: true, opacity: 0.75 });
      const wingL = new THREE.Mesh(wingGeo, wingMat); wingL.position.set(-0.18, 0.42, -0.08); wingL.scale.set(0.5, 0.9, 0.3);
      const wingR = new THREE.Mesh(wingGeo, wingMat); wingR.position.set(0.18, 0.42, -0.08); wingR.scale.set(0.5, 0.9, 0.3);
      nGroup.userData.headMesh = head;
      nGroup.add(body, head, crown, eyeL, eyeR, wingL, wingR);

    } else if (npc.name === 'Sprite') {
      // Tiny glowing fairy: small round body, sparkle wings, bright emissive glow
      const bodyGeo = new THREE.SphereGeometry(0.13, 8, 7);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xF5F0E8, emissive: 0xCC5599, emissiveIntensity: 0.3 });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.3; body.scale.set(1, 1.1, 1);
      const headGeo = new THREE.SphereGeometry(0.12, 8, 7);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xFFE4F5 });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.57;
      const eyeGeo = new THREE.SphereGeometry(0.018, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x9922BB });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.048, 0.59, 0.11);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.048, 0.59, 0.11);
      const wingGeo = new THREE.SphereGeometry(0.1, 5, 4);
      const wingMat = new THREE.MeshLambertMaterial({ color: 0xFFCCEE, transparent: true, opacity: 0.6 });
      const wingTL = new THREE.Mesh(wingGeo, wingMat); wingTL.position.set(-0.15, 0.48, -0.05); wingTL.scale.set(0.4, 0.7, 0.25);
      const wingTR = new THREE.Mesh(wingGeo, wingMat); wingTR.position.set(0.15, 0.48, -0.05); wingTR.scale.set(0.4, 0.7, 0.25);
      const wingBL = new THREE.Mesh(wingGeo, wingMat); wingBL.position.set(-0.13, 0.34, -0.05); wingBL.scale.set(0.35, 0.5, 0.2);
      const wingBR = new THREE.Mesh(wingGeo, wingMat); wingBR.position.set(0.13, 0.34, -0.05); wingBR.scale.set(0.35, 0.5, 0.2);
      const glowGeo = new THREE.SphereGeometry(0.17, 6, 5);
      const glowMat = new THREE.MeshLambertMaterial({ color: 0xFFAADD, transparent: true, opacity: 0.18 });
      const glow = new THREE.Mesh(glowGeo, glowMat); glow.position.y = 0.32;
      nGroup.userData.headMesh = head;
      nGroup.add(body, head, eyeL, eyeR, wingTL, wingTR, wingBL, wingBR, glow);

    } else if (npc.name === 'Sandy') {
      // Beach character: warm tan body, sun hat with flower, bucket accessory
      const bodyGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.36, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xEBB21A });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.28;
      const headGeo = new THREE.SphereGeometry(0.15, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xF5D5A0 });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.62;
      const hatBrimGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.03, 12);
      const hatMat = new THREE.MeshLambertMaterial({ color: 0xF0C060 });
      const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat); hatBrim.position.y = 0.74;
      const hatTopGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.15, 10);
      const hatTop = new THREE.Mesh(hatTopGeo, hatMat); hatTop.position.y = 0.83;
      const flowerGeo = new THREE.SphereGeometry(0.04, 6, 5);
      const flowerMat = new THREE.MeshLambertMaterial({ color: 0xFF8888 });
      const flower = new THREE.Mesh(flowerGeo, flowerMat); flower.position.set(0.1, 0.92, 0.06);
      const eyeGeo = new THREE.SphereGeometry(0.022, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x5C3A0A });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.06, 0.64, 0.13);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.06, 0.64, 0.13);
      const cheekGeo = new THREE.SphereGeometry(0.035, 5, 5);
      const cheekMat = new THREE.MeshLambertMaterial({ color: 0xF4B080 });
      const cheekL = new THREE.Mesh(cheekGeo, cheekMat); cheekL.position.set(-0.09, 0.61, 0.12);
      const cheekR = new THREE.Mesh(cheekGeo, cheekMat); cheekR.position.set(0.09, 0.61, 0.12);
      const bucketGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.1, 8);
      const bucketMat = new THREE.MeshLambertMaterial({ color: 0x4488CC });
      const bucket = new THREE.Mesh(bucketGeo, bucketMat); bucket.position.set(0.22, 0.18, 0);
      nGroup.userData.headMesh = head;
      nGroup.add(body, head, hatBrim, hatTop, flower, eyeL, eyeR, cheekL, cheekR, bucket);

    } else if (npc.name === 'Crab') {
      // Crab creature: wide flat shell body, large claws, googly eyes on stalks
      const shellGeo = new THREE.SphereGeometry(0.2, 10, 6);
      const shellMat = new THREE.MeshLambertMaterial({ color: 0xEB6259 });
      const shell = new THREE.Mesh(shellGeo, shellMat); shell.position.y = 0.22; shell.scale.set(1.3, 0.6, 1.0);
      const bellyGeo = new THREE.SphereGeometry(0.15, 8, 5);
      const bellyMat = new THREE.MeshLambertMaterial({ color: 0xF5A090 });
      const belly = new THREE.Mesh(bellyGeo, bellyMat); belly.position.set(0, 0.18, 0.1); belly.scale.set(1, 0.5, 0.6);
      // Eye stalks
      const stalkGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.12, 5);
      const stalkMat = new THREE.MeshLambertMaterial({ color: 0xEB6259 });
      const stalkL = new THREE.Mesh(stalkGeo, stalkMat); stalkL.position.set(-0.1, 0.44, 0.08);
      const stalkR = new THREE.Mesh(stalkGeo, stalkMat); stalkR.position.set(0.1, 0.44, 0.08);
      const eyeGeo = new THREE.SphereGeometry(0.05, 7, 6);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.1, 0.54, 0.1);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.1, 0.54, 0.1);
      const pupilGeo = new THREE.SphereGeometry(0.025, 5, 4);
      const pupilMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
      const pupilL = new THREE.Mesh(pupilGeo, pupilMat); pupilL.position.set(-0.1, 0.55, 0.15);
      const pupilR = new THREE.Mesh(pupilGeo, pupilMat); pupilR.position.set(0.1, 0.55, 0.15);
      // Claws
      const clawBaseGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.18, 6);
      const clawL = new THREE.Mesh(clawBaseGeo, shellMat); clawL.position.set(-0.3, 0.22, 0.05); clawL.rotation.z = 0.7;
      const clawR = new THREE.Mesh(clawBaseGeo, shellMat); clawR.position.set(0.3, 0.22, 0.05); clawR.rotation.z = -0.7;
      const clawTipGeo = new THREE.SphereGeometry(0.07, 7, 5);
      const clawTipL = new THREE.Mesh(clawTipGeo, shellMat); clawTipL.position.set(-0.4, 0.32, 0.05); clawTipL.scale.set(1, 0.7, 0.8);
      const clawTipR = new THREE.Mesh(clawTipGeo, shellMat); clawTipR.position.set(0.4, 0.32, 0.05); clawTipR.scale.set(1, 0.7, 0.8);
      nGroup.add(shell, belly, stalkL, stalkR, eyeL, eyeR, pupilL, pupilR, clawL, clawR, clawTipL, clawTipR);

    } else if (npc.name === 'Driftwood') {
      // Old sailor: weathered wide body, captain's coat, naval hat, pipe
      const bodyGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.38, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x6A7A8A });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.28;
      const coatGeo = new THREE.CylinderGeometry(0.17, 0.2, 0.38, 8);
      const coatMat = new THREE.MeshLambertMaterial({ color: 0x2C3E50 });
      const coat = new THREE.Mesh(coatGeo, coatMat); coat.position.y = 0.26; coat.scale.set(1, 1, 0.85);
      const headGeo = new THREE.SphereGeometry(0.15, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xF0DEC2 });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.62;
      const hatGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.12, 10);
      const hatMat = new THREE.MeshLambertMaterial({ color: 0x1A2530 });
      const hat = new THREE.Mesh(hatGeo, hatMat); hat.position.y = 0.78;
      const hatBrimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10);
      const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat); hatBrim.position.y = 0.72;
      const eyeGeo = new THREE.SphereGeometry(0.022, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x3A5060 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.06, 0.64, 0.13);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.06, 0.64, 0.13);
      const beardGeo = new THREE.SphereGeometry(0.09, 7, 5);
      const beardMat = new THREE.MeshLambertMaterial({ color: 0xCCC8B8 });
      const beard = new THREE.Mesh(beardGeo, beardMat); beard.position.set(0, 0.56, 0.1); beard.scale.set(0.9, 0.6, 0.7);
      const pipeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.14, 5);
      const pipeMat = new THREE.MeshLambertMaterial({ color: 0x4A2E1A });
      const pipe = new THREE.Mesh(pipeGeo, pipeMat); pipe.position.set(0.08, 0.57, 0.15); pipe.rotation.z = 0.4; pipe.rotation.x = 0.3;
      nGroup.userData.headMesh = head;
      nGroup.add(body, coat, head, hat, hatBrim, eyeL, eyeR, beard, pipe);

    } else if (npc.name === 'Ember') {
      // Fire spirit: round glowing body with flame wisps rising, ember core
      const bodyGeo = new THREE.SphereGeometry(0.18, 10, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xEB6259, emissive: 0xCC2200, emissiveIntensity: 0.4 });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.28; body.scale.set(1, 1.05, 1);
      const coreGeo = new THREE.SphereGeometry(0.1, 8, 6);
      const coreMat = new THREE.MeshLambertMaterial({ color: 0xFFCC44, emissive: 0xFF8800, emissiveIntensity: 0.6 });
      const core = new THREE.Mesh(coreGeo, coreMat); core.position.set(0, 0.28, 0.06);
      const headGeo = new THREE.SphereGeometry(0.15, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xF08070 });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.6;
      // Flame hair spikes
      const flameGeo = new THREE.ConeGeometry(0.045, 0.18, 5);
      const flameMat = new THREE.MeshLambertMaterial({ color: 0xFF6622, emissive: 0xFF3300, emissiveIntensity: 0.5 });
      const flameC = new THREE.Mesh(flameGeo, flameMat); flameC.position.set(0, 0.84, 0);
      const flameL = new THREE.Mesh(flameGeo, flameMat); flameL.position.set(-0.09, 0.8, 0); flameL.rotation.z = -0.35;
      const flameR = new THREE.Mesh(flameGeo, flameMat); flameR.position.set(0.09, 0.8, 0); flameR.rotation.z = 0.35;
      const eyeGeo = new THREE.SphereGeometry(0.025, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0xFF8800, emissive: 0xFF4400, emissiveIntensity: 0.6 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.06, 0.62, 0.13);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.06, 0.62, 0.13);
      nGroup.userData.headMesh = head;
      nGroup.add(body, core, head, flameC, flameL, flameR, eyeL, eyeR);

    } else if (npc.name === 'Blossom') {
      // Cherry blossom spirit: soft pink body, petal skirt, flower in hair
      const bodyGeo = new THREE.SphereGeometry(0.17, 10, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xF5F0E8 });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.26; body.scale.set(1, 0.9, 1);
      // Petal skirt ring
      const skirtGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.08, 10);
      const skirtMat = new THREE.MeshLambertMaterial({ color: 0xFFBBDD });
      const skirt = new THREE.Mesh(skirtGeo, skirtMat); skirt.position.y = 0.1;
      const headGeo = new THREE.SphereGeometry(0.15, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xFFE0F0 });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.58;
      const flowerGeo = new THREE.SphereGeometry(0.06, 6, 5);
      const flowerMat = new THREE.MeshLambertMaterial({ color: 0xFF88AA });
      const flower = new THREE.Mesh(flowerGeo, flowerMat); flower.position.set(0.1, 0.73, 0.06); flower.scale.set(1, 0.5, 1);
      const petalGeo = new THREE.SphereGeometry(0.04, 5, 4);
      const petalMat = new THREE.MeshLambertMaterial({ color: 0xFFCCDD });
      for (let pi = 0; pi < 5; pi++) {
        const angle = (pi / 5) * Math.PI * 2;
        const p = new THREE.Mesh(petalGeo, petalMat);
        p.position.set(0.1 + Math.cos(angle)*0.065, 0.73, 0.06 + Math.sin(angle)*0.065);
        nGroup.add(p);
      }
      const eyeGeo = new THREE.SphereGeometry(0.02, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x883355 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.055, 0.6, 0.13);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.055, 0.6, 0.13);
      const cheekGeo = new THREE.SphereGeometry(0.032, 5, 5);
      const cheekMat = new THREE.MeshLambertMaterial({ color: 0xFFAACC });
      const cheekL = new THREE.Mesh(cheekGeo, cheekMat); cheekL.position.set(-0.085, 0.58, 0.12);
      const cheekR = new THREE.Mesh(cheekGeo, cheekMat); cheekR.position.set(0.085, 0.58, 0.12);
      nGroup.userData.headMesh = head;
      nGroup.add(body, skirt, head, flower, eyeL, eyeR, cheekL, cheekR);

    } else if (npc.name === 'Ashrock') {
      // Stone golem: angular blocky body, rocky chunks, mossy cracks, single glowing eye
      const bodyGeo = new THREE.BoxGeometry(0.36, 0.42, 0.3);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4F4261 });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.28;
      const shoulderLGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
      const rockMat = new THREE.MeshLambertMaterial({ color: 0x3A2E52 });
      const shoulderL = new THREE.Mesh(shoulderLGeo, rockMat); shoulderL.position.set(-0.22, 0.38, 0); shoulderL.rotation.y = 0.4;
      const shoulderR = new THREE.Mesh(shoulderLGeo, rockMat); shoulderR.position.set(0.22, 0.38, 0); shoulderR.rotation.y = -0.4;
      const headGeo = new THREE.BoxGeometry(0.28, 0.24, 0.24);
      const headMat = new THREE.MeshLambertMaterial({ color: 0x5A5070 });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.64; head.rotation.y = 0.1;
      const crackGeo = new THREE.BoxGeometry(0.04, 0.18, 0.02);
      const crackMat = new THREE.MeshLambertMaterial({ color: 0x5DA82A });
      const crack = new THREE.Mesh(crackGeo, crackMat); crack.position.set(0.05, 0.28, 0.16);
      const eyeGeo = new THREE.SphereGeometry(0.042, 7, 6);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x8B44CC, emissive: 0x6622AA, emissiveIntensity: 0.6 });
      const eye = new THREE.Mesh(eyeGeo, eyeMat); eye.position.set(0, 0.65, 0.13);
      nGroup.add(body, shoulderL, shoulderR, head, crack, eye);

    } else if (npc.name === 'Glimmer') {
      // Crystal fairy: faceted gem body, crystalline wings, sparkling silver
      const bodyGeo = new THREE.OctahedronGeometry(0.16, 0);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xC6C3DC, emissive: 0x9999CC, emissiveIntensity: 0.3 });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.32; body.scale.set(0.9, 1.3, 0.9);
      const headGeo = new THREE.SphereGeometry(0.14, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xEEECFF });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.62;
      const crownGeo = new THREE.OctahedronGeometry(0.06, 0);
      const crownMat = new THREE.MeshLambertMaterial({ color: 0xFFEEFF, emissive: 0xBBAAFF, emissiveIntensity: 0.5 });
      const crown = new THREE.Mesh(crownGeo, crownMat); crown.position.set(0, 0.77, 0); crown.scale.set(1.2, 0.7, 1.2);
      // Crystal wing shards
      const wingGeo = new THREE.OctahedronGeometry(0.1, 0);
      const wingMat = new THREE.MeshLambertMaterial({ color: 0xDDCCFF, transparent: true, opacity: 0.7 });
      const wingTL = new THREE.Mesh(wingGeo, wingMat); wingTL.position.set(-0.2, 0.5, -0.05); wingTL.scale.set(0.5, 1.0, 0.3);
      const wingTR = new THREE.Mesh(wingGeo, wingMat); wingTR.position.set(0.2, 0.5, -0.05); wingTR.scale.set(0.5, 1.0, 0.3);
      const wingBL = new THREE.Mesh(wingGeo, wingMat); wingBL.position.set(-0.16, 0.35, -0.05); wingBL.scale.set(0.4, 0.7, 0.25);
      const wingBR = new THREE.Mesh(wingGeo, wingMat); wingBR.position.set(0.16, 0.35, -0.05); wingBR.scale.set(0.4, 0.7, 0.25);
      const eyeGeo = new THREE.SphereGeometry(0.02, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x7766CC });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.053, 0.635, 0.12);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.053, 0.635, 0.12);
      nGroup.userData.headMesh = head;
      nGroup.add(body, head, crown, wingTL, wingTR, wingBL, wingBR, eyeL, eyeR);

    } else if (npc.name === 'Stalagmite') {
      // Cave creature: cluster of crystal spires as body, hunched low, mineral glow
      const baseGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.12, 8);
      const baseMat = new THREE.MeshLambertMaterial({ color: 0x3A2E52 });
      const base = new THREE.Mesh(baseGeo, baseMat); base.position.y = 0.1;
      // Central spire
      const spireGeo = new THREE.ConeGeometry(0.1, 0.45, 6);
      const spireMat = new THREE.MeshLambertMaterial({ color: 0x9B9AE2, emissive: 0x4444AA, emissiveIntensity: 0.35 });
      const spireC = new THREE.Mesh(spireGeo, spireMat); spireC.position.y = 0.38;
      const spireL = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), spireMat); spireL.position.set(-0.15, 0.28, 0.04); spireL.rotation.z = -0.25;
      const spireR = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), spireMat); spireR.position.set(0.15, 0.28, 0.04); spireR.rotation.z = 0.25;
      const spireB = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), spireMat); spireB.position.set(0, 0.22, -0.12); spireB.rotation.x = -0.3;
      // Eyes embedded in central spire
      const eyeGeo = new THREE.SphereGeometry(0.028, 6, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0xCCBBFF, emissive: 0x8877EE, emissiveIntensity: 0.7 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.05, 0.32, 0.09);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.05, 0.32, 0.09);
      nGroup.add(base, spireC, spireL, spireR, spireB, eyeL, eyeR);

    } else if (npc.name === 'Echo') {
      // Echo spirit: translucent wavering form, ghostly rings, soft pulse
      const bodyGeo = new THREE.SphereGeometry(0.17, 10, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xF5F0E8, transparent: true, opacity: 0.55 });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.3; body.scale.set(1, 1.2, 1);
      const innerGeo = new THREE.SphereGeometry(0.11, 8, 7);
      const innerMat = new THREE.MeshLambertMaterial({ color: 0xFFEEFF, transparent: true, opacity: 0.5, emissive: 0xDDAAFF, emissiveIntensity: 0.4 });
      const inner = new THREE.Mesh(innerGeo, innerMat); inner.position.y = 0.3;
      const headGeo = new THREE.SphereGeometry(0.14, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xFFEEFF, transparent: true, opacity: 0.7 });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.6;
      // Echo rings
      const ringGeo = new THREE.TorusGeometry(0.22, 0.015, 5, 16);
      const ringMat = new THREE.MeshLambertMaterial({ color: 0xEEBBFF, transparent: true, opacity: 0.4 });
      const ring1 = new THREE.Mesh(ringGeo, ringMat); ring1.position.y = 0.28; ring1.rotation.x = Math.PI/2;
      const ring2 = new THREE.Mesh(ringGeo, ringMat); ring2.position.y = 0.42; ring2.rotation.x = Math.PI/2; ring2.scale.set(0.7, 0.7, 1);
      const eyeGeo = new THREE.SphereGeometry(0.022, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0xCC88FF, transparent: true, opacity: 0.9 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.052, 0.62, 0.12);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.052, 0.62, 0.12);
      nGroup.userData.headMesh = head;
      nGroup.add(body, inner, head, ring1, ring2, eyeL, eyeR);

    } else if (npc.name === 'Zephyr') {
      // Wind spirit: flowing streamers, swirling body, dynamic wisps
      const bodyGeo = new THREE.SphereGeometry(0.16, 10, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xC6C3DC });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.3; body.scale.set(1, 1.1, 1);
      const headGeo = new THREE.SphereGeometry(0.14, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xEEECFF });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.6;
      const eyeGeo = new THREE.SphereGeometry(0.02, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x7799CC });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.052, 0.62, 0.12);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.052, 0.62, 0.12);
      // Streamer wisps (curved cylinder approximations)
      const streamerGeo = new THREE.CylinderGeometry(0.018, 0.004, 0.35, 5);
      const streamerMat = new THREE.MeshLambertMaterial({ color: 0xBBCCEE, transparent: true, opacity: 0.75 });
      const s1 = new THREE.Mesh(streamerGeo, streamerMat); s1.position.set(-0.18, 0.28, 0); s1.rotation.z = 0.6; s1.rotation.x = 0.2;
      const s2 = new THREE.Mesh(streamerGeo, streamerMat); s2.position.set(0.18, 0.28, 0); s2.rotation.z = -0.6; s2.rotation.x = -0.2;
      const s3 = new THREE.Mesh(streamerGeo, streamerMat); s3.position.set(-0.1, 0.18, 0.1); s3.rotation.z = 0.9; s3.rotation.x = 0.5;
      const s4 = new THREE.Mesh(streamerGeo, streamerMat); s4.position.set(0.1, 0.18, 0.1); s4.rotation.z = -0.9; s4.rotation.x = -0.5;
      // Swirling crown element
      const swirlGeo = new THREE.TorusGeometry(0.1, 0.018, 5, 10);
      const swirlMat = new THREE.MeshLambertMaterial({ color: 0x99BBEE, transparent: true, opacity: 0.7 });
      const swirl = new THREE.Mesh(swirlGeo, swirlMat); swirl.position.y = 0.75; swirl.rotation.x = 0.4;
      nGroup.userData.headMesh = head;
      nGroup.add(body, head, eyeL, eyeR, s1, s2, s3, s4, swirl);

    } else if (npc.name === 'Windkeeper') {
      // Guardian with windmill-like arms and a wide traveler's cloak
      const bodyGeo = new THREE.CylinderGeometry(0.14, 0.2, 0.4, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x9B9AE2 });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.28;
      const cloakGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.38, 10);
      const cloakMat = new THREE.MeshLambertMaterial({ color: 0x7070BB });
      const cloak = new THREE.Mesh(cloakGeo, cloakMat); cloak.position.y = 0.25; cloak.scale.set(1, 1, 0.8);
      const headGeo = new THREE.SphereGeometry(0.15, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xD0CEEE });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.62;
      const eyeGeo = new THREE.SphereGeometry(0.022, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x4444AA });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.06, 0.64, 0.13);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.06, 0.64, 0.13);
      // Windmill vane arms
      const vaneGeo = new THREE.BoxGeometry(0.3, 0.04, 0.06);
      const vaneMat = new THREE.MeshLambertMaterial({ color: 0xCCCCFF });
      const vaneH = new THREE.Mesh(vaneGeo, vaneMat); vaneH.position.set(0.26, 0.38, 0.12);
      const vaneV = new THREE.Mesh(vaneGeo, vaneMat); vaneV.position.set(0.26, 0.38, 0.12); vaneV.rotation.z = Math.PI/2;
      const hubGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.04, 7);
      const hubMat = new THREE.MeshLambertMaterial({ color: 0xEEEEFF });
      const hub = new THREE.Mesh(hubGeo, hubMat); hub.position.set(0.26, 0.38, 0.14); hub.rotation.x = Math.PI/2;
      nGroup.add(body, cloak, head, eyeL, eyeR, vaneH, vaneV, hub);

    } else if (npc.name === 'Ancient Keeper') {
      // Ancient wise being: tall stately robes, long beard, glowing rune staff
      const robeGeo = new THREE.CylinderGeometry(0.12, 0.22, 0.48, 10);
      const robeMat = new THREE.MeshLambertMaterial({ color: 0x2A1E40 });
      const robe = new THREE.Mesh(robeGeo, robeMat); robe.position.y = 0.3;
      const robeTrimGeo = new THREE.CylinderGeometry(0.13, 0.23, 0.05, 10);
      const trimMat = new THREE.MeshLambertMaterial({ color: 0x8866AA });
      const robeTrim = new THREE.Mesh(robeTrimGeo, trimMat); robeTrim.position.y = 0.08;
      const headGeo = new THREE.SphereGeometry(0.15, 10, 8);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xD8C8AA });
      const head = new THREE.Mesh(headGeo, headMat); head.position.y = 0.68;
      const hoodGeo = new THREE.ConeGeometry(0.17, 0.28, 10);
      const hoodMat = new THREE.MeshLambertMaterial({ color: 0x2A1E40 });
      const hood = new THREE.Mesh(hoodGeo, hoodMat); hood.position.y = 0.84;
      const beardGeo = new THREE.ConeGeometry(0.07, 0.22, 7);
      const beardMat = new THREE.MeshLambertMaterial({ color: 0xEEEEDD });
      const beard = new THREE.Mesh(beardGeo, beardMat); beard.position.set(0, 0.57, 0.1); beard.rotation.x = -0.3; beard.scale.set(1, 1, 0.6);
      const eyeGeo = new THREE.SphereGeometry(0.02, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0xCCBBFF, emissive: 0x9988CC, emissiveIntensity: 0.5 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.055, 0.7, 0.13);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.055, 0.7, 0.13);
      const staffGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.82, 6);
      const staffMat = new THREE.MeshLambertMaterial({ color: 0x2A1E30 });
      const staff = new THREE.Mesh(staffGeo, staffMat); staff.position.set(-0.22, 0.42, 0);
      const runeGeo = new THREE.OctahedronGeometry(0.065, 0);
      const runeMat = new THREE.MeshLambertMaterial({ color: 0xBB88FF, emissive: 0x9955EE, emissiveIntensity: 0.7 });
      const rune = new THREE.Mesh(runeGeo, runeMat); rune.position.set(-0.22, 0.85, 0);
      nGroup.add(robe, robeTrim, head, hood, beard, eyeL, eyeR, staff, rune);

    } else {
      // Generic fallback NPC
      const bodyGeo = new THREE.CapsuleGeometry(0.14, 0.22, 4, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: npc.color });
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.36;
      nGroup.add(body);
    }

    const nMesh = nGroup;
    nMesh.userData = { npcIdx: ni, bobBase: 0, bobOffset: Math.random()*Math.PI*2 };
    scene.add(nMesh); npcMeshes.push(nMesh);
    // Floating thought bubble indicator
    const excCanvas = document.createElement('canvas');
    excCanvas.width = 48; excCanvas.height = 48;
    const excCtx = excCanvas.getContext('2d');
    // Main bubble
    excCtx.fillStyle = 'rgba(240,222,194,0.95)';
    excCtx.beginPath(); excCtx.ellipse(24, 18, 16, 12, 0, 0, Math.PI*2); excCtx.fill();
    excCtx.strokeStyle = 'rgba(79,66,97,0.4)'; excCtx.lineWidth = 1.5;
    excCtx.beginPath(); excCtx.ellipse(24, 18, 16, 12, 0, 0, Math.PI*2); excCtx.stroke();
    // Small dots below (classic thought bubble tail)
    excCtx.fillStyle = 'rgba(240,222,194,0.95)';
    excCtx.beginPath(); excCtx.arc(20, 32, 4, 0, Math.PI*2); excCtx.fill();
    excCtx.strokeStyle = 'rgba(79,66,97,0.35)'; excCtx.lineWidth = 1;
    excCtx.beginPath(); excCtx.arc(20, 32, 4, 0, Math.PI*2); excCtx.stroke();
    excCtx.fillStyle = 'rgba(240,222,194,0.9)';
    excCtx.beginPath(); excCtx.arc(15, 40, 2.5, 0, Math.PI*2); excCtx.fill();
    excCtx.beginPath(); excCtx.arc(15, 40, 2.5, 0, Math.PI*2); excCtx.stroke();
    // Dots inside bubble suggesting speech
    excCtx.fillStyle = '#4F4261';
    excCtx.beginPath(); excCtx.arc(17, 18, 2.5, 0, Math.PI*2); excCtx.fill();
    excCtx.beginPath(); excCtx.arc(24, 18, 2.5, 0, Math.PI*2); excCtx.fill();
    excCtx.beginPath(); excCtx.arc(31, 18, 2.5, 0, Math.PI*2); excCtx.fill();
    const excTex = new THREE.CanvasTexture(excCanvas);
    const excMat = new THREE.SpriteMaterial({ map: excTex, transparent: true, depthTest: false });
    const excSprite = new THREE.Sprite(excMat);
    excSprite.scale.set(0.55, 0.55, 1);
    excSprite.position.set(npc.x, 1.25, npc.z);
    excSprite.userData = { excBase: 1.25, excOffset: Math.random()*Math.PI*2 };
    scene.add(excSprite); islandMeshes.push(excSprite);
    nMesh.userData.excSprite = excSprite;
    // Name float indicator
    // (simplified — shown in dialogue only)
  });

  // Particles per biome
  particles.addAmbientMotes(isMobile ? 60 : 120);
  if (islandId === 0) particles.addFireflies(isMobile ? 15 : 30); // Mossy Forest fireflies
  if (islandId === 1) { // Sunflower Beach — wave foam bursts
    for (let i = 0; i < (isMobile?4:8); i++) {
      setTimeout(() => particles.addBurst(-3+Math.random()*6, 0.1, -4+Math.random()*2, 0xB8E4F0, 12), i*600);
    }
  }
  if (islandId === 2) particles.addPetals(isMobile?20:40, PALETTE.softPinkN);
  if (islandId === 3) { // Crystal Cave — extra spores + bioluminescent pool glow
    particles.addAmbientMotes(isMobile?30:60);
    // Bioluminescent pool: pulsing cyan point light
    const poolLight = new THREE.PointLight(0x00FFCC, 0.6, 4);
    poolLight.position.set(0, 0.3, -3);
    poolLight.userData.bioPool = true;
    scene.add(poolLight); islandMeshes.push(poolLight);
  }
  if (islandId === 4) particles.addPetals(isMobile?20:40, PALETTE.softLavenderN);

  // Spawn free crystals at fixed positions
  spawnFreeCrystals(islandId);

  updateCrystalHUD();
  drawCompass(island);
}

// ── Dialogue System ───────────────────────────────────────────
const NPC_COLORS = {
  '✨': '#EBB21A', 'Shrine': '#9B9AE2', '✨ Shrine': '#9B9AE2',
  '✨ Restoration!': '#EBB21A', '✨ Map Updated': '#EBB21A',
};
// Cycle 10: NPC portrait color map
const NPC_PORTRAIT_COLORS = {
  'Baker Bun': '#F5CBA7', 'Gardener': '#5B8C3A', 'Elder Owl': '#4F4261',
  'Elder Moss': '#4A5C2A', 'Fern': '#7BAE5C', 'Sprite': '#F5F0E8',
  'Sandy': '#EBB21A', 'Crab': '#EB6259', 'Driftwood': '#6A7A8A',
  'Crystal': '#9B9AE2', 'Shrine': '#9B9AE2', 'Restoration!': '#EBB21A',
  'Map Updated': '#EBB21A', 'Found': '#EBB21A',
};
function showDialogue(speaker, lines, callback) {
  if (state === 'dialogue') return;
  state = 'dialogue';
  dialogueQueue = [...lines];
  dialogueCallback = callback || null;
  dialogueSpeaker.textContent = speaker;
  // Cycle 10: update speaker portrait circle color
  const icon = document.getElementById('dialogue-speaker-icon');
  if (icon) {
    const pColor = NPC_PORTRAIT_COLORS[speaker] || '#9B9AE2';
    const initial = speaker.replace(/[✨\s]/g,'').charAt(0).toUpperCase() || '?';
    icon.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${pColor}" opacity="0.85"/><text x="12" y="16" text-anchor="middle" font-size="11" font-family="Quicksand,sans-serif" fill="white" font-weight="700">${initial}</text></svg>`;
  }
  dialogueBox.style.display = 'block';
  advanceDialogue();
}

function formatDialogueLine(text) {
  // Render *emotion* tags as styled spans
  return text.replace(/\*([^*]+)\*/g, '<em style="color:#9B9AE2;font-style:italic;font-size:0.9em">$1</em>');
}

function advanceDialogue() {
  if (dialogueQueue.length === 0) {
    closeDialogue(); return;
  }
  const line = dialogueQueue.shift();
  currentLine = '';
  currentFullLine = line;
  dialogueText.innerHTML = '';
  dialogueContinue.style.display = 'none';
  if (typewriterTimer) clearInterval(typewriterTimer);
  let ci = 0;
  sfxDialogue();
  typewriterTimer = setInterval(() => {
    if (ci < line.length) {
      currentLine += line[ci++];
      dialogueText.innerHTML = formatDialogueLine(currentLine);
      if (ci % 6 === 0) sfxDialogue();
    } else {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
      dialogueText.innerHTML = formatDialogueLine(line);
      dialogueContinue.style.display = 'block';
    }
  }, 28);
}

function closeDialogue() {
  dialogueBox.style.display = 'none';
  if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
  Object.keys(keys).forEach(k => { keys[k] = false; });
  state = 'playing';
  if (dialogueCallback) { const cb = dialogueCallback; dialogueCallback = null; cb(); }
}

// ── Wisdom quotes per biome (Cycle 4) ────────────────────────
const CRYSTAL_WISDOM = [
  [ // Mossy Forest
    "Light finds the cracks where shadows sleep.",
    "The forest remembers every kindness.",
    "Even a small flame drives away great dark.",
  ],
  [ // Sunflower Beach
    "Tides carry what the heart cannot hold.",
    "Warmth given freely returns a hundredfold.",
    "Every shore is the start of somewhere new.",
  ],
  [ // Sakura Cove
    "Beauty blooms when you stop trying to keep it.",
    "A petal falls. The tree remains.",
    "Some things only exist to become the wind.",
  ],
  [ // Cozy Village
    "Home is the people who wait up for you.",
    "Good bread and honest work — enough.",
    "Ordinary days, remembered, become extraordinary.",
  ],
  [ // Crystal Cave
    "Pressure and time make beautiful things.",
    "Light does not ask permission to shine.",
    "The deep dark is just depth, waiting to be loved.",
  ],
  [ // Lavender Highlands
    "High places remind you how small worry is.",
    "The wind carries no malice — only passage.",
    "Rest is not surrender. It is preparation.",
  ],
];
let wisdomCycleIndex = 0;
function showWisdomOverlay(islandId) {
  const quotes = CRYSTAL_WISDOM[islandId] || CRYSTAL_WISDOM[0];
  const text = quotes[wisdomCycleIndex % quotes.length];
  wisdomCycleIndex++;
  let el = document.getElementById('wisdom-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wisdom-overlay';
    el.style.cssText = `position:fixed;bottom:96px;left:50%;transform:translateX(-50%);
      font-family:'Cormorant Garamond',serif;font-size:17px;font-style:italic;font-weight:600;
      color:#FFF8EC;text-align:center;pointer-events:none;z-index:300;
      background:rgba(40,20,55,0.78);border-radius:24px;padding:8px 20px;
      box-shadow:0 2px 16px rgba(0,0,0,0.5);
      text-shadow:0 1px 4px rgba(0,0,0,0.9);transition:opacity 0.8s ease;opacity:0;
      letter-spacing:0.4px;max-width:400px;line-height:1.5;`;
    document.body.appendChild(el);
  }
  el.textContent = `✦ ${text} ✦`;
  el.style.opacity = '1';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.opacity = '0'; }, 3200);
}

// ── Shrine Beam ───────────────────────────────────────────────
let shrinBeamMesh = null;
let shrineBeamLight = null;
function addShrineBeam(island) {
  if (shrinBeamMesh) return;
  const sx = island.shrinePos.x, sz = island.shrinePos.z;
  // Tall glowing cylinder as beam
  const beamGeo = new THREE.CylinderGeometry(0.08, 0.25, 14, 10, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xFFEEAA, transparent: true, opacity: 0.35,
    side: THREE.DoubleSide, depthWrite: false
  });
  shrinBeamMesh = new THREE.Mesh(beamGeo, beamMat);
  shrinBeamMesh.position.set(sx, 7, sz);
  shrinBeamMesh.userData.shrineBeam = true;
  scene.add(shrinBeamMesh); islandMeshes.push(shrinBeamMesh);
  // Bright point light at base
  shrineBeamLight = new THREE.PointLight(0xFFDD88, 2.5, 6);
  shrineBeamLight.position.set(sx, 1.5, sz);
  shrineBeamLight.userData.shrineBeam = true;
  scene.add(shrineBeamLight); islandMeshes.push(shrineBeamLight);
  // Pulse ring burst
  particles.addPulseRing(sx, 0.1, sz);
  particles.addBurst(sx, 1, sz, 0xFFDD88, 30);
}

// ── Crystal Collection ────────────────────────────────────────
function collectCrystal(mesh) {
  const island = getIsland(currentIslandId);
  const idx = mesh.userData.crystalIdx;
  island.crystalCount++;
  // Remove mesh and its glow light
  scene.remove(mesh);
  if (mesh.userData.glowLight) scene.remove(mesh.userData.glowLight);
  const ci = crystalMeshes.indexOf(mesh);
  if (ci >= 0) crystalMeshes.splice(ci, 1);
  // Burst particles
  particles.addBurst(mesh.position.x, mesh.position.y, mesh.position.z, PALETTE.softPinkN, 25);
  particles.addPulseRing(mesh.position.x, 0.1, mesh.position.z);
  sfxCrystalCollect();
  showWisdomOverlay(currentIslandId);
  updateCrystalHUD();
  if (island.crystalCount >= island.totalCrystals) {
    // Beam of light on shrine
    island.beamAdded = true; addShrineBeam(island);
    setTimeout(()=>showDialogue('Shrine', ['All shards gathered! Bring them to the shrine.'], null), 600);
  }
}

// ── Spawn Quest Crystal near NPC ─────────────────────────────
let fireflyTargetMesh = null;
function spawnFireflyTarget() {
  if (fireflyTargetMesh) return;
  // Place firefly at a random spot on the island, away from center
  const angle = Math.random() * Math.PI * 2;
  const dist = 3.5 + Math.random() * 1.5;
  const fx = Math.cos(angle) * dist;
  const fz = Math.sin(angle) * dist;
  const ffGroup = new THREE.Group();
  ffGroup.position.set(fx, 0.6, fz);
  // Glowing orb
  const orbGeo = new THREE.SphereGeometry(0.12, 10, 8);
  const orbMat = new THREE.MeshLambertMaterial({ color: 0xFFFF88, emissive: 0xFFFF00, emissiveIntensity: 1.2 });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  ffGroup.add(orb);
  // Soft wings (two flat ellipses)
  const wingMat = new THREE.MeshLambertMaterial({ color: 0xCCFFCC, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  for (let w = 0; w < 2; w++) {
    const wingGeo = new THREE.SphereGeometry(0.1, 6, 4);
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.scale.set(1.4, 0.35, 0.6);
    wing.position.set(w === 0 ? -0.14 : 0.14, 0.02, -0.04);
    wing.rotation.z = w === 0 ? 0.3 : -0.3;
    ffGroup.add(wing);
  }
  const ffLight = new THREE.PointLight(0xFFFF44, 1.2, 3.0);
  ffGroup.add(ffLight);
  ffGroup.userData = { fireflyTarget: true, bobBase: 0.6, bobOffset: Math.random() * Math.PI * 2, spin: true };
  scene.add(ffGroup);
  islandMeshes.push(ffGroup);
  fireflyTargetMesh = ffGroup;
  // Spawn particle burst to draw attention
  particles.addBurst(fx, 0.8, fz, 0xFFFF88, 20);
}

function spawnCrystalAt(cx, cz) {
  const geo = new THREE.SphereGeometry(0.14, 10, 8);
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.softPinkN, emissive: PALETTE.softPurpleN, emissiveIntensity: 0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, 0.5, cz);
  const cl = new THREE.PointLight(PALETTE.softPinkN, 0.5, 2.5);
  cl.position.set(cx, 0.5, cz);
  scene.add(cl);
  mesh.userData = { crystalIdx: crystalMeshes.length, bobBase: 0.5, glowLight: cl };
  scene.add(mesh); crystalMeshes.push(mesh);
  const orbit = particles.addCrystalOrbiters(cx, 0.5, cz);
  crystalOrbits.push({ mesh, orbit });
}

function spawnFreeCrystals(islandId) {
  const island = getIsland(islandId);
  // Determine how many crystals are free (not quest-locked)
  // Count quest rewards — those slots are locked; the rest are free
  const lockedSlots = new Set();
  island.npcs.forEach(npc => {
    if (npc.quest && typeof npc.quest.reward === 'number') lockedSlots.add(npc.quest.reward);
  });
  island.crystalPositions.forEach((cp, i) => {
    if (!lockedSlots.has(i)) spawnCrystalAt(cp.x, cp.z);
  });
}

function spawnQuestCrystal(npcX, npcZ, rewardSlot) {
  const island = getIsland(currentIslandId);
  let cx, cz;
  // Use fixed position if a reward slot is given and in range
  if (typeof rewardSlot === 'number' && island.crystalPositions[rewardSlot]) {
    cx = island.crystalPositions[rewardSlot].x;
    cz = island.crystalPositions[rewardSlot].z;
  } else {
    // Fallback: spawn near player
    const px = player ? player.pos.x : npcX;
    const pz = player ? player.pos.z : npcZ;
    let attempts = 0;
    do {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.5 + Math.random() * 1.0;
      cx = px + Math.cos(angle) * radius;
      cz = pz + Math.sin(angle) * radius;
      attempts++;
      const tooCloseShrine = Math.hypot(cx - island.shrinePos.x, cz - island.shrinePos.z) < 1.5;
      const tooCloseNPC    = island.npcs.some(n => Math.hypot(cx - n.x, cz - n.z) < 1.5);
      if (!tooCloseShrine && !tooCloseNPC) break;
    } while (attempts < 20);
  }
  const geo = new THREE.SphereGeometry(0.14, 10, 8);
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.softPinkN, emissive: PALETTE.softPurpleN, emissiveIntensity: 0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, 0.5, cz);
  const cl = new THREE.PointLight(PALETTE.softPinkN, 0.5, 2.5);
  cl.position.set(cx, 0.5, cz);
  scene.add(cl);
  mesh.userData = { crystalIdx: crystalMeshes.length, bobBase: 0.5, glowLight: cl };
  scene.add(mesh); crystalMeshes.push(mesh);
  const orbit = particles.addCrystalOrbiters(cx, 0.5, cz);
  crystalOrbits.push({ mesh, orbit });
  // Flash + sound
  sfxCrystalCollect();
  particles.addBurst(cx, 0.5, cz, PALETTE.softPinkN, 20);
  // Hint dialogue
  setTimeout(() => showDialogue('Crystal', ['A crystal shard appeared nearby! Collect it.'], null), 300);
}

// ── Shrine Restoration ────────────────────────────────────────
function activateShrine() {
  const island = getIsland(currentIslandId);
  if (island.restored || island.crystalCount < island.totalCrystals) {
    if (island.crystalCount < island.totalCrystals) {
      showDialogue('Shrine', [`The shrine stirs… ${island.totalCrystals - island.crystalCount} crystal shard${island.totalCrystals-island.crystalCount!==1?'s':''} still missing.`], null);
    }
    return;
  }
  island.restored = true;
  sfxShrine();
  triggerCameraShake(0.18, 0.9);
  particles.addRestorationBurst(island.shrinePos.x, 1, island.shrinePos.z);
  // Screen flash on restoration
  const flash = document.getElementById('restore-flash');
  if (flash) {
    flash.style.transition = 'none'; flash.style.opacity = '0.7';
    setTimeout(() => { flash.style.transition = 'opacity 0.8s ease'; flash.style.opacity = '0'; }, 80);
  }
  // Light up shrine
  if (shrineMesh) { shrineMesh.material.emissiveIntensity = 0.9; }


  const loreDrops = [
    'A memory stirs in the light… "The Star did not fall by accident. Someone let it go."',
    'The shrine whispers… "The Keeper of Lanterns left willingly — to protect the islands from a greater dark."',
    'An ancient voice breathes… "Five shards. Five islands. Each held a piece of the Keeper\'s final wish."',
    'The light pulses… "The Keeper asked one thing: find someone who still believes in warmth. You came."',
    '', // Island 4 — lore delivered by Ancient Keeper NPC already
  ];

  const restoreLines = [
    `✦ ${island.name} restored!` +
    (loreDrops[currentIslandId] ? ' ' + loreDrops[currentIslandId] : ''),
  ];

  showDialogue('Restoration!', restoreLines, () => {
    if (currentIslandId + 1 < ISLANDS.length) {
      ISLANDS[currentIslandId+1].unlocked = true;
      showDialogue('Map Updated', [`New island unlocked: ${ISLANDS[currentIslandId+1].name}!`], null);
    } else {
      triggerWin();
    }
  });
}

// ── Win Sequence ──────────────────────────────────────────────
function triggerWin() {
  state = 'win';
  sfxWin();
  particles.addRestorationBurst(0, 2, 0);
  setTimeout(() => particles.addRestorationBurst(0, 2, 0), 400);
  setTimeout(() => particles.addRestorationBurst(0, 2, 0), 800);
  // Flash white then reveal win screen
  const flash = document.getElementById('restore-flash');
  flash.style.transition = 'none'; flash.style.opacity = '1';
  setTimeout(() => {
    flash.style.transition = 'opacity 1.2s ease';
    flash.style.opacity = '0';
    document.getElementById('win-epilogue').textContent =
      'The prophecy is fulfilled. The Lantern Bearer — once a child who wandered ' +
      'into a fading world — has relit the heart of the Archipelago. ' +
      'Six islands remember warmth. Six shrines sing. ' +
      'And somewhere above, the Guardian Star smiles back at the light below.';
    document.getElementById('win-screen').style.display = 'flex';
    showHUD(false);
    startWinStarfield();
  }, 120);
}

function startWinStarfield() {
  const canvas = document.getElementById('win-stars');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const stars = Array.from({length: 180}, () => ({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
    r: Math.random() * 1.8 + 0.4, speed: Math.random() * 0.4 + 0.1,
    twinkle: Math.random() * Math.PI * 2
  }));
  let running = true;
  function drawStars(t) {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
      s.twinkle += s.speed * 0.04;
      const alpha = 0.5 + Math.sin(s.twinkle) * 0.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(235,178,26,${alpha})`; ctx.fill();
    });
    requestAnimationFrame(drawStars);
  }
  drawStars(0);
  document.getElementById('restart-btn').addEventListener('click', () => { running = false; }, { once: true });
}

// ── Camera Shake (Cycle 6) ────────────────────────────────────
let cameraShake = { active: false, intensity: 0, duration: 0, elapsed: 0 };
function triggerCameraShake(intensity, duration) {
  cameraShake.active = true;
  cameraShake.intensity = intensity;
  cameraShake.duration = duration;
  cameraShake.elapsed = 0;
}

// ── Biome Weather Particles (Cycle 1) ─────────────────────────
let weatherTimer = 0;
const BIOME_WEATHER = [
  null,                    // 0 Mossy Forest — handled by existing fireflies
  { type:'foam', color:0xCCEEFF, rate:2.2 },  // 1 Sunflower Beach — sea foam
  { type:'petals', color:0xFFBBDD, rate:1.8 }, // 2 Sakura Cove — petals
  { type:'embers', color:0xFFCC88, rate:1.5 }, // 3 Cozy Village — warm embers
  { type:'spores', color:0xBBAAFF, rate:2.0 }, // 4 Crystal Cave — spores
  { type:'seeds', color:0xC8D8FF, rate:1.6 },  // 5 Lavender Highlands — seed fluff
];
function spawnWeatherParticle(islandId) {
  const w = BIOME_WEATHER[islandId];
  if (!w || !particles) return;
  const spread = 10;
  const px2 = player ? player.pos.x + (Math.random()-0.5)*spread : (Math.random()-0.5)*spread;
  const pz2 = player ? player.pos.z + (Math.random()-0.5)*spread : (Math.random()-0.5)*spread;
  if (w.type === 'petals' || w.type === 'seeds') {
    particles.addBurst(px2, 3.5, pz2, w.color, 3);
  } else if (w.type === 'foam') {
    particles.addBurst(px2, 0.05, pz2, w.color, 4);
  } else if (w.type === 'embers' || w.type === 'spores') {
    particles.addBurst(px2, 0.5+Math.random()*1.5, pz2, w.color, 2);
  }
}

// ── Ambient Mood Hints (Cycle 15) ─────────────────────────────
const BIOME_HINTS = [
  ["The air smells of pine and damp earth…", "Fireflies once filled this hollow…", "Something ancient stirs beneath the moss…"],
  ["Salt on the breeze. The tide is coming in…", "A distant gull cries out to no one…", "The sand holds the warmth of a thousand days…"],
  ["Cherry blossoms fall even when no wind blows…", "The cove whispers old songs in your ear…", "Something sweet drifts on the sakura air…"],
  ["Smoke from chimneys. Someone baked today…", "A child's laughter echoes from somewhere…", "The cobblestones know every footstep here…"],
  ["Your lantern casts impossible shadows…", "The crystals hum just below hearing…", "Deep in the cave, something gleams…"],
  ["The wind up here carries voices from below…", "Lavender fills your lungs like a slow song…", "The horizon feels closer than it should…"],
];
let hintTimer = 0;
let hintIndex = 0;
function showMoodHint(islandId) {
  const hints = BIOME_HINTS[islandId] || BIOME_HINTS[0];
  const text = hints[hintIndex % hints.length];
  hintIndex++;
  let el = document.getElementById('mood-hint');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mood-hint';
    el.style.cssText = `position:fixed;top:50%;left:24px;transform:translateY(-50%);
      font-family:'Cormorant Garamond',serif;font-size:12px;font-style:italic;
      color:rgba(198,195,220,0.7);pointer-events:none;z-index:200;
      text-shadow:0 1px 6px rgba(0,0,0,0.6);transition:opacity 1.2s ease;opacity:0;
      writing-mode:horizontal-tb;max-width:160px;line-height:1.6;`;
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.opacity = '0'; }, 4000);
}

// ── Compass ───────────────────────────────────────────────────
function drawCompass(island) {
  const cc = document.getElementById('compass-canvas');
  const ctx = cc.getContext('2d');
  const w = cc.width, h = cc.height, cx = w/2, cy = h/2, r = w/2-4;
  ctx.clearRect(0,0,w,h);
  // Background circle
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.fillStyle = PALETTE.warmCream; ctx.fill();
  ctx.strokeStyle = PALETTE.goldenYellow; ctx.lineWidth = 3; ctx.stroke();
  // Simple terrain preview
  ctx.fillStyle = PALETTE.oliveGreen;
  ctx.beginPath(); ctx.ellipse(cx,cy,r*0.55,r*0.45,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#8AAABB';
  ctx.beginPath(); ctx.arc(cx+r*0.3,cy-r*0.15,r*0.18,0,Math.PI*2); ctx.fill();
  // Cardinal directions
  ctx.font = 'bold 10px Nunito,sans-serif'; ctx.fillStyle = PALETTE.deepPlum; ctx.textAlign='center';
  ctx.fillText('N',cx,cy-r+14); ctx.fillText('S',cx,cy+r-4);
  ctx.fillText('E',cx+r-4,cy+4); ctx.fillText('W',cx-r+4,cy+4);
  // Player dot
  ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2);
  ctx.fillStyle = PALETTE.coralRed; ctx.fill();
  // Island perimeter glow — grows brighter as more islands are restored
  if (state === 'playing') {
    const restoredCount = ISLANDS.filter(il => il.restored).length;
    if (restoredCount > 0 && !scene._islandGlowMesh) {
      // Create glow ring on first restoration
      const glowGeo = new THREE.RingGeometry(7.5, 8.5, 48);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xFFDD55, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false
      });
      const glowRing = new THREE.Mesh(glowGeo, glowMat);
      glowRing.rotation.x = -Math.PI / 2;
      glowRing.position.y = 0.08;
      glowRing.renderOrder = 1;
      scene.add(glowRing);
      scene._islandGlowMesh = glowRing;
    }
    if (scene._islandGlowMesh) {
      const restoredCount2 = ISLANDS.filter(il => il.restored).length;
      const targetOpacity = Math.min(restoredCount2 / ISLANDS.length, 1) * 0.55;
      scene._islandGlowMesh.material.opacity += (targetOpacity - scene._islandGlowMesh.material.opacity) * 0.02;
      // Pulse gently
      const pulse = Math.sin(time * 1.2) * 0.07;
      scene._islandGlowMesh.material.opacity = Math.max(0, scene._islandGlowMesh.material.opacity + pulse * (restoredCount2 / ISLANDS.length));
      // Scale ring slightly with progress
      const s = 1 + (ISLANDS.filter(il=>il.restored).length / ISLANDS.length) * 0.4;
      scene._islandGlowMesh.scale.set(s, s, s);
    }
  }

  // Shrine direction arrow (only when shrine not yet restored)
  if (player && island && !island.restored) {
    const pp = player.pos;
    const dx = island.shrinePos.x - pp.x;
    const dz = island.shrinePos.z - pp.z;
    // Isometric camera faces (1,0,1) direction, so map world→compass:
    // compass-right = world +X, compass-up = world -Z
    const angle = Math.atan2(dx, -dz);
    const arrowLen = r * 0.55;
    const ax = cx + Math.sin(angle) * arrowLen;
    const ay = cy - Math.cos(angle) * arrowLen;
    ctx.save();
    ctx.strokeStyle = PALETTE.goldenYellow; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); ctx.stroke();
    // Arrowhead
    ctx.fillStyle = PALETTE.goldenYellow;
    ctx.translate(ax, ay); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(4,2); ctx.lineTo(-4,2); ctx.closePath(); ctx.fill();
    ctx.restore();
    // Shrine star label
    ctx.font = 'bold 9px Nunito,sans-serif'; ctx.fillStyle = PALETTE.goldenYellow;
    ctx.textAlign = 'center'; ctx.fillText('✦', ax, ay - 8);
  }
}

// ── World Map Screen ──────────────────────────────────────────
function drawWorldMap() {
  const mc = document.getElementById('map-canvas');
  // Fit canvas to modal width with 16:6 aspect ratio, DPR-scaled for crispness
  const modal = document.getElementById('map-modal');
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(Math.min(modal.clientWidth - 32, 820), 560);
  const cssH = Math.round(cssW * 6 / 16);
  mc.style.width = cssW + 'px';
  mc.style.height = cssH + 'px';
  mc.width = Math.round(cssW * dpr);
  mc.height = Math.round(cssH * dpr);
  const ctx = mc.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = cssW, H = cssH;
  ctx.clearRect(0,0,W,H);

  // ── Watercolor background ──────────────────────────────────
  // Soft pink-cream gradient
  const bg = ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0, '#fdf0f8');
  bg.addColorStop(0.5, '#f8e8f4');
  bg.addColorStop(1, '#f0e0f0');
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);



  // ── Sequential curving path ────────────────────────────────
  const pts = ISLANDS.map(il=>({x:il.mapPos.x*W, y:il.mapPos.y*H}));

  // Draw bezier rope path (shadow first, then dash)
  ctx.save();
  ctx.lineCap='round'; ctx.lineJoin='round';
  for (let i=0;i<pts.length-1;i++) {
    const a=pts[i], b=pts[i+1];
    const unlocked = ISLANDS[i+1].unlocked;
    // Control points: midpoint offset perpendicular to segment
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    const dx=b.x-a.x, dy=b.y-a.y;
    const len=Math.sqrt(dx*dx+dy*dy)||1;
    // Perpendicular nudge alternates side
    const nudge = (i%2===0?1:-1)*22;
    const cpx=mx - (dy/len)*nudge, cpy=my + (dx/len)*nudge;
    // Shadow
    ctx.setLineDash([]);
    ctx.strokeStyle='rgba(180,100,140,0.12)'; ctx.lineWidth=5;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.quadraticCurveTo(cpx,cpy,b.x,b.y); ctx.stroke();
    // Dashed rope
    ctx.setLineDash([5,8]);
    ctx.strokeStyle = unlocked ? 'rgba(196,112,154,0.65)' : 'rgba(196,112,154,0.22)';
    ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.quadraticCurveTo(cpx,cpy,b.x,b.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  // ── Biome mini-scenes ──────────────────────────────────────
  const R = 38; // island circle radius
  const biomeColors = [
    { base:'#b8e8c0', mid:'#88c898', dark:'#5a9a6a' }, // Mossy Forest
    { base:'#fdf5d0', mid:'#f8e498', dark:'#e8c860' }, // Sunflower Beach
    { base:'#f8c8d8', mid:'#e8a0b8', dark:'#c07090' }, // Sakura Cove
    { base:'#c8d8f8', mid:'#a0b8f0', dark:'#7090d8' }, // Crystal Cave
    { base:'#d8c8f0', mid:'#b8a0e0', dark:'#9070c8' }, // Lavender Highlands
  ];

  ISLANDS.forEach((island, i) => {
    const px=pts[i].x, py=pts[i].y;
    const unlocked=island.unlocked, restored=island.restored;
    const bc=biomeColors[i];
    ctx.save();
    if (!unlocked) ctx.globalAlpha=0.3;

    // Island circle clip
    ctx.beginPath(); ctx.arc(px,py,R,0,Math.PI*2); ctx.clip();

    // Sky gradient
    const sky=ctx.createLinearGradient(px,py-R,px,py+R);
    if (i===4) { sky.addColorStop(0,'#1a1040'); sky.addColorStop(1,'#2a1860'); }
    else { sky.addColorStop(0,'#e8f4ff'); sky.addColorStop(1,bc.base); }
    ctx.fillStyle=sky; ctx.fillRect(px-R,py-R,R*2,R*2);

    // Ground
    ctx.fillStyle=bc.mid;
    ctx.beginPath(); ctx.ellipse(px,py+18,R,20,0,0,Math.PI*2); ctx.fill();

    // Biome-specific details
    if (i===0) {
      // Mossy Forest: 3 green trees
      [[px-14,py+4],[px,py-2],[px+14,py+6]].forEach(([tx,ty])=>{
        ctx.fillStyle='#4a8a5a'; ctx.beginPath(); ctx.arc(tx,ty,9,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#3a7a4a'; ctx.beginPath(); ctx.arc(tx-1,ty-1,7,0,Math.PI*2); ctx.fill();
      });
    } else if (i===1) {
      // Sunflower Beach: water + flowers
      ctx.fillStyle='#88c8e8';
      ctx.beginPath(); ctx.ellipse(px+16,py+10,18,12,0.2,0,Math.PI*2); ctx.fill();
      [[px-18,py+5],[px-6,py+2],[px-24,py+10]].forEach(([fx,fy])=>{
        ctx.fillStyle='#f0c020'; ctx.beginPath(); ctx.arc(fx,fy,5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#e08010'; ctx.beginPath(); ctx.arc(fx,fy,2.5,0,Math.PI*2); ctx.fill();
      });
    } else if (i===2) {
      // Sakura Cove: water + blossom petals
      ctx.fillStyle='#90c8e8';
      ctx.beginPath(); ctx.ellipse(px,py+12,28,15,0,0,Math.PI*2); ctx.fill();
      // Petals drifting
      [[px-12,py-8,'#f8b0c8'],[px+8,py-4,'#f8c8d8'],[px-4,py-14,'#e890b0'],
       [px+16,py-10,'#f8b0c8'],[px-18,py+2,'#f8d0e0']].forEach(([bx,by,col])=>{
        ctx.fillStyle=col; ctx.beginPath();
        ctx.ellipse(bx,by,4,2.5,Math.random()*Math.PI,0,Math.PI*2); ctx.fill();
      });
    } else if (i===3) {
      // Cozy Village: house shapes
      [[px-12,py+2],[px+10,py+4]].forEach(([hx,hy])=>{
        ctx.fillStyle='#f0e0c8'; ctx.fillRect(hx-6,hy-6,12,10);
        ctx.fillStyle='#c07858'; ctx.beginPath();
        ctx.moveTo(hx-8,hy-6); ctx.lineTo(hx,hy-14); ctx.lineTo(hx+8,hy-6); ctx.fill();
      });
      // Path
      ctx.strokeStyle='#d4b890'; ctx.lineWidth=2.5; ctx.setLineDash([3,4]);
      ctx.beginPath(); ctx.moveTo(px-12,py+14); ctx.lineTo(px+12,py+14); ctx.stroke();
      ctx.setLineDash([]);
    } else if (i===4) {
      // Crystal Cave: dark cave + glowing crystals
      ctx.fillStyle='#180e30';
      ctx.beginPath(); ctx.arc(px,py,R,0,Math.PI*2); ctx.fill();
      [[px-10,py+4,'#a0b8f8'],[px+4,py-4,'#c8a0f0'],[px+14,py+8,'#80a8e8'],
       [px-2,py+10,'#e0c8ff'],[px-16,py-4,'#b0c0ff']].forEach(([cx2,cy2,col])=>{
        ctx.fillStyle=col;
        ctx.shadowColor=col; ctx.shadowBlur=8;
        ctx.beginPath();
        ctx.moveTo(cx2,cy2-7); ctx.lineTo(cx2+3,cy2+3); ctx.lineTo(cx2-3,cy2+3); ctx.closePath();
        ctx.fill(); ctx.shadowBlur=0;
      });
    } else {
      // Lavender Highlands: hills + windmill dots
      ctx.fillStyle='#c8b0e0';
      ctx.beginPath(); ctx.ellipse(px-10,py+8,22,16,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#b898d0';
      ctx.beginPath(); ctx.ellipse(px+14,py+12,18,13,0,0,Math.PI*2); ctx.fill();
      // Lavender dots
      [[px-14,py],[px-6,py-4],[px+2,py-2],[px+10,py-6]].forEach(([lx,ly])=>{
        ctx.fillStyle='#9070c0'; ctx.beginPath(); ctx.arc(lx,ly,2.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#b090e0'; ctx.beginPath(); ctx.arc(lx,ly-4,2,0,Math.PI*2); ctx.fill();
      });
    }

    ctx.restore(); // end clip

    // Circle border
    ctx.save();
    if (!unlocked) ctx.globalAlpha=0.35;
    if (restored) {
      ctx.shadowColor='rgba(235,178,26,0.7)'; ctx.shadowBlur=12;
      ctx.strokeStyle='rgba(235,178,26,0.9)'; ctx.lineWidth=2.5;
    } else {
      ctx.strokeStyle=unlocked?'rgba(196,112,154,0.7)':'rgba(196,112,154,0.3)';
      ctx.lineWidth=2;
    }
    ctx.beginPath(); ctx.arc(px,py,R,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0;
    ctx.restore();

    // Current island indicator
    if (i===currentIslandId) {
      ctx.save();
      ctx.strokeStyle='rgba(235,178,26,0.95)'; ctx.lineWidth=2.5;
      ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.arc(px,py,R+6,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    // Lock icon
    if (!unlocked) {
      ctx.save(); ctx.globalAlpha=0.55;
      ctx.font='16px sans-serif'; ctx.textAlign='center';
      ctx.fillText('🔒',px,py+6);
      ctx.restore();
    }

    // Island name label below circle
    ctx.save();
    ctx.globalAlpha = unlocked ? 1 : 0.35;
    ctx.font = '600 10px Quicksand,sans-serif';
    ctx.fillStyle = '#7A3D6A';
    ctx.textAlign = 'center';
    // Wrap long names
    const words = island.name.split(' ');
    if (words.length <= 2) {
      ctx.fillText(island.name, px, py+R+14);
    } else {
      ctx.fillText(words.slice(0,2).join(' '), px, py+R+13);
      ctx.fillText(words.slice(2).join(' '), px, py+R+24);
    }
    ctx.restore();
  });


}

// ── Input ─────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  const wasDown = keys[k];
  keys[k] = true;
  if (state === 'title') return;
  if (state === 'dialogue') {
    e.preventDefault();
    if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; currentLine = currentFullLine; dialogueText.innerHTML = formatDialogueLine(currentFullLine); dialogueContinue.style.display='block'; return; }
    if (!wasDown && dialogueContinue.style.display !== 'none') advanceDialogue();
    return;
  }
  if (state === 'playing') {
    if (!wasDown && k === 'tab') { e.preventDefault(); openMap(); return; }
  }
  if (state === 'map') {
    if (!wasDown && (k === 'm' || k === 'tab' || k === 'escape')) { e.preventDefault(); closeMap(); }
  }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function handleInteract() {
  if (!player) return;
  // Ensure audio is initialized on first interaction
  if (!audioReady) { initAudio(); audioReady = true; startExploreMusic(); }
  const island = getIsland(currentIslandId);
  const pp = player.pos;

  // Check shrine
  const sd = Math.sqrt((pp.x-island.shrinePos.x)**2+(pp.z-island.shrinePos.z)**2);
  if (sd < 1.2) { activateShrine(); return; }

  // Check NPCs
  for (let ni = 0; ni < npcMeshes.length; ni++) {
    const nm = npcMeshes[ni];
    const d = pp.distanceTo(nm.position);
    if (d < 1.4) {
      const npc = island.npcs[ni];
      handleNPCInteract(npc, ni); return;
    }
  }

  // Check collectibles (quest items)
  for (let i = islandMeshes.length-1; i >= 0; i--) {
    const m = islandMeshes[i];
    if (!m.userData.collectibleType) continue;
    const d = pp.distanceTo(m.position);
    if (d < 1.2) {
      const ctype = m.userData.collectibleType;
      if (!inventoryItems.includes(ctype)) {
        inventoryItems.push(ctype);
        const island = getIsland(currentIslandId);
        const col = (island.collectibles||[]).find(c=>c.type===ctype);
        const label = col ? col.label : ctype;
        showDialogue('Found', [`You picked up: ${label}. Bring it to the right person.`], null);
        scene.remove(m);
        islandMeshes.splice(i, 1);
        updateInventoryUI();
      }
      return;
    }
  }

  // Check crystals — always collectable
  for (let i = crystalMeshes.length-1; i >= 0; i--) {
    const cm = crystalMeshes[i];
    if (pp.distanceTo(cm.position) < 1.0) { collectCrystal(cm); return; }
  }

}

// Quest collectible type → inventory key mapping
const QUEST_ITEM_MAP = {
  find_cat:       'mochi',
  fetch_water:    'water_jar',
  find_shell:     'shell',
  fetch_note:     'driftwood_note',
  gather_petals:  'petal_bundle',
  fetch_spring:   'spring_water',
  fetch_glowstone:'glowstone',
  use_dust:       'crystal_dust',
  find_chime:     'wind_chime',
  offer_flower:   'highland_flower',
};
// Quest types that are "elder" gated (require other quests done first)
const ELDER_QUEST_TYPES = new Set([
  'elder_final','beach_elder','sakura_elder','cave_elder','highlands_elder'
]);
// "Find firefly" on Mossy Forest is auto-gated (no collectible, just talk-to-complete)
const TALK_QUEST_TYPES = new Set([]);

function handleNPCInteract(npc, ni) {
  const island = getIsland(currentIslandId);
  // Mark this NPC as met so they start facing the player
  const npcMesh = npcMeshes.find(m => m.userData.npcIdx === ni);
  if (npcMesh) npcMesh.userData.metPlayer = true;
  if (island.restored) { showDialogue(npc.name, [npc.restoredLine], null); return; }

  if (!npc.quest) { showDialogue(npc.name, npc.lines, null); return; }

  const qt = npc.quest.type;

  // Already completed this quest
  if (questState[qt] || npc.quest.done) {
    showDialogue(npc.name, [npc.restoredLine || "Thanks again for your help!"], null);
    return;
  }

  // Elder-type: requires prerequisite quests
  if (ELDER_QUEST_TYPES.has(qt)) {
    const reqs = npc.quest.requires || [];
    const allDone = reqs.every(r => questState[r]);
    if (!allDone) {
      const missing = reqs.filter(r => !questState[r]);
      const questNames = { find_shell:'find Sandy\'s shell', fetch_note:'fetch the driftwood note',
        gather_petals:'gather petals', fetch_spring:'fetch spring water',
        fetch_glowstone:'find the glowstone', use_dust:'use the crystal dust',
        find_chime:'find the wind chime', offer_flower:'offer the highland flower' };
      const missingStr = missing.map(r => questNames[r] || r).join(' and ');
      showDialogue(npc.name, [`You still need to: ${missingStr}.`], null);
      return;
    }
    showDialogue(npc.name, npc.lines, () => {
      npc.quest.done = true;
      questState[qt] = true;
      spawnQuestCrystal(player ? player.pos.x : npc.x, player ? player.pos.z : npc.z, npc.quest.reward);
      updateQuestTracker(currentIslandId);
    });
    return;
  }

  // Talk-to-complete quests (no collectible needed)
  if (TALK_QUEST_TYPES.has(qt)) {
    if (!questState[qt]) {
      showDialogue(npc.name, npc.lines, () => {
        questState[qt] = true;
        spawnQuestCrystal(npc.x, npc.z, npc.quest.reward);
        updateQuestTracker(currentIslandId);
      });
    }
    return;
  }

  // Proximity-find quests: talking starts the quest, player must walk to the target
  if (qt === 'find_firefly') {
    if (!questState['find_firefly']) {
      questState['find_firefly_started'] = true;
      updateQuestTracker(currentIslandId);
      showDialogue(npc.name, npc.lines, null);
    } else {
      showDialogue(npc.name, [npc.restoredLine || "The firefly is safe now. Thank you!"], null);
    }
    return;
  }

  // Collectible-delivery quests
  const itemKey = QUEST_ITEM_MAP[qt];
  if (itemKey && inventoryItems.includes(itemKey)) {
    showDialogue(npc.name, ["You brought it! Thank you — take this crystal shard!"], () => {
      questState[qt] = true;
      npc.quest.done = true;
      const idx = inventoryItems.indexOf(itemKey);
      if (idx >= 0) inventoryItems.splice(idx, 1);
      updateInventoryUI();
      spawnQuestCrystal(player ? player.pos.x : npc.x, player ? player.pos.z : npc.z, npc.quest.reward);
      updateQuestTracker(currentIslandId);
    });
  } else {
    showDialogue(npc.name, npc.lines, null);
  }
}

// ── Map ───────────────────────────────────────────────────────
function openMap() {
  sfxClick();
  state = 'map';
  drawWorldMap();
  document.getElementById('map-screen').style.display = 'flex';
}
function closeMap() {
  sfxClick();
  document.getElementById('map-screen').style.display = 'none';
  state = 'playing';
}

function selectIslandFromMap(islandId) {
  if (!ISLANDS[islandId].unlocked) return;
  closeMap();
  loadIsland(islandId);
}

// ── Island Navigation ─────────────────────────────────────────
function loadIsland(id) {
  const overlay = document.getElementById('transition-overlay');
  const banner = document.getElementById('island-banner');
  // Fade to black
  overlay.style.transition = 'opacity 0.35s ease';
  overlay.style.opacity = '1';
  overlay.style.pointerEvents = 'all';
  setTimeout(() => {
    currentIslandId = id;
    questState = getQuestState(id);
    inventoryItems = [];
    player.pos.set(0, 0, 2);
    buildIsland(id);
    setIslandMusic(id);
    sfxIslandArrive();
    const island = getIsland(id);
    // Show island name banner
    // Cycle 7: island banner with biome lore flavor
    const ISLAND_LORE = [
      'Where the fireflies first learned to dream…',
      'The tide keeps every secret you whisper to it…',
      'Petals that fall here never truly touch the ground…',
      'Light lives in the dark, waiting to be found…',
      'Above the clouds, the wind remembers everything…',
    ];
    document.getElementById('island-banner-name').textContent = island.name;
    document.getElementById('island-banner-sub').textContent = ISLAND_LORE[id] || island.mechanic || 'A mysterious isle…';
    banner.classList.add('show');
    // Fade back in
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    setTimeout(() => {
      banner.classList.remove('show');
      showDialogue(island.name, [island.npcs[0].lines[0]], null);
    }, 1800);
    updateQuestTracker(id);
  }, 360);
}

function updateInventoryUI() {
  const slots = [document.getElementById('inv1'), document.getElementById('inv2')];
  slots.forEach((sl, i) => {
    if (!sl) return;
    const item = inventoryItems[i];
    if (!item) { sl.innerHTML = ''; sl.title = ''; return; }
    const island = getIsland(currentIslandId);
    const col = (island.collectibles||[]).find(c=>c.type===item);
    const label = col ? col.label : item;
    sl.title = label;
    // Cycle 12: per-type inventory icons
    const ITEM_ICONS = {
      mochi_cat:      `<text y="17" x="12" text-anchor="middle" font-size="14">🐱</text>`,
      water_jar:      `<text y="17" x="12" text-anchor="middle" font-size="14">🫙</text>`,
      shell:          `<text y="17" x="12" text-anchor="middle" font-size="14">🐚</text>`,
      driftwood_note: `<text y="17" x="12" text-anchor="middle" font-size="14">📜</text>`,
      petal_bundle:   `<text y="17" x="12" text-anchor="middle" font-size="14">🌸</text>`,
      spring_water:   `<text y="17" x="12" text-anchor="middle" font-size="14">💧</text>`,
      glowstone:      `<text y="17" x="12" text-anchor="middle" font-size="14">🔮</text>`,
      crystal_dust:   `<text y="17" x="12" text-anchor="middle" font-size="14">✨</text>`,
      wind_chime:     `<text y="17" x="12" text-anchor="middle" font-size="14">🎐</text>`,
      highland_flower:`<text y="17" x="12" text-anchor="middle" font-size="14">💜</text>`,
    };
    const icon = ITEM_ICONS[item] || `<circle cx="12" cy="12" r="6" fill="#EBB21A" opacity="0.9"/><circle cx="12" cy="12" r="3" fill="#F0DEC2"/>`;
    sl.innerHTML = `<svg viewBox="0 0 24 24" fill="none">${icon}</svg>`;
  });
}

function updateQuestTracker(islandId) {
  const island = getIsland(islandId);
  const tracker = document.getElementById('quest-tracker');
  const list = document.getElementById('quest-list');
  if (!island || !island.npcs) { tracker.style.display = 'none'; return; }
  const quests = island.npcs.filter(n => n.quest).map(n => n.quest);
  if (!quests.length) { tracker.style.display = 'none'; return; }
  const qs = getQuestState(islandId);
  const anyStarted = quests.some(q => qs[q.type] || q.done || qs[q.type + '_started']);
  if (!anyStarted) {
    list.innerHTML = '';
    tracker.style.display = 'block'; return;
  }
  const QUEST_THEMES = {
    find_firefly:      'Find the lost firefly',
    find_shell:        'Collect a spiral shell',
    fetch_note:        'Retrieve the drifting note',
    beach_elder:       'Reunite the beach elder',
    gather_petals:     'Gather fallen petals',
    fetch_spring:      'Fetch spring water',
    sakura_elder:      'Aid the sakura elder',
    find_cat:          'Find Mochi the cat',
    fetch_water:       'Fill the water jar',
    elder_final:       'Help the village elder',
    fetch_glowstone:   'Find the glowstone',
    use_dust:          'Collect crystal dust',
    cave_elder:        'Aid the cave elder',
    find_chime:        'Retrieve the wind chime',
    offer_flower:      'Offer a highland flower',
    highlands_elder:   'Aid the highlands elder',
  };
  list.innerHTML = '';
  island.npcs.filter(n=>n.quest).forEach(npc => {
    const q = npc.quest;
    const done = qs[q.type] || q.done;
    // For proximity quests, only show once started
    // firefly quest always visible on island 0
    const li = document.createElement('li');
    li.textContent = QUEST_THEMES[q.type] || q.type.replace(/_/g,' ');
    if (done) li.classList.add('done');
    else if (q.type === 'find_firefly' && qs['find_firefly_started']) li.style.color = '#E8B830';
    list.appendChild(li);
  });
  tracker.style.display = 'block';
}

// ── Mobile Controls ───────────────────────────────────────────
function setupMobile() {
  if (!isMobile) return;
  // Touch-drag movement: touch anywhere on renderer canvas
  let touchOrigin = null;
  const DEAD = 8; // px dead zone
  renderer.domElement.addEventListener('touchstart', e => {
    // Ignore touches that start on UI elements
    if (e.target !== renderer.domElement) return;
    e.preventDefault();
    const t = e.touches[0];
    touchOrigin = { x: t.clientX, y: t.clientY };
    joystickDir.x = 0; joystickDir.z = 0;
  }, { passive: false });
  renderer.domElement.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!touchOrigin) return;
    const t = e.touches[0];
    const dx = t.clientX - touchOrigin.x;
    const dy = t.clientY - touchOrigin.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < DEAD) { joystickDir.x = 0; joystickDir.z = 0; return; }
    // Normalise and scale — isometric: screen right = +X-Z, screen down = +X+Z
    const scale = Math.min(dist, 80) / 80;
    joystickDir.x = (dx - dy) / dist * scale;
    joystickDir.z = (dx + dy) / dist * scale;
  }, { passive: false });
  renderer.domElement.addEventListener('touchend', e => {
    e.preventDefault();
    touchOrigin = null;
    joystickDir.x = 0; joystickDir.z = 0;

  }, { passive: false });

}

// ── Map click handling ────────────────────────────────────────
function handleMapTap(clientX, clientY, target) {
  if (state !== 'map') return;
  const rect = target.getBoundingClientRect();
  const mx = (clientX - rect.left) / rect.width;
  const my = (clientY - rect.top) / rect.height;
  ISLANDS.forEach((island, i) => {
    const dx = mx - island.mapPos.x, dy = my - island.mapPos.y;
    if (Math.sqrt(dx*dx+dy*dy) < 0.12 && island.unlocked) selectIslandFromMap(i);
  });
}
document.getElementById('map-canvas').addEventListener('click', e => {
  handleMapTap(e.clientX, e.clientY, e.target);
});
document.getElementById('map-canvas').addEventListener('touchend', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  handleMapTap(t.clientX, t.clientY, e.target);
}, { passive: false });

document.getElementById('close-map').addEventListener('click', ()=>{ sfxClick(); closeMap(); });
document.getElementById('map-btn').addEventListener('click', ()=>{ if(state==='playing'||state==='dialogue') openMap(); });
document.getElementById('sound-toggle').addEventListener('click', ()=>{
  const m = toggleMute();
  const waves = document.getElementById('sound-waves');
  if (waves) waves.style.display = m ? 'none' : '';
});
document.getElementById('dialogue-continue').addEventListener('click', e=>{
  e.stopPropagation();
  if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; dialogueText.innerHTML=formatDialogueLine(currentLine); dialogueContinue.style.display='block'; return; }
  advanceDialogue();
});
document.getElementById('dialogue-box').addEventListener('click', ()=>{
  if (state !== 'dialogue') return;
  if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; dialogueText.innerHTML=formatDialogueLine(currentLine); dialogueContinue.style.display='block'; return; }
  if (dialogueContinue.style.display !== 'none') advanceDialogue();
});
document.getElementById('restart-btn').addEventListener('click', ()=>{
  document.getElementById('win-screen').style.display='none';
  ISLANDS.forEach(i=>{ i.unlocked=false; i.restored=false; i.crystalCount=0; i.beamAdded=false; });
  questStateMap = {};
  ISLANDS[0].unlocked=true;
  loadIsland(0); showHUD(true); state='playing';
});

// ── Dev mode ──────────────────────────────────────────────────
document.getElementById('dev-btn').addEventListener('click', () => {
  ISLANDS.forEach(i=>{ i.unlocked=true; i.restored=false; i.crystalCount=0; i.beamAdded=false; });
  questStateMap = {};
  initAudio(); audioReady=true;
  startExploreMusic();
  buildIsland(0);
  document.getElementById('title-screen').style.display='none';
  showHUD(true); state='playing';
  setTimeout(()=>showDialogue('🗺️ Explore Mode', ['All islands unlocked. Open the map to jump anywhere.'], null), 500);
});

// ── Start ─────────────────────────────────────────────────────
let pendingTitleFade = false;
let titleFadeFrames = 0;
document.getElementById('start-btn').addEventListener('click', () => {
  initAudio(); audioReady = true;
  startExploreMusic();
  buildIsland(0);
  state = 'playing';
  showHUD(true);
  pendingTitleFade = true;
  titleFadeFrames = 0;
  setTimeout(()=>showDialogue('✨ Lantern Bearer', [
    'Your golden lantern glows as you step onto the Mossy Forest…',
    'Quests: Find the lost firefly · Collect 5 crystal shards · Restore the shrine.',
  ], null), 350);
});

// ── Resize ────────────────────────────────────────────────────
window.addEventListener('resize', ()=>{
  const w=window.innerWidth, h=window.innerHeight, a=w/h;
  renderer.setSize(w,h);
  camera.left=-camD*a; camera.right=camD*a; camera.top=camD; camera.bottom=-camD;
  camera.updateProjectionMatrix();
  canvas.width=w; canvas.height=h;
});

// ── Main Loop ─────────────────────────────────────────────────
let last = 0;
let time = 0;
particles = new ParticleSystem(scene);
scene.add(new THREE.AmbientLight(0xffffff, 0.3));
// Player created after first island build
const tempScene = new THREE.Scene();
player = new Player(scene);

function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - last) / 1000, 0.05);
  last = ts; time += dt;
  if (state === 'title') { renderer.render(scene, camera); return; }

  // Fade title screen only after island has been rendered for several frames
  if (pendingTitleFade) {
    titleFadeFrames++;
    if (titleFadeFrames >= 5) {
      pendingTitleFade = false;
      const ts = document.getElementById('title-screen');
      ts.style.opacity = '0';
      ts.addEventListener('transitionend', () => { ts.style.display = 'none'; }, { once: true });
    }
  }

  // Player movement
  if (state === 'playing') {
    const island = getIsland(currentIslandId);
    player.update(dt, keys, (joystickDir.x||joystickDir.z) ? joystickDir : null, island.tiles);
    if (player.isMoving && player.footstepTimer <= 0) {
      sfxFootstep();
      player.footstepTimer = 0.28;
      // Cycle 11: biome-specific footstep particles
      const footColors = [0x88AA77, 0xE8DDB5, 0xFFCCDD, 0xBBAAFF, 0xC8D0FF];
      const footY =      [0.05,     0.02,     0.04,     0.06,     0.04];
      const fc = footColors[currentIslandId] || 0xC8B89A;
      const fy = footY[currentIslandId] || 0.05;
      particles.addBurst(player.pos.x, 0.25, player.pos.z, fc, 6);

    }
    // Camera follow
    const tx = player.pos.x+12, ty = 12, tz = player.pos.z+12;
    camera.position.x += (tx - camera.position.x) * 4 * dt;
    camera.position.y += (ty - camera.position.y) * 4 * dt;
    camera.position.z += (tz - camera.position.z) * 4 * dt;
    camera.lookAt(player.pos.x, 0, player.pos.z);

    // Foliage + objects bob + water shimmer + Cycle 14 wind sway
    islandMeshes.forEach(m=>{
      if (m.userData.bobBase !== undefined) {
        m.position.y = m.userData.bobBase + Math.sin(time*1.5+(m.userData.bobOffset||0))*0.03;
      }
      if (m.userData.waterTile) {
        const wt = 0.5 + Math.sin(time * 0.22 + m.userData.waterPhase) * 0.5;
        m.userData.baseMat.opacity = 0.68 + Math.sin(time*1.1 + m.userData.waterPhase)*0.1;
        // Cycle 3: gentle hue oscillation between two water colors
        if (m.userData.waterColorA && m.userData.waterColorB) {
          m.userData.baseMat.color.lerpColors(m.userData.waterColorA, m.userData.waterColorB, wt);
        }
      }
      if (m.userData.bioPool) {
        m.intensity = 0.4 + Math.sin(time*2.3)*0.35;
      }
      // Cycle 14: wind sway for trees and flowers
      if (m.userData.windSway) {
        const wo = m.userData.windOffset || 0;
        m.rotation.z = Math.sin(time * 0.9 + wo) * 0.04;
        m.rotation.x = Math.sin(time * 0.7 + wo * 1.3) * 0.025;
      }
      if (m.userData.spin) {
        m.rotation.y = time * 1.1;
        m.position.y = Math.sin(time * 2.0 + (m.userData.bobOffset||0)) * 0.08 + 0.25;
      }
    });
    // NPC bob + sway + Cycle 2 head-look toward player
    npcMeshes.forEach(m=>{
      const t = time*1.8 + m.userData.bobOffset;
      m.position.y = m.userData.bobBase + Math.sin(t)*0.06;
      m.rotation.z = Math.sin(t*0.7)*0.12;
      // Wander
      if (m.userData.homeX !== undefined) {
        m.userData.wanderTimer -= dt;
        if (m.userData.wanderTimer <= 0) {
          if (!m.userData.wanderActive) {
            const angle = Math.random()*Math.PI*2;
            const dist = 0.6 + Math.random()*0.8;
            m.userData.wanderDx = Math.cos(angle)*dist;
            m.userData.wanderDz = Math.sin(angle)*dist;
            m.userData.wanderActive = true;
            m.userData.wanderTimer = 1.2 + Math.random()*1.0;
          } else {
            m.userData.wanderActive = false;
            m.userData.wanderTimer = 2.0 + Math.random()*2.5;
          }
        }
        if (m.userData.wanderActive) {
          const tx = m.userData.homeX + m.userData.wanderDx;
          const tz = m.userData.homeZ + m.userData.wanderDz;
          const ddx = tx - m.position.x, ddz = tz - m.position.z;
          const spd = 0.6;
          m.position.x += ddx * spd * dt;
          m.position.z += ddz * spd * dt;
          if (Math.abs(ddx) > 0.05 || Math.abs(ddz) > 0.05) {
            m.rotation.y += (Math.atan2(ddx, ddz) - m.rotation.y) * 6 * dt;
          }
        }
      }
      // Animate ! sprite
      if (m.userData.excSprite) {
        const sp = m.userData.excSprite;
        sp.position.y = sp.userData.excBase + Math.sin(time*3 + sp.userData.excOffset)*0.07;
        sp.material.opacity = 0.75 + Math.sin(time*3 + sp.userData.excOffset)*0.25;
      }
      // Cycle 2: NPC faces player when nearby (rotate whole group toward player)
      if (player && m.userData.metPlayer) {
        const dx = player.pos.x - m.position.x, dz = player.pos.z - m.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < 2.8) {
          const targetAngle = Math.atan2(dx, dz);
          m.rotation.y += (targetAngle - m.rotation.y) * 3 * dt;
        }
      }
    });
    // Crystal bob + glow pulse
    crystalMeshes.forEach(m=>{
      m.position.y = m.userData.bobBase + Math.sin(time*2.2)*0.06;
      m.material.emissiveIntensity = 0.5 + Math.sin(time*2)*0.2;
      m.rotation.y += dt * 0.8;
    });
    // Shrine pulse
    if (shrineMesh) {
      shrineMesh.rotation.y += dt * 0.4;
      shrineMesh.position.y = 0.3 + Math.sin(time*1.4)*0.03;
    }
    // Shrine beam pulse
    if (shrinBeamMesh) {
      shrinBeamMesh.material.opacity = 0.25 + Math.sin(time * 2.5) * 0.15;
      shrinBeamMesh.rotation.y += dt * 0.3;
    }
    if (shrineBeamLight) {
      shrineBeamLight.intensity = 2.0 + Math.sin(time * 3) * 0.8;
    }
    // Cycle 1: Biome weather particles
    weatherTimer += dt;
    const bw = BIOME_WEATHER[currentIslandId];
    if (bw && weatherTimer > 1 / bw.rate) { weatherTimer = 0; spawnWeatherParticle(currentIslandId); }

    // Cycle 15: Ambient mood hints
    hintTimer += dt;
    if (hintTimer > 38) { hintTimer = 0; showMoodHint(currentIslandId); }

    // Cycle 9: Sky color breathing — subtle background oscillation per biome
    const SKY_BASES = [0x1a1f2e, 0x1a2540, 0x1f1a2e, 0x1a1810, 0x0d0d1a, 0x121828];
    const skyBase = SKY_BASES[currentIslandId] || 0x1a1f2e;
    const sb = new THREE.Color(skyBase);
    const breathe = Math.sin(time * 0.18) * 0.012;
    scene.background.setRGB(sb.r + breathe, sb.g + breathe * 0.7, sb.b + breathe * 0.5);

    // Cycle 13: Shrine proximity lantern glow pulse
    if (shrineMesh && player) {
      const island = getIsland(currentIslandId);
      const sdx = player.pos.x - island.shrinePos.x, sdz = player.pos.z - island.shrinePos.z;
      const sdist = Math.sqrt(sdx*sdx + sdz*sdz);
      if (!island.restored && sdist < 5) {
        const prox = 1 - sdist / 5;
        if (shrineBeamLight) shrineBeamLight.intensity = 2.0 + prox * 2.5 + Math.sin(time * 3) * 0.8;
      }
    }

    // Cycle 6: Camera shake application
    if (cameraShake.active) {
      cameraShake.elapsed += dt;
      if (cameraShake.elapsed >= cameraShake.duration) {
        cameraShake.active = false;
      } else {
        const decay = 1 - cameraShake.elapsed / cameraShake.duration;
        camera.position.x += (Math.random() - 0.5) * cameraShake.intensity * decay;
        camera.position.y += (Math.random() - 0.5) * cameraShake.intensity * decay * 0.5;
        camera.position.z += (Math.random() - 0.5) * cameraShake.intensity * decay;
      }
    }

    // Pulse reveal timer
    if (pulseRevealTimer > 0) pulseRevealTimer -= dt;
    // compass removed
  }

  // Firefly auto-collect on proximity (no button press needed)
  if (state === 'playing' && player && fireflyTargetMesh && !questState['find_firefly']) {
    const ff = fireflyTargetMesh;
    const fdx = player.pos.x - ff.position.x, fdz = player.pos.z - ff.position.z;
    if (Math.sqrt(fdx*fdx + fdz*fdz) < 0.4) {
      questState['find_firefly'] = true;
      questState['find_firefly_started'] = true;
      scene.remove(ff);
      const fi = islandMeshes.indexOf(ff);
      if (fi >= 0) islandMeshes.splice(fi, 1);
      fireflyTargetMesh = null;
      spawnQuestCrystal(0, 3, 4);
      updateQuestTracker(currentIslandId);
      showDialogue('Firefly', ['✨ The lost firefly drifts toward your lantern happily!'], null);
      particles.addBurst(player.pos.x, 0.8, player.pos.z, 0xFFFF88, 30);
      particles.addPulseRing(player.pos.x, 0.1, player.pos.z, 0xFFFF44, 1.2);
    }
  }

  // ── Auto-proximity interactions ──────────────────────────────
  if (state === 'playing' && player) {
    const pp = player.pos;
    const island = getIsland(currentIslandId);

    // Crystals: auto-collect (XZ distance only — crystals float above y=0)
    for (let i = crystalMeshes.length - 1; i >= 0; i--) {
      const cp = crystalMeshes[i].position;
      if (Math.hypot(pp.x - cp.x, pp.z - cp.z) < 0.35) {
        collectCrystal(crystalMeshes[i]); break;
      }
    }

    // Collectibles: auto-pickup
    for (let i = islandMeshes.length - 1; i >= 0; i--) {
      const m = islandMeshes[i];
      if (!m.userData.collectibleType) continue;
      if (Math.hypot(pp.x - m.position.x, pp.z - m.position.z) < 0.35) {
        const ctype = m.userData.collectibleType;
        if (!inventoryItems.includes(ctype)) {
          inventoryItems.push(ctype);
          const col = (island.collectibles || []).find(c => c.type === ctype);
          const label = col ? col.label : ctype;
          showDialogue('Found', [`You picked up: ${label}. Bring it to the right person.`], null);
          scene.remove(m); islandMeshes.splice(i, 1);
          updateInventoryUI();
        }
        break;
      }
    }

    // NPCs: auto-dialogue on approach; resets when player walks away so re-trigger works
    npcMeshes.forEach((nm, ni) => {
      const dist = Math.hypot(pp.x - nm.position.x, pp.z - nm.position.z);
      if (dist < 0.38 && !nm.userData.autoTriggered && state === 'playing') {
        nm.userData.autoTriggered = true;
        handleNPCInteract(island.npcs[ni], ni);
      } else if (dist > 0.75) {
        nm.userData.autoTriggered = false;
      }
    });

    // Shrine: auto-activate on approach
    const sd = Math.sqrt((pp.x - island.shrinePos.x) ** 2 + (pp.z - island.shrinePos.z) ** 2);
    if (sd < 0.38 && !island._shrineAutoTriggered && state === 'playing') {
      island._shrineAutoTriggered = true;
      activateShrine();
    } else if (sd > 0.75) {
      island._shrineAutoTriggered = false;
    }
  }

  particles.update(dt);
  renderer.render(scene, camera);
}

setupMobile();
requestAnimationFrame(loop);
