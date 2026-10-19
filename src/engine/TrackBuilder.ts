import * as THREE from 'three';
import { PowerUpType, TrackDefinition } from '../types/game';
import { drawBlurPowerUpCanvas } from '../components/PowerUpBadge';

export interface SplineSample {
  index: number;
  t: number; // 0..1 normalized arc length
  distance: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  curvature: number;
}

export interface PowerUpSpawnNode {
  id: string;
  type: PowerUpType;
  position: THREE.Vector3;
  trackProgress: number;
  lateralOffset: number;
  mesh: THREE.Group;
  crystalMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  respawnTimer: number; // 0 = active
}

export interface BuiltTrack {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  totalLength: number;
  roadWidth: number;
  samples: SplineSample[];
  powerUpNodes: PowerUpSpawnNode[];
  minimapPoints: { x: number; z: number }[];
  checkpoints: number[]; // normalized t values
}

// Canonical Blur (2010) Power-Up Color Palette (from Power-up_Intro_Screen.png)
export const POWERUP_COLORS: Record<PowerUpType, number> = {
  NITRO: 0x4ade80,     // Vibrant Green
  BOLTS: 0xe879f9,     // Magenta / Pink
  MISSILE: 0xf43f5e,   // Crimson Red (Shunt)
  SHOCKWAVE: 0xa855f7, // Electric Purple (Barge)
  MINE: 0xf59e0b,      // Amber Gold
  SHIELD: 0xe2e8f0,    // Pure White / Silver
  REPAIR: 0xfacc15,    // Repair Yellow
};

const ALL_POWERUP_TYPES: PowerUpType[] = [
  'BOLTS',
  'NITRO',
  'MISSILE',
  'SHIELD',
  'SHOCKWAVE',
  'MINE',
  'REPAIR',
];

function createRoadPBRTextures(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 1024;
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = size;
  diffCanvas.height = size;
  const dCtx = diffCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  // Base coarse charcoal asphalt
  dCtx.fillStyle = '#252932';
  dCtx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#a8a8a8'; // Medium-high roughness base (~0.66)
  rCtx.fillRect(0, 0, size, size);

  // Subtle darker, smoother tire-polished racing grooves in the 3 lanes
  const laneCenters = [size * 0.24, size * 0.5, size * 0.76];
  for (const lc of laneCenters) {
    for (const trackOffset of [-38, 38]) {
      const gradD = dCtx.createLinearGradient(lc + trackOffset - 28, 0, lc + trackOffset + 28, 0);
      gradD.addColorStop(0, 'rgba(18, 21, 26, 0)');
      gradD.addColorStop(0.5, 'rgba(14, 17, 22, 0.45)');
      gradD.addColorStop(1, 'rgba(18, 21, 26, 0)');
      dCtx.fillStyle = gradD;
      dCtx.fillRect(lc + trackOffset - 28, 0, 56, size);

      const gradR = rCtx.createLinearGradient(lc + trackOffset - 28, 0, lc + trackOffset + 28, 0);
      gradR.addColorStop(0, 'rgba(85, 85, 85, 0)');
      gradR.addColorStop(0.5, 'rgba(55, 55, 55, 0.65)'); // Polished specular groove
      gradR.addColorStop(1, 'rgba(85, 85, 85, 0)');
      rCtx.fillStyle = gradR;
      rCtx.fillRect(lc + trackOffset - 28, 0, 56, size);
    }
  }

  // High-density tarmac aggregate grain & subtle asphalt tar seams
  for (let i = 0; i < 16000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const bright = Math.random() > 0.48;
    dCtx.fillStyle = bright ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.075)';
    dCtx.fillRect(x, y, 2, 2);
    rCtx.fillStyle = bright ? 'rgba(210,210,210,0.08)' : 'rgba(60,60,60,0.08)';
    rCtx.fillRect(x, y, 3, 3);
  }

  // Longitudinal tar repair cracks
  dCtx.strokeStyle = 'rgba(12, 14, 18, 0.55)';
  dCtx.lineWidth = 2.5;
  for (const seamX of [size * 0.37, size * 0.63]) {
    dCtx.beginPath();
    for (let y = 0; y <= size; y += 32) {
      const jitter = Math.sin(y * 0.05) * 3;
      if (y === 0) dCtx.moveTo(seamX + jitter, y);
      else dCtx.lineTo(seamX + jitter, y);
    }
    dCtx.stroke();
  }

  // Concrete shoulder curbs on far left & right edges
  for (let y = 0; y < size; y += 64) {
    const isAlt = (y / 64) % 2 === 0;
    dCtx.fillStyle = isAlt ? '#cbd5e1' : '#475569';
    dCtx.fillRect(0, y, 26, 64);
    dCtx.fillRect(size - 26, y, 26, 64);
  }

  // Crisp painted white solid road edge lines (Blur_screenshot_011 & 012)
  dCtx.fillStyle = 'rgba(241, 245, 249, 0.88)';
  dCtx.fillRect(34, 0, 10, size);
  dCtx.fillRect(size - 44, 0, 10, size);

  // Dashed lane dividers (3 lanes)
  dCtx.fillStyle = 'rgba(241, 245, 249, 0.72)';
  for (let y = 0; y < size; y += 128) {
    dCtx.fillRect(Math.floor(size * 0.365), y + 20, 8, 68);
    dCtx.fillRect(Math.floor(size * 0.635), y + 20, 8, 68);
  }

  // Subtle painted directional highway arrow in center lane (Blur_screenshot_011)
  dCtx.fillStyle = 'rgba(226, 232, 240, 0.28)';
  const ax = size * 0.5;
  const ay = size * 0.5;
  dCtx.beginPath();
  dCtx.moveTo(ax, ay - 70);
  dCtx.lineTo(ax + 32, ay - 20);
  dCtx.lineTo(ax + 12, ay - 20);
  dCtx.lineTo(ax + 12, ay + 55);
  dCtx.lineTo(ax - 12, ay + 55);
  dCtx.lineTo(ax - 12, ay - 20);
  dCtx.lineTo(ax - 32, ay - 20);
  dCtx.closePath();
  dCtx.fill();

  const map = new THREE.CanvasTexture(diffCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 110);
  map.anisotropy = 16;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(1, 110);
  roughnessMap.anisotropy = 8;

  return { map, roughnessMap, bumpMap: roughnessMap };
}

function createWeatheredConcreteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Weathered warm-grey concrete base (like Blur_screenshot_004 LA River walls)
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3e4452');
  grad.addColorStop(0.7, '#4f5666');
  grad.addColorStop(1, '#2b303c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Vertical water stain streaks & panel joints
  for (let x = 0; x < 512; x += 64) {
    ctx.fillStyle = 'rgba(15, 18, 24, 0.55)';
    ctx.fillRect(x, 0, 3, 256);
    ctx.fillStyle = 'rgba(28, 32, 40, 0.25)';
    ctx.fillRect(x + 12, 0, 18, 180);
  }

  // Yellow/Black hazard strip along bottom curb edge
  for (let x = 0; x < 512; x += 32) {
    ctx.fillStyle = (x / 32) % 2 === 0 ? '#eab308' : '#1e293b';
    ctx.fillRect(x, 232, 32, 24);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(120, 1);
  return tex;
}

function createChevronSignTexture(pointRight: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, 256, 128);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 120);

  // Draw 3 bold glowing white chevrons <<< or >>> (Blur_screenshot_002 & 012)
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 12;

  const dir = pointRight ? 1 : -1;
  for (const cx of [58, 128, 198]) {
    ctx.beginPath();
    ctx.moveTo(cx - dir * 22, 20);
    ctx.lineTo(cx + dir * 22, 64);
    ctx.lineTo(cx - dir * 22, 108);
    ctx.lineTo(cx - dir * 6, 108);
    ctx.lineTo(cx + dir * 38, 64);
    ctx.lineTo(cx - dir * 6, 20);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createUrbanFacadeTexture(
  wallColor: string,
  shopColor: string,
  shopName: string
): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const emCanvas = document.createElement('canvas');
  emCanvas.width = 512;
  emCanvas.height = 512;
  const emCtx = emCanvas.getContext('2d')!;
  emCtx.fillStyle = '#000000';
  emCtx.fillRect(0, 0, 512, 512);

  // Masonry / brick / concrete facade base with vertical architectural pilasters
  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle brick/stone course lines & vertical pilasters
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let x = 0; x < 512; x += 128) {
    ctx.fillRect(x, 0, 10, 428);
  }
  for (let y = 0; y < 428; y += 12) {
    ctx.fillStyle = y % 24 === 0 ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(0, y, 512, 2);
  }

  // Warm upward streetlamp bounce gradient on lower 60% of building facade
  const bounceGrad = ctx.createLinearGradient(0, 512, 0, 140);
  bounceGrad.addColorStop(0, 'rgba(255, 190, 110, 0.22)');
  bounceGrad.addColorStop(0.5, 'rgba(255, 190, 110, 0.06)');
  bounceGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bounceGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal floor cornice ledges
  for (let y = 64; y < 430; y += 72) {
    ctx.fillStyle = 'rgba(12, 16, 24, 0.78)';
    ctx.fillRect(0, y - 6, 512, 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(0, y, 512, 4);
  }

  // Recessed multi-pane architectural windows
  for (let y = 24; y < 400; y += 72) {
    for (let x = 24; x < 480; x += 60) {
      const lit = Math.sin(x * 12.3 + y * 7.1) > 0.05;
      // Outer stone window sill & frame
      ctx.fillStyle = '#0f1420';
      ctx.fillRect(x - 3, y - 3, 42, 48);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(x - 4, y + 43, 44, 4);

      if (lit) {
        const warm = Math.cos(x * 3.7 + y) > -0.25;
        const winColor = warm ? '#fde68a' : '#bae6fd';
        ctx.fillStyle = winColor;
        ctx.fillRect(x, y, 36, 42);
        emCtx.fillStyle = warm ? '#f59e0b' : '#38bdf8';
        emCtx.fillRect(x, y, 36, 42);

        // Window mullion crossbars
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x + 17, y, 2, 42);
        ctx.fillRect(x, y + 20, 36, 2);
        emCtx.fillStyle = '#000000';
        emCtx.fillRect(x + 17, y, 2, 42);
        emCtx.fillRect(x, y + 20, 36, 2);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x, y, 36, 42);
      }
    }
  }

  // Ground-floor storefront fascia & illuminated display windows (like "The Guest List" in Blur_screenshot_002)
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 428, 512, 84);

  ctx.fillStyle = shopColor;
  ctx.fillRect(12, 432, 488, 24);
  emCtx.fillStyle = shopColor;
  emCtx.fillRect(12, 432, 488, 24);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  ctx.fillText(shopName, 26, 450);
  emCtx.fillStyle = '#ffffff';
  emCtx.font = 'bold 16px "Segoe UI", sans-serif';
  emCtx.fillText(shopName, 26, 450);

  // Warm illuminated ground shop windows
  for (let sx = 20; sx < 480; sx += 118) {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(sx, 462, 98, 44);
    emCtx.fillStyle = '#fbbf24';
    emCtx.fillRect(sx, 462, 98, 44);

    // Shop window vertical mullion bars
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(sx + 48, 462, 3, 44);
    emCtx.fillStyle = '#000000';
    emCtx.fillRect(sx + 48, 462, 3, 44);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;

  const emissiveMap = new THREE.CanvasTexture(emCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.ClampToEdgeWrapping;

  return { map, emissiveMap };
}

function createGroundTerrainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1a1e29';
  ctx.fillRect(0, 0, 512, 512);

  // Urban concrete block paving & asphalt lot variation (no neon wireframe grid!)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  return tex;
}

export function buildTrack(trackDef: TrackDefinition): BuiltTrack {
  const group = new THREE.Group();
  const pts = trackDef.controlPoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  const totalLength = curve.getLength();
  const roadWidth = trackDef.roadWidth;
  const halfWidth = roadWidth * 0.5;

  const sampleCount = 600;
  const spacedPoints = curve.getSpacedPoints(sampleCount);
  const samples: SplineSample[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    const p = spacedPoints[i];
    const nextP = spacedPoints[(i + 1) % sampleCount];
    const prevP = spacedPoints[(i - 1 + sampleCount) % sampleCount];

    const tangent = new THREE.Vector3().subVectors(nextP, prevP).normalize();
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const up = new THREE.Vector3().crossVectors(right, tangent).normalize();

    samples.push({
      index: i,
      t,
      distance: t * totalLength,
      point: p.clone(),
      tangent,
      right,
      up,
      curvature: 0,
    });
  }

  // Compute curvature for AI corner speed lookahead & Corner Chevron placement
  for (let i = 0; i < sampleCount; i++) {
    const prev = samples[(i - 4 + sampleCount) % sampleCount];
    const next = samples[(i + 4) % sampleCount];
    const angle = prev.tangent.angleTo(next.tangent);
    const crossY = prev.tangent.x * next.tangent.z - prev.tangent.z * next.tangent.x;
    samples[i].curvature = angle * Math.sign(crossY || 1);
  }

  // ==========================================================================
  // 1. CONTINUOUS 3D ROAD RIBBON + WEATHERED CONCRETE BARRIERS + ARMCO RAILS
  // ==========================================================================
  const roadPositions: number[] = [];
  const roadNormals: number[] = [];
  const roadUvs: number[] = [];
  const roadIndices: number[] = [];

  const barrierHeight = 1.42;
  const barrierWidth = 0.95;
  const barrierPositions: number[] = [];
  const barrierNormals: number[] = [];
  const barrierUvs: number[] = [];
  const barrierIndices: number[] = [];

  const armcoPositions: number[] = [];
  const armcoNormals: number[] = [];
  const armcoIndices: number[] = [];

  for (let i = 0; i <= sampleCount; i++) {
    const s = samples[i % sampleCount];
    const vCoord = (i / sampleCount) * 110;
    const wallU = i / sampleCount;

    const leftEdge = s.point.clone().addScaledVector(s.right, -halfWidth);
    const rightEdge = s.point.clone().addScaledVector(s.right, halfWidth);

    roadPositions.push(leftEdge.x, leftEdge.y, leftEdge.z);
    roadPositions.push(rightEdge.x, rightEdge.y, rightEdge.z);

    roadNormals.push(s.up.x, s.up.y, s.up.z);
    roadNormals.push(s.up.x, s.up.y, s.up.z);

    roadUvs.push(0, vCoord);
    roadUvs.push(1, vCoord);

    if (i < sampleCount) {
      const base = i * 2;
      roadIndices.push(base, base + 1, base + 2);
      roadIndices.push(base + 1, base + 3, base + 2);
    }

    // Left & Right Weathered Concrete Retaining Barrier
    const lInnerBot = leftEdge.clone();
    const lInnerTop = leftEdge.clone().add(new THREE.Vector3(0, barrierHeight, 0));
    const lOuterTop = leftEdge
      .clone()
      .addScaledVector(s.right, -barrierWidth)
      .add(new THREE.Vector3(0, barrierHeight, 0));

    const rInnerBot = rightEdge.clone();
    const rInnerTop = rightEdge.clone().add(new THREE.Vector3(0, barrierHeight, 0));
    const rOuterTop = rightEdge
      .clone()
      .addScaledVector(s.right, barrierWidth)
      .add(new THREE.Vector3(0, barrierHeight, 0));

    barrierPositions.push(
      lInnerBot.x, lInnerBot.y, lInnerBot.z,
      lInnerTop.x, lInnerTop.y, lInnerTop.z,
      lOuterTop.x, lOuterTop.y, lOuterTop.z,
      rInnerBot.x, rInnerBot.y, rInnerBot.z,
      rInnerTop.x, rInnerTop.y, rInnerTop.z,
      rOuterTop.x, rOuterTop.y, rOuterTop.z
    );

    barrierNormals.push(
      s.right.x, 0.25, s.right.z,
      0, 1, 0,
      0, 1, 0,
      -s.right.x, 0.25, -s.right.z,
      0, 1, 0,
      0, 1, 0
    );

    barrierUvs.push(
      wallU, 1,
      wallU, 0,
      wallU, 0,
      wallU, 1,
      wallU, 0,
      wallU, 0
    );

    // Metallic Corrugated Armco Guardrail strip along barrier face (height 0.55m..0.88m)
    const lArmBot = leftEdge.clone().addScaledVector(s.right, 0.06).add(new THREE.Vector3(0, 0.52, 0));
    const lArmTop = leftEdge.clone().addScaledVector(s.right, 0.06).add(new THREE.Vector3(0, 0.88, 0));
    const rArmBot = rightEdge.clone().addScaledVector(s.right, -0.06).add(new THREE.Vector3(0, 0.52, 0));
    const rArmTop = rightEdge.clone().addScaledVector(s.right, -0.06).add(new THREE.Vector3(0, 0.88, 0));

    armcoPositions.push(
      lArmBot.x, lArmBot.y, lArmBot.z,
      lArmTop.x, lArmTop.y, lArmTop.z,
      rArmBot.x, rArmBot.y, rArmBot.z,
      rArmTop.x, rArmTop.y, rArmTop.z
    );

    armcoNormals.push(
      s.right.x, 0.1, s.right.z,
      s.right.x, 0.1, s.right.z,
      -s.right.x, 0.1, -s.right.z,
      -s.right.x, 0.1, -s.right.z
    );

    if (i < sampleCount) {
      const b = i * 6;
      const nb = (i + 1) * 6;
      barrierIndices.push(b, nb, b + 1, b + 1, nb, nb + 1);
      barrierIndices.push(b + 1, nb + 1, b + 2, b + 2, nb + 1, nb + 2);
      barrierIndices.push(b + 3, b + 4, nb + 3, b + 4, nb + 4, nb + 3);
      barrierIndices.push(b + 4, b + 5, nb + 4, b + 5, nb + 5, nb + 4);

      const ab = i * 4;
      const nab = (i + 1) * 4;
      armcoIndices.push(ab, nab, ab + 1, ab + 1, nab, nab + 1);
      armcoIndices.push(ab + 2, ab + 3, nab + 2, ab + 3, nab + 3, nab + 2);
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNormals, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);

  const pbrRoad = createRoadPBRTextures();
  const roadMat = new THREE.MeshStandardMaterial({
    map: pbrRoad.map,
    roughnessMap: pbrRoad.roughnessMap,
    bumpMap: pbrRoad.bumpMap,
    bumpScale: 0.018,
    roughness: 0.62,
    metalness: 0.18,
    envMapIntensity: 1.35,
    side: THREE.DoubleSide,
  });

  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const barrierGeo = new THREE.BufferGeometry();
  barrierGeo.setAttribute('position', new THREE.Float32BufferAttribute(barrierPositions, 3));
  barrierGeo.setAttribute('normal', new THREE.Float32BufferAttribute(barrierNormals, 3));
  barrierGeo.setAttribute('uv', new THREE.Float32BufferAttribute(barrierUvs, 2));
  barrierGeo.setIndex(barrierIndices);

  const barrierMat = new THREE.MeshStandardMaterial({
    map: createWeatheredConcreteTexture(),
    roughness: 0.78,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });
  const barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
  barrierMesh.receiveShadow = true;
  group.add(barrierMesh);

  const armcoGeo = new THREE.BufferGeometry();
  armcoGeo.setAttribute('position', new THREE.Float32BufferAttribute(armcoPositions, 3));
  armcoGeo.setAttribute('normal', new THREE.Float32BufferAttribute(armcoNormals, 3));
  armcoGeo.setIndex(armcoIndices);

  const armcoMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.35,
    metalness: 0.78,
    envMapIntensity: 1.5,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(armcoGeo, armcoMat));

  // ==========================================================================
  // 2. PAVED URBAN GROUND PLANE & DISTANT HORIZON HILLS (No GridHelper!)
  // ==========================================================================
  const groundGeo = new THREE.PlaneGeometry(3200, 3200);
  const groundMat = new THREE.MeshStandardMaterial({
    map: createGroundTerrainTexture(),
    roughness: 0.88,
    metalness: 0.08,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.25;
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // Distant horizon mountain / urban hill silhouettes around perimeter (Blur_screenshot_003 & 012)
  buildHorizonSilhouettes(group);

  // ==========================================================================
  // 3. START / FINISH OVERHEAD TRUSS GANTRY
  // ==========================================================================
  buildStartFinishGantry(group, samples[0], roadWidth, trackDef.accentNeon, trackDef.secondaryNeon);

  // ==========================================================================
  // 4. BRIDGES, TUNNELS, STREETLAMPS, OVERHEAD SIGNS & CORNER CHEVRONS (<<<)
  // ==========================================================================
  buildTrackStructures(group, samples, roadWidth, trackDef);

  // ==========================================================================
  // 5. DETAILED URBAN BUILDINGS, STOREFRONTS, PYLONS & ROADSIDE TREES
  // ==========================================================================
  buildCityAndRoadsideScenery(group, samples, roadWidth, trackDef);

  // ==========================================================================
  // 6. CANONICAL BLUR FLOATING HOLOGRAM POWER-UP TABLETS
  // ==========================================================================
  const powerUpNodes = buildPowerUpSpawns(group, samples, totalLength, roadWidth);

  const minimapPoints: { x: number; z: number }[] = [];
  for (let i = 0; i < sampleCount; i += 5) {
    minimapPoints.push({ x: samples[i].point.x, z: samples[i].point.z });
  }

  const checkpoints = [0.15, 0.35, 0.55, 0.75, 0.92];

  return {
    group,
    curve,
    totalLength,
    roadWidth,
    samples,
    powerUpNodes,
    minimapPoints,
    checkpoints,
  };
}

function buildHorizonSilhouettes(group: THREE.Group): void {
  const hillMat = new THREE.MeshStandardMaterial({
    color: 0x141a29,
    roughness: 0.95,
    metalness: 0.05,
  });
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2;
    const dist = 820 + (i % 3) * 110;
    const hillW = 180 + (i % 4) * 55;
    const hillH = 45 + (i % 5) * 28;
    const hillGeo = new THREE.ConeGeometry(hillW, hillH, 7);
    const hill = new THREE.Mesh(hillGeo, hillMat);
    hill.position.set(Math.cos(angle) * dist, hillH * 0.45 - 5, Math.sin(angle) * dist);
    hill.rotation.y = i * 0.7;
    group.add(hill);
  }
}

function buildStartFinishGantry(
  group: THREE.Group,
  startSample: SplineSample,
  roadWidth: number,
  accentNeon: string,
  secondaryNeon: string
): void {
  const gantry = new THREE.Group();
  gantry.position.copy(startSample.point);
  const angle = Math.atan2(startSample.tangent.x, startSample.tangent.z);
  gantry.rotation.y = angle;

  // Checkered start/finish grid box on asphalt
  const checkerCanvas = document.createElement('canvas');
  checkerCanvas.width = 256;
  checkerCanvas.height = 64;
  const ctx = checkerCanvas.getContext('2d')!;
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 4; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f8fafc' : '#111827';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const checkerTex = new THREE.CanvasTexture(checkerCanvas);
  checkerTex.colorSpace = THREE.SRGBColorSpace;
  const lineMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(roadWidth - 0.8, 3.8),
    new THREE.MeshBasicMaterial({
      map: checkerTex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    })
  );
  lineMesh.rotation.x = -Math.PI / 2;
  lineMesh.position.y = 0.05;
  gantry.add(lineMesh);

  // Steel highway gantry truss
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.78,
    roughness: 0.28,
  });
  const neonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(accentNeon) });
  const neonMat2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(secondaryNeon) });

  const halfW = roadWidth * 0.5 + 1.1;
  const pillarGeo = new THREE.BoxGeometry(1.1, 10.5, 1.1);
  const leftPillar = new THREE.Mesh(pillarGeo, steelMat);
  leftPillar.position.set(-halfW, 5.25, 0);
  const rightPillar = new THREE.Mesh(pillarGeo, steelMat);
  rightPillar.position.set(halfW, 5.25, 0);
  gantry.add(leftPillar, rightPillar);

  const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 1.6, 1.8, 1.4), steelMat);
  crossBeam.position.set(0, 9.6, 0);
  gantry.add(crossBeam);

  // Start light pods across gantry
  for (let lx = -6; lx <= 6; lx += 3) {
    const pod = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.55, 0.35),
      lx % 2 === 0 ? neonMat : neonMat2
    );
    pod.position.set(lx, 9.6, -0.8);
    gantry.add(pod);
  }

  group.add(gantry);
}

function buildTrackStructures(
  group: THREE.Group,
  samples: SplineSample[],
  roadWidth: number,
  trackDef: TrackDefinition
): void {
  const halfW = roadWidth * 0.5 + 0.85;
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.72,
    roughness: 0.32,
  });
  const warmSodiumMat = new THREE.MeshBasicMaterial({ color: 0xffedd5 });
  const coolLedMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x333b4d, roughness: 0.82 });

  const chevronLeftTex = createChevronSignTexture(false);
  const chevronRightTex = createChevronSignTexture(true);
  const chevronLeftMat = new THREE.MeshBasicMaterial({ map: chevronLeftTex, side: THREE.DoubleSide });
  const chevronRightMat = new THREE.MeshBasicMaterial({ map: chevronRightTex, side: THREE.DoubleSide });
  const chevronGeo = new THREE.PlaneGeometry(3.2, 1.55);

  // Soft road light pool decal & lamp halo sprite beneath streetlamps
  const poolCanvas = document.createElement('canvas');
  poolCanvas.width = 128;
  poolCanvas.height = 128;
  const pCtx = poolCanvas.getContext('2d')!;
  const pGrad = pCtx.createRadialGradient(64, 64, 4, 64, 64, 60);
  pGrad.addColorStop(0, 'rgba(255, 220, 150, 0.42)');
  pGrad.addColorStop(0.5, 'rgba(255, 200, 120, 0.16)');
  pGrad.addColorStop(1, 'rgba(255, 200, 120, 0)');
  pCtx.fillStyle = pGrad;
  pCtx.fillRect(0, 0, 128, 128);
  const poolTex = new THREE.CanvasTexture(poolCanvas);
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const poolGeo = new THREE.PlaneGeometry(18, 18);
  poolGeo.rotateX(-Math.PI / 2);

  const lampHaloMat = new THREE.SpriteMaterial({
    map: poolTex,
    color: 0xffe4b5,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  for (let i = 0; i < samples.length; i += 4) {
    const s = samples[i];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);

    // 1. Signature Blur (2010) Corner Chevron Boards (<<< / >>>) on outside of bends
    if (Math.abs(s.curvature) > 0.068 && i % 4 === 0) {
      const outsideSide = s.curvature > 0 ? 1 : -1;
      const pointRight = s.curvature < 0;
      const chevGroup = new THREE.Group();
      const boardPos = s.point
        .clone()
        .addScaledVector(s.right, outsideSide * (halfW + 0.65))
        .add(new THREE.Vector3(0, 2.05, 0));
      chevGroup.position.copy(boardPos);
      // Angle slightly toward oncoming drivers
      chevGroup.rotation.y = yaw - outsideSide * 0.35;

      const board = new THREE.Mesh(
        chevronGeo,
        pointRight ? chevronRightMat : chevronLeftMat
      );
      chevGroup.add(board);

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.1, 0.16), poleMat);
      post.position.y = -0.9;
      chevGroup.add(post);

      group.add(chevGroup);
    }

    if (i % 12 !== 0) continue;

    // 2. Elevated Bridge Piers & Steel Suspension Arches
    if (s.point.y > 2.0) {
      const pierHeight = s.point.y + 0.5;
      const pierGeo = new THREE.BoxGeometry(roadWidth * 0.9, pierHeight, 2.6);
      const pier = new THREE.Mesh(pierGeo, concreteMat);
      pier.position.set(s.point.x, s.point.y - pierHeight * 0.5 - 0.1, s.point.z);
      pier.rotation.y = yaw;
      group.add(pier);

      if (i % 24 === 0 && s.point.y > 6) {
        const archGroup = new THREE.Group();
        archGroup.position.copy(s.point);
        archGroup.rotation.y = yaw;

        const towerL = new THREE.Mesh(new THREE.BoxGeometry(1.3, 17, 1.3), poleMat);
        towerL.position.set(-halfW, 8.5, 0);
        const towerR = new THREE.Mesh(new THREE.BoxGeometry(1.3, 17, 1.3), poleMat);
        towerR.position.set(halfW, 8.5, 0);
        const topTruss = new THREE.Mesh(
          new THREE.BoxGeometry(halfW * 2 + 1.6, 1.4, 1.4),
          poleMat
        );
        topTruss.position.set(0, 16.5, 0);

        // Suspension cables
        const cableGeo = new THREE.CylinderGeometry(0.08, 0.08, 15, 6);
        const cableL = new THREE.Mesh(cableGeo, poleMat);
        cableL.position.set(-halfW, 8, 4.5);
        cableL.rotation.x = 0.45;
        const cableR = new THREE.Mesh(cableGeo, poleMat);
        cableR.position.set(halfW, 8, 4.5);
        cableR.rotation.x = 0.45;

        archGroup.add(towerL, towerR, topTruss, cableL, cableR);
        group.add(archGroup);
      }
    }

    // 3. Underground Expressway Tunnel Ribs (t = 0.72..0.84)
    if (s.t >= 0.72 && s.t <= 0.84) {
      const tunnelFrame = new THREE.Group();
      tunnelFrame.position.copy(s.point);
      tunnelFrame.rotation.y = yaw;

      const wallL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8.8, 4.2), concreteMat);
      wallL.position.set(-halfW - 0.5, 4.4, 0);
      const wallR = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8.8, 4.2), concreteMat);
      wallR.position.set(halfW + 0.5, 4.4, 0);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 2.6, 1.4, 4.2), concreteMat);
      roof.position.set(0, 8.8, 0);

      const stripL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 3.6), warmSodiumMat);
      stripL.position.set(-halfW + 1.8, 7.9, 0);
      const stripR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 3.6), warmSodiumMat);
      stripR.position.set(halfW - 1.8, 7.9, 0);

      tunnelFrame.add(wallL, wallR, roof, stripL, stripR);
      group.add(tunnelFrame);
      continue;
    }

    // 4. Dual-Sided Urban Highway Streetlamps + Road Light Pools
    const lampGroup = new THREE.Group();
    lampGroup.position.copy(s.point);
    lampGroup.rotation.y = yaw;

    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 8.4, 8), poleMat);
      pole.position.set(side * (halfW + 0.35), 4.2, 0);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.16, 0.18), poleMat);
      arm.position.set(side * (halfW - 0.9), 8.2, 0);
      arm.rotation.z = side * 0.12;

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.16, 0.42),
        i % 24 === 0 ? coolLedMat : warmSodiumMat
      );
      head.position.set(side * (halfW - 2.1), 8.05, 0);

      const halo = new THREE.Sprite(lampHaloMat);
      halo.position.set(side * (halfW - 2.1), 7.85, 0);
      halo.scale.set(3.4, 2.2, 1);

      lampGroup.add(pole, arm, head, halo);
    }

    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.set(0, 0.04, 0);
    lampGroup.add(pool);

    group.add(lampGroup);
  }
}

function buildCityAndRoadsideScenery(
  group: THREE.Group,
  samples: SplineSample[],
  roadWidth: number,
  trackDef: TrackDefinition
): void {
  // Create 3 distinct architectural facade textures (Brick Storefront, Modern Concrete/Glass, Industrial Warehouse)
  const fac1 = createUrbanFacadeTexture('#52302c', '#dc2626', 'THE GUEST LIST // HACKNEY');
  const fac2 = createUrbanFacadeTexture('#364156', '#0284c7', 'METRO EXPRESS // GARAGE');
  const fac3 = createUrbanFacadeTexture('#454c59', '#d97706', 'DOCKLANDS // INDUSTRIAL');

  const facadeMaterials = [
    new THREE.MeshStandardMaterial({
      map: fac1.map,
      emissiveMap: fac1.emissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.92,
      roughness: 0.62,
      metalness: 0.18,
    }),
    new THREE.MeshStandardMaterial({
      map: fac2.map,
      emissiveMap: fac2.emissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.92,
      roughness: 0.45,
      metalness: 0.38,
    }),
    new THREE.MeshStandardMaterial({
      map: fac3.map,
      emissiveMap: fac3.emissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.92,
      roughness: 0.68,
      metalness: 0.25,
    }),
  ];

  const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.85 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 });
  const foliageMat1 = new THREE.MeshStandardMaterial({ color: 0x1e3a29, roughness: 0.85 });
  const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x264631, roughness: 0.85 });
  const pylonMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.7,
    roughness: 0.35,
  });

  const minRoadClearanceSq = Math.pow(roadWidth * 0.5 + 16, 2);
  const treeClearanceSq = Math.pow(roadWidth * 0.5 + 5.5, 2);

  // 1. Near-field Roadside Trees, Shrubs & Utility Pylons (Blur_screenshot_001 & 004)
  for (let i = 0; i < samples.length; i += 7) {
    const s = samples[i];
    if (s.point.y > 3.5 || (s.t >= 0.72 && s.t <= 0.84)) continue;

    for (const side of [-1, 1]) {
      const treeDist = roadWidth * 0.5 + 7.5 + ((i * 5) % 9);
      const treePos = s.point.clone().addScaledVector(s.right, side * treeDist);

      let treeSafe = true;
      for (let j = 0; j < samples.length; j += 4) {
        const dx = treePos.x - samples[j].point.x;
        const dz = treePos.z - samples[j].point.z;
        if (dx * dx + dz * dz < treeClearanceSq) {
          treeSafe = false;
          break;
        }
      }
      if (!treeSafe) continue;

      // Build multi-cluster street tree
      const treeGroup = new THREE.Group();
      treeGroup.position.set(treePos.x, -0.2, treePos.z);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 3.6, 7), trunkMat);
      trunk.position.y = 1.8;
      treeGroup.add(trunk);

      const fMat = i % 2 === 0 ? foliageMat1 : foliageMat2;
      const mainCanopy = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 1), fMat);
      mainCanopy.position.set(0, 4.6, 0);
      mainCanopy.scale.set(1.1, 0.9, 1.1);
      treeGroup.add(mainCanopy);

      const subCanopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.85, 1), fMat);
      subCanopy.position.set(1.1, 3.8, 0.8);
      treeGroup.add(subCanopy);

      group.add(treeGroup);
    }

    // High-voltage lattice transmission towers every 42 samples (Blur_screenshot_004)
    if (i % 42 === 0) {
      const pylonPos = s.point.clone().addScaledVector(s.right, -(roadWidth * 0.5 + 19));
      let pylonSafe = true;
      for (let j = 0; j < samples.length; j += 4) {
        const dx = pylonPos.x - samples[j].point.x;
        const dz = pylonPos.z - samples[j].point.z;
        if (dx * dx + dz * dz < minRoadClearanceSq) {
          pylonSafe = false;
          break;
        }
      }
      if (pylonSafe) {
        const pylon = new THREE.Group();
        pylon.position.set(pylonPos.x, -0.2, pylonPos.z);
        const towerBody = new THREE.Mesh(
          new THREE.ConeGeometry(2.8, 34, 4, 1, true),
          new THREE.MeshStandardMaterial({
            color: 0x64748b,
            wireframe: true,
            metalness: 0.7,
            roughness: 0.3,
          })
        );
        towerBody.position.y = 17;
        pylon.add(towerBody);

        for (const armY of [22, 28, 33]) {
          const crossArm = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.45, 0.45), pylonMat);
          crossArm.position.y = armY;
          pylon.add(crossArm);
        }
        group.add(pylon);
      }
    }
  }

  // 2. Multi-Tier Urban Buildings & Storefronts Lining the Street Corridor (Blur_screenshot_002)
  for (let i = 0; i < samples.length; i += 8) {
    const s = samples[i];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);

    for (const side of [-1, 1]) {
      const distFromCenter = roadWidth * 0.5 + 22 + ((i * 11) % 24);
      const candidate = s.point.clone().addScaledVector(s.right, side * distFromCenter);

      let safe = true;
      for (let j = 0; j < samples.length; j += 4) {
        const dx = candidate.x - samples[j].point.x;
        const dz = candidate.z - samples[j].point.z;
        if (dx * dx + dz * dz < minRoadClearanceSq) {
          safe = false;
          break;
        }
      }
      if (!safe) continue;

      const w = 16 + ((i * 7) % 14);
      const d = 15 + ((i * 13) % 14);
      // Realistic urban street building heights (14m to 46m so they frame the horizon like Hackney in Blur_screenshot_002)
      const h = 15 + ((i * 19) % 34);

      const bldgGroup = new THREE.Group();
      bldgGroup.position.set(candidate.x, -0.25, candidate.z);
      bldgGroup.rotation.y = yaw;

      const fMat = facadeMaterials[(i + (side > 0 ? 1 : 0)) % facadeMaterials.length];
      const mainBlock = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fMat);
      mainBlock.position.y = h * 0.5;
      mainBlock.castShadow = true;
      mainBlock.receiveShadow = true;
      bldgGroup.add(mainBlock);

      // Architectural roof cornice & rooftop HVAC penthouse
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.75, d + 0.8), roofMat);
      cornice.position.y = h + 0.25;
      bldgGroup.add(cornice);

      const hvac = new THREE.Mesh(new THREE.BoxGeometry(w * 0.38, 2.4, d * 0.38), roofMat);
      hvac.position.set(w * 0.15, h + 1.4, -d * 0.1);
      bldgGroup.add(hvac);

      group.add(bldgGroup);
    }
  }
}

function buildPowerUpSpawns(
  group: THREE.Group,
  samples: SplineSample[],
  totalLength: number,
  roadWidth: number
): PowerUpSpawnNode[] {
  const nodes: PowerUpSpawnNode[] = [];
  const rowProgressPoints = [0.06, 0.16, 0.27, 0.38, 0.49, 0.60, 0.71, 0.83, 0.93];
  const laneOffsets = [-roadWidth * 0.27, 0, roadWidth * 0.27];

  // Canonical Blur (2010) upright rounded-square hologram tablet geometry
  const tabletGeo = new THREE.PlaneGeometry(1.72, 1.72);
  const ringGeo = new THREE.RingGeometry(0.95, 1.25, 28);
  ringGeo.rotateX(-Math.PI / 2);

  // Pre-build 1 high-res hologram texture per PowerUpType
  const tabletMaterials: Record<PowerUpType, THREE.MeshBasicMaterial> = {} as Record<
    PowerUpType,
    THREE.MeshBasicMaterial
  >;
  for (const type of ALL_POWERUP_TYPES) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    drawBlurPowerUpCanvas(ctx, type, 256, true);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tabletMaterials[type] = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  rowProgressPoints.forEach((progress, rowIdx) => {
    const sampleIdx = Math.floor(progress * samples.length) % samples.length;
    const s = samples[sampleIdx];
    const roadYaw = Math.atan2(-s.tangent.x, -s.tangent.z);

    laneOffsets.forEach((latOffset, laneIdx) => {
      const type = ALL_POWERUP_TYPES[(rowIdx * 3 + laneIdx) % ALL_POWERUP_TYPES.length];
      const colorHex = POWERUP_COLORS[type];

      const pos = s.point
        .clone()
        .addScaledVector(s.right, latOffset)
        .add(new THREE.Vector3(0, 1.28, 0));

      const nodeGroup = new THREE.Group();
      nodeGroup.position.copy(pos);
      // Orient tablet to face oncoming drivers along the road tangent (Blur_screenshot_002)
      nodeGroup.rotation.y = roadYaw;

      const crystalMesh = new THREE.Mesh(tabletGeo, tabletMaterials[type]);
      nodeGroup.add(crystalMesh);

      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = -1.2;
      nodeGroup.add(ringMesh);

      group.add(nodeGroup);

      nodes.push({
        id: `pu-${rowIdx}-${laneIdx}`,
        type,
        position: pos,
        trackProgress: s.t,
        lateralOffset: latOffset,
        mesh: nodeGroup,
        crystalMesh,
        ringMesh,
        respawnTimer: 0,
      });
    });
  });

  return nodes;
}
