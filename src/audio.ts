import type { Sample } from './pocomap';

// Web Audio rejects buffers below this rate; a couple of the original beeps
// are recorded lower, so those get stretched up.
const MIN_RATE = 8000;
// Full music volume relative to effects; the track is meant to sit underneath.
const MUSIC_LEVEL = 0.5;
const MUSIC_FADE_S = 3;
// MP3 encoders pad both ends with a little silence; looping inside that
// padding keeps the loop seamless.
const MUSIC_TRIM_S = 0.05;
// Music dips this much while PocoMan speaks.
const DUCK_LEVEL = 0.55;

export type Bus = 'music' | 'sfx' | 'voice';

/**
 * Plays the original samples from POCOMAN.MAP and the game's own sound
 * files, through separate music, effects and voice volume controls.
 */
export class SoundBank {
  private ctx: AudioContext | null = null;
  private buses: Partial<Record<Bus, GainNode>> = {};
  private volumes: Record<Bus, number> = { music: 1, sfx: 1, voice: 1 };
  private duck: GainNode | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private files = new Map<string, AudioBuffer | null>();
  private music: { url: string; buffer?: Promise<AudioBuffer | null>; started?: boolean } | null = null;

  constructor(private samples: Sample[]) {
    // Browsers only start audio after a key press or click, so keep trying
    // to unlock it on input.
    const unlock = () => {
      const ctx = this.context();
      ctx?.resume().then(() => this.startMusic());
    };
    // iOS only counts the end of a touch, not its start.
    for (const type of ['keydown', 'pointerdown', 'touchend']) window.addEventListener(type, unlock);
  }

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  setVolume(bus: Bus, volume: number): void {
    this.volumes[bus] = volume;
    const node = this.buses[bus];
    if (node && this.ctx) node.gain.setTargetAtTime(this.level(bus), this.ctx.currentTime, 0.15);
  }

  private level(bus: Bus): number {
    return this.volumes[bus] * (bus === 'music' ? MUSIC_LEVEL : 1);
  }

  private bus(bus: Bus): GainNode | null {
    const ctx = this.context();
    if (!ctx) return null;
    let node = this.buses[bus];
    if (!node) {
      node = ctx.createGain();
      node.gain.value = this.level(bus);
      node.connect(ctx.destination);
      this.buses[bus] = node;
    }
    return node;
  }

  /** Decodes sound files ahead of time so the first play isn't late. */
  preload(urls: string[]): void {
    const ctx = this.context();
    if (!ctx) return;
    for (const url of urls) {
      if (this.files.has(url)) continue;
      this.files.set(url, null);
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => this.files.set(url, buf))
        .catch(() => this.files.delete(url));
    }
  }

  /** Plays one of `urls` at random, slightly detuned so repeats don't sound mechanical. */
  playVariant(urls: string[], volume = 1, detune = 0.06, delayMs = 0): void {
    const ctx = this.ctx;
    const out = this.bus('sfx');
    if (!ctx || !out || ctx.state !== 'running') return;
    const buf = this.files.get(urls[Math.floor(Math.random() * urls.length)]);
    if (!buf) return;
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * detune;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(out);
    source.start(ctx.currentTime + delayMs / 1000);
  }

  /** Loops background music from `url`, starting as soon as audio is unlocked. */
  playMusic(url: string): void {
    this.music = { url };
    this.startMusic();
  }

  private async startMusic(): Promise<void> {
    const music = this.music;
    const ctx = this.context();
    const out = this.bus('music');
    if (!music || music.started || !ctx || !out || ctx.state !== 'running') return;
    music.started = true;
    music.buffer ??= fetch(music.url)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null);
    const buffer = await music.buffer;
    if (!buffer) return;
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, ctx.currentTime);
    fade.gain.linearRampToValueAtTime(1, ctx.currentTime + MUSIC_FADE_S);
    this.duck = ctx.createGain();
    fade.connect(this.duck).connect(out);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = MUSIC_TRIM_S;
    source.loopEnd = buffer.duration - MUSIC_TRIM_S;
    source.connect(fade);
    source.start(0, MUSIC_TRIM_S);
  }

  private context(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  private buffer(ctx: AudioContext, index: number): AudioBuffer | null {
    let buf = this.buffers.get(index);
    if (buf) return buf;
    const sample = this.samples[index];
    if (!sample?.data.length) return null;
    const stretch = Math.ceil(MIN_RATE / sample.rate);
    const data = stretch > 1 ? upsample(sample.data, stretch) : sample.data;
    buf = ctx.createBuffer(1, data.length, sample.rate * stretch);
    buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    this.buffers.set(index, buf);
    return buf;
  }

  /** Plays an original sample on the voice channel and returns its length in ms (0 if nothing played). */
  play(index: number | undefined, delayMs = 0): number {
    if (index === undefined) return 0;
    const ctx = this.context();
    const out = this.bus('voice');
    // Until a key press or click unlocks audio, skip rather than queue up
    // lines that would all play late at once.
    if (!ctx || !out || ctx.state !== 'running') return 0;
    const buf = this.buffer(ctx, index);
    if (!buf) return 0;
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(out);
    const at = ctx.currentTime + delayMs / 1000;
    source.start(at);
    if (this.duck && buf.duration > 0.3) {
      // Dip the music under speech, then bring it back.
      const g = this.duck.gain;
      g.setTargetAtTime(DUCK_LEVEL, at, 0.08);
      g.setTargetAtTime(1, at + buf.duration, 0.4);
    }
    return buf.duration * 1000;
  }
}

function upsample(data: Float32Array, factor: number): Float32Array {
  const out = new Float32Array(data.length * factor);
  for (let i = 0; i < out.length; i++) out[i] = data[Math.floor(i / factor)];
  return out;
}
