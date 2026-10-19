import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Pause,
  Volume2,
  VolumeX,
  Shield,
  Flame,
  RotateCcw,
  Gamepad2,
} from 'lucide-react';
import {
  GameSettings,
  KeyBindings,
  LiveRaceSnapshot,
} from '../types/game';
import { POWERUP_META, PowerUpIcon } from './PowerUpBadge';
import { formatKeyCode } from '../utils/storage';
import { MobileInputState } from '../engine/RaceEngine';
import {
  ControllerBrand,
  gamepadManager,
  getControllerPrompts,
} from '../engine/GamepadManager';

interface RaceHUDProps {
  snapshot: LiveRaceSnapshot | null;
  settings: GameSettings;
  keyBindings: KeyBindings;
  onPause: () => void;
  onToggleMute: () => void;
  mobileInput: MobileInputState;
  onTriggerPowerUp: () => void;
  onSwitchPowerUp: () => void;
}

function formatRaceTime(ms: number): string {
  const totalSec = Math.max(0, ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export const RaceHUD: React.FC<RaceHUDProps> = ({
  snapshot,
  settings,
  keyBindings,
  onPause,
  onToggleMute,
  mobileInput,
  onTriggerPowerUp,
  onSwitchPowerUp,
}) => {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const [padState, setPadState] = useState<{
    connected: boolean;
    brand: ControllerBrand;
  }>({ connected: false, brand: 'XBOX' });

  useEffect(() => {
    return gamepadManager.onStatusChange((st) => {
      setPadState({ connected: st.connected, brand: st.brand });
    });
  }, []);

  // Draw Blur (2010) Circular Radar Minimap with glowing orange track loop
  useEffect(() => {
    if (!snapshot || !settings.showMinimap || !minimapRef.current) return;
    const canvas = minimapRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Circular radar background & subtle grid rings
    const cx = w * 0.5;
    const cy = h * 0.5;
    const radius = Math.min(w, h) * 0.5 - 3;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    const bgGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius);
    bgGrad.addColorStop(0, 'rgba(15, 29, 52, 0.85)');
    bgGrad.addColorStop(1, 'rgba(6, 13, 26, 0.94)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle radar range ring
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.58, 0, Math.PI * 2);
    ctx.stroke();

    const pts = snapshot.minimapTrackPoints;
    if (pts.length >= 3) {
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }

      const pad = 18;
      const spanX = Math.max(1, maxX - minX);
      const spanZ = Math.max(1, maxZ - minZ);
      const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);

      const toCanvasX = (x: number) => w * 0.5 + (x - (minX + maxX) * 0.5) * scale;
      const toCanvasY = (z: number) => h * 0.5 + (z - (minZ + maxZ) * 0.5) * scale;

      // Outer dark casing around orange track ribbon
      ctx.beginPath();
      pts.forEach((p, idx) => {
        const px = toCanvasX(p.x);
        const py = toCanvasY(p.z);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.lineWidth = 7.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Signature Blur (2010) bright orange track path
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 4.2;
      ctx.stroke();

      // Inner bright highlight
      ctx.strokeStyle = '#fdba74';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // Start/Finish marker
      const sfX = toCanvasX(pts[0].x);
      const sfY = toCanvasY(pts[0].z);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sfX - 4, sfY - 2, 8, 4);

      // Draw AI opponents
      for (const r of snapshot.standings) {
        if (r.isPlayer) continue;
        const rx = toCanvasX(r.mapX);
        const ry = toCanvasY(r.mapZ);
        ctx.beginPath();
        ctx.arc(rx, ry, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.strokeStyle = '#040814';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }

      // Draw Player directional arrow
      const px = toCanvasX(snapshot.player.mapX);
      const py = toCanvasY(snapshot.player.mapZ);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-snapshot.player.heading);
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [snapshot, settings.showMinimap]);

  if (!snapshot) return null;

  const {
    player,
    standings,
    countdownValue,
    raceElapsedMs,
    killFeed,
    activeNotification,
    wrongWay,
    currentLandmark,
  } = snapshot;

  const displaySpeed =
    settings.speedUnit === 'KMH'
      ? Math.round(player.speedMps * 3.45)
      : Math.round(player.speedMps * 2.15);

  const healthPct = Math.max(0, Math.min(100, (player.health / player.maxHealth) * 100));
  const activeHealthBars = Math.ceil((healthPct / 100) * 5);
  const healthBarColor =
    healthPct > 55 ? '#22c55e' : healthPct > 28 ? '#facc15' : '#ef4444';

  // Calculate live Blur Fan score & Fan Lights (1..5)
  const liveFans =
    650 +
    player.stats.overtakes * 35 +
    player.stats.powerUpHits * 65 +
    player.stats.wrecksCaused * 140 +
    player.stats.attacksEvaded * 75 +
    Math.round(player.stats.driftScore);
  const litFanSpheres = Math.min(5, Math.max(1, Math.floor(liveFans / 220)));
  const nextFanTarget = (litFanSpheres + 1) * 250 + 400;

  return (
    <div className="race-hud-overlay">
      {/* Nitro high-speed screen edge vignette */}
      {player.isBoosting && <div className="nitro-vignette" />}

      {/* ====================================================================
          TOP-LEFT: AUTHENTIC BLUR ANGLED POSITION + 5 'b' FAN SPHERES + NEXT AT
         ==================================================================== */}
      <div className="blur-hud-top-left">
        <div className="blur-pos-card">
          <div className="blur-pos-row">
            <span className="blur-pos-label">Position</span>
            <div className="blur-pos-numbers">
              <span className="blur-pos-main">{player.position}</span>
              <span className="blur-pos-total">/{standings.length}</span>
            </div>
          </div>

          <div className="blur-fan-spheres-row">
            {[1, 2, 3, 4, 5].map((idx) => {
              const isLit = idx <= litFanSpheres;
              return (
                <div
                  key={idx}
                  className={`blur-fan-sphere ${isLit ? 'lit' : ''}`}
                >
                  <span>b</span>
                </div>
              );
            })}
          </div>

          <div className="blur-next-at-row">
            <span className="blur-next-label">Next At</span>
            <span className="blur-next-value">{nextFanTarget.toLocaleString()}</span>
          </div>
        </div>

        <div className="blur-landmark-strip">
          <span>{currentLandmark}</span>
          <span className="blur-race-clock">{formatRaceTime(raceElapsedMs)}</span>
        </div>
      </div>

      {/* ====================================================================
          TOP-CENTER: WIDE REAR-VIEW MIRROR + 5-BAR HEALTH POD (|||||)
         ==================================================================== */}
      <div className="blur-mirror-wrapper">
        <div className="blur-mirror-bezel">
          <canvas
            id="blur-rear-mirror-canvas"
            width={420}
            height={105}
            className="blur-mirror-canvas"
          />
          <div className="blur-mirror-glare" />
        </div>
        {/* Attached 5-segment vertical health bars directly under mirror center */}
        <div className="blur-mirror-health-pod" title={`Chassis Integrity: ${player.health}/${player.maxHealth}`}>
          {[1, 2, 3, 4, 5].map((barIdx) => {
            const active = barIdx <= activeHealthBars;
            return (
              <span
                key={barIdx}
                className={`blur-health-segment ${active ? 'active' : ''}`}
                style={{
                  backgroundColor: active ? healthBarColor : 'rgba(255,255,255,0.16)',
                  boxShadow: active ? `0 0 8px ${healthBarColor}` : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* ====================================================================
          TOP-RIGHT: CIRCULAR ORANGE-TRACK RADAR + LAPS/SPEED WING + FANS
         ==================================================================== */}
      <div className="blur-hud-top-right">
        <div className="blur-radar-cluster">
          {settings.showMinimap && (
            <div className="blur-radar-circle">
              <canvas ref={minimapRef} width={118} height={118} />
            </div>
          )}

          <div className="blur-telemetry-wing">
            <div className="blur-wing-top">
              <span className="blur-wing-label">Laps</span>
              <span className="blur-wing-laps">
                {player.lap}
                <small>/{player.totalLaps}</small>
              </span>
            </div>
            <div className="blur-wing-divider" />
            <div className="blur-wing-bottom">
              <span className="blur-wing-unit">
                {settings.speedUnit === 'KMH' ? 'km/h' : 'mph'}
              </span>
              <span className="blur-wing-speed">{displaySpeed}</span>
            </div>
          </div>
        </div>

        {/* Fan Counter & Utility Row below Radar */}
        <div className="blur-fan-counter-row">
          <div className="blur-fan-pill">
            <span className="blur-fan-val">{liveFans.toLocaleString()}</span>
            <span className="blur-fan-badge">b</span>
          </div>

          <div className="hud-quick-actions">
            <button
              className="hud-icon-btn"
              onClick={onToggleMute}
              title={settings.muted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {settings.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button className="hud-icon-btn" onClick={onPause} title="Pause Race (ESC)">
              <Pause size={16} />
            </button>
          </div>
        </div>

        {/* Kill / Combat Feed */}
        {killFeed.length > 0 && (
          <div className="hud-killfeed">
            {killFeed.map((item) => (
              <div
                key={item.id}
                className="killfeed-item"
                style={{ borderLeftColor: item.color }}
              >
                <strong>{item.attacker}</strong> {item.actionText}{' '}
                <strong>{item.victim}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ====================================================================
          CENTER OVERLAYS: Countdown, Incoming Threat Warning, Notifications
         ==================================================================== */}
      <div className="hud-center-zone">
        {countdownValue >= 0 && (
          <div className={`countdown-banner ${countdownValue === 0 ? 'go' : ''}`}>
            {countdownValue === 0 ? 'GO!' : countdownValue}
          </div>
        )}

        {wrongWay && (
          <div className="threat-alert wrong-way-alert">
            <AlertTriangle size={22} />
            <span>WRONG WAY // TURN AROUND</span>
          </div>
        )}

        {player.incomingThreat && player.incomingThreat.active && (
          <div className="threat-alert">
            <AlertTriangle size={22} />
            <div>
              <div className="threat-title">
                INCOMING {player.incomingThreat.type} LOCK!
              </div>
              <div className="threat-sub">
                FIRED BY {player.incomingThreat.attackerName} — USE SHIELD OR EVADE
              </div>
            </div>
          </div>
        )}

        {activeNotification && countdownValue < 0 && (
          <div
            className="race-notification"
            style={{ borderColor: activeNotification.color }}
          >
            <div
              className="notif-main"
              style={{ color: activeNotification.color }}
            >
              {activeNotification.text}
            </div>
            {activeNotification.subtext && (
              <div className="notif-sub">{activeNotification.subtext}</div>
            )}
          </div>
        )}
      </div>

      {/* ====================================================================
          BOTTOM BAR: COMPACT NON-INTRUSIVE CONTROLS & POWER-UP DOCK MIRROR
         ==================================================================== */}
      <div className="blur-bottom-bar">
        <div className="blur-status-left">
          {player.isShielded && (
            <span className="status-pill shield">
              <Shield size={13} /> SHIELD ACTIVE
            </span>
          )}
          {player.isBoosting && (
            <span className="status-pill boost">
              <Flame size={13} /> NITRO BOOST
            </span>
          )}
          {player.isDrifting && (
            <span className="status-pill drift">DRIFTING +NITRO</span>
          )}

          <div className="hud-controls-hint">
            {padState.connected ? (
              <>
                <span className="pad-active-tag">
                  <Gamepad2 size={13} />{' '}
                  {padState.brand === 'PLAYSTATION' ? 'PS PAD' : 'XBOX PAD'}
                </span>
                <span>
                  <strong>[{getControllerPrompts(padState.brand).fire}]</strong> FIRE
                </span>
                <span>
                  <strong>[{getControllerPrompts(padState.brand).switchItem}]</strong> SLOT
                </span>
                <span>
                  <strong>[{getControllerPrompts(padState.brand).drift}]</strong> DRIFT
                </span>
              </>
            ) : (
              <>
                <span>
                  <strong>[{formatKeyCode(keyBindings.firePowerUp)}]</strong> FIRE
                </span>
                <span>
                  <strong>[{formatKeyCode(keyBindings.switchPowerUp)}]</strong> SWITCH
                </span>
                <span>
                  <strong>[{formatKeyCode(keyBindings.drift)}]</strong> DRIFT
                </span>
                <span>
                  <strong>[{formatKeyCode(keyBindings.nitro)}]</strong> NITRO ({player.nitroCharge}%)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Interactive 3-Slot Power-Up Dock tucked cleanly at bottom-right */}
        <div className="powerup-slots-dock">
          {[0, 1, 2].map((slotIdx) => {
            const pu = player.powerUps[slotIdx];
            const isSelected = player.selectedSlot === slotIdx;
            const meta = pu ? POWERUP_META[pu] : null;
            return (
              <div
                key={slotIdx}
                onClick={() => {
                  if (isSelected && pu) onTriggerPowerUp();
                  else onSwitchPowerUp();
                }}
                className={`powerup-slot ${isSelected ? 'selected' : ''} ${pu ? 'filled' : 'empty'}`}
                style={{
                  borderColor: pu && isSelected ? meta!.color : undefined,
                  background: pu ? meta!.bg : undefined,
                }}
              >
                <span className="slot-index">{slotIdx + 1}</span>
                {pu ? (
                  <>
                    <PowerUpIcon type={pu} size={24} />
                    <span className="slot-name" style={{ color: meta!.color }}>
                      {meta!.label}
                    </span>
                  </>
                ) : (
                  <span className="slot-empty-text">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* MOBILE / TOUCH CONTROLS OVERLAY */}
      <div className="mobile-touch-controls">
        <div className="touch-left-pad">
          <button
            className="touch-btn steer-btn"
            onPointerDown={() => (mobileInput.steerLeft = true)}
            onPointerUp={() => (mobileInput.steerLeft = false)}
            onPointerLeave={() => (mobileInput.steerLeft = false)}
          >
            ◀
          </button>
          <button
            className="touch-btn steer-btn"
            onPointerDown={() => (mobileInput.steerRight = true)}
            onPointerUp={() => (mobileInput.steerRight = false)}
            onPointerLeave={() => (mobileInput.steerRight = false)}
          >
            ▶
          </button>
        </div>

        <div className="touch-right-pad">
          <button
            className="touch-btn item-btn"
            onClick={onTriggerPowerUp}
          >
            FIRE
          </button>
          <button
            className="touch-btn switch-btn"
            onClick={onSwitchPowerUp}
          >
            <RotateCcw size={16} />
          </button>
          <button
            className="touch-btn drift-btn"
            onPointerDown={() => (mobileInput.drift = true)}
            onPointerUp={() => (mobileInput.drift = false)}
            onPointerLeave={() => (mobileInput.drift = false)}
          >
            DRIFT
          </button>
          <button
            className="touch-btn nitro-btn"
            onPointerDown={() => (mobileInput.nitro = true)}
            onPointerUp={() => (mobileInput.nitro = false)}
            onPointerLeave={() => (mobileInput.nitro = false)}
          >
            NITRO
          </button>
          <button
            className="touch-btn brake-btn"
            onPointerDown={() => (mobileInput.brake = true)}
            onPointerUp={() => (mobileInput.brake = false)}
            onPointerLeave={() => (mobileInput.brake = false)}
          >
            BRAKE
          </button>
          <button
            className="touch-btn gas-btn"
            onPointerDown={() => (mobileInput.accelerate = true)}
            onPointerUp={() => (mobileInput.accelerate = false)}
            onPointerLeave={() => (mobileInput.accelerate = false)}
          >
            GAS
          </button>
        </div>
      </div>
    </div>
  );
};
