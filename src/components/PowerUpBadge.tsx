import React from 'react';
import { PowerUpType } from '../types/game';

export const POWERUP_META: Record<
  PowerUpType,
  { label: string; blurName: string; shortDesc: string; color: string; bg: string }
> = {
  NITRO: {
    label: 'NITRO',
    blurName: 'Nitro',
    shortDesc: 'An intense burst of speed. High-velocity acceleration surge!',
    color: '#4ade80',
    bg: 'rgba(74, 222, 128, 0.22)',
  },
  BOLTS: {
    label: 'BOLT',
    blurName: 'Bolt',
    shortDesc: 'Shoot three energy rounds to nudge opponents off course.',
    color: '#e879f9',
    bg: 'rgba(232, 121, 249, 0.22)',
  },
  MISSILE: {
    label: 'SHUNT',
    blurName: 'Shunt',
    shortDesc: 'A powerful homing missile that flips rival cars into the air.',
    color: '#f43f5e',
    bg: 'rgba(244, 63, 94, 0.22)',
  },
  SHOCKWAVE: {
    label: 'BARGE',
    blurName: 'Barge',
    shortDesc: 'A close-range radial energy blast that shoves nearby vehicles away.',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.22)',
  },
  MINE: {
    label: 'MINE',
    blurName: 'Mine',
    shortDesc: 'Drop it behind you todetonate and spin pursuing vehicles out.',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.22)',
  },
  SHIELD: {
    label: 'SHIELD',
    blurName: 'Shield',
    shortDesc: 'Protects your vehicle from Power-up impacts and collision damage.',
    color: '#e2e8f0',
    bg: 'rgba(226, 232, 240, 0.22)',
  },
  REPAIR: {
    label: 'REPAIR',
    blurName: 'Repair',
    shortDesc: 'After all the punishment, a quick chassis fix restores integrity.',
    color: '#facc15',
    bg: 'rgba(250, 204, 21, 0.22)',
  },
};

/**
 * Draws the canonical Blur (2010) rounded-square neon hologram badge onto a 2D canvas
 * for 3D world-space track pickups and rear-bumper diegetic slots.
 */
export function drawBlurPowerUpCanvas(
  ctx: CanvasRenderingContext2D,
  type: PowerUpType | null,
  size = 256,
  isSelected = false
): void {
  ctx.clearRect(0, 0, size, size);
  const pad = size * 0.08;
  const w = size - pad * 2;
  const h = size - pad * 2;
  const r = size * 0.18;

  const roundRect = (x: number, y: number, rw: number, rh: number, rad: number) => {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + rw - rad, y);
    ctx.quadraticCurveTo(x + rw, y, x + rw, y + rad);
    ctx.lineTo(x + rw, y + rh - rad);
    ctx.quadraticCurveTo(x + rw, y + rh, x + rw - rad, y + rh);
    ctx.lineTo(x + rad, y + rh);
    ctx.quadraticCurveTo(x, y + rh, x, y + rh - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  };

  if (!type) {
    roundRect(pad, pad, w, h, r);
    ctx.fillStyle = 'rgba(10, 16, 28, 0.42)';
    ctx.fill();
    ctx.lineWidth = size * 0.025;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.stroke();
    return;
  }

  const meta = POWERUP_META[type];
  ctx.save();

  // Outer neon glow frame
  roundRect(pad, pad, w, h, r);
  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.52
  );
  grad.addColorStop(0, meta.bg.replace('0.22', isSelected ? '0.62' : '0.45'));
  grad.addColorStop(1, 'rgba(8, 12, 22, 0.78)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowColor = meta.color;
  ctx.shadowBlur = isSelected ? size * 0.12 : size * 0.07;
  ctx.lineWidth = isSelected ? size * 0.055 : size * 0.038;
  ctx.strokeStyle = meta.color;
  ctx.stroke();

  // Crisp inner white rim
  roundRect(pad + size * 0.03, pad + size * 0.03, w - size * 0.06, h - size * 0.06, r * 0.8);
  ctx.lineWidth = size * 0.014;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.stroke();

  // Draw canonical white glowing Blur glyph in center
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = meta.color;
  ctx.shadowBlur = size * 0.08;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const cx = size * 0.5;
  const cy = size * 0.5;

  switch (type) {
    case 'NITRO': {
      // Canonical Blur Nitro: Upper chevron + solid lower triangle
      ctx.lineWidth = size * 0.07;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.22, cy + size * 0.02);
      ctx.lineTo(cx, cy - size * 0.22);
      ctx.lineTo(cx + size * 0.22, cy + size * 0.02);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.03);
      ctx.lineTo(cx + size * 0.21, cy + size * 0.22);
      ctx.lineTo(cx - size * 0.21, cy + size * 0.22);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'MISSILE': {
      // Canonical Blur Shunt: Upper chevron + lower diamond
      ctx.lineWidth = size * 0.075;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.21, cy - size * 0.02);
      ctx.lineTo(cx, cy - size * 0.23);
      ctx.lineTo(cx + size * 0.21, cy - size * 0.02);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy + size * 0.0);
      ctx.lineTo(cx + size * 0.14, cy + size * 0.14);
      ctx.lineTo(cx, cy + size * 0.27);
      ctx.lineTo(cx - size * 0.14, cy + size * 0.14);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'BOLTS': {
      // Canonical Blur Bolt: Three small chevrons arranged in a triangle (1 top, 2 bottom)
      ctx.lineWidth = size * 0.062;
      const drawMiniChevron = (x: number, y: number) => {
        ctx.beginPath();
        ctx.moveTo(x - size * 0.1, y + size * 0.06);
        ctx.lineTo(x, y - size * 0.05);
        ctx.lineTo(x + size * 0.1, y + size * 0.06);
        ctx.stroke();
      };
      drawMiniChevron(cx, cy - size * 0.11);
      drawMiniChevron(cx - size * 0.15, cy + size * 0.12);
      drawMiniChevron(cx + size * 0.15, cy + size * 0.12);
      break;
    }

    case 'SHOCKWAVE': {
      // Canonical Blur Barge: Center energy circle flanked by left/right chevrons < O >
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = size * 0.068;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.11, cy - size * 0.16);
      ctx.lineTo(cx - size * 0.27, cy);
      ctx.lineTo(cx - size * 0.11, cy + size * 0.16);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx + size * 0.11, cy - size * 0.16);
      ctx.lineTo(cx + size * 0.27, cy);
      ctx.lineTo(cx + size * 0.11, cy + size * 0.16);
      ctx.stroke();
      break;
    }

    case 'MINE': {
      // Canonical Blur Mine: Horizontal base bar with 3 radiating prongs
      ctx.lineWidth = size * 0.068;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.25, cy + size * 0.16);
      ctx.lineTo(cx + size * 0.25, cy + size * 0.16);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy + size * 0.14);
      ctx.lineTo(cx, cy - size * 0.18);
      ctx.moveTo(cx - size * 0.05, cy + size * 0.12);
      ctx.lineTo(cx - size * 0.23, cy - size * 0.1);
      ctx.moveTo(cx + size * 0.05, cy + size * 0.12);
      ctx.lineTo(cx + size * 0.23, cy - size * 0.1);
      ctx.stroke();
      break;
    }

    case 'SHIELD': {
      // Canonical Blur Shield: Bold hexagon outline
      ctx.lineWidth = size * 0.072;
      ctx.beginPath();
      const rad = size * 0.22;
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3;
        const px = cx + Math.cos(ang) * rad;
        const py = cy + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 'REPAIR': {
      // Canonical Blur Repair: Horizontal open-end wrench
      ctx.lineWidth = size * 0.09;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.22, cy);
      ctx.lineTo(cx + size * 0.08, cy);
      ctx.stroke();

      ctx.lineWidth = size * 0.065;
      ctx.beginPath();
      ctx.arc(cx + size * 0.14, cy, size * 0.12, 0.55, Math.PI * 2 - 0.55);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx - size * 0.2, cy, size * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = '#090d16';
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

export const PowerUpIcon: React.FC<{ type: PowerUpType; size?: number }> = ({
  type,
  size = 28,
}) => {
  const color = POWERUP_META[type].color;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      style={{ filter: `drop-shadow(0 0 6px ${color})` }}
    >
      {type === 'NITRO' && (
        <>
          <path
            d="M16 34L32 16L48 34"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M32 29L47 48H17L32 29Z" fill="#ffffff" />
        </>
      )}
      {type === 'MISSILE' && (
        <>
          <path
            d="M17 30L32 14L47 30"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M32 31L42 41L32 51L22 41L32 31Z" fill="#ffffff" />
        </>
      )}
      {type === 'BOLTS' && (
        <>
          <path
            d="M24 27L32 18L40 27"
            stroke="#ffffff"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 45L20 36L28 45"
            stroke="#ffffff"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M36 45L44 36L52 45"
            stroke="#ffffff"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {type === 'SHOCKWAVE' && (
        <>
          <circle cx="32" cy="32" r="7.5" fill="#ffffff" />
          <path
            d="M23 19L11 32L23 45"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M41 19L53 32L41 45"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {type === 'MINE' && (
        <>
          <path
            d="M14 44H50"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M32 42V18M28 40L15 24M36 40L49 24"
            stroke="#ffffff"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
        </>
      )}
      {type === 'SHIELD' && (
        <polygon
          points="48,32 40,46 24,46 16,32 24,18 40,18"
          stroke="#ffffff"
          strokeWidth="6"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {type === 'REPAIR' && (
        <>
          <path
            d="M14 32H36"
            stroke="#ffffff"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M46 24C42 20 36 22 36 32C36 42 42 44 46 40"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
};
