import * as p from '@clack/prompts';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  KEY_PATTERN,
  machineId,
  normalizeKey,
  readJson,
  request,
  serverUrl,
  writeLicense,
} from '../lib/license.js';

export async function activateCommand(keyArg, dirArg, opts = {}) {
  p.intro('Blue Brick activate');

  const key = normalizeKey(keyArg);
  if (!KEY_PATTERN.test(key)) {
    p.cancel('That does not look like a license key. Keys look like BB-XXXX-XXXX-XXXX-XXXX.');
    process.exit(1);
  }

  const server = serverUrl();
  const mid = machineId();
  const s = p.spinner();

  s.start('Checking your key');
  let data;
  try {
    const res = await request(server, '/api/activate', {
      key,
      machineId: mid,
      hostname: os.hostname(),
    });
    data = await readJson(res);
  } catch (e) {
    s.stop('Failed');
    p.cancel(e.message);
    process.exit(1);
  }
  if (!data.ok) {
    s.stop('Activation failed');
    p.cancel(data.message || 'Activation failed.');
    process.exit(1);
  }
  s.stop(`Key accepted for ${data.product}`);

  const target = dirArg
    ? path.resolve(dirArg)
    : opts.here
      ? process.cwd()
      : path.resolve(data.product);

  // Activating the same key again on this machine is free, so it is safe
  // to stop here and let the user pick another folder.
  if (existsSync(target) && readdirSync(target).length > 0) {
    p.cancel(
      `${target} already exists and is not empty. Your key is active on this machine, so re-run with a different folder (bluebrick activate <key> <folder>) or use --here in an empty one.`
    );
    process.exit(1);
  }

  const createdTarget = !existsSync(target);
  const tmp = path.join(os.tmpdir(), `bluebrick-${Date.now()}.tgz`);
  let version = data.version;

  s.start('Downloading product');
  try {
    const res = await request(server, '/api/download', { key, machineId: mid });
    if (!res.ok) {
      const err = await readJson(res);
      throw new Error(err.message || 'Download failed.');
    }
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    mkdirSync(target, { recursive: true });
    const tar = spawnSync('tar', ['-xzf', tmp, '-C', target], { encoding: 'utf8' });
    if (tar.status !== 0) {
      throw new Error(
        'Could not extract the download (is `tar` installed?) ' + (tar.stderr || '').trim()
      );
    }
    version = res.headers.get('x-product-version') || version;
  } catch (e) {
    s.stop('Failed');
    rmSync(tmp, { force: true });
    if (createdTarget) rmSync(target, { recursive: true, force: true });
    p.cancel(e.message);
    process.exit(1);
  }
  rmSync(tmp, { force: true });

  writeLicense(target, {
    key,
    product: data.product,
    version,
    machineId: mid,
    server,
    activatedAt: new Date().toISOString(),
  });
  s.stop(`Installed ${data.product} ${version}`);

  if (opts.install !== false && existsSync(path.join(target, 'package.json'))) {
    p.log.step('Installing dependencies');
    const r = spawnSync('npm', ['install'], {
      cwd: target,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (r.status !== 0) {
      p.log.warn('npm install failed. Run it yourself inside the folder.');
    }
  }

  const rel = path.relative(process.cwd(), target) || '.';
  p.outro(`Done. Next: cd ${rel}`);
}