import { Container, Graphics, Text, type Application } from 'pixi.js';
import { DESIGN_NAMES, designContext, OBJECT_BOX } from './objects';

/** Dev page (open with ?objects) showing every object design in a grid. */
export function showObjectGallery(app: Application): void {
  const grid = new Container();
  app.stage.addChild(grid);
  const cell = 96;

  const draw = () => {
    grid.removeChildren().forEach((c) => c.destroy());
    const cols = Math.max(1, Math.floor((app.screen.width - 32) / cell));
    DESIGN_NAMES.forEach((name, i) => {
      const x = 16 + (i % cols) * cell;
      const y = 16 + Math.floor(i / cols) * (cell + 8);
      const tile = new Graphics().roundRect(x, y, cell - 8, cell, 6).fill({ color: 0xe9d3a0, alpha: 0.9 });
      const art = new Graphics(designContext(name));
      art.scale.set(((cell - 8) * 0.8) / OBJECT_BOX);
      art.position.set(x + (cell - 8) / 2, y + cell - 22);
      const label = new Text({ text: `${i + 1}. ${name}`, style: { fontFamily: 'Georgia', fontSize: 10, fill: 0x4a3420 } });
      label.position.set(x + 4, y + cell - 16);
      grid.addChild(tile, art, label);
    });
  };
  draw();
  app.renderer.on('resize', draw);
}
