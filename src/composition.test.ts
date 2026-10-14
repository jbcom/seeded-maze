import { describe, expect, it } from 'vitest';
import {
  composeMazeModules,
  type MazeModule,
  type ModuleCell,
  type ModulePlacement,
  type ModuleSide,
} from './composition.js';
import { generateMaze, type MazeLayout } from './core.js';

const sides: ModuleSide[] = ['north', 'east', 'south', 'west'];
const sealed = () => ({ north: true, east: true, south: true, west: true });
const openCell = (cells: MazeModule['cells'], x: number, y: number) => cells[y][x] as ModuleCell;
function cross(): MazeModule {
  const cells = Array.from({ length: 3 }, (_, y) =>
    Array.from({ length: 3 }, (_, x) => (x === 1 || y === 1 ? { walls: sealed() } : null)),
  );
  for (const side of sides) openCell(cells, 1, 1).walls[side] = false;
  openCell(cells, 1, 0).walls.south = false;
  openCell(cells, 2, 1).walls.west = false;
  openCell(cells, 1, 2).walls.north = false;
  openCell(cells, 0, 1).walls.east = false;
  return {
    id: 'cross',
    width: 3,
    height: 3,
    cells,
    ports: sides.map((side) => ({ id: side, side, offset: 1, type: 'path' })),
    anchors: [
      { id: 'origin', kind: 'marker', x: 1, y: 1 },
      { id: 'edge', kind: 'marker', x: 1, y: 0 },
    ],
  };
}
function macro(width = 2, height = 1): MazeLayout {
  const cells = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x,
      y,
      walls: sealed(),
      visited: false,
      isCenter: false,
      isExit: false,
    })),
  );
  return { width, height, cells, passages: [], center: { x: 0, y: 0 }, exits: [] };
}
function pair(): MazeLayout {
  const layout = macro();
  layout.cells[0][0].walls.east = false;
  layout.cells[0][1].walls.west = false;
  return layout;
}
function placements(layout: MazeLayout, module = cross()): ModulePlacement[] {
  return layout.cells.flatMap((row) => row.map(({ x, y }) => ({ x, y, module })));
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}

describe('authored module composition', () => {
  it('stamps masks, joins reciprocal walls and transforms placement-scoped provenance', () => {
    const result = composeMazeModules(pair(), placements(pair()));
    expect([result.width, result.height, result.reachableCells]).toEqual([6, 3, 10]);
    expect(result.cells[0][0]).toBeNull();
    expect(result.cells[1][2]?.walls.east).toBe(false);
    expect(result.cells[1][3]?.walls.west).toBe(false);
    expect(result.cells[0][1]?.walls.north).toBe(true);
    expect(result.joins).toEqual([
      {
        from: { macro: { x: 0, y: 0 }, portId: 'east' },
        to: { macro: { x: 1, y: 0 }, portId: 'west' },
        type: 'path',
      },
    ]);
    expect(result.anchors.find((a) => a.macro.x === 1 && a.id === 'origin')).toEqual({
      id: 'origin',
      kind: 'marker',
      x: 4,
      y: 1,
      moduleId: 'cross',
      macro: { x: 1, y: 0 },
      local: { x: 1, y: 1 },
    });
    expect(result.ports.filter((p) => p.status === 'joined')).toHaveLength(2);
    expect(result.ports.filter((p) => p.status === 'sealed')).toHaveLength(6);
  });
  it('uses walls as authority, supports cycles and emits each seam once in row-major order', () => {
    const layout = macro(2, 2);
    for (let y = 0; y < 2; y++) {
      layout.cells[y][0].walls.east = false;
      layout.cells[y][1].walls.west = false;
    }
    for (let x = 0; x < 2; x++) {
      layout.cells[0][x].walls.south = false;
      layout.cells[1][x].walls.north = false;
    }
    const result = composeMazeModules(layout, placements(layout));
    expect(result.joins.map((j) => [j.from.macro.x, j.from.macro.y, j.from.portId])).toEqual([
      [0, 0, 'east'],
      [0, 0, 'south'],
      [1, 0, 'south'],
      [0, 1, 'east'],
    ]);
    expect(result.reachableCells).toBe(20);
  });
  it('matches full multi-tile port sets and permits one-tile modules', () => {
    const module: MazeModule = {
      id: 'wide',
      width: 2,
      height: 2,
      cells: [
        [
          { walls: { ...sealed(), east: false, south: false } },
          { walls: { ...sealed(), west: false, south: false } },
        ],
        [
          { walls: { ...sealed(), east: false, north: false } },
          { walls: { ...sealed(), west: false, north: false } },
        ],
      ],
      ports: ['east', 'west'].flatMap((side) =>
        [0, 1].map((offset) => ({
          id: `${side}${offset}`,
          side: side as ModuleSide,
          offset,
          type: 'wide',
        })),
      ),
      anchors: [],
    };
    expect(composeMazeModules(pair(), placements(pair(), module)).joins).toHaveLength(2);
    const single: MazeModule = {
      id: 'dot',
      width: 1,
      height: 1,
      cells: [[{ walls: sealed() }]],
      ports: [],
      anchors: [],
    };
    expect(composeMazeModules(macro(1), placements(macro(1), single)).reachableCells).toBe(1);
  });
  it('is deterministic across frozen inputs and reordered placement/port/anchor arrays', () => {
    const layout = generateMaze(5, 5, 'modules');
    const authored = cross();
    const inputs = placements(layout, authored);
    freeze(layout);
    freeze(inputs);
    const expected = composeMazeModules(layout, inputs);
    const shuffled = {
      ...authored,
      ports: [...authored.ports].reverse(),
      anchors: [...authored.anchors].reverse(),
    };
    expect(composeMazeModules(layout, placements(layout, shuffled).reverse())).toEqual(expected);
    expect(expected.ports.filter((p) => p.status === 'exit')).toHaveLength(4);
    expect(expected.reachableCells).toBe(125);
    expect(authored.cells[1][2]?.walls.east).toBe(true);
    openCell(expected.cells, 1, 1).walls.north = true;
    expect(authored.cells[1][1]?.walls.north).toBe(false);
  });
  it('independently traverses every open output tile and verifies anchors and port endpoints', () => {
    for (const seed of ['one', 'two', 'three']) {
      const layout = generateMaze(7, 5, seed);
      const result = composeMazeModules(layout, placements(layout));
      const queue = [result.anchors[0]];
      const seen = new Set<string>();
      for (let i = 0; i < queue.length; i++) {
        const { x, y } = queue[i];
        const key = `${x},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cell = openCell(result.cells, x, y);
        const offsets = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
        for (const side of sides) {
          const [dx, dy] = offsets[side];
          const next = result.cells[y + dy]?.[x + dx];
          if (!cell.walls[side] && next) {
            const opposite = {
              north: 'south',
              east: 'west',
              south: 'north',
              west: 'east',
            } as const;
            expect(next.walls[opposite[side]]).toBe(false);
            queue.push({ ...queue[0], x: x + dx, y: y + dy });
          }
        }
      }
      expect(seen.size).toBe(result.cells.flat().filter((cell) => cell !== null).length);
      expect(seen.size).toBe(result.reachableCells);
      for (const point of [...result.anchors, ...result.ports])
        expect(seen.has(`${point.x},${point.y}`)).toBe(true);
    }
  });
});

describe('rectangular and cyclic compositions', () => {
  it('transforms heterogeneous rectangular modules with side-specific port offsets', () => {
    const layout = macro(2, 2);
    layout.cells[0][0].walls.east = false;
    layout.cells[0][1].walls.west = false;
    layout.cells[0][1].walls.south = false;
    layout.cells[1][1].walls.north = false;
    layout.cells[1][1].walls.west = false;
    layout.cells[1][0].walls.east = false;
    const make = (id: string): MazeModule => ({
      id,
      width: 4,
      height: 2,
      cells: Array.from({ length: 2 }, (_, y) =>
        Array.from({ length: 4 }, (_, x) => ({
          walls: { north: y === 0, south: y === 1, west: x === 0, east: x === 3 },
        })),
      ),
      ports: sides.map((side) => ({
        id: `${id}-${side}`,
        side,
        offset: side === 'north' || side === 'south' ? 2 : 1,
        type: 'path',
      })),
      anchors: [{ id: 'mark', kind: 'marker', x: 3, y: 1 }],
    });
    const result = composeMazeModules(
      layout,
      layout.cells.flatMap((row) =>
        row.map(({ x, y }) => ({ x, y, module: make(`tile-${x}-${y}`) })),
      ),
    );
    expect([result.width, result.height, result.reachableCells]).toEqual([8, 4, 32]);
    expect(result.anchors[3]).toMatchObject({
      x: 7,
      y: 3,
      local: { x: 3, y: 1 },
      macro: { x: 1, y: 1 },
    });
    expect(
      result.ports.find(
        (port) => port.macro.x === 1 && port.macro.y === 1 && port.side === 'north',
      ),
    ).toMatchObject({ x: 6, y: 2, local: { x: 2, y: 0 }, status: 'joined' });
    expect(result.cells[1][3]?.walls.east).toBe(false);
    expect(result.cells[1][6]?.walls.south).toBe(false);
    expect(result.joins[0]).toMatchObject({
      from: { portId: 'tile-0-0-east' },
      to: { portId: 'tile-1-0-west' },
    });
  });
  it('rejects internally disconnected modules even when an external cycle reconnects their islands', () => {
    const layout = macro(2, 2);
    for (let y = 0; y < 2; y++) {
      layout.cells[y][0].walls.east = false;
      layout.cells[y][1].walls.west = false;
    }
    for (let x = 0; x < 2; x++) {
      layout.cells[0][x].walls.south = false;
      layout.cells[1][x].walls.north = false;
    }
    const inputs = placements(layout);
    const isolated = cross();
    openCell(isolated.cells, 2, 1).walls.west = true;
    openCell(isolated.cells, 1, 1).walls.east = true;
    inputs[0] = { ...inputs[0], module: isolated };
    // East island reconnects through east -> southeast -> south -> the center component.
    expect(() => composeMazeModules(layout, inputs)).toThrow('disconnected');
  });
});

describe('invalid composition rejection', () => {
  it('rejects sparse rows with a prefixed validation error', () => {
    const layout = macro(1);
    const module = cross();
    const cells = [...module.cells];
    delete cells[1];
    expect(() => composeMazeModules(layout, placements(layout, { ...module, cells }))).toThrow(
      'composeMazeModules: ragged grid',
    );
    delete layout.cells[0];
    expect(() => composeMazeModules(layout, [{ x: 0, y: 0, module }])).toThrow(
      'composeMazeModules: ragged macro grid',
    );
  });
  it('reports malformed later neighbors with the composition error prefix', () => {
    for (const invalid of [{}, { walls: null }]) {
      const module = cross();
      const cells = module.cells.map((row) => [...row]);
      cells[0][0] = { walls: sealed() };
      cells[0][1] = invalid as unknown as (typeof cells)[0][1];
      expect(() =>
        composeMazeModules(macro(1), placements(macro(1), { ...module, cells })),
      ).toThrow('composeMazeModules: invalid mask cell');
    }
  });
  const invalidModules: [string, (module: MazeModule) => MazeModule, string][] = [
    ['empty id', (m) => ({ ...m, id: '' }), 'module id'],
    [
      'empty tiles',
      (m) => ({
        ...m,
        cells: [
          [null, null, null],
          [null, null, null],
          [null, null, null],
        ],
      }),
      'open tiles',
    ],
    ['ragged', (m) => ({ ...m, cells: [] }), 'ragged'],
    ['fractional dimension', (m) => ({ ...m, width: 2.5 }), 'dimensions'],
    [
      'unsealed boundary',
      (m) => {
        openCell(m.cells, 1, 0).walls.north = false;
        return m;
      },
      'boundary',
    ],
    [
      'asymmetric wall',
      (m) => {
        openCell(m.cells, 1, 1).walls.north = true;
        return m;
      },
      'inconsistent',
    ],
    [
      'solid opening',
      (m) => {
        openCell(m.cells, 1, 0).walls.east = false;
        return m;
      },
      'solid',
    ],
    [
      'nonboolean walls',
      (m) => {
        openCell(m.cells, 1, 0).walls.north = 1 as unknown as boolean;
        return m;
      },
      'booleans',
    ],
    [
      'islands',
      (m) => {
        openCell(m.cells, 1, 0).walls.south = true;
        openCell(m.cells, 1, 1).walls.north = true;
        return m;
      },
      'disconnected',
    ],
    ['duplicate port id', (m) => ({ ...m, ports: [m.ports[0], m.ports[0]] }), 'port id'],
    [
      'overlapping ports',
      (m) => ({ ...m, ports: [m.ports[0], { ...m.ports[0], id: 'other' }] }),
      'overlapping',
    ],
    ['bad port type', (m) => ({ ...m, ports: [{ ...m.ports[0], type: '' }] }), 'side or type'],
    [
      'bad port side',
      (m) => ({ ...m, ports: [{ ...m.ports[0], side: 'up' as ModuleSide }] }),
      'side or type',
    ],
    ['port outside', (m) => ({ ...m, ports: [{ ...m.ports[0], offset: -1 }] }), 'outside'],
    ['port blocked', (m) => ({ ...m, ports: [{ ...m.ports[0], offset: 0 }] }), 'solid'],
    ['duplicate anchor id', (m) => ({ ...m, anchors: [m.anchors[0], m.anchors[0]] }), 'anchor id'],
    ['anchor kind', (m) => ({ ...m, anchors: [{ ...m.anchors[0], kind: '' }] }), 'kind'],
    ['anchor outside', (m) => ({ ...m, anchors: [{ ...m.anchors[0], x: 3 }] }), 'outside'],
    ['anchor blocked', (m) => ({ ...m, anchors: [{ ...m.anchors[0], x: 0, y: 0 }] }), 'solid'],
  ];
  it.each(invalidModules)('rejects %s', (_, change, message) => {
    const module = change(cross());
    expect(() => composeMazeModules(macro(1), placements(macro(1), module))).toThrow(message);
  });
  it('rejects non-null solid values and sparse mask rows', () => {
    for (const value of [undefined, false, 0, {}, { walls: null }]) {
      const module = cross();
      const cells = module.cells.map((row) => [...row]);
      cells[0][0] = value as unknown as (typeof cells)[0][0];
      expect(() =>
        composeMazeModules(macro(1), placements(macro(1), { ...module, cells })),
      ).toThrow('mask cell');
    }
    const module = cross();
    const cells = module.cells.map((row) => [...row]);
    delete cells[0][0];
    expect(() => composeMazeModules(macro(1), placements(macro(1), { ...module, cells }))).toThrow(
      'mask cell',
    );
  });
  it('rejects missing, overlapping, fractional and out-of-bounds placements', () => {
    const inputs = placements(pair());
    expect(() => composeMazeModules(pair(), [])).toThrow('one placement');
    for (const x of [0, -1, 2, 0.5])
      expect(() => composeMazeModules(pair(), [inputs[0], { ...inputs[1], x }])).toThrow(
        'placement',
      );
  });
  it('rejects mismatched footprints, port types, offsets and port counts', () => {
    const module = cross();
    const inputs = placements(pair());
    expect(() =>
      composeMazeModules(pair(), [inputs[0], { ...inputs[1], module: { ...module, width: 4 } }]),
    ).toThrow('footprint');
    for (const ports of [
      [],
      module.ports.filter((p) => p.side !== 'west'),
      module.ports.map((p) => (p.side === 'west' ? { ...p, type: 'other' } : p)),
    ]) {
      expect(() =>
        composeMazeModules(pair(), [inputs[0], { ...inputs[1], module: { ...module, ports } }]),
      ).toThrow(/ports|port sets/);
    }
    const alternate = cross();
    const cells = alternate.cells.map((row) => [...row]);
    cells[0][0] = { walls: { ...sealed(), east: false } };
    openCell(cells, 1, 0).walls.west = false;
    expect(() =>
      composeMazeModules(pair(), [
        inputs[0],
        {
          ...inputs[1],
          module: {
            ...alternate,
            cells,
            ports: alternate.ports.map((p) => (p.side === 'west' ? { ...p, offset: 0 } : p)),
          },
        },
      ]),
    ).toThrow('port sets');
  });
  it('rejects malformed or disconnected macro graphs rather than trusting passage metadata', () => {
    expect(() => composeMazeModules({ ...pair(), width: 0 }, [])).toThrow('dimensions');
    expect(() => composeMazeModules({ ...pair(), cells: [] }, placements(pair()))).toThrow(
      'ragged',
    );
    const layout = pair();
    layout.cells[0][1].walls.west = true;
    expect(() => composeMazeModules(layout, placements(layout))).toThrow('nonreciprocal');
    layout.cells[0][1].walls.west = false;
    layout.cells[0][1].x = 0;
    expect(() => composeMazeModules(layout, placements(pair()))).toThrow('coordinates');
    const disconnected = macro();
    expect(() => composeMazeModules(disconnected, placements(disconnected))).toThrow(
      'disconnected',
    );
    layout.cells[0][1].x = 1;
    layout.cells[0][0].walls.north = 0 as unknown as boolean;
    expect(() => composeMazeModules(layout, placements(layout))).toThrow('booleans');
  });
});
