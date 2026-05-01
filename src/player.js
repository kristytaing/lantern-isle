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

    // ── LEGS ─────────────────────────────────────────────────
    const trouserMat = new THREE.MeshLambertMaterial({ color: 0x4A6741 });
    const legGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.18, 8);
    this.legL = new THREE.Mesh(legGeo, trouserMat);
    this.legR = new THREE.Mesh(legGeo.clone(), trouserMat);
    this.legL.position.set(-0.07, 0.09, 0);
    this.legR.position.set(0.07, 0.09, 0);
    g.add(this.legL); g.add(this.legR);

    // ── BOOTS ────────────────────────────────────────────────
    const bootMat = new THREE.MeshLambertMaterial({ color: 0x5C3A1E });
    const bootGeo = new THREE.CylinderGeometry(0.062, 0.058, 0.1, 10);
    this.bootL = new THREE.Mesh(bootGeo, bootMat);
    this.bootR = new THREE.Mesh(bootGeo.clone(), bootMat);
    this.bootL.position.set(-0.07, 0.05, 0.01);
    this.bootR.position.set(0.07, 0.05, 0.01);
    g.add(this.bootL); g.add(this.bootR);
    const cuffMat = new THREE.MeshLambertMaterial({ color: 0x7A5030 });
    const cuffGeo = new THREE.CylinderGeometry(0.066, 0.062, 0.025, 10);
    const cuffL = new THREE.Mesh(cuffGeo, cuffMat);
    const cuffR = new THREE.Mesh(cuffGeo.clone(), cuffMat);
    cuffL.position.set(-0.07, 0.1, 0.01);
    cuffR.position.set(0.07, 0.1, 0.01);
    g.add(cuffL); g.add(cuffR);

    // ── BODY — explorer jacket ───────────────────────────────
    const jacketMat = new THREE.MeshLambertMaterial({ color: 0x7A5228 });
    const bodyGeo = new THREE.CylinderGeometry(0.145, 0.16, 0.3, 12);
    this.body = new THREE.Mesh(bodyGeo, jacketMat);
    this.body.position.y = 0.33;
    g.add(this.body);
    // Jacket front panel
    const frontPanelGeo = new THREE.PlaneGeometry(0.1, 0.26);
    const frontPanelMat = new THREE.MeshLambertMaterial({ color: 0x9A6838, side: THREE.DoubleSide });
    const frontPanel = new THREE.Mesh(frontPanelGeo, frontPanelMat);
    frontPanel.position.set(0, 0.33, 0.146);
    g.add(frontPanel);
    // Belt
    const beltMat = new THREE.MeshLambertMaterial({ color: 0x2E1C0A });
    const beltGeo = new THREE.CylinderGeometry(0.152, 0.152, 0.035, 12);
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = 0.21;
    g.add(belt);
    const buckleGeo = new THREE.BoxGeometry(0.055, 0.04, 0.02);
    const buckleMat = new THREE.MeshLambertMaterial({ color: 0xC8A040 });
    const buckle = new THREE.Mesh(buckleGeo, buckleMat);
    buckle.position.set(0, 0.21, 0.156);
    g.add(buckle);
    // Collar
    const collarGeo = new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI);
    const collarMat = new THREE.MeshLambertMaterial({ color: 0xF0E0C0 });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.set(0, 0.46, 0.0);
    collar.rotation.x = -0.4;
    g.add(collar);

    // ── ARMS ─────────────────────────────────────────────────
    const armMat = new THREE.MeshLambertMaterial({ color: 0x7A5228 });
    const armGeo = new THREE.CylinderGeometry(0.042, 0.048, 0.24, 8);
    armGeo.translate(0, -0.12, 0);
    this.armL = new THREE.Mesh(armGeo, armMat);
    this.armR = new THREE.Mesh(armGeo.clone(), armMat);
    this.armL.position.set(-0.185, 0.42, 0);
    this.armR.position.set(0.185, 0.42, 0);
    g.add(this.armL); g.add(this.armR);
    const sleeveCuffGeo = new THREE.CylinderGeometry(0.048, 0.044, 0.028, 8);
    const sleeveCuffMat = new THREE.MeshLambertMaterial({ color: 0xF0E0C0 });
    const sleeveL = new THREE.Mesh(sleeveCuffGeo, sleeveCuffMat);
    const sleeveR = new THREE.Mesh(sleeveCuffGeo.clone(), sleeveCuffMat);
    sleeveL.position.set(-0.185, 0.22, 0);
    sleeveR.position.set(0.185, 0.22, 0);
    g.add(sleeveL); g.add(sleeveR);

    // ── BACKPACK — rounded, teal/jade color ──────────────────
    const packMat = new THREE.MeshLambertMaterial({ color: 0x2E7A6A }); // jade teal — distinct from brown jacket
    // Main rounded pack body
    const packGeo = new THREE.SphereGeometry(0.11, 10, 8);
    const pack = new THREE.Mesh(packGeo, packMat);
    pack.scale.set(0.9, 1.1, 0.75);
    pack.position.set(0, 0.34, -0.2);
    g.add(pack);
    // Small front pocket
    const pocketGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const pocketMat = new THREE.MeshLambertMaterial({ color: 0x246058 });
    const pocket = new THREE.Mesh(pocketGeo, pocketMat);
    pocket.scale.set(0.85, 0.7, 0.5);
    pocket.position.set(0, 0.24, -0.23);
    g.add(pocket);
    // Straps
    const strapMat = new THREE.MeshLambertMaterial({ color: 0xC8A040 });
    const strapGeo = new THREE.BoxGeometry(0.014, 0.22, 0.012);
    const strapL = new THREE.Mesh(strapGeo, strapMat); strapL.position.set(-0.06, 0.35, -0.1);
    const strapR = new THREE.Mesh(strapGeo.clone(), strapMat); strapR.position.set(0.06, 0.35, -0.1);
    g.add(strapL); g.add(strapR);

    // ── HEAD ─────────────────────────────────────────────────
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xF5D5A8 });
    const headGeo = new THREE.SphereGeometry(0.21, 14, 12);
    this.head = new THREE.Mesh(headGeo, skinMat);
    this.head.position.y = 0.72;
    g.add(this.head);

    // Cheek blush
    const blushMat = new THREE.MeshLambertMaterial({ color: 0xF09878, transparent: true, opacity: 0.42 });
    const blushGeo = new THREE.SphereGeometry(0.065, 6, 5);
    const blushL = new THREE.Mesh(blushGeo, blushMat);
    const blushR = new THREE.Mesh(blushGeo, blushMat);
    blushL.position.set(-0.13, 0.695, 0.16); blushL.scale.set(1, 0.5, 0.38);
    blushR.position.set(0.13, 0.695, 0.16);  blushR.scale.set(1, 0.5, 0.38);
    g.add(blushL); g.add(blushR);

    // Nose
    const noseGeo = new THREE.SphereGeometry(0.02, 5, 4);
    const noseMat = new THREE.MeshLambertMaterial({ color: 0xE8B090 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.712, 0.212);
    g.add(nose);

    // Eye whites
    const eyeWhiteGeo = new THREE.SphereGeometry(0.044, 8, 7);
    const eyeWhiteMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
    const ewL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    const ewR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    ewL.position.set(-0.083, 0.732, 0.179);
    ewR.position.set(0.083, 0.732, 0.179);
    g.add(ewL); g.add(ewR);
    // Pupils
    const eyeGeo = new THREE.SphereGeometry(0.032, 7, 7);
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x1A0A04 });
    this.eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeL.position.set(-0.083, 0.733, 0.192);
    this.eyeR.position.set(0.083, 0.733, 0.192);
    g.add(this.eyeL); g.add(this.eyeR);
    // Shine
    const shineGeo = new THREE.SphereGeometry(0.011, 4, 4);
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const shL = new THREE.Mesh(shineGeo, shineMat);
    const shR = new THREE.Mesh(shineGeo, shineMat);
    shL.position.set(-0.073, 0.743, 0.218);
    shR.position.set(0.093, 0.743, 0.218);
    g.add(shL); g.add(shR);

    // Eyebrows
    const browMat = new THREE.MeshLambertMaterial({ color: 0x4A2808 });
    const browGeo = new THREE.BoxGeometry(0.068, 0.013, 0.01);
    const browL = new THREE.Mesh(browGeo, browMat);
    const browR = new THREE.Mesh(browGeo.clone(), browMat);
    browL.position.set(-0.083, 0.772, 0.198); browL.rotation.z = 0.14;
    browR.position.set(0.083, 0.772, 0.198);  browR.rotation.z = -0.14;
    g.add(browL); g.add(browR);

    // ── HAIR — long flowing brown, stays behind face ──────────
    this.hairGroup = new THREE.Group();
    const hairMat    = new THREE.MeshLambertMaterial({ color: 0x6B3A18 }); // chestnut brown
    const hairDkMat  = new THREE.MeshLambertMaterial({ color: 0x4A2510 }); // darker under-layer
    const hairHiMat  = new THREE.MeshLambertMaterial({ color: 0x8C5028 }); // warm highlight

    // Top cap — covers only top of skull, not sides/front.
    // phiLength = PI*0.5 means top hemisphere only, stopping well above ears
    const capGeo = new THREE.SphereGeometry(0.222, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
    this.hairCap = new THREE.Mesh(capGeo, hairMat);
    this.hairCap.position.y = 0.725;
    this.hairGroup.add(this.hairCap);

    // Side curtains — hang down from temples, positioned BEHIND face (negative Z offset)
    // Left side
    const sideL_geo = new THREE.CylinderGeometry(0.055, 0.035, 0.42, 7);
    const sideL = new THREE.Mesh(sideL_geo, hairMat);
    sideL.position.set(-0.2, 0.56, -0.05);
    sideL.rotation.z = 0.12;
    this.hairGroup.add(sideL);
    // Right side
    const sideR_geo = new THREE.CylinderGeometry(0.055, 0.035, 0.42, 7);
    const sideR = new THREE.Mesh(sideR_geo, hairMat);
    sideR.position.set(0.2, 0.56, -0.05);
    sideR.rotation.z = -0.12;
    this.hairGroup.add(sideR);

    // Side volume spheres to close gap between cap and side curtains (no scalp showing)
    const sVolGeo = new THREE.SphereGeometry(0.14, 8, 7);
    const sVolL = new THREE.Mesh(sVolGeo, hairMat);
    const sVolR = new THREE.Mesh(sVolGeo.clone(), hairMat);
    sVolL.position.set(-0.2, 0.69, -0.04); sVolL.scale.set(0.6, 0.72, 0.7);
    sVolR.position.set(0.2, 0.69, -0.04);  sVolR.scale.set(0.6, 0.72, 0.7);
    this.hairGroup.add(sVolL); this.hairGroup.add(sVolR);

    // Bangs — only 2 short clumps at the very top of the forehead.
    // Z position kept shallow so they don't slide down over eyes.
    const bangData = [
      { x: -0.09, y: 0.82, z: 0.13, rz:  0.18, sx: 0.7, sy: 0.5 },
      { x:  0.09, y: 0.82, z: 0.13, rz: -0.18, sx: 0.7, sy: 0.5 },
    ];
    bangData.forEach(b => {
      const bGeo = new THREE.SphereGeometry(0.07, 7, 6);
      const bang = new THREE.Mesh(bGeo, hairDkMat);
      bang.position.set(b.x, b.y, b.z);
      bang.rotation.z = b.rz;
      bang.scale.set(b.sx, b.sy, 0.55);
      this.hairGroup.add(bang);
    });

    // Back volume — large rounded mass behind head
    const backVolGeo = new THREE.SphereGeometry(0.21, 10, 9, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.62);
    this.hairBack = new THREE.Mesh(backVolGeo, hairMat);
    this.hairBack.position.y = 0.72;
    this.hairGroup.add(this.hairBack);

    // Long flowing trails — 3 strands hanging behind
    const trailData = [
      { x: -0.09, y: 0.42, z: -0.22, rx: 0.25, rz:  0.08, h: 0.44, r: 0.038 },
      { x:  0.00, y: 0.38, z: -0.24, rx: 0.32, rz:  0.00, h: 0.52, r: 0.048 },
      { x:  0.09, y: 0.42, z: -0.22, rx: 0.25, rz: -0.08, h: 0.44, r: 0.038 },
    ];
    trailData.forEach((t, i) => {
      const tGeo = new THREE.CylinderGeometry(t.r, t.r * 0.4, t.h, 7);
      const trail = new THREE.Mesh(tGeo, i === 1 ? hairMat : hairDkMat);
      trail.position.set(t.x, t.y, t.z);
      trail.rotation.x = t.rx;
      trail.rotation.z = t.rz;
      if (i === 1) this.hairTrail = trail;
      this.hairGroup.add(trail);
    });

    // Highlight streak on top
    const hlGeo = new THREE.SphereGeometry(0.065, 6, 5);
    const hl = new THREE.Mesh(hlGeo, hairHiMat);
    hl.position.set(0.05, 0.88, 0.06); hl.scale.set(0.55, 0.35, 0.5);
    this.hairGroup.add(hl);

    g.add(this.hairGroup);

    // ── SCARF ────────────────────────────────────────────────
    const scarfGeo = new THREE.TorusGeometry(0.115, 0.032, 7, 14);
    const scarfMat = new THREE.MeshLambertMaterial({ color: 0xCC3030 });
    this.scarf = new THREE.Mesh(scarfGeo, scarfMat);
    this.scarf.position.y = 0.5;
    this.scarf.rotation.x = Math.PI / 2;
    g.add(this.scarf);
    const tailGeo = new THREE.BoxGeometry(0.038, 0.16, 0.038);
    this.scarfTail = new THREE.Mesh(tailGeo, scarfMat);
    this.scarfTail.position.set(0.11, 0.40, 0.07);
    g.add(this.scarfTail);

    // ── LANTERN ──────────────────────────────────────────────
    this.lanternGroup = new THREE.Group();
    this.lanternGroup.position.set(0.26, 0.38, 0.1);
    const metalMat = new THREE.MeshLambertMaterial({ color: 0xB08820 });
    const chainGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.1, 5);
    const chainMat = new THREE.MeshLambertMaterial({ color: 0xA08030 });
    this.lanternGroup.add(Object.assign(new THREE.Mesh(chainGeo, chainMat), { position: new THREE.Vector3(0, 0.16, 0) }));
    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.04, 8), metalMat);
    topCap.position.y = 0.12;
    this.lanternGroup.add(topCap);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.065, 6), metalMat);
    finial.position.y = 0.16;
    this.lanternGroup.add(finial);
    // Glass body
    const glassMat = new THREE.MeshLambertMaterial({ color: 0xFFEE88, transparent: true, opacity: 0.35, emissive: 0xFFCC44, emissiveIntensity: 0.5 });
    this.lanternGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.13, 6), glassMat));
    // Cage bars
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.14, 4), metalMat);
      bar.position.set(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
      this.lanternGroup.add(bar);
    }
    for (let ri = 0; ri < 3; ri++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.007, 5, 6), metalMat);
      ring.position.y = -0.06 + ri * 0.06; ring.rotation.x = Math.PI / 2;
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

    // ── SHADOW ───────────────────────────────────────────────
    const shadowGeo = new THREE.CircleGeometry(0.22, 12);
    const shadowMat = new THREE.MeshBasicMaterial({ color: PALETTE.deepPlumN, transparent: true, opacity: 0.22, depthWrite: false });
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
    this.group.position.copy(this.pos);
    this.group.position.y = 0.08 + bob;
    this.group.rotation.y = this.facing;
    // Gentle hair sway — Z axis only, keeps hair behind head
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
