import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { ChassisStyle } from '../types/game';

export const MODEL_PATHS: Record<ChassisStyle, string> = {
  COUPE: '/models/porsche911.glb',
  TUNER: '/models/sedan_car.glb',
  MUSCLE: '/models/gt_supercar.glb',
  SUPERCAR: '/models/ferrari.glb',
  INTERCEPTOR: '/models/aventador.glb',
  HYPERCAR: '/models/mclaren.glb',
};

class AssetLoaderService {
  private gltfLoader: GLTFLoader;
  private rgbeLoader: RGBELoader;
  private texLoader: THREE.TextureLoader;
  private modelCache = new Map<ChassisStyle, GLTF>();
  private loadingPromises = new Map<ChassisStyle, Promise<GLTF>>();
  private hdriCache = new Map<string, THREE.DataTexture>();
  private aoTexture: THREE.Texture | null = null;

  constructor() {
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(draco);
    this.rgbeLoader = new RGBELoader();
    this.texLoader = new THREE.TextureLoader();

    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__BLURR_ASSETS__ = this;
      // Preload all 6 GLB vehicles in the background for instant Garage & Race swaps
      setTimeout(() => {
        this.preloadAllVehicles().catch(() => {});
      }, 50);
    }
  }

  public getContactShadowTexture(): THREE.Texture {
    if (!this.aoTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 256, 512);

      // Soft oval underbody ambient occlusion shadow
      ctx.save();
      ctx.translate(128, 256);
      ctx.scale(1.0, 2.0);
      const bodyGrad = ctx.createRadialGradient(0, 0, 12, 0, 0, 108);
      bodyGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.92)');
      bodyGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.72)');
      bodyGrad.addColorStop(0.82, 'rgba(0, 0, 0, 0.28)');
      bodyGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 108, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 4 darker tire contact patches
      const wheelSpots = [
        [48, 122],
        [208, 122],
        [48, 390],
        [208, 390],
      ];
      for (const [wx, wy] of wheelSpots) {
        const wGrad = ctx.createRadialGradient(wx, wy, 4, wx, wy, 38);
        wGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.95)');
        wGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.55)');
        wGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
        ctx.fillStyle = wGrad;
        ctx.beginPath();
        ctx.arc(wx, wy, 38, 0, Math.PI * 2);
        ctx.fill();
      }

      this.aoTexture = new THREE.CanvasTexture(canvas);
      this.aoTexture.needsUpdate = true;
    }
    return this.aoTexture;
  }

  public async loadHDRI(path: string): Promise<THREE.DataTexture> {
    if (this.hdriCache.has(path)) {
      return this.hdriCache.get(path)!;
    }
    const tex = await this.rgbeLoader.loadAsync(path);
    // Soft-clamp extreme solar disc radiance spikes (> 2.0) so PBR asphalt & buildings never blow out
    const imgData = (tex.image as { data?: Float32Array | Uint16Array | Uint8Array })?.data;
    if (imgData && (imgData instanceof Float32Array || imgData instanceof Uint16Array)) {
      for (let i = 0; i < imgData.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const v = imgData[i + c];
          if (v > 2.0) {
            imgData[i + c] = 2.0 + Math.log1p(v - 2.0) * 0.25;
          }
        }
      }
      tex.needsUpdate = true;
    }
    tex.mapping = THREE.EquirectangularReflectionMapping;
    this.hdriCache.set(path, tex);
    return tex;
  }

  public async loadVehicleGLTF(style: ChassisStyle): Promise<GLTF> {
    if (this.modelCache.has(style)) {
      return this.modelCache.get(style)!;
    }
    if (this.loadingPromises.has(style)) {
      return this.loadingPromises.get(style)!;
    }
    const url = MODEL_PATHS[style];
    const p = this.gltfLoader.loadAsync(url).then((gltf) => {
      this.modelCache.set(style, gltf);
      return gltf;
    });
    this.loadingPromises.set(style, p);
    return p;
  }

  public async preloadAllVehicles(): Promise<GLTF[]> {
    const styles: ChassisStyle[] = [
      'COUPE',
      'SUPERCAR',
      'HYPERCAR',
      'MUSCLE',
      'TUNER',
      'INTERCEPTOR',
    ];
    const results: GLTF[] = [];
    for (const s of styles) {
      results.push(await this.loadVehicleGLTF(s));
    }
    return results;
  }

  public async inspectAllModels() {
    const styles: ChassisStyle[] = [
      'COUPE',
      'TUNER',
      'MUSCLE',
      'SUPERCAR',
      'INTERCEPTOR',
      'HYPERCAR',
    ];
    const report: Record<string, unknown> = {};
    for (const style of styles) {
      const gltf = await this.loadVehicleGLTF(style);
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const fullBox = new THREE.Box3().setFromObject(root);
      const fullSize = new THREE.Vector3();
      fullBox.getSize(fullSize);

      const meshes: Array<{
        name: string;
        matName: string;
        color: string;
        size: number[];
        center: number[];
      }> = [];

      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          const b = new THREE.Box3().setFromObject(m);
          const sz = new THREE.Vector3();
          const ct = new THREE.Vector3();
          b.getSize(sz);
          b.getCenter(ct);
          const mat = Array.isArray(m.material) ? m.material[0] : m.material;
          const stdMat = mat as THREE.MeshStandardMaterial;
          meshes.push({
            name: m.name,
            matName: mat ? mat.name : '',
            color: stdMat?.color ? '#' + stdMat.color.getHexString() : '',
            size: [Number(sz.x.toFixed(2)), Number(sz.y.toFixed(2)), Number(sz.z.toFixed(2))],
            center: [Number(ct.x.toFixed(2)), Number(ct.y.toFixed(2)), Number(ct.z.toFixed(2))],
          });
        }
      });

      report[style] = {
        url: MODEL_PATHS[style],
        fullSize: [
          Number(fullSize.x.toFixed(2)),
          Number(fullSize.y.toFixed(2)),
          Number(fullSize.z.toFixed(2)),
        ],
        meshCount: meshes.length,
        meshes: meshes.slice(0, 40),
      };
    }
    return report;
  }
}

export const assetLoader = new AssetLoaderService();
