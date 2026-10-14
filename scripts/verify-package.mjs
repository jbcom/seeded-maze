#!/usr/bin/env node
// Packed-consumer check: pack the package, assert the tarball holds exactly what should ship, load
// the built entry points from both formats and require them to agree, then install the tarball into
// a scratch project against npmjs only (no scoped registry, no token) and import it under ESM and
// CommonJS.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmNeedsShell = process.platform === 'win32';
const NAME = 'seeded-maze';

// pnpm forwards its own npm_config_* settings to child processes, and newer npm versions warn about
// pnpm-only keys; this check also must not inherit a credential. SKIP_INSTALL_SIMPLE_GIT_HOOKS keeps
// the package's own git-hook installer (npm always runs "prepare" on pack) out of npm's JSON output.
const cleanEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.toLowerCase().startsWith('npm_config_') &&
        !/auth|token|secret|password|credential/i.test(key),
    ),
  ),
  SKIP_INSTALL_SIMPLE_GIT_HOOKS: '1',
};

const FUNCTIONS = [
  'assertSolvable',
  'buildCurvedWalls',
  'buildGeometry',
  'composeMazeModules',
  'distanceToWall',
  'findDeadEnds',
  'generateLayeredMaze',
  'generateMaze',
  'getConnections',
  'getNodeConnections',
  'gridToWorld',
  'maxDeviation',
  'minDistanceToWalls',
  'worldToGrid',
];

/** One call per module, reduced to JSON so two formats can be compared byte for byte. */
function exercise(api) {
  for (const name of FUNCTIONS) {
    assert.equal(typeof api[name], 'function', `export ${name} is missing`);
  }
  assert.equal(typeof api.DEFAULT_CONFIG, 'object', 'export DEFAULT_CONFIG is missing');

  const layout = api.generateMaze(9, 9, 'package-check');
  assert.deepEqual(
    layout.cells,
    api.generateMaze(9, 9, 'package-check').cells,
    'maze is not deterministic',
  );
  assert.equal(`${layout.width}x${layout.height}`, '9x9');
  assert.equal(layout.exits.length, 4);

  const geometry = api.buildGeometry(layout, api.DEFAULT_CONFIG);
  assert.ok(geometry.walls.length > 0 && geometry.railNodes.size === 81, 'geometry is wrong');

  const layered = api.generateLayeredMaze({
    layers: 3,
    width: 9,
    height: 9,
    seed: 'package-check',
  });
  const report = api.assertSolvable(layered);
  assert.ok(report.solvable && report.unreachableLayers.length === 0, 'layered maze unsolvable');

  const curved = api.buildCurvedWalls(layout, api.DEFAULT_CONFIG, {
    wobble: { amplitude: 0.3, wavelength: 6, seed: 'package-check' },
  });
  assert.ok(curved.length > 0, 'no curved walls');

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
  const composed = api.composeMazeModules(
    layout,
    layout.cells.flatMap((row) => row.map(({ x, y }) => ({ x, y, module }))),
  );
  assert.equal(composed.reachableCells, 81, 'module composition lost reachability');
  assert.equal(composed.ports.filter((port) => port.status === 'exit').length, 4);

  return JSON.stringify({
    layout,
    nodes: [...geometry.railNodes.keys()],
    walls: geometry.walls,
    layered,
    report,
    curved,
    composed,
    dead: api.findDeadEnds(layout),
    distance: api.minDistanceToWalls({ x: 0, z: 0 }, curved),
  });
}

const scratch = mkdtempSync(path.join(tmpdir(), 'seeded-maze-package-'));

try {
  const packOutput = execFileSync(
    npm,
    ['pack', '--pack-destination', scratch, '--ignore-scripts', '--json'],
    { cwd: packageRoot, encoding: 'utf8', env: cleanEnv, shell: npmNeedsShell },
  );
  const jsonEnd = packOutput.lastIndexOf(']');
  assert(jsonEnd !== -1, `npm pack produced no JSON array:\n${packOutput}`);
  let pack;
  for (const match of packOutput.matchAll(/^\[/gm)) {
    try {
      [pack] = JSON.parse(packOutput.slice(match.index, jsonEnd + 1));
      break;
    } catch {
      // Not the real array start (for example an "[INFO] ..." line): try the next "[".
    }
  }
  assert(pack, `npm pack did not return a parseable package manifest:\n${packOutput}`);

  const packedPaths = new Set(pack.files.map((file) => file.path));
  for (const required of [
    'LICENSE',
    'README.md',
    'CHANGELOG.md',
    'package.json',
    'docs/API.md',
    'docs/ARCHITECTURE.md',
    'examples/basic.mjs',
    'examples/commonjs.cjs',
    'dist/esm/index.js',
    'dist/esm/index.d.ts',
    'dist/cjs/index.cjs',
    'dist/cjs/index.d.cts',
    'dist/cjs/package.json',
  ]) {
    assert(packedPaths.has(required), `packed artifact is missing ${required}`);
  }
  for (const forbiddenPrefix of [
    'src/',
    'tests/',
    'coverage/',
    'scripts/',
    '.github/',
    'docs/dist/',
  ]) {
    assert(
      [...packedPaths].every((file) => !file.startsWith(forbiddenPrefix)),
      `packed artifact unexpectedly contains ${forbiddenPrefix}`,
    );
  }

  const esm = await import(pathToFileURL(path.join(packageRoot, 'dist/esm/index.js')).href);
  const cjs = createRequire(import.meta.url)(path.join(packageRoot, 'dist/cjs/index.cjs'));
  assert.equal(exercise(esm), exercise(cjs), 'ESM and CommonJS builds disagree');

  // The tarball itself, installed from npmjs alone: an empty user config, an empty global config and
  // an explicit registry leave no scoped registry or credential in reach.
  const consumer = path.join(scratch, 'consumer');
  const userConfig = path.join(scratch, 'anonymous.npmrc');
  const globalConfig = path.join(scratch, 'empty-global.npmrc');
  writeFileSync(userConfig, 'registry=https://registry.npmjs.org/\n');
  writeFileSync(globalConfig, '');
  mkdirSync(consumer);
  writeFileSync(
    path.join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'seeded-maze-consumer', private: true, type: 'module' })}\n`,
  );
  execFileSync(
    npm,
    [
      'install',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      '--userconfig',
      userConfig,
      '--globalconfig',
      globalConfig,
      path.join(scratch, pack.filename),
    ],
    { cwd: consumer, env: cleanEnv, shell: npmNeedsShell, stdio: 'pipe' },
  );

  const draw = (type, source) =>
    execFileSync(process.execPath, [`--input-type=${type}`, '--eval', source], {
      cwd: consumer,
      encoding: 'utf8',
    });
  const sample = `JSON.stringify(m.composeMazeModules(m.generateMaze(3, 3, 'installed'),
    m.generateMaze(3, 3, 'installed').cells.flatMap(row => row.map(({x,y}) => ({x,y,module:{
      id:'tile',width:1,height:1,cells:[[{walls:{north:true,east:true,south:true,west:true}}]],
      ports:['north','east','south','west'].map(side=>({id:side,side,offset:0,type:'path'})),anchors:[]
    }})))))`;
  const esmInstalled = draw(
    'module',
    `import * as m from '${NAME}'; process.stdout.write(${sample});`,
  );
  const cjsInstalled = draw(
    'commonjs',
    `const m = require('${NAME}'); process.stdout.write(${sample});`,
  );
  assert.equal(esmInstalled, cjsInstalled, 'installed ESM and CommonJS output differ');

  console.log(
    `${NAME}: installed ${pack.entryCount} intentional files; ESM and CommonJS APIs agree`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
