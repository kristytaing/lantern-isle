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
    const shadowGeo = new THREE.CircleGeometry(0.22, 12);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x2A1A3A, transparent: true, opacity: 0.22, depthWrite: false });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -PI / 2;
    this.shadow.position.y = 0.01;
    g.add(this.shadow);

    // ── LEGS ─────────────────────────────────────────────────
    const trouserMat = new THREE.MeshLambertMaterial({ color: 0x4A6741 });
    const legGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.18, 8);
    this.legL = new THREE.Mesh(legGeo, trouserMat);
    this.legR = new THREE.Mesh(legGeo, trouserMat);
    this.legL.position.set(-0.07, 0.09, 0);
    this.legR.position.set(0.07, 0.09, 0);
    g.add(this.legL, this.legR);

    // ── BOOTS ────────────────────────────────────────────────
    const bootMat = new THREE.MeshLambertMaterial({ color: 0x5C3A1E });
    const bootGeo = new THREE.CylinderGeometry(0.062, 0.058, 0.1, 10);
    this.bootL = new THREE.Mesh(bootGeo, bootMat);
    this.bootR = new THREE.Mesh(bootGeo, bootMat);
    this.bootL.position.set(-0.07, 0.05, 0.01);
    this.bootR.position.set(0.07, 0.05, 0.01);
    g.add(this.bootL, this.bootR);
    const cuffMat = new THREE.MeshLambertMaterial({ color: 0x7A5030 });
    const cuffGeo = new THREE.CylinderGeometry(0.066, 0.062, 0.025, 10);
    const cuffL = new THREE.Mesh(cuffGeo, cuffMat); cuffL.position.set(-0.07, 0.1, 0.01);
    const cuffR = new THREE.Mesh(cuffGeo, cuffMat); cuffR.position.set(0.07, 0.1, 0.01);
    g.add(cuffL, cuffR);

    // ── BODY — cream dress / explorer coat ──────────────────
    // Base dress shape: wider at bottom, slimmer top
    const dressBot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.20, 0.22, 12),
      new THREE.MeshLambertMaterial({ color: 0xF5EDDC })
    );
    dressBot.position.y = 0.22;
    g.add(dressBot);

    const dressTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.17, 0.18, 12),
      new THREE.MeshLambertMaterial({ color: 0xF0E4CC })
    );
    dressTop.position.y = 0.40;
    g.add(dressTop);

    // Thin tan belt
    const beltMat = new THREE.MeshLambertMaterial({ color: 0x9A7040 });
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.028, 12), beltMat);
    belt.position.y = 0.31;
    g.add(belt);

    // ── ARMS ─────────────────────────────────────────────────
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xF0E4CC });
    const armGeo = new THREE.CylinderGeometry(0.042, 0.038, 0.22, 8);
    this.armL = new THREE.Mesh(armGeo, sleeveMat);
    this.armR = new THREE.Mesh(armGeo, sleeveMat);
    this.armL.position.set(-0.185, 0.40, 0);
    this.armR.position.set(0.185, 0.40, 0);
    this.armL.rotation.z =  0.3;
    this.armR.rotation.z = -0.3;
    g.add(this.armL, this.armR);

    // Hands
    const handMat = new THREE.MeshLambertMaterial({ color: 0xF5C9A0 });
    const handGeo = new THREE.SphereGeometry(0.042, 7, 6);
    const handL = new THREE.Mesh(handGeo, handMat); handL.position.set(-0.22, 0.30, 0);
    const handR = new THREE.Mesh(handGeo, handMat); handR.position.set(0.22, 0.30, 0);
    g.add(handL, handR);

    // ── ROUNDED BACKPACK ────────────────────────────────────
    const packMat = new THREE.MeshLambertMaterial({ color: 0x2E7A6A });
    const packGeo = new THREE.SphereGeometry(0.11, 10, 9);
    const pack = new THREE.Mesh(packGeo, packMat);
    pack.scale.set(0.85, 1.05, 0.72);
    pack.position.set(0, 0.40, -0.13);
    g.add(pack);
    const pocketMat = new THREE.MeshLambertMaterial({ color: 0x246058 });
    const pocket = new THREE.Mesh(new THREE.SphereGeometry(0.054, 8, 7), pocketMat);
    pocket.scale.set(0.9, 0.85, 0.6);
    pocket.position.set(0, 0.30, -0.165);
    g.add(pocket);
    // Gold straps
    const strapMat = new THREE.MeshLambertMaterial({ color: 0xC8A040 });
    const strapGeo = new THREE.BoxGeometry(0.018, 0.18, 0.012);
    const strapL = new THREE.Mesh(strapGeo, strapMat); strapL.position.set(-0.07, 0.37, -0.05);
    const strapR = new THREE.Mesh(strapGeo, strapMat); strapR.position.set(0.07, 0.37, -0.05);
    g.add(strapL, strapR);

    // ── HEAD ─────────────────────────────────────────────────
    // Slightly rounder, bigger head like mock
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xF5C9A0 });
    const headGeo = new THREE.SphereGeometry(0.215, 14, 12);
    this.head = new THREE.Mesh(headGeo, skinMat);
    this.head.scale.set(1.0, 1.05, 0.96);
    this.head.position.y = 0.73;
    g.add(this.head);

    // Cheek blush (subtle)
    const blushMat = new THREE.MeshLambertMaterial({ color: 0xF2A0A0, transparent: true, opacity: 0.35 });
    const blushGeo = new THREE.SphereGeometry(0.055, 7, 6);
    const blushL = new THREE.Mesh(blushGeo, blushMat); blushL.scale.set(1.2, 0.6, 0.5); blushL.position.set(-0.12, 0.72, 0.175);
    const blushR = new THREE.Mesh(blushGeo, blushMat); blushR.scale.set(1.2, 0.6, 0.5); blushR.position.set(0.12, 0.72, 0.175);
    g.add(blushL, blushR);

    // Eyes — larger, more expressive like mock
    const eyeWhiteMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
    const pupilMat = new THREE.MeshLambertMaterial({ color: 0x2A1A10 });
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const eyeGeo = new THREE.SphereGeometry(0.045, 8, 7);
    const pupilGeo = new THREE.SphereGeometry(0.028, 7, 6);
    const shineGeo = new THREE.SphereGeometry(0.012, 5, 4);
    const eyeL = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    const eyeR = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    eyeL.position.set(-0.075, 0.745, 0.18); eyeL.renderOrder = 1;
    eyeR.position.set(0.075, 0.745, 0.18); eyeR.renderOrder = 1;
    const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
    const pupilR = new THREE.Mesh(pupilGeo, pupilMat);
    pupilL.position.set(-0.075, 0.742, 0.205); pupilL.renderOrder = 2;
    pupilR.position.set(0.075, 0.742, 0.205); pupilR.renderOrder = 2;
    const shineL = new THREE.Mesh(shineGeo, shineMat);
    const shineR = new THREE.Mesh(shineGeo, shineMat);
    shineL.position.set(-0.062, 0.755, 0.212); shineL.renderOrder = 3;
    shineR.position.set(0.088, 0.755, 0.212); shineR.renderOrder = 3;
    // Store for head-turn
    this.eyeL = eyeL; this.eyeR = eyeR;
    this.pupilL = pupilL; this.pupilR = pupilR;
    g.add(eyeL, eyeR, pupilL, pupilR, shineL, shineR);

    // Small dot nose
    const noseMat = new THREE.MeshLambertMaterial({ color: 0xD4906A });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 4), noseMat);
    nose.position.set(0, 0.718, 0.208);
    g.add(nose);

    // Mouth — small curved smile
    const mouthMat = new THREE.MeshLambertMaterial({ color: 0xC07060 });
    const mouthGeo = new THREE.TorusGeometry(0.028, 0.009, 4, 8, PI * 0.6);
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, 0.693, 0.208);
    mouth.rotation.z = PI;
    g.add(mouth);

    // ── HAIR — long flowing brown, behind face ───────────────
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x5C3010 });
    const hairDarkMat = new THREE.MeshLambertMaterial({ color: 0x3E2008 });
    this.hairGroup = new THREE.Group();

    // Scalp cap — top only, doesn't drape over face
    const capGeo = new THREE.SphereGeometry(0.222, 14, 10, 0, PI * 2, 0, PI * 0.50);
    this.hairCap = new THREE.Mesh(capGeo, hairMat);
    this.hairCap.position.y = 0.725;
    this.hairGroup.add(this.hairCap);

    // Side curtains — clearly behind the face (negative Z = behind)
    for (let s = -1; s <= 1; s += 2) {
      const curtainGeo = new THREE.CapsuleGeometry(0.045, 0.26, 5, 8);
      const curtain = new THREE.Mesh(curtainGeo, hairMat);
      curtain.position.set(s * 0.185, 0.60, -0.06);
      curtain.rotation.z = s * 0.15;
      this.hairGroup.add(curtain);
      // Extra volume layer
      const volGeo = new THREE.CapsuleGeometry(0.038, 0.20, 5, 8);
      const vol = new THREE.Mesh(volGeo, hairMat);
      vol.position.set(s * 0.21, 0.55, -0.08);
      vol.rotation.z = s * 0.22;
      this.hairGroup.add(vol);
    }

    // 2 small forehead bangs — only at top of forehead, NOT over eyes
    const bangPositions = [
      { x: -0.08, y: 0.865, z: 0.15 },
      {  x: 0.07, y: 0.870, z: 0.14 },
    ];
    bangPositions.forEach(bp => {
      const bangGeo = new THREE.SphereGeometry(0.058, 7, 6);
      const bang = new THREE.Mesh(bangGeo, hairMat);
      bang.scale.set(1.1, 0.72, 0.65);
      bang.position.set(bp.x, bp.y, bp.z);
      this.hairGroup.add(bang);
    });

    // Long back — main flowing mass
    const backVolGeo = new THREE.CapsuleGeometry(0.09, 0.38, 6, 10);
    this.hairBack = new THREE.Mesh(backVolGeo, hairMat);
    this.hairBack.position.set(0, 0.60, -0.14);
    this.hairGroup.add(this.hairBack);

    // Flowing trails (long strands)
    const trailData = [
      { x: -0.09, y: 0.44, z: -0.12, rx: 0.25, len: 0.30 },
      {  x: 0.00, y: 0.40, z: -0.13, rx: 0.32, len: 0.34 },
      {  x: 0.08, y: 0.44, z: -0.11, rx: 0.20, len: 0.28 },
    ];
    trailData.forEach((td, i) => {
      const trailGeo = new THREE.CapsuleGeometry(0.038, td.len, 5, 8);
      const trail = new THREE.Mesh(trailGeo, i === 1 ? hairDarkMat : hairMat);
      trail.position.set(td.x, td.y, td.z);
      trail.rotation.x = td.rx;
      if (i === 1) this.hairTrail = trail;
      this.hairGroup.add(trail);
    });

    // Hair highlight streak
    const hlGeo = new THREE.CapsuleGeometry(0.018, 0.18, 4, 6);
    const hlMat = new THREE.MeshLambertMaterial({ color: 0x8A5828 });
    const hl = new THREE.Mesh(hlGeo, hlMat);
    hl.position.set(-0.04, 0.68, -0.10);
    hl.rotation.x = 0.2;
    this.hairGroup.add(hl);

    g.add(this.hairGroup);

    // ── RED SCARF (matches mock) ──────────────────────────────
    const scarfMat = new THREE.MeshLambertMaterial({ color: 0xCC3030 });
    const scarfGeo = new THREE.TorusGeometry(0.115, 0.032, 7, 14);
    this.scarf = new THREE.Mesh(scarfGeo, scarfMat);
    this.scarf.position.y = 0.50;
    this.scarf.rotation.x = PI / 2;
    g.add(this.scarf);
    // Scarf tail that sways when moving
    const tailGeo = new THREE.BoxGeometry(0.038, 0.16, 0.038);
    this.scarfTail = new THREE.Mesh(tailGeo, scarfMat);
    this.scarfTail.position.set(0.11, 0.40, 0.07);
    g.add(this.scarfTail);

    // ── LANTERN (held in right hand) ─────────────────────────
    this.lanternGroup = new THREE.Group();
    this.lanternGroup.position.set(0.26, 0.38, 0.1);

    const metalMat = new THREE.MeshLambertMaterial({ color: 0xB08820 });
    const chainMat = new THREE.MeshLambertMaterial({ color: 0xA08030 });

    // Chain link (fixed — no Object.assign)
    const chainMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 5), chainMat);
    chainMesh.position.y = 0.16;
    this.lanternGroup.add(chainMesh);

    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.04, 8), metalMat);
    topCap.position.y = 0.12;
    this.lanternGroup.add(topCap);

    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.065, 6), metalMat);
    finial.position.y = 0.16;
    this.lanternGroup.add(finial);

    const glassMat = new THREE.MeshLambertMaterial({ color: 0xFFEE88, transparent: true, opacity: 0.35, emissive: 0xFFCC44, emissiveIntensity: 0.5 });
    this.lanternGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.13, 6), glassMat));

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.14, 4), metalMat);
      bar.position.set(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
      this.lanternGroup.add(bar);
    }
    for (let ri = 0; ri < 3; ri++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.007, 5, 6), metalMat);
      ring.position.y = -0.06 + ri * 0.06;
      ring.rotation.x = PI / 2;
      this.lanternGroup.add(ring);
    }

    const coreMat = new THREE.MeshLambertMaterial({ color: 0xFFDD44, emissive: 0xFFAA00, emissiveIntensity: 1.0 });
    this.lanternCore = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), coreMat);
    this.lanternGroup.add(this.lanternCore);

    const botCap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.035, 8), metalMat);
    botCap.position.y = -0.085;
    this.lanternGroup.add(botCap);

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
    if (keys['w']||keys['arrowup']) dz -= 1;
    if (keys['s']||keys['arrowdown']) dz += 1;
    if (keys['a']||keys['arrowleft']) dx -= 1;
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

    const bob = Math.sin(this.bobTime * 2.0) * 0.05;
    this.group.position.copy(this.pos);
    this.group.position.y = 0.08 + bob;
    this.group.rotation.y = this.facing;

    // Hair sway — gentle Z axis
    this.hairGroup.rotation.z = Math.sin(this.bobTime * 1.1) * 0.025;
    if (this.isMoving) {
      this.hairBack.rotation.x = 0.18;
      if (this.hairTrail) this.hairTrail.rotation.x = 0.5;
    } else {
      this.hairBack.rotation.x = 0.0;
      if (this.hairTrail) this.hairTrail.rotation.x = 0.32;
    }
    this.scarfTail.rotation.z = this.isMoving ? 0.35 : 0.0;

    const walkBob = this.isMoving ? Math.sin(this.bobTime * 6) * 0.045 : 0;
    this.legL.position.y = 0.09 + walkBob;
    this.legR.position.y = 0.09 - walkBob;
    this.bootL.position.y = 0.05 + walkBob;
    this.bootR.position.y = 0.05 - walkBob;
    const armSwing = this.isMoving ? Math.sin(this.bobTime * 6) * 0.32 : 0;
    this.armL.rotation.x = -armSwing;
    this.armR.rotation.x = armSwing;
    this.lanternLight.intensity = 1.0 + Math.sin(this.bobTime * 1.3) * 0.25;
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
