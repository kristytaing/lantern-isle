// ============================================================
// PLAYER — Chibi explorer character, abilities, movement
// ============================================================
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { PALETTE } from './world.js';

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

    // ── LEGS / TROUSERS ──────────────────────────────────────
    const trouserMat = new THREE.MeshLambertMaterial({ color: 0x4A6741 }); // dark olive green
    const legGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.18, 8);
    this.legL = new THREE.Mesh(legGeo, trouserMat);
    this.legR = new THREE.Mesh(legGeo.clone(), trouserMat);
    this.legL.position.set(-0.07, 0.09, 0);
    this.legR.position.set(0.07, 0.09, 0);
    g.add(this.legL); g.add(this.legR);

    // ── BOOTS ────────────────────────────────────────────────
    const bootMat = new THREE.MeshLambertMaterial({ color: 0x5C3A1E }); // dark brown
    const bootGeo = new THREE.CylinderGeometry(0.062, 0.058, 0.1, 10);
    this.bootL = new THREE.Mesh(bootGeo, bootMat);
    this.bootR = new THREE.Mesh(bootGeo.clone(), bootMat);
    this.bootL.position.set(-0.07, 0.05, 0.01);
    this.bootR.position.set(0.07, 0.05, 0.01);
    g.add(this.bootL); g.add(this.bootR);
    // Boot cuff (lighter rim at top)
    const cuffMat = new THREE.MeshLambertMaterial({ color: 0x7A5030 });
    const cuffGeo = new THREE.CylinderGeometry(0.066, 0.062, 0.025, 10);
    const cuffL = new THREE.Mesh(cuffGeo, cuffMat);
    const cuffR = new THREE.Mesh(cuffGeo.clone(), cuffMat);
    cuffL.position.set(-0.07, 0.1, 0.01);
    cuffR.position.set(0.07, 0.1, 0.01);
    g.add(cuffL); g.add(cuffR);

    // ── BODY — explorer jacket ───────────────────────────────
    const jacketMat = new THREE.MeshLambertMaterial({ color: 0x8B5E2A }); // warm brown
    const bodyGeo = new THREE.CylinderGeometry(0.145, 0.16, 0.3, 12);
    this.body = new THREE.Mesh(bodyGeo, jacketMat);
    this.body.position.y = 0.33;
    g.add(this.body);

    // Jacket front panel (lighter stripe)
    const frontPanelGeo = new THREE.PlaneGeometry(0.1, 0.26);
    const frontPanelMat = new THREE.MeshLambertMaterial({ color: 0xA0723A, side: THREE.DoubleSide });
    const frontPanel = new THREE.Mesh(frontPanelGeo, frontPanelMat);
    frontPanel.position.set(0, 0.33, 0.145);
    g.add(frontPanel);

    // Belt
    const beltMat = new THREE.MeshLambertMaterial({ color: 0x3A2510 });
    const beltGeo = new THREE.CylinderGeometry(0.152, 0.152, 0.035, 12);
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = 0.21;
    g.add(belt);
    // Belt buckle
    const buckleGeo = new THREE.BoxGeometry(0.055, 0.04, 0.02);
    const buckleMat = new THREE.MeshLambertMaterial({ color: 0xC8A040 });
    const buckle = new THREE.Mesh(buckleGeo, buckleMat);
    buckle.position.set(0, 0.21, 0.155);
    g.add(buckle);

    // Collar
    const collarGeo = new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI);
    const collarMat = new THREE.MeshLambertMaterial({ color: 0xF0E0C0 });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.set(0, 0.45, 0.0);
    collar.rotation.x = -0.4;
    g.add(collar);

    // ── ARMS ─────────────────────────────────────────────────
    const armMat = new THREE.MeshLambertMaterial({ color: 0x8B5E2A }); // same as jacket
    const armGeo = new THREE.CylinderGeometry(0.042, 0.048, 0.24, 8);
    armGeo.translate(0, -0.12, 0);
    this.armL = new THREE.Mesh(armGeo, armMat);
    this.armR = new THREE.Mesh(armGeo.clone(), armMat);
    this.armL.position.set(-0.185, 0.42, 0);
    this.armR.position.set(0.185, 0.42, 0);
    g.add(this.armL); g.add(this.armR);
    // Sleeve cuffs
    const sleeveCuffGeo = new THREE.CylinderGeometry(0.048, 0.044, 0.028, 8);
    const sleeveCuffMat = new THREE.MeshLambertMaterial({ color: 0xF0E0C0 });
    const sleeveL = new THREE.Mesh(sleeveCuffGeo, sleeveCuffMat);
    const sleeveR = new THREE.Mesh(sleeveCuffGeo.clone(), sleeveCuffMat);
    sleeveL.position.set(-0.185, 0.22, 0);
    sleeveR.position.set(0.185, 0.22, 0);
    g.add(sleeveL); g.add(sleeveR);

    // Backpack (small explorer pack)
    const packMat = new THREE.MeshLambertMaterial({ color: 0x6B4820 });
    const packGeo = new THREE.BoxGeometry(0.16, 0.18, 0.1);
    const pack = new THREE.Mesh(packGeo, packMat);
    pack.position.set(0, 0.32, -0.18);
    g.add(pack);
    // Pack strap
    const strapGeo = new THREE.BoxGeometry(0.015, 0.22, 0.015);
    const strapMat = new THREE.MeshLambertMaterial({ color: 0x4A3010 });
    const strapL = new THREE.Mesh(strapGeo, strapMat); strapL.position.set(-0.06, 0.34, -0.09);
    const strapR = new THREE.Mesh(strapGeo.clone(), strapMat); strapR.position.set(0.06, 0.34, -0.09);
    g.add(strapL); g.add(strapR);

    // ── HEAD ─────────────────────────────────────────────────
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xF5D5A8 });
    const headGeo = new THREE.SphereGeometry(0.21, 14, 12);
    this.head = new THREE.Mesh(headGeo, skinMat);
    this.head.position.y = 0.72;
    g.add(this.head);

    // Cheek blush
    const blushMat = new THREE.MeshLambertMaterial({ color: 0xF0A080, transparent: true, opacity: 0.45 });
    const blushGeo = new THREE.SphereGeometry(0.065, 6, 5);
    const blushL = new THREE.Mesh(blushGeo, blushMat);
    const blushR = new THREE.Mesh(blushGeo, blushMat);
    blushL.position.set(-0.13, 0.70, 0.16); blushL.scale.set(1, 0.55, 0.4);
    blushR.position.set(0.13, 0.70, 0.16);  blushR.scale.set(1, 0.55, 0.4);
    g.add(blushL); g.add(blushR);

    // Nose
    const noseGeo = new THREE.SphereGeometry(0.022, 5, 4);
    const noseMat = new THREE.MeshLambertMaterial({ color: 0xE8B890 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.715, 0.21);
    g.add(nose);

    // Eyes — placed on face surface, NOT through the bangs
    const eyeGeo = new THREE.SphereGeometry(0.038, 7, 7);
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x2A1A0A });
    this.eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeL.position.set(-0.085, 0.735, 0.185);
    this.eyeR.position.set(0.085, 0.735, 0.185);
    g.add(this.eyeL); g.add(this.eyeR);
    // Eye whites (slightly larger behind)
    const eyeWhiteGeo = new THREE.SphereGeometry(0.045, 7, 7);
    const eyeWhiteMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
    const ewL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    const ewR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    ewL.position.set(-0.085, 0.735, 0.178);
    ewR.position.set(0.085, 0.735, 0.178);
    g.add(ewL); g.add(ewR);
    // Re-add eyes on top of whites
    this.head.renderOrder = 0;
    ewL.renderOrder = 1; ewR.renderOrder = 1;
    this.eyeL.renderOrder = 2; this.eyeR.renderOrder = 2;
    // Eye shine
    const shineGeo = new THREE.SphereGeometry(0.013, 4, 4);
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const shL = new THREE.Mesh(shineGeo, shineMat);
    const shR = new THREE.Mesh(shineGeo, shineMat);
    shL.position.set(-0.073, 0.748, 0.22);
    shR.position.set(0.097, 0.748, 0.22);
    shL.renderOrder = 3; shR.renderOrder = 3;
    g.add(shL); g.add(shR);

    // Eyebrows
    const browMat = new THREE.MeshLambertMaterial({ color: 0x5A3010 });
    const browGeo = new THREE.BoxGeometry(0.072, 0.014, 0.01);
    const browL = new THREE.Mesh(browGeo, browMat);
    const browR = new THREE.Mesh(browGeo.clone(), browMat);
    browL.position.set(-0.085, 0.775, 0.2); browL.rotation.z = 0.15;
    browR.position.set(0.085, 0.775, 0.2); browR.rotation.z = -0.15;
    g.add(browL); g.add(browR);

    // ── HAIR ─────────────────────────────────────────────────
    // Strategy: hair cap FULLY encloses top and sides of head,
    // bangs hang forward from forehead but below eye level
    this.hairGroup = new THREE.Group();
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x5C3418 }); // dark chestnut brown
    const hairHighMat = new THREE.MeshLambertMaterial({ color: 0x7A4A22 }); // lighter highlight

    // Full hair cap — slightly larger than head, covers top + all sides down to neck
    const capGeo = new THREE.SphereGeometry(0.225, 14, 12, 0, Math.PI*2, 0, Math.PI*0.78);
    this.hairCap = new THREE.Mesh(capGeo, hairMat);
    this.hairCap.position.y = 0.73;
    this.hairGroup.add(this.hairCap);

    // Side hair volumes (cover sides fully, no scalp showing)
    const sideHairGeo = new THREE.SphereGeometry(0.175, 8, 7);
    const sideL = new THREE.Mesh(sideHairGeo, hairMat);
    const sideR = new THREE.Mesh(sideHairGeo.clone(), hairMat);
    sideL.position.set(-0.2, 0.68, -0.02); sideL.scale.set(0.55, 0.85, 0.7);
    sideR.position.set(0.2, 0.68, -0.02);  sideR.scale.set(0.55, 0.85, 0.7);
    this.hairGroup.add(sideL); this.hairGroup.add(sideR);

    // Bangs — 3 clumps hanging from forehead, positioned ABOVE eyes
    // These hang at forehead level, not over the eyes
    const bangPositions = [
      { x: -0.1, y: 0.79, z: 0.17, rz: 0.2,  sx: 0.9, sy: 0.6 },
      { x:  0.0, y: 0.80, z: 0.19, rz: 0.0,  sx: 1.0, sy: 0.7 },
      { x:  0.1, y: 0.79, z: 0.17, rz: -0.2, sx: 0.9, sy: 0.6 },
    ];
    bangPositions.forEach(b => {
      const bangGeo = new THREE.SphereGeometry(0.075, 7, 6);
      const bang = new THREE.Mesh(bangGeo, hairMat);
      bang.position.set(b.x, b.y, b.z);
      bang.rotation.z = b.rz;
      bang.scale.set(b.sx, b.sy, 0.6);
      this.hairGroup.add(bang);
    });

    // Back hair — long flowing section behind head
    const backTopGeo = new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI*2, Math.PI*0.35, Math.PI*0.55);
    this.hairBack = new THREE.Mesh(backTopGeo, hairMat);
    this.hairBack.position.y = 0.72;
    this.hairGroup.add(this.hairBack);

    // Long trailing strand behind
    const trailGeo = new THREE.CylinderGeometry(0.045, 0.02, 0.38, 7);
    const trail = new THREE.Mesh(trailGeo, hairMat);
    trail.position.set(0, 0.54, -0.22);
    trail.rotation.x = 0.35;
    this.hairTrail = trail;
    this.hairGroup.add(trail);

    // Hair highlight streak
    const hlGeo = new THREE.SphereGeometry(0.07, 6, 5);
    const hl = new THREE.Mesh(hlGeo, hairHighMat);
    hl.position.set(0.06, 0.86, 0.1); hl.scale.set(0.6, 0.4, 0.5);
    this.hairGroup.add(hl);

    // Explorer hat brim (wide flat ring around head top)
    const hatBrimGeo = new THREE.CylinderGeometry(0.31, 0.29, 0.025, 14);
    const hatMat = new THREE.MeshLambertMaterial({ color: 0x7A5030 });
    const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat);
    hatBrim.position.y = 0.87;
    this.hairGroup.add(hatBrim);
    // Hat crown
    const hatCrownGeo = new THREE.CylinderGeometry(0.18, 0.21, 0.18, 12);
    const hatCrown = new THREE.Mesh(hatCrownGeo, hatMat);
    hatCrown.position.y = 0.97;
    this.hairGroup.add(hatCrown);
    // Hat band
    const hatBandGeo = new THREE.CylinderGeometry(0.213, 0.213, 0.035, 12);
    const hatBandMat = new THREE.MeshLambertMaterial({ color: 0xC8A040 });
    const hatBand = new THREE.Mesh(hatBandGeo, hatBandMat);
    hatBand.position.y = 0.88;
    this.hairGroup.add(hatBand);

    g.add(this.hairGroup);

    // ── SCARF ────────────────────────────────────────────────
    const scarfGeo = new THREE.TorusGeometry(0.115, 0.032, 7, 14);
    const scarfMat = new THREE.MeshLambertMaterial({ color: 0xD94040 });
    this.scarf = new THREE.Mesh(scarfGeo, scarfMat);
    this.scarf.position.y = 0.5;
    this.scarf.rotation.x = Math.PI/2;
    g.add(this.scarf);
    const tailGeo = new THREE.BoxGeometry(0.038, 0.16, 0.038);
    this.scarfTail = new THREE.Mesh(tailGeo, scarfMat);
    this.scarfTail.position.set(0.1, 0.40, 0.07);
    g.add(this.scarfTail);

    // ── LANTERN (detailed) ───────────────────────────────────
    this.lanternGroup = new THREE.Group();
    this.lanternGroup.position.set(0.26, 0.38, 0.1);

    // Chain links (2 cylinders)
    const chainMat = new THREE.MeshLambertMaterial({ color: 0xA08030 });
    const chainGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.1, 5);
    const chain = new THREE.Mesh(chainGeo, chainMat);
    chain.position.y = 0.16;
    this.lanternGroup.add(chain);

    // Top cap
    const topCapGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.04, 8);
    const metalMat = new THREE.MeshLambertMaterial({ color: 0xB08820 });
    const topCap = new THREE.Mesh(topCapGeo, metalMat);
    topCap.position.y = 0.12;
    this.lanternGroup.add(topCap);
    // Top finial spike
    const finialGeo = new THREE.ConeGeometry(0.022, 0.065, 6);
    const finial = new THREE.Mesh(finialGeo, metalMat);
    finial.position.y = 0.16;
    this.lanternGroup.add(finial);

    // Main body — hexagonal cage
    const cageBodyGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.13, 6);
    const glassMat = new THREE.MeshLambertMaterial({ color: 0xFFEE88, transparent: true, opacity: 0.35, emissive: 0xFFCC44, emissiveIntensity: 0.5 });
    const cageBody = new THREE.Mesh(cageBodyGeo, glassMat);
    cageBody.position.y = 0.0;
    this.lanternGroup.add(cageBody);

    // Cage bars (6 vertical bars around hex)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const barGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.14, 4);
      const bar = new THREE.Mesh(barGeo, metalMat);
      bar.position.set(Math.cos(angle) * 0.07, 0.0, Math.sin(angle) * 0.07);
      this.lanternGroup.add(bar);
    }
    // Horizontal rings (top + bottom + middle)
    for (let ri = 0; ri < 3; ri++) {
      const ry = -0.06 + ri * 0.06;
      const ringGeo = new THREE.TorusGeometry(0.072, 0.007, 5, 6);
      const ring = new THREE.Mesh(ringGeo, metalMat);
      ring.position.y = ry;
      ring.rotation.x = Math.PI / 2;
      this.lanternGroup.add(ring);
    }

    // Inner glowing core
    const coreGeo = new THREE.SphereGeometry(0.042, 8, 8);
    const coreMat = new THREE.MeshLambertMaterial({ color: 0xFFDD44, emissive: 0xFFAA00, emissiveIntensity: 1.0 });
    this.lanternCore = new THREE.Mesh(coreGeo, coreMat);
    this.lanternCore.position.y = 0.0;
    this.lanternGroup.add(this.lanternCore);

    // Bottom cap
    const botCapGeo = new THREE.CylinderGeometry(0.07, 0.045, 0.035, 8);
    const botCap = new THREE.Mesh(botCapGeo, metalMat);
    botCap.position.y = -0.085;
    this.lanternGroup.add(botCap);

    // Lantern light
    this.lanternLight = new THREE.PointLight(0xFFCC44, 1.0, 5);
    this.lanternGroup.add(this.lanternLight);

    g.add(this.lanternGroup);

    // ── SHADOW ───────────────────────────────────────────────
    const shadowGeo = new THREE.CircleGeometry(0.22, 12);
    const shadowMat = new THREE.MeshBasicMaterial({ color: PALETTE.deepPlumN, transparent: true, opacity: 0.25, depthWrite: false });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    g.add(this.shadow);
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
    if (this.sprintActive) spd *= 1.7;

    if (this.isMoving) {
      const len = Math.sqrt(dx*dx+dz*dz);
      const nx = this.pos.x + (dx/len) * spd * dt;
      const nz = this.pos.z + (dz/len) * spd * dt;
      if (!tiles || this._onGround(nx, nz, tiles)) {
        this.pos.x = nx; this.pos.z = nz;
      } else {
        if (this._onGround(nx, this.pos.z, tiles)) { this.pos.x = nx; }
        else if (this._onGround(this.pos.x, nz, tiles)) { this.pos.z = nz; }
      }
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
    const hairSway = Math.sin(this.bobTime * 1.2) * 0.03;
    this.group.position.copy(this.pos);
    this.group.position.y = 0.08 + bob;
    this.group.rotation.y = this.facing;
    this.hairGroup.rotation.z = hairSway;

    if (this.isMoving) {
      this.hairBack.rotation.x = 0.55;
      this.hairTrail.rotation.x = 0.55;
    } else {
      this.hairBack.rotation.x = 0.0;
      this.hairTrail.rotation.x = 0.35;
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

    // Lantern swing + glow pulse
    this.lanternLight.intensity = 1.0 + Math.sin(this.bobTime * 1.3) * 0.25;
    this.lanternGroup.position.y = 0.38 + Math.sin(this.bobTime * 3) * 0.025;
    this.lanternGroup.rotation.z = Math.sin(this.bobTime * 2) * 0.08;
    this.lanternCore.material.emissiveIntensity = 0.9 + Math.sin(this.bobTime * 2.1) * 0.4;
  }

  activatePulse() {
    if (!this.abilities.pulse || this.pulseCooldown > 0) return false;
    this.pulseActive = true; this.pulseRadius = 0; this.pulseCooldown = 5;
    return true;
  }
  activateSprint() {
    if (!this.abilities.sprint || this.sprintCooldown > 0 || this.sprintActive) return false;
    this.sprintActive = true; this.sprintTimer = 3;
    return true;
  }
  grantAbility(name) { this.abilities[name] = true; }
  _onGround(x, z, tiles) {
    const tx = Math.round(x), tz = Math.round(z);
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t.type === 'ground' && t.x === tx && t.z === tz) return true;
    }
    return false;
  }
}
