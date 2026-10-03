import * as p from '@clack/prompts';
import {
  findLicense,
  machineId,
  maskKey,
  readJson,
  request,
  serverUrl,
} from '../lib/license.js';

export async function licenseCommand() {
  p.intro('Blue Brick license');

  const found = findLicense();
  if (!found) {
    p.cancel('No license found here. Run `bluebrick activate <key>` first.');
    process.exit(1);
  }
  const lic = found.data;

  p.log.info(
    [
      `Product:  ${lic.product}`,
      `Version:  ${lic.version}`,
      `Key:      ${maskKey(lic.key)}`,
      `Folder:   ${found.dir}`,
    ].join('\n')
  );

  const s = p.spinner();
  s.start('Checking with the license server');
  try {
    const res = await request(serverUrl(lic), '/api/verify', {
      key: lic.key,
      machineId: machineId(),
    });
    const data = await readJson(res);
    if (data.ok && data.valid) {
      s.stop('License is valid on this machine');
      if (data.latestVersion && data.latestVersion !== lic.version) {
        p.log.warn(`A different version is published: ${data.latestVersion} (you have ${lic.version}).`);
      }
      p.outro('All good.');
    } else {
      s.stop('License check failed');
      p.cancel(data.message || 'The license is not valid.');
      process.exit(1);
    }
  } catch (e) {
    s.stop('Could not reach the server');
    p.cancel(e.message);
    process.exit(1);
  }
}