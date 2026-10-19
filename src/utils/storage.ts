import { GameSettings, KeyBindings, PlayerProgress } from '../types/game';
import { VEHICLES } from '../data/vehicles';

const STORAGE_KEY = 'blurr_neon_overdrive_save_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.75,
  musicVolume: 0.45,
  muted: false,
  speedUnit: 'KMH',
  quality: 'HIGH',
  cameraShake: true,
  showMinimap: true,
};

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  accelerate: 'KeyW',
  brake: 'KeyS',
  steerLeft: 'KeyA',
  steerRight: 'KeyD',
  drift: 'Space',
  firePowerUp: 'KeyE',
  switchPowerUp: 'KeyQ',
  nitro: 'ShiftLeft',
  resetCar: 'KeyR',
};

export function getDefaultProgress(): PlayerProgress {
  const initialUnlocked = VEHICLES.filter((v) => v.unlockFans === 0).map((v) => v.id);
  return {
    fans: 0,
    unlockedVehicles: initialUnlocked,
    completedEvents: {},
    selectedVehicleId: initialUnlocked[0] || 'vortex-gtr',
    selectedTrackId: 'neon-metropolis',
    careerStats: {
      racesCompleted: 0,
      wins: 0,
      totalPowerUpHits: 0,
      totalDrifts: 0,
    },
    settings: { ...DEFAULT_SETTINGS },
    keyBindings: { ...DEFAULT_KEY_BINDINGS },
  };
}

export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultProgress();
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    const defaults = getDefaultProgress();

    const fans = typeof parsed.fans === 'number' ? parsed.fans : 0;
    const unlockedSet = new Set<string>([
      ...defaults.unlockedVehicles,
      ...(Array.isArray(parsed.unlockedVehicles) ? parsed.unlockedVehicles : []),
    ]);
    for (const v of VEHICLES) {
      if (fans >= v.unlockFans) {
        unlockedSet.add(v.id);
      }
    }

    return {
      fans,
      unlockedVehicles: Array.from(unlockedSet),
      completedEvents: parsed.completedEvents || {},
      selectedVehicleId:
        parsed.selectedVehicleId && unlockedSet.has(parsed.selectedVehicleId)
          ? parsed.selectedVehicleId
          : defaults.selectedVehicleId,
      selectedTrackId: parsed.selectedTrackId || defaults.selectedTrackId,
      careerStats: {
        ...defaults.careerStats,
        ...(parsed.careerStats || {}),
      },
      settings: {
        ...defaults.settings,
        ...(parsed.settings || {}),
      },
      keyBindings: {
        ...defaults.keyBindings,
        ...(parsed.keyBindings || {}),
      },
    };
  } catch {
    return getDefaultProgress();
  }
}

export function saveProgress(progress: PlayerProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}

export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'SPACE';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'ArrowUp') return 'UP';
  if (code === 'ArrowDown') return 'DOWN';
  if (code === 'ArrowLeft') return 'LEFT';
  if (code === 'ArrowRight') return 'RIGHT';
  return code.toUpperCase();
}
