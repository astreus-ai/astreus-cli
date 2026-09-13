import { build } from 'tsup';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sandbox = await mkdtemp(join(tmpdir(), 'astreus-cli-tests-'));
try {
  await build({
    config: false,
    entry: {
      config: join(root, 'src/config.ts'),
      runtime: join(root, 'src/runtime.ts'),
      env: join(root, 'src/utils/env.ts'),
    },
    format: ['esm'],
    outDir: join(root, 'build/compatibility-tests'),
    outExtension: () => ({ js: '.mjs' }),
    dts: false,
    clean: true,
    external: ['@astreus-ai/astreus'],
    silent: true,
  });
  const child = spawn(
    process.execPath,
    ['--test', join(root, 'tests/config.test.mjs'), join(root, 'tests/runtime.test.mjs')],
    {
      cwd: sandbox,
      stdio: 'inherit',
      // Do not let local tests inherit real provider credentials or database URLs.
      env: {
        PATH: process.env.PATH,
        HOME: sandbox,
        DB_URL: `sqlite://${join(sandbox, 'test.sqlite')}`,
        LOG_LEVEL: 'silent',
        ENCRYPTION_ENABLED: 'true',
        ENCRYPTION_MASTER_KEY: randomBytes(32).toString('base64'),
        OPENAI_API_KEY: randomUUID(),
        ANTHROPIC_API_KEY: randomUUID(),
      },
    }
  );
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
