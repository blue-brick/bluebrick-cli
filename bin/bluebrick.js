#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync } from 'node:fs';
import { activateCommand as activate } from '../src/commands/activate.js';
import { add } from '../src/commands/add.js';
import { create } from '../src/commands/create.js';
import { deactivateCommand as deactivate } from '../src/commands/deactivate.js';
import { licenseCommand as license } from '../src/commands/license.js';
import { password } from '../src/commands/password.js';
import { reset } from '../src/commands/reset.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

program
  .name('bluebrick')
  .description(pkg.description)
  .version(pkg.version);

program
  .command('create [name]')
  .description('Create a new Blue Brick project')
  .option('-t, --template <stack>', 'template to use: node or python')
  .option('--no-install', 'skip installing dependencies')
  .option('--no-git', 'skip git init')
  .action(create);

program
  .command('add [module]')
  .description('Add a module to the current project (run without a name to list them)')
  .action(add);

program
  .command('password')
  .description('Change the admin password of the current project (works while the server runs)')
  .option('--generate', 'generate a random password and print it once')
  .action(password);

program
  .command('reset')
  .description('Delete everything in the current project and rebuild it from the clean template')
  .action(reset);

program
  .command('activate <key> [folder]')
  .description('Activate a license key and download the product it unlocks')
  .option('--here', 'install into the current (empty) folder')
  .option('--no-install', 'skip installing dependencies')
  .action(activate);

program
  .command('license')
  .description('Show the license of the current product and check it with the server')
  .action(license);

program
  .command('deactivate')
  .description('Free this license key so it can be activated on another machine')
  .option('-y, --yes', 'skip the confirmation prompt')
  .action(deactivate);

program.parse();
