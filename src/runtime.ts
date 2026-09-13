import { randomUUID } from 'node:crypto';
import type { Agent, Graph } from '@astreus-ai/astreus';
import { fileToolsPlugin } from './tools/file-tools';
import { ASTREUS_SYSTEM_PROMPT } from './prompts/system-prompt';
import type { Session } from './utils/sessions';

export type SDK = typeof import('@astreus-ai/astreus');

export interface Runtime {
  agent: Agent;
  graph: Graph;
}

export function bindGraphToAgent(sdk: Pick<SDK, 'Graph'>, graph: Graph, agent: Agent): Graph {
  if (graph.getStatus() === 'running') {
    throw new Error('Wait for the current graph execution to finish before changing models.');
  }
  const rebound = new sdk.Graph(graph.getGraph().config, agent);
  // Persistence does not retain runtime usage/logs. Transfer the public graph
  // state without resetting its identity, archival nodes, accounting, or links.
  Object.assign(rebound.getGraph(), graph.getGraph(), { defaultAgentId: agent.id });
  rebound.lastNodeId = graph.lastNodeId;
  return rebound;
}

export async function prepareRuntime(
  sdk: SDK,
  model: string,
  session: Session,
  current: { agent: Agent | null; graph: Graph | null }
): Promise<Runtime & { session: Session; contextRestarted: boolean }> {
  let previousGraph = current.graph;
  if (previousGraph && previousGraph.getGraph().id !== session.graphId) {
    throw new Error('The active graph does not belong to this session. Reopen the session.');
  }
  if (!previousGraph && session.graphId) {
    previousGraph = await sdk.Graph.findById(session.graphId);
  }
  if (previousGraph?.getStatus() === 'running') {
    throw new Error('Wait for the current graph execution to finish before changing models.');
  }
  if (
    current.agent?.config.model === model &&
    current.agent.name === session.agentName &&
    current.graph &&
    previousGraph
  ) {
    return { agent: current.agent, graph: previousGraph, session, contextRestarted: false };
  }

  const resumeContext = session.model === model && Boolean(session.agentName);
  if (!resumeContext && previousGraph?.getNodes().some((node) => node.status !== 'completed')) {
    throw new Error(
      'This graph has unfinished tasks. Use /new before changing its model so earlier tasks are not replayed with a different model.'
    );
  }
  // Names identify persisted agents and their native transcripts. A model switch
  // must never reload another model's signed blocks or translate them into text.
  const agentName =
    (resumeContext && session.agentName) || `astreus-cli-${session.id}-${randomUUID()}`;
  const agent = await sdk.Agent.create({
    name: agentName,
    model,
    systemPrompt: ASTREUS_SYSTEM_PROMPT,
    useTools: true,
    memory: true,
  });
  await agent.registerPlugin(fileToolsPlugin);

  let graph: Graph;
  if (previousGraph) {
    graph = bindGraphToAgent(sdk, previousGraph, agent);
  } else {
    graph = new sdk.Graph(
      {
        name: session.name || 'Chat Session',
        description: 'Astreus CLI chat session',
        maxConcurrency: 1,
        autoLink: true,
        timeout: 300000,
      },
      agent
    );
    await graph.save();
  }

  const graphId = graph.getGraph().id;
  if (!graphId) throw new Error('Session graph has no persisted identity.');
  const contextRestarted =
    !resumeContext && (session.messages.length > 0 || graph.getNodes().length > 0);
  return {
    agent,
    graph,
    session: { ...session, graphId, agentName, model },
    contextRestarted,
  };
}
