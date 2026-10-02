import * as p from '@clack/prompts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { writeAuth } from '../lib/authfile.js';

function fail(message) {
  p.cancel(message);
  process.exit(1);
}

function isSupportedProject(cwd) {
  const has = (f) => fs.existsSync(path.join(cwd, f));
  return (has('server.js') && has('src/auth/store.js')) || (has('app.py') && has('auth_store.py'));
}

export async function password(opts) {
  p.intro('🧱 Blue Brick');

  const cwd = process.cwd();
  if (!isSupportedProject(cwd)) {
    const looksLikeProject = fs.existsSync(path.join(cwd, 'server.js')) || fs.existsSync(path.join(cwd, 'app.py'));
    fail(
      looksLikeProject
        ? 'This project was created before password management existed. Create a new one with bluebrick 0.3.0 or later.'
        : 'Run this from the root of a Blue Brick project (the folder with server.js or app.py).'
    );
  }

  let newPassword = '';
  let generated = false;

  if (opts.generate) {
    newPassword = crypto.randomBytes(12).toString('base64url');
    generated = true;
  } else {
    if (!process.stdin.isTTY) fail('Not running in a terminal. Use --generate to create a random password.');

    const first = await p.password({
      message: 'New admin password?',
      validate: (v) => (!v || v.length < 8 ? 'At least 8 characters' : v.length > 128 ? 'At most 128 characters' : undefined),
    });
    if (p.isCancel(first)) fail('Cancelled.');

    const second = await p.password({
      message: 'Repeat it',
      validate: (v) => (v === first ? undefined : "Doesn't match"),
    });
    if (p.isCancel(second)) fail('Cancelled.');

    newPassword = first;
  }

  const data = writeAuth(cwd, newPassword);
  p.log.success(`Password changed (version ${data.version}). Everyone who was logged in is signed out.`);

  if (generated) {
    p.note(`New admin password: ${newPassword}\nShown once. It is stored only as a hash.`, 'Login');
  }

  p.log.info('The password in .env is only used when data/auth.json is missing, so it is now out of date.');
  p.outro('Done');
}
