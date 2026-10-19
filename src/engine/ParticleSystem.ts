import * as THREE from 'three';

interface StreakParticle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  velocity: THREE.Vector3;
  age: number;
  maxLife: number;
  active: boolean;
  startScale: number;
  endScale: number;
  gravity: number;
  isStreak: boolean;
}

interface SmokeParticle {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  velocity: THREE.Vector3;
  age: number;
  maxLife: number;
  active: boolean;
  startScale: number;
  endScale: number;
}

interface ExpandingRingEffect {
  group: THREE.Group;
  outerRing: THREE.Mesh;
  innerRing: THREE.Mesh;
  discMesh: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  innerMat: THREE.MeshBasicMaterial;
  discMat: THREE.MeshBasicMaterial;
  age: number;
  maxLife: number;
  maxRadius: number;
  active: boolean;
}

function createSoftSmokeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(226, 232, 240, 0.55)');
  grad.addColorStop(0.5, 'rgba(148, 163, 184, 0.25)');
  grad.addColorStop(1, 'rgba(100, 116, 139, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createShockwaveDiscTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 124);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  grad.addColorStop(0.55, 'rgba(192, 132, 252, 0.18)');
  grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(0.95, 'rgba(168, 85, 247, 0.75)');
  grad.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ParticleSystem {
  private group = new THREE.Group();
  private pool: StreakParticle[] = [];
  private smokePool: SmokeParticle[] = [];
  private rings: ExpandingRingEffect[] = [];
  private skidMarks: THREE.Mesh[] = [];
  private skidIndex = 0;

  // Dynamic world-space flash light for explosions & Barge shockwaves (Blur_screenshot_001 & 055)
  private flashLight: THREE.PointLight;
  private flashTimer = 0;

  constructor(scene: THREE.Scene, maxParticles = 260, maxSkids = 180) {
    scene.add(this.group);

    this.flashLight = new THREE.PointLight(0xa855f7, 0, 48, 1.5);
    this.flashLight.position.set(0, 2, 0);
    this.group.add(this.flashLight);

    // Elongated spark streak geometry (matches linear spark trails in Blur_Hackney_Screen_055.jpg)
    const streakGeo = new THREE.BoxGeometry(0.015, 0.015, 0.34);
    const debrisGeo = new THREE.DodecahedronGeometry(0.07, 0);

    for (let i = 0; i < maxParticles; i++) {
      const isDebris = i % 5 === 0;
      const mat = new THREE.MeshBasicMaterial({
        color: isDebris ? 0x111827 : 0xffffff,
        transparent: true,
        opacity: 0,
        blending: isDebris ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(isDebris ? debrisGeo : streakGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);

      this.pool.push({
        mesh,
        mat,
        velocity: new THREE.Vector3(),
        age: 0,
        maxLife: 1,
        active: false,
        startScale: 1,
        endScale: 1,
        gravity: 0,
        isStreak: !isDebris,
      });
    }

    // Soft billboard tire smoke pool
    const smokeTex = createSoftSmokeTexture();
    for (let i = 0; i < 90; i++) {
      const mat = new THREE.SpriteMaterial({
        map: smokeTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.group.add(sprite);
      this.smokePool.push({
        sprite,
        mat,
        velocity: new THREE.Vector3(),
        age: 0,
        maxLife: 0.5,
        active: false,
        startScale: 1.2,
        endScale: 3.8,
      });
    }

    // Concentric multi-ring Barge / Explosion plasma wave (Blur_screenshot_011 & 055)
    const outerTorusGeo = new THREE.TorusGeometry(1, 0.08, 10, 40);
    outerTorusGeo.rotateX(Math.PI / 2);
    const innerTorusGeo = new THREE.TorusGeometry(0.65, 0.05, 8, 32);
    innerTorusGeo.rotateX(Math.PI / 2);
    const discGeo = new THREE.PlaneGeometry(2.1, 2.1);
    discGeo.rotateX(-Math.PI / 2);
    const discTex = createShockwaveDiscTexture();

    for (let i = 0; i < 14; i++) {
      const rg = new THREE.Group();
      rg.visible = false;

      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const discMat = new THREE.MeshBasicMaterial({
        map: discTex,
        color: 0xa855f7,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const outerRing = new THREE.Mesh(outerTorusGeo, outerMat);
      const innerRing = new THREE.Mesh(innerTorusGeo, innerMat);
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.position.y = -0.35;

      rg.add(outerRing, innerRing, discMesh);
      this.group.add(rg);

      this.rings.push({
        group: rg,
        outerRing,
        innerRing,
        discMesh,
        outerMat,
        innerMat,
        discMat,
        age: 0,
        maxLife: 0.55,
        maxRadius: 18,
        active: false,
      });
    }

    // Pooled dual-tire skid mark decals
    const skidGeo = new THREE.PlaneGeometry(0.38, 1.55);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x090b10,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < maxSkids; i++) {
      const m = new THREE.Mesh(skidGeo, skidMat);
      m.visible = false;
      this.group.add(m);
      this.skidMarks.push(m);
    }
  }

  private acquireStreak(): StreakParticle | null {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) return this.pool[i];
    }
    return null;
  }

  public spawnSparks(origin: THREE.Vector3, count = 16, colorHex = 0xffaa00): void {
    for (let i = 0; i < count; i++) {
      const p = this.acquireStreak();
      if (!p) break;
      p.active = true;
      p.age = 0;
      p.maxLife = 0.14 + Math.random() * 0.14;
      p.startScale = p.isStreak ? 0.75 + Math.random() * 0.45 : 0.75 + Math.random() * 0.45;
      p.endScale = 0.12;
      p.gravity = -32;

      if (p.isStreak) {
        p.mat.color.setHex(Math.random() > 0.35 ? colorHex : 0xffffff);
      } else {
        // Dark physical debris chunk (Blur_Hackney_Screen_055.jpg)
        p.mat.color.setHex(0x11151f);
      }
      p.mat.opacity = 0.85;
      p.mesh.position.copy(origin).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 1.3,
          0.18 + Math.random() * 0.32,
          (Math.random() - 0.5) * 1.3
        )
      );
      p.velocity.set(
        (Math.random() - 0.5) * 14,
        1.1 + Math.random() * 2.8,
        (Math.random() - 0.5) * 14
      );
      p.mesh.visible = true;
    }
  }

  public spawnTireSmoke(origin: THREE.Vector3, forward: THREE.Vector3): void {
    for (let i = 0; i < this.smokePool.length; i++) {
      const s = this.smokePool[i];
      if (!s.active) {
        s.active = true;
        s.age = 0;
        s.maxLife = 0.42 + Math.random() * 0.22;
        s.startScale = 1.15;
        s.endScale = 3.6;
        s.mat.opacity = 0.42;
        s.sprite.position.copy(origin).add(new THREE.Vector3(0, 0.22, 0));
        s.velocity
          .copy(forward)
          .multiplyScalar(-5)
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 2.2,
              0.7 + Math.random() * 0.8,
              (Math.random() - 0.5) * 2.2
            )
          );
        s.sprite.visible = true;
        break;
      }
    }
  }

  public spawnSkidMark(pos: THREE.Vector3, yaw: number): void {
    const m = this.skidMarks[this.skidIndex];
    this.skidIndex = (this.skidIndex + 1) % this.skidMarks.length;
    m.position.set(pos.x, pos.y + 0.04, pos.z);
    m.rotation.y = yaw;
    m.visible = true;
  }

  public spawnExplosion(origin: THREE.Vector3, colorHex = 0xf43f5e, radius = 15): void {
    this.spawnSparks(origin, 28, colorHex);
    this.spawnRing(origin, colorHex, radius, 0.55);
    this.triggerFlashLight(origin, colorHex, 45, 0.38);
  }

  public spawnRing(origin: THREE.Vector3, colorHex: number, maxRadius = 18, duration = 0.55): void {
    this.triggerFlashLight(origin, colorHex, 38, duration * 0.8);
    for (const r of this.rings) {
      if (!r.active) {
        r.active = true;
        r.age = 0;
        r.maxLife = duration;
        r.maxRadius = maxRadius;
        r.outerMat.color.setHex(0xffffff);
        r.innerMat.color.setHex(colorHex);
        r.discMat.color.setHex(colorHex);
        r.outerMat.opacity = 0.95;
        r.innerMat.opacity = 0.88;
        r.discMat.opacity = 0.72;
        r.group.position.copy(origin).add(new THREE.Vector3(0, 0.45, 0));
        r.group.scale.set(1, 1, 1);
        r.group.visible = true;
        break;
      }
    }
  }

  private triggerFlashLight(
    pos: THREE.Vector3,
    colorHex: number,
    intensity: number,
    duration: number
  ): void {
    this.flashLight.position.copy(pos).add(new THREE.Vector3(0, 2.2, 0));
    this.flashLight.color.setHex(colorHex);
    this.flashLight.intensity = intensity;
    this.flashTimer = duration;
  }

  public update(dt: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      this.flashLight.intensity *= Math.pow(0.05, dt * 3);
      if (this.flashTimer <= 0) this.flashLight.intensity = 0;
    }

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      const ratio = p.age / p.maxLife;
      p.velocity.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);

      if (p.isStreak) {
        // Align spark streak along velocity vector (Blur_Hackney_Screen_055.jpg)
        const target = p.mesh.position.clone().add(p.velocity);
        p.mesh.lookAt(target);
      } else {
        p.mesh.rotation.x += dt * 7;
        p.mesh.rotation.y += dt * 9;
      }

      const scale = THREE.MathUtils.lerp(p.startScale, p.endScale, ratio);
      p.mesh.scale.setScalar(scale);
      p.mat.opacity = (1 - ratio) * 0.92;
    }

    for (let i = 0; i < this.smokePool.length; i++) {
      const s = this.smokePool[i];
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= s.maxLife) {
        s.active = false;
        s.sprite.visible = false;
        continue;
      }
      const ratio = s.age / s.maxLife;
      s.sprite.position.addScaledVector(s.velocity, dt);
      const sc = THREE.MathUtils.lerp(s.startScale, s.endScale, ratio);
      s.sprite.scale.set(sc, sc, 1);
      s.mat.opacity = (1 - ratio) * 0.38;
    }

    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (!r.active) continue;
      r.age += dt;
      if (r.age >= r.maxLife) {
        r.active = false;
        r.group.visible = false;
        continue;
      }
      const ratio = r.age / r.maxLife;
      const rad = THREE.MathUtils.lerp(1.2, r.maxRadius, 1 - Math.pow(1 - ratio, 2.2));
      r.group.scale.set(rad, 1, rad);
      const fade = 1 - ratio;
      r.outerMat.opacity = fade * 0.95;
      r.innerMat.opacity = fade * 0.85;
      r.discMat.opacity = fade * 0.65;
    }
  }

  public clearAll(): void {
    this.flashLight.intensity = 0;
    this.flashTimer = 0;
    for (const p of this.pool) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const s of this.smokePool) {
      s.active = false;
      s.sprite.visible = false;
    }
    for (const r of this.rings) {
      r.active = false;
      r.group.visible = false;
    }
    for (const s of this.skidMarks) {
      s.visible = false;
    }
  }
}
