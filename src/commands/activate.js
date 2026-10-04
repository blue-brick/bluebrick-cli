import * as p from '@clack/prompts';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
import { PASSWORD_PATTERN, writeEnv } from '../lib/scaffold.js';

// Creates .env from .env.example (random SESSION_SECRET + admin password),
// the same way `bluebrick create` does. Skips products without .env.example.
async function setupEnv(target) {
  if (!existsSync(path.join(target, '.env.example'))) return null;
  if (existsSync(path.join(target, '.env'))) return null;

  let adminPassword = '';
  let generated = false;

  if (process.stdin.isTTY) {
    const answer = await p.password({
      message: 'Admin password? (leave empty to generate one)',
      validate: (v) =>
        !v || PASSWORD_PATTERN.test(v)
          ? undefined
          : '8+ characters: letters, numbers and ! @ % ^ & * ( ) _ + = . , : ; ? ~ - only',
    });
    if (p.isCancel(answer)) {
      p.log.warn('Skipped. Create a .env from .env.example before starting.');
      return null;
    }
    adminPassword = answer ?? '';
  }
  if (!adminPassword) {
    adminPassword = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }

  writeEnv(target, adminPassword);
  p.log.success('Wrote .env with a random SESSION_SECRET');
  return { generated, adminPassword };
}

function hasStartScript(target) {
  try {
    const pkg = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8'));
    return Boolean(pkg.scripts && pkg.scripts.start);
  } catch {
    return false;
  }
}

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

  const env = await setupEnv(target);

  const hasPackage = existsSync(path.join(target, 'package.json'));
  if (opts.install !== false && hasPackage) {
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

  if (env && env.generated) {
    p.note(
      `Admin password: ${env.adminPassword}\nSaved in .env. Change it in Settings or with: bluebrick password`,
      'Login'
    );
  }

  const rel = path.relative(process.cwd(), target) || '.';
  const steps = [`cd ${rel}`];
  if (opts.install === false && hasPackage) steps.push('npm install');
  if (hasStartScript(target)) steps.push('npm start');
  p.outro(`Done. Next: ${steps.join(' && ')}`);
}
