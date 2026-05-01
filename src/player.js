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
    const shadowGeo = new THREE.CircleGeometry(0.20, 12);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x2A1A3A, transparent: true, opacity: 0.20, depthWrite: false });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -PI / 2;
    this.shadow.position.y = 0.01;
    g.add(this.shadow);

    // ── LEGS ─────────────────────────────────────────────────
    // Cream/ivory leggings under the skirt
    const legMat = new THREE.MeshLambertMaterial({ color: 0xEEE0CC });
    const legGeo = new THREE.CylinderGeometry(0.048, 0.042, 0.16, 8);
    this.legL = new THREE.Mesh(legGeo, legMat);
    this.legR = new THREE.Mesh(legGeo, legMat);
    this.legL.position.set(-0.065, 0.08, 0);
    this.legR.position.set( 0.065, 0.08, 0);
    g.add(this.legL, this.legR);

    // ── BOOTS ────────────────────────────────────────────────
    const bootMat  = new THREE.MeshLambertMaterial({ color: 0x7A4E2D });
    const bootGeo  = new THREE.CylinderGeometry(0.055, 0.052, 0.09, 10);
    this.bootL = new THREE.Mesh(bootGeo, bootMat);
    this.bootR = new THREE.Mesh(bootGeo, bootMat);
    this.bootL.position.set(-0.065, 0.045, 0.005);
    this.bootR.position.set( 0.065, 0.045, 0.005);
    g.add(this.bootL, this.bootR);

    // Boot toe caps (slightly rounded front)
    const toeMat = new THREE.MeshLambertMaterial({ color: 0x5C3A1E });
    const toeGeo  = new THREE.SphereGeometry(0.054, 8, 6, 0, PI*2, 0, PI*0.5);
    const toeL = new THREE.Mesh(toeGeo, toeMat); toeL.position.set(-0.065, 0.03, 0.03); toeL.rotation.x = -0.5;
    const toeR = new THREE.Mesh(toeGeo, toeMat); toeR.position.set( 0.065, 0.03, 0.03); toeR.rotation.x = -0.5;
    g.add(toeL, toeR);

    // ── SKIRT / DRESS BODY ───────────────────────────────────
    // Warm cream/ivory dress — wider bell shape
    const dressCol = 0xF2E8D5;
    const dressMat = new THREE.MeshLambertMaterial({ color: dressCol });

    // Bell skirt
    const skirtGeo = new THREE.CylinderGeometry(0.14, 0.21, 0.20, 14);
    const skirt = new THREE.Mesh(skirtGeo, dressMat);
    skirt.position.y = 0.20;
    g.add(skirt);

    // Bodice (torso)
    const bodiceGeo = new THREE.CylinderGeometry(0.115, 0.14, 0.18, 12);
    const bodice = new THREE.Mesh(bodiceGeo, new THREE.MeshLambertMaterial({ color: 0xECDFC8 }));
    bodice.position.y = 0.39;
    g.add(bodice);

    // Small collar detail
    const collarMat = new THREE.MeshLambertMaterial({ color: 0xFFF8EE });
    const collarGeo = new THREE.CylinderGeometry(0.125, 0.115, 0.04, 12);
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.y = 0.50;
    g.add(collar);

    // Thin belt
    const beltMat = new THREE.MeshLambertMaterial({ color: 0xA0784A });
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.025, 12), beltMat);
    belt.position.y = 0.30;
    g.add(belt);
    // Belt buckle
    const buckleGeo = new THREE.BoxGeometry(0.035, 0.025, 0.015);
    const buckle = new THREE.Mesh(buckleGeo, new THREE.MeshLambertMaterial({ color: 0xD4AA40 }));
    buckle.position.set(0, 0.30, 0.143);
    g.add(buckle);

    // ── ARMS ─────────────────────────────────────────────────
    // Cream sleeves matching the dress
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xECDFC8 });
    const armGeo = new THREE.CylinderGeometry(0.040, 0.035, 0.20, 8);
    this.armL = new THREE.Mesh(armGeo, sleeveMat);
    this.armR = new THREE.Mesh(armGeo, sleeveMat);
    this.armL.position.set(-0.175, 0.395, 0);
    this.armR.position.set( 0.175, 0.395, 0);
    this.armL.rotation.z =  0.28;
    this.armR.rotation.z = -0.28;
    g.add(this.armL, this.armR);

    // Wrist cuffs
    const cuffMat = new THREE.MeshLambertMaterial({ color: 0xFFF8EE });
    const cuffGeo  = new THREE.CylinderGeometry(0.044, 0.040, 0.025, 8);
    const cuffL = new THREE.Mesh(cuffGeo, cuffMat); cuffL.position.set(-0.205, 0.31, 0);
    const cuffR = new THREE.Mesh(cuffGeo, cuffMat); cuffR.position.set( 0.205, 0.31, 0);
    g.add(cuffL, cuffR);

    // Hands (warm skin)
    const handMat = new THREE.MeshLambertMaterial({ color: 0xF0B888 });
    const handGeo = new THREE.SphereGeometry(0.040, 7, 6);
    const handL = new THREE.Mesh(handGeo, handMat); handL.position.set(-0.215, 0.285, 0);
    const handR = new THREE.Mesh(handGeo, handMat); handR.position.set( 0.215, 0.285, 0);
    g.add(handL, handR);

    // ── ROUNDED BACKPACK ────────────────────────────────────
    // Forest green — clearly distinct from the cream dress
    const packMat = new THREE.MeshLambertMaterial({ color: 0x3D7A5A });
    const pack = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 9), packMat);
    pack.scale.set(0.88, 1.08, 0.70);
    pack.position.set(0, 0.40, -0.13);
    g.add(pack);

    // Pocket flap
    const flapMat = new THREE.MeshLambertMaterial({ color: 0x2E6048 });
    const flap = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 7), flapMat);
    flap.scale.set(0.95, 0.75, 0.55);
    flap.position.set(0, 0.30, -0.165);
    g.add(flap);

    // Thin shoulder straps
    const strapMat = new THREE.MeshLambertMaterial({ color: 0xBB9030 });
    for (let s = -1; s <= 1; s += 2) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.17, 0.010), strapMat);
      strap.position.set(s * 0.065, 0.375, -0.048);
      g.add(strap);
    }

    // ── NECK ─────────────────────────────────────────────────
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xF0B888 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.068, 0.08, 9), skinMat);
    neck.position.y = 0.56;
    g.add(neck);

    // ── HEAD ─────────────────────────────────────────────────
    // Large, round chibi head — the face fills most of it
    const headGeo = new THREE.SphereGeometry(0.225, 16, 14);
    this.head = new THREE.Mesh(headGeo, skinMat);
    this.head.scale.set(1.0, 1.02, 0.94);
    this.head.position.y = 0.775;
    g.add(this.head);

    // Cheek blush
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xF5A8A0, transparent: true, opacity: 0.40 });
    const blushGeo = new THREE.CircleGeometry(0.055, 8);
    const blushL = new THREE.Mesh(blushGeo, blushMat);
    const blushR = new THREE.Mesh(blushGeo, blushMat);
    blushL.position.set(-0.125, 0.762, 0.198); blushL.rotation.y = 0.3; blushL.renderOrder = 1;
    blushR.position.set( 0.125, 0.762, 0.198); blushR.rotation.y = -0.3; blushR.renderOrder = 1;
    g.add(blushL, blushR);

    // ── EYES ─────────────────────────────────────────────────
    // Big, forward-facing chibi eyes
    const eyeWhiteMat  = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
    const irisMatL     = new THREE.MeshLambertMaterial({ color: 0x3A6E9A }); // blue-grey iris
    const pupilMat     = new THREE.MeshLambertMaterial({ color: 0x1A0E08 });
    const eyeShineMat  = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    // Eye white (oval)
    const ewGeo = new THREE.SphereGeometry(0.048, 9, 8);
    const eyeL = new THREE.Mesh(ewGeo, eyeWhiteMat);
    const eyeR = new THREE.Mesh(ewGeo, eyeWhiteMat);
    eyeL.scale.set(1.0, 1.15, 0.55);
    eyeR.scale.set(1.0, 1.15, 0.55);
    eyeL.position.set(-0.082, 0.790, 0.196); eyeL.renderOrder = 1;
    eyeR.position.set( 0.082, 0.790, 0.196); eyeR.renderOrder = 1;
    this.eyeL = eyeL; this.eyeR = eyeR;

    // Iris
    const irisGeo = new THREE.SphereGeometry(0.030, 7, 7);
    const irisL = new THREE.Mesh(irisGeo, irisMatL);
    const irisR = new THREE.Mesh(irisGeo, irisMatL);
    irisL.scale.set(0.9, 1.05, 0.55); irisL.position.set(-0.082, 0.790, 0.210); irisL.renderOrder = 2;
    irisR.scale.set(0.9, 1.05, 0.55); irisR.position.set( 0.082, 0.790, 0.210); irisR.renderOrder = 2;

    // Pupil
    const pupilGeo = new THREE.SphereGeometry(0.018, 6, 5);
    const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
    const pupilR = new THREE.Mesh(pupilGeo, pupilMat);
    pupilL.position.set(-0.082, 0.790, 0.216); pupilL.renderOrder = 3;
    pupilR.position.set( 0.082, 0.790, 0.216); pupilR.renderOrder = 3;
    this.pupilL = pupilL; this.pupilR = pupilR;

    // Eye shine
    const shineGeo = new THREE.SphereGeometry(0.009, 5, 4);
    const shineL = new THREE.Mesh(shineGeo, eyeShineMat); shineL.position.set(-0.072, 0.800, 0.220); shineL.renderOrder = 4;
    const shineR = new THREE.Mesh(shineGeo, eyeShineMat); shineR.position.set( 0.090, 0.800, 0.220); shineR.renderOrder = 4;

    // Upper eyelashes (thin dark arc above each eye)
    const lashMat = new THREE.MeshLambertMaterial({ color: 0x1A0E08 });
    const lashGeo = new THREE.TorusGeometry(0.050, 0.009, 4, 10, PI * 0.65);
    const lashL = new THREE.Mesh(lashGeo, lashMat);
    const lashR = new THREE.Mesh(lashGeo, lashMat);
    lashL.scale.set(0.88, 1.1, 0.4);
    lashR.scale.set(0.88, 1.1, 0.4);
    lashL.position.set(-0.082, 0.796, 0.197); lashL.rotation.z = -PI * 0.1; lashL.renderOrder = 3;
    lashR.position.set( 0.082, 0.796, 0.197); lashR.rotation.z =  PI * 0.1; lashR.renderOrder = 3;

    g.add(eyeL, eyeR, irisL, irisR, pupilL, pupilR, shineL, shineR, lashL, lashR);

    // Dot nose
    const noseMat = new THREE.MeshLambertMaterial({ color: 0xD4907A });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 5, 4), noseMat);
    nose.position.set(0, 0.764, 0.218); nose.renderOrder = 1;
    g.add(nose);

    // Smile
    const smileMat = new THREE.MeshLambertMaterial({ color: 0xC07A6A });
    const smileGeo = new THREE.TorusGeometry(0.030, 0.009, 4, 9, PI * 0.6);
    const smile = new THREE.Mesh(smileGeo, smileMat);
    smile.position.set(0, 0.738, 0.215);
    smile.rotation.z = PI;
    smile.renderOrder = 1;
    g.add(smile);

    // ── HAIR — long brown, sits on head, behind face ─────────
    // Key rule: hair cap only covers the TOP hemisphere
    // All hair pieces sit at or behind Z=0.05 so face stays visible
    const hairCol  = 0x6B3A12;   // warm medium brown
    const hairDark = 0x4A2508;   // darker strand
    const hairMat  = new THREE.MeshLambertMaterial({ color: hairCol });
    const hairDMat = new THREE.MeshLambertMaterial({ color: hairDark });
    this.hairGroup = new THREE.Group();

    // Top-of-head cap — tight skullcap, does NOT drape forward
    const capGeo = new THREE.SphereGeometry(0.228, 14, 10, 0, PI * 2, 0, PI * 0.48);
    this.hairCap = new THREE.Mesh(capGeo, hairMat);
    this.hairCap.position.y = 0.773;
    this.hairCap.position.z = -0.015; // slightly back
    this.hairGroup.add(this.hairCap);

    // Side panels hanging down — clearly at back/side of head
    const sidePanelData = [
      { x: -0.195, y: 0.730, z: -0.040, rx: 0.10, rz:  0.18, lenH: 0.26 },
      {  x: 0.195, y: 0.730, z: -0.040, rx: 0.10, rz: -0.18, lenH: 0.26 },
      { x: -0.165, y: 0.660, z: -0.075, rx: 0.22, rz:  0.12, lenH: 0.22 },
      {  x: 0.165, y: 0.660, z: -0.075, rx: 0.22, rz: -0.12, lenH: 0.22 },
    ];
    sidePanelData.forEach(sp => {
      const pg = new THREE.CapsuleGeometry(0.042, sp.lenH, 5, 8);
      const pm = new THREE.Mesh(pg, hairMat);
      pm.position.set(sp.x, sp.y, sp.z);
      pm.rotation.x = sp.rx; pm.rotation.z = sp.rz;
      this.hairGroup.add(pm);
    });

    // Central back mass
    const backMass = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.32, 6, 10), hairMat);
    backMass.position.set(0, 0.630, -0.150);
    backMass.rotation.x = 0.18;
    this.hairBack = backMass;
    this.hairGroup.add(backMass);

    // Long flowing strands
    const strandData = [
      { x: -0.095, y: 0.48, z: -0.130, rx: 0.30, len: 0.32, dark: false },
      {  x:  0.00, y: 0.44, z: -0.145, rx: 0.38, len: 0.36, dark: true  },
      {  x:  0.085, y: 0.48, z:-0.125, rx: 0.25, len: 0.30, dark: false },
    ];
    strandData.forEach((sd, i) => {
      const sg = new THREE.CapsuleGeometry(0.034, sd.len, 5, 8);
      const sm = new THREE.Mesh(sg, sd.dark ? hairDMat : hairMat);
      sm.position.set(sd.x, sd.y, sd.z);
      sm.rotation.x = sd.rx;
      if (i === 1) this.hairTrail = sm;
      this.hairGroup.add(sm);
    });

    // Tiny highlight strand
    const hlMat = new THREE.MeshLambertMaterial({ color: 0x9A5C22 });
    const hl = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.16, 4, 6), hlMat);
    hl.position.set(-0.035, 0.700, -0.100);
    hl.rotation.x = 0.15;
    this.hairGroup.add(hl);

    // Fringe/bangs — ONLY 2 small wisps at the very top of forehead
    // Positioned well ABOVE eye level (eyes at Y=0.790, bangs at Y=0.870+)
    [{ x: -0.075, z: 0.140 }, { x: 0.065, z: 0.135 }].forEach(b => {
      const bg = new THREE.SphereGeometry(0.048, 7, 5);
      const bm = new THREE.Mesh(bg, hairMat);
      bm.scale.set(1.05, 0.65, 0.60);
      bm.position.set(b.x, 0.872, b.z);
      this.hairGroup.add(bm);
    });

    g.add(this.hairGroup);

    // ── RED SCARF ────────────────────────────────────────────
    const scarfMat = new THREE.MeshLambertMaterial({ color: 0xBB2828 });
    const scarfLoop = new THREE.Mesh(new THREE.TorusGeometry(0.110, 0.030, 7, 14), scarfMat);
    scarfLoop.position.y = 0.52;
    scarfLoop.rotation.x = PI / 2;
    this.scarf = scarfLoop;
    g.add(scarfLoop);
    // Tail
    const scarfTailGeo = new THREE.BoxGeometry(0.035, 0.14, 0.035);
    this.scarfTail = new THREE.Mesh(scarfTailGeo, scarfMat);
    this.scarfTail.position.set(0.10, 0.42, 0.065);
    g.add(this.scarfTail);

    // ── LANTERN ──────────────────────────────────────────────
    this.lanternGroup = new THREE.Group();
    this.lanternGroup.position.set(0.25, 0.35, 0.10);

    const metalMat = new THREE.MeshLambertMaterial({ color: 0xB09020 });
    const chnMat   = new THREE.MeshLambertMaterial({ color: 0x988018 });

    // Chain
    const chn = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.09, 5), chnMat);
    chn.position.y = 0.155;
    this.lanternGroup.add(chn);

    // Top cap + finial
    const tCap = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.065, 0.038, 8), metalMat);
    tCap.position.y = 0.115;
    this.lanternGroup.add(tCap);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.020, 0.060, 6), metalMat);
    finial.position.y = 0.152;
    this.lanternGroup.add(finial);

    // Glass body
    const glassMat = new THREE.MeshLambertMaterial({ color: 0xFFEE88, transparent: true, opacity: 0.38, emissive: 0xFFCC44, emissiveIntensity: 0.55 });
    this.lanternGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 6), glassMat));

    // Cage bars
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.13, 4), metalMat);
      bar.position.set(Math.cos(a) * 0.066, 0, Math.sin(a) * 0.066);
      this.lanternGroup.add(bar);
    }
    // Horizontal rings
    for (let ri = 0; ri < 3; ri++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.006, 5, 10), metalMat);
      ring.position.y = -0.055 + ri * 0.055;
      ring.rotation.x = PI / 2;
      this.lanternGroup.add(ring);
    }

    // Glowing core
    const coreMat = new THREE.MeshLambertMaterial({ color: 0xFFDD44, emissive: 0xFFAA00, emissiveIntensity: 1.0 });
    this.lanternCore = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), coreMat);
    this.lanternGroup.add(this.lanternCore);

    // Bottom cap
    const bCap = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.042, 0.032, 8), metalMat);
    bCap.position.y = -0.080;
    this.lanternGroup.add(bCap);

    // Point light
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
    if (this.pulseCooldown > 0) this.pulseCooldown -= dt;
    if (this.pulseActive) {
      this.pulseRadius += dt * 6;
      if (this.pulseRadius > 5) { this.pulseActive = false; this.pulseRadius = 0; }
    }

    const bob = Math.sin(this.bobTime * 2.0) * 0.04;
    this.group.position.copy(this.pos);
    this.group.position.y = 0.08 + bob;
    this.group.rotation.y = this.facing;

    // Hair gentle sway
    this.hairGroup.rotation.z = Math.sin(this.bobTime * 1.1) * 0.022;
    this.hairBack.rotation.x = this.isMoving ? 0.22 : 0.06;
    if (this.hairTrail) this.hairTrail.rotation.x = this.isMoving ? 0.52 : 0.30;

    this.scarfTail.rotation.z = this.isMoving ? 0.32 : 0.0;

    // Walk animation
    const walkBob = this.isMoving ? Math.sin(this.bobTime * 6) * 0.042 : 0;
    this.legL.position.y  = 0.08 + walkBob;
    this.legR.position.y  = 0.08 - walkBob;
    this.bootL.position.y = 0.045 + walkBob;
    this.bootR.position.y = 0.045 - walkBob;
    const armSwing = this.isMoving ? Math.sin(this.bobTime * 6) * 0.30 : 0;
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
