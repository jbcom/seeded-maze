# seeded-maze

[![CI](https://github.com/jbcom/seeded-maze/actions/workflows/ci.yml/badge.svg)](https://github.com/jbcom/seeded-maze/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/seeded-maze)](https://www.npmjs.com/package/seeded-maze)
[![license](https://img.shields.io/npm/l/seeded-maze)](LICENSE)

Deterministic maze generation for games and tools. Pure data in and out: no rendering library
types, no globals you have to reset, and the same seed always produces the same maze.

- **Seeded grid mazes.** `generateMaze(width, height, seed)` returns a `MazeLayout` (cells, passages,
  centre, perimeter exits). Dimensions are forced odd so the centre is shared.
- **Rail-node geometry.** `buildGeometry(layout, config)` turns a layout into wall segments, floor and
  ceiling tiles and a rail-node graph; `gridToWorld` / `worldToGrid` convert between grid and world space.
- **Multi-layer topology.** `generateLayeredMaze({ layers, width, height, seed })` stacks layers joined
  by `stair`, `drop` and `jump` connectors, and `assertSolvable` proves the goal is reachable from the
  entry across layers. `findDeadEnds` reports dead ends and how far each sits from the solution path.
- **Curved-wall outlines.** `buildCurvedWalls` smooths and wobbles the wall lines into polylines,
  clamped so a curve can never open a walled boundary or seal an open passage.
- **Authored module composition.** `composeMazeModules` expands a macro maze with explicitly chosen
  rectangular tile modules, joins matching typed ports, preserves masks and anchors, and rejects
  disconnected modules or expanded grids.

## Install

```sh
npm install seeded-maze
# or: pnpm add seeded-maze
```

Requires Node.js 22 or newer. `seeded-maze` ships native ESM and CommonJS entry points with
format-correct TypeScript declarations, and one runtime dependency,
[`seedrandom`](https://www.npmjs.com/package/seedrandom).

## Quick start

```ts
import {
  assertSolvable,
  buildGeometry,
  DEFAULT_CONFIG,
  findDeadEnds,
  generateLayeredMaze,
  generateMaze,
} from 'seeded-maze';

// A 9 x 9 maze. The same seed gives the same layout on every run and every machine.
const layout = generateMaze(9, 9, 'daily-2026-10-07');
const geometry = buildGeometry(layout, DEFAULT_CONFIG);
console.log(geometry.walls.length, geometry.railNodes.size, findDeadEnds(layout).length);

// Three stacked layers, with a proof that the goal can be reached from the entry.
const tower = generateLayeredMaze({ layers: 3, width: 9, height: 9, seed: 'tower-1' });
console.log(assertSolvable(tower).solvable);
```

CommonJS works the same way:

```js
const { generateMaze } = require('seeded-maze');
```

Runnable ESM and CommonJS examples are in [`examples/`](examples).

## API overview

| Area | Exports |
| --- | --- |
| Layout | `generateMaze`, `getConnections`, `MazeLayout`, `MazeCell`, `Passage` |
| Geometry | `buildGeometry`, `getNodeConnections`, `gridToWorld`, `worldToGrid`, `DEFAULT_CONFIG`, `MazeConfig`, `MazeGeometry` |
| Curved walls | `buildCurvedWalls`, `distanceToWall`, `minDistanceToWalls`, `maxDeviation`, `CurvedWall`, `Point2` |
| Layers | `generateLayeredMaze`, `assertSolvable`, `findDeadEnds`, `LayeredMaze`, `SolvabilityReport`, `DeadEnd` |
| Composition | `composeMazeModules`, `MazeModule`, `ModulePlacement`, `ComposedMaze`, `ModulePort`, `ModuleAnchor` |

The full reference is in [`docs/API.md`](docs/API.md); the invariants behind it are in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Compatibility

- Node.js 22 and newer, tested on the maintained lines 22, 24 and 26.
- Plain data structures only, so it runs in browsers and workers through any bundler.
- A seed is part of the contract: a change that alters what a seed produces is released as a breaking
  change.

## Links

- [Documentation](https://jonbogaty.com/seeded-maze/)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md) and [security policy](SECURITY.md)

## License

[MIT](LICENSE)
