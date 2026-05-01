// ============================================================
// PLAYER — Simple explorer (NPC-matched style)
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
    this._build();
    scene.add(this.group);
  }

  _build() {
    const g = this.group;

    // ── SHADOW ───────────────────────────────────────────────
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 14),
      new THREE.MeshBasicMaterial({ color: 0x1A0F2E, transparent: true, opacity: 0.18, depthWrite: false })
    );
    this.shadow.rotation.x = -PI / 2;
    this.shadow.position.y = 0.005;
    g.add(this.shadow);

    // ── LEGS ─────────────────────────────────────────────────
    const legMat = new THREE.MeshLambertMaterial({ color: 0x3A5230 });
    const legGeo = new THREE.CylinderGeometry(0.055, 0.048, 0.20, 8);
    this.legL = new THREE.Mesh(legGeo, legMat);
    this.legR = new THREE.Mesh(legGeo, legMat);
    this.legL.position.set(-0.07, 0.14, 0);
    this.legR.position.set( 0.07, 0.14, 0);
    g.add(this.legL, this.legR);

    // Boots
    const bootMat = new THREE.MeshLambertMaterial({ color: 0x5C3518 });
    const bootGeo = new THREE.CylinderGeometry(0.058, 0.054, 0.08, 8);
    this.bootL = new THREE.Mesh(bootGeo, bootMat);
    this.bootR = new THREE.Mesh(bootGeo, bootMat);
    this.bootL.position.set(-0.07, 0.04, 0);
    this.bootR.position.set( 0.07, 0.04, 0);
    g.add(this.bootL, this.bootR);

    // ── BODY ─────────────────────────────────────────────────
    const bodyGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.36, 10);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4A7AC8 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.42;
    g.add(body);

    // ── ARMS ─────────────────────────────────────────────────
    const armGeo = new THREE.CylinderGeometry(0.042, 0.036, 0.22, 6);
    const armMat = new THREE.MeshLambertMaterial({ color: 0x345EA0 });
    this.armL = new THREE.Mesh(armGeo, armMat);
    this.armR = new THREE.Mesh(armGeo, armMat);
    this.armL.position.set(-0.19, 0.40, 0); this.armL.rotation.z =  0.2;
    this.armR.position.set( 0.19, 0.40, 0); this.armR.rotation.z = -0.2;
    g.add(this.armL, this.armR);

    // Hands
    const handMat = new THREE.MeshLambertMaterial({ color: 0xF4C49A });
    const handGeo = new THREE.SphereGeometry(0.038, 7, 6);
    const handL = new THREE.Mesh(handGeo, handMat); handL.position.set(-0.22, 0.28, 0);
    const handR = new THREE.Mesh(handGeo, handMat); handR.position.set( 0.22, 0.28, 0);
    g.add(handL, handR);

    // ── HEAD ─────────────────────────────────────────────────
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xF4C49A });
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skinMat);
    this.head.position.set(0, 0.76, 0);
    g.add(this.head);

    // Eyes
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x2A1A0A });
    const eyeGeo = new THREE.SphereGeometry(0.028, 7, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.072, 0.78, 0.155);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set( 0.072, 0.78, 0.155);
    g.add(eyeL, eyeR);

    // Cheeks
    const cheekMat = new THREE.MeshLambertMaterial({ color: 0xF09090 });
    const cheekGeo = new THREE.SphereGeometry(0.038, 6, 5);
    const cheekL = new THREE.Mesh(cheekGeo, cheekMat); cheekL.position.set(-0.115, 0.74, 0.145);
    const cheekR = new THREE.Mesh(cheekGeo, cheekMat); cheekR.position.set( 0.115, 0.74, 0.145);
    g.add(cheekL, cheekR);

    // ── HAT ──────────────────────────────────────────────────
    const hatMat = new THREE.MeshLambertMaterial({ color: 0x3A2810 });
    const brimGeo = new THREE.CylinderGeometry(0.26, 0.27, 0.022, 12);
    const brim = new THREE.Mesh(brimGeo, hatMat); brim.position.set(0, 0.90, 0);
    const crownGeo = new THREE.CylinderGeometry(0.15, 0.17, 0.17, 10);
    const crown = new THREE.Mesh(crownGeo, hatMat); crown.position.set(0, 0.98, 0);
    const bandMat = new THREE.MeshLambertMaterial({ color: 0xD4AA30 });
    const bandGeo = new THREE.CylinderGeometry(0.172, 0.172, 0.028, 10);
    const band = new THREE.Mesh(bandGeo, bandMat); band.position.set(0, 0.905, 0);
    g.add(brim, crown, band);

    // ── LANTERN ──────────────────────────────────────────────
    this.lanternGroup = new THREE.Group();
    this.lanternGroup.position.set(0.26, 0.30, 0.08);
    const metalMat = new THREE.MeshLambertMaterial({ color: 0xB8941E });

    // Chain
    const chn = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.08, 5),
      new THREE.MeshLambertMaterial({ color: 0x988018 }));
    chn.position.y = 0.13;
    this.lanternGroup.add(chn);

    // Top cap
    const tCap = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.058, 0.032, 8), metalMat);
    tCap.position.y = 0.096;
    this.lanternGroup.add(tCap);

    // Glass body
    const glassMat = new THREE.MeshLambertMaterial({
      color: 0xFFEE88, transparent: true, opacity: 0.42,
      emissive: 0xFFCC44, emissiveIntensity: 0.60
    });
    this.lanternGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.105, 6), glassMat));

    // Cage bars
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.110, 4), metalMat);
      bar.position.set(Math.cos(a) * 0.057, 0, Math.sin(a) * 0.057);
      this.lanternGroup.add(bar);
    }

    // Glowing core
    this.lanternCore = new THREE.Mesh(new THREE.SphereGeometry(0.030, 7, 7),
      new THREE.MeshLambertMaterial({ color: 0xFFDD44, emissive: 0xFFAA00, emissiveIntensity: 1.0 }));
    this.lanternGroup.add(this.lanternCore);

    // Bottom cap
    const bCap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.036, 0.026, 8), metalMat);
    bCap.position.y = -0.068;
    this.lanternGroup.add(bCap);

    this.lanternLight = new THREE.PointLight(0xFFCC44, 1.0, 5);
    this.lanternGroup.add(this.lanternLight);
    g.add(this.lanternGroup);
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

    if (this.isMoving) {
      const len = Math.sqrt(dx*dx + dz*dz);
      dx /= len; dz /= len;
      const nx = this.pos.x + dx * this.speed * dt;
      const nz = this.pos.z + dz * this.speed * dt;
      if (this._onGround(nx, nz, tiles)) {
        this.pos.x = nx; this.pos.z = nz;
      } else if (this._onGround(nx, this.pos.z, tiles)) { this.pos.x = nx; }
        else if (this._onGround(this.pos.x, nz, tiles)) { this.pos.z = nz; }
      this.facing = Math.atan2(dx, dz);
      this.footstepTimer -= dt;
    }

    const bob = Math.sin(this.bobTime * 2.0) * 0.036;
    this.group.position.copy(this.pos);
    this.group.position.y = 0.08 + bob;
    this.group.rotation.y = this.facing;

    // Walk animation
    const walkBob = this.isMoving ? Math.sin(this.bobTime * 6) * 0.036 : 0;
    this.legL.position.y  = 0.14 + walkBob;
    this.legR.position.y  = 0.14 - walkBob;
    this.bootL.position.y = 0.04 + walkBob;
    this.bootR.position.y = 0.04 - walkBob;
    const armSwing = this.isMoving ? Math.sin(this.bobTime * 6) * 0.26 : 0;
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
