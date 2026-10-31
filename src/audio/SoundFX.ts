export class SoundFX {
  private ctx: AudioContext | null = null;
  public enabled = true;

  constructor() {
    // AudioContext will be initialized on first user click (browser autoplay policy)
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public playMenuClick(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.04);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  public playFootstep(type: 'grass' | 'stone' | 'wood' | 'sand' | 'water' | 'glass'): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    switch (type) {
      case 'grass':
        // Soft rustle
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(450, t);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
        break;

      case 'stone':
        // Crisp stone clack
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, t);
        osc.type = 'square';
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.07);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.07);
        break;

      case 'wood':
        // Hollow wood knock
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(320, t);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.1);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        break;

      case 'sand':
        // Crunchy sand friction
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(600, t);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.09);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
        break;

      case 'water':
        // Liquid splash
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(700, t);
        filter.frequency.exponentialRampToValueAtTime(300, t + 0.15);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(350, t);
        osc.frequency.exponentialRampToValueAtTime(150, t + 0.15);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        break;

      default:
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
        break;
    }

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  public playBlockPlace(type: 'grass' | 'stone' | 'wood' | 'sand' | 'water' | 'glass'): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);

    const baseFreq = type === 'wood' ? 180 : type === 'sand' ? 130 : type === 'grass' ? 160 : 240;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.25, t + 0.12);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.13);
  }

  public playBlockBreak(type: 'grass' | 'stone' | 'wood' | 'sand' | 'water' | 'glass'): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    // Crunch noise + low pop
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const baseFreq = type === 'wood' ? 140 : type === 'sand' ? 95 : type === 'grass' ? 120 : 180;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.25, t + 0.15);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  public playWaterSplash(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.25);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.25);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.26);
  }
}
