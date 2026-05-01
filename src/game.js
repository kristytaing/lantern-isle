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
const isMobile = navigator.maxTouchPoints > 0 || window.innerWidth < 768;
let joystickDir = { x: 0, z: 0 };

// ── Three.js ─────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
canvas.width = window.innerWidth; canvas.height = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.shadowMap.enabled = false;
renderer.setClearColor(0x9B9AE2);

const scene = new THREE.Scene();
const aspect = window.innerWidth / window.innerHeight;
const camD = 10;
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
  document.getElementById('ability-bar').style.display = show ? 'flex' : 'none';
}

// ── Build Island ──────────────────────────────────────────────
function buildIsland(islandId) {
  // Clear previous
  islandMeshes.forEach(m => scene.remove(m));
  crystalMeshes.forEach(m => { if (m.userData.glowLight) scene.remove(m.userData.glowLight); scene.remove(m); });
  npcMeshes.forEach(m => scene.remove(m));
  if (shrineMesh) scene.remove(shrineMesh);

  if (particles) particles.clearAll();
  crystalOrbits = [];
  islandMeshes = []; crystalMeshes = []; npcMeshes = [];
  shrinBeamMesh = null; shrineBeamLight = null;

  const island = getIsland(islandId);
  scene.background = new THREE.Color(island.skyTop);
  scene.fog = new THREE.Fog(island.fogColor, island.fogNear, island.fogFar);

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
    canopy.userData = { bobOffset: Math.random()*Math.PI*2, bobBase: canopy.position.y };
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
    head.userData = { bobOffset: Math.random()*Math.PI*2, bobBase: head.position.y };
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
      else if (r < 0.30) addFlower(tx, tz, 0xF29FD7);
    },
    // 2 Sakura Cove: trees, flowers, lanterns, rocks
    (tx, tz, r) => {
      if (r < 0.11) addTree(tx, tz);
      else if (r < 0.20) addFlower(tx, tz, 0xF29FD7);
      else if (r < 0.24) addLantern(tx, tz);
      else if (r < 0.28) addRock(tx, tz);
    },
    // 3 Cozy Village: flowers, lanterns, trees, mushrooms
    (tx, tz, r) => {
      if (r < 0.10) addLantern(tx, tz);
      else if (r < 0.18) addFlower(tx, tz, 0xF29FD7);
      else if (r < 0.24) addTree(tx, tz);
      else if (r < 0.28) addMushroom(tx, tz);
    },
    // 4 Crystal Cave: crystal spires, rocks, mushrooms
    (tx, tz, r) => {
      if (r < 0.14) addCrystalSpire(tx, tz, 0x9B9AE2);
      else if (r < 0.21) addRock(tx, tz);
      else if (r < 0.27) addMushroom(tx, tz);
      else if (r < 0.30) addCrystalSpire(tx, tz, 0xF29FD7);
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
      ? (islandId === 1 ? 0x9BC8D4 : islandId === 4 ? 0x2A4A6B : 0x8AAABB)
      : island.groundColor;
    // Slight height variation on ground tiles for organic feel
    const yOff = isWater ? -0.18 : (h < 0.3 ? -0.02 : h > 0.85 ? 0.03 : 0);
    const mat = new THREE.MeshLambertMaterial({ color, transparent: isWater, opacity: isWater ? 0.78 : 1 });
    const mesh = new THREE.Mesh(tileGeo, mat);
    mesh.position.set(tile.x, yOff, tile.z);
    // Water tiles get shimmer animation tag
    if (isWater) { mesh.userData.waterTile = true; mesh.userData.waterPhase = h * Math.PI * 2; mesh.userData.baseMat = mat; }
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

  // Cozy Village houses
  if (islandId === 3) {
    const houseSpots = [
      { x: -5, z: -5, wall: 0xF5EAD8, roof: 0xC0785A },
      { x:  5, z: -5, wall: 0xEDE0C8, roof: 0x9B6A50 },
      { x: -6, z:  2, wall: 0xF0E4D0, roof: 0xD4836A },
      { x:  6, z:  2, wall: 0xF5EAD8, roof: 0xB07060 },
      { x:  0, z: -7, wall: 0xEADDC8, roof: 0xC0785A },
    ];
    houseSpots.forEach(h => addHouse(h.x, h.z, h.wall, h.roof));
  }

  // Crystals are NOT spawned at island load — they appear when quests are completed

  // Shrine
  const shrGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.6, 8);
  const shrMat = new THREE.MeshLambertMaterial({ color: PALETTE.goldenYellowN, emissive: 0x886600, emissiveIntensity: 0.3 });
  shrineMesh = new THREE.Mesh(shrGeo, shrMat);
  shrineMesh.position.set(island.shrinePos.x, 0.3, island.shrinePos.z);
  if (island.restored) { shrMat.emissive.set(PALETTE.goldenYellowN); shrMat.emissiveIntensity = 0.7; }
  scene.add(shrineMesh);
  if (island.crystalCount >= island.totalCrystals) addShrineBeam(island);
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
      // Floating label sprite
      const lCanvas = document.createElement('canvas'); lCanvas.width = 128; lCanvas.height = 32;
      const lCtx = lCanvas.getContext('2d');
      lCtx.fillStyle = 'rgba(0,0,0,0.55)'; lCtx.roundRect(2,2,124,28,6); lCtx.fill();
      lCtx.fillStyle = '#fff'; lCtx.font = 'bold 14px sans-serif'; lCtx.textAlign = 'center';
      lCtx.fillText(col.label, 64, 20);
      const lTex = new THREE.CanvasTexture(lCanvas);
      const lSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: lTex, transparent: true, depthTest: false }));
      lSprite.scale.set(0.9, 0.22, 1); lSprite.position.y = 0.75;
      group.add(lSprite);
      scene.add(group); islandMeshes.push(group);
    });
  }

  // NPCs
  island.npcs.forEach((npc, ni) => {
    const nGroup = new THREE.Group();
    nGroup.position.set(npc.x, 0, npc.z);
    nGroup.userData = { npcIdx: ni, bobBase: 0, bobOffset: Math.random()*Math.PI*2 };

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
      const crownMat = new THREE.MeshLambertMaterial({ color: 0xF29FD7 });
      const crown = new THREE.Mesh(crownGeo, crownMat); crown.position.y = 0.73; crown.rotation.x = Math.PI/2;
      const eyeGeo = new THREE.SphereGeometry(0.02, 5, 5);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x2A5C10 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.055, 0.62, 0.12);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.055, 0.62, 0.12);
      const wingGeo = new THREE.SphereGeometry(0.12, 6, 4);
      const wingMat = new THREE.MeshLambertMaterial({ color: 0x9BCE6A, transparent: true, opacity: 0.75 });
      const wingL = new THREE.Mesh(wingGeo, wingMat); wingL.position.set(-0.18, 0.42, -0.08); wingL.scale.set(0.5, 0.9, 0.3);
      const wingR = new THREE.Mesh(wingGeo, wingMat); wingR.position.set(0.18, 0.42, -0.08); wingR.scale.set(0.5, 0.9, 0.3);
      nGroup.add(body, head, crown, eyeL, eyeR, wingL, wingR);

    } else if (npc.name === 'Sprite') {
      // Tiny glowing fairy: small round body, sparkle wings, bright emissive glow
      const bodyGeo = new THREE.SphereGeometry(0.13, 8, 7);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xF29FD7, emissive: 0xCC5599, emissiveIntensity: 0.3 });
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
      nGroup.add(body, core, head, flameC, flameL, flameR, eyeL, eyeR);

    } else if (npc.name === 'Blossom') {
      // Cherry blossom spirit: soft pink body, petal skirt, flower in hair
      const bodyGeo = new THREE.SphereGeometry(0.17, 10, 8);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xF29FD7 });
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
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xF29FD7, transparent: true, opacity: 0.55 });
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
  if (islandId === 4) { // Crystal Cave — extra spores + bioluminescent pool glow
    particles.addAmbientMotes(isMobile?30:60);
    // Bioluminescent pool: pulsing cyan point light
    const poolLight = new THREE.PointLight(0x00FFCC, 0.6, 4);
    poolLight.position.set(0, 0.3, -3);
    poolLight.userData.bioPool = true;
    scene.add(poolLight); islandMeshes.push(poolLight);
  }
  if (islandId === 5) particles.addPetals(isMobile?20:40, PALETTE.softLavenderN);

  updateCrystalHUD();
  drawCompass(island);
}

// ── Dialogue System ───────────────────────────────────────────
const NPC_COLORS = {
  '✨': '#EBB21A', 'Shrine': '#9B9AE2', '✨ Shrine': '#9B9AE2',
  '✨ Restoration!': '#EBB21A', '✨ Map Updated': '#EBB21A',
};
function showDialogue(speaker, lines, callback) {
  if (state === 'dialogue') return;
  state = 'dialogue';
  dialogueQueue = [...lines];
  dialogueCallback = callback || null;
  dialogueSpeaker.textContent = speaker;

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
  updateCrystalHUD();
  if (island.crystalCount >= island.totalCrystals) {
    // Beam of light on shrine
    addShrineBeam(island);
    setTimeout(()=>showDialogue('Shrine', ['All shards gathered! Bring them to the shrine.'], null), 600);
  }
}

// ── Spawn Quest Crystal near NPC ─────────────────────────────
function spawnQuestCrystal(npcX, npcZ) {
  const island = getIsland(currentIslandId);
  // Offset slightly so it doesn't overlap the NPC
  const ox = (Math.random() - 0.5) * 1.2;
  const oz = (Math.random() - 0.5) * 1.2;
  const cx = npcX + ox, cz = npcZ + oz;
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
  particles.addRestorationBurst(island.shrinePos.x, 1, island.shrinePos.z);
  // Screen flash on restoration
  const flash = document.getElementById('restore-flash');
  if (flash) {
    flash.style.transition = 'none'; flash.style.opacity = '0.7';
    setTimeout(() => { flash.style.transition = 'opacity 0.8s ease'; flash.style.opacity = '0'; }, 80);
  }
  // Light up shrine
  if (shrineMesh) { shrineMesh.material.emissiveIntensity = 0.9; }


  // Grant ability
  const abilityMap = ['pulse','sprint','heatWard','whistle','sonar'];
  const abilityNames = ['Lantern Pulse','Sprint','Heat Ward','Whistle','Sonar Echo'];
  const abilityKey = abilityMap[currentIslandId];
  if (abilityKey && player) {
    player.grantAbility(abilityKey);
    updateAbilityBar();
  }

  const loreDrops = [
    'A memory stirs in the light… "The Star did not fall by accident. Someone let it go."',
    'The shrine whispers… "The Keeper of Lanterns left willingly — to protect the islands from a greater dark."',
    'An ancient voice breathes… "Six shards. Six islands. Each held a piece of the Keeper\'s final wish."',
    'The light pulses… "The Keeper asked one thing: find someone who still believes in warmth. You came."',
    'The shrine glows… "The darkness was never the enemy. It was grief. And you answered it with light."',
    '', // Island 5 — lore delivered by Ancient Keeper NPC already
  ];

  const restoreLines = [
    `The ${island.name} shrine awakens!`,
    ...(loreDrops[currentIslandId] ? [loreDrops[currentIslandId]] : []),
    abilityKey ? `New ability: ${abilityNames[currentIslandId]}` : 'The Guardian Star stirs…',
  ];

  showDialogue('Restoration!', restoreLines, () => {
    if (currentIslandId + 1 < ISLANDS.length) {
      ISLANDS[currentIslandId+1].unlocked = true;
      showDialogue('Map Updated', [`New island unlocked: ${ISLANDS[currentIslandId+1].name}. Open the map to navigate.`], null);
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

// ── Ability Bar ───────────────────────────────────────────────
function updateAbilityBar() {
  if (!player) return;
  document.getElementById('ab-pulse').style.display = player.abilities.pulse ? 'flex' : 'none';
  document.getElementById('ab-sprint').style.display = player.abilities.sprint ? 'flex' : 'none';
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
  const ctx = mc.getContext('2d');
  const W = mc.width, H = mc.height;
  ctx.clearRect(0,0,W,H);
  // Parchment background
  ctx.fillStyle = PALETTE.warmCream; ctx.fillRect(0,0,W,H);
  // Decorative border
  ctx.strokeStyle = '#D4836A'; ctx.lineWidth = 6;
  ctx.strokeRect(8,8,W-16,H-16);
  ctx.strokeStyle = '#EB6259'; ctx.lineWidth = 2;
  ctx.strokeRect(14,14,W-28,H-28);
  // Title
  ctx.font = 'bold 28px Nunito,sans-serif'; ctx.fillStyle = PALETTE.deepPlum;
  ctx.textAlign = 'center'; ctx.fillText('✨ World Map ✨', W/2, 44);

  // Draw connections (dotted paths)
  const islandPositions = ISLANDS.map(i=>({x:i.mapPos.x*W, y:i.mapPos.y*H}));
  const connections = [[0,1],[0,2],[1,3],[2,3],[3,4],[3,5],[4,5]];
  ctx.setLineDash([4,8]); ctx.strokeStyle = PALETTE.deepPlum; ctx.lineWidth=1.5; ctx.globalAlpha=0.5;
  connections.forEach(([a,b])=>{
    ctx.beginPath();
    ctx.moveTo(islandPositions[a].x, islandPositions[a].y);
    ctx.lineTo(islandPositions[b].x, islandPositions[b].y);
    ctx.stroke();
  });
  ctx.setLineDash([]); ctx.globalAlpha=1;

  // Per-island map shape drawing helper
  function islandPath(ctx, idx, px, py) {
    ctx.beginPath();
    if (idx === 0) {
      // Mossy Forest: rounded blob (irregular circle)
      ctx.ellipse(px-2, py+2, 44, 36, 0.3, 0, Math.PI*2);
    } else if (idx === 1) {
      // Sunflower Beach: long horizontal strip
      ctx.ellipse(px, py, 58, 22, 0, 0, Math.PI*2);
    } else if (idx === 2) {
      // Sakura Cove: crescent — full circle minus inner bite
      ctx.arc(px, py, 40, 0, Math.PI*2);
    } else if (idx === 3) {
      // Cozy Village: diamond/square rotated 45°
      ctx.moveTo(px, py-38); ctx.lineTo(px+38, py);
      ctx.lineTo(px, py+38); ctx.lineTo(px-38, py);
      ctx.closePath();
    } else if (idx === 4) {
      // Crystal Cave: jagged star-ish polygon
      const spikes = 7, outer = 40, inner = 26;
      for (let s = 0; s < spikes*2; s++) {
        const r2 = s%2===0 ? outer : inner;
        const a = (s/spikes/2)*Math.PI*2 - Math.PI/2;
        s===0 ? ctx.moveTo(px+Math.cos(a)*r2, py+Math.sin(a)*r2)
              : ctx.lineTo(px+Math.cos(a)*r2, py+Math.sin(a)*r2);
      }
      ctx.closePath();
    } else {
      // Lavender Highlands: tall ridge ellipse
      ctx.ellipse(px, py, 26, 50, 0.2, 0, Math.PI*2);
    }
  }

  // Draw islands
  ISLANDS.forEach((island, i) => {
    const px = island.mapPos.x * W, py = island.mapPos.y * H;
    const unlocked = island.unlocked;
    const restored = island.restored;

    ctx.save();
    if (!unlocked) ctx.globalAlpha = 0.38;

    // Island blob — distinct shape per biome
    islandPath(ctx, i, px, py);
    ctx.fillStyle = restored ? new THREE.Color(island.groundColor).getStyle() : '#9B9AE2';
    ctx.fill();
    ctx.strokeStyle = restored ? PALETTE.goldenYellow : PALETTE.softLavender; ctx.lineWidth = 2; ctx.stroke();

    // Glow if restored
    if (restored) {
      ctx.shadowColor = PALETTE.goldenYellow; ctx.shadowBlur = 14;
      islandPath(ctx, i, px, py);
      ctx.strokeStyle = PALETTE.goldenYellow; ctx.lineWidth=2; ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Lock icon if locked
    if (!unlocked) {
      ctx.font='18px sans-serif'; ctx.fillStyle=PALETTE.deepPlum; ctx.textAlign='center';
      ctx.fillText('🔒',px,py+6);
    }
    ctx.restore();

    // Island name
    ctx.font = 'bold 11px Nunito,sans-serif'; ctx.fillStyle = PALETTE.deepPlum;
    ctx.textAlign='center'; ctx.globalAlpha = unlocked?1:0.4;
    ctx.fillText(island.name, px, py+50);
    ctx.globalAlpha=1;
  });

  // Compass rose (bottom-right)
  const crx = W-52, cry = H-52;
  ctx.font='bold 13px sans-serif'; ctx.fillStyle=PALETTE.goldenYellow;
  ctx.textAlign='center';
  ctx.fillText('✦',crx,cry);
  ctx.font='bold 10px Nunito,sans-serif'; ctx.fillStyle=PALETTE.deepPlum;
  ctx.fillText('N',crx,cry-18); ctx.fillText('S',crx,cry+22);
  ctx.fillText('E',crx+20,cry+4); ctx.fillText('W',crx-20,cry+4);
}

// ── Input ─────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  const wasDown = keys[k];
  keys[k] = true;
  if (state === 'title') return;
  if (state === 'dialogue') {
    if (k === 'e' || k === ' ' || k === 'enter') {
      e.preventDefault();
      if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; currentLine = currentFullLine; dialogueText.innerHTML = formatDialogueLine(currentFullLine); dialogueContinue.style.display='block'; return; }
      if (!wasDown && dialogueContinue.style.display !== 'none') advanceDialogue();
    }
    return;
  }
  if (state === 'playing') {
    if (!wasDown && (k === 'm' || k === 'tab')) { e.preventDefault(); openMap(); return; }
    if (!wasDown && (k === ' ' || k === 'enter' || k === 'e')) { e.preventDefault(); handleInteract(); }
    if (!wasDown && k === 'q') { activatePulseAbility(); }
    if (!wasDown && k === 'shift') { if(player && player.activateSprint()) { const pp=player.pos; particles.addBurst(pp.x,0.5,pp.z,0xEBB21A,12); particles.addPulseRing(pp.x,0,pp.z); } }
  }
  if (state === 'map') {
    if (!wasDown && (k === 'm' || k === 'tab' || k === 'escape')) { e.preventDefault(); closeMap(); }
  }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function handleInteract() {
  if (!player || !audioReady) return;
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

  // Check crystals — only collectible after all quests on this island are done
  const island2 = getIsland(currentIslandId);
  const islandQuests = island2.npcs.filter(n=>n.quest);
  const questsDone = islandQuests.length === 0 || islandQuests.every(n=>n.quest.done || questState[n.quest.type]);
  for (let i = crystalMeshes.length-1; i >= 0; i--) {
    const cm = crystalMeshes[i];
    const d = pp.distanceTo(cm.position);
    if (d < 1.0) {
      if (!questsDone) {
        showDialogue('Crystal', ['The shard is sealed by the island\'s spirit. Help the islanders first.'], null);
        return;
      }
      collectCrystal(cm); return;
    }
  }

  activatePulseAbility();
}

function activatePulseAbility() {
  if (!player || !player.abilities.pulse) return;
  const pp = player.pos;
  if (player.activatePulse()) {
    sfxLanternPulse();
    particles.addBurst(pp.x, 0.5, pp.z, PALETTE.goldenYellowN, 20);
    particles.addPulseRing(pp.x, 0, pp.z);
    pulseRevealTimer = 3;
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
const TALK_QUEST_TYPES = new Set(['find_firefly']);

function handleNPCInteract(npc, ni) {
  const island = getIsland(currentIslandId);
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
      showDialogue(npc.name, [npc.lines[0]], null);
      return;
    }
    showDialogue(npc.name, npc.lines, () => {
      npc.quest.done = true;
      questState[qt] = true;
      spawnQuestCrystal(npc.x, npc.z);
      updateQuestTracker(currentIslandId);
    });
    return;
  }

  // Talk-to-complete quests (no collectible needed)
  if (TALK_QUEST_TYPES.has(qt)) {
    if (!questState[qt]) {
      showDialogue(npc.name, npc.lines, () => {
        questState[qt] = true;
        spawnQuestCrystal(npc.x, npc.z);
        updateQuestTracker(currentIslandId);
      });
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
      spawnQuestCrystal(npc.x, npc.z);
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
    player.pos.set(0, 0, 2);
    buildIsland(id);
    updateAbilityBar();
    setIslandMusic(id);
    sfxIslandArrive();
    const island = getIsland(id);
    // Show island name banner
    document.getElementById('island-banner-name').textContent = island.name;
    document.getElementById('island-banner-sub').textContent = island.mechanic || 'A mysterious isle…';
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
    // Simple dot indicator — item present
    sl.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6" fill="#EBB21A" opacity="0.9"/><circle cx="12" cy="12" r="3" fill="#F0DEC2"/></svg>`;
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
  list.innerHTML = '';
  island.npcs.filter(n=>n.quest).forEach(npc => {
    const q = npc.quest;
    const done = qs[q.type] || q.done;
    const li = document.createElement('li');
    li.textContent = `${npc.name}: ${npc.lines[0].split('.')[0].substring(0,38)}…`;
    if (done) li.classList.add('done');
    list.appendChild(li);
  });
  tracker.style.display = 'block';
}

// ── Mobile Controls ───────────────────────────────────────────
function setupMobile() {
  if (!isMobile) return;
  document.getElementById('mobile-controls').style.display = 'block';
  const zone = document.getElementById('joystick-zone');
  const knob = document.getElementById('joystick-knob');
  const actionBtn = document.getElementById('action-btn');
  let origin = null;
  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    origin = {x:t.clientX, y:t.clientY};
  }, {passive:false});
  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!origin) return;
    const t = e.touches[0];
    const dx = t.clientX - origin.x, dy = t.clientY - origin.y;
    const dist = Math.min(Math.sqrt(dx*dx+dy*dy), 40);
    const angle = Math.atan2(dy, dx);
    knob.style.transform = `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px))`;
    // Isometric input mapping
    // Isometric camera faces +X+Z. Screen right = world +X-Z, screen down = world +X+Z
    joystickDir.x = (dx - dy) / 40;
    joystickDir.z = (dx + dy) / 40;
  }, {passive:false});
  zone.addEventListener('touchend', () => {
    origin = null; joystickDir.x=0; joystickDir.z=0;
    knob.style.transform = 'translate(-50%,-50%)';
  });
  actionBtn.addEventListener('touchstart', e=>{ e.preventDefault(); handleInteract(); }, {passive:false});
}

// ── Map click handling ────────────────────────────────────────
document.getElementById('map-canvas').addEventListener('click', e => {
  if (state !== 'map') return;
  const rect = e.target.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width;
  const my = (e.clientY - rect.top) / rect.height;
  ISLANDS.forEach((island, i) => {
    const dx = mx - island.mapPos.x, dy = my - island.mapPos.y;
    if (Math.sqrt(dx*dx+dy*dy) < 0.10 && island.unlocked) selectIslandFromMap(i);
  });
});

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
  ISLANDS.forEach(i=>{ i.unlocked=false; i.restored=false; i.crystalCount=0; });
  questStateMap = {};
  ISLANDS[0].unlocked=true;
  loadIsland(0); showHUD(true); state='playing';
});

// ── Dev mode ──────────────────────────────────────────────────
document.getElementById('dev-btn').addEventListener('click', () => {
  ISLANDS.forEach(i=>{ i.unlocked=true; i.restored=false; i.crystalCount=0; });
  questStateMap = {};
  initAudio(); audioReady=true;
  startExploreMusic();
  buildIsland(0);
  document.getElementById('title-screen').style.display='none';
  showHUD(true); state='playing';
  setTimeout(()=>showDialogue('🛠️ Dev Mode', ['All islands unlocked. Use the map (M) to jump to any island.'], null), 500);
});

// ── Title screen reset ────────────────────────────────────────
document.getElementById('reset-btn').addEventListener('click', () => {
  ISLANDS.forEach(i=>{ i.unlocked=false; i.restored=false; i.crystalCount=0; });
  questStateMap = {};
  ISLANDS[0].unlocked=true;
  document.getElementById('title-screen').style.display='none';
  initAudio(); audioReady = true;
  startExploreMusic();
  showHUD(true);
  state='playing';
  buildIsland(0);
  setTimeout(()=>showDialogue('✨ Lantern Bearer', [
    'Your golden lantern glows as you step onto the Mossy Forest…',
    'Five crystal shards hide on this island. Find them, then bring them to the shrine!',
    'Press Space near objects to interact. M to open your map. Good luck!'
  ], null), 800);
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
    'Five crystal shards hide on this island. Find them, then bring them to the shrine!',
    'Press Space near objects to interact. M to open your map. Good luck!'
  ], null), 1200);
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
      particles.addBurst(player.pos.x, 0.05, player.pos.z, 0xC8B89A, 5);
    }
    // Camera follow
    const tx = player.pos.x+12, ty = 12, tz = player.pos.z+12;
    camera.position.x += (tx - camera.position.x) * 4 * dt;
    camera.position.y += (ty - camera.position.y) * 4 * dt;
    camera.position.z += (tz - camera.position.z) * 4 * dt;
    camera.lookAt(player.pos.x, 0, player.pos.z);

    // Foliage + objects bob + water shimmer
    islandMeshes.forEach(m=>{
      if (m.userData.bobBase !== undefined) {
        m.position.y = m.userData.bobBase + Math.sin(time*1.5+(m.userData.bobOffset||0))*0.03;
      }
      if (m.userData.waterTile) {
        m.userData.baseMat.opacity = 0.68 + Math.sin(time*1.1 + m.userData.waterPhase)*0.1;
      }
      if (m.userData.bioPool) {
        m.intensity = 0.4 + Math.sin(time*2.3)*0.35;
      }
    });
    // NPC bob + sway
    npcMeshes.forEach(m=>{
      const t = time*1.8 + m.userData.bobOffset;
      m.position.y = m.userData.bobBase + Math.sin(t)*0.06;
      m.rotation.z = Math.sin(t*0.7)*0.12;
      // Animate ! sprite
      if (m.userData.excSprite) {
        const sp = m.userData.excSprite;
        sp.position.y = sp.userData.excBase + Math.sin(time*3 + sp.userData.excOffset)*0.07;
        sp.material.opacity = 0.75 + Math.sin(time*3 + sp.userData.excOffset)*0.25;
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
    // Pulse reveal timer
    if (pulseRevealTimer > 0) pulseRevealTimer -= dt;
    // compass removed
    // Ability cooldown HUD
    const cdSprint = document.querySelector('#ab-sprint .ability-cooldown');
    if (cdSprint) cdSprint.style.transform = `scaleY(${Math.max(0, player.sprintCooldown/4)})`;
    const cdPulse = document.querySelector('#ab-pulse .ability-cooldown');
    if (cdPulse) cdPulse.style.transform = `scaleY(${Math.max(0, player.pulseCooldown/5)})`;
  }

  // Proximity prompt (crystals / NPCs / shrine)
  if (state === 'playing' && player) {
    const pp = player.pos;
    let promptTarget = null, promptLabel = 'Space';
    const island = getIsland(currentIslandId);
    const sd = Math.sqrt((pp.x-island.shrinePos.x)**2+(pp.z-island.shrinePos.z)**2);
    if (sd < 1.2) { promptTarget = shrineMesh; promptLabel = island.restored ? 'Shrine ✦' : 'Shrine'; }
    npcMeshes.forEach((nm, ni) => {
      if (pp.distanceTo(nm.position) < 1.4) { promptTarget = nm; promptLabel = island.npcs[ni].name; }
    });
    crystalMeshes.forEach(cm => {
      if (pp.distanceTo(cm.position) < 1.0) { promptTarget = cm; promptLabel = '✦ Crystal'; }
    });
    const promptEl = document.getElementById('interact-prompt');
    if (promptTarget) {
      const worldPos = promptTarget.position.clone();
      worldPos.y += 0.7;
      worldPos.project(camera);
      const sx = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-worldPos.y * 0.5 + 0.5) * window.innerHeight;
      promptEl.style.left = sx + 'px';
      promptEl.style.top = sy + 'px';
      document.getElementById('interact-label').textContent = promptLabel;
      promptEl.style.display = 'flex';
    } else {
      promptEl.style.display = 'none';
    }
  } else {
    document.getElementById('interact-prompt').style.display = 'none';
  }

  particles.update(dt);
  renderer.render(scene, camera);
}

setupMobile();
requestAnimationFrame(loop);
