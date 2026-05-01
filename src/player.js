// ============================================================
// PLAYER — Low-poly chibi explorer
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

    // Colours
    const C = {
      skin:    0xF4C49A,
      shirt:   0x4A7AC8,
      shirtD:  0x345EA0,
      trouser: 0x3A5230,
      boot:    0x5C3518,
      scarf:   0xD93030,
      pack:    0x3D7A46,
      metal:   0xB8941E,
      glass:   0xFFEE88,
      cream:   0xFAEDD8,
      hat:     0x3A2810,
      hatBand: 0xD4AA30,
    };

    const M = k => new THREE.MeshLambertMaterial({ color: C[k] });

    // ── SHADOW ───────────────────────────────────────────────
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.19, 14),
      new THREE.MeshBasicMaterial({ color: 0x1A0F2E, transparent: true, opacity: 0.18, depthWrite: false })
    );
    this.shadow.rotation.x = -PI / 2;
    this.shadow.position.y = 0.005;
    g.add(this.shadow);

    // ── BOOTS ────────────────────────────────────────────────
    const bootGeo = new THREE.CylinderGeometry(0.055, 0.052, 0.09, 9);
    this.bootL = new THREE.Mesh(bootGeo, M('boot'));
    this.bootR = new THREE.Mesh(bootGeo, M('boot'));
    this.bootL.position.set(-0.065, 0.045, 0);
    this.bootR.position.set( 0.065, 0.045, 0);
    // Toe cap
    for (let s of [-1, 1]) {
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.054, 8, 5, 0, PI*2, PI*0.38, PI*0.3),
        new THREE.MeshLambertMaterial({ color: 0x4A2810 }));
      toe.position.set(s*0.065, 0.022, 0.026); toe.rotation.x = -0.6;
      g.add(toe);
    }
    g.add(this.bootL, this.bootR);

    // ── LEGS / TROUSERS ──────────────────────────────────────
    const legGeo = new THREE.CylinderGeometry(0.054, 0.046, 0.22, 9);
    this.legL = new THREE.Mesh(legGeo, M('trouser'));
    this.legR = new THREE.Mesh(legGeo, M('trouser'));
    this.legL.position.set(-0.065, 0.200, 0);
    this.legR.position.set( 0.065, 0.200, 0);
    g.add(this.legL, this.legR);

    // ── SHIRT — straight torso (tucked in, pants show below belt) ──
    const shirtLowGeo = new THREE.CylinderGeometry(0.112, 0.112, 0.13, 12);
    const shirtLow = new THREE.Mesh(shirtLowGeo, new THREE.MeshLambertMaterial({ color: C.shirt }));
    shirtLow.position.y = 0.315;
    g.add(shirtLow);

    const bodiceGeo = new THREE.CylinderGeometry(0.108, 0.112, 0.175, 12);
    const bodice = new THREE.Mesh(bodiceGeo, new THREE.MeshLambertMaterial({ color: C.shirtD }));
    bodice.position.y = 0.430;
    g.add(bodice);

    // Collar
    for (let s of [-1, 1]) {
      const lapel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.020, 0.032, 0.08, 4),
        new THREE.MeshLambertMaterial({ color: C.cream })
      );
      lapel.position.set(s * 0.040, 0.475, 0.095); lapel.rotation.z = -s * 0.4;
      g.add(lapel);
    }

    // Button row (3 tiny spheres)
    for (let i = 0; i < 3; i++) {
      const btn = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 5, 4),
        new THREE.MeshLambertMaterial({ color: C.cream })
      );
      btn.position.set(0, 0.50 - i * 0.055, 0.104);
      g.add(btn);
    }

    // Belt
    const beltGeo = new THREE.CylinderGeometry(0.118, 0.118, 0.024, 12);
    const belt = new THREE.Mesh(beltGeo, new THREE.MeshLambertMaterial({ color: 0x7A4E22 }));
    belt.position.y = 0.310;
    g.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.020, 0.012),
      new THREE.MeshLambertMaterial({ color: 0xD4AA30 }));
    buckle.position.set(0, 0.310, 0.122);
    g.add(buckle);

    // ── ARMS ─────────────────────────────────────────────────
    const armGeo = new THREE.CylinderGeometry(0.038, 0.033, 0.20, 8);
    this.armL = new THREE.Mesh(armGeo, new THREE.MeshLambertMaterial({ color: C.shirtD }));
    this.armR = new THREE.Mesh(armGeo, new THREE.MeshLambertMaterial({ color: C.shirtD }));
    this.armL.position.set(-0.170, 0.42, 0); this.armL.rotation.z =  0.25;
    this.armR.position.set( 0.170, 0.42, 0); this.armR.rotation.z = -0.25;
    g.add(this.armL, this.armR);

    // Cuffs
    for (let s of [-1, 1]) {
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.022, 8),
        new THREE.MeshLambertMaterial({ color: C.cream }));
      cuff.position.set(s * 0.202, 0.308, 0);
      g.add(cuff);
    }

    // Hands
    const handMat = new THREE.MeshLambertMaterial({ color: C.skin });
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.037, 8, 6), handMat);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.037, 8, 6), handMat);
    handL.position.set(-0.210, 0.286, 0);
    handR.position.set( 0.210, 0.286, 0);
    g.add(handL, handR);

    // ── BACKPACK ─────────────────────────────────────────────
    const pack = new THREE.Mesh(new THREE.SphereGeometry(0.098, 10, 9), M('pack'));
    pack.scale.set(0.82, 1.05, 0.65);
    pack.position.set(0, 0.41, -0.125);
    g.add(pack);
    const flap = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x2E5E34 }));
    flap.scale.set(0.88, 0.70, 0.50);
    flap.position.set(0, 0.305, -0.158);
    g.add(flap);
    for (let s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.155, 0.008),
        new THREE.MeshLambertMaterial({ color: 0xBB9020 }));
      strap.position.set(s * 0.058, 0.385, -0.042);
      g.add(strap);
    }

    // ── NECK ─────────────────────────────────────────────────
    const skinMat = new THREE.MeshLambertMaterial({ color: C.skin });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.062, 0.068, 9), skinMat);
    neck.position.set(0, 0.566, 0);
    g.add(neck);

    // ── SCARF ────────────────────────────────────────────────
    this.scarf = new THREE.Mesh(new THREE.TorusGeometry(0.096, 0.028, 7, 14),
      new THREE.MeshLambertMaterial({ color: C.scarf }));
    this.scarf.position.y = 0.526; this.scarf.rotation.x = PI / 2;
    g.add(this.scarf);
    this.scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.115, 0.028),
      new THREE.MeshLambertMaterial({ color: C.scarf }));
    this.scarfTail.position.set(0.088, 0.435, 0.055);
    g.add(this.scarfTail);

    // ── HEAD ─────────────────────────────────────────────────
    // Big chibi head — round, clean
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.218, 16, 13), skinMat);
    this.head.scale.set(1.0, 1.05, 0.96);
    this.head.position.set(0, 0.768, 0);
    g.add(this.head);


    // ── EYES ─────────────────────────────────────────────────
    // Proper oval chibi eyes: white → iris → pupil → shine + lash
    const eyePositions = [{ s: -1, ex: -0.080 }, { s: 1, ex: 0.080 }];
    for (const { s, ex } of eyePositions) {
      // White (oval)
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.042, 9, 8),
        new THREE.MeshLambertMaterial({ color: 0xFFFFFF }));
      ew.scale.set(1.0, 1.22, 0.50);
      ew.position.set(ex, 0.786, 0.197);
      ew.renderOrder = 1;

      // Iris (warm brown)
      const ir = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 7),
        new THREE.MeshLambertMaterial({ color: 0x704214 }));
      ir.scale.set(0.90, 1.10, 0.52);
      ir.position.set(ex, 0.786, 0.210);
      ir.renderOrder = 2;

      // Pupil
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 5),
        new THREE.MeshLambertMaterial({ color: 0x100808 }));
      pu.position.set(ex, 0.786, 0.218);
      pu.renderOrder = 3;

      // Shine
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.007, 5, 4),
        new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
      sh.position.set(ex - s * 0.009, 0.796, 0.222);
      sh.renderOrder = 4;

      // Upper eyelash (flat arc above eye)
      const lash = new THREE.Mesh(
        new THREE.TorusGeometry(0.044, 0.007, 4, 10, PI * 0.60),
        new THREE.MeshLambertMaterial({ color: 0x180E08 })
      );
      lash.scale.set(0.84, 1.12, 0.36);
      lash.position.set(ex, 0.793, 0.197);
      lash.rotation.z = s > 0 ? PI * 0.08 : -PI * 0.08;
      lash.renderOrder = 3;

      if (s < 0) { this.eyeL = ew; this.pupilL = pu; }
      else        { this.eyeR = ew; this.pupilR = pu; }

      g.add(ew, ir, pu, sh, lash);
    }

    // Dot nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4),
      new THREE.MeshLambertMaterial({ color: 0xD08868 }));
    nose.position.set(0, 0.760, 0.214);
    nose.renderOrder = 1;
    g.add(nose);

    // Smile
    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.026, 0.007, 4, 9, PI * 0.55),
      new THREE.MeshLambertMaterial({ color: 0xBB7060 })
    );
    smile.position.set(0, 0.735, 0.212);
    smile.rotation.z = PI;
    smile.renderOrder = 1;
    g.add(smile);

    // ── HAT — wide-brim adventurer hat ──────────────────────
    const hatMat = new THREE.MeshLambertMaterial({ color: C.hat });
    this.hairGroup = new THREE.Group();

    // Brim
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.300, 0.310, 0.022, 14), hatMat);
    brim.position.set(0, 0.988, 0);
    g.add(brim);

    // Crown
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.190, 0.175, 12), hatMat);
    crown.position.set(0, 1.075, 0);
    g.add(crown);

    // Crown top
    const crownTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.178, 12, 8, 0, Math.PI*2, 0, Math.PI*0.5), hatMat);
    crownTop.position.set(0, 1.158, 0);
    g.add(crownTop);

    // Hat band
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.032, 12),
      new THREE.MeshLambertMaterial({ color: C.hatBand }));
    band.position.set(0, 1.000, 0);
    g.add(band);

    g.add(this.hairGroup);

    // ── LANTERN ──────────────────────────────────────────────
    this.lanternGroup = new THREE.Group();
    this.lanternGroup.position.set(0.240, 0.330, 0.10);
    const metalMat = new THREE.MeshLambertMaterial({ color: C.metal });

    // Chain
    const chn = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.085, 5),
      new THREE.MeshLambertMaterial({ color: 0x988018 }));
    chn.position.y = 0.145;
    this.lanternGroup.add(chn);

    // Top cap + finial
    const tCap = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.060, 0.034, 8), metalMat);
    tCap.position.y = 0.108;
    this.lanternGroup.add(tCap);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.052, 6), metalMat);
    finial.position.y = 0.144;
    this.lanternGroup.add(finial);

    // Glass body
    const glassMat = new THREE.MeshLambertMaterial({
      color: C.glass, transparent: true, opacity: 0.40,
      emissive: 0xFFCC44, emissiveIntensity: 0.60
    });
    this.lanternGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.060, 0.060, 0.110, 6), glassMat));

    // Cage bars
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.116, 4), metalMat);
      bar.position.set(Math.cos(a) * 0.061, 0, Math.sin(a) * 0.061);
      this.lanternGroup.add(bar);
    }
    for (let ri = 0; ri < 3; ri++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.005, 5, 10), metalMat);
      ring.position.y = -0.048 + ri * 0.048; ring.rotation.x = PI / 2;
      this.lanternGroup.add(ring);
    }

    // Glowing core
    this.lanternCore = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xFFDD44, emissive: 0xFFAA00, emissiveIntensity: 1.0 }));
    this.lanternGroup.add(this.lanternCore);

    // Bottom cap
    const bCap = new THREE.Mesh(new THREE.CylinderGeometry(0.060, 0.038, 0.028, 8), metalMat);
    bCap.position.y = -0.073;
    this.lanternGroup.add(bCap);

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
      const len = Math.sqrt(dx*dx + dz*dz);
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

    const bob = Math.sin(this.bobTime * 2.0) * 0.038;
    this.group.position.copy(this.pos);
    this.group.position.y = 0.08 + bob;
    this.group.rotation.y = this.facing;

    this.scarfTail.rotation.z = this.isMoving ? 0.28 : 0.0;

    // Walk animation
    const walkBob = this.isMoving ? Math.sin(this.bobTime * 6) * 0.038 : 0;
    this.legL.position.y  = 0.155 + walkBob;
    this.legR.position.y  = 0.155 - walkBob;
    this.bootL.position.y = 0.045 + walkBob;
    this.bootR.position.y = 0.045 - walkBob;
    const armSwing = this.isMoving ? Math.sin(this.bobTime * 6) * 0.28 : 0;
    this.armL.rotation.x = -armSwing;
    this.armR.rotation.x =  armSwing;

    this.lanternLight.intensity = 1.0 + Math.sin(this.bobTime * 1.3) * 0.20;
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
