import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ENV_KEY_MAP } from '../config';
import type { ProviderType } from '../types';

const ENV_PATH = join(process.cwd(), '.env');

export function getEnvKeyName(provider: ProviderType): string {
  return ENV_KEY_MAP[provider] || 'OPENAI_API_KEY';
}

export function getEnvValue(key: string): string {
  return process.env[key] || '';
}

export function saveEnvVar(key: string, value: string): void {
  process.env[key] = value;

  let envContent = '';
  if (existsSync(ENV_PATH)) {
    envContent = readFileSync(ENV_PATH, 'utf-8');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  } else {
    envContent = `${key}=${value}`;
  }
  writeFileSync(ENV_PATH, envContent.trim() + '\n');
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
