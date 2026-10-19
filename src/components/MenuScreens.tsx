import React, { useEffect, useState } from 'react';
import {
  Play,
  Trophy,
  Car,
  Sliders,
  Gamepad2,
  ArrowLeft,
  Lock,
  CheckCircle2,
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  Flame,
  Shield,
  Crosshair,
} from 'lucide-react';
import {
  CareerEvent,
  GameScreen,
  GameSettings,
  KeyBindings,
  PlayerProgress,
  PowerUpType,
  RaceResultsData,
  TrackDefinition,
  VehicleSpec,
} from '../types/game';
import { VEHICLES } from '../data/vehicles';
import { CAREER_EVENTS, TRACKS } from '../data/tracks';
import { POWERUP_META, PowerUpIcon } from './PowerUpBadge';
import { DEFAULT_KEY_BINDINGS, formatKeyCode } from '../utils/storage';
import { soundEngine } from '../audio/SoundEngine';
import { ControllerBrand, gamepadManager } from '../engine/GamepadManager';

interface MenuOverlayProps {
  screen: GameScreen;
  progress: PlayerProgress;
  selectedVehicle: VehicleSpec;
  selectedTrack: TrackDefinition;
  raceLaps: number;
  aiCount: number;
  aiDifficulty: number;
  lastResults: RaceResultsData | null;
  onNavigate: (screen: GameScreen) => void;
  onSelectVehicle: (vehicleId: string) => void;
  onSelectTrack: (trackId: string) => void;
  onChangeRaceConfig: (laps: number, aiCount: number, aiDifficulty: number) => void;
  onStartQuickRace: () => void;
  onStartCareerEvent: (event: CareerEvent) => void;
  onUpdateSettings: (settings: GameSettings) => void;
  onUpdateKeyBindings: (bindings: KeyBindings) => void;
  onResumeRace: () => void;
  onRestartRace: () => void;
  onQuitToMenu: () => void;
}

export const MenuOverlay: React.FC<MenuOverlayProps> = ({
  screen,
  progress,
  selectedVehicle,
  selectedTrack,
  raceLaps,
  aiCount,
  aiDifficulty,
  lastResults,
  onNavigate,
  onSelectVehicle,
  onSelectTrack,
  onChangeRaceConfig,
  onStartQuickRace,
  onStartCareerEvent,
  onUpdateSettings,
  onUpdateKeyBindings,
  onResumeRace,
  onRestartRace,
  onQuitToMenu,
}) => {
  const [listeningKey, setListeningKey] = useState<keyof KeyBindings | null>(null);
  const [padStatus, setPadStatus] = useState<{
    connected: boolean;
    brand: ControllerBrand;
    name: string;
  }>({ connected: false, brand: 'XBOX', name: '' });

  useEffect(() => {
    return gamepadManager.onStatusChange((st) => setPadStatus(st));
  }, []);

  const handleKeyCapture = (e: React.KeyboardEvent) => {
    if (!listeningKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code !== 'Escape') {
      onUpdateKeyBindings({
        ...progress.keyBindings,
        [listeningKey]: e.code,
      });
    }
    setListeningKey(null);
  };

  if (screen === 'RACING') return null;

  return (
    <div
      className="menu-root-overlay"
      tabIndex={0}
      onKeyDown={listeningKey ? handleKeyCapture : undefined}
    >
      {/* Top Persistent Header for Non-Pause Screens */}
      {screen !== 'PAUSED' && (
        <header className="menu-topbar">
          <div
            className="brand-logo"
            onClick={() => {
              soundEngine.playUIClick();
              onNavigate('MENU');
            }}
          >
            <span className="brand-main">BLURR</span>
            <span className="brand-tag">NEON OVERDRIVE</span>
          </div>

          <div className="topbar-stats">
            {padStatus.connected && (
              <div className="stat-chip gamepad-chip" title={padStatus.name}>
                <Gamepad2 size={15} />
                <span>
                  {padStatus.brand === 'PLAYSTATION'
                    ? 'PS CONTROLLER READY'
                    : 'XBOX / GAMEPAD READY'}
                </span>
              </div>
            )}
            <div className="stat-chip fans-chip">
              <Sparkles size={15} />
              <span>{progress.fans.toLocaleString()} FANS</span>
            </div>
            <div className="stat-chip">
              <Trophy size={15} />
              <span>{progress.careerStats.wins} WINS</span>
            </div>
            <div className="stat-chip">
              <Car size={15} />
              <span>{selectedVehicle.name}</span>
            </div>
            <button
              className="topbar-mute-btn"
              onClick={() =>
                onUpdateSettings({
                  ...progress.settings,
                  muted: !progress.settings.muted,
                })
              }
            >
              {progress.settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>
        </header>
      )}

      {/* =====================================================================
          MAIN MENU
      ===================================================================== */}
      {screen === 'MENU' && (
        <div className="screen-layout main-menu-layout">
          <div className="menu-left-column">
            <div className="hero-badge">ARCADE STREET COMBAT RACING</div>
            <h1 className="hero-title">
              HIGH-SPEED <span className="neon-cyan">COMBAT</span> WITHOUT LIMITS
            </h1>
            <p className="hero-subtitle">
              Master high-angle drifting, collect holographic power-ups, and battle rival AI
              drivers across neon-lit urban circuits.
            </p>

            <div className="menu-nav-stack">
              <button
                className="menu-btn primary-cta"
                onClick={() => {
                  soundEngine.playUIClick(true);
                  onNavigate('RACE_SETUP');
                }}
              >
                <Play size={20} />
                <div>
                  <div className="btn-title">PLAY RACE</div>
                  <div className="btn-sub">Configure circuit, laps & launch into combat</div>
                </div>
              </button>

              <button
                className="menu-btn"
                onClick={() => {
                  soundEngine.playUIClick(true);
                  onNavigate('CAREER');
                }}
              >
                <Trophy size={20} />
                <div>
                  <div className="btn-title">CAREER MODE</div>
                  <div className="btn-sub">5 Championship Heats • Earn Fans & Unlock Cars</div>
                </div>
              </button>

              <button
                className="menu-btn"
                onClick={() => {
                  soundEngine.playUIClick();
                  onNavigate('GARAGE');
                }}
              >
                <Car size={20} />
                <div>
                  <div className="btn-title">VEHICLE GARAGE</div>
                  <div className="btn-sub">
                    Inspect 3D rigs • Active: {selectedVehicle.name}
                  </div>
                </div>
              </button>

              <div className="menu-btn-row">
                <button
                  className="menu-btn half"
                  onClick={() => {
                    soundEngine.playUIClick();
                    onNavigate('CONTROLS');
                  }}
                >
                  <Gamepad2 size={18} />
                  <span>CONTROLS & GUIDE</span>
                </button>

                <button
                  className="menu-btn half"
                  onClick={() => {
                    soundEngine.playUIClick();
                    onNavigate('SETTINGS');
                  }}
                >
                  <Sliders size={18} />
                  <span>SETTINGS</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right side Showcase Card over the 3D Showroom Car */}
          <div className="menu-right-showcase">
            <div className="showcase-floating-card">
              <div className="sc-header">
                <span className="sc-class">{selectedVehicle.archetype}</span>
                <span className="sc-drag-hint">DRAG 3D VIEW TO ROTATE</span>
              </div>
              <h2 className="sc-car-name" style={{ color: selectedVehicle.accentColor }}>
                {selectedVehicle.name}
              </h2>
              <p className="sc-tagline">{selectedVehicle.tagline}</p>

              <div className="mini-stats-grid">
                <StatBar label="TOP SPEED" value={selectedVehicle.stats.topSpeed} color={selectedVehicle.accentColor} />
                <StatBar label="ACCELERATION" value={selectedVehicle.stats.acceleration} color={selectedVehicle.accentColor} />
                <StatBar label="HANDLING" value={selectedVehicle.stats.handling} color={selectedVehicle.accentColor} />
                <StatBar label="DRIFT" value={selectedVehicle.stats.drift} color={selectedVehicle.accentColor} />
                <StatBar label="DURABILITY" value={selectedVehicle.stats.durability} color={selectedVehicle.accentColor} />
              </div>

              <button
                className="instant-launch-btn"
                onClick={() => {
                  soundEngine.playUIClick(true);
                  onStartQuickRace();
                }}
              >
                <Flame size={18} /> INSTANT LAUNCH ON {selectedTrack.name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VEHICLE GARAGE
      ===================================================================== */}
      {screen === 'GARAGE' && (
        <div className="screen-layout garage-layout">
          <div className="panel-card garage-panel">
            <div className="panel-header-row">
              <button
                className="back-btn"
                onClick={() => {
                  soundEngine.playUIClick();
                  onNavigate('MENU');
                }}
              >
                <ArrowLeft size={18} /> BACK
              </button>
              <h2>VEHICLE GARAGE // 3D INSPECTION</h2>
            </div>

            <div className="vehicle-roster-list">
              {VEHICLES.map((v) => {
                const isUnlocked =
                  progress.unlockedVehicles.includes(v.id) || progress.fans >= v.unlockFans;
                const isSelected = selectedVehicle.id === v.id;
                return (
                  <button
                    key={v.id}
                    className={`vehicle-select-card ${isSelected ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}`}
                    onClick={() => {
                      soundEngine.playUIClick(true);
                      if (isUnlocked) {
                        onSelectVehicle(v.id);
                      }
                    }}
                  >
                    <div
                      className="car-swatch"
                      style={{ background: v.accentColor }}
                    />
                    <div className="car-card-info">
                      <div className="car-card-name">{v.name}</div>
                      <div className="car-card-arch">{v.archetype}</div>
                    </div>
                    {isUnlocked ? (
                      isSelected && <CheckCircle2 size={18} color={v.accentColor} />
                    ) : (
                      <div className="lock-badge">
                        <Lock size={14} /> {v.unlockFans} FANS
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="selected-car-specs">
              <h3 style={{ color: selectedVehicle.accentColor }}>{selectedVehicle.name}</h3>
              <p>{selectedVehicle.tagline}</p>
              <div className="mini-stats-grid">
                <StatBar label="TOP SPEED" value={selectedVehicle.stats.topSpeed} color={selectedVehicle.accentColor} />
                <StatBar label="ACCELERATION" value={selectedVehicle.stats.acceleration} color={selectedVehicle.accentColor} />
                <StatBar label="HANDLING" value={selectedVehicle.stats.handling} color={selectedVehicle.accentColor} />
                <StatBar label="DRIFT CAPABILITY" value={selectedVehicle.stats.drift} color={selectedVehicle.accentColor} />
                <StatBar label="ARMOR DURABILITY" value={selectedVehicle.stats.durability} color={selectedVehicle.accentColor} />
              </div>

              <button
                className="menu-btn primary-cta full-width"
                onClick={() => {
                  soundEngine.playUIClick(true);
                  onNavigate('RACE_SETUP');
                }}
              >
                <Play size={18} /> CONFIRM VEHICLE & PROCEED TO RACE
              </button>
            </div>
          </div>

          <div className="garage-preview-hint">
            <span>CLICK & DRAG 3D VEHICLE TO INSPECT CHASSIS</span>
          </div>
        </div>
      )}

      {/* =====================================================================
          RACE SETUP
      ===================================================================== */}
      {screen === 'RACE_SETUP' && (
        <div className="screen-layout centered-panel-layout">
          <div className="panel-card wide-panel">
            <div className="panel-header-row">
              <button
                className="back-btn"
                onClick={() => {
                  soundEngine.playUIClick();
                  onNavigate('MENU');
                }}
              >
                <ArrowLeft size={18} /> BACK
              </button>
              <h2>RACE SETUP // SELECT CIRCUIT & RULES</h2>
            </div>

            <div className="setup-section-label">1. SELECT CIRCUIT</div>
            <div className="tracks-grid">
              {TRACKS.map((t) => {
                const active = selectedTrack.id === t.id;
                return (
                  <div
                    key={t.id}
                    className={`track-card ${active ? 'active' : ''}`}
                    style={{ borderColor: active ? t.accentNeon : undefined }}
                    onClick={() => {
                      soundEngine.playUIClick(true);
                      onSelectTrack(t.id);
                    }}
                  >
                    <div className="track-difficulty" style={{ color: t.accentNeon }}>
                      {t.difficulty} CIRCUIT // {t.location}
                    </div>
                    <h3>{t.name}</h3>
                    <p>{t.description}</p>
                    <div className="track-landmarks">
                      {t.landmarks.map((lm) => (
                        <span key={lm.name} className="landmark-tag">
                          {lm.name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="setup-options-row">
              <div className="setup-option-box">
                <label>LAPS</label>
                <div className="pill-selector">
                  {[2, 3, 5].map((l) => (
                    <button
                      key={l}
                      className={raceLaps === l ? 'active' : ''}
                      onClick={() => onChangeRaceConfig(l, aiCount, aiDifficulty)}
                    >
                      {l} LAPS
                    </button>
                  ))}
                </div>
              </div>

              <div className="setup-option-box">
                <label>AI RIVALS</label>
                <div className="pill-selector">
                  {[5, 6, 7].map((c) => (
                    <button
                      key={c}
                      className={aiCount === c ? 'active' : ''}
                      onClick={() => onChangeRaceConfig(raceLaps, c, aiDifficulty)}
                    >
                      {c} RIVALS
                    </button>
                  ))}
                </div>
              </div>

              <div className="setup-option-box">
                <label>AI AGGRESSION & PACE</label>
                <div className="pill-selector">
                  {[
                    { label: 'ROOKIE', val: 0.85 },
                    { label: 'PRO', val: 0.96 },
                    { label: 'ELITE', val: 1.06 },
                  ].map((d) => (
                    <button
                      key={d.label}
                      className={Math.abs(aiDifficulty - d.val) < 0.03 ? 'active' : ''}
                      onClick={() => onChangeRaceConfig(raceLaps, aiCount, d.val)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="setup-footer-bar">
              <div className="chosen-summary">
                <span>VEHICLE: <strong>{selectedVehicle.name}</strong></span>
                <span>CIRCUIT: <strong>{selectedTrack.name}</strong></span>
              </div>
              <button
                className="menu-btn primary-cta launch-btn"
                onClick={() => {
                  soundEngine.playUIClick(true);
                  onStartQuickRace();
                }}
              >
                <Play size={20} /> LAUNCH RACE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          CAREER MODE
      ===================================================================== */}
      {screen === 'CAREER' && (
        <div className="screen-layout centered-panel-layout">
          <div className="panel-card wide-panel">
            <div className="panel-header-row">
              <button
                className="back-btn"
                onClick={() => {
                  soundEngine.playUIClick();
                  onNavigate('MENU');
                }}
              >
                <ArrowLeft size={18} /> BACK
              </button>
              <h2>CAREER CHAMPIONSHIP // OVERDRIVE TOUR</h2>
            </div>

            <div className="career-events-grid">
              {CAREER_EVENTS.map((ev) => {
                const unlocked = progress.fans >= ev.unlockFansRequired;
                const record = progress.completedEvents[ev.id];
                const track = TRACKS.find((t) => t.id === ev.trackId)!;

                return (
                  <div
                    key={ev.id}
                    className={`career-event-card ${!unlocked ? 'locked' : ''}`}
                  >
                    <div className="ce-top">
                      <span className="ce-track" style={{ color: track.accentNeon }}>
                        {track.name} • {ev.laps} LAPS
                      </span>
                      {record && (
                        <span className="ce-best">
                          BEST: #{record.bestPosition}
                        </span>
                      )}
                    </div>
                    <h3>{ev.title}</h3>
                    <p>{ev.subtitle}</p>
                    <div className="ce-meta">
                      <span>REWARD: +{ev.rewardFans} FANS</span>
                      <span>GRID: {ev.aiCount + 1} CARS</span>
                    </div>

                    {unlocked ? (
                      <button
                        className="menu-btn primary-cta full-width"
                        onClick={() => {
                          soundEngine.playUIClick(true);
                          onStartCareerEvent(ev);
                        }}
                      >
                        <Play size={16} /> ENTER EVENT
                      </button>
                    ) : (
                      <div className="ce-locked-banner">
                        <Lock size={15} /> REQUIRES {ev.unlockFansRequired} FANS
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          CONTROLS & HOW TO PLAY
      ===================================================================== */}
      {screen === 'CONTROLS' && (
        <div className="screen-layout centered-panel-layout">
          <div className="panel-card wide-panel">
            <div className="panel-header-row">
              <button
                className="back-btn"
                onClick={() => {
                  soundEngine.playUIClick();
                  onNavigate('MENU');
                }}
              >
                <ArrowLeft size={18} /> BACK
              </button>
              <h2>CONTROLS & COMBAT MANUAL</h2>
            </div>

            <div className="controls-two-col">
              <div>
                <div className="setup-section-label">
                  KEYBOARD CONTROLS (CLICK ANY KEY TO REBIND)
                </div>
                <div className="keybind-list">
                  {(
                    [
                      ['accelerate', 'Accelerate (or Up Arrow)'],
                      ['brake', 'Brake / Reverse (or Down Arrow)'],
                      ['steerLeft', 'Steer Left (or Left Arrow)'],
                      ['steerRight', 'Steer Right (or Right Arrow)'],
                      ['drift', 'Handbrake / Drift'],
                      ['firePowerUp', 'Activate Power-Up (or Left Click)'],
                      ['switchPowerUp', 'Switch Stored Power-Up'],
                      ['nitro', 'Auxiliary Nitro Boost'],
                      ['resetCar', 'Reset Vehicle to Track'],
                    ] as [keyof KeyBindings, string][]
                  ).map(([key, label]) => (
                    <div key={key} className="keybind-row">
                      <span>{label}</span>
                      <button
                        className={`keybind-btn ${listeningKey === key ? 'listening' : ''}`}
                        onClick={() => setListeningKey(key)}
                      >
                        {listeningKey === key
                          ? 'PRESS ANY KEY...'
                          : formatKeyCode(progress.keyBindings[key])}
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="reset-binds-btn"
                  onClick={() => onUpdateKeyBindings({ ...DEFAULT_KEY_BINDINGS })}
                >
                  <RotateCcw size={14} /> RESTORE DEFAULT CONTROLS
                </button>

                <div className="setup-section-label" style={{ marginTop: '18px' }}>
                  EXTERNAL GAMEPAD MAPPING (PLAYSTATION & XBOX)
                </div>
                <div className="keybind-list">
                  {[
                    ['Accelerate (Analog Gas)', 'R2 Trigger', 'RT Trigger'],
                    ['Brake / Reverse', 'L2 Trigger', 'LT Trigger'],
                    ['Steer Left / Right', 'Left Stick / D-Pad', 'Left Stick / D-Pad'],
                    ['Fire Power-Up', '✕ (Cross) / R1', 'A / RB'],
                    ['Handbrake / Drift', '○ (Circle) / L1', 'B / LB'],
                    ['Auxiliary Nitro Boost', '□ (Square)', 'X'],
                    ['Switch Power-Up Slot', '△ (Triangle)', 'Y'],
                    ['Reset Vehicle to Track', 'SHARE / L3', 'VIEW / LS'],
                    ['Pause / Resume Race', 'OPTIONS', 'MENU / START'],
                  ].map(([action, psBtn, xboxBtn]) => (
                    <div key={action} className="keybind-row gamepad-map-row">
                      <span>{action}</span>
                      <div className="gamepad-badges">
                        <span className="pad-badge ps">PS: {psBtn}</span>
                        <span className="pad-badge xbox">XB: {xboxBtn}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="setup-section-label">COMBAT POWER-UPS ARSENAL</div>
                <div className="powerup-guide-list">
                  {(Object.keys(POWERUP_META) as PowerUpType[]).map((type) => {
                    const meta = POWERUP_META[type];
                    return (
                      <div key={type} className="pu-guide-item">
                        <div className="pu-guide-icon" style={{ background: meta.bg }}>
                          <PowerUpIcon type={type} size={22} />
                        </div>
                        <div>
                          <div className="pu-guide-name" style={{ color: meta.color }}>
                            {meta.label}
                          </div>
                          <div className="pu-guide-desc">{meta.shortDesc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SETTINGS
      ===================================================================== */}
      {screen === 'SETTINGS' && (
        <div className="screen-layout centered-panel-layout">
          <div className="panel-card medium-panel">
            <div className="panel-header-row">
              <button
                className="back-btn"
                onClick={() => {
                  soundEngine.playUIClick();
                  onNavigate('MENU');
                }}
              >
                <ArrowLeft size={18} /> BACK
              </button>
              <h2>SYSTEM & AUDIO SETTINGS</h2>
            </div>

            <div className="settings-list">
              <div className="setting-row">
                <label>SOUND EFFECTS VOLUME ({Math.round(progress.settings.volume * 100)}%)</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={progress.settings.volume}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...progress.settings,
                      volume: parseFloat(e.target.value),
                    })
                  }
                />
              </div>

              <div className="setting-row">
                <label>SYNTHWAVE MUSIC VOLUME ({Math.round(progress.settings.musicVolume * 100)}%)</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={progress.settings.musicVolume}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...progress.settings,
                      musicVolume: parseFloat(e.target.value),
                    })
                  }
                />
              </div>

              <div className="setting-row">
                <label>MUTE ALL AUDIO</label>
                <div className="pill-selector">
                  <button
                    className={!progress.settings.muted ? 'active' : ''}
                    onClick={() => onUpdateSettings({ ...progress.settings, muted: false })}
                  >
                    AUDIO ON
                  </button>
                  <button
                    className={progress.settings.muted ? 'active' : ''}
                    onClick={() => onUpdateSettings({ ...progress.settings, muted: true })}
                  >
                    MUTED
                  </button>
                </div>
              </div>

              <div className="setting-row">
                <label>SPEEDOMETER UNIT</label>
                <div className="pill-selector">
                  <button
                    className={progress.settings.speedUnit === 'KMH' ? 'active' : ''}
                    onClick={() => onUpdateSettings({ ...progress.settings, speedUnit: 'KMH' })}
                  >
                    KM/H
                  </button>
                  <button
                    className={progress.settings.speedUnit === 'MPH' ? 'active' : ''}
                    onClick={() => onUpdateSettings({ ...progress.settings, speedUnit: 'MPH' })}
                  >
                    MPH
                  </button>
                </div>
              </div>

              <div className="setting-row">
                <label>GRAPHICS QUALITY</label>
                <div className="pill-selector">
                  {(['LOW', 'MEDIUM', 'HIGH'] as const).map((q) => (
                    <button
                      key={q}
                      className={progress.settings.quality === q ? 'active' : ''}
                      onClick={() => onUpdateSettings({ ...progress.settings, quality: q })}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-row">
                <label>IMPACT CAMERA SHAKE</label>
                <div className="pill-selector">
                  <button
                    className={progress.settings.cameraShake ? 'active' : ''}
                    onClick={() => onUpdateSettings({ ...progress.settings, cameraShake: true })}
                  >
                    ENABLED
                  </button>
                  <button
                    className={!progress.settings.cameraShake ? 'active' : ''}
                    onClick={() => onUpdateSettings({ ...progress.settings, cameraShake: false })}
                  >
                    OFF
                  </button>
                </div>
              </div>

              <div className="setting-row">
                <label>HUD CIRCUIT MINIMAP</label>
                <div className="pill-selector">
                  <button
                    className={progress.settings.showMinimap ? 'active' : ''}
                    onClick={() => onUpdateSettings({ ...progress.settings, showMinimap: true })}
                  >
                    VISIBLE
                  </button>
                  <button
                    className={!progress.settings.showMinimap ? 'active' : ''}
                    onClick={() => onUpdateSettings({ ...progress.settings, showMinimap: false })}
                  >
                    HIDDEN
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PAUSE MENU MODAL
      ===================================================================== */}
      {screen === 'PAUSED' && (
        <div className="screen-layout centered-panel-layout">
          <div className="panel-card pause-panel">
            <h2>RACE PAUSED</h2>
            <p className="pause-sub">
              {selectedTrack.name} • {selectedVehicle.name}
            </p>

            <div className="menu-nav-stack">
              <button
                className="menu-btn primary-cta full-width"
                onClick={() => {
                  soundEngine.playUIClick(true);
                  onResumeRace();
                }}
              >
                <Play size={18} /> RESUME RACE (ESC)
              </button>

              <button
                className="menu-btn full-width"
                onClick={() => {
                  soundEngine.playUIClick(true);
                  onRestartRace();
                }}
              >
                <RotateCcw size={18} /> RESTART RACE
              </button>

              <button
                className="menu-btn full-width"
                onClick={() => {
                  soundEngine.playUIClick();
                  onQuitToMenu();
                }}
              >
                <ArrowLeft size={18} /> QUIT TO MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          RACE RESULTS SCREEN
      ===================================================================== */}
      {screen === 'RESULTS' && lastResults && (
        <div className="screen-layout centered-panel-layout">
          <div className="panel-card wide-panel results-panel">
            <div className="results-banner-top">
              <div>
                <div className="results-circuit-tag">{lastResults.trackName}</div>
                <h2>
                  FINISHED #{lastResults.playerPosition} OF {lastResults.totalRacers}
                </h2>
              </div>
              <div className="results-fans-earned">
                <Sparkles size={20} color="#00f2fe" />
                <span>+{lastResults.fansBreakdown.totalEarned} FANS EARNED</span>
              </div>
            </div>

            {lastResults.newlyUnlockedVehicles.length > 0 && (
              <div className="unlock-alert-banner">
                <Car size={18} />
                <span>
                  NEW VEHICLE UNLOCKED IN GARAGE:{' '}
                  <strong>{lastResults.newlyUnlockedVehicles.join(', ')}</strong>
                </span>
              </div>
            )}

            <div className="results-two-col">
              {/* Standings Table */}
              <div>
                <div className="setup-section-label">FINAL RACE STANDINGS</div>
                <div className="results-table">
                  {lastResults.standings.map((r) => (
                    <div
                      key={r.id}
                      className={`results-row ${r.isPlayer ? 'is-player' : ''}`}
                    >
                      <span className="res-pos">#{r.position}</span>
                      <span className="res-name">
                        {r.name} <small>({r.vehicleName})</small>
                      </span>
                      <span className="res-hits">
                        <Crosshair size={13} /> {r.stats.powerUpHits} HITS
                      </span>
                      <span className="res-time">
                        {r.finishTime
                          ? `${(r.finishTime / 1000).toFixed(2)}s`
                          : 'FINISHED'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fan Rewards Breakdown */}
              <div>
                <div className="setup-section-label">FAN PROGRESSION BREAKDOWN</div>
                <div className="fans-breakdown-card">
                  <div className="fb-row">
                    <span>Finishing Position Bonus</span>
                    <strong>+{lastResults.fansBreakdown.positionFans}</strong>
                  </div>
                  <div className="fb-row">
                    <span>Overtakes Completed</span>
                    <strong>+{lastResults.fansBreakdown.overtakeFans}</strong>
                  </div>
                  <div className="fb-row">
                    <span>Combat Hits & Wrecks</span>
                    <strong>+{lastResults.fansBreakdown.combatFans}</strong>
                  </div>
                  <div className="fb-row">
                    <span>Shield / Attack Evasions</span>
                    <strong>+{lastResults.fansBreakdown.evasionFans}</strong>
                  </div>
                  <div className="fb-row">
                    <span>High-Speed Drift Style</span>
                    <strong>+{lastResults.fansBreakdown.driftFans}</strong>
                  </div>
                  {lastResults.fansBreakdown.eventBonusFans > 0 && (
                    <div className="fb-row highlight">
                      <span>Career Podium Bonus</span>
                      <strong>+{lastResults.fansBreakdown.eventBonusFans}</strong>
                    </div>
                  )}
                  <div className="fb-total">
                    <span>TOTAL FANS EARNED</span>
                    <span>+{lastResults.fansBreakdown.totalEarned}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="results-actions-row">
              <button
                className="menu-btn"
                onClick={() => {
                  soundEngine.playUIClick();
                  onQuitToMenu();
                }}
              >
                <ArrowLeft size={18} /> RETURN TO MAIN MENU
              </button>
              <button
                className="menu-btn primary-cta"
                onClick={() => {
                  soundEngine.playUIClick(true);
                  onRestartRace();
                }}
              >
                <RotateCcw size={18} /> RACE AGAIN (REPLAY)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatBar: React.FC<{ label: string; value: number; color: string }> = ({
  label,
  value,
  color,
}) => (
  <div className="stat-bar-item">
    <div className="stat-bar-label">
      <span>{label}</span>
      <span>{value}</span>
    </div>
    <div className="stat-bar-track">
      <div
        className="stat-bar-fill"
        style={{ width: `${value}%`, background: color }}
      />
    </div>
  </div>
);
