// Reader for the original PocoMan level file (POCOMAN.MAP).
//
// The file is an IFF-style container: "FORM" <u32 length> "SOKO", then
// chunks of <4-char tag> <u32 length> <data>, with little-endian lengths and
// no padding. Levels live in the FLDS chunk as fixed-size records:
//   - a 60-byte header of u16s: [0] level number, [1] rows, [2] columns,
//     [3] loose gems, [4] gems already on goals, ..., [28] the tile for
//     this level's pushable object, [29] the tile it turns into on a goal.
//     Bytes 44, 45 and 46 are sound items (0xFF for none) played when the
//     level starts, when an object first lands on a goal, and when it's won.
//   - rows × columns cells of two u16s: a tile (graphic) id and a cell type.
// Records numbered 0xFFxx are special screens rather than levels.
//
// SINF holds the global sound slots at bytes 8-15, as sound items. Watching
// the original game run showed what each slot is for (see EFFECT_SLOTS).
// Sound items (SITM) are two bytes each: flags, then a sample index. Samples
// (SAMP) start with a u16 count and u32 offsets; each sample has a header of
// u16 sample rate, u16 (always 0x40), u16 bits (8 or 16, signed), then PCM.

export interface MapLevel {
  number: number;
  /** Standard Sokoban notation, trimmed to the playable area. */
  rows: string[];
  /** Original tile ids of the pushable object, off and on a goal. */
  objectTile: number;
  goalTile: number;
  /** Sample indexes for this level's sound events. */
  sounds: { start?: number; reveal?: number; complete?: number };
}

export interface Sample {
  rate: number;
  /** Mono PCM in -1..1. */
  data: Float32Array;
}

/** Sample indexes for game-wide events. */
export interface Effects {
  step?: number;
  push?: number;
  /** A push that leaves an object stuck in a corner ("Oops"). */
  cornered?: number;
  /** Undoing a push ("Bad move"). */
  undo?: number;
  /** A key press on the title screen. */
  anyKey?: number;
  /** Trying to skip an unsolved level ("No way, Jose"). */
  mustSolve?: number;
  /** Going back from the first level ("Nowhere to go but up"). */
  firstLevel?: number;
  /** The title screen appears ("I am PocoMan"). */
  intro?: number;
  /** Play begins ("Okay, PocoMan is ready"). */
  ready?: number;
  /** The crowd cheering on the final screen. */
  cheer?: number;
}

export interface PocomanData {
  levels: MapLevel[];
  samples: Sample[];
  effects: Effects;
}

// SINF slot order; slot 4 is unused in the original file.
const EFFECT_SLOTS: (keyof Effects | null)[] = ['step', 'push', 'cornered', 'undo', null, 'anyKey', 'mustSolve', 'firstLevel'];

const HEADER_BYTES = 60;
const CELL_BYTES = 4;

// Cell types; anything else (0xFFFF) is wall or scenery.
const CELL_CHARS: Record<number, string> = {
  0x200: '@', // player start
  0x202: ' ', // floor
  0x204: '$', // gem
  0x303: '.', // goal
  0x305: '*', // gem on goal
};

function tag(view: DataView, at: number): string {
  return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + at, 4));
}

export function parsePocomanMap(buffer: ArrayBuffer): PocomanData {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12 || tag(view, 0) !== 'FORM' || tag(view, 8) !== 'SOKO') {
    throw new Error("This doesn't look like POCOMAN.MAP (no FORM/SOKO header).");
  }

  const chunks = new Map<string, DataView>();
  for (let at = 12; at + 8 <= buffer.byteLength; ) {
    const length = view.getUint32(at + 4, true);
    chunks.set(tag(view, at), new DataView(buffer, at + 8, Math.min(length, buffer.byteLength - at - 8)));
    at += 8 + length;
  }
  const flds = chunks.get('FLDS');
  if (!flds) throw new Error('No levels (FLDS chunk) found in this file.');

  const items = chunks.get('SITM');
  const soundAt = (byte: number): number | undefined => {
    if (!items || byte === 0xff || byte * 2 + 1 >= items.byteLength) return undefined;
    return items.getUint8(byte * 2 + 1);
  };

  const levels: MapLevel[] = [];
  const effects: Effects = {};
  const sinf = chunks.get('SINF');
  EFFECT_SLOTS.forEach((key, i) => {
    if (key && sinf && 8 + i < sinf.byteLength) effects[key] = soundAt(sinf.getUint8(8 + i));
  });
  for (let at = 0; at + HEADER_BYTES <= flds.byteLength; ) {
    const number = flds.getUint16(at, true);
    const rows = flds.getUint16(at + 2, true);
    const cols = flds.getUint16(at + 4, true);
    const size = HEADER_BYTES + rows * cols * CELL_BYTES;
    if (!rows || !cols || at + size > flds.byteLength) break;
    // The first special screen is the title: it speaks when shown and when
    // play begins.
    if (number === 0xffff) {
      effects.intro = soundAt(flds.getUint8(at + 44));
      effects.ready = soundAt(flds.getUint8(at + 46));
    }
    // The last special screen is the final victory, with a cheering crowd.
    if (number === 0xfffb) effects.cheer = soundAt(flds.getUint8(at + 45));
    if (number < 0xff00) {
      levels.push({
        number,
        rows: readGrid(flds, at + HEADER_BYTES, rows, cols),
        objectTile: flds.getUint16(at + 56, true),
        goalTile: flds.getUint16(at + 58, true),
        sounds: {
          start: soundAt(flds.getUint8(at + 44)),
          reveal: soundAt(flds.getUint8(at + 45)),
          complete: soundAt(flds.getUint8(at + 46)),
        },
      });
    }
    at += size;
  }
  if (!levels.length) throw new Error('The file contains no playable levels.');
  levels.sort((a, b) => a.number - b.number);
  const samp = chunks.get('SAMP');
  return { levels, samples: samp ? readSamples(samp) : [], effects };
}

function readSamples(view: DataView): Sample[] {
  const count = view.getUint16(0, true);
  const offsets = Array.from({ length: count }, (_, i) => view.getUint32(2 + i * 4, true));
  offsets.push(view.byteLength);
  const samples: Sample[] = [];
  for (let i = 0; i < count; i++) {
    const start = offsets[i];
    const end = Math.min(offsets[i + 1], view.byteLength);
    const rate = view.getUint16(start, true);
    const bits = view.getUint16(start + 4, true);
    const bytes = end - start - 6;
    const length = bits === 16 ? bytes >> 1 : bytes;
    const data = new Float32Array(Math.max(0, length));
    for (let j = 0; j < length; j++) {
      data[j] = bits === 16
        ? view.getInt16(start + 6 + j * 2, true) / 32768
        : view.getInt8(start + 6 + j) / 128;
    }
    samples.push({ rate, data });
  }
  return samples;
}

function readGrid(view: DataView, at: number, rows: number, cols: number): string[] {
  const grid: (string | null)[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < cols; x++) {
      const type = view.getUint16(at + (y * cols + x) * CELL_BYTES + 2, true);
      row.push(CELL_CHARS[type] ?? null);
    }
    grid.push(row);
  }

  // Keep only the walls that touch the playable area; the rest of the map is
  // scenery around the level.
  const walkable = (x: number, y: number) => grid[y]?.[x] != null;
  const touchesFloor = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (walkable(x + dx, y + dy)) return true;
    return false;
  };
  const out = grid.map((row, y) =>
    row.map((c, x) => c ?? (touchesFloor(x, y) ? '#' : ' ')).join(''),
  );

  const used = out.map((r) => r.trimEnd()).filter((r) => r.trim());
  const left = Math.min(...used.map((r) => r.length - r.trimStart().length));
  const first = out.findIndex((r) => r.trim());
  const last = out.length - 1 - [...out].reverse().findIndex((r) => r.trim());
  return out.slice(first, last + 1).map((r) => r.slice(left).trimEnd());
}
