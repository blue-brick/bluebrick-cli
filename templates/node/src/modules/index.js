import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Loads every folder in src/modules that has an index.js exporting register(app).
// `bluebrick add <name>` drops modules in here, so no other file needs editing.
export async function loadModules(app) {
  const loaded = [];
  const entries = fs
    .readdirSync(import.meta.dirname, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const file = path.join(import.meta.dirname, entry.name, 'index.js');
    if (!fs.existsSync(file)) continue;

    const mod = await import(pathToFileURL(file).href);
    if (typeof mod.register === 'function') {
      await mod.register(app);
      loaded.push(entry.name);
    }
  }

  if (loaded.length > 0) console.log(`Modules loaded: ${loaded.join(', ')}`);
  return loaded;
}
