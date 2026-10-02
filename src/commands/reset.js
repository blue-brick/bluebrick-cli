import * as p from '@clack/prompts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PASSWORD_PATTERN, TEMPLATES_DIR, copyTemplate, run, writeEnv } from '../lib/scaffold.js';

function fail(message) {
  p.cancel(message);
  process.exit(1);
}

export async function reset() {
  p.intro('🧱 Blue Brick');

  const cwd = process.cwd();
  const fsRoot = path.parse(cwd).root;
  const has = (f) => fs.existsSync(path.join(cwd, f));
  const stack = has('app.py') ? 'python' : has('server.js') ? 'node' : null;

  if (!stack) fail('Run this from the root of a Blue Brick project (the folder with server.js or app.py).');
  if (cwd === fsRoot || cwd === os.homedir()) fail('Refusing to reset this folder. Go into the project folder first.');
  if (!process.stdin.isTTY) fail('Reset needs a terminal, because it asks you to confirm.');

  const templateDir = path.join(TEMPLATES_DIR, stack);
  if (!fs.existsSync(templateDir)) fail(`The "${stack}" template is missing from this install. Nothing was deleted.`);

  const folder = path.basename(cwd);
  const name =
    folder
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^[^a-z0-9]+/, '')
      .replace(/-+$/, '') || 'my-app';
  const itemCount = fs.readdirSync(cwd).length;

  p.note(
    [
      `Folder: ${cwd}`,
      `Stack:  ${stack}`,
      '',
      `This DELETES everything in this folder (${itemCount} items, including your code,`,
      '.env, data/, node_modules and the .git history). There is no backup and no undo.',
      `It then rebuilds a fresh ${stack} site from the clean template, with a new`,
      'admin password and nothing saved.',
      '',
      'Only forgot the password? Run `bluebrick password` instead: it needs no old',
      'password and keeps everything.',
    ].join('\n'),
    'Reset project'
  );

  const typed = await p.text({
    message: `Type "${folder}" to confirm`,
    validate: (v) => (v === folder ? undefined : 'Does not match the folder name'),
  });
  if (p.isCancel(typed)) fail('Cancelled. Nothing was deleted.');

  const answer = await p.password({
    message: 'New admin password? (leave empty to generate one)',
    validate: (v) =>
      !v || PASSWORD_PATTERN.test(v)
        ? undefined
        : '8+ characters: letters, numbers and ! @ % ^ & * ( ) _ + = . , : ; ? ~ - only',
  });
  if (p.isCancel(answer)) fail('Cancelled. Nothing was deleted.');

  let adminPassword = answer ?? '';
  let generated = false;
  if (!adminPassword) {
    adminPassword = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }

  // Build the fresh project in a temp folder first, so a failure here deletes nothing.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'bluebrick-reset-'));
  try {
    copyTemplate(templateDir, staging, name);
    writeEnv(staging, adminPassword);
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    fail(`Could not prepare the fresh template. Nothing was deleted. (${err.message})`);
  }

  const s = p.spinner();
  s.start('Deleting the old project and building a fresh one');
  try {
    for (const entry of fs.readdirSync(cwd)) {
      fs.rmSync(path.join(cwd, entry), { recursive: true, force: true });
    }
    fs.cpSync(staging, cwd, { recursive: true });
    if (fs.existsSync(path.join(cwd, '.env'))) fs.chmodSync(path.join(cwd, '.env'), 0o600);
  } catch (err) {
    s.stop('Reset failed');
    fail(
      `${err.message}\nThe folder may be partly deleted. A clean copy of the new project is at ${staging}.`
    );
  }
  fs.rmSync(staging, { recursive: true, force: true });
  s.stop('Fresh project created');

  if (run('git', ['init', '-q'], cwd)) p.log.success('Initialized a fresh git repository');
  else p.log.warn('Could not run git init');

  p.log.step('Installing dependencies');
  if (!run('npm', ['install'], cwd)) p.log.warn('npm install failed, run it manually');

  if (generated) {
    p.note(
      `Admin password: ${adminPassword}\nSaved in .env. Change it in Settings or with bluebrick password.`,
      'Login'
    );
  }

  const steps =
    stack === 'python'
      ? ['python3 -m venv .venv && source .venv/bin/activate', 'pip install -r requirements.txt', 'npm run dev']
      : ['npm run dev'];

  p.note(steps.join('\n'), 'Next steps');
  p.outro('Fresh start. Build quietly. Launch loudly. 🚀');
}
