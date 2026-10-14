# Decisions

## 2026-10-14: Explicit authored modules compose over macro wall topology

**Decision.** Add `composeMazeModules` over explicit per-cell module placements with a fixed
rectangular footprint, a null/open tile mask with reciprocal walls, typed boundary ports and generic
local anchors. Return a separate masked `ComposedMaze` with placement-scoped provenance.

**Why.** A coarse maze alone cannot preserve authored room shapes or internal walls. A generic
composer can join those structures without choosing content, rendering, or changing saved-seed
generation. A separate output type prevents existing all-traversable-grid helpers from inventing
navigation through solid mask entries.

**How.** Macro `cells.walls` determine seams; other layout metadata is not authoritative. Candidate
ports begin sealed and open only for a requested macro connection or perimeter exit. Entire port
sets must align by offset and type. Validate local connectivity before stamping and final tile
connectivity after stitching, so even external cycles cannot conceal a disconnected authored module.
Canonical ordering and copied outputs keep composition deterministic and input-independent.
Validate dimensions and row shape before deep tile scanning, and bound the full expanded rectangle
by exported `MAX_COMPOSED_CELLS` (1,000,000 entries, including solids) before allocating output.

**Limits.** No module-selection solver, rotations, variable footprints, layered progression rules,
curved rendering or content catalog. Consumers select modules and interpret anchors themselves.

## 2026-10-07: CommonJS ships alongside ESM

**Decision.** The package ships native ESM (`dist/esm`) and CommonJS (`dist/cjs`), each with its own
declarations, behind `import` and `require` conditions in `exports`.

**Why.** The earlier releases were ESM-only. Nothing about the code makes CommonJS wrong: it has no
top-level await, no `import.meta` and one dependency that is itself CommonJS. A public npm package is
installed by projects the maintainer never sees, and a CommonJS toolchain (older test runners, Jest
setups, plain `require` scripts) should not need a dynamic `import()` to call a pure function. The
cost is one small build script, and both formats are held to the same behaviour by the packed-consumer
check, which compares ESM and CommonJS output for the same seed.

**How.** `tsc` emits both formats from two tsconfigs with no bundler. The CommonJS files are renamed
to `.cjs` / `.d.cts` and `dist/cjs/package.json` marks the directory `commonjs`, so the same files
resolve correctly under `"type": "module"`. `arethetypeswrong` and `publint` run in `pnpm verify`.

## 2026-10-07: MIT licence, planned npmjs release as `seeded-maze`

The package is open source. The licence is MIT, the npm name is the unscoped `seeded-maze`, and the
planned first release on npmjs is 0.2.0; it has not been published. Earlier 0.1.x releases came from a private registry and are not on
npmjs. Releases after 0.2.0 are cut by release-please and published from CI by OIDC trusted
publishing with provenance.

## 2026-10-07: Rename the package to `seeded-maze`

**Decision.** Use `seeded-maze` as the unscoped npm name and repository name, keeping version 0.2.0.

**Why.** npm refused the original name as too similar to `axe-core`. The new name describes
seed-driven, deterministic maze generation, including 3D geometry, curved walls and multi-layer
solvability. No version has been published, so the rename does not change an existing npm contract.

## The seed is part of the API

A layout is a pure function of its arguments. Any change that alters what `generateMaze`,
`generateLayeredMaze` or `buildCurvedWalls` produces for an existing seed breaks every saved game,
replay and shared seed built on it, so it is a breaking change and is released as one.

## Toolchain: Node 26 and pnpm 12 by default, Node 22 as the supported floor

`engines` is `>=22` with no ceiling. Node.js 22, 24 and 26 are the maintained lines tested in CI.
Node 26 is a contributor default, not an exact-version requirement. The full library gate and
packed ESM/CommonJS consumer checks pass on Node 22 and 26 without changing runtime code or exports.
`@types/node` remains on 24; new runtime APIs still need verification on the Node 22 floor.
TypeScript is 7 (native) with `moduleResolution: bundler`; Vitest is 5.

## Tests live next to the code

The unit tests are colocated as `src/*.test.ts` and excluded from the build output; `tsconfig.json`
covers them for typechecking. `tests/` holds the checks that exercise the package as a whole.
