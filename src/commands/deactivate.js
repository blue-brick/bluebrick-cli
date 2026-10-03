import * as p from '@clack/prompts';
import { rmSync } from 'node:fs';
import {
  findLicense,
  machineId,
  maskKey,
  readJson,
  request,
  serverUrl,
} from '../lib/license.js';

export async function deactivateCommand(opts = {}) {
  p.intro('Blue Brick deactivate');

  const found = findLicense();
  if (!found) {
    p.cancel('No license found here. Nothing to deactivate.');
    process.exit(1);
  }
  const lic = found.data;

  if (!opts.yes) {
    const ok = await p.confirm({
      message: `Free ${maskKey(lic.key)} so it can be activated on another machine?`,
    });
    if (p.isCancel(ok) || !ok) {
      p.cancel('Cancelled. Nothing changed.');
      process.exit(0);
    }
  }

  const s = p.spinner();
  s.start('Contacting the license server');
  try {
    const res = await request(serverUrl(lic), '/api/deactivate', {
      key: lic.key,
      machineId: machineId(),
    });
    const data = await readJson(res);
    if (data.ok || data.error === 'not_activated') {
      rmSync(found.file, { force: true });
      s.stop(data.ok ? 'Deactivated' : 'The server had no activation here; local license removed');
      p.outro('The key can now be activated on another machine.');
    } else {
      s.stop('Failed');
      p.cancel(data.message || 'Could not deactivate.');
      process.exit(1);
    }
  } catch (e) {
    s.stop('Failed');
    p.cancel(e.message);
    process.exit(1);
  }
}