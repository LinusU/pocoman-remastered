# Pocoman

A Sokoban game in PixiJS v8, styled after `refs/reference-mockup.webp`.

Play it at <https://linusu.com/pocoman-remastered/>.

```bash
npm install
npm run dev
```

The game asks once for `POCOMAN.MAP` from the original PocoMan; drop it on
the page (or click to pick it). The file is read in the browser only, is not
part of this repo, and is kept in the browser's IndexedDB for later visits
(Options → "Load a different POCOMAN.MAP" swaps it).

From the title screen: Continue / Start, Level Select (mini-maps, best
results, locked levels), Profiles (each with its own progress, bests and
statistics), Statistics, Options (music / effects / voice volume, footstep
sounds, controls hint, fullscreen, camera tuning panel) and Credits.
Progress is saved per profile in localStorage, including the level in
progress, which resumes exactly where it was left. As in the original, a
level must be solved before the next one opens; any level up to the furthest
reached can be replayed. A profile can be downloaded as a file (on phones,
through the share sheet) and imported on another device or browser, where it
is always added as a new profile.

Keyboard: arrows / WASD move, Z or Backspace undo the last push, R restart,
N / P next / previous level, M music, Esc pause menu. Menus: arrows, Enter,
Esc.

Controller (Xbox layout): stick or d-pad move, B undo (hold to repeat), hold
View restart, hold LB / RB previous / next level, Y music, Start pause menu.
Starting a push with the controller only leans the gem in; keep holding for a
moment to commit, or let go to have it spring back. Menus: stick / d-pad, A,
B.

Touch (and mouse): tap PocoMan to put a dot on every cell he can walk to, and
tap a dot to walk there by the shortest way. Tap an object to put dots on
every cell it can be pushed to in one straight run; tapping one walks round
to the right side and makes the push. Tap the selection again, or empty
floor, to cancel. On a touch screen a swipe anywhere takes one step that
way, and a bar of Undo, Restart (tap twice) and Menu buttons appears along
the bottom, or down the side in landscape.

iPhones can't put a web page fullscreen, so there the Fullscreen option
explains adding PocoMan to the Home Screen instead; opened from there it runs
fullscreen like an app (`public/manifest.webmanifest`), keeping clear of the
notch and home bar.

The original voice lines and sounds from the file play where they did in
PocoMan (level intros, the first object on a goal, wins, "Oops" for a
cornered object, "Bad move" for undo, "No way, Jose" for a locked level, and
so on). Browsers only allow sound after a key press or click on the page.

Music, footsteps, menu sounds, goal chimes and win swells are generated with
fal.ai (ElevenLabs Music v2.5 and Sound Effects v2) and live in
`public/assets/`; the raw music generation is in `refs/ambience-source.mp3`
and `refs/sfx-preview.mp3` previews the footsteps.

## Layout

- `src/game.ts`: pure Sokoban rules (moves, pushes, undo, win check, paths)
- `src/pocomap.ts`: reads the levels out of `POCOMAN.MAP`
- `src/startScreen.ts`: the drop-the-file start screen
- `src/audio.ts`: plays the original samples
- `src/input.ts`: keyboard and gamepad input
- `src/tapMoves.ts`: tap-to-move dots for touch and mouse
- `src/camera.ts`: orthographic camera (yaw, pitch, wall height)
- `src/tuning.ts`: the camera tuning panel
- `src/main.ts`: start-up and the flow between title, menus and play
- `src/play.ts`: a level being played: board, PocoMan, HUD, effects, saving
- `src/menus.ts`, `src/ui.ts`, `src/ui.css`: menu screens and their framework
- `src/profiles.ts`: profiles, settings, progress and statistics
- `src/titleScene.ts`, `src/fx.ts`, `src/theme.ts`: title backdrop, particles, HUD look
- `src/objects.ts`: the 56 pushable objects (one per original PocoMan tile),
  drawn as flat shapes; open `/?objects` to see them all
- `src/space.ts`: the procedural space backdrop
- `refs/`: the art reference, the sprite sheet, and `backdrop-source.png`
  (an earlier painted backdrop, made with fal.ai `nano-banana-2/edit`)
- `tools/extract_sprites.py`: cuts sprites out of `refs/sprite-sheet.webp` into
  `public/assets/sprites/` (needs Pillow, NumPy and SciPy):

  ```bash
  python3 tools/extract_sprites.py public/assets/sprites
  ```
