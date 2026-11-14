# Nighthawks

A free-roaming 3D scene after Edward Hopper's *Nighthawks* (1942), built with
[three.js](https://threejs.org). The camera opens on Hopper's own viewpoint,
reconstructed from the painting's perspective, and the whole block can be
explored from any angle. The four figures move in a quiet 48-second loop.

## Run it

```bash
npm install
npm run dev
```

Then open the address Vite prints. `npm run build` writes a static site to `dist/`.

## Controls

| Input | Action |
| --- | --- |
| Drag | Look around (the picture follows the pointer) |
| W A S D / arrows | Fly |
| Q / E | Down / up |
| Shift | Faster |
| Right-drag | Orbit the block |
| Scroll | Forward / back |
| Z / X | Lens |
| 1–4 | Hopper's angle, The block, Lonely stranger, The street |
| F | Painting crop |
| P | Pause |
| H | Hide UI |

## Project layout

- `src/config.js` – measurements back-projected from the painting
- `src/world/` – block, diner, interior, buildings and figures
- `src/lighting.js`, `src/post.js` – lights, baked shadows and post-processing
- `src/controls.js` – fly and drag controls
- `public/models/` – the rigged figures (see below)
- `tools/rocketbox/` – scripts that convert the figures

If you like it, here is a way to show your appreciation:
[buy me a coffee](https://buymeacoffee.com/pagustafsson) ☕

## Credits

- Figures: [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox),
  MIT licence – see `public/models/LICENSE-Rocketbox.md` and
  `public/models/README.md` for what was changed.
- An homage to Edward Hopper's *Nighthawks* (1942, Art Institute of Chicago).
  This repository contains no reproduction of the painting itself.

## License

[MIT](LICENSE) © 2026 pagustafsson. The Rocketbox figures keep their own MIT
licence from Microsoft (`public/models/LICENSE-Rocketbox.md`).
