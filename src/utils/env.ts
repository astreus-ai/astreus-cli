import { writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { ENV_KEY_MAP } from '../config';
import type { ProviderType } from '../types';

/**
 * Per-user settings file (owner-only permissions). Settings and API keys are never written to
 * the current directory, where a `.env` could end up committed to whatever repo the CLI runs in.
 */
export const USER_ENV_PATH = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
  'astreus',
  '.env'
);

export function getEnvKeyName(provider: ProviderType): string {
  return ENV_KEY_MAP[provider] || 'OPENAI_API_KEY';
}

export function getEnvValue(key: string): string {
  return process.env[key] || '';
}

export function saveEnvVar(key: string, value: string): void {
  process.env[key] = value;

  let envContent = '';
  if (existsSync(USER_ENV_PATH)) {
    envContent = readFileSync(USER_ENV_PATH, 'utf-8');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      // Function replacement: a `$` in the value must not be read as a replacement pattern
      envContent = envContent.replace(regex, () => `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  } else {
    envContent = `${key}=${value}`;
  }
  mkdirSync(dirname(USER_ENV_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(USER_ENV_PATH, envContent.trim() + '\n', { mode: 0o600 });
  // `mode` only applies on creation; tighten a file that already existed
  chmodSync(USER_ENV_PATH, 0o600);
}

export function saveApiKey(provider: ProviderType, key: string): void {
  const envKey = getEnvKeyName(provider);
  saveEnvVar(envKey, key);
}

export function isApiKeyError(message: string): boolean {
  // Provider responses expose only a sanitized HTTP status. Do not mistake
  // permission, quota, or server failures for rejected credentials.
  const httpStatus = message.match(/\bHTTP\s+(\d{3})\b/i);
  if (httpStatus) return httpStatus[1] === '401';

  // Missing local configuration has no HTTP response status.
  const lower = message.toLowerCase();
  return lower.includes('api key') || lower.includes('api_key');
}

/** Default CLI database: per user, never in the directory the CLI happens to run in. */
export const USER_DB_URL = `sqlite://${join(dirname(USER_ENV_PATH), 'astreus.db')}`;
