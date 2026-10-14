import type { MazeCell, MazeLayout } from './core.js';

export type ModuleSide = 'north' | 'east' | 'south' | 'west';
/** Allocation bound counts the full expanded rectangle, including solid mask tiles. */
export const MAX_COMPOSED_CELLS = 1_000_000;
export interface ModulePoint {
  x: number;
  y: number;
}
/** Null mask entries are solid; non-null entries are traversable tiles. */
export interface ModuleCell {
  walls: MazeCell['walls'];
}
export interface ModulePort {
  id: string;
  side: ModuleSide;
  /** Boundary tile index: x on north/south, y on east/west. */
  offset: number;
  type: string;
}
export interface ModuleAnchor extends ModulePoint {
  id: string;
  kind: string;
}
export interface MazeModule {
  id: string;
  width: number;
  height: number;
  cells: readonly (readonly (ModuleCell | null)[])[];
  ports: readonly ModulePort[];
  anchors: readonly ModuleAnchor[];
}
export interface ModulePlacement extends ModulePoint {
  module: MazeModule;
}
export interface ModuleProvenance {
  moduleId: string;
  macro: ModulePoint;
  local: ModulePoint;
}
export interface ComposedCell extends ModuleCell, ModulePoint, ModuleProvenance {}
export interface ComposedAnchor extends ModuleAnchor, ModuleProvenance {}
export interface ComposedPort extends ModulePort, ModulePoint, ModuleProvenance {
  status: 'sealed' | 'joined' | 'exit';
}
export interface ModuleJoin {
  from: { macro: ModulePoint; portId: string };
  to: { macro: ModulePoint; portId: string };
  type: string;
}
/** A masked tile grid, deliberately distinct from the all-traversable MazeLayout. */
export interface ComposedMaze {
  width: number;
  height: number;
  cells: (ComposedCell | null)[][];
  modules: { moduleId: string; macro: ModulePoint; origin: ModulePoint }[];
  anchors: ComposedAnchor[];
  ports: ComposedPort[];
  joins: ModuleJoin[];
  /** Every open tile is connected; counts exclude solid mask entries. */
  reachableCells: number;
}

const sides: readonly ModuleSide[] = ['north', 'east', 'south', 'west'];
const directions = {
  north: { x: 0, y: -1, opposite: 'south' },
  east: { x: 1, y: 0, opposite: 'west' },
  south: { x: 0, y: 1, opposite: 'north' },
  west: { x: -1, y: 0, opposite: 'east' },
} as const;

function requireValid(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`composeMazeModules: ${message}`);
}
function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
function inside(point: ModulePoint, width: number, height: number): boolean {
  return (
    Number.isSafeInteger(point.x) &&
    Number.isSafeInteger(point.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < width &&
    point.y < height
  );
}
function portPoint(port: ModulePort, module: MazeModule): ModulePoint {
  switch (port.side) {
    case 'north':
      return { x: port.offset, y: 0 };
    case 'south':
      return { x: port.offset, y: module.height - 1 };
    case 'west':
      return { x: 0, y: port.offset };
    case 'east':
      return { x: module.width - 1, y: port.offset };
  }
}
function compareId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
function orderedPorts(module: MazeModule): ModulePort[] {
  return [...module.ports].sort(
    (a, b) => sides.indexOf(a.side) - sides.indexOf(b.side) || a.offset - b.offset,
  );
}

function validateGridShape(
  cells: readonly (readonly (ModuleCell | null)[])[],
  width: number,
  height: number,
): void {
  requireValid(cells.length === height, 'ragged grid');
  for (const row of cells) requireValid(Array.isArray(row) && row.length === width, 'ragged grid');
}

/** Validate wall symmetry, sealing and actual tile connectivity without trusting metadata. */
function validateGrid(
  cells: readonly (readonly (ModuleCell | null)[])[],
  width: number,
  height: number,
  sealed: boolean,
): number {
  validateGridShape(cells, width, height);
  const queue: ModulePoint[] = [];
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      if (cell === null) continue;
      requireValid(
        typeof cell === 'object' &&
          cell !== undefined &&
          typeof cell.walls === 'object' &&
          cell.walls !== null,
        'invalid mask cell',
      );
      for (const side of sides) {
        requireValid(typeof cell.walls[side] === 'boolean', 'walls must be booleans');
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      if (cell === null) continue;
      total++;
      if (queue.length === 0) queue.push({ x, y });
      for (const side of sides) {
        const delta = directions[side];
        const next = { x: x + delta.x, y: y + delta.y };
        if (!inside(next, width, height)) {
          requireValid(!sealed || cell.walls[side], 'module boundary must be sealed');
          continue;
        }
        const neighbor = cells[next.y][next.x];
        requireValid(
          neighbor ? cell.walls[side] === neighbor.walls[delta.opposite] : cell.walls[side],
          'inconsistent walls or opening into solid mask',
        );
      }
    }
  }
  requireValid(total > 0, 'module must contain open tiles');
  const visited = new Set<string>([`${queue[0].x},${queue[0].y}`]);
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const cell = cells[current.y][current.x] as ModuleCell;
    for (const side of sides) {
      const delta = directions[side];
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      const key = `${next.x},${next.y}`;
      if (!cell.walls[side] && inside(next, width, height) && !visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }
  requireValid(visited.size === total, 'disconnected open tiles');
  return total;
}

function validateModule(module: MazeModule): void {
  requireValid(module.id.length > 0, 'module id must be nonempty');
  requireValid(positive(module.width) && positive(module.height), 'invalid module dimensions');
  validateGrid(module.cells, module.width, module.height, true);
  const portIds = new Set<string>();
  const boundaries = new Set<string>();
  for (const port of module.ports) {
    requireValid(port.id.length > 0 && !portIds.has(port.id), 'duplicate or empty port id');
    portIds.add(port.id);
    requireValid(sides.includes(port.side) && port.type.length > 0, 'invalid port side or type');
    const point = portPoint(port, module);
    requireValid(inside(point, module.width, module.height), 'port outside module');
    requireValid(module.cells[point.y][point.x] !== null, 'port on solid mask');
    const boundary = `${port.side}:${port.offset}`;
    requireValid(!boundaries.has(boundary), 'overlapping boundary ports');
    boundaries.add(boundary);
  }
  const anchorIds = new Set<string>();
  for (const anchor of module.anchors) {
    requireValid(anchor.id.length > 0 && !anchorIds.has(anchor.id), 'duplicate or empty anchor id');
    anchorIds.add(anchor.id);
    requireValid(anchor.kind.length > 0, 'anchor kind must be nonempty');
    requireValid(inside(anchor, module.width, module.height), 'anchor outside module');
    requireValid(module.cells[anchor.y][anchor.x] !== null, 'anchor on solid mask');
  }
}

/** Stamp authored modules and join only the ports requested by reciprocal macro walls. */
export function composeMazeModules(
  layout: MazeLayout,
  placements: readonly ModulePlacement[],
): ComposedMaze {
  requireValid(positive(layout.width) && positive(layout.height), 'invalid macro dimensions');
  requireValid(
    layout.cells.length === layout.height &&
      Array.from(layout.cells).every((row) => Array.isArray(row) && row.length === layout.width),
    'ragged macro grid',
  );
  requireValid(
    placements.length === layout.width * layout.height,
    'one placement per macro cell required',
  );
  const ordered = [...placements].sort((a, b) => a.y - b.y || a.x - b.x);
  const first = ordered[0].module;
  requireValid(positive(first.width) && positive(first.height), 'invalid module dimensions');
  validateGridShape(first.cells, first.width, first.height);
  const width = layout.width * first.width;
  const height = layout.height * first.height;
  requireValid(positive(width) && positive(height), 'invalid expanded dimensions');
  requireValid(
    Number.isSafeInteger(width * height) && width * height <= MAX_COMPOSED_CELLS,
    `expanded grid exceeds ${MAX_COMPOSED_CELLS} cells`,
  );
  validateModule(first);
  const output: ComposedMaze = {
    width,
    height,
    cells: Array.from({ length: height }, () => Array<ComposedCell | null>(width).fill(null)),
    modules: [],
    anchors: [],
    ports: [],
    joins: [],
    reachableCells: 0,
  };
  const validated = new Set<MazeModule>([first]);
  const portsByPlacement: ComposedPort[][] = [];
  ordered.forEach((placement, index) => {
    requireValid(
      inside(placement, layout.width, layout.height) &&
        placement.x === index % layout.width &&
        placement.y === Math.floor(index / layout.width),
      'overlapping or missing module placement',
    );
    const module = placement.module;
    requireValid(
      module.width === first.width && module.height === first.height,
      'mismatched module footprint',
    );
    if (!validated.has(module)) {
      validateModule(module);
      validated.add(module);
    }
    const macro = { x: placement.x, y: placement.y };
    const origin = { x: macro.x * module.width, y: macro.y * module.height };
    const provenance = (local: ModulePoint): ModuleProvenance => ({
      moduleId: module.id,
      macro: { ...macro },
      local: { x: local.x, y: local.y },
    });
    output.modules.push({ moduleId: module.id, macro, origin });
    module.cells.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell)
          output.cells[origin.y + y][origin.x + x] = {
            x: origin.x + x,
            y: origin.y + y,
            walls: { ...cell.walls },
            ...provenance({ x, y }),
          };
      });
    });
    for (const anchor of [...module.anchors].sort(compareId)) {
      output.anchors.push({
        id: anchor.id,
        kind: anchor.kind,
        x: origin.x + anchor.x,
        y: origin.y + anchor.y,
        ...provenance(anchor),
      });
    }
    const ports = orderedPorts(module).map((port): ComposedPort => {
      const local = portPoint(port, module);
      return {
        ...port,
        x: origin.x + local.x,
        y: origin.y + local.y,
        ...provenance(local),
        status: 'sealed',
      };
    });
    portsByPlacement.push(ports);
    output.ports.push(...ports);
  });
  ordered.forEach((placement, index) => {
    const macroCell = layout.cells[placement.y][placement.x];
    requireValid(
      macroCell.x === placement.x && macroCell.y === placement.y,
      'invalid macro cell coordinates',
    );
    for (const side of sides) {
      requireValid(typeof macroCell.walls[side] === 'boolean', 'macro walls must be booleans');
      const delta = directions[side];
      const neighbor = { x: placement.x + delta.x, y: placement.y + delta.y };
      const internal = inside(neighbor, layout.width, layout.height);
      if (internal)
        requireValid(
          macroCell.walls[side] === layout.cells[neighbor.y][neighbor.x].walls[delta.opposite],
          'nonreciprocal macro walls',
        );
      if (macroCell.walls[side]) continue;
      const ports = portsByPlacement[index].filter((port) => port.side === side);
      requireValid(ports.length > 0, 'open macro side has no ports');
      if (internal) {
        const other = portsByPlacement[neighbor.y * layout.width + neighbor.x].filter(
          (port) => port.side === delta.opposite,
        );
        requireValid(
          ports.length === other.length &&
            ports.every(
              (port, i) => port.offset === other[i].offset && port.type === other[i].type,
            ),
          'mismatched port sets',
        );
        if (side === 'east' || side === 'south')
          ports.forEach((port, i) => {
            output.joins.push({
              from: { macro: { ...port.macro }, portId: port.id },
              to: { macro: { ...other[i].macro }, portId: other[i].id },
              type: port.type,
            });
          });
      }
      for (const port of ports) {
        port.status = internal ? 'joined' : 'exit';
        const cell = output.cells[port.y][port.x];
        requireValid(cell !== null, 'port on solid expanded mask');
        cell.walls[side] = false;
      }
    }
  });
  output.reachableCells = validateGrid(output.cells, width, height, false);
  return output;
}
