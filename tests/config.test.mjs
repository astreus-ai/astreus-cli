import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as registry from '@astreus-ai/astreus/llm/models';
import {
  PROVIDERS,
  createModelCatalogLoader,
  getModelsFromSDK,
  resolveModelSelection,
  resolveProviderSelection,
  resolveStartupSelection,
} from '../build/compatibility-tests/config.mjs';

const catalog = await getModelsFromSDK();

test('catalog comes from the installed SDK and discovery is coalesced', async () => {
  let calls = 0;
  const load = createModelCatalogLoader(async () => {
    calls++;
    return registry;
  });
  const [first, second] = await Promise.all([load(), load()]);
  assert.equal(first, second);
  assert.equal(calls, 1);
  for (const provider of PROVIDERS) {
    assert.deepEqual(first.models[provider], registry.getModelsByProvider(provider));
  }
});

test('failed discovery is explicit, never cached as a fallback, and can recover', async () => {
  let calls = 0;
  const load = createModelCatalogLoader(async () => {
    if (++calls === 1) throw new Error('Module unavailable');
    return registry;
  });
  await assert.rejects(load(), /Could not load the installed SDK model catalog/);
  assert.deepEqual((await load()).models, catalog.models);
  assert.equal(calls, 2);
});

test('inconsistent registry routing is rejected rather than displayed as genuine inventory', async () => {
  const load = createModelCatalogLoader(async () => ({
    ...registry,
    getProviderForModel: () => null,
  }));
  await assert.rejects(load(), /No fallback models were selected/);
});

test('supported startup defaults remain provider-consistent', () => {
  assert.deepEqual(resolveStartupSelection(catalog, {}), { provider: 'openai', model: 'gpt-4o' });
  assert.deepEqual(resolveStartupSelection(catalog, { ASTREUS_PROVIDER: 'ollama' }), {
    provider: 'ollama',
    model: 'llama3',
  });
  assert.deepEqual(resolveStartupSelection(catalog, { ASTREUS_PROVIDER: 'gemini' }), {
    provider: 'gemini',
    model: 'gemini-pro',
  });
});

test('Claude requires an explicit current model at startup and on provider switch', () => {
  assert.deepEqual(resolveStartupSelection(catalog, { ASTREUS_PROVIDER: 'claude' }), {
    provider: 'claude',
    model: null,
  });
  assert.deepEqual(resolveProviderSelection('claude', catalog), {
    provider: 'claude',
    model: null,
  });
  assert.deepEqual(
    resolveStartupSelection(catalog, {
      ASTREUS_PROVIDER: 'claude',
      ASTREUS_MODEL: 'claude-sonnet-5',
    }),
    { provider: 'claude', model: 'claude-sonnet-5' }
  );
});

test('explicit model-only selection determines its actual adapter, including gateway routes', () => {
  for (const model of ['claude-sonnet-5', 'openrouter/free', 'llama3:8b']) {
    const expected = { provider: registry.getProviderForModel(model), model };
    assert.deepEqual(resolveStartupSelection(catalog, { ASTREUS_MODEL: model }), expected);
    assert.deepEqual(resolveModelSelection(model, catalog), expected);
  }
});

test('invalid providers, mismatched pairs, retired IDs, and non-chat IDs fail explicitly', () => {
  assert.throws(
    () => resolveStartupSelection(catalog, { ASTREUS_PROVIDER: 'invalid' }),
    /Invalid ASTREUS_PROVIDER/
  );
  assert.throws(
    () =>
      resolveStartupSelection(catalog, {
        ASTREUS_PROVIDER: 'ollama',
        ASTREUS_MODEL: 'gpt-4o',
      }),
    /does not belong/
  );
  for (const model of ['claude-sonnet-4-20250514', 'unknown-model', 'text-embedding-3-small']) {
    assert.throws(() => resolveModelSelection(model, catalog), /not supported/);
  }
});

test('missing defaults never silently select another model', () => {
  const unavailable = {
    ...catalog,
    models: {
      ...catalog.models,
      openai: catalog.models.openai.filter((id) => id !== 'gpt-4o'),
      ollama: [],
    },
  };
  assert.deepEqual(resolveProviderSelection('openai', unavailable), {
    provider: 'openai',
    model: null,
  });
  assert.deepEqual(resolveProviderSelection('ollama', unavailable), {
    provider: 'ollama',
    model: null,
  });
});
