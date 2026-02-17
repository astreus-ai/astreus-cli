import type { ProviderType } from './types';

export const PROVIDERS: ProviderType[] = ['openai', 'claude', 'gemini', 'ollama'];

export const ENV_KEY_MAP: Record<ProviderType, string> = {
  openai: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  ollama: 'OLLAMA_HOST',
};

export const DEFAULT_PROVIDER: ProviderType = 'openai';

// These will be populated from SDK at runtime
let cachedModels: Record<ProviderType, string[]> | null = null;

export async function getModelsFromSDK(): Promise<Record<ProviderType, string[]>> {
  if (cachedModels) return cachedModels;

  try {
    const { getModelsByProvider } = await import('@astreus-ai/astreus/llm/models');
    cachedModels = {
      openai: getModelsByProvider('openai'),
      claude: getModelsByProvider('claude'),
      gemini: getModelsByProvider('gemini'),
      ollama: getModelsByProvider('ollama'),
    };
  } catch {
    // Fallback if SDK import fails
    cachedModels = {
      openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
      claude: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'],
      gemini: ['gemini-pro', 'gemini-pro-vision'],
      ollama: ['llama3', 'llama2', 'mistral', 'codellama'],
    };
  }

  return cachedModels;
}

export function getDefaultModel(provider: ProviderType): string {
  const defaults: Record<ProviderType, string> = {
    openai: 'gpt-4o',
    claude: 'claude-sonnet-4-20250514',
    gemini: 'gemini-pro',
    ollama: 'llama3',
  };
  return defaults[provider];
}
