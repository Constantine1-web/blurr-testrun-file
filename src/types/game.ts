export type GameScreen =
  | 'MENU'
  | 'GARAGE'
  | 'CAREER'
  | 'RACE_SETUP'
  | 'CONTROLS'
  | 'SETTINGS'
  | 'RACING'
  | 'PAUSED'
  | 'RESULTS';

export type PowerUpType =
  | 'NITRO'
  | 'BOLTS'
  | 'MISSILE'
  | 'SHOCKWAVE'
  | 'MINE'
  | 'SHIELD'
  | 'REPAIR';

export interface VehicleStats {
  topSpeed: number;     // 1-100 display stat
  acceleration: number; // 1-100 display stat
  handling: number;     // 1-100 display stat
  drift: number;        // 1-100 display stat
  durability: number;   // 1-100 display stat
}

export interface VehiclePhysicsConfig {
  maxSpeed: number;        // m/s internal
  accelRate: number;       // m/s^2
  brakeRate: number;       // m/s^2
  steerRate: number;       // rad/s base
  driftGrip: number;       // lateral grip during drift
  normalGrip: number;      // normal lateral grip
  maxHealth: number;       // hit points
  mass: number;            // relative mass for collisions
}

export type ChassisStyle = 'COUPE' | 'TUNER' | 'MUSCLE' | 'SUPERCAR' | 'INTERCEPTOR' | 'HYPERCAR';

export interface VehicleSpec {
  id: string;
  name: string;
  tagline: string;
  archetype: string;
  style: ChassisStyle;
  primaryColor: string;
  accentColor: string;
  underglowColor: string;
  stats: VehicleStats;
  physics: VehiclePhysicsConfig;
  unlockFans: number;
}

export interface TrackPointConfig {
  x: number;
  y: number;
  z: number;
}

export interface TrackLandmark {
  name: string;
  progress: number; // 0..1 along spline
  type: 'BRIDGE' | 'TUNNEL' | 'NEON_PLAZA' | 'HARBOR_CRANES' | 'STADIUM_ARCH' | 'REFINERY';
}

export interface TrackDefinition {
  id: string;
  name: string;
  subtitle: string;
  location: string;
  difficulty: 'ROOKIE' | 'PRO' | 'ELITE';
  defaultLaps: number;
  roadWidth: number;
  skyColor: string;
  fogColor: string;
  accentNeon: string;
  secondaryNeon: string;
  controlPoints: TrackPointConfig[];
  landmarks: TrackLandmark[];
  description: string;
}

export interface CareerEvent {
  id: string;
  title: string;
  subtitle: string;
  trackId: string;
  laps: number;
  aiCount: number;
  aiDifficulty: number; // 0.7 to 1.15
  rewardFans: number;
  unlockFansRequired: number;
  recommendedClass: string;
}

export interface KeyBindings {
  accelerate: string;
  brake: string;
  steerLeft: string;
  steerRight: string;
  drift: string;
  firePowerUp: string;
  switchPowerUp: string;
  nitro: string;
  resetCar: string;
}

export interface GameSettings {
  volume: number;        // 0..1
  musicVolume: number;   // 0..1
  muted: boolean;
  speedUnit: 'KMH' | 'MPH';
  quality: 'HIGH' | 'MEDIUM' | 'LOW';
  cameraShake: boolean;
  showMinimap: boolean;
}

export interface RacerHUDData {
  id: string;
  name: string;
  isPlayer: boolean;
  vehicleName: string;
  accentColor: string;
  position: number;
  lap: number;
  totalLaps: number;
  speedMps: number;
  health: number;
  maxHealth: number;
  nitroCharge: number; // 0..100
  isDrifting: boolean;
  isShielded: boolean;
  isBoosting: boolean;
  isWrecked: boolean;
  powerUps: (PowerUpType | null)[];
  selectedSlot: number;
  totalProgress: number;
  lapProgress: number; // 0..1
  finishTime: number | null;
  finished: boolean;
  incomingThreat: {
    active: boolean;
    type: 'MISSILE' | 'SHOCKWAVE' | 'BOLTS';
    distance: number; // 0..1 urgency
    attackerName: string;
  } | null;
  mapX: number;
  mapZ: number;
  heading: number;
  stats: {
    overtakes: number;
    powerUpHits: number;
    attacksEvaded: number;
    driftScore: number;
    wrecksCaused: number;
  };
}

export interface KillFeedItem {
  id: string;
  timestamp: number;
  attacker: string;
  victim: string;
  weapon: PowerUpType | 'COLLISION';
  actionText: string;
  color: string;
}

export interface LiveRaceSnapshot {
  countdownValue: number; // 3, 2, 1, 0 (GO), -1 (racing)
  raceElapsedMs: number;
  player: RacerHUDData;
  standings: RacerHUDData[];
  minimapTrackPoints: { x: number; z: number }[];
  killFeed: KillFeedItem[];
  activeNotification: { text: string; color: string; subtext?: string } | null;
  wrongWay: boolean;
  currentLandmark: string;
}

export interface RaceResultsData {
  trackId: string;
  trackName: string;
  careerEventId: string | null;
  standings: RacerHUDData[];
  playerPosition: number;
  totalRacers: number;
  fansBreakdown: {
    positionFans: number;
    overtakeFans: number;
    combatFans: number;
    evasionFans: number;
    driftFans: number;
    eventBonusFans: number;
    totalEarned: number;
  };
  newlyUnlockedVehicles: string[];
}

export interface PlayerProgress {
  fans: number;
  unlockedVehicles: string[];
  completedEvents: Record<string, { bestPosition: number; bestTimeMs: number }>;
  selectedVehicleId: string;
  selectedTrackId: string;
  careerStats: {
    racesCompleted: number;
    wins: number;
    totalPowerUpHits: number;
    totalDrifts: number;
  };
  settings: GameSettings;
  keyBindings: KeyBindings;
}
