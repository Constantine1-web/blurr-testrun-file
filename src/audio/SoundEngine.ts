import { PowerUpType } from '../types/game';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private skidNode: AudioBufferSourceNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;

  private musicInterval: number | null = null;
  private musicStep = 0;

  private volume = 0.75;
  private musicVolume = 0.45;
  private muted = false;
  private isRacingActive = false;
  private lastWarningBeepTime = 0;

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.applyVolumes();
      this.setupEngineNodes();
      this.startMusicLoop();
    } catch {
      // AudioContext blocked or unsupported
    }
  }

  private setupEngineNodes(): void {
    if (!this.ctx || !this.sfxGain) return;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 180;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 55;

    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.value = 110;

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);

    this.engineOsc1.start();
    this.engineOsc2.start();

    // White noise buffer for tire screech
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.skidNode = this.ctx.createBufferSource();
    this.skidNode.buffer = noiseBuffer;
    this.skidNode.loop = true;

    this.skidFilter = this.ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1150;
    this.skidFilter.Q.value = 3.5;

    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0;

    this.skidNode.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.sfxGain);
    this.skidNode.start();
  }

  public setSettings(volume: number, musicVolume: number, muted: boolean): void {
    this.volume = volume;
    this.musicVolume = musicVolume;
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.masterGain || !this.sfxGain || !this.musicGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.volume, now, 0.03);
    this.musicGain.gain.setTargetAtTime(this.musicVolume * 0.35, now, 0.05);
  }

  public setRacingActive(active: boolean): void {
    this.isRacingActive = active;
    if (!active && this.ctx && this.engineGain && this.skidGain) {
      const now = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      this.skidGain.gain.setTargetAtTime(0, now, 0.08);
    }
  }

  public updateDrivingAudio(
    speedRatio: number,
    isDrifting: boolean,
    isBoosting: boolean,
    threatUrgency: number
  ): void {
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter || !this.engineGain || !this.skidGain) {
      return;
    }

    if (!this.isRacingActive) {
      return;
    }

    const now = this.ctx.currentTime;
    const clampedRatio = Math.max(0, Math.min(1.35, speedRatio));
    // Simulate 5-gear arcade transmission teeth + boost over-rev
    const gearMod = (clampedRatio * 4.2) % 1;
    const baseFreq = 48 + clampedRatio * 95 + gearMod * 26 + (isBoosting ? 35 : 0);

    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(
      220 + clampedRatio * 900 + (isBoosting ? 650 : 0),
      now,
      0.05
    );
    this.engineGain.gain.setTargetAtTime(0.11 + clampedRatio * 0.09 + (isBoosting ? 0.06 : 0), now, 0.05);

    const targetSkid = isDrifting && clampedRatio > 0.2 ? Math.min(0.16, clampedRatio * 0.14) : 0;
    this.skidGain.gain.setTargetAtTime(targetSkid, now, 0.06);

    // Incoming homing missile lock warning beep
    if (threatUrgency > 0) {
      const intervalMs = Math.max(120, 380 - threatUrgency * 240);
      const perfNow = performance.now();
      if (perfNow - this.lastWarningBeepTime > intervalMs) {
        this.lastWarningBeepTime = perfNow;
        this.playWarningBeep();
      }
    }
  }

  private playWarningBeep(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.setValueAtTime(1320, now + 0.04);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playUIClick(high = false): void {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(high ? 720 : 520, now);
    osc.frequency.exponentialRampToValueAtTime(high ? 1180 : 320, now + 0.06);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playCountdownBeep(isGo: boolean): void {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    if (isGo) {
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.32);
    }
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.42 : 0.18));
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + (isGo ? 0.45 : 0.2));
  }

  public playPickupCollect(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 880, 1174.66];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);
      gain.gain.setValueAtTime(0.14, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.14);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.15);
    });
  }

  public playPowerUpUse(type: PowerUpType): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    switch (type) {
      case 'NITRO': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(540, now + 0.45);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.52);
        break;
      }
      case 'BOLTS': {
        for (let i = 0; i < 3; i++) {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const t = now + i * 0.06;
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(1100, t);
          osc.frequency.exponentialRampToValueAtTime(220, t + 0.11);
          gain.gain.setValueAtTime(0.16, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(t);
          osc.stop(t + 0.13);
        }
        break;
      }
      case 'MISSILE': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.25);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.45);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.48);
        break;
      }
      case 'SHOCKWAVE': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.55);
        gain.gain.setValueAtTime(0.32, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.6);
        break;
      }
      case 'MINE': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(640, now);
        osc.frequency.setValueAtTime(420, now + 0.07);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }
      case 'SHIELD': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }
      case 'REPAIR': {
        const notes = [440, 554.37, 659.25, 880];
        notes.forEach((f, idx) => {
          if (!this.ctx || !this.sfxGain) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const t = now + idx * 0.055;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, t);
          gain.gain.setValueAtTime(0.16, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(t);
          osc.stop(t + 0.2);
        });
        break;
      }
    }
  }

  public playCollision(intensity = 0.6): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const clamped = Math.max(0.15, Math.min(1, intensity));

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140 * clamped + 40, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.18);
    gain.gain.setValueAtTime(0.26 * clamped, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playExplosion(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.45);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  public playFinishFanfare(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + i * 0.08;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.62);
    });
  }

  private startMusicLoop(): void {
    if (this.musicInterval !== null) return;
    // 132 BPM darksynth bass & arpeggio pulse (step every ~113ms)
    const bassLine = [55, 55, 110, 55, 65.41, 65.41, 98, 73.42];
    const arpLine = [220, 261.63, 329.63, 440, 329.63, 261.63, 392, 329.63];

    this.musicInterval = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || this.muted || this.musicVolume <= 0.01) return;
      if (this.ctx.state !== 'running') return;

      const now = this.ctx.currentTime;
      const step = this.musicStep % 8;
      this.musicStep++;

      // Bass synth
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      const bassFilter = this.ctx.createBiquadFilter();
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(bassLine[step], now);
      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(this.isRacingActive ? 460 : 280, now);

      bassGain.gain.setValueAtTime(0.18, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(this.musicGain);
      bassOsc.start(now);
      bassOsc.stop(now + 0.115);

      // Subtle high cyber arpeggio during races
      if (this.isRacingActive && step % 2 === 0) {
        const arpOsc = this.ctx.createOscillator();
        const arpGain = this.ctx.createGain();
        arpOsc.type = 'triangle';
        arpOsc.frequency.setValueAtTime(arpLine[step], now);
        arpGain.gain.setValueAtTime(0.07, now);
        arpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        arpOsc.connect(arpGain);
        arpGain.connect(this.musicGain);
        arpOsc.start(now);
        arpOsc.stop(now + 0.1);
      }
    }, 115);
  }
}

export const soundEngine = new SoundEngine();
