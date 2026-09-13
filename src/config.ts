import type { ProviderType } from './types';

type ModelRegistry = Pick<
  typeof import('@astreus-ai/astreus/llm/models'),
  'getModelsByProvider' | 'getProviderForModel'
>;

export interface ModelCatalog {
  models: Record<ProviderType, string[]>;
  getProviderForModel: ModelRegistry['getProviderForModel'];
}

export interface ModelSelection {
  provider: ProviderType;
  model: string | null;
}

export const PROVIDERS: ProviderType[] = ['openai', 'claude', 'gemini', 'ollama'];

export const ENV_KEY_MAP: Record<ProviderType, string> = {
  openai: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  ollama: 'OLLAMA_HOST',
};

export const DEFAULT_PROVIDER: ProviderType = 'openai';

export function isProvider(value: string): value is ProviderType {
  return PROVIDERS.some((provider) => provider === value);
}

export function createModelCatalogLoader(loadRegistry: () => Promise<ModelRegistry>) {
  let pending: Promise<ModelCatalog> | null = null;

  return (): Promise<ModelCatalog> => {
    if (!pending) {
      pending = Promise.resolve()
        .then(loadRegistry)
        .then((registry) => {
          const models = {
            openai: registry.getModelsByProvider('openai'),
            claude: registry.getModelsByProvider('claude'),
            gemini: registry.getModelsByProvider('gemini'),
            ollama: registry.getModelsByProvider('ollama'),
          };
          for (const provider of PROVIDERS) {
            if (
              !Array.isArray(models[provider]) ||
              models[provider].some(
                (model) =>
                  typeof model !== 'string' ||
                  !model.trim() ||
                  registry.getProviderForModel(model) !== provider
              )
            ) {
              throw new Error('Invalid SDK model catalog');
            }
          }
          if (typeof registry.getProviderForModel !== 'function') {
            throw new Error('Missing SDK model routing');
          }
          return { models, getProviderForModel: registry.getProviderForModel };
        })
        .catch(() => {
          pending = null;
          throw new Error(
            'Could not load the installed SDK model catalog. Reinstall the CLI with a compatible SDK, then retry /model or /provider. No fallback models were selected.'
          );
        });
    }
    return pending;
  };
}

export const getModelsFromSDK = createModelCatalogLoader(
  () => import('@astreus-ai/astreus/llm/models')
);

export function getDefaultModel(provider: ProviderType): string | null {
  const defaults: Record<ProviderType, string | null> = {
    openai: 'gpt-4o',
    // The previous default is retired. Require a deliberate current selection.
    claude: null,
    gemini: 'gemini-pro',
    ollama: 'llama3',
  };
  return defaults[provider];
}

export function resolveModelSelection(model: string, catalog: ModelCatalog): ModelSelection {
  const provider = catalog.getProviderForModel(model);
  const localTag =
    provider === 'ollama' &&
    !model.includes('/') &&
    model.includes(':') &&
    catalog.models.ollama.includes(model.split(':')[0]);

  if (!provider || (!catalog.models[provider].includes(model) && !localTag)) {
    throw new Error(
      'Model is not supported by the installed SDK chat catalog. Use /model to choose.'
    );
  }
  return { provider, model };
}

export function resolveProviderSelection(
  provider: ProviderType,
  catalog: ModelCatalog
): ModelSelection {
  const model = getDefaultModel(provider);
  if (
    model &&
    catalog.models[provider].includes(model) &&
    catalog.getProviderForModel(model) === provider
  ) {
    return { provider, model };
  }
  return { provider, model: null };
}

export function resolveStartupSelection(
  catalog: ModelCatalog,
  env: { ASTREUS_PROVIDER?: string; ASTREUS_MODEL?: string }
): ModelSelection {
  const provider = env.ASTREUS_PROVIDER?.trim();
  const model = env.ASTREUS_MODEL?.trim();
  if (provider && !isProvider(provider)) {
    throw new Error('Invalid ASTREUS_PROVIDER. Use openai, claude, gemini, or ollama.');
  }
  if (model) {
    const selection = resolveModelSelection(model, catalog);
    if (provider && selection.provider !== provider) {
      throw new Error('ASTREUS_MODEL does not belong to ASTREUS_PROVIDER. Select a matching pair.');
    }
    return selection;
  }
  return resolveProviderSelection(
    provider && isProvider(provider) ? provider : DEFAULT_PROVIDER,
    catalog
  );
}
