# Architecture

seeded-maze is a small set of pure functions over plain data. It owns no rendering, no input and no
game state: a caller hands it dimensions and a seed and gets arrays and maps back.

## Module boundaries

```text
core ──────────> seedrandom
geometry ──────> core (types only)
curves ────────> core (types), geometry, seedrandom
multiLayer ────> core, seedrandom
composition ──> core (types only)
index ─────────> re-exports all five
```

- `core` carves a single maze and answers adjacency questions about it.
- `geometry` converts a layout into boxes, tiles and a navigation graph, and maps between grid and
  world space.
- `curves` turns the same walls into smoothed polylines and measures distances to them.
- `multiLayer` stacks mazes, joins them, and proves the result can be solved.
- `composition` stamps explicitly selected authored modules, opens reciprocal typed ports and
  validates connectivity both within modules and across the expanded masked tile grid.

## Invariants

1. **A seed is the whole input.** `generateMaze` reseeds its generator on every call, so a layout
   depends only on `(width, height, seed)` and never on earlier calls. Layered mazes derive one seed per
   layer and one per connector band from the caller's seed, so adding a layer does not reshuffle the
   layers below it.
2. **Every generated layout is a perfect maze.** Every cell is reachable from the centre, there are no loops, and
   the four perimeter exits are always on the boundary and never in a corner.
3. **A connector band always has a stair.** The first connector between two adjacent layers is a
   two-way `stair`, so `assertSolvable` holds for any layer count.
4. **Curved walls never change topology.** Every emitted vertex is clamped to within `maxDeviation` of
   the original wall line, measured against the original line rather than a drifted intermediate, so
   smoothing and wobble cannot open a closed wall or close an open passage.
5. **Plain data out.** No class instances, no rendering types. Everything is JSON-friendly except
   `MazeGeometry.railNodes`, which is a `Map`.
6. **Composition preserves authored space.** Null mask tiles stay solid and internal walls are copied.
   Only ports demanded by macro wall openings are joined. Candidate ports on closed sides stay sealed.
   Reciprocal macro/local walls and exact port sets prevent accidental seams. Module and final tile
   BFS reject islands, including islands that an external macro cycle could otherwise reconnect.
7. **Composition is explicit and deterministic.** Fixed footprints give non-overlapping origins;
   row-major placements and canonical anchor/port/join order remove input iteration order effects.
   No random draws are added to existing generation contracts. Module, port and anchor provenance
   remains scoped to each macro placement, so repeated authored descriptors remain distinguishable.

## Generation

`generateMaze` uses the Growing Tree algorithm from the centre cell: it keeps a list of active cells and
repeatedly picks one, taking the newest cell with probability 0.7 (long winding corridors, as in
recursive backtracking) and a random one otherwise (more branching, as in Prim's algorithm). It carves
into a random unvisited neighbour, and retires a cell once it has none. The 0.7 bias is part of the
seed contract.

## Why the seed contract is strict

Games store seeds in saves, replays and shared challenges. A tweak that reorders random draws is
invisible in a diff and fatal to every stored seed, so changes to draw order, the bias above, connector
placement or wobble phase are treated as breaking and are released as such.

## Performance

Generation is linear in the number of cells, plus a sort for connector placement. All functions are
synchronous; for very large mazes run them in a worker.

## Intentional limits

- Square cells on a rectangular grid; no hex, triangle or irregular topologies.
- One entrance (the centre) and four exits per layer. Moving the entrance is a caller concern.
- Geometry is described, not drawn. Turning boxes and polylines into meshes belongs to the renderer.
- Composition supports fixed rectangular footprints without rotation, variable-sized room placement,
  content selection or a constraint solver. Its masked output is not a `MazeLayout`; consumers choose
  their own gameplay anchors and adapt traversable cells to their renderer or navigation system.
