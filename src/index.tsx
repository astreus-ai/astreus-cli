import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { config } from 'dotenv';
import { App } from './app';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { USER_DB_URL, USER_ENV_PATH } from './utils/env';

// A project `.env` loads first so it wins (dotenv never overrides set values); saved user settings fill the rest.
config();
config({ path: USER_ENV_PATH });
// The CLI runs inside arbitrary projects: its database (conversations, memories) defaults to the
// per-user config directory so it never lands in, and gets committed with, someone's repo.
if (!process.env.DB_URL) {
  mkdirSync(dirname(USER_ENV_PATH), { recursive: true, mode: 0o700 });
  process.env.DB_URL = USER_DB_URL;
}
process.env.LOG_LEVEL = 'silent';

const VERSION = '0.6.0';

const program = new Command();
program.name('astreus').version(VERSION);
program.command('chat', { isDefault: true }).action(() => {
  console.clear();
  render(<App />, { exitOnCtrlC: false, patchConsole: true });
});
program.parse();
