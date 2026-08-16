# Event Miner

Event Miner is a small browser mining game built with Phaser, TypeScript, and Vite. Pilot a mining
vehicle, fly through an alien landscape, mine coal, and return to the surface refinery for fuel.

## Gameplay

- Fly with a limited fuel supply and mine dirt or coal to move deeper underground.
- Coal becomes more common as depth increases.
- Deposit coal at the surface refinery. At surface time, each coal takes five seconds to become one
  fuel.
- Collect finished fuel before the next trip underground.
- The refinery runs more slowly relative to the player as the player moves deeper. The time display
  shows the current depth-based factor.

The world is generated again on each page load. Progress is not saved.

## Controls

| Input                  | Action                                      |
| ---------------------- | ------------------------------------------- |
| A/D or Left/Right      | Move and mine horizontally                  |
| W or Up                | Fly upward and consume fuel                 |
| S or Down              | Mine the tile below the vehicle             |
| E near the refinery    | Collect ready fuel or deposit carried coal  |

## Run locally

Install the locked dependencies and start Vite:

```sh
npm ci
npm run dev
```

## Build

```sh
npm run build
```

The build checks the TypeScript source and writes the static site to `dist`.

## Project status

This project is a keyboard-controlled game prototype. It has no backend or saved game state. The
game textures are generated in the browser at run time.
