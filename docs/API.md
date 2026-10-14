# API reference

Everything is exported from `seeded-maze`, as ESM or CommonJS. All functions are pure and synchronous.
Coordinates come in two spaces: **grid** coordinates (`x` to the east, `y` to the south, both counted
in cells from the top-left) and **world** coordinates (`x` and `z` in whatever unit `MazeConfig.cellSize`
is expressed in, centred on the maze's centre cell).

## Layout

### `generateMaze(width, height, seed)`

```ts
function generateMaze(width: number, height: number, seed: string): MazeLayout;
```

Generates a perfect maze (every cell reachable, no loops) with the Growing Tree algorithm, starting
from the centre cell. An even `width` or `height` is bumped up by one so the centre is a single cell.
Four exits are cut into the perimeter, one per side, never at a corner. The result is a pure function
of its arguments.

```ts
interface MazeLayout {
  width: number;
  height: number;
  cells: MazeCell[][]; // cells[y][x]
  passages: Passage[]; // every opened wall, in carving order
  center: { x: number; y: number };
  exits: { x: number; y: number }[];
}

interface MazeCell {
  x: number;
  y: number;
  walls: { north: boolean; south: boolean; east: boolean; west: boolean };
  visited: boolean;
  isCenter: boolean;
  isExit: boolean;
}

interface Passage {
  from: { x: number; y: number };
  to: { x: number; y: number };
  direction: 'north' | 'south' | 'east' | 'west';
}
```

### `getConnections(layout, x, y)`

```ts
function getConnections(
  layout: MazeLayout,
  x: number,
  y: number,
): { x: number; y: number; direction: 'north' | 'south' | 'east' | 'west' }[];
```

The cells one step away through an open wall. For an exit cell the list also includes the position
just outside the maze. Returns an empty array for a coordinate outside the grid.

## Authored module composition

### `composeMazeModules(layout, placements)`

```ts
function composeMazeModules(layout: MazeLayout, placements: readonly ModulePlacement[]): ComposedMaze;

type ModuleSide = 'north' | 'east' | 'south' | 'west';
interface ModuleCell {
  walls: { north: boolean; east: boolean; south: boolean; west: boolean };
}
interface MazeModule {
  id: string;
  width: number;
  height: number;
  cells: readonly (readonly (ModuleCell | null)[])[];
  ports: readonly { id: string; side: ModuleSide; offset: number; type: string }[];
  anchors: readonly { id: string; kind: string; x: number; y: number }[];
}
interface ModulePlacement { x: number; y: number; module: MazeModule }
```

Supply exactly one module per macro cell. Every module has the same positive, safe-integer
rectangular footprint. `cells[y][x]` is either a traversable tile with four wall booleans or `null`
for solid space. All local walls must be reciprocal, every module boundary initially sealed, and
all traversable tiles within each module connected. A port names a candidate boundary tile:
`offset` is local x on north/south and local y on east/west. It must land on a traversable tile.
Multiple offsets model a wider opening; duplicate IDs or side/offset pairs are invalid.

The macro `cells.walls` are the adjacency authority; `passages`, `center`, `exits` and cell flags
do not select openings. Authored macro cycles are supported. Interior macro walls must be
reciprocal. Every open macro side requires a nonempty port set; an interior edge must have
exactly the same offsets and types on its opposite side. The composer opens those tile walls.
Candidate ports on closed macro sides remain sealed. Open perimeter sides become exterior ports;
no other module boundary opens. There is no automatic carving, content choice, repair or rotation.

```ts
interface ModuleProvenance {
  moduleId: string;
  macro: { x: number; y: number };
  local: { x: number; y: number };
}
interface ComposedCell extends ModuleCell, ModuleProvenance { x: number; y: number }
interface ComposedAnchor extends ModuleProvenance {
  id: string; kind: string; x: number; y: number;
}
interface ComposedPort extends ModuleProvenance {
  id: string; side: ModuleSide; offset: number; type: string; x: number; y: number;
  status: 'sealed' | 'joined' | 'exit';
}
interface ComposedMaze {
  width: number; height: number;
  cells: (ComposedCell | null)[][];
  modules: { moduleId: string; macro: { x: number; y: number }; origin: { x: number; y: number } }[];
  anchors: ComposedAnchor[];
  ports: ComposedPort[];
  joins: {
    from: { macro: { x: number; y: number }; portId: string };
    to: { macro: { x: number; y: number }; portId: string };
    type: string;
  }[];
  reachableCells: number;
}
```

Origins are `(macro.x * module.width, macro.y * module.height)`; x/y in cells, anchors and ports
are expanded tile coordinates. Provenance includes the original local coordinates. Reusing a
module ID or local anchor ID across placements is supported: scope identities by macro coordinates.
An anchor needs a nonempty ID/kind and must be on a traversable tile; IDs are unique within its
module. Multiple differently named anchors may share a tile.

The result is deliberately distinct from `MazeLayout`: solid mask tiles are not navigable. Do not
cast it to `MazeLayout` or pass it to `buildGeometry`, `buildCurvedWalls` or `assertSolvable`.
Consumers create their own rendering/navigation adapters over non-null cells and choose gameplay
entry/goal anchors. `reachableCells` counts all non-null tiles and equals the number proven reachable
by tile-level BFS after stitching; every anchor and port endpoint is therefore reachable. It does
not prove a consumer's gated objectives or progression rules.

Composition draws no randomness, changes no inputs and returns independent data. Output placements
are row-major, anchors use code-unit ID order within each placement, ports use north/east/south/west
then offset, and joins use row-major placement then east/south. Reordering input arrays does not
change output. Invalid masks, missing/overlapping placements, mismatched footprints or ports,
unsealed boundaries and disconnected modules/grids throw an `Error` prefixed `composeMazeModules:`.

## Geometry

### `MazeConfig` and `DEFAULT_CONFIG`

```ts
interface MazeConfig {
  cellSize: number;
  wallHeight: number;
  wallThickness: number;
}

const DEFAULT_CONFIG: MazeConfig; // { cellSize: 6.5, wallHeight: 5.5, wallThickness: 0.2 }
```

### `buildGeometry(layout, config?)`

```ts
function buildGeometry(layout: MazeLayout, config?: MazeConfig): MazeGeometry;
```

Turns a layout into render-ready boxes and a navigation graph. Interior walls are emitted once, not
once per side.

```ts
interface MazeGeometry {
  walls: WallSegment[]; // axis-aligned boxes: x, z, width, height, depth, rotation
  floor: FloorTile; // one tile covering the maze plus a margin
  ceilings: CeilingTile[]; // one per cell, keyed by nodeId
  railNodes: Map<string, RailNode>; // keyed "x,y"
  centerNodeId: string;
  exitNodeIds: string[];
}

interface RailNode {
  id: string; // "x,y"
  gridX: number;
  gridY: number;
  worldX: number;
  worldZ: number;
  connections: string[]; // ids of reachable neighbours
  isCenter: boolean;
  isExit: boolean;
}
```

### `getNodeConnections(geometry, nodeId)`

```ts
function getNodeConnections(geometry: MazeGeometry, nodeId: string): RailNode[];
```

The neighbour nodes of `nodeId`, or an empty array for an unknown id.

### `gridToWorld(gridX, gridY, config, mazeWidth, mazeHeight)`

```ts
function gridToWorld(
  gridX: number,
  gridY: number,
  config: MazeConfig,
  mazeWidth: number,
  mazeHeight: number,
): { x: number; z: number };
```

The world position of a cell's centre. The maze's centre cell maps to `(0, 0)`.

### `worldToGrid(worldX, worldZ, config, mazeWidth, mazeHeight)`

```ts
function worldToGrid(
  worldX: number,
  worldZ: number,
  config: MazeConfig,
  mazeWidth: number,
  mazeHeight: number,
): { x: number; y: number };
```

The cell containing a world position, rounded to the nearest cell. The inverse of `gridToWorld` for
cell centres.

## Curved walls

### `buildCurvedWalls(layout, config?, options?)`

```ts
function buildCurvedWalls(
  layout: MazeLayout,
  config?: MazeConfig,
  options?: BuildCurvedWallsOptions,
): CurvedWall[];

interface BuildCurvedWallsOptions {
  smoothing?: number; // Chaikin passes, default 2; 0 keeps the raw polyline
  wobble?: { amplitude: number; wavelength: number; seed: string };
}

interface CurvedWall {
  points: { x: number; z: number }[];
  closed: boolean;
}
```

Chains every contiguous run of wall into one polyline, smooths it, and optionally displaces it with a
seeded sine wobble. Every vertex is clamped to within `maxDeviation(config)` of the original wall
line, so a curve can never open a walled boundary or seal an open passage.

### `maxDeviation(config)`

```ts
function maxDeviation(config: MazeConfig): number;
```

The largest lateral distance a curved-wall vertex may move from the grid-aligned wall line.

### `distanceToWall(point, wall)` and `minDistanceToWalls(point, walls)`

```ts
function distanceToWall(point: Point2, wall: CurvedWall): number;
function minDistanceToWalls(point: Point2, walls: CurvedWall[]): number;
```

The shortest distance from a point to one polyline (a `closed` wall counts as a loop), or to the
nearest of many. `minDistanceToWalls` returns `Infinity` for an empty list.

## Layers

### `generateLayeredMaze(options)`

```ts
function generateLayeredMaze(options: GenerateLayeredMazeOptions): LayeredMaze;

interface GenerateLayeredMazeOptions {
  layers: number; // at least 1
  width: number;
  height: number;
  seed: string;
  connectorsPerLayer?: number; // default 3, at least 1
}

interface LayeredMaze {
  layers: MazeLayout[];
  connectors: LayerConnector[];
  entry: LayerCellRef; // centre of layer 0
  goal: LayerCellRef; // centre of the last layer
}

type LayerConnectorKind = 'stair' | 'drop' | 'jump';
```

Stacks `layers` independent mazes and joins each adjacent pair with connectors, preferring dead-end
cells. The first connector of every pair is a `stair` (two-way), so neighbouring layers are always
connected in both directions; the rest alternate `drop` (one-way downward) and `jump` (two-way,
flagged so a game can gate it). Throws if `layers` or `connectorsPerLayer` is below 1.

### `assertSolvable(layered)`

```ts
function assertSolvable(layered: LayeredMaze): SolvabilityReport;

interface SolvabilityReport {
  solvable: boolean;
  pathLength: number | null; // BFS edges from entry to goal, null when unreachable
  reachablePerLayer: number[];
  totalPerLayer: number[];
  unreachableLayers: number[];
}
```

Breadth-first search over the union of every layer's passages and every connector, respecting one-way
drops. It reports rather than throws: check `solvable`.

### `findDeadEnds(layout)`

```ts
function findDeadEnds(layout: MazeLayout): DeadEnd[];

interface DeadEnd {
  cell: { x: number; y: number };
  depth: number; // cells from the nearest cell on the centre-to-exit path
}
```

Every dead-end cell (exactly one open side) that is off the main solution path, with its distance from
that path (centre to the nearest exit), deepest first. Depth 1 is a one-cell alcove off the critical
route; larger values are real detours.
