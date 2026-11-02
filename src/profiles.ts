import type { GameState } from './game';
import type { MapLevel } from './pocomap';

// Player profiles, settings and progress, kept in localStorage. Progress is
// keyed by the original level numbers, so it survives re-dropping the file.

export interface LevelRecord {
  moves: number;
  pushes: number;
  timeMs: number;
  solvedAt: number;
}

export interface SavedRun {
  levelNumber: number;
  state: GameState;
  elapsedMs: number;
}

export interface ProfileStats {
  moves: number;
  pushes: number;
  undos: number;
  restarts: number;
  playMs: number;
  solves: number;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  lastPlayedAt: number;
  /** Highest level index reached; every level up to it is open. */
  furthest: number;
  /** Level index to continue from. */
  current: number;
  /** Best result per solved level number. Migrated solves have zeros. */
  records: Record<number, LevelRecord>;
  /** The level in progress, to resume exactly where it was left. */
  run?: SavedRun;
  stats: ProfileStats;
}

export interface Settings {
  music: number;
  sfx: number;
  voice: number;
  motionSounds: boolean;
  showHints: boolean;
}

interface SaveData {
  version: 1;
  activeId: string;
  profiles: Profile[];
  settings: Settings;
}

const SAVE_KEY = 'pocoman.save';
const DEFAULT_SETTINGS: Settings = { music: 0.7, sfx: 0.8, voice: 1, motionSounds: true, showHints: true };

export interface SolveResult {
  record: LevelRecord;
  previous?: LevelRecord;
  bestMoves: boolean;
  bestPushes: boolean;
  bestTime: boolean;
  firstSolve: boolean;
}

function newProfile(name: string): Profile {
  const now = Date.now();
  return {
    id: Math.random().toString(36).slice(2, 10),
    name,
    createdAt: now,
    lastPlayedAt: now,
    furthest: 0,
    current: 0,
    records: {},
    stats: { moves: 0, pushes: 0, undos: 0, restarts: 0, playMs: 0, solves: 0 },
  };
}

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

export class SaveStore {
  private data: SaveData;
  private saveTimer = 0;

  constructor(private levels: MapLevel[]) {
    this.data = readJson<SaveData>(SAVE_KEY) ?? this.migrate();
    this.data.settings = { ...DEFAULT_SETTINGS, ...this.data.settings };
    if (!this.data.profiles.length) this.data.profiles.push(newProfile('Player 1'));
    if (!this.profile(this.data.activeId)) this.data.activeId = this.data.profiles[0].id;
    this.saveNow();
  }

  /** Carries over progress saved before profiles existed. */
  private migrate(): SaveData {
    const profile = newProfile('Player 1');
    const solved = readJson<number[]>('pocoman.solved') ?? [];
    for (const number of solved) profile.records[number] = { moves: 0, pushes: 0, timeMs: 0, solvedAt: Date.now() };
    profile.stats.solves = solved.length;
    const index = Number(readJson<number>('pocoman.levelIndex')) || 0;
    profile.current = Math.min(index, this.levels.length - 1);
    const settings = { ...DEFAULT_SETTINGS };
    if (localStorage.getItem('pocoman.music') === 'off') settings.music = 0;
    try {
      for (const key of ['pocoman.solved', 'pocoman.levelIndex', 'pocoman.music']) localStorage.removeItem(key);
    } catch {
      // Nothing to clean up.
    }
    return { version: 1, activeId: profile.id, profiles: [profile], settings };
  }

  /** Writes soon; frequent changes (every move) are batched. */
  save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 400);
  }

  saveNow(): void {
    clearTimeout(this.saveTimer);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked: progress just won't survive a reload.
    }
  }

  get settings(): Settings {
    return this.data.settings;
  }

  get profiles(): Profile[] {
    return this.data.profiles;
  }

  get active(): Profile {
    return this.profile(this.data.activeId) ?? this.data.profiles[0];
  }

  profile(id: string): Profile | undefined {
    return this.data.profiles.find((p) => p.id === id);
  }

  setActive(id: string): void {
    if (!this.profile(id)) return;
    this.data.activeId = id;
    this.saveNow();
  }

  create(name: string): Profile {
    const p = newProfile(name.trim() || `Player ${this.data.profiles.length + 1}`);
    this.data.profiles.push(p);
    this.data.activeId = p.id;
    this.saveNow();
    return p;
  }

  rename(id: string, name: string): void {
    const p = this.profile(id);
    if (p && name.trim()) p.name = name.trim().slice(0, 24);
    this.saveNow();
  }

  remove(id: string): void {
    this.data.profiles = this.data.profiles.filter((p) => p.id !== id);
    if (!this.data.profiles.length) this.data.profiles.push(newProfile('Player 1'));
    if (!this.profile(this.data.activeId)) this.data.activeId = this.data.profiles[0].id;
    this.saveNow();
  }

  /** Highest open level index: the stored one, or one past any solved level. */
  furthest(p = this.active): number {
    let furthest = p.furthest;
    this.levels.forEach((level, i) => {
      if (p.records[level.number]) furthest = Math.max(furthest, i + 1);
    });
    return Math.min(furthest, this.levels.length - 1);
  }

  isUnlocked(index: number, p = this.active): boolean {
    return index <= this.furthest(p);
  }

  isSolved(index: number, p = this.active): boolean {
    return !!p.records[this.levels[index]?.number];
  }

  solvedCount(p = this.active): number {
    return this.levels.filter((l) => p.records[l.number]).length;
  }

  recordSolve(index: number, moves: number, pushes: number, timeMs: number): SolveResult {
    const p = this.active;
    const number = this.levels[index].number;
    const previous = p.records[number];
    // Migrated solves have no numbers yet, so anything beats them.
    const known = previous && previous.moves > 0 ? previous : undefined;
    const record: LevelRecord = {
      moves: known ? Math.min(known.moves, moves) : moves,
      pushes: known ? Math.min(known.pushes, pushes) : pushes,
      timeMs: known && known.timeMs ? Math.min(known.timeMs, timeMs) : timeMs,
      solvedAt: Date.now(),
    };
    p.records[number] = record;
    p.furthest = Math.max(p.furthest, Math.min(index + 1, this.levels.length - 1));
    p.stats.solves++;
    p.run = undefined;
    this.saveNow();
    return {
      record,
      previous: known,
      firstSolve: !previous,
      bestMoves: !!known && moves < known.moves,
      bestPushes: !!known && pushes < known.pushes,
      bestTime: !!known && !!known.timeMs && timeMs < known.timeMs,
    };
  }
}
