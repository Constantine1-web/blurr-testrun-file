import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  GameSettings,
  KeyBindings,
  KillFeedItem,
  LiveRaceSnapshot,
  PowerUpType,
  RaceResultsData,
  RacerHUDData,
  TrackDefinition,
  VehicleSpec,
} from '../types/game';
import { AI_DRIVER_NAMES, AI_LIVERY_PALETTE, VEHICLES } from '../data/vehicles';
import { BuiltVehicleObject, buildVehicleMesh } from './VehicleMeshBuilder';
import { BuiltTrack, POWERUP_COLORS, buildTrack } from './TrackBuilder';
import { ParticleSystem } from './ParticleSystem';
import { soundEngine } from '../audio/SoundEngine';
import { GamepadFrameState, gamepadManager } from './GamepadManager';
import { assetLoader } from './AssetLoader';

interface InternalRacer {
  id: string;
  name: string;
  isPlayer: boolean;
  spec: VehicleSpec;
  meshObj: BuiltVehicleObject;
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  forwardSpeed: number;
  lateralSpeed: number;
  steerAngle: number;
  driftFactor: number;
  driftDuration: number;
  isDrifting: boolean;
  health: number;
  maxHealth: number;
  nitroCharge: number; // 0..100 rechargeable via drift
  boostTimer: number;
  shieldTimer: number;
  disruptionTimer: number;
  wreckTimer: number;
  powerUps: (PowerUpType | null)[];
  selectedSlot: number;
  splineIndex: number;
  trackT: number;
  lateralOffset: number;
  lap: number;
  totalLaps: number;
  checkpointIndex: number;
  totalProgress: number;
  finished: boolean;
  finishTime: number | null;
  lastPositionRank: number;
  // AI properties
  aiSkill: number;
  aiAggression: number;
  aiTargetLane: number;
  aiLaneTimer: number;
  aiUseItemCooldown: number;
  stuckTimer: number;
  // Stats
  stats: {
    overtakes: number;
    powerUpHits: number;
    attacksEvaded: number;
    driftScore: number;
    wrecksCaused: number;
  };
}

interface ActiveProjectile {
  id: string;
  type: 'BOLTS' | 'MISSILE';
  ownerId: string;
  ownerName: string;
  targetId: string | null;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  trackT: number;
  lateralOffset: number;
  age: number;
  maxLife: number;
  mesh: THREE.Group;
  active: boolean;
}

interface ActiveMine {
  id: string;
  ownerId: string;
  ownerName: string;
  position: THREE.Vector3;
  armTimer: number;
  age: number;
  mesh: THREE.Group;
  active: boolean;
}

export interface MobileInputState {
  accelerate: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  drift: boolean;
  nitro: boolean;
}

export class RaceEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rearCamera: THREE.PerspectiveCamera;
  private skyDomeMesh: THREE.Mesh | null = null;
  private dirLight: THREE.DirectionalLight | null = null;
  private particles: ParticleSystem;
  private rearFrameCounter = 0;

  private animFrameId: number | null = null;
  private lastFrameTime = 0;
  private isPaused = false;
  private mode: 'SHOWROOM' | 'RACE' = 'SHOWROOM';

  // Showroom state
  private showroomGroup: THREE.Group | null = null;
  private showroomVehicle: BuiltVehicleObject | null = null;
  private showroomOrbitAngle = 0.55;
  private isDraggingShowroom = false;
  private dragPreviousX = 0;

  // Race state
  private currentTrackDef: TrackDefinition | null = null;
  private builtTrack: BuiltTrack | null = null;
  private racers: InternalRacer[] = [];
  private projectiles: ActiveProjectile[] = [];
  private mines: ActiveMine[] = [];
  private killFeed: KillFeedItem[] = [];
  private activeNotification: { text: string; color: string; subtext?: string; timer: number } | null = null;

  private countdownTimer = 3.6;
  private lastCountdownInt = 4;
  private raceElapsedMs = 0;
  private raceFinishedTriggered = false;
  private careerEventId: string | null = null;
  private cameraShakeIntensity = 0;
  private cameraYaw = 0;
  private cameraLateralLag = 0;
  private hudEmitAccumulator = 0;

  // Input state
  private pressedKeys = new Set<string>();
  private gamepadState: GamepadFrameState = gamepadManager.poll();
  private focusedMenuIndex = 0;
  public mobileInput: MobileInputState = {
    accelerate: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    drift: false,
    nitro: false,
  };

  private settings: GameSettings;
  private keyBindings: KeyBindings;
  private onHudUpdate: (snapshot: LiveRaceSnapshot) => void;
  private onRaceComplete: (results: RaceResultsData) => void;
  private onPauseToggle: () => void;

  constructor(
    container: HTMLElement,
    settings: GameSettings,
    keyBindings: KeyBindings,
    onHudUpdate: (snapshot: LiveRaceSnapshot) => void,
    onRaceComplete: (results: RaceResultsData) => void,
    onPauseToggle: () => void
  ) {
    this.container = container;
    this.settings = settings;
    this.keyBindings = keyBindings;
    this.onHudUpdate = onHudUpdate;
    this.onRaceComplete = onRaceComplete;
    this.onPauseToggle = onPauseToggle;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x091326);
    this.scene.fog = new THREE.FogExp2(0x0c1930, 0.0024);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(48, Math.max(1, w) / Math.max(1, h), 0.35, 1300);
    this.rearCamera = new THREE.PerspectiveCamera(64, 420 / 105, 0.4, 380);

    this.renderer = new THREE.WebGLRenderer({
      antialias: settings.quality !== 'LOW',
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(
      settings.quality === 'HIGH'
        ? Math.min(window.devicePixelRatio, 2)
        : settings.quality === 'MEDIUM'
        ? Math.min(window.devicePixelRatio, 1.5)
        : 1
    );
    this.renderer.shadowMap.enabled = settings.quality !== 'LOW';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;

    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    this.setupPostProcessing(w, h);
    this.setupLighting();
    this.updateSkyDome('#091326', '#162844', '#00f2fe');
    this.loadEnvironmentHDRI('/textures/dikhololo_night_1k.hdr');

    this.particles = new ParticleSystem(this.scene);
    this.bindEvents();

    (window as unknown as Record<string, unknown>).__BLURR_ENGINE__ = this;

    this.lastFrameTime = performance.now();
    this.loop(this.lastFrameTime);
  }

  private setupPostProcessing(w: number, h: number): void {
    const composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, w), Math.max(1, h)),
      0.24, // subtle bloom strength so road & buildings stay crisp while taillights & holograms glow
      0.26, // tight bloom radius
      0.96  // high threshold so only emissives > 0.96 bloom
    );
    composer.addPass(bloomPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    this.composer = composer;
    this.bloomPass = bloomPass;
  }

  private loadEnvironmentHDRI(path: string): void {
    assetLoader
      .loadHDRI(path)
      .then((envMap) => {
        this.scene.environment = envMap;
        (this.scene as unknown as { environmentIntensity?: number }).environmentIntensity = 0.72;
      })
      .catch(() => {
        // Fallback if HDRI fails
      });
  }

  private updateSkyDome(topHex: string, horizonHex: string, accentHex: string): void {
    if (this.skyDomeMesh) {
      this.scene.remove(this.skyDomeMesh);
      (this.skyDomeMesh.material as THREE.MeshBasicMaterial).map?.dispose();
      (this.skyDomeMesh.material as THREE.MeshBasicMaterial).dispose();
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#040814');
    grad.addColorStop(0.35, topHex);
    grad.addColorStop(0.50, horizonHex);
    grad.addColorStop(0.55, accentHex + '44');
    grad.addColorStop(0.62, '#070b14');
    grad.addColorStop(1.0, '#04060c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Subtle twilight cloud wisps near the horizon band
    for (let i = 0; i < 42; i++) {
      const cx = (i * 73) % 512;
      const cy = 85 + (i % 7) * 6;
      const rw = 40 + (i % 5) * 22;
      const rh = 4 + (i % 3) * 3;
      const cGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, rw);
      cGrad.addColorStop(0, 'rgba(148, 185, 235, 0.11)');
      cGrad.addColorStop(1, 'rgba(148, 185, 235, 0)');
      ctx.fillStyle = cGrad;
      ctx.fillRect(cx - rw, cy - rh, rw * 2, rh * 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const skyGeo = new THREE.SphereGeometry(950, 32, 20);
    const skyMat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyDomeMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDomeMesh);
  }

  public debugGrantAndFirePowerUp(type: PowerUpType): boolean {
    const player = this.racers.find((r) => r.isPlayer);
    if (!player || this.mode !== 'RACE') return false;
    player.powerUps[0] = type;
    player.selectedSlot = 0;
    this.activatePowerUp(player);
    return true;
  }

  public debugFastForwardPlayerRace(): void {
    const player = this.racers.find((r) => r.isPlayer);
    if (!player || this.mode !== 'RACE') return;
    player.lap = player.totalLaps + 1;
    player.finished = true;
    player.finishTime = this.raceElapsedMs;
    this.completeRaceSession();
  }

  public debugGetState() {
    return {
      mode: this.mode,
      isPaused: this.isPaused,
      countdownTimer: this.countdownTimer,
      raceElapsedMs: this.raceElapsedMs,
      racerCount: this.racers.length,
      racers: this.racers.map((r) => ({
        id: r.id,
        name: r.name,
        isPlayer: r.isPlayer,
        speed: r.forwardSpeed,
        lap: r.lap,
        totalProgress: r.totalProgress,
        rank: r.lastPositionRank,
        health: r.health,
        shieldTimer: r.shieldTimer,
        boostTimer: r.boostTimer,
        powerUps: r.powerUps,
      })),
      activeProjectiles: this.projectiles.filter((p) => p.active).length,
      activeMines: this.mines.filter((m) => m.active).length,
    };
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0x88a4d8, 0.52);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x4f86c6, 0x0f172a, 0.65);
    this.scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.15);
    dirLight.position.set(110, 190, 85);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 650;
    const d = 160;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0004;
    this.scene.add(dirLight);
    this.dirLight = dirLight;
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  public dispose(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.dispose();
  }

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = Math.max(1, w) / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
  };

  private handleWindowBlur = (): void => {
    this.pressedKeys.clear();
    if (this.mode === 'RACE' && !this.isPaused && !this.raceFinishedTriggered) {
      this.onPauseToggle();
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    soundEngine.init();
    if (this.mode === 'SHOWROOM') {
      this.isDraggingShowroom = true;
      this.dragPreviousX = e.clientX;
    } else if (this.mode === 'RACE' && !this.isPaused && e.button === 0) {
      // Left mouse button triggers power-up if clicking on canvas
      const player = this.racers.find((r) => r.isPlayer);
      if (player && this.countdownTimer <= 0) {
        this.activatePowerUp(player);
      }
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.isDraggingShowroom && this.mode === 'SHOWROOM') {
      const dx = e.clientX - this.dragPreviousX;
      this.dragPreviousX = e.clientX;
      this.showroomOrbitAngle -= dx * 0.01;
    }
  };

  private handlePointerUp = (): void => {
    this.isDraggingShowroom = false;
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    soundEngine.init();

    if (this.mode === 'RACE') {
      // Prevent unwanted browser scrolling during race
      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)
      ) {
        e.preventDefault();
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        this.onPauseToggle();
        return;
      }

      if (!this.isPaused && this.countdownTimer <= 0) {
        const player = this.racers.find((r) => r.isPlayer);
        if (player && !player.finished) {
          if (e.code === this.keyBindings.firePowerUp && !e.repeat) {
            this.activatePowerUp(player);
          } else if (e.code === this.keyBindings.switchPowerUp && !e.repeat) {
            this.cyclePowerUpSlot(player);
          } else if (e.code === this.keyBindings.resetCar && !e.repeat) {
            this.resetVehicleToTrack(player);
          }
        }
      }
    }

    this.pressedKeys.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.pressedKeys.delete(e.code);
  };

  public updateConfig(settings: GameSettings, keyBindings: KeyBindings): void {
    this.settings = settings;
    this.keyBindings = keyBindings;
    this.renderer.setPixelRatio(
      settings.quality === 'HIGH'
        ? Math.min(window.devicePixelRatio, 2)
        : settings.quality === 'MEDIUM'
        ? Math.min(window.devicePixelRatio, 1.5)
        : 1
    );
    soundEngine.setSettings(settings.volume, settings.musicVolume, settings.muted);
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    soundEngine.setRacingActive(this.mode === 'RACE' && !paused);
  }

  public triggerMobilePowerUp(): void {
    const player = this.racers.find((r) => r.isPlayer);
    if (player && this.mode === 'RACE' && !this.isPaused && this.countdownTimer <= 0) {
      this.activatePowerUp(player);
    }
  }

  public triggerMobileSwitchSlot(): void {
    const player = this.racers.find((r) => r.isPlayer);
    if (player && this.mode === 'RACE' && !this.isPaused) {
      this.cyclePowerUpSlot(player);
    }
  }

  // ============================================================================
  // SHOWROOM MODE (Main Menu & Vehicle Garage 3D Turntable)
  // ============================================================================
  public enterShowroom(vehicleSpec: VehicleSpec): void {
    this.clearRaceObjects();
    this.mode = 'SHOWROOM';
    this.isPaused = false;
    soundEngine.setRacingActive(false);

    this.scene.background = new THREE.Color(0x070a14);
    this.scene.fog = new THREE.FogExp2(0x070a14, 0.024);

    if (this.showroomGroup) {
      this.scene.remove(this.showroomGroup);
    }

    const group = new THREE.Group();
    this.showroomGroup = group;

    // Turntable pedestal with brushed metallic bevel
    const padGeo = new THREE.CylinderGeometry(4.2, 4.55, 0.26, 64);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.72,
      roughness: 0.22,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = -0.13;
    pad.receiveShadow = true;
    group.add(pad);

    // Subtle recessed LED accent rings on turntable
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: new THREE.Color(vehicleSpec.accentColor),
      side: THREE.DoubleSide,
    });
    const ring1 = new THREE.Mesh(new THREE.RingGeometry(4.02, 4.14, 64), ringMat1);
    ring1.rotation.x = -Math.PI / 2;
    ring1.position.y = 0.01;
    group.add(ring1);

    const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.75, 2.83, 64), ringMat1);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.01;
    group.add(ring2);

    // Polished dark concrete garage floor (no wireframe GridHelper)
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const fCtx = floorCanvas.getContext('2d')!;
    fCtx.fillStyle = '#0d1320';
    fCtx.fillRect(0, 0, 512, 512);
    fCtx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    fCtx.lineWidth = 3;
    for (let k = 0; k <= 512; k += 128) {
      fCtx.beginPath();
      fCtx.moveTo(k, 0);
      fCtx.lineTo(k, 512);
      fCtx.moveTo(0, k);
      fCtx.lineTo(512, k);
      fCtx.stroke();
    }
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(24, 24);

    const studioFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.24,
        metalness: 0.55,
      })
    );
    studioFloor.rotation.x = -Math.PI / 2;
    studioFloor.position.y = -0.26;
    studioFloor.receiveShadow = true;
    group.add(studioFloor);

    // Industrial garage structural columns & overhead warm/cool studio lightbanks
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.45,
    });
    const ceilingLightMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

    for (let i = -2; i <= 2; i++) {
      const zPos = i * 7.5;
      for (const side of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.85, 8.5, 0.85), pillarMat);
        col.position.set(side * 10.5, 4.0, zPos);
        group.add(col);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(22, 0.45, 0.65), pillarMat);
      beam.position.set(0, 8.1, zPos);
      group.add(beam);

      const lightPanel = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.12, 1.1), ceilingLightMat);
      lightPanel.position.set(0, 7.82, zPos);
      group.add(lightPanel);
    }

    const keyLight = new THREE.PointLight(0xfff7ed, 26, 28);
    keyLight.position.set(4.2, 5.5, 4.2);
    group.add(keyLight);

    const fillLight = new THREE.PointLight(0xe0f2fe, 18, 25);
    fillLight.position.set(-4.5, 4.2, 3.5);
    group.add(fillLight);

    const rimLight = new THREE.PointLight(new THREE.Color(vehicleSpec.accentColor), 22, 24);
    rimLight.position.set(0, 3.8, -5.5);
    group.add(rimLight);

    this.showroomVehicle = buildVehicleMesh(vehicleSpec, false);
    group.add(this.showroomVehicle.root);

    this.scene.add(group);
  }

  public updateShowroomVehicle(vehicleSpec: VehicleSpec): void {
    if (this.mode !== 'SHOWROOM') {
      this.enterShowroom(vehicleSpec);
      return;
    }
    this.enterShowroom(vehicleSpec);
  }

  public debugSkipCountdown(): void {
    this.countdownTimer = 0;
  }

  public debugLoadPowerUpSlots(slots: (PowerUpType | null)[]): void {
    const player = this.racers.find((r) => r.isPlayer);
    if (!player) return;
    player.powerUps = [slots[0] || null, slots[1] || null, slots[2] || null];
    player.selectedSlot = 0;
    player.meshObj.updateBumperSlots(player.powerUps, player.selectedSlot);
    this.emitHudSnapshot();
  }

  // ============================================================================
  // START RACE
  // ============================================================================
  public startRace(
    trackDef: TrackDefinition,
    playerVehicle: VehicleSpec,
    laps: number,
    aiCount: number,
    aiDifficulty: number,
    careerEventId: string | null = null
  ): void {
    this.clearRaceObjects();
    if (this.showroomGroup) {
      this.scene.remove(this.showroomGroup);
      this.showroomGroup = null;
      this.showroomVehicle = null;
    }

    this.mode = 'RACE';
    this.isPaused = false;
    this.currentTrackDef = trackDef;
    this.careerEventId = careerEventId;
    this.countdownTimer = 3.5;
    this.lastCountdownInt = 4;
    this.raceElapsedMs = 0;
    this.raceFinishedTriggered = false;
    this.killFeed = [];
    this.activeNotification = {
      text: trackDef.name,
      subtext: 'GET READY FOR COMBAT IGNITION',
      color: trackDef.accentNeon,
      timer: 3.2,
    };

    this.scene.background = new THREE.Color(trackDef.skyColor);
    this.scene.fog = new THREE.FogExp2(trackDef.fogColor, 0.0023);
    this.updateSkyDome(trackDef.skyColor, trackDef.fogColor, trackDef.accentNeon);

    const hdriMap: Record<string, string> = {
      'track-neon-docks': '/textures/pedestrian_overpass_1k.hdr',
      'track-cyber-canyon': '/textures/venice_sunset_1k.hdr',
      'track-orbital-ring': '/textures/dikhololo_night_1k.hdr',
    };
    this.loadEnvironmentHDRI(hdriMap[trackDef.id] || '/textures/pedestrian_overpass_1k.hdr');

    this.builtTrack = buildTrack(trackDef);
    this.scene.add(this.builtTrack.group);

    // Spawn Racers on starting grid (just behind start line, ordered 1..N)
    const totalRacers = aiCount + 1;
    const samples = this.builtTrack.samples;
    const totalSamples = samples.length;

    const otherSpecs = VEHICLES.filter((v) => v.id !== playerVehicle.id);

    for (let i = 0; i < totalRacers; i++) {
      // Player starts near back/middle of grid (index aiCount) for exciting overtakes
      const isPlayer = i === aiCount;
      const spec = isPlayer
        ? playerVehicle
        : otherSpecs[i % otherSpecs.length];

      // Place grid slots tightly backwards from sample 0 (~12m per row for close pack combat)
      const row = Math.floor(i / 2);
      const col = i % 2 === 0 ? -1 : 1;
      const sampleOffset = (totalSamples - 2 - row * 2 + totalSamples) % totalSamples;
      const s = samples[sampleOffset];
      const latOffset = col * 3.1;

      const startPos = s.point.clone().addScaledVector(s.right, latOffset);
      const startYaw = Math.atan2(-s.tangent.x, -s.tangent.z);

      const customColor = isPlayer
        ? undefined
        : AI_LIVERY_PALETTE[i % AI_LIVERY_PALETTE.length];
      const meshObj = buildVehicleMesh(spec, isPlayer, customColor);
      meshObj.root.position.copy(startPos);
      meshObj.root.rotation.y = startYaw;
      if (isPlayer) {
        meshObj.updateBumperSlots([null, null, null], 0);
      } else {
        meshObj.updateRivalTag(AI_DRIVER_NAMES[i % AI_DRIVER_NAMES.length], 100, true);
      }
      this.scene.add(meshObj.root);

      const skillSpread = 0.90 + (i / Math.max(1, aiCount)) * 0.16;

      this.racers.push({
        id: isPlayer ? 'player' : `ai-${i}`,
        name: isPlayer ? 'YOU' : AI_DRIVER_NAMES[i % AI_DRIVER_NAMES.length],
        isPlayer,
        spec,
        meshObj,
        position: startPos,
        yaw: startYaw,
        pitch: 0,
        forwardSpeed: 0,
        lateralSpeed: 0,
        steerAngle: 0,
        driftFactor: 0,
        driftDuration: 0,
        isDrifting: false,
        health: spec.physics.maxHealth,
        maxHealth: spec.physics.maxHealth,
        nitroCharge: 50,
        boostTimer: 0,
        shieldTimer: 0,
        disruptionTimer: 0,
        wreckTimer: 0,
        powerUps: [null, null, null],
        selectedSlot: 0,
        splineIndex: sampleOffset,
        trackT: s.t,
        lateralOffset: latOffset,
        lap: 1,
        totalLaps: laps,
        checkpointIndex: 0,
        totalProgress: s.t - 1, // Negative slightly before crossing start line first time
        finished: false,
        finishTime: null,
        lastPositionRank: i + 1,
        aiSkill: aiDifficulty * skillSpread,
        aiAggression: 0.45 + (i % 4) * 0.15,
        aiTargetLane: latOffset,
        aiLaneTimer: 1.5 + Math.random() * 2,
        aiUseItemCooldown: 2.0,
        stuckTimer: 0,
        stats: {
          overtakes: 0,
          powerUpHits: 0,
          attacksEvaded: 0,
          driftScore: 0,
          wrecksCaused: 0,
        },
      });
    }

    const player = this.racers.find((r) => r.isPlayer)!;
    this.cameraYaw = player.yaw;
    this.cameraLateralLag = 0;
    this.updateCamera(player, 1);
    soundEngine.setRacingActive(true);
    this.emitHudSnapshot();
  }

  private clearRaceObjects(): void {
    if (this.builtTrack) {
      this.scene.remove(this.builtTrack.group);
      this.builtTrack = null;
    }
    for (const r of this.racers) {
      this.scene.remove(r.meshObj.root);
    }
    this.racers = [];
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
    }
    this.projectiles = [];
    for (const m of this.mines) {
      this.scene.remove(m.mesh);
    }
    this.mines = [];
    this.particles.clearAll();
  }

  // ============================================================================
  // MAIN GAME LOOP
  // ============================================================================
  private loop = (now: number): void => {
    this.animFrameId = requestAnimationFrame(this.loop);

    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const totalDt = Math.min(0.25, Math.max(0.001, rawDt));

    // Poll external Gamepad (PlayStation DualShock/DualSense, Xbox, etc.) once per frame
    this.gamepadState = gamepadManager.poll();
    if (this.gamepadState.connected) {
      this.processGamepadFrameActions(this.gamepadState);
    }

    if (this.mode === 'SHOWROOM') {
      this.updateShowroom(Math.min(0.05, totalDt));
      if (this.skyDomeMesh) {
        this.skyDomeMesh.position.copy(this.camera.position);
      }
      if (this.composer && this.settings.quality === 'HIGH') {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      return;
    }

    if (this.mode === 'RACE' && !this.isPaused) {
      let remaining = totalDt;
      const maxStep = 0.025;
      while (remaining > 0.0001) {
        const step = Math.min(remaining, maxStep);
        this.updateRace(step);
        remaining -= step;
      }
    }

    if (this.skyDomeMesh) {
      this.skyDomeMesh.position.copy(this.camera.position);
    }

    this.renderRearViewMirror();

    if (this.composer && this.settings.quality === 'HIGH') {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  };

  private renderRearViewMirror(): void {
    if (this.mode !== 'RACE') return;
    if (this.rearFrameCounter++ % 2 !== 0) return;

    const mirrorCanvas = document.getElementById('blur-rear-mirror-canvas') as HTMLCanvasElement | null;
    if (!mirrorCanvas) return;

    const player = this.racers.find((r) => r.isPlayer);
    if (!player) return;

    // Temporarily hide player's own vehicle mesh so rear camera has an unobstructed view
    player.meshObj.root.visible = false;
    this.renderer.render(this.scene, this.rearCamera);
    player.meshObj.root.visible = true;

    const ctx = mirrorCanvas.getContext('2d');
    if (ctx) {
      ctx.save();
      ctx.translate(mirrorCanvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(this.renderer.domElement, 0, 0, mirrorCanvas.width, mirrorCanvas.height);
      ctx.restore();
    }
  }

  private processGamepadFrameActions(gp: GamepadFrameState): void {
    if (
      gp.justPressedFire ||
      gp.justPressedSwitch ||
      gp.justPressedPause ||
      gp.navConfirm ||
      gp.navBack
    ) {
      soundEngine.init();
    }

    if (this.mode === 'RACE') {
      if (gp.justPressedPause && !this.raceFinishedTriggered) {
        this.onPauseToggle();
        return;
      }

      if (this.isPaused || this.raceFinishedTriggered) {
        this.handleGamepadMenuDOM(gp);
        return;
      }

      if (this.countdownTimer <= 0) {
        const player = this.racers.find((r) => r.isPlayer);
        if (player && !player.finished) {
          if (gp.justPressedFire) {
            this.activatePowerUp(player);
          }
          if (gp.justPressedSwitch) {
            this.cyclePowerUpSlot(player);
          }
          if (gp.justPressedReset) {
            this.resetVehicleToTrack(player);
          }
        }
      }
    } else {
      // SHOWROOM / Menu screens
      this.handleGamepadMenuDOM(gp);
    }
  }

  private handleGamepadMenuDOM(gp: GamepadFrameState): void {
    const overlay = document.querySelector('.menu-root-overlay');
    if (!overlay) return;

    if (gp.navBack) {
      if (this.mode === 'RACE' && this.isPaused) {
        this.onPauseToggle();
        return;
      }
      const backBtn = overlay.querySelector('.back-btn') as HTMLElement | null;
      if (backBtn) {
        backBtn.click();
        return;
      }
    }

    const focusables = Array.from(
      overlay.querySelectorAll<HTMLElement>(
        'button:not(.locked):not(.topbar-mute-btn), .track-card'
      )
    );
    if (focusables.length === 0) return;

    if (gp.navDown || gp.navRight) {
      this.focusedMenuIndex = (this.focusedMenuIndex + 1) % focusables.length;
      this.applyMenuFocusHighlight(focusables);
      soundEngine.playUIClick();
    } else if (gp.navUp || gp.navLeft) {
      this.focusedMenuIndex =
        (this.focusedMenuIndex - 1 + focusables.length) % focusables.length;
      this.applyMenuFocusHighlight(focusables);
      soundEngine.playUIClick();
    } else if (gp.navConfirm) {
      const target =
        focusables[this.focusedMenuIndex] ||
        overlay.querySelector<HTMLElement>('.primary-cta') ||
        focusables[0];
      target?.click();
    }
  }

  private applyMenuFocusHighlight(focusables: HTMLElement[]): void {
    focusables.forEach((el, idx) => {
      if (idx === this.focusedMenuIndex) {
        el.classList.add('gamepad-focused');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        el.classList.remove('gamepad-focused');
      }
    });
  }

  private updateShowroom(dt: number): void {
    if (this.gamepadState.connected && Math.abs(this.gamepadState.lookAxisX) > 0.05) {
      this.showroomOrbitAngle -= this.gamepadState.lookAxisX * dt * 2.4;
    } else if (!this.isDraggingShowroom) {
      this.showroomOrbitAngle += dt * 0.42;
    }
    if (this.showroomVehicle) {
      for (const w of this.showroomVehicle.wheels) {
        w.rotation.x -= dt * 3.5;
      }
    }
    const radius = 7.4;
    this.camera.position.set(
      Math.sin(this.showroomOrbitAngle) * radius,
      2.45,
      Math.cos(this.showroomOrbitAngle) * radius
    );
    this.camera.lookAt(0, 0.72, 0);
  }

  private updateRace(dt: number): void {
    if (!this.builtTrack || !this.currentTrackDef) return;

    // 1. Countdown logic
    if (this.countdownTimer > 0) {
      this.countdownTimer -= dt;
      const currentInt = Math.ceil(this.countdownTimer);
      if (currentInt < this.lastCountdownInt && currentInt >= 0) {
        this.lastCountdownInt = currentInt;
        soundEngine.playCountdownBeep(currentInt === 0);
        if (currentInt === 0) {
          this.showNotification('GO // ENGAGE COMBAT!', '#00ff88', 'RACE LIVE');
        }
      }
    } else {
      this.raceElapsedMs += dt * 1000;
    }

    if (this.activeNotification) {
      this.activeNotification.timer -= dt;
      if (this.activeNotification.timer <= 0) {
        this.activeNotification = null;
      }
    }

    // 2. Update upright Blur power-up hologram tablets & respawn timers
    for (const node of this.builtTrack.powerUpNodes) {
      if (node.respawnTimer > 0) {
        node.respawnTimer = Math.max(0, node.respawnTimer - dt);
        if (node.respawnTimer === 0) {
          node.mesh.visible = true;
        }
      } else {
        // Keep upright rounded-square hologram facing oncoming traffic with gentle vertical hover
        node.crystalMesh.position.y =
          Math.sin(performance.now() * 0.004 + node.trackProgress * 20) * 0.14;
        node.crystalMesh.rotation.z =
          Math.sin(performance.now() * 0.0026 + node.trackProgress * 14) * 0.05;
      }
    }

    // 3. Update all Racers
    const isLive = this.countdownTimer <= 0;
    for (const r of this.racers) {
      this.updateRacer(r, dt, isLive);
    }

    // 4. Vehicle-to-Vehicle Collisions
    if (isLive) {
      this.handleVehicleCollisions();
    }

    // 5. Update Projectiles & Mines
    if (isLive) {
      this.updateProjectiles(dt);
      this.updateMines(dt);
    }

    // 6. Compute Race Standings & Overtakes
    this.updateStandings();

    // 7. Update Particles, Camera, & Audio
    this.particles.update(dt);
    const player = this.racers.find((r) => r.isPlayer);
    if (player) {
      this.updateCamera(player, dt);
      const threat = this.getIncomingThreatFor(player.id);
      soundEngine.updateDrivingAudio(
        Math.abs(player.forwardSpeed) / player.spec.physics.maxSpeed,
        player.isDrifting,
        player.boostTimer > 0,
        threat ? threat.distance : 0
      );
    }

    // 8. Emit HUD state at ~25 Hz for snappy UI without excessive React re-renders
    this.hudEmitAccumulator += dt;
    if (this.hudEmitAccumulator >= 0.04) {
      this.hudEmitAccumulator = 0;
      this.emitHudSnapshot();
    }
  }

  // ============================================================================
  // RACER PHYSICS, AI, & SPLINE TRACKING
  // ============================================================================
  private updateRacer(r: InternalRacer, dt: number, isLive: boolean): void {
    const track = this.builtTrack!;
    const samples = track.samples;

    // Handle Wrecked state respawn
    if (r.wreckTimer > 0) {
      r.wreckTimer -= dt;
      r.forwardSpeed *= 0.9;
      r.meshObj.bodyGroup.rotation.y += dt * 10;
      if (!r.isPlayer) {
        r.meshObj.updateRivalTag(r.name, 0, false);
      }
      if (r.wreckTimer <= 0) {
        r.health = r.maxHealth;
        r.meshObj.bodyGroup.rotation.set(0, 0, 0);
        const s = samples[r.splineIndex];
        r.position.copy(s.point).addScaledVector(s.right, r.lateralOffset * 0.4);
        r.yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
        r.forwardSpeed = r.spec.physics.maxSpeed * 0.45;
        r.shieldTimer = 2.2; // Brief spawn protection
      }
      r.meshObj.root.position.copy(r.position);
      return;
    }

    if (r.boostTimer > 0) r.boostTimer = Math.max(0, r.boostTimer - dt);
    if (r.shieldTimer > 0) r.shieldTimer = Math.max(0, r.shieldTimer - dt);
    if (r.disruptionTimer > 0) r.disruptionTimer = Math.max(0, r.disruptionTimer - dt);

    // Determine controls (Player input: Keyboard + Mobile Touch + External Gamepad vs AI)
    let throttle = 0;
    let brake = 0;
    let steerInput = 0;
    let wantDrift = false;
    let wantAuxNitro = false;

    if (isLive) {
      if (r.isPlayer && !r.finished) {
        const accelPressed =
          this.pressedKeys.has(this.keyBindings.accelerate) ||
          this.pressedKeys.has('ArrowUp') ||
          this.mobileInput.accelerate;
        const brakePressed =
          this.pressedKeys.has(this.keyBindings.brake) ||
          this.pressedKeys.has('ArrowDown') ||
          this.mobileInput.brake;
        const leftPressed =
          this.pressedKeys.has(this.keyBindings.steerLeft) ||
          this.pressedKeys.has('ArrowLeft') ||
          this.mobileInput.steerLeft;
        const rightPressed =
          this.pressedKeys.has(this.keyBindings.steerRight) ||
          this.pressedKeys.has('ArrowRight') ||
          this.mobileInput.steerRight;

        const gp = this.gamepadState;
        const kbSteer = (leftPressed ? 1 : 0) - (rightPressed ? 1 : 0);

        throttle = Math.max(accelPressed ? 1 : 0, gp.connected ? gp.throttle : 0);
        brake = Math.max(brakePressed ? 1 : 0, gp.connected ? gp.brake : 0);
        steerInput = Math.abs(kbSteer) > 0.01 ? kbSteer : gp.connected ? gp.steer : 0;
        wantDrift =
          this.pressedKeys.has(this.keyBindings.drift) ||
          this.mobileInput.drift ||
          (gp.connected && gp.drift);
        wantAuxNitro =
          this.pressedKeys.has(this.keyBindings.nitro) ||
          this.pressedKeys.has('ShiftRight') ||
          this.mobileInput.nitro ||
          (gp.connected && gp.nitro);
      } else {
        const aiCtrl = this.computeAIControls(r, dt);
        throttle = aiCtrl.throttle;
        brake = aiCtrl.brake;
        steerInput = aiCtrl.steer;
        wantDrift = aiCtrl.drift;
      }
    }

    // Auxiliary Shift Nitro bar consumption for player
    if (wantAuxNitro && r.nitroCharge > 8 && r.forwardSpeed > 15) {
      r.nitroCharge = Math.max(0, r.nitroCharge - dt * 38);
      r.boostTimer = Math.max(r.boostTimer, 0.12);
    } else if (!wantAuxNitro) {
      r.nitroCharge = Math.min(100, r.nitroCharge + dt * 3.5);
    }

    const phys = r.spec.physics;
    const isBoosting = r.boostTimer > 0;
    const effectiveMaxSpeed = phys.maxSpeed * (isBoosting ? 1.32 : 1.0);
    const effectiveAccel = phys.accelRate * (isBoosting ? 1.65 : 1.0);

    // Forward / Reverse velocity update
    if (throttle > 0) {
      if (r.forwardSpeed < 0) {
        r.forwardSpeed += phys.brakeRate * 1.4 * dt;
      } else {
        const speedRatio = r.forwardSpeed / effectiveMaxSpeed;
        const torqueCurve = Math.max(0.18, 1 - Math.pow(speedRatio, 1.7));
        r.forwardSpeed += effectiveAccel * torqueCurve * throttle * dt;
      }
    } else if (brake > 0) {
      if (r.forwardSpeed > 1.5) {
        r.forwardSpeed -= phys.brakeRate * brake * dt;
      } else {
        // Reverse gear
        r.forwardSpeed = Math.max(-phys.maxSpeed * 0.32, r.forwardSpeed - phys.accelRate * 0.7 * dt);
      }
    } else {
      // Natural aerodynamic drag & rolling resistance
      r.forwardSpeed *= Math.pow(0.65, dt);
      if (Math.abs(r.forwardSpeed) < 0.2) r.forwardSpeed = 0;
    }

    r.forwardSpeed = Math.min(effectiveMaxSpeed, r.forwardSpeed);

    // Disruption wobble when struck by Energy Bolts / Missiles / Mines
    if (r.disruptionTimer > 0) {
      steerInput += Math.sin(performance.now() * 0.035) * 0.85;
      r.forwardSpeed *= Math.pow(0.82, dt);
    }

    // Speed-dependent steering & Drift physics
    const speedAbs = Math.abs(r.forwardSpeed);
    const steerAuthority = Math.min(1, speedAbs / 8) * (1 - Math.min(0.32, (speedAbs / phys.maxSpeed) * 0.28));
    const reverseSign = r.forwardSpeed >= -0.1 ? 1 : -1;

    if (wantDrift && speedAbs > 24 && Math.abs(steerInput) > 0.1) {
      r.isDrifting = true;
      r.driftDuration += dt;
      r.driftFactor = THREE.MathUtils.lerp(r.driftFactor, steerInput, dt * 6);
      // Recharge Nitro bar & award Drift Score
      r.nitroCharge = Math.min(100, r.nitroCharge + dt * 16);
      r.stats.driftScore += dt * 45;
      // Slight scrub unless counter-steering well
      r.forwardSpeed *= Math.pow(0.94, dt);
    } else {
      // Release drift mini-boost if drifted around corner for >0.65s
      if (r.isDrifting && r.driftDuration > 0.65 && r.forwardSpeed > 25) {
        r.boostTimer = Math.max(r.boostTimer, 0.55);
      }
      r.isDrifting = false;
      r.driftDuration = 0;
      r.driftFactor = THREE.MathUtils.lerp(r.driftFactor, 0, dt * 8);
    }

    const driftTurnMultiplier = r.isDrifting ? 1.38 : 1.0;
    const yawDelta =
      steerInput * phys.steerRate * steerAuthority * driftTurnMultiplier * reverseSign * dt;
    r.yaw += yawDelta;
    r.steerAngle = THREE.MathUtils.lerp(r.steerAngle, steerInput * 0.42, dt * 12);

    // Lateral velocity & grip
    const forwardVec = new THREE.Vector3(-Math.sin(r.yaw), 0, -Math.cos(r.yaw));
    const rightVec = new THREE.Vector3(Math.cos(r.yaw), 0, -Math.sin(r.yaw));

    if (r.isDrifting) {
      r.lateralSpeed = THREE.MathUtils.lerp(
        r.lateralSpeed,
        -r.driftFactor * speedAbs * 0.28,
        dt * 5
      );
    } else {
      r.lateralSpeed *= Math.pow(1 - phys.normalGrip, dt * 10);
    }

    // Advance world position
    r.position.addScaledVector(forwardVec, r.forwardSpeed * dt);
    r.position.addScaledVector(rightVec, r.lateralSpeed * dt);

    // Project onto closest spline sample
    const prevT = r.trackT;
    const closestIdx = this.findClosestSampleIndex(r.position, r.splineIndex);
    r.splineIndex = closestIdx;
    const currentSample = samples[closestIdx];
    const nextSample = samples[(closestIdx + 1) % samples.length];

    // Fine interpolation along segment
    const segVec = new THREE.Vector3().subVectors(nextSample.point, currentSample.point);
    const segLen = Math.max(0.001, segVec.length());
    const relVec = new THREE.Vector3().subVectors(r.position, currentSample.point);
    const segProj = THREE.MathUtils.clamp(relVec.dot(currentSample.tangent) / segLen, 0, 1);

    r.trackT = (closestIdx + segProj) / samples.length;
    r.lateralOffset = relVec.dot(currentSample.right);

    // Follow track elevation & road pitch smoothly
    const targetY = THREE.MathUtils.lerp(currentSample.point.y, nextSample.point.y, segProj);
    r.position.y = THREE.MathUtils.lerp(r.position.y, targetY, Math.min(1, dt * 22));
    r.pitch = THREE.MathUtils.lerp(r.pitch, currentSample.tangent.y * 0.65, dt * 10);

    // Barrier collision & track boundary enforcement
    const maxLat = track.roadWidth * 0.5 - 1.38;
    if (Math.abs(r.lateralOffset) > maxLat) {
      const sign = Math.sign(r.lateralOffset);
      const clampedLat = sign * maxLat;
      const basePoint = currentSample.point
        .clone()
        .lerp(nextSample.point, segProj);

      r.position.x = basePoint.x + currentSample.right.x * clampedLat;
      r.position.z = basePoint.z + currentSample.right.z * clampedLat;
      r.lateralOffset = clampedLat;
      r.lateralSpeed = -sign * Math.min(8, Math.abs(r.forwardSpeed) * 0.15);
      r.forwardSpeed *= Math.pow(0.78, dt * 4);

      // Gently align yaw toward track tangent so car never sticks in barrier
      const trackYaw = Math.atan2(-currentSample.tangent.x, -currentSample.tangent.z);
      const yawDiff = this.normalizeAngle(trackYaw - r.yaw);
      r.yaw += yawDiff * Math.min(1, dt * 6.5);

      if (speedAbs > 22 && Math.random() < 0.45) {
        this.particles.spawnSparks(r.position, 5, 0xffb74d);
        if (r.isPlayer) {
          soundEngine.playCollision(0.35);
          this.triggerCameraShake(0.18);
        }
      }
    }

    // Checkpoint & Lap Progression
    this.updateLapAndCheckpoints(r, prevT, r.trackT);

    // Power-up Pickup Collection
    this.checkPowerUpCollection(r);

    // Stuck recovery for AI (or extreme stall)
    if (isLive && !r.finished) {
      if (Math.abs(r.forwardSpeed) < 3.5) {
        r.stuckTimer += dt;
        if (r.stuckTimer > (r.isPlayer ? 4.5 : 2.2)) {
          this.resetVehicleToTrack(r);
          r.stuckTimer = 0;
        }
      } else {
        r.stuckTimer = 0;
      }
    }

    // Update 3D Visuals on Vehicle Mesh
    r.meshObj.root.position.copy(r.position);
    r.meshObj.root.rotation.y = r.yaw;

    // Visual body roll, pitch, and drift slip angle
    r.meshObj.bodyGroup.rotation.z = THREE.MathUtils.lerp(
      r.meshObj.bodyGroup.rotation.z,
      steerInput * 0.065,
      dt * 10
    );
    r.meshObj.bodyGroup.rotation.x = r.pitch - (throttle > 0 ? 0.022 : brake > 0 ? -0.035 : 0);
    r.meshObj.bodyGroup.rotation.y = THREE.MathUtils.lerp(
      r.meshObj.bodyGroup.rotation.y,
      r.driftFactor * -0.26,
      dt * 9
    );

    // Steering front wheels & spinning all 4 wheels
    r.meshObj.frontLeftPivot.rotation.y = r.steerAngle;
    r.meshObj.frontRightPivot.rotation.y = r.steerAngle;
    for (const w of r.meshObj.wheels) {
      w.rotation.x -= (r.forwardSpeed / 0.39) * dt;
    }

    // Brake light glow & anamorphic lens flare intensity
    r.meshObj.setBraking(brake > 0.05);

    // Update diegetic 3-slot rear bumper power-up HUD (player) or floating nameplate + health bar (AI)
    if (r.isPlayer) {
      r.meshObj.updateBumperSlots(r.powerUps, r.selectedSlot);
    } else {
      const playerRef = this.racers.find((p) => p.isPlayer);
      const distToPlayer = playerRef ? r.position.distanceTo(playerRef.position) : 0;
      r.meshObj.updateRivalTag(
        r.name,
        (r.health / r.maxHealth) * 100,
        distToPlayer < 92 && r.wreckTimer <= 0
      );
    }

    // Nitro exhaust flames & particles
    r.meshObj.nitroFlameGroup.visible = isBoosting;
    if (isBoosting) {
      const flicker = 0.85 + Math.random() * 0.45;
      r.meshObj.nitroFlameGroup.scale.set(1, 1, flicker);
    }

    // Shield dome visibility & animation
    r.meshObj.shieldMesh.visible = r.shieldTimer > 0;
    if (r.shieldTimer > 0) {
      r.meshObj.shieldMesh.rotation.y += dt * 2.5;
    }

    // Drift tire smoke & skid marks
    if (r.isDrifting && speedAbs > 22) {
      const rearPos = r.position.clone().addScaledVector(forwardVec, -2.1);
      this.particles.spawnTireSmoke(rearPos, forwardVec);
      this.particles.spawnSkidMark(rearPos, r.yaw);
    }

    // Damage smoke when health < 40%
    if (r.health < r.maxHealth * 0.4 && Math.random() < 0.35) {
      const hoodPos = r.position.clone().addScaledVector(forwardVec, 1.8).add(new THREE.Vector3(0, 0.8, 0));
      this.particles.spawnTireSmoke(hoodPos, forwardVec);
    }
  }

  private findClosestSampleIndex(pos: THREE.Vector3, hintIndex: number): number {
    const samples = this.builtTrack!.samples;
    const len = samples.length;
    let bestIdx = hintIndex;
    let bestDistSq = Infinity;

    // Local window search around previous sample index
    for (let offset = -28; offset <= 28; offset++) {
      const idx = (hintIndex + offset + len) % len;
      const dSq = pos.distanceToSquared(samples[idx].point);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }

    // Fallback global scan if far from hint
    if (bestDistSq > 900) {
      for (let i = 0; i < len; i += 2) {
        const dSq = pos.distanceToSquared(samples[i].point);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    return bestIdx;
  }

  private updateLapAndCheckpoints(r: InternalRacer, prevT: number, currT: number): void {
    const checkpoints = this.builtTrack!.checkpoints;
    if (r.checkpointIndex < checkpoints.length) {
      const targetCp = checkpoints[r.checkpointIndex];
      if (currT >= targetCp && currT < targetCp + 0.12) {
        r.checkpointIndex++;
      }
    }

    // Crossing start/finish line forward
    if (prevT > 0.82 && currT < 0.18) {
      // If on initial grid start (totalProgress < 0), align cleanly to Lap 1
      if (r.totalProgress < 0) {
        r.checkpointIndex = 0;
      } else if (r.checkpointIndex >= checkpoints.length - 1) {
        r.lap++;
        r.checkpointIndex = 0;

        if (r.lap > r.totalLaps && !r.finished) {
          r.finished = true;
          r.finishTime = this.raceElapsedMs;
          if (r.isPlayer) {
            soundEngine.playFinishFanfare();
            this.showNotification(
              `FINISHED ${this.formatOrdinal(r.lastPositionRank)} PLACE!`,
              '#00ff88',
              'RACE COMPLETE'
            );
            this.completeRaceSession();
          }
        } else if (r.isPlayer && r.lap === r.totalLaps) {
          soundEngine.playCountdownBeep(true);
          this.showNotification('FINAL LAP!', '#facc15', 'MAXIMUM OVERDRIVE');
        } else if (r.isPlayer) {
          this.showNotification(`LAP ${r.lap} / ${r.totalLaps}`, '#00f2fe');
        }
      }
    }

    // Calculate continuous race progress for accurate live rankings
    if (r.totalProgress < 0 && currT > 0.85) {
      r.totalProgress = currT - 1;
    } else {
      r.totalProgress = (r.lap - 1) + currT;
    }
  }

  // ============================================================================
  // AI OPPONENT NAVIGATION & COMBAT LOGIC
  // ============================================================================
  private computeAIControls(
    r: InternalRacer,
    dt: number
  ): { throttle: number; brake: number; steer: number; drift: boolean } {
    const track = this.builtTrack!;
    const samples = track.samples;
    const len = samples.length;

    // Periodically pick a target lane or steer toward an active power-up pickup ahead
    r.aiLaneTimer -= dt;
    if (r.aiLaneTimer <= 0) {
      r.aiLaneTimer = 1.4 + Math.random() * 1.8;
      const maxLane = track.roadWidth * 0.32;
      r.aiTargetLane = (Math.random() * 2 - 1) * maxLane;

      // If AI has empty power-up slots, look for an active pickup node ahead
      if (r.powerUps.some((p) => p === null)) {
        for (const node of track.powerUpNodes) {
          const dtAhead = (node.trackProgress - r.trackT + 1) % 1;
          if (node.respawnTimer === 0 && dtAhead > 0.01 && dtAhead < 0.08) {
            r.aiTargetLane = node.lateralOffset;
            break;
          }
        }
      }
    }

    // Avoid slower cars directly ahead in the same lane
    for (const other of this.racers) {
      if (other.id === r.id) continue;
      const distAhead = (other.trackT - r.trackT + 1) % 1;
      if (distAhead > 0 && distAhead < 0.025 && Math.abs(other.lateralOffset - r.lateralOffset) < 3.2) {
        r.aiTargetLane = other.lateralOffset > 0 ? -track.roadWidth * 0.28 : track.roadWidth * 0.28;
      }
    }

    // Look ahead 12 samples along the spline
    const lookaheadIdx = (r.splineIndex + 12) % len;
    const farLookaheadIdx = (r.splineIndex + 24) % len;
    const targetSample = samples[lookaheadIdx];
    const farSample = samples[farLookaheadIdx];

    const targetWorldPos = targetSample.point
      .clone()
      .addScaledVector(targetSample.right, r.aiTargetLane);

    const toTarget = new THREE.Vector3().subVectors(targetWorldPos, r.position);
    const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
    const angleDiff = this.normalizeAngle(desiredYaw - r.yaw);

    const steer = THREE.MathUtils.clamp(angleDiff * 2.8, -1, 1);

    // Corner speed regulation based on upcoming curvature
    const upcomingCurvature = Math.max(
      Math.abs(targetSample.curvature),
      Math.abs(farSample.curvature)
    );

    // Gentle competitive pacing so races stay tight & exciting without cheap rubber-banding
    const player = this.racers.find((p) => p.isPlayer);
    let paceMod = r.aiSkill;
    if (player && !player.finished) {
      const gap = r.totalProgress - player.totalProgress;
      if (gap > 0.14) paceMod *= 0.92; // Don't run away impossibly far
      if (gap < -0.14) paceMod *= 1.07; // Catch up moderately if far behind
    }

    const desiredSpeed =
      r.spec.physics.maxSpeed *
      paceMod *
      (upcomingCurvature > 0.22 ? 0.68 : upcomingCurvature > 0.12 ? 0.84 : 1.0);

    const throttle = r.forwardSpeed < desiredSpeed ? 1 : 0.2;
    const brake = r.forwardSpeed > desiredSpeed * 1.15 ? 0.7 : 0;
    const drift = upcomingCurvature > 0.20 && Math.abs(steer) > 0.55 && r.forwardSpeed > 42;

    // AI Tactical Power-Up Usage
    r.aiUseItemCooldown -= dt;
    if (r.aiUseItemCooldown <= 0 && !r.finished) {
      this.evaluateAIPowerUpUse(r);
    }

    return { throttle, brake, steer, drift };
  }

  private evaluateAIPowerUpUse(r: InternalRacer): void {
    const slotIdx = r.powerUps.findIndex((p) => p !== null);
    if (slotIdx === -1) return;
    r.selectedSlot = slotIdx;
    const item = r.powerUps[slotIdx]!;

    const threat = this.getIncomingThreatFor(r.id);

    if (item === 'SHIELD' && threat) {
      this.activatePowerUp(r);
      r.aiUseItemCooldown = 1.5;
      return;
    }

    if (item === 'REPAIR' && r.health < r.maxHealth * 0.65) {
      this.activatePowerUp(r);
      r.aiUseItemCooldown = 2.0;
      return;
    }

    if (item === 'NITRO' && Math.abs(this.builtTrack!.samples[r.splineIndex].curvature) < 0.08) {
      this.activatePowerUp(r);
      r.aiUseItemCooldown = 2.5;
      return;
    }

    // Check offensive opportunities
    if (item === 'MISSILE' || item === 'BOLTS') {
      const hasTargetAhead = this.racers.some(
        (other) =>
          other.id !== r.id &&
          other.totalProgress > r.totalProgress &&
          other.totalProgress - r.totalProgress < 0.12
      );
      if (hasTargetAhead) {
        this.activatePowerUp(r);
        r.aiUseItemCooldown = 2.8;
        return;
      }
    }

    if (item === 'SHOCKWAVE') {
      const hasCloseRival = this.racers.some(
        (other) => other.id !== r.id && other.position.distanceTo(r.position) < 18
      );
      if (hasCloseRival) {
        this.activatePowerUp(r);
        r.aiUseItemCooldown = 2.5;
        return;
      }
    }

    if (item === 'MINE') {
      this.activatePowerUp(r);
      r.aiUseItemCooldown = 3.0;
    }
  }

  // ============================================================================
  // COMBAT & POWER-UP SYSTEM (ALL 7 BLUR-STYLE POWER-UPS)
  // ============================================================================
  private checkPowerUpCollection(r: InternalRacer): void {
    if (!this.builtTrack || r.finished) return;

    for (const node of this.builtTrack.powerUpNodes) {
      if (node.respawnTimer > 0) continue;
      const dx = r.position.x - node.position.x;
      const dz = r.position.z - node.position.z;
      if (dx * dx + dz * dz < 9.5) {
        // Find empty slot (max 3 slots)
        const emptySlot = r.powerUps.findIndex((p) => p === null);
        if (emptySlot !== -1) {
          r.powerUps[emptySlot] = node.type;
          node.respawnTimer = 6.5;
          node.mesh.visible = false;
          if (r.isPlayer) {
            soundEngine.playPickupCollect();
          }
        }
      }
    }
  }

  private cyclePowerUpSlot(r: InternalRacer): void {
    for (let i = 1; i <= 3; i++) {
      const candidate = (r.selectedSlot + i) % 3;
      if (r.powerUps[candidate] !== null) {
        r.selectedSlot = candidate;
        soundEngine.playUIClick(true);
        return;
      }
    }
    r.selectedSlot = (r.selectedSlot + 1) % 3;
  }

  private activatePowerUp(r: InternalRacer): void {
    let slot = r.selectedSlot;
    if (r.powerUps[slot] === null) {
      const firstAvailable = r.powerUps.findIndex((p) => p !== null);
      if (firstAvailable === -1) return;
      slot = firstAvailable;
      r.selectedSlot = slot;
    }

    const type = r.powerUps[slot]!;
    r.powerUps[slot] = null;

    // Auto-advance selection to next available power-up
    const nextSlot = r.powerUps.findIndex((p) => p !== null);
    if (nextSlot !== -1) r.selectedSlot = nextSlot;

    if (r.isPlayer) {
      soundEngine.playPowerUpUse(type);
      gamepadManager.triggerRumble(
        type === 'SHOCKWAVE' || type === 'NITRO' ? 0.75 : 0.45,
        0.35,
        180
      );
    }

    const forward = new THREE.Vector3(-Math.sin(r.yaw), 0, -Math.cos(r.yaw));

    switch (type) {
      case 'NITRO': {
        r.boostTimer = 3.2;
        r.forwardSpeed = Math.max(r.forwardSpeed + 18, r.spec.physics.maxSpeed * 1.18);
        this.particles.spawnRing(r.position, POWERUP_COLORS.NITRO, 8, 0.35);
        break;
      }

      case 'BOLTS': {
        // Fire 3 high-velocity Blur pink/magenta plasma bolts in a tight spread
        const spreads = [-0.038, 0, 0.038];
        spreads.forEach((angleOffset, idx) => {
          const boltYaw = r.yaw + angleOffset;
          const dir = new THREE.Vector3(-Math.sin(boltYaw), 0, -Math.cos(boltYaw));
          const spawnPos = r.position
            .clone()
            .addScaledVector(dir, 3.2 + idx * 1.1)
            .add(new THREE.Vector3(0, 0.72, 0));

          const boltGroup = new THREE.Group();
          const coreGeo = new THREE.BoxGeometry(0.16, 0.12, 2.35);
          const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          boltGroup.add(new THREE.Mesh(coreGeo, coreMat));

          const auraGeo = new THREE.BoxGeometry(0.42, 0.28, 2.85);
          const auraMat = new THREE.MeshBasicMaterial({
            color: POWERUP_COLORS.BOLTS,
            transparent: true,
            opacity: 0.72,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          boltGroup.add(new THREE.Mesh(auraGeo, auraMat));

          boltGroup.position.copy(spawnPos);
          boltGroup.rotation.y = boltYaw;
          this.scene.add(boltGroup);

          this.projectiles.push({
            id: `bolt-${performance.now()}-${idx}`,
            type: 'BOLTS',
            ownerId: r.id,
            ownerName: r.name,
            targetId: null,
            position: spawnPos,
            velocity: dir.multiplyScalar(148),
            trackT: r.trackT,
            lateralOffset: r.lateralOffset,
            age: 0,
            maxLife: 2.2,
            mesh: boltGroup,
            active: true,
          });
        });
        break;
      }

      case 'MISSILE': {
        // Lock onto nearest rival ahead along the track (Blur 'Shunt' homing plasma orb)
        let bestTarget: InternalRacer | null = null;
        let bestDelta = Infinity;
        for (const candidate of this.racers) {
          if (candidate.id === r.id || candidate.wreckTimer > 0) continue;
          const delta = (candidate.trackT - r.trackT + 1) % 1;
          if (delta > 0.002 && delta < 0.35 && delta < bestDelta) {
            bestDelta = delta;
            bestTarget = candidate;
          }
        }

        const spawnPos = r.position
          .clone()
          .addScaledVector(forward, 3.4)
          .add(new THREE.Vector3(0, 0.82, 0));

        const missileGroup = new THREE.Group();
        const coreSphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xfff1f2 })
        );
        missileGroup.add(coreSphere);

        const plasmaShell = new THREE.Mesh(
          new THREE.SphereGeometry(0.62, 14, 14),
          new THREE.MeshBasicMaterial({
            color: POWERUP_COLORS.MISSILE,
            transparent: true,
            opacity: 0.68,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        plasmaShell.scale.set(1, 0.85, 1.85);
        missileGroup.add(plasmaShell);

        const shuntLight = new THREE.PointLight(POWERUP_COLORS.MISSILE, 16, 15, 2);
        missileGroup.add(shuntLight);

        missileGroup.position.copy(spawnPos);
        missileGroup.rotation.y = r.yaw;
        this.scene.add(missileGroup);

        this.projectiles.push({
          id: `missile-${performance.now()}`,
          type: 'MISSILE',
          ownerId: r.id,
          ownerName: r.name,
          targetId: bestTarget ? bestTarget.id : null,
          position: spawnPos,
          velocity: forward.clone().multiplyScalar(128),
          trackT: r.trackT,
          lateralOffset: r.lateralOffset,
          age: 0,
          maxLife: 5.5,
          mesh: missileGroup,
          active: true,
        });
        break;
      }

      case 'SHOCKWAVE': {
        const radius = 25;
        this.particles.spawnRing(r.position, POWERUP_COLORS.SHOCKWAVE, radius, 0.55);
        this.particles.spawnSparks(r.position, 24, POWERUP_COLORS.SHOCKWAVE);
        if (r.isPlayer) {
          this.triggerCameraShake(0.45);
        }

        // Destroy nearby mines & incoming missiles
        for (const m of this.mines) {
          if (m.active && m.position.distanceTo(r.position) < radius) {
            m.active = false;
            this.scene.remove(m.mesh);
          }
        }
        for (const p of this.projectiles) {
          if (p.active && p.ownerId !== r.id && p.position.distanceTo(r.position) < radius) {
            p.active = false;
            this.scene.remove(p.mesh);
            r.stats.attacksEvaded++;
          }
        }

        // Blast nearby rivals
        for (const victim of this.racers) {
          if (victim.id === r.id || victim.wreckTimer > 0) continue;
          const dist = victim.position.distanceTo(r.position);
          if (dist < radius) {
            this.applyCombatHit(r, victim, 'SHOCKWAVE', 32, 0.95);
            const pushDir = new THREE.Vector3().subVectors(victim.position, r.position).normalize();
            victim.lateralSpeed += pushDir.x * 16;
            victim.forwardSpeed *= 0.68;
          }
        }
        break;
      }

      case 'MINE': {
        const dropPos = r.position.clone().addScaledVector(forward, -3.4);
        const mineGroup = new THREE.Group();

        const domeGeo = new THREE.CylinderGeometry(1.1, 1.35, 0.45, 16);
        const domeMat = new THREE.MeshStandardMaterial({
          color: POWERUP_COLORS.MINE,
          emissive: POWERUP_COLORS.MINE,
          emissiveIntensity: 1.8,
        });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.position.y = 0.25;
        mineGroup.add(dome);

        const ringGeo = new THREE.RingGeometry(1.4, 1.75, 24);
        ringGeo.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({ color: 0xff3b30, side: THREE.DoubleSide })
        );
        ring.position.y = 0.08;
        mineGroup.add(ring);

        mineGroup.position.copy(dropPos);
        this.scene.add(mineGroup);

        this.mines.push({
          id: `mine-${performance.now()}`,
          ownerId: r.id,
          ownerName: r.name,
          position: dropPos,
          armTimer: 0.45,
          age: 0,
          mesh: mineGroup,
          active: true,
        });
        break;
      }

      case 'SHIELD': {
        r.shieldTimer = 6.0;
        this.particles.spawnRing(r.position, POWERUP_COLORS.SHIELD, 6, 0.35);
        break;
      }

      case 'REPAIR': {
        r.health = Math.min(r.maxHealth, r.health + 55);
        r.disruptionTimer = 0;
        this.particles.spawnSparks(r.position, 18, POWERUP_COLORS.REPAIR);
        this.particles.spawnRing(r.position, POWERUP_COLORS.REPAIR, 6, 0.4);
        break;
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const track = this.builtTrack!;
    const samples = track.samples;

    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxLife) {
        p.active = false;
        this.scene.remove(p.mesh);
        continue;
      }

      if (p.type === 'MISSILE') {
        const target = this.racers.find((r) => r.id === p.targetId && r.wreckTimer <= 0);
        if (target && p.position.distanceTo(target.position) < 42) {
          // Direct terminal homing onto locked target
          const desiredDir = new THREE.Vector3()
            .subVectors(target.position.clone().add(new THREE.Vector3(0, 0.7, 0)), p.position)
            .normalize();
          p.velocity.lerp(desiredDir.multiplyScalar(132), dt * 8);
        } else {
          // Follow spline curvature around corners
          p.trackT = (p.trackT + (128 * dt) / track.totalLength) % 1;
          const sIdx = Math.floor(p.trackT * samples.length) % samples.length;
          const s = samples[sIdx];
          const targetLateral = target ? target.lateralOffset : p.lateralOffset;
          p.lateralOffset = THREE.MathUtils.lerp(p.lateralOffset, targetLateral, dt * 4);
          const splinePos = s.point
            .clone()
            .addScaledVector(s.right, p.lateralOffset)
            .add(new THREE.Vector3(0, 0.85, 0));
          const dir = new THREE.Vector3().subVectors(splinePos, p.position);
          if (dir.lengthSq() > 0.01) {
            p.velocity.copy(dir.normalize().multiplyScalar(128));
          }
        }
        p.position.addScaledVector(p.velocity, dt);
        p.mesh.position.copy(p.position);
        p.mesh.rotation.y = Math.atan2(-p.velocity.x, -p.velocity.z);
        if (Math.random() < 0.6) {
          this.particles.spawnSparks(p.position, 1, POWERUP_COLORS.MISSILE);
        }
      } else {
        // Energy Bolts: slight magnetic assist toward rivals in front cone
        for (const r of this.racers) {
          if (r.id === p.ownerId || r.wreckTimer > 0) continue;
          const toRival = new THREE.Vector3().subVectors(r.position, p.position);
          const dist = toRival.length();
          if (dist < 22) {
            const align = toRival.normalize().dot(p.velocity.clone().normalize());
            if (align > 0.82) {
              p.velocity.lerp(toRival.multiplyScalar(148), dt * 6);
            }
          }
        }
        p.position.addScaledVector(p.velocity, dt);
        p.mesh.position.copy(p.position);
      }

      // Check collision with any rival
      for (const victim of this.racers) {
        if (victim.id === p.ownerId || victim.wreckTimer > 0) continue;
        const dx = victim.position.x - p.position.x;
        const dz = victim.position.z - p.position.z;
        const hitRadiusSq = p.type === 'MISSILE' ? 9.5 : 6.8;

        if (dx * dx + dz * dz < hitRadiusSq) {
          p.active = false;
          this.scene.remove(p.mesh);

          const attacker = this.racers.find((r) => r.id === p.ownerId);
          if (p.type === 'MISSILE') {
            this.particles.spawnExplosion(victim.position, POWERUP_COLORS.MISSILE, 15);
            soundEngine.playExplosion();
            this.applyCombatHit(attacker, victim, 'MISSILE', 40, 1.15);
            victim.forwardSpeed *= 0.62;
          } else {
            this.particles.spawnSparks(victim.position, 14, POWERUP_COLORS.BOLTS);
            soundEngine.playCollision(0.75);
            this.applyCombatHit(attacker, victim, 'BOLTS', 18, 0.55);
            victim.forwardSpeed *= 0.86;
          }
          break;
        }
      }
    }
  }

  private updateMines(dt: number): void {
    for (const m of this.mines) {
      if (!m.active) continue;
      m.age += dt;
      if (m.armTimer > 0) {
        m.armTimer -= dt;
        continue;
      }
      if (m.age > 35) {
        m.active = false;
        this.scene.remove(m.mesh);
        continue;
      }

      m.mesh.rotation.y += dt * 3;

      for (const victim of this.racers) {
        if (victim.wreckTimer > 0) continue;
        // Don't hit owner within first 2 seconds
        if (victim.id === m.ownerId && m.age < 2.0) continue;

        const dx = victim.position.x - m.position.x;
        const dz = victim.position.z - m.position.z;
        if (dx * dx + dz * dz < 9.0) {
          m.active = false;
          this.scene.remove(m.mesh);
          this.particles.spawnExplosion(m.position, POWERUP_COLORS.MINE, 14);
          soundEngine.playExplosion();

          const attacker = this.racers.find((r) => r.id === m.ownerId);
          this.applyCombatHit(attacker, victim, 'MINE', 36, 1.1);
          victim.forwardSpeed *= 0.58;
          break;
        }
      }
    }
  }

  private applyCombatHit(
    attacker: InternalRacer | undefined,
    victim: InternalRacer,
    weapon: PowerUpType,
    damage: number,
    disruptionSec: number
  ): void {
    // Check Shield protection
    if (victim.shieldTimer > 0) {
      victim.stats.attacksEvaded++;
      this.particles.spawnRing(victim.position, POWERUP_COLORS.SHIELD, 8, 0.35);
      if (victim.isPlayer) {
        this.showNotification('ATTACK BLOCKED BY SHIELD!', '#3b82f6', '+75 EVASION FANS');
      }
      this.pushKillFeed(
        victim.name,
        attacker ? attacker.name : 'HAZARD',
        'SHIELD',
        'DEFLECTED ATTACK',
        '#3b82f6'
      );
      return;
    }

    if (attacker) {
      attacker.stats.powerUpHits++;
    }

    victim.health = Math.max(0, victim.health - damage);
    victim.disruptionTimer = Math.max(victim.disruptionTimer, disruptionSec);

    if (victim.isPlayer) {
      this.triggerCameraShake(0.55);
    }

    if (victim.health <= 0) {
      victim.wreckTimer = 1.85;
      if (attacker) attacker.stats.wrecksCaused++;
      this.particles.spawnExplosion(victim.position, 0xff2a55, 18);
      soundEngine.playExplosion();
      this.pushKillFeed(
        attacker ? attacker.name : 'TRACK',
        victim.name,
        weapon,
        'WRECKED!',
        '#ff2a85'
      );
      if (victim.isPlayer) {
        this.showNotification('VEHICLE WRECKED // AUTO-REPAIRING', '#ff2a85');
      } else if (attacker?.isPlayer) {
        this.showNotification(`WRECKED ${victim.name}!`, '#00f2fe', '+150 COMBAT FANS');
      }
    } else {
      this.pushKillFeed(
        attacker ? attacker.name : 'HAZARD',
        victim.name,
        weapon,
        `HIT [${weapon}]`,
        '#00f2fe'
      );
    }
  }

  private handleVehicleCollisions(): void {
    const count = this.racers.length;
    for (let i = 0; i < count; i++) {
      const a = this.racers[i];
      if (a.wreckTimer > 0) continue;
      for (let j = i + 1; j < count; j++) {
        const b = this.racers[j];
        if (b.wreckTimer > 0) continue;

        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 2.65;

        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = (minDist - dist) * 0.55;

          const totalMass = a.spec.physics.mass + b.spec.physics.mass;
          const ratioA = b.spec.physics.mass / totalMass;
          const ratioB = a.spec.physics.mass / totalMass;

          a.position.x -= nx * overlap * ratioA;
          a.position.z -= nz * overlap * ratioA;
          b.position.x += nx * overlap * ratioB;
          b.position.z += nz * overlap * ratioB;

          const midPoint = a.position.clone().lerp(b.position, 0.5);
          this.particles.spawnSparks(midPoint, 7, 0xffaa00);

          if (a.isPlayer || b.isPlayer) {
            soundEngine.playCollision(0.5);
            this.triggerCameraShake(0.24);
          }
        }
      }
    }
  }

  private resetVehicleToTrack(r: InternalRacer): void {
    if (!this.builtTrack) return;
    const s = this.builtTrack.samples[r.splineIndex];
    r.position.copy(s.point);
    r.lateralOffset = 0;
    r.yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
    r.forwardSpeed = 24;
    r.lateralSpeed = 0;
    r.disruptionTimer = 0;
    if (r.isPlayer) {
      this.showNotification('VEHICLE RESET TO TRACK', '#00f2fe');
    }
  }

  // ============================================================================
  // STANDINGS, CAMERA, & HUD SNAPSHOTS
  // ============================================================================
  private updateStandings(): void {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) {
        return (a.finishTime || 0) - (b.finishTime || 0);
      }
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalProgress - a.totalProgress;
    });

    sorted.forEach((r, idx) => {
      const newRank = idx + 1;
      if (newRank < r.lastPositionRank && this.raceElapsedMs > 3000) {
        r.stats.overtakes += r.lastPositionRank - newRank;
      }
      r.lastPositionRank = newRank;
    });
  }

  private updateCamera(player: InternalRacer, dt: number): void {
    // Authentic Blur (2010) low, tight, wide-stance chase camera
    const yawDiff = this.normalizeAngle(player.yaw - this.cameraYaw);
    this.cameraYaw += yawDiff * Math.min(1, dt * 8.2);

    // Subtle lateral lag when steering/drifting so car side flanks & wheels show in corners
    const targetLatLag =
      -player.steerAngle * 0.85 - (player.isDrifting ? player.driftFactor * 0.42 : 0);
    this.cameraLateralLag = THREE.MathUtils.lerp(this.cameraLateralLag, targetLatLag, Math.min(1, dt * 6));

    const isBoosting = player.boostTimer > 0;
    const speedRatio = Math.max(0, player.forwardSpeed) / player.spec.physics.maxSpeed;
    const targetFov = isBoosting ? 58 : 47 + speedRatio * 6.5;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 7));
    this.camera.updateProjectionMatrix();

    const camBackDist = isBoosting ? 4.45 : 4.82;
    const camHeight = 1.66;

    const camForward = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const camRight = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));

    const desiredCamPos = player.position
      .clone()
      .addScaledVector(camForward, -camBackDist)
      .addScaledVector(camRight, this.cameraLateralLag)
      .add(new THREE.Vector3(0, camHeight, 0));

    // Apply impact camera shake if enabled
    if (this.cameraShakeIntensity > 0.01 && this.settings.cameraShake) {
      desiredCamPos.x += (Math.random() - 0.5) * this.cameraShakeIntensity;
      desiredCamPos.y += (Math.random() - 0.5) * this.cameraShakeIntensity;
      this.cameraShakeIntensity = Math.max(0, this.cameraShakeIntensity - dt * 1.8);
    }

    this.camera.position.lerp(desiredCamPos, Math.min(1, dt * 18));

    const lookAtPoint = player.position
      .clone()
      .addScaledVector(camForward, 9.2)
      .addScaledVector(camRight, -this.cameraLateralLag * 0.35)
      .add(new THREE.Vector3(0, 1.06, 0));
    this.camera.lookAt(lookAtPoint);

    // Update Rear-View Mirror 3D Camera (looking backwards from player roof)
    const carForward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    this.rearCamera.position
      .copy(player.position)
      .addScaledVector(carForward, -1.6)
      .add(new THREE.Vector3(0, 1.52, 0));
    const rearLookAt = player.position
      .clone()
      .addScaledVector(carForward, -45)
      .add(new THREE.Vector3(0, 1.15, 0));
    this.rearCamera.lookAt(rearLookAt);
  }

  private triggerCameraShake(amount: number): void {
    this.cameraShakeIntensity = Math.min(0.85, Math.max(this.cameraShakeIntensity, amount));
    if (this.settings.cameraShake) {
      gamepadManager.triggerRumble(
        Math.min(1, amount * 1.4),
        Math.min(1, amount * 0.9),
        Math.round(120 + amount * 180)
      );
    }
  }

  private showNotification(text: string, color: string, subtext?: string): void {
    this.activeNotification = { text, color, subtext, timer: 2.2 };
  }

  private pushKillFeed(
    attacker: string,
    victim: string,
    weapon: PowerUpType | 'COLLISION',
    actionText: string,
    color: string
  ): void {
    this.killFeed.unshift({
      id: `${performance.now()}-${Math.random()}`,
      timestamp: performance.now(),
      attacker,
      victim,
      weapon,
      actionText,
      color,
    });
    if (this.killFeed.length > 4) {
      this.killFeed.pop();
    }
  }

  private getIncomingThreatFor(racerId: string): RacerHUDData['incomingThreat'] {
    const targetRacer = this.racers.find((r) => r.id === racerId);
    if (!targetRacer) return null;

    for (const p of this.projectiles) {
      if (p.active && p.type === 'MISSILE' && p.targetId === racerId) {
        const dist = p.position.distanceTo(targetRacer.position);
        const urgency = THREE.MathUtils.clamp(1 - dist / 95, 0.15, 1);
        return {
          active: true,
          type: 'MISSILE',
          distance: urgency,
          attackerName: p.ownerName,
        };
      }
    }
    return null;
  }

  private toRacerHUD(r: InternalRacer): RacerHUDData {
    return {
      id: r.id,
      name: r.name,
      isPlayer: r.isPlayer,
      vehicleName: r.spec.name,
      accentColor: r.spec.accentColor,
      position: r.lastPositionRank,
      lap: Math.min(r.lap, r.totalLaps),
      totalLaps: r.totalLaps,
      speedMps: Math.abs(r.forwardSpeed),
      health: Math.ceil(r.health),
      maxHealth: r.maxHealth,
      nitroCharge: Math.round(r.nitroCharge),
      isDrifting: r.isDrifting,
      isShielded: r.shieldTimer > 0,
      isBoosting: r.boostTimer > 0,
      isWrecked: r.wreckTimer > 0,
      powerUps: [...r.powerUps],
      selectedSlot: r.selectedSlot,
      totalProgress: r.totalProgress,
      lapProgress: THREE.MathUtils.clamp(r.trackT, 0, 1),
      finishTime: r.finishTime,
      finished: r.finished,
      incomingThreat: this.getIncomingThreatFor(r.id),
      mapX: r.position.x,
      mapZ: r.position.z,
      heading: r.yaw,
      stats: { ...r.stats },
    };
  }

  private emitHudSnapshot(): void {
    if (!this.builtTrack || !this.currentTrackDef) return;
    const player = this.racers.find((r) => r.isPlayer);
    if (!player) return;

    const standings = [...this.racers]
      .sort((a, b) => a.lastPositionRank - b.lastPositionRank)
      .map((r) => this.toRacerHUD(r));

    // Check wrong-way indicator
    const s = this.builtTrack.samples[player.splineIndex];
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const wrongWay = player.forwardSpeed > 8 && forward.dot(s.tangent) < -0.35;

    // Identify current landmark
    let currentLandmark = this.currentTrackDef.location;
    for (const lm of this.currentTrackDef.landmarks) {
      if (Math.abs(player.trackT - lm.progress) < 0.09) {
        currentLandmark = lm.name;
        break;
      }
    }

    this.onHudUpdate({
      countdownValue:
        this.countdownTimer > 0 ? Math.ceil(this.countdownTimer) : this.raceElapsedMs < 900 ? 0 : -1,
      raceElapsedMs: this.raceElapsedMs,
      player: this.toRacerHUD(player),
      standings,
      minimapTrackPoints: this.builtTrack.minimapPoints,
      killFeed: [...this.killFeed],
      activeNotification: this.activeNotification
        ? {
            text: this.activeNotification.text,
            color: this.activeNotification.color,
            subtext: this.activeNotification.subtext,
          }
        : null,
      wrongWay,
      currentLandmark,
    });
  }

  private completeRaceSession(): void {
    if (this.raceFinishedTriggered || !this.currentTrackDef) return;
    this.raceFinishedTriggered = true;

    // Estimate finish times for any AI racers still on track
    const player = this.racers.find((r) => r.isPlayer)!;
    for (const r of this.racers) {
      if (!r.finished) {
        const remainingProgress = Math.max(0.02, r.totalLaps - r.totalProgress);
        r.finishTime = this.raceElapsedMs + remainingProgress * 34000;
        r.finished = true;
      }
    }

    this.updateStandings();
    const standings = [...this.racers]
      .sort((a, b) => a.lastPositionRank - b.lastPositionRank)
      .map((r) => this.toRacerHUD(r));

    const positionFansTable = [500, 350, 250, 175, 125, 90, 60];
    const positionFans = positionFansTable[player.lastPositionRank - 1] || 50;
    const overtakeFans = Math.min(350, player.stats.overtakes * 30);
    const combatFans = player.stats.powerUpHits * 55 + player.stats.wrecksCaused * 120;
    const evasionFans = player.stats.attacksEvaded * 75;
    const driftFans = Math.round(player.stats.driftScore);
    const eventBonusFans =
      this.careerEventId && player.lastPositionRank <= 3 ? 300 : 0;

    const totalEarned =
      positionFans + overtakeFans + combatFans + evasionFans + driftFans + eventBonusFans;

    window.setTimeout(() => {
      soundEngine.setRacingActive(false);
      this.onRaceComplete({
        trackId: this.currentTrackDef!.id,
        trackName: this.currentTrackDef!.name,
        careerEventId: this.careerEventId,
        standings,
        playerPosition: player.lastPositionRank,
        totalRacers: this.racers.length,
        fansBreakdown: {
          positionFans,
          overtakeFans,
          combatFans,
          evasionFans,
          driftFans,
          eventBonusFans,
          totalEarned,
        },
        newlyUnlockedVehicles: [],
      });
    }, 1400);
  }

  private normalizeAngle(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  private formatOrdinal(n: number): string {
    if (n === 1) return '1ST';
    if (n === 2) return '2ND';
    if (n === 3) return '3RD';
    return `${n}TH`;
  }
}
