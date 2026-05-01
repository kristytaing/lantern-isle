// ============================================================
// PLAYER — Chibi explorer character, abilities, movement
// ============================================================
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { PALETTE } from './world.js';

const PI = Math.PI;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.speed = 4.5;
    this.facing = 0;
    this.group = new THREE.Group();
    this.bobTime = 0;
    this.footstepTimer = 0;
    this.isMoving = false;
    this.abilities = { pulse: false, sprint: false, heatWard: false, whistle: false, sonar: false };
    this.sprintCooldown = 0; this.sprintActive = false; this.sprintTimer = 0;
    this.pulseCooldown = 0;
    this.pulseActive = false; this.pulseRadius = 0;
    this._build();
    scene.add(this.group);
  }

  _build() {
    const g = this.group;

    // ── SHADOW ───────────────────────────────────────────────
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.20, 12),
      new THREE.MeshBasicMaterial({ color: 0x2A1A3A, transparent: true, opacity: 0.18, depthWrite: false })
    );
    this.shadow.rotation.x = -PI / 2;
    this.shadow.position.y = 0.01;
    g.add(this.shadow);

    // ── BOOTS ────────────────────────────────────────────────
    const bootMat = new THREE.MeshLambertMaterial({ color: 0x6B3D1E });
    const bootGeo = new THREE.CylinderGeometry(0.056, 0.050, 0.10, 10);
    this.bootL = new THREE.Mesh(bootGeo, bootMat);
    this.bootR = new THREE.Mesh(bootGeo, bootMat);
    this.bootL.position.set(-0.068, 0.05, 0);
    this.bootR.position.set( 0.068, 0.05, 0);
    g.add(this.bootL, this.bootR);

    // ── LEGS ─────────────────────────────────────────────────
    const legMat = new THREE.MeshLambertMaterial({ color: 0xD4C4A8 });
    const legGeo = new THREE.CylinderGeometry(0.046, 0.042, 0.14, 8);
    this.legL = new THREE.Mesh(legGeo, legMat);
    this.legR = new THREE.Mesh(legGeo, legMat);
    this.legL.position.set(-0.068, 0.14, 0);
    this.legR.position.set( 0.068, 0.14, 0);
    g.add(this.legL, this.legR);

    // ── DRESS ────────────────────────────────────────────────
    // Warm dusty rose / mauve — cozy and distinct from skin
    const dressColor = 0xD4A882;   // warm terracotta-cream
    const dressMat   = new THREE.MeshLambertMaterial({ color: dressColor });
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.20, 0.22, 13), dressMat);
    skirt.position.y = 0.22;
    g.add(skirt);

    const bodice = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.13, 0.17, 12),
      new THREE.MeshLambertMaterial({ color: 0xC49070 }));
    bodice.position.y = 0.395;
    g.add(bodice);

    // White collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.108, 0.036, 12),
      new THREE.MeshLambertMaterial({ color: 0xFAF0E0 }));
    collar.position.y = 0.50;
    g.add(collar);

    // Belt
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.024, 12),
      new THREE.MeshLambertMaterial({ color: 0x8C5C2A }));
    belt.position.y = 0.305;
    g.add(belt);

    // ── ARMS ─────────────────────────────────────────────────
    const slvMat = new THREE.MeshLambertMaterial({ color: 0xC49070 });
    const armGeo = new THREE.CylinderGeometry(0.038, 0.033, 0.19, 8);
    this.armL = new THREE.Mesh(armGeo, slvMat);
    this.armR = new THREE.Mesh(armGeo, slvMat);
    this.armL.position.set(-0.170, 0.400, 0); this.armL.rotation.z =  0.26;
    this.armR.position.set( 0.170, 0.400, 0); this.armR.rotation.z = -0.26;
    g.add(this.armL, this.armR);

    const handMat = new THREE.MeshLambertMaterial({ color: 0xECA882 });
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.038, 7, 6), handMat);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.038, 7, 6), handMat);
    handL.position.set(-0.208, 0.290, 0);
    handR.position.set( 0.208, 0.290, 0);
    g.add(handL, handR);

    // ── BACKPACK ─────────────────────────────────────────────
    const pack = new THREE.Mesh(new THREE.SphereGeometry(0.100, 10, 9),
      new THREE.MeshLambertMaterial({ color: 0x4A8C5C }));  // clear green
    pack.scale.set(0.85, 1.05, 0.68);
    pack.position.set(0, 0.400, -0.130);
    g.add(pack);
    const flap = new THREE.Mesh(new THREE.SphereGeometry(0.050, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x376844 }));
    flap.scale.set(0.90, 0.72, 0.52);
    flap.position.set(0, 0.300, -0.162);
    g.add(flap);
    for (let s = -1; s <= 1; s += 2) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.16, 0.009),
        new THREE.MeshLambertMaterial({ color: 0xBB9028 }));
      strap.position.set(s * 0.062, 0.378, -0.046);
      g.add(strap);
    }

    // ── NECK ─────────────────────────────────────────────────
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xECA882 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.065, 0.07, 9), skinMat);
    neck.position.set(0, 0.562, 0);
    g.add(neck);

    // ── HEAD ─────────────────────────────────────────────────
    // Large round chibi head
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.220, 16, 14), skinMat);
    this.head.scale.set(1.0, 1.04, 0.95);
    this.head.position.set(0, 0.770, 0);
    g.add(this.head);

    // Cheeks
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xF09090, transparent: true, opacity: 0.35 });
    for (let s = -1; s <= 1; s += 2) {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.048, 8), blushMat);
      b.position.set(s * 0.122, 0.756, 0.194);
      b.rotation.y = -s * 0.28;
      b.renderOrder = 1;
      g.add(b);
    }

    // ── EYES ─────────────────────────────────────────────────
    const eyeW  = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
    const irisM = new THREE.MeshLambertMaterial({ color: 0x4A7EA0 });
    const pupM  = new THREE.MeshLambertMaterial({ color: 0x18100A });
    const shineM= new THREE.MeshBasicMaterial( { color: 0xFFFFFF });
    const lashM = new THREE.MeshLambertMaterial({ color: 0x18100A });

    for (let s = -1; s <= 1; s += 2) {
      const ex = s * 0.082;
      // White
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.044, 9, 8), eyeW);
      ew.scale.set(1.0, 1.18, 0.52); ew.position.set(ex, 0.788, 0.196); ew.renderOrder = 1;
      // Iris
      const ir = new THREE.Mesh(new THREE.SphereGeometry(0.028, 7, 7), irisM);
      ir.scale.set(0.88, 1.05, 0.52); ir.position.set(ex, 0.788, 0.210); ir.renderOrder = 2;
      // Pupil
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), pupM);
      pu.position.set(ex, 0.788, 0.217); pu.renderOrder = 3;
      // Shine
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.008, 5, 4), shineM);
      sh.position.set(ex - s*0.010, 0.797, 0.221); sh.renderOrder = 4;
      // Lash arc
      const la = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.008, 4, 10, PI*0.62), lashM);
      la.scale.set(0.86, 1.08, 0.38); la.position.set(ex, 0.794, 0.197);
      la.rotation.z = s > 0 ? PI*0.08 : -PI*0.08; la.renderOrder = 3;

      if (s < 0) { this.eyeL = ew; this.pupilL = pu; }
      else        { this.eyeR = ew; this.pupilR = pu; }
      g.add(ew, ir, pu, sh, la);
    }

    // Nose + mouth
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.013, 5, 4),
      new THREE.MeshLambertMaterial({ color: 0xD28868 }));
    nose.position.set(0, 0.762, 0.215); nose.renderOrder = 1;
    g.add(nose);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 4, 9, PI * 0.58),
      new THREE.MeshLambertMaterial({ color: 0xBB7060 }));
    smile.position.set(0, 0.736, 0.213); smile.rotation.z = PI; smile.renderOrder = 1;
    g.add(smile);

    // ── HAIR ─────────────────────────────────────────────────
    // Strategy: hair sphere sits BEHIND head center, so head sphere
    // naturally occludes it from front. Only back/sides visible.
    const hMat  = new THREE.MeshLambertMaterial({ color: 0x6B3A10 });
    const hDark = new THREE.MeshLambertMaterial({ color: 0x4A2508 });
    this.hairGroup = new THREE.Group();

    // Main hair volume — sphere offset back so face stays clear
    // Head is at Z=0, radius 0.220. Hair sphere at Z=-0.055, radius 0.232
    // → hair visibly peeks out around edges and top, hidden on front face
    const hairSphere = new THREE.Mesh(new THREE.SphereGeometry(0.232, 14, 12), hMat);
    hairSphere.position.set(0, 0.775, -0.055);
    this.hairGroup.add(hairSphere);

    // Extra back fullness / bun-like volume
    const backBulge = new THREE.Mesh(new THREE.SphereGeometry(0.140, 10, 9), hMat);
    backBulge.position.set(0, 0.660, -0.220);
    this.hairBack = backBulge;
    this.hairGroup.add(backBulge);

    // Long flowing strands down the back
    const strandPositions = [
      { x: -0.085, y: 0.520, z: -0.195, rx: 0.28, len: 0.34 },
      {  x:  0.00, y: 0.480, z: -0.210, rx: 0.36, len: 0.38 },
      {  x:  0.080, y: 0.520, z:-0.190, rx: 0.24, len: 0.32 },
    ];
    strandPositions.forEach((sd, i) => {
      const sm = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, sd.len, 5, 8),
        i === 1 ? hDark : hMat);
      sm.position.set(sd.x, sd.y, sd.z);
      sm.rotation.x = sd.rx;
      if (i === 1) this.hairTrail = sm;
      this.hairGroup.add(sm);
    });

    // Highlight
    const hlMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.15, 4, 6),
      new THREE.MeshLambertMaterial({ color: 0x9A5C20 }));
    hlMesh.position.set(-0.040, 0.710, -0.105); hlMesh.rotation.x = 0.12;
    this.hairGroup.add(hlMesh);

    g.add(this.hairGroup);

    // ── SCARF ────────────────────────────────────────────────
    const scarfMat = new THREE.MeshLambertMaterial({ color: 0xBB2828 });
    this.scarf = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.028, 7, 14), scarfMat);
    this.scarf.position.y = 0.52; this.scarf.rotation.x = PI / 2;
    g.add(this.scarf);
    this.scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.13, 0.032), scarfMat);
    this.scarfTail.position.set(0.098, 0.42, 0.062);
    g.add(this.scarfTail);

    // ── LANTERN ──────────────────────────────────────────────
    this.lanternGroup = new THREE.Group();
    this.lanternGroup.position.set(0.24, 0.33, 0.10);
    const metalMat = new THREE.MeshLambertMaterial({ color: 0xB09020 });
    const chn = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.09, 5),
      new THREE.MeshLambertMaterial({ color: 0x988018 }));
    chn.position.y = 0.148;
    this.lanternGroup.add(chn);
    const tCap = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.062, 0.036, 8), metalMat);
    tCap.position.y = 0.110; this.lanternGroup.add(tCap);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.055, 6), metalMat);
    finial.position.y = 0.148; this.lanternGroup.add(finial);
    const glassMat = new THREE.MeshLambertMaterial({ color: 0xFFEE88, transparent: true, opacity: 0.38, emissive: 0xFFCC44, emissiveIntensity: 0.6 });
    this.lanternGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.115, 6), glassMat));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4), metalMat);
      bar.position.set(Math.cos(a) * 0.063, 0, Math.sin(a) * 0.063);
      this.lanternGroup.add(bar);
    }
    for (let ri = 0; ri < 3; ri++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.006, 5, 10), metalMat);
      ring.position.y = -0.050 + ri * 0.050; ring.rotation.x = PI / 2;
      this.lanternGroup.add(ring);
    }
    this.lanternCore = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xFFDD44, emissive: 0xFFAA00, emissiveIntensity: 1.0 }));
    this.lanternGroup.add(this.lanternCore);
    const bCap = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.040, 0.030, 8), metalMat);
    bCap.position.y = -0.076; this.lanternGroup.add(bCap);
    this.lanternLight = new THREE.PointLight(0xFFCC44, 1.0, 5);
    this.lanternGroup.add(this.lanternLight);
    g.add(this.lanternGroup);
  }

  grantAbility(key) { this.abilities[key] = true; }

  activatePulse() {
    if (!this.abilities.pulse || this.pulseCooldown > 0) return false;
    this.pulseActive = true; this.pulseRadius = 0; this.pulseCooldown = 5;
    return true;
  }

  activateSprint() {
    if (!this.abilities.sprint || this.sprintCooldown > 0 || this.sprintActive) return false;
    this.sprintActive = true; this.sprintTimer = 2.5;
    return true;
  }

  update(dt, keys, isoDir, tiles) {
    this.bobTime += dt;
    let dx = 0, dz = 0;
    if (keys['w']||keys['arrowup'])    dz -= 1;
    if (keys['s']||keys['arrowdown'])  dz += 1;
    if (keys['a']||keys['arrowleft'])  dx -= 1;
    if (keys['d']||keys['arrowright']) dx += 1;
    if (isoDir) { dx = isoDir.x; dz = isoDir.z; }
    this.isMoving = dx !== 0 || dz !== 0;

    let spd = this.speed;
    if (this.sprintActive) spd *= 1.9;

    if (this.isMoving) {
      const len = Math.sqrt(dx*dx+dz*dz);
      dx /= len; dz /= len;
      const nx = this.pos.x + dx * spd * dt;
      const nz = this.pos.z + dz * spd * dt;
      if (this._onGround(nx, nz, tiles)) {
        this.pos.x = nx; this.pos.z = nz;
      } else if (this._onGround(nx, this.pos.z, tiles)) { this.pos.x = nx; }
        else if (this._onGround(this.pos.x, nz, tiles)) { this.pos.z = nz; }
      this.facing = Math.atan2(dx, dz);
      this.footstepTimer -= dt;
    }

    if (this.sprintActive) {
      this.sprintTimer -= dt;
      if (this.sprintTimer <= 0) { this.sprintActive = false; this.sprintCooldown = 4; }
    }
    if (this.sprintCooldown > 0) this.sprintCooldown -= dt;
    if (this.pulseCooldown > 0)  this.pulseCooldown -= dt;
    if (this.pulseActive) {
      this.pulseRadius += dt * 6;
      if (this.pulseRadius > 5) { this.pulseActive = false; this.pulseRadius = 0; }
    }

    const bob = Math.sin(this.bobTime * 2.0) * 0.04;
    this.group.position.copy(this.pos);
    this.group.position.y = 0.08 + bob;
    this.group.rotation.y = this.facing;

    this.hairGroup.rotation.z = Math.sin(this.bobTime * 1.1) * 0.020;
    this.hairBack.rotation.x  = this.isMoving ? 0.20 : 0.04;
    if (this.hairTrail) this.hairTrail.rotation.x = this.isMoving ? 0.50 : 0.28;
    this.scarfTail.rotation.z = this.isMoving ? 0.30 : 0.0;

    const walkBob = this.isMoving ? Math.sin(this.bobTime * 6) * 0.040 : 0;
    this.legL.position.y  = 0.14 + walkBob;
    this.legR.position.y  = 0.14 - walkBob;
    this.bootL.position.y = 0.05 + walkBob;
    this.bootR.position.y = 0.05 - walkBob;
    const armSwing = this.isMoving ? Math.sin(this.bobTime * 6) * 0.28 : 0;
    this.armL.rotation.x = -armSwing;
    this.armR.rotation.x =  armSwing;
    this.lanternLight.intensity = 1.0 + Math.sin(this.bobTime * 1.3) * 0.22;
  }

  _onGround(x, z, tiles) {
    if (!tiles) return true;
    for (const t of tiles) {
      if (t.type === 'water') continue;
      if (Math.abs(x - t.x) < 0.62 && Math.abs(z - t.z) < 0.62) return true;
    }
    return false;
  }
}
