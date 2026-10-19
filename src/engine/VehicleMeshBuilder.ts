import * as THREE from 'three';
import { PowerUpType, VehicleSpec } from '../types/game';
import { assetLoader } from './AssetLoader';
import { drawBlurPowerUpCanvas, POWERUP_META } from '../components/PowerUpBadge';

export interface BuiltVehicleObject {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
  wheels: THREE.Object3D[];
  taillightMat: THREE.MeshStandardMaterial;
  taillightMaterials: THREE.MeshStandardMaterial[];
  brakeFlareGroup: THREE.Group;
  nitroFlameGroup: THREE.Group;
  shieldMesh: THREE.Mesh;
  updateBumperSlots: (slots: (PowerUpType | null)[], selectedSlot: number) => void;
  updateRivalTag: (name: string, healthPct: number, visible: boolean) => void;
  setBraking: (isBraking: boolean) => void;
}

function createFlareTexture(colorHex: string, horizontalStretch = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const cx = 128;
  const cy = 64;

  // Radial core glow
  const radGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 56);
  radGrad.addColorStop(0, '#ffffff');
  radGrad.addColorStop(0.22, colorHex);
  radGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, 256, 128);

  // Horizontal anamorphic streak (signature Blur 2010 lens flare)
  if (horizontalStretch) {
    const linGrad = ctx.createLinearGradient(0, cy, 256, cy);
    linGrad.addColorStop(0, 'rgba(0,0,0,0)');
    linGrad.addColorStop(0.35, colorHex);
    linGrad.addColorStop(0.5, '#ffffff');
    linGrad.addColorStop(0.65, colorHex);
    linGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = linGrad;
    ctx.fillRect(4, cy - 5, 248, 10);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createHeadlightBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(128, 512, 128, 0);
  grad.addColorStop(0, 'rgba(195, 238, 255, 0.34)');
  grad.addColorStop(0.35, 'rgba(140, 215, 255, 0.14)');
  grad.addColorStop(1, 'rgba(100, 190, 255, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(110, 512);
  ctx.lineTo(146, 512);
  ctx.lineTo(250, 0);
  ctx.lineTo(6, 0);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildVehicleMesh(
  spec: VehicleSpec,
  isPlayer = false,
  customColorHex?: string
): BuiltVehicleObject {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const primaryColor = new THREE.Color(customColorHex || spec.primaryColor);
  const accentColor = new THREE.Color(spec.accentColor);

  // Physical automotive clearcoat paint material
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: primaryColor,
    metalness: 0.62,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.07,
    envMapIntensity: 2.2,
  });

  const secondaryMat = new THREE.MeshStandardMaterial({
    color: 0x12151e,
    metalness: 0.45,
    roughness: 0.48,
    envMapIntensity: 1.2,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xdce4f0,
    metalness: 0.92,
    roughness: 0.14,
    envMapIntensity: 2.4,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x070d19,
    metalness: 0.15,
    roughness: 0.05,
    transmission: 0.25,
    transparent: true,
    opacity: 0.82,
    envMapIntensity: 2.6,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xbceeff,
    emissiveIntensity: 3.8,
    roughness: 0.1,
  });

  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff1e28,
    emissive: 0xff1100,
    emissiveIntensity: 2.2,
    roughness: 0.15,
  });
  const taillightMaterials: THREE.MeshStandardMaterial[] = [taillightMat];

  // Fallback sculpted body group (shown for <100ms until GLB clone swaps in)
  const fallbackGroup = new THREE.Group();
  bodyGroup.add(fallbackGroup);

  const width = 2.08;
  const length = 4.72;

  const lowerMesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.46, length), bodyMat);
  lowerMesh.position.y = 0.48;
  lowerMesh.castShadow = true;
  lowerMesh.receiveShadow = true;
  fallbackGroup.add(lowerMesh);

  const cabinMesh = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.8, 0.44, length * 0.46),
    glassMat
  );
  cabinMesh.position.set(0, 0.92, 0.08);
  fallbackGroup.add(cabinMesh);

  // ==========================================================================
  // 1. CONTACT SHADOW AO DECAL (Grounds car & 4 tires to the asphalt)
  // ==========================================================================
  const aoTex = assetLoader.getContactShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(2.65, 5.25);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: aoTex,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.03;
  root.add(contactShadow);

  // ==========================================================================
  // 2. XENON HEADLIGHT BEAMS & ANAMORPHIC TAILLIGHT LENS FLARES
  // ==========================================================================
  const beamTex = createHeadlightBeamTexture();
  const beamGeo = new THREE.PlaneGeometry(2.2, 9.5);
  beamGeo.rotateX(-Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTex,
    transparent: true,
    opacity: isPlayer ? 0.22 : 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const leftBeam = new THREE.Mesh(beamGeo, beamMat);
  leftBeam.position.set(-0.68, 0.05, -7.2);
  bodyGroup.add(leftBeam);

  const rightBeam = new THREE.Mesh(beamGeo, beamMat);
  rightBeam.position.set(0.68, 0.05, -7.2);
  bodyGroup.add(rightBeam);

  // Front Xenon headlight flare sprites
  const headFlareTex = createFlareTexture('#9be7ff', true);
  const headFlareMat = new THREE.SpriteMaterial({
    map: headFlareTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const hlSpriteL = new THREE.Sprite(headFlareMat);
  hlSpriteL.position.set(-0.74, 0.64, -2.36);
  hlSpriteL.scale.set(1.35, 0.45, 1);
  bodyGroup.add(hlSpriteL);

  const hlSpriteR = new THREE.Sprite(headFlareMat);
  hlSpriteR.position.set(0.74, 0.64, -2.36);
  hlSpriteR.scale.set(1.35, 0.45, 1);
  bodyGroup.add(hlSpriteR);

  // Rear Taillight & Brake Light Anamorphic Flares (Blur_screenshot_003 & 012)
  const brakeFlareGroup = new THREE.Group();
  const tailFlareTex = createFlareTexture('#ff2200', true);
  const tailFlareMat = new THREE.SpriteMaterial({
    map: tailFlareTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });

  const tlSpriteL = new THREE.Sprite(tailFlareMat);
  tlSpriteL.position.set(-0.72, 0.74, 2.38);
  tlSpriteL.scale.set(1.45, 0.42, 1);

  const tlSpriteR = new THREE.Sprite(tailFlareMat);
  tlSpriteR.position.set(0.72, 0.74, 2.38);
  tlSpriteR.scale.set(1.45, 0.42, 1);

  brakeFlareGroup.add(tlSpriteL, tlSpriteR);
  bodyGroup.add(brakeFlareGroup);

  // ==========================================================================
  // 3. NITRO AFTERBURNER PLASMA CONES & SHIELD ENERGY HEX-DOME
  // ==========================================================================
  const nitroFlameGroup = new THREE.Group();
  const outerFlameGeo = new THREE.ConeGeometry(0.11, 0.68, 12);
  outerFlameGeo.rotateX(Math.PI / 2);
  const outerFlameMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const innerFlameGeo = new THREE.ConeGeometry(0.055, 0.44, 10);
  innerFlameGeo.rotateX(Math.PI / 2);
  const innerFlameMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const buildExhaustJet = (x: number) => {
    const jet = new THREE.Group();
    jet.add(new THREE.Mesh(outerFlameGeo, outerFlameMat));
    jet.add(new THREE.Mesh(innerFlameGeo, innerFlameMat));
    jet.position.set(x, 0.34, 2.52);
    return jet;
  };
  nitroFlameGroup.add(buildExhaustJet(-0.52), buildExhaustJet(0.52));
  nitroFlameGroup.visible = false;
  bodyGroup.add(nitroFlameGroup);

  // Protective Shield Energy Hex-Sphere
  const shieldGeo = new THREE.IcosahedronGeometry(2.75, 2);
  shieldGeo.scale(0.84, 0.52, 1.12);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0xe2e8f0,
    wireframe: true,
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
  });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.position.set(0, 0.76, 0);
  shieldMesh.visible = false;
  root.add(shieldMesh);

  // ==========================================================================
  // 4. DIEGETIC 3-SLOT REAR-BUMPER POWER-UP HOLOGRAM DOCK (Player Car Only)
  //    Matches Blur_screenshot_003.jpg & Blur_screenshot_004.jpg
  // ==========================================================================
  const bumperDockGroup = new THREE.Group();
  const bumperSlotMeshes: Array<{
    mesh: THREE.Mesh;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    tex: THREE.CanvasTexture;
    lastType: PowerUpType | null | undefined;
    lastSelected: boolean | undefined;
  }> = [];

  if (isPlayer) {
    // Positioned neatly across lower rear bumper valence so car badge & taillights stay clear
    bumperDockGroup.position.set(0, 0.41, 2.34);
    bumperDockGroup.rotation.x = -0.12; // Tilted slightly upward toward chase camera
    bodyGroup.add(bumperDockGroup);

    const slotXOffsets = [-0.35, 0.0, 0.35];
    for (let i = 0; i < 3; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      drawBlurPowerUpCanvas(ctx, null, 128, false);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const geo = new THREE.PlaneGeometry(0.28, 0.28);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(slotXOffsets[i], 0, 0);
      bumperDockGroup.add(mesh);

      bumperSlotMeshes.push({
        mesh,
        canvas,
        ctx,
        tex,
        lastType: undefined,
        lastSelected: undefined,
      });
    }
  }

  const updateBumperSlots = (slots: (PowerUpType | null)[], selectedSlot: number) => {
    if (!isPlayer) return;
    for (let i = 0; i < 3; i++) {
      const s = bumperSlotMeshes[i];
      const t = slots[i] || null;
      const sel = i === selectedSlot;
      if (s.lastType !== t || s.lastSelected !== sel) {
        s.lastType = t;
        s.lastSelected = sel;
        drawBlurPowerUpCanvas(s.ctx, t, 128, sel);
        s.tex.needsUpdate = true;
        const scale = sel ? 1.24 : 0.92;
        s.mesh.scale.set(scale, scale, 1);
        s.mesh.position.y = sel ? 0.03 : -0.01;
      }
    }
  };

  // ==========================================================================
  // 5. WORLD-SPACE RIVAL NAMEPLATE & 5-BAR HEALTH DISPLAY (AI Rivals Only)
  //    Matches "Shannon [|||||]" in Blur_screenshot_003.jpg
  // ==========================================================================
  let rivalSprite: THREE.Sprite | null = null;
  let rivalCanvas: HTMLCanvasElement | null = null;
  let rivalCtx: CanvasRenderingContext2D | null = null;
  let rivalTex: THREE.CanvasTexture | null = null;
  let lastRivalName = '';
  let lastRivalBars = -1;

  if (!isPlayer) {
    rivalCanvas = document.createElement('canvas');
    rivalCanvas.width = 256;
    rivalCanvas.height = 64;
    rivalCtx = rivalCanvas.getContext('2d')!;
    rivalTex = new THREE.CanvasTexture(rivalCanvas);
    rivalTex.colorSpace = THREE.SRGBColorSpace;
    const spriteMat = new THREE.SpriteMaterial({
      map: rivalTex,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    rivalSprite = new THREE.Sprite(spriteMat);
    rivalSprite.position.set(0, 1.78, 0);
    rivalSprite.scale.set(2.4, 0.6, 1);
    root.add(rivalSprite);
  }

  const updateRivalTag = (name: string, healthPct: number, visible: boolean) => {
    if (!rivalSprite || !rivalCtx || !rivalTex) return;
    rivalSprite.visible = visible;
    if (!visible) return;
    const filledBars = Math.max(0, Math.min(5, Math.ceil((healthPct / 100) * 5)));
    if (name === lastRivalName && filledBars === lastRivalBars) return;
    lastRivalName = name;
    lastRivalBars = filledBars;

    const ctx = rivalCtx;
    ctx.clearRect(0, 0, 256, 64);

    // Driver Name (left side, bold white with dark drop-shadow like Blur_screenshot_003)
    ctx.save();
    ctx.font = 'bold 26px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name.split(' ')[0], 10, 38);

    // 5-bar health indicator pill on right side
    const barStartX = 158;
    const barY = 18;
    ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 2;
    ctx.fillRect(barStartX - 5, barY - 4, 86, 26);
    ctx.strokeRect(barStartX - 5, barY - 4, 86, 26);

    const barColor =
      filledBars >= 4 ? '#22c55e' : filledBars >= 2 ? '#f59e0b' : '#ef4444';
    for (let b = 0; b < 5; b++) {
      ctx.fillStyle = b < filledBars ? barColor : 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(barStartX + b * 15, barY, 11, 18);
    }
    ctx.restore();
    rivalTex.needsUpdate = true;
  };

  // ==========================================================================
  // 6. WHEELS & ASYNC REAL 3D GLB AUTOMOTIVE MODEL SWAP
  // ==========================================================================
  const frontLeftPivot = new THREE.Group();
  const frontRightPivot = new THREE.Group();
  frontLeftPivot.position.set(-0.92, 0.36, -1.42);
  frontRightPivot.position.set(0.92, 0.36, -1.42);
  root.add(frontLeftPivot, frontRightPivot);

  const wheels: THREE.Object3D[] = [];

  // Fallback wheels until GLB loads
  const fallbackWheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 20);
  fallbackWheelGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x121417,
    roughness: 0.85,
    metalness: 0.1,
  });
  for (const [wx, wz] of [
    [-0.95, -1.42],
    [0.95, -1.42],
    [-0.95, 1.42],
    [0.95, 1.42],
  ]) {
    const wm = new THREE.Mesh(fallbackWheelGeo, tireMat);
    wm.position.set(wx, 0.36, wz);
    fallbackGroup.add(wm);
    wheels.push(wm);
  }

  // Load & normalize the real 3D GLB automotive model for this vehicle's style
  assetLoader
    .loadVehicleGLTF(spec.style)
    .then((gltf) => {
      const modelClone = gltf.scene.clone(true);

      // 1. Remove studio floor planes, backdrops, or giant shadow cards baked into GLBs
      const toRemove: THREE.Object3D[] = [];
      modelClone.traverse((obj) => {
        const nm = (obj.name || '').toLowerCase();
        if (
          nm === 'obj_shadow_plane' ||
          nm === 'plane' ||
          nm.startsWith('plane.002') ||
          nm.startsWith('plane.003') ||
          nm.startsWith('plane.004')
        ) {
          toRemove.push(obj);
          return;
        }
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          const mat = Array.isArray(m.material) ? m.material[0] : m.material;
          const matName = (mat?.name || '').toLowerCase();
          if (matName.includes('shadow_plane') || matName === 'material.001') {
            toRemove.push(obj);
          }
        }
      });
      toRemove.forEach((o) => o.parent?.remove(o));

      // 2. Orient model so Front faces -Z and Rear faces +Z
      const alignContainer = new THREE.Group();
      alignContainer.add(modelClone);

      if (spec.style === 'INTERCEPTOR') {
        // aventador.glb has front at -X and rear at +X
        modelClone.rotation.y = -Math.PI / 2;
      } else if (
        spec.style === 'COUPE' ||
        spec.style === 'TUNER' ||
        spec.style === 'MUSCLE' ||
        spec.style === 'HYPERCAR'
      ) {
        // porsche911, sedan_car, gt_supercar, mclaren have front at +Z
        modelClone.rotation.y = Math.PI;
      } else {
        // ferrari.glb already has front at -Z
        modelClone.rotation.y = 0;
      }

      // 3. Compute accurate bounding box of car meshes (filtering any stray outlier vertices)
      alignContainer.updateMatrixWorld(true);
      const carBox = new THREE.Box3();
      alignContainer.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          const b = new THREE.Box3().setFromObject(m);
          const sz = new THREE.Vector3();
          b.getSize(sz);
          if (sz.x < 32 && sz.z < 32 && sz.y < 15) {
            carBox.union(b);
          }
        }
      });

      const rawSize = new THREE.Vector3();
      const rawCenter = new THREE.Vector3();
      carBox.getSize(rawSize);
      carBox.getCenter(rawCenter);

      const targetLength =
        spec.style === 'HYPERCAR' || spec.style === 'INTERCEPTOR'
          ? 4.84
          : spec.style === 'SUPERCAR'
          ? 4.78
          : 4.68;

      const scaleFactor = rawSize.z > 0.01 ? targetLength / rawSize.z : 1;
      alignContainer.scale.setScalar(scaleFactor);

      // Recompute world box after scaling to center X/Z at 0 and ground tires at Y = 0
      alignContainer.updateMatrixWorld(true);
      const scaledBox = new THREE.Box3();
      alignContainer.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          const b = new THREE.Box3().setFromObject(m);
          const sz = new THREE.Vector3();
          b.getSize(sz);
          if (sz.x < 10 && sz.z < 10) {
            scaledBox.union(b);
          }
        }
      });

      const scaledCenter = new THREE.Vector3();
      scaledBox.getCenter(scaledCenter);
      alignContainer.position.set(
        -scaledCenter.x,
        -scaledBox.min.y,
        -scaledCenter.z
      );

      // 4. Upgrade PBR materials (Clearcoat Paint, Tinted Glass, Alloy Rims, Tires, Lights)
      alignContainer.traverse((obj) => {
        const nm = (obj.name || '').toLowerCase();

        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          const oldMat = (
            Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
          ) as THREE.MeshStandardMaterial;
          const matName = (oldMat?.name || '').toLowerCase();

          // Primary Car Body Paint -> Physical Metallic Clearcoat in Racer's Livery Color
          if (
            matName === 'body_color' ||
            matName === 'paint' ||
            matName === 'coat' ||
            matName === 'body' ||
            matName === 'spoiler' ||
            matName === 'mt_body' ||
            matName === 'carpaint' ||
            nm === 'body'
          ) {
            mesh.material = bodyMat;
          }
          // Automotive Glass & Windshields
          else if (
            matName.includes('glass') ||
            matName.includes('window') ||
            matName.includes('windscreen')
          ) {
            if (matName.includes('taillight')) {
              mesh.material = taillightMat;
            } else {
              mesh.material = glassMat;
            }
          }
          // Taillights & Brake Lamps
          else if (
            matName.includes('taillight') ||
            matName.includes('backlamp') ||
            matName.includes('reflector_rl') ||
            matName === '930_lights' ||
            nm.includes('lights_red') ||
            nm.includes('light_brake')
          ) {
            const customTail = taillightMat.clone();
            taillightMaterials.push(customTail);
            mesh.material = customTail;
          }
          // Headlights
          else if (
            matName.includes('headlight') ||
            matName.includes('frontlamp') ||
            matName.includes('light_emissive') ||
            matName === 'lights'
          ) {
            mesh.material = headlightMat;
          }
          // Rubber Tires
          else if (
            matName.includes('tire') ||
            matName.includes('tyre') ||
            matName.includes('rubber')
          ) {
            mesh.material = tireMat;
          }
          // Alloy Rims & Chrome Trim
          else if (
            matName.includes('chrome') ||
            matName.includes('silver') ||
            matName.includes('alloywheel') ||
            matName === '930_rim'
          ) {
            mesh.material = chromeMat;
          }
          // Brake Calipers -> Accent Color
          else if (matName.includes('caliper') || nm.includes('brakes')) {
            mesh.material = new THREE.MeshStandardMaterial({
              color: accentColor,
              metalness: 0.6,
              roughness: 0.25,
            });
          }
          // Carbon Fiber / Dark Trim
          else if (
            matName.includes('carbon') ||
            matName.includes('plastic') ||
            matName.includes('black')
          ) {
            mesh.material = secondaryMat;
          } else if (oldMat) {
            oldMat.envMapIntensity = 1.6;
          }
        }
      });

      // Replace fallback primitive car with the normalized real 3D GLB car
      bodyGroup.remove(fallbackGroup);
      bodyGroup.add(alignContainer);

      // Clear fallback wheel spin list so GLB wheels with origin at (0,0,0) stay locked in their wheel arches
      wheels.length = 0;
    })
    .catch((err) => {
      console.warn('Vehicle GLB fallback active for', spec.style, err);
    });

  const setBraking = (isBraking: boolean) => {
    const intensity = isBraking ? 5.2 : 2.0;
    for (const tm of taillightMaterials) {
      tm.emissiveIntensity = intensity;
    }
    tailFlareMat.opacity = isBraking ? 0.98 : 0.68;
    const flareScaleX = isBraking ? 2.25 : 1.5;
    const flareScaleY = isBraking ? 0.68 : 0.44;
    tlSpriteL.scale.set(flareScaleX, flareScaleY, 1);
    tlSpriteR.scale.set(flareScaleX, flareScaleY, 1);
  };

  return {
    root,
    bodyGroup,
    frontLeftPivot,
    frontRightPivot,
    wheels,
    taillightMat,
    taillightMaterials,
    brakeFlareGroup,
    nitroFlameGroup,
    shieldMesh,
    updateBumperSlots,
    updateRivalTag,
    setBraking,
  };
}
