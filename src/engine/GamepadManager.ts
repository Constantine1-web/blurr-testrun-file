export type ControllerBrand = 'PLAYSTATION' | 'XBOX' | 'GENERIC';

export interface GamepadFrameState {
  connected: boolean;
  id: string;
  brand: ControllerBrand;
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) .. +1 (left)
  drift: boolean;
  nitro: boolean;
  lookAxisX: number; // -1..1 for showroom rotation
  justPressedFire: boolean;
  justPressedSwitch: boolean;
  justPressedReset: boolean;
  justPressedPause: boolean;
  navUp: boolean;
  navDown: boolean;
  navLeft: boolean;
  navRight: boolean;
  navConfirm: boolean;
  navBack: boolean;
}

export interface ControllerPrompts {
  gas: string;
  brake: string;
  steer: string;
  drift: string;
  fire: string;
  switchItem: string;
  nitro: string;
  reset: string;
  pause: string;
}

export function getControllerPrompts(brand: ControllerBrand): ControllerPrompts {
  if (brand === 'PLAYSTATION') {
    return {
      gas: 'R2',
      brake: 'L2',
      steer: 'L-STICK / D-PAD',
      drift: '○ / L1',
      fire: '✕ / R1',
      switchItem: '△',
      nitro: '□',
      reset: 'SHARE / L3',
      pause: 'OPTIONS',
    };
  }
  return {
    gas: 'RT',
    brake: 'LT',
    steer: 'L-STICK / D-PAD',
    drift: 'B / LB',
    fire: 'A / RB',
    switchItem: 'Y',
    nitro: 'X',
    reset: 'VIEW / LS',
    pause: 'MENU / START',
  };
}

function detectBrand(id: string): ControllerBrand {
  const lower = id.toLowerCase();
  if (
    lower.includes('054c') ||
    lower.includes('dualsense') ||
    lower.includes('dualshock') ||
    lower.includes('playstation') ||
    lower.includes('ps4') ||
    lower.includes('ps5') ||
    lower.includes('wireless controller')
  ) {
    return 'PLAYSTATION';
  }
  if (
    lower.includes('xbox') ||
    lower.includes('xinput') ||
    lower.includes('045e') ||
    lower.includes('microsoft')
  ) {
    return 'XBOX';
  }
  return 'GENERIC';
}

function applyDeadzone(val: number, deadzone = 0.12): number {
  if (Math.abs(val) < deadzone) return 0;
  const sign = Math.sign(val);
  const normalized = (Math.abs(val) - deadzone) / (1 - deadzone);
  return sign * Math.min(1, Math.pow(normalized, 1.2));
}

export class GamepadManager {
  private prevButtons: boolean[] = [];
  private lastStickNavTime = 0;
  private activeGamepadIndex: number | null = null;
  private statusListeners = new Set<(state: { connected: boolean; brand: ControllerBrand; name: string }) => void>();
  private lastConnected = false;
  private lastBrand: ControllerBrand = 'XBOX';
  private lastName = '';

  constructor() {
    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      this.activeGamepadIndex = e.gamepad.index;
      this.notifyStatus(true, e.gamepad.id);
    });
    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      if (this.activeGamepadIndex === e.gamepad.index) {
        this.activeGamepadIndex = null;
      }
      this.notifyStatus(false, '');
    });
  }

  public onStatusChange(
    cb: (state: { connected: boolean; brand: ControllerBrand; name: string }) => void
  ): () => void {
    this.statusListeners.add(cb);
    if (this.lastConnected) {
      cb({ connected: true, brand: this.lastBrand, name: this.lastName });
    }
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private notifyStatus(connected: boolean, rawId: string): void {
    const brand = detectBrand(rawId);
    if (
      connected !== this.lastConnected ||
      brand !== this.lastBrand ||
      rawId !== this.lastName
    ) {
      this.lastConnected = connected;
      this.lastBrand = brand;
      this.lastName = rawId;
      for (const cb of this.statusListeners) {
        cb({ connected, brand, name: rawId });
      }
    }
  }

  private getActiveGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (!pads) return null;

    if (this.activeGamepadIndex !== null && pads[this.activeGamepadIndex]?.connected) {
      return pads[this.activeGamepadIndex];
    }

    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected) {
        this.activeGamepadIndex = i;
        return p;
      }
    }
    return null;
  }

  public poll(): GamepadFrameState {
    const pad = this.getActiveGamepad();
    if (!pad) {
      if (this.lastConnected) {
        this.notifyStatus(false, '');
      }
      this.prevButtons = [];
      return {
        connected: false,
        id: '',
        brand: 'XBOX',
        throttle: 0,
        brake: 0,
        steer: 0,
        drift: false,
        nitro: false,
        lookAxisX: 0,
        justPressedFire: false,
        justPressedSwitch: false,
        justPressedReset: false,
        justPressedPause: false,
        navUp: false,
        navDown: false,
        navLeft: false,
        navRight: false,
        navConfirm: false,
        navBack: false,
      };
    }

    const brand = detectBrand(pad.id);
    if (!this.lastConnected || this.lastName !== pad.id) {
      this.notifyStatus(true, pad.id);
    }

    const buttons = pad.buttons;
    const axes = pad.axes;

    const isPressed = (idx: number): boolean => Boolean(buttons[idx]?.pressed);
    const btnValue = (idx: number): number => buttons[idx]?.value ?? 0;
    const wasPressed = (idx: number): boolean => Boolean(this.prevButtons[idx]);
    const justPressed = (idx: number): boolean => isPressed(idx) && !wasPressed(idx);

    // Analog triggers: R2/RT (button 7) for Gas, L2/LT (button 6) for Brake
    // Also support Right Stick Y (axis 3) as optional analog throttle/brake
    const rightStickY = axes[3] ?? 0;
    const stickGas = rightStickY < -0.2 ? applyDeadzone(-rightStickY, 0.2) : 0;
    const stickBrake = rightStickY > 0.2 ? applyDeadzone(rightStickY, 0.2) : 0;

    const throttle = Math.min(1, Math.max(btnValue(7), stickGas));
    const brake = Math.min(1, Math.max(btnValue(6), stickBrake));

    // Steering: Left Stick X (axis 0) + D-Pad Left (14) / D-Pad Right (15)
    // Note: in RaceEngine, positive steerInput = Turn Left, negative = Turn Right
    const leftStickX = applyDeadzone(axes[0] ?? 0, 0.12);
    const dpadSteer = (isPressed(14) ? 1 : 0) - (isPressed(15) ? 1 : 0);
    const steer = Math.max(-1, Math.min(1, -leftStickX + dpadSteer));

    // Drift: B/Circle (1) or LB/L1 (4)
    const drift = isPressed(1) || isPressed(4);

    // Aux Nitro: X/Square (2)
    const nitro = isPressed(2);

    // Showroom rotation axis: Right Stick X (axis 2) or Left Stick X (axis 0)
    const rightStickX = applyDeadzone(axes[2] ?? 0, 0.15);
    const lookAxisX = Math.abs(rightStickX) > 0.01 ? rightStickX : leftStickX;

    // Edge-triggered actions
    // Fire Power-up: A/Cross (0) or RB/R1 (5)
    const justPressedFire = justPressed(0) || justPressed(5);
    // Switch Power-up slot: Y/Triangle (3)
    const justPressedSwitch = justPressed(3);
    // Reset car: Share/View (8) or L3 (10)
    const justPressedReset = justPressed(8) || justPressed(10);
    // Pause: Options/Menu/Start (9)
    const justPressedPause = justPressed(9);

    // Menu Navigation (D-Pad edge or Left Stick with repeat interval)
    const now = performance.now();
    const leftStickY = axes[1] ?? 0;
    let stickNavUp = false;
    let stickNavDown = false;
    let stickNavLeft = false;
    let stickNavRight = false;

    if (now - this.lastStickNavTime > 210) {
      if (leftStickY < -0.55) {
        stickNavUp = true;
        this.lastStickNavTime = now;
      } else if (leftStickY > 0.55) {
        stickNavDown = true;
        this.lastStickNavTime = now;
      } else if (leftStickX < -0.55) {
        stickNavLeft = true;
        this.lastStickNavTime = now;
      } else if (leftStickX > 0.55) {
        stickNavRight = true;
        this.lastStickNavTime = now;
      }
    }

    const navUp = justPressed(12) || stickNavUp;
    const navDown = justPressed(13) || stickNavDown;
    const navLeft = justPressed(14) || stickNavLeft;
    const navRight = justPressed(15) || stickNavRight;
    const navConfirm = justPressed(0);
    const navBack = justPressed(1);

    this.prevButtons = buttons.map((b) => b.pressed);

    return {
      connected: true,
      id: pad.id,
      brand,
      throttle,
      brake,
      steer,
      drift,
      nitro,
      lookAxisX,
      justPressedFire,
      justPressedSwitch,
      justPressedReset,
      justPressedPause,
      navUp,
      navDown,
      navLeft,
      navRight,
      navConfirm,
      navBack,
    };
  }

  public triggerRumble(strongMagnitude = 0.6, weakMagnitude = 0.4, durationMs = 160): void {
    const pad = this.getActiveGamepad() as (Gamepad & {
      vibrationActuator?: {
        playEffect?: (
          type: string,
          params: {
            startDelay: number;
            duration: number;
            weakMagnitude: number;
            strongMagnitude: number;
          }
        ) => Promise<unknown>;
      };
    }) | null;

    if (!pad || !pad.vibrationActuator || typeof pad.vibrationActuator.playEffect !== 'function') {
      return;
    }

    try {
      pad.vibrationActuator
        .playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: Math.max(0, Math.min(1, weakMagnitude)),
          strongMagnitude: Math.max(0, Math.min(1, strongMagnitude)),
        })
        .catch(() => {});
    } catch {
      // Ignore if browser/controller doesn't support dual-rumble
    }
  }
}

export const gamepadManager = new GamepadManager();
