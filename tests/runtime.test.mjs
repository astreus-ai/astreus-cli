import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { bindGraphToAgent, prepareRuntime } from '../build/compatibility-tests/runtime.mjs';
import { isApiKeyError, saveApiKey } from '../build/compatibility-tests/env.mjs';

// These are protocol fixtures on loopback, not replacements for SDK graph/task execution.
// All outbound fetches are guarded before importing or initializing the SDK.
test(
  'next real task uses the selected model and isolated native context without losing graph history',
  { timeout: 20000 },
  async () => {
    const requests = [];
    const signature = randomUUID();
    const updatedCredential = randomUUID();
    const privateProviderMessage = `provider-detail-${randomUUID()}`;
    let requireUpdatedCredential = false;
    let failureStatus = 0;
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const usedUpdatedCredential = request.headers.authorization === `Bearer ${updatedCredential}`;
      requests.push({ path: request.url, body, usedUpdatedCredential });
      response.setHeader('content-type', 'application/json');
      const status =
        failureStatus || (requireUpdatedCredential && !usedUpdatedCredential ? 401 : 0);
      if (status) {
        response.setHeader('x-should-retry', 'false');
        response.writeHead(status);
        response.end(JSON.stringify({ error: { message: privateProviderMessage } }));
        return;
      }
      if (request.url === '/v1/messages') {
        response.end(
          JSON.stringify({
            id: randomUUID(),
            type: 'message',
            role: 'assistant',
            model: body.model,
            content: [
              { type: 'thinking', thinking: 'Native archival reasoning', signature },
              { type: 'text', text: 'Native archival answer' },
            ],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 2, output_tokens: 1 },
          })
        );
      } else if (request.url === '/v1/chat/completions') {
        response.end(
          JSON.stringify({
            id: randomUUID(),
            object: 'chat.completion',
            created: 1,
            model: body.model,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Current model answer' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
          })
        );
      } else {
        response.writeHead(404);
        response.end(JSON.stringify({ error: 'Unexpected local endpoint' }));
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    process.env.OPENAI_BASE_URL = `${origin}/v1`;
    process.env.ANTHROPIC_BASE_URL = origin;
    process.env.OLLAMA_BASE_URL = origin;
    process.env.GEMINI_BASE_URL = origin;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input, options) => {
      const url = new URL(input instanceof Request ? input.url : input);
      assert.equal(url.origin, origin, 'External inference is forbidden in compatibility tests');
      return originalFetch(input, options);
    };
    let database;
    const agents = new Set();
    const graphs = new Set();
    try {
      const sdk = await import('@astreus-ai/astreus');
      database = await sdk.getDatabase();
      const now = new Date().toISOString();
      const session = {
        id: randomUUID(),
        graphId: '',
        name: 'Compatibility',
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      const first = await prepareRuntime(sdk, 'claude-sonnet-5', session, {
        agent: null,
        graph: null,
      });
      agents.add(first.agent);
      graphs.add(first.graph);
      const firstNode = first.graph.addTaskNode({
        prompt: 'First native turn',
        model: 'claude-sonnet-5',
        metadata: { useTools: true },
      });
      assert.equal((await first.graph.run()).success, true);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].path, '/v1/messages');
      assert.equal(requests[0].body.model, 'claude-sonnet-5');
      assert.ok(first.agent.getContext().some((message) => message.providerData));
      const archivedContext = structuredClone(first.agent.getContext());
      const graphId = first.graph.getGraph().id;
      const archivedNode = structuredClone(first.graph.getNode(firstNode));
      const usage = structuredClone(first.graph.getUsage());
      const log = structuredClone(first.graph.getExecutionLog());

      const switched = await prepareRuntime(sdk, 'gpt-4o', first.session, first);
      agents.add(switched.agent);
      graphs.add(switched.graph);
      assert.equal(switched.contextRestarted, true);
      assert.notEqual(switched.agent.id, first.agent.id);
      assert.equal(switched.graph.getGraph().id, graphId);
      assert.deepEqual(switched.graph.getNode(firstNode), archivedNode);
      assert.deepEqual(switched.graph.getUsage(), usage);
      assert.deepEqual(switched.graph.getExecutionLog(), log);
      assert.equal(switched.graph.lastNodeId, firstNode);
      const nextNode = switched.graph.addTaskNode({
        prompt: 'Next selected-model turn',
        model: 'gpt-4o',
        metadata: { useTools: true },
      });
      assert.equal(switched.graph.getNode(nextNode).agentId, switched.agent.id);
      assert.ok(
        switched.graph
          .getEdges()
          .some((edge) => edge.fromNodeId === firstNode && edge.toNodeId === nextNode)
      );
      assert.equal((await switched.graph.run()).success, true);
      assert.equal(requests.length, 2, 'Completed archival turns must not execute again');
      assert.equal(requests[1].path, '/v1/chat/completions');
      assert.equal(requests[1].body.model, 'gpt-4o');
      const sent = JSON.stringify(requests[1].body);
      assert.equal(sent.includes(signature), false);
      assert.equal(sent.includes('First native turn'), false);
      assert.equal(sent.includes('Native archival answer'), false);
      assert.deepEqual(first.agent.getContext(), archivedContext);
      assert.deepEqual(switched.graph.getNode(firstNode), archivedNode);
      assert.equal(switched.graph.getUsage().totalTokens, usage.totalTokens + 3);

      // Same-model credential recreation resumes only that model's persisted context.
      sdk.clearLLMInstances();
      const retry = await prepareRuntime(sdk, 'gpt-4o', switched.session, {
        agent: null,
        graph: switched.graph,
      });
      agents.add(retry.agent);
      graphs.add(retry.graph);
      assert.equal(retry.contextRestarted, false);
      assert.equal(retry.agent.id, switched.agent.id);
      assert.equal(retry.graph.getGraph().id, graphId);
      retry.graph.addTaskNode({ prompt: 'After credential recreation', model: 'gpt-4o' });
      assert.equal((await retry.graph.run()).success, true);
      assert.equal(requests.length, 3);
      assert.equal(requests[2].body.model, 'gpt-4o');
      assert.equal(JSON.stringify(requests[2].body).includes(signature), false);

      // Returning to an earlier native model also starts an explicit fresh boundary.
      const returned = await prepareRuntime(sdk, 'claude-sonnet-5', retry.session, retry);
      agents.add(returned.agent);
      graphs.add(returned.graph);
      assert.notEqual(returned.agent.id, first.agent.id);
      assert.equal(returned.contextRestarted, true);
      returned.graph.addTaskNode({ prompt: 'Return to native model', model: 'claude-sonnet-5' });
      assert.equal((await returned.graph.run()).success, true);
      assert.equal(requests.length, 4);
      assert.equal(requests[3].path, '/v1/messages');
      assert.equal(requests[3].body.model, 'claude-sonnet-5');
      assert.equal(JSON.stringify(requests[3].body).includes(signature), false);
      assert.equal(JSON.stringify(requests[3].body).includes('First native turn'), false);
      assert.deepEqual(first.agent.getContext(), archivedContext);

      returned.graph.setStatus('running');
      assert.throws(
        () => bindGraphToAgent(sdk, returned.graph, first.agent),
        /Wait for the current/
      );
      returned.graph.setStatus('completed');
      returned.graph.addTaskNode({ prompt: 'Unfinished old-model task', model: 'claude-sonnet-5' });
      await assert.rejects(
        prepareRuntime(sdk, 'gpt-4o', returned.session, returned),
        /unfinished tasks/
      );
      assert.equal(requests.length, 4);

      // The real SDK sanitizes rejected credentials to HTTP 401. Recover using
      // the same failed node, without relying on private provider response text.
      const auth = await prepareRuntime(
        sdk,
        'gpt-4o',
        { ...session, id: randomUUID() },
        { agent: null, graph: null }
      );
      agents.add(auth.agent);
      graphs.add(auth.graph);
      requireUpdatedCredential = true;
      const authNode = auth.graph.addTaskNode({ prompt: 'Recover this turn', model: 'gpt-4o' });
      const rejected = await auth.graph.run();
      assert.equal(rejected.success, false);
      const authError = Object.values(rejected.errors).filter(Boolean).join(', ');
      assert.match(authError, /HTTP 401/);
      assert.equal(authError.includes(privateProviderMessage), false);
      assert.equal(isApiKeyError(authError), true);
      assert.equal(requests.length, 5);

      saveApiKey('openai', updatedCredential);
      sdk.clearLLMInstances();
      const recovered = await prepareRuntime(sdk, 'gpt-4o', auth.session, {
        agent: null,
        graph: auth.graph,
      });
      agents.add(recovered.agent);
      graphs.add(recovered.graph);
      assert.equal(recovered.contextRestarted, false);
      assert.equal(recovered.graph.getGraph().id, auth.graph.getGraph().id);
      assert.equal((await recovered.graph.run()).success, true);
      assert.equal(requests.length, 6);
      assert.equal(requests[5].usedUpdatedCredential, true);
      assert.equal(recovered.graph.getNodes().length, 1);
      assert.equal(recovered.graph.getNode(authNode).status, 'completed');

      recovered.graph.addTaskNode({ prompt: 'Non-auth failure', model: 'gpt-4o' });
      for (const status of [403, 429, 500]) {
        failureStatus = status;
        const failure = await recovered.graph.run();
        assert.equal(failure.success, false);
        const error = Object.values(failure.errors).filter(Boolean).join(', ');
        assert.match(error, new RegExp(`HTTP ${status}`));
        assert.equal(error.includes(privateProviderMessage), false);
        assert.equal(isApiKeyError(error), false);
      }
    } finally {
      for (const graph of graphs) await graph.destroy();
      for (const agent of agents) await agent.destroy();
      if (database) await database.disconnect();
      globalThis.fetch = originalFetch;
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
);

test('credential classification respects sanitized status and local configuration errors', () => {
  for (const message of [
    'Request failed (HTTP 401)',
    'Graph task failed: request rejected (http 401)',
    'OPENAI_API_KEY is required',
    'API key is not configured',
  ]) {
    assert.equal(isApiKeyError(message), true);
  }
  for (const message of [
    'Request failed (HTTP 400)',
    'Request failed (HTTP 403)',
    'Request failed (HTTP 404)',
    'API key quota exhausted (HTTP 429)',
    'API_KEY request failed (HTTP 500)',
    'Request failed (HTTP 503)',
    'Request failed (HTTP 4010)',
    'Request 401 could not be completed',
    'Model is not supported',
  ]) {
    assert.equal(isApiKeyError(message), false);
  }
});
