import { Game } from './game';
import { formatTime, type LevelComplete } from './play';
import type { Effects, MapLevel } from './pocomap';
import type { Profile, SaveStore } from './profiles';
import { button, el, escapeHtml, pickTextFile, saveTextFile, slider, toggle, View, type Ui } from './ui';

// All the menu screens. They only describe what to show and what each
// choice does; the game itself is driven through MenuContext.

export interface MenuContext {
  ui: Ui;
  store: SaveStore;
  levels: MapLevel[];
  effects: Effects;
  say: (sample: number | undefined) => void;
  /** Starts a level, resuming its saved state if there is one. */
  play: (index: number, resume: boolean) => void;
  resume: () => void;
  restartLevel: () => void;
  quitToTitle: () => void;
  applySettings: () => void;
  cameraPanel: { get: () => boolean; set: (v: boolean) => void };
  loadNewMap: () => void;
  /** Data URL of an object's icon, by original tile id. */
  icon: (tile: number) => string;
}

/** Opened from the Home Screen (or installed), so already fullscreen. */
const runningAsApp = () =>
  matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const AVATAR_COLORS =['#f7c531', '#e0462d', '#3fbf5a', '#3f7fe0', '#b07de0', '#f0902a', '#4cc9d8'];
const avatarColor = (p: Profile) => AVATAR_COLORS[[...p.id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

/** A tiny top-down map of a level for the level select. */
function miniMap(rows: string[]): HTMLCanvasElement {
  const canvas = el('canvas');
  canvas.width = 192;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const game = new Game(rows);
  const size = Math.floor(Math.min(canvas.width / game.width, canvas.height / game.height));
  const ox = Math.floor((canvas.width - game.width * size) / 2);
  const oy = Math.floor((canvas.height - game.height * size) / 2);
  const dot = (x: number, y: number, r: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(ox + (x + 0.5) * size, oy + (y + 0.5) * size, size * r, 0, Math.PI * 2);
    g.fill();
  };
  for (let y = 0; y < game.height; y++) {
    for (let x = 0; x < game.width; x++) {
      const color = game.walls[y][x] ? '#7d82a0' : game.isGoal(x, y) ? '#c89a5a' : game.floor[y][x] ? '#e9d3a0' : '';
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(ox + x * size, oy + y * size, size, size);
    }
  }
  for (const gem of game.gems) dot(gem.x, gem.y, 0.32, '#3a6fd8');
  dot(game.player.x, game.player.y, 0.38, '#f7c531');
  return canvas;
}

export function createMenus(ctx: MenuContext) {
  const { ui, store, levels } = ctx;

  function pressAnyKey(onStart: () => void) {
    const v = new View('title');
    const touch = matchMedia('(pointer: coarse)').matches;
    const prompt = el('div', 'press-any', touch ? 'Tap to begin' : 'Press any key');
    v.root.append(
      el('div', 'logo', 'PocoMan<small>REMASTERED</small>'),
      prompt,
      el('div', 'footer-note', 'Original game © 1996 Sleepless Software'),
    );
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      window.removeEventListener('keydown', go);
      onStart();
    };
    v.add(prompt, { select: go });
    v.root.addEventListener('click', go);
    window.addEventListener('keydown', go);
    ui.show(v);
  }

  function mainMenu(focus = 0) {
    const p = store.active;
    const v = new View('title-menu');
    v.root.append(el('div', 'logo', 'PocoMan'));
    const menu = el('div', 'menu');
    v.root.append(menu);
    const solved = store.solvedCount();
    const started = p.stats.moves > 0 || solved > 0;
    const current = levels[p.current];
    const runNote = p.run?.levelNumber === current?.number && p.run.state.moves > 0 ? ' · in progress' : '';
    menu.append(
      button(v, started ? 'Continue' : 'Start', () => ctx.play(p.current, true), `Level ${current.number}${runNote}`),
      button(v, 'Level Select', () => levelSelect('menu'), `${solved} of ${levels.length} solved`),
      button(v, 'Profiles', () => profiles(), escapeHtml(p.name)),
      button(v, 'Statistics', () => stats()),
      button(v, 'Options', () => options(() => mainMenu(4))),
      button(v, 'Credits', () => credits()),
    );
    menu.firstElementChild?.classList.add('primary');
    ui.show(v, focus);
  }

  function levelSelect(from: 'menu' | 'pause') {
    const p = store.active;
    const v = new View('levels dim');
    const panel = el('div', 'panel wide');
    const solved = store.solvedCount();
    const head = el('div', 'head', `<h2>Select Level</h2><h3>${escapeHtml(p.name)} · ${solved} / ${levels.length}</h3>`);
    const progress = el('div', 'progress', `<span style="width:${(solved / levels.length) * 100}%"></span>`);
    const grid = el('div', 'level-grid');
    const scroll = el('div', 'scroll');
    scroll.append(grid);
    const details = el('div', 'level-details');
    panel.append(head, progress, scroll, details,
      el('div', 'hint-bar keys', '<b>Enter</b> / <b>A</b> play · <b>Esc</b> / <b>B</b> back'));
    v.root.append(panel);

    levels.forEach((level, i) => {
      const unlocked = store.isUnlocked(i);
      const record = p.records[level.number];
      const tile = el('div', `level${record ? ' solved' : ''}${unlocked ? '' : ' locked'}${i === p.current ? ' current' : ''}`);
      tile.append(miniMap(level.rows));
      const icon = el('img', 'icon');
      icon.src = ctx.icon(level.objectTile);
      tile.append(icon, el('span', 'num', String(level.number)), el('span', 'badge', record ? '✓' : unlocked ? '' : '🔒'));
      grid.append(tile);
      // A locked level gets the original's refusal.
      v.add(tile, { select: unlocked ? () => ctx.play(i, true) : () => ctx.say(ctx.effects.mustSolve) });
    });

    v.onFocus = (item) => {
      const i = v.items.indexOf(item);
      const level = levels[i];
      const record = p.records[level.number];
      const inProgress = p.run?.levelNumber === level.number && p.run.state.moves > 0;
      let meta: string;
      if (!store.isUnlocked(i)) meta = `Locked · solve level ${levels[i - 1].number} first`;
      else if (record?.moves) meta = `Solved · best ${record.moves} moves, ${record.pushes} pushes, ${formatTime(record.timeMs)}`;
      else if (record) meta = 'Solved';
      else meta = inProgress ? `In progress · ${p.run!.state.moves} moves so far` : 'Not solved yet';
      const goals = level.rows.join('').match(/[.+*]/g)?.length ?? 0;
      details.innerHTML = `<img src="${ctx.icon(level.objectTile)}"><div><div class="title">Level ${level.number} <span class="meta">· ${goals} goals</span></div><div class="meta">${meta}</div></div>`;
    };
    v.onBack = from === 'menu' ? () => mainMenu(1) : () => pause();
    ui.show(v, Math.min(p.current, store.furthest()));
  }

  function profiles(focus = 0) {
    const v = new View('profiles dim');
    const panel = el('div', 'panel');
    panel.append(el('div', 'head', '<h2>Profiles</h2><h3>Each has its own progress</h3>'));
    const list = el('div', 'menu');
    list.style.width = '100%';
    for (const p of store.profiles) {
      const isActive = p.id === store.active.id;
      const row = el('div', 'btn profile');
      row.innerHTML = `<span class="avatar" style="background:${avatarColor(p)}">${escapeHtml(p.name.slice(0, 1).toUpperCase())}</span>
        <span class="who"><span class="label">${escapeHtml(p.name)}</span><span class="sub">${store.solvedCount(p)} / ${levels.length} solved · ${formatTime(p.stats.playMs)} played</span></span>
        ${isActive ? '<span class="active-mark">PLAYING</span>' : ''}`;
      list.append(v.add(row, { select: () => profileActions(p) }));
    }
    list.append(button(v, '+ New profile', () => nameEntry('New profile', '', (name) => {
      store.create(name);
      mainMenu(2);
    }, () => profiles(store.profiles.length))));
    const importAt = v.items.length;
    list.append(button(v, 'Import profile', async () => {
      const text = await pickTextFile();
      if (text === null) return;
      try {
        profileActions(store.importProfile(text));
      } catch (e) {
        message('Couldn’t import', e instanceof Error ? e.message : String(e), () => profiles(importAt));
      }
    }, 'From a downloaded profile file'));
    panel.append(list);
    v.root.append(panel);
    v.onBack = () => mainMenu(2);
    ui.show(v, focus);
  }

  function profileActions(p: Profile) {
    const v = new View('profile-actions dim');
    const panel = el('div', 'panel');
    panel.append(el('div', 'head', `<h2>${escapeHtml(p.name)}</h2><h3>${store.solvedCount(p)} / ${levels.length} solved</h3>`));
    const menu = el('div', 'menu');
    menu.style.width = '100%';
    const index = store.profiles.indexOf(p);
    menu.append(
      button(v, store.active.id === p.id ? 'Keep playing' : `Play as ${escapeHtml(p.name)}`, () => {
        store.setActive(p.id);
        mainMenu(0);
      }),
      button(v, 'Rename', () => nameEntry('Rename profile', p.name, (name) => {
        store.rename(p.id, name);
        profiles(index);
      }, () => profileActions(p))),
      button(v, 'Download', () => {
        const name = p.name.replace(/[^\p{L}\p{N} ._-]+/gu, '').trim() || 'Profile';
        saveTextFile(`PocoMan - ${name}.json`, store.exportProfile(p));
      }, 'Save to a file, to import on another device'),
      button(v, 'Delete', () => confirmDelete(p), store.profiles.length > 1 ? '' : 'Resets this profile'),
      button(v, 'Back', () => profiles(index)),
    );
    panel.append(menu);
    v.root.append(panel);
    v.onBack = () => profiles(index);
    ui.show(v);
  }

  function message(title: string, text: string, back: () => void) {
    const v = new View('message dim');
    const panel = el('div', 'panel');
    panel.append(el('div', 'head', `<h2>${escapeHtml(title)}</h2>`), el('p', '', escapeHtml(text)));
    const ok = button(v, 'OK', back);
    ok.style.alignItems = 'center';
    panel.append(ok);
    v.root.append(panel);
    v.onBack = back;
    ui.show(v);
  }

  function confirmDelete(p: Profile) {
    const v = new View('confirm dim');
    const panel = el('div', 'panel');
    panel.append(el('div', 'head', `<h2>Delete ${escapeHtml(p.name)}?</h2>`),
      el('p', '', `All progress, best results and statistics for this profile will be lost.`));
    const row = el('div', 'row');
    row.append(button(v, 'Cancel', () => profileActions(p)), button(v, 'Delete', () => {
      store.remove(p.id);
      profiles();
    }));
    panel.append(row);
    v.root.append(panel);
    v.onBack = () => profileActions(p);
    ui.show(v);
  }

  /** A text field for names; controller players can accept the suggestion. */
  function nameEntry(title: string, initial: string, done: (name: string) => void, cancel: () => void) {
    const v = new View('name dim');
    const panel = el('div', 'panel');
    panel.append(el('div', 'head', `<h2>${title}</h2>`));
    const field = el('input', 'name-input');
    field.type = 'text';
    field.maxLength = 24;
    field.value = initial || `Player ${store.profiles.length + 1}`;
    field.placeholder = 'Name';
    const submit = () => {
      if (field.value.trim()) done(field.value.trim());
    };
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape' || e.key === 'ArrowDown') {
        e.preventDefault();
        field.blur();
        v.focus(1);
      }
    });
    panel.append(v.add(field, { select: () => field.focus() }));
    v.onFocus = (item) => {
      if (item.el === field) requestAnimationFrame(() => field.focus());
      else field.blur();
    };
    const row = el('div', 'row');
    row.append(button(v, 'OK', submit), button(v, 'Cancel', cancel));
    panel.append(row);
    v.root.append(panel);
    v.onBack = cancel;
    ui.show(v);
  }

  function stats() {
    const p = store.active;
    const v = new View('stats dim');
    const panel = el('div', 'panel wide');
    const solved = store.solvedCount();
    panel.append(el('div', 'head', `<h2>Statistics</h2><h3>${escapeHtml(p.name)}</h3>`));
    const card = (k: string, val: string) => `<div class="card"><div class="k">${k}</div><div class="v">${val}</div></div>`;
    const cards = el('div', 'cards',
      card('Levels solved', `${solved} / ${levels.length}`) +
      card('Completion', `${Math.round((solved / levels.length) * 100)}%`) +
      card('Time played', formatTime(p.stats.playMs)) +
      card('Moves', p.stats.moves.toLocaleString()) +
      card('Pushes', p.stats.pushes.toLocaleString()) +
      card('Undos', p.stats.undos.toLocaleString()) +
      card('Restarts', p.stats.restarts.toLocaleString()));
    const scroll = el('div', 'scroll');
    const records = el('div', 'records');
    records.append(el('div', 'record head-row', '<span></span><span>Level</span><span class="c">Moves</span><span class="c">Pushes</span><span class="c">Time</span>'));
    levels.forEach((level) => {
      const r = p.records[level.number];
      if (!r) return;
      const row = el('div', 'btn record');
      const n = (x: number) => (x ? `<b>${x}</b>` : '—');
      row.innerHTML = `<img src="${ctx.icon(level.objectTile)}"><span class="n">Level ${level.number}</span>
        <span class="c">${n(r.moves)}</span><span class="c">${n(r.pushes)}</span><span class="c">${r.timeMs ? `<b>${formatTime(r.timeMs)}</b>` : '—'}</span>`;
      records.append(v.add(row));
    });
    if (records.children.length === 1) records.append(el('div', 'hint-bar', 'Solve a level to see your best results here.'));
    scroll.append(cards, el('h3', '', 'Best results'), records);
    scroll.style.display = 'flex';
    scroll.style.flexDirection = 'column';
    scroll.style.gap = '12px';
    panel.append(scroll);
    const back = button(v, 'Back', () => mainMenu(3));
    back.style.alignItems = 'center';
    panel.append(back);
    v.root.append(panel);
    v.onBack = () => mainMenu(3);
    ui.show(v, v.items.length - 1);
  }

  function options(back: () => void, focus = 0) {
    const s = store.settings;
    const v = new View('options dim');
    const panel = el('div', 'panel');
    panel.append(el('div', 'head', '<h2>Options</h2>'));
    const menu = el('div', 'menu');
    menu.style.width = '100%';
    const set = <K extends keyof typeof s>(key: K) => (value: (typeof s)[K]) => {
      s[key] = value;
      ctx.applySettings();
      store.saveNow();
    };
    menu.append(
      slider(v, 'Music', () => s.music, set('music')),
      slider(v, 'Sound effects', () => s.sfx, set('sfx')),
      slider(v, 'PocoMan’s voice', () => s.voice, set('voice')),
      toggle(v, 'Footstep sounds', () => s.motionSounds, set('motionSounds')),
      toggle(v, 'Show controls', () => s.showHints, set('showHints')),
    );
    // Already fullscreen when opened from the Home Screen. iPhones can't put
    // a page fullscreen at all, so there it explains the Home Screen instead.
    const fullscreenAt = v.items.length;
    if (!runningAsApp()) {
      menu.append(document.fullscreenEnabled
        ? toggle(v, 'Fullscreen', () => !!document.fullscreenElement, (on) => {
          if (on) document.documentElement.requestFullscreen().catch(() => undefined);
          else document.exitFullscreen().catch(() => undefined);
        })
        : button(v, 'Fullscreen', () => homeScreenHelp(() => options(back, fullscreenAt)), 'Add PocoMan to your Home Screen'));
    }
    menu.append(
      toggle(v, 'Camera tuning panel', ctx.cameraPanel.get, ctx.cameraPanel.set),
      button(v, 'Load a different POCOMAN.MAP', ctx.loadNewMap),
      button(v, 'Back', back),
    );
    panel.append(menu);
    v.root.append(panel);
    v.onBack = back;
    ui.show(v, focus);
  }

  function homeScreenHelp(back: () => void) {
    const v = new View('credits dim');
    const panel = el('div', 'panel credits');
    panel.append(el('div', 'head', '<h2>Play fullscreen</h2>'),
      el('p', '', 'Your browser can’t put a web page fullscreen, but PocoMan can live on your Home Screen and open fullscreen from there, like an app:'),
      el('p', '', '1. Tap <b>Share</b> in Safari’s toolbar.<br>2. Choose <b>Add to Home Screen</b>.<br>3. Open <b>PocoMan</b> from your Home Screen.'),
      el('p', 'dim', 'The Home Screen app keeps its own saves, so it asks for POCOMAN.MAP once more the first time.'));
    const ok = button(v, 'Back', back);
    ok.style.alignItems = 'center';
    panel.append(ok);
    v.root.append(panel);
    v.onBack = back;
    ui.show(v);
  }

  function credits() {
    const v = new View('credits dim');
    const panel = el('div', 'panel credits');
    panel.append(el('div', 'head', '<h2>Credits</h2>'),
      el('p', '', '<b>PocoMan</b> © 1996 Sleepless Software. Original game by Ron Hitchens, artwork by Joe Hitchens, Windows 95/NT port by Bryan Ford.'),
      el('p', '', 'Levels, voice lines and sounds are read from your own copy of <b>POCOMAN.MAP</b>; none of it is part of this remake.'),
      el('p', '', '<b>PocoMan Remastered</b>: a fan remake built with PixiJS. Music and new sound effects generated with ElevenLabs via fal.ai.'),
      el('p', 'dim', 'Thanks for playing!'));
    const back = button(v, 'Back', () => mainMenu(5));
    back.style.alignItems = 'center';
    panel.append(back);
    v.root.append(panel);
    v.onBack = () => mainMenu(5);
    ui.show(v);
  }

  function pause() {
    const level = levels[store.active.current];
    const v = new View('pause dim');
    const panel = el('div', 'panel');
    panel.style.width = 'min(400px, 94vw)';
    panel.append(el('div', 'head', `<h2>Paused</h2><h3>Level ${level.number}</h3>`));
    const menu = el('div', 'menu');
    menu.style.width = '100%';
    menu.append(
      button(v, 'Resume', ctx.resume),
      button(v, 'Restart level', ctx.restartLevel),
      button(v, 'Level select', () => levelSelect('pause')),
      button(v, 'Options', () => options(() => pause())),
      button(v, 'Main menu', ctx.quitToTitle),
    );
    panel.append(menu);
    v.root.append(panel);
    v.onBack = ctx.resume;
    ui.show(v);
  }

  function complete(r: LevelComplete) {
    const level = levels[r.index];
    const last = r.index === levels.length - 1;
    const v = new View('complete');
    const panel = el('div', 'panel');
    const prev = r.solve.previous;
    const badge = (isBest: boolean) => (isBest ? '<div class="new-best">NEW BEST</div>' : '');
    const best = (val: string | undefined) => (val ? `<div class="best">best ${val}</div>` : '');
    panel.append(
      el('div', 'complete-title', `Level ${level.number} solved!`),
      el('div', 'transform', `<img src="${ctx.icon(level.objectTile)}"><span class="arrow">→</span><img src="${ctx.icon(level.goalTile)}">`),
      el('div', 'results',
        `<div class="card"><div class="k">Moves</div><div class="v">${r.moves}</div>${badge(r.solve.bestMoves)}${best(prev ? String(prev.moves) : undefined)}</div>` +
        `<div class="card"><div class="k">Pushes</div><div class="v">${r.pushes}</div>${badge(r.solve.bestPushes)}${best(prev ? String(prev.pushes) : undefined)}</div>` +
        `<div class="card"><div class="k">Time</div><div class="v">${formatTime(r.timeMs)}</div>${badge(r.solve.bestTime)}${best(prev?.timeMs ? formatTime(prev.timeMs) : undefined)}</div>`),
    );
    if (r.solve.firstSolve) panel.append(el('div', 'hint-bar', last ? 'That was the final level!' : `Level ${levels[r.index + 1].number} unlocked`));
    const menu = el('div', 'menu');
    menu.style.width = '100%';
    if (last) menu.append(button(v, 'Celebrate', () => victory()));
    else menu.append(button(v, 'Next level', () => ctx.play(r.index + 1, true)));
    menu.firstElementChild?.classList.add('primary');
    menu.append(
      button(v, 'Play again', () => ctx.play(r.index, false)),
      button(v, 'Level select', () => levelSelect('menu')),
      button(v, 'Main menu', ctx.quitToTitle),
    );
    panel.append(menu);
    v.root.append(panel);
    v.onBack = () => levelSelect('menu');
    ui.show(v);
  }

  function victory() {
    const p = store.active;
    const v = new View('victory dim');
    const panel = el('div', 'panel');
    panel.append(
      el('div', 'complete-title', 'Victory for PocoMan!'),
      el('p', '', `Every treasure is home. ${escapeHtml(p.name)} has solved ${store.solvedCount()} of ${levels.length} levels.`),
      el('div', 'results',
        `<div class="card"><div class="k">Moves</div><div class="v">${p.stats.moves.toLocaleString()}</div></div>` +
        `<div class="card"><div class="k">Pushes</div><div class="v">${p.stats.pushes.toLocaleString()}</div></div>` +
        `<div class="card"><div class="k">Time</div><div class="v">${formatTime(p.stats.playMs)}</div></div>`),
    );
    const back = button(v, 'Main menu', ctx.quitToTitle);
    back.style.alignItems = 'center';
    panel.append(back);
    v.root.append(panel);
    v.onBack = ctx.quitToTitle;
    ui.show(v);
  }

  return { pressAnyKey, mainMenu, levelSelect, pause, complete, victory, options };
}
