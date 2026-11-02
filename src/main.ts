import { Application, Graphics, Rectangle } from 'pixi.js';
import { SoundBank } from './audio';
import { Input } from './input';
import { createMenus } from './menus';
import { showObjectGallery } from './objectGallery';
import { designContext, designForTile } from './objects';
import { createPlayScreen, PLAY_SOUNDS, type PlayScreen } from './play';
import { SaveStore } from './profiles';
import { SpaceBackdrop } from './space';
import { loadMapData, showDropScreen } from './startScreen';
import { TitleScene } from './titleScene';
import { createTuningPanel } from './tuning';
import { Ui } from './ui';

const VICTORY_SOUND = 'assets/sfx/victory.mp3';

/**
 * - `title`: the title screen and its menus, PocoMan floating behind them.
 * - `playing`: a level, with the game taking input.
 * - `menu`: a menu over a level (paused, results); the board stays behind.
 */
type Mode = 'title' | 'playing' | 'menu';

async function main() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x05060f,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);
  await Promise.all([
    document.fonts.load('600 20px Fredoka'),
    document.fonts.load('700 20px Fredoka'),
    document.fonts.load('600 16px Nunito'),
  ]).catch(() => undefined);

  const space = new SpaceBackdrop(app.renderer);
  app.stage.addChild(space);
  const drawSky = () => space.resize(app.screen.width, app.screen.height);
  drawSky();
  app.renderer.on('resize', drawSky);
  app.ticker.add((ticker) => space.update(ticker.deltaMS));

  if (new URLSearchParams(location.search).has('objects')) {
    showObjectGallery(app);
    return;
  }

  const { levels, samples, effects } = await loadMapData();
  const store = new SaveStore(levels);
  const sounds = new SoundBank(samples);
  const input = new Input();
  const ui = new Ui(input, sounds);
  sounds.playMusic('assets/ambience.mp3');
  sounds.preload([...PLAY_SOUNDS, VICTORY_SOUND]);

  // A voice line still playing delays the next one, so they never overlap.
  let quietAt = 0;
  const say = (sample: number | undefined) => {
    const now = performance.now();
    const length = sounds.play(sample, Math.max(0, quietAt - now));
    if (length) quietAt = Math.max(quietAt, now) + length;
  };

  let lastMusic = store.settings.music || 0.7;
  const applySettings = () => {
    const s = store.settings;
    sounds.setVolume('music', s.music);
    sounds.setVolume('sfx', s.sfx);
    sounds.setVolume('voice', s.voice);
    if (s.music > 0) lastMusic = s.music;
  };
  applySettings();

  const title = new TitleScene();
  app.stage.addChild(title);
  const resizeTitle = () => title.resize(app.screen.width, app.screen.height);
  resizeTitle();
  app.renderer.on('resize', resizeTitle);

  // Object icons for the menus, rendered once from the same drawings.
  const icons = new Map<string, string>();
  const icon = (tile: number) => {
    const name = designForTile(tile);
    let url = icons.get(name);
    if (!url) {
      const g = new Graphics(designContext(name));
      const texture = app.renderer.generateTexture({ target: g, frame: new Rectangle(-56, -108, 112, 112), resolution: 1.5 });
      url = (app.renderer.extract.canvas(texture) as HTMLCanvasElement).toDataURL();
      texture.destroy(true);
      g.destroy();
      icons.set(name, url);
    }
    return url;
  };

  let mode: Mode = 'title';
  let play: PlayScreen;
  const camera = createTuningPanel((s) => play?.setCamera(s));

  play = createPlayScreen({
    app, input, sounds, levels, effects, store, say,
    onPause: () => {
      play.saveRun();
      mode = 'menu';
      menus.pause();
    },
    onComplete: (result) => {
      mode = 'menu';
      menus.complete(result);
    },
    onToggleMusic: () => {
      store.settings.music = store.settings.music > 0 ? 0 : lastMusic;
      applySettings();
      store.saveNow();
      play.showToast(store.settings.music > 0 ? 'Music on' : 'Music off');
    },
  }, camera.settings);
  app.stage.addChild(play.root);

  const showTitle = (on: boolean) => {
    title.visible = on;
    play.setActive(!on);
  };

  let greeted = false;
  const menus = createMenus({
    ui, store, levels, effects, say, icon,
    play: (index, resume) => {
      // Like the original: PocoMan announces himself when play begins.
      if (mode === 'title' && !greeted) {
        greeted = true;
        say(effects.ready);
      }
      ui.hide();
      showTitle(false);
      mode = 'playing';
      input.setMode('game');
      play.start(index, { resume });
    },
    resume: () => {
      ui.hide();
      mode = 'playing';
      input.setMode('game');
    },
    restartLevel: () => {
      ui.hide();
      mode = 'playing';
      input.setMode('game');
      play.start(play.levelIndex, { resume: false });
    },
    quitToTitle: () => {
      play.saveRun();
      store.saveNow();
      mode = 'title';
      showTitle(true);
      menus.mainMenu();
    },
    applySettings,
    cameraPanel: {
      get: () => camera.visible,
      set: (on) => (camera.visible = on),
    },
    loadNewMap: async () => {
      ui.hide();
      const data = await showDropScreen(true);
      // New levels change everything; simplest is to start fresh with them.
      if (data) location.reload();
      else menus.options(() => menus.mainMenu(4));
    },
  });

  // Finishing the very last level gets the full celebration.
  const complete = menus.complete;
  menus.complete = (result) => {
    complete(result);
    if (result.index === levels.length - 1 && result.solve.firstSolve) {
      sounds.playVariant([VICTORY_SOUND], 0.8, 0);
      say(effects.cheer);
    }
  };

  showTitle(true);
  menus.pressAnyKey(() => {
    // The key press unlocks audio; give it a moment, then greet like the original.
    setTimeout(() => {
      say(effects.anyKey);
      say(effects.intro);
    }, 150);
    menus.mainMenu();
  });

  // Save on the way out, so a level in progress resumes exactly.
  window.addEventListener('beforeunload', () => {
    if (mode !== 'title') play.saveRun();
    store.saveNow();
  });

  if (import.meta.env.DEV) {
    Object.assign(window, { pocoman: { app, sounds, store, ui, input, get play() { return play; }, get mode() { return mode; } } });
  }

  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS, 100);
    input.update(dt);
    if (title.visible) title.update(dt);
    if (mode === 'playing') {
      play.update(dt, true);
    } else {
      if (play.root.visible) play.update(dt, false);
      ui.update();
    }
  });
}

main();
