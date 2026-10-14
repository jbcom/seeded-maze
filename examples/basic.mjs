import {
  assertSolvable,
  buildCurvedWalls,
  buildGeometry,
  composeMazeModules,
  DEFAULT_CONFIG,
  findDeadEnds,
  generateLayeredMaze,
  generateMaze,
} from 'seeded-maze';

// One seeded maze: the same seed always gives the same layout.
const layout = generateMaze(9, 9, 'level-1');
const geometry = buildGeometry(layout, DEFAULT_CONFIG);
const walls = buildCurvedWalls(layout, DEFAULT_CONFIG);

// Three stacked layers, with a proof that the goal can be reached from the entry.
const layered = generateLayeredMaze({ layers: 3, width: 9, height: 9, seed: 'tower-1' });
const report = assertSolvable(layered);

// Explicit authored tiles; composition does not choose content or consume random draws.
const module = {
  id: 'tile',
  width: 1,
  height: 1,
  cells: [[{ walls: { north: true, east: true, south: true, west: true } }]],
  ports: ['north', 'east', 'south', 'west'].map((side) => ({
    id: side,
    side,
    offset: 0,
    type: 'path',
  })),
  anchors: [{ id: 'marker', kind: 'marker', x: 0, y: 0 }],
};
const composed = composeMazeModules(
  layout,
  layout.cells.flatMap((row) => row.map(({ x, y }) => ({ x, y, module }))),
);

console.log({
  size: `${layout.width}x${layout.height}`,
  exits: layout.exits.length,
  wallSegments: geometry.walls.length,
  railNodes: geometry.railNodes.size,
  curvedWalls: walls.length,
  deadEnds: findDeadEnds(layout).length,
  solvable: report.solvable,
  pathLength: report.pathLength,
  composedTiles: composed.reachableCells,
});
