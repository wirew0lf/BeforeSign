#!/usr/bin/env node
import { realpathSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(realpathSync(fileURLToPath(import.meta.url))), '../../..');
if (!existsSync(resolve(root, 'packages/core/src/cli.ts')) || !existsSync(resolve(root, 'node_modules/tsx'))) {
  console.error('Keep this skill symlinked to its BeforeSign checkout and run npm ci in that checkout. A copied skill requires the original repository helper.');
  process.exit(1);
}
const child = spawnSync(process.execPath, ['--import', 'tsx', 'packages/core/src/cli.ts', ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', env: process.env,
});
if (child.error) console.error(child.error.message);
process.exit(child.status ?? 1);
