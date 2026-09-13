import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import {
  Header,
  Messages,
  InputArea,
  Attachments,
  ModelModal,
  ProviderModal,
  ApiKeyModal,
  SettingsModal,
  SessionModal,
  CommandSuggestions,
  getFilteredCommands,
} from './components';
import { useHistory } from './hooks';
import {
  PROVIDERS,
  DEFAULT_PROVIDER,
  getModelsFromSDK,
  isProvider,
  resolveModelSelection,
  resolveProviderSelection,
  resolveStartupSelection,
  type ModelCatalog,
  type ModelSelection,
} from './config';
import { prepareRuntime, type SDK } from './runtime';
import type { Agent, Graph } from '@astreus-ai/astreus';
import { saveApiKey, isApiKeyError } from './utils/env';
import {
  getOrCreateCurrentSession,
  saveSession,
  loadSession,
  createSession,
  type Session,
} from './utils/sessions';
import { setWorkingDirectory, getWorkingDirectory } from './tools/file-tools';
import {
  createAttachment,
  parsePathFromInput,
  getAttachmentPreview,
  attachmentsToAgentFormat,
  type Attachment,
} from './utils/attachments';
import type { Message, ModalType } from './types';

const VERSION = '0.6.0';

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [terminalWidth, setTerminalWidth] = useState(stdout?.columns || 80);

  // Handle terminal resize
  useEffect(() => {
    if (!stdout) return;

    const handleResize = () => {
      setTerminalWidth(stdout.columns || 80);
    };

    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  const cols = terminalWidth - 4;
  const line = '-'.repeat(cols);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [selectIndex, setSelectIndex] = useState(0);
  const [selection, setSelection] = useState<ModelSelection>({
    provider: DEFAULT_PROVIDER,
    model: null,
  });
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const { provider } = selection;
  const model = selection.model || '';
  const models = catalog?.models[provider] || [];
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [_isThinking, setIsThinking] = useState(false);
  const [cmdSuggestionIndex, setCmdSuggestionIndex] = useState(0);
  const [currentSession, setSession] = useState<Session | null>(null);
  const currentSessionRef = useRef<Session | null>(null);
  const setCurrentSession = useCallback((session: Session) => {
    currentSessionRef.current = session;
    setSession(session);
  }, []);
  const [tokenCount, setTokenCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentToolCall, setCurrentToolCall] = useState<{
    name: string;
    status: 'running' | 'done';
    result?: string;
  } | null>(null);
  const [_executedTools, setExecutedTools] = useState<Array<{ name: string; result?: string }>>([]);
  const streamingRef = useRef('');
  const streamingDoneRef = useRef(false);
  const interruptedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const retryMessageRef = useRef<string | null>(null);
  const retryTaskRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const turnCountRef = useRef(0);

  const showCommandSuggestions = input.startsWith('/') && !modal && !isLoading && !isInitializing;
  const filteredCommands = showCommandSuggestions ? getFilteredCommands(input) : [];

  // Reset suggestion index when input changes
  useEffect(() => {
    setCmdSuggestionIndex(0);
  }, [input]);

  // Detect dropped/pasted file paths and auto-attach
  useEffect(() => {
    if (!input || input.startsWith('/')) return;

    const detectedPath = parsePathFromInput(input);
    if (detectedPath) {
      const att = createAttachment(detectedPath);
      if (att) {
        setAttachments((prev) => {
          // Avoid duplicates
          if (prev.some((a) => a.path === att.path)) return prev;
          return [...prev, att];
        });
        // If it's a folder, set it as the working directory
        if (att.type === 'folder') {
          setWorkingDirectory(att.path);
        }
        setInput(''); // Clear the path from input
      }
    }
  }, [input]);

  const agentRef = useRef<Agent | null>(null);
  const sdkRef = useRef<SDK | null>(null);

  const history = messages.filter((m) => m.type === 'user').map((m) => m.content);
  const { navigateUp, navigateDown, resetHistory } = useHistory({
    history,
    input,
    setInput,
  });

  const cwd = process.cwd().replace(process.env.HOME || '', '~');

  // Initialize the genuine catalog before creating an agent or choosing a model.
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Load or create session
        const session = getOrCreateCurrentSession();
        if (mounted) {
          setCurrentSession(session);
          if (session.messages.length > 0) {
            setMessages(session.messages);
          }
          turnCountRef.current = Math.floor(session.messages.length / 2);
        }

        const loadedCatalog = await getModelsFromSDK();
        if (!mounted) return;
        setCatalog(loadedCatalog);
        const initialSelection = resolveStartupSelection(loadedCatalog, {
          ASTREUS_PROVIDER: process.env.ASTREUS_PROVIDER,
          ASTREUS_MODEL: process.env.ASTREUS_MODEL,
        });
        setSelection(initialSelection);
        if (!initialSelection.model) {
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}`,
              type: 'system',
              content:
                'This provider has no supported default. Choose a current model explicitly with /model or ASTREUS_MODEL.',
            },
          ]);
          return;
        }

        const sdk = await import('@astreus-ai/astreus');
        if (!mounted) return;
        sdkRef.current = sdk;
        const runtime = await prepareRuntime(sdk, initialSelection.model, session, {
          agent: null,
          graph: null,
        });
        if (!mounted) return;
        const updatedSession = { ...runtime.session, provider: initialSelection.provider };
        saveSession(updatedSession);
        setCurrentSession(updatedSession);
        agentRef.current = runtime.agent;
        graphRef.current = runtime.graph;
        if (runtime.contextRestarted) {
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}`,
              type: 'system',
              content:
                'A fresh conversation context is active for this model. Previous messages and graph records are retained, but are not sent to the new agent.',
            },
          ]);
        }
      } catch (e: unknown) {
        if (mounted) {
          const msg = e instanceof Error ? e.message : String(e);
          // Check if it's an API key error during init
          if (isApiKeyError(msg)) {
            setModal('apikey');
          } else {
            setMessages((prev) => [
              ...prev,
              { id: `${Date.now()}`, type: 'system', content: `Error: ${msg}` },
            ]);
          }
        }
      } finally {
        if (mounted) setIsInitializing(false);
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, []);

  const addMessage = useCallback(
    (type: Message['type'], content: string) => {
      const newMessage: Message = { id: `${Date.now()}-${Math.random()}`, type, content };
      setMessages((prev) => {
        const updated = [...prev, newMessage];
        // Save to session (only user and assistant messages)
        const session = currentSessionRef.current;
        if (session && (type === 'user' || type === 'assistant')) {
          const sessionMessages = updated.filter(
            (m) => m.type === 'user' || m.type === 'assistant'
          );
          const updatedSession = { ...session, messages: sessionMessages };
          saveSession(updatedSession);
          currentSessionRef.current = updatedSession;
        }
        return updated;
      });
      resetHistory();
    },
    [resetHistory, currentSession]
  );

  const openSelector = useCallback(
    async (kind: 'model' | 'provider') => {
      try {
        const loadedCatalog = await getModelsFromSDK();
        setCatalog(loadedCatalog);
        if (kind === 'model' && loadedCatalog.models[provider].length === 0) {
          throw new Error('The installed SDK has no chat models for this provider.');
        }
        setSelectIndex(
          Math.max(
            0,
            kind === 'model'
              ? loadedCatalog.models[provider].indexOf(model)
              : PROVIDERS.indexOf(provider)
          )
        );
        setModal(kind);
      } catch (error: unknown) {
        addMessage('system', error instanceof Error ? error.message : String(error));
      }
    },
    [provider, model, addMessage]
  );

  const changeSelection = useCallback(
    async (kind: 'model' | 'provider', value: string) => {
      try {
        if (submittingRef.current || graphRef.current?.getStatus() === 'running') {
          throw new Error('Wait for the current execution to finish before changing models.');
        }
        const loadedCatalog = await getModelsFromSDK();
        if (kind === 'provider' && !isProvider(value)) {
          throw new Error('Unknown provider. Use openai, claude, gemini, or ollama.');
        }
        const next =
          kind === 'provider' && isProvider(value)
            ? resolveProviderSelection(value, loadedCatalog)
            : resolveModelSelection(value, loadedCatalog);
        setCatalog(loadedCatalog);
        setSelection(next);
        setSelectIndex(0);
        setModal(null);
        addMessage('system', `Provider: ${next.provider}\nModel: ${next.model || 'not selected'}`);
        if (!next.model) {
          addMessage(
            'system',
            'Choose a current model explicitly with /model. No replacement default was selected.'
          );
          if (loadedCatalog.models[next.provider].length > 0) setModal('model');
        }
      } catch (error: unknown) {
        addMessage('system', error instanceof Error ? error.message : String(error));
      }
    },
    [addMessage]
  );

  const handleSubmit = useCallback(
    async (value: string) => {
      if (modal || isInitializing || isLoading || submittingRef.current) return;

      let finalValue = value;

      // If command suggestions are visible and a partial command is entered,
      // use the selected suggestion
      if (value.startsWith('/') && !value.includes(' ')) {
        const currentFilteredCommands = getFilteredCommands(value);
        if (currentFilteredCommands.length > 0) {
          const exactMatch = currentFilteredCommands.find(
            (cmd) =>
              `/${cmd.name}` === value.toLowerCase() ||
              cmd.aliases?.some((a) => `/${a}` === value.toLowerCase())
          );
          // If not an exact match, use selected suggestion
          if (!exactMatch) {
            const selectedCmd = currentFilteredCommands[cmdSuggestionIndex];
            if (selectedCmd) {
              finalValue = `/${selectedCmd.name}`;
            }
          }
        }
      }

      const trimmed = finalValue.trim();
      if (!trimmed) return;

      setInput('');
      resetHistory();
      setCmdSuggestionIndex(0);

      if (trimmed === '?') {
        setShowShortcuts((s) => !s);
        return;
      }
      setShowShortcuts(false);

      if (trimmed.startsWith('/')) {
        const [cmd, ...args] = trimmed.slice(1).split(' ');
        switch (cmd) {
          case 'model':
            if (args[0]) await changeSelection('model', args[0]);
            else await openSelector('model');
            return;
          case 'provider':
            if (args[0]) await changeSelection('provider', args[0]);
            else await openSelector('provider');
            return;
          case 'clear':
            setMessages([]);
            agentRef.current?.clearContext?.();
            if (currentSession) {
              saveSession({ ...currentSession, messages: [] });
            }
            return;
          case 'sessions':
          case 'session':
            setModal('sessions');
            return;
          case 'new':
            console.clear();
            const newSession = createSession();
            setCurrentSession(newSession);
            setMessages([]);
            agentRef.current = null;
            graphRef.current = null;
            retryTaskRef.current = null;
            turnCountRef.current = 0;
            setExecutedTools([]);
            addMessage('system', `New session: ${newSession.name}`);
            return;
          case 'settings':
            setModal('settings');
            return;
          case 'attach':
          case 'add':
          case 'a':
            if (args[0]) {
              const path = args.join(' ');
              const att = createAttachment(path);
              if (att) {
                setAttachments((prev) => [...prev, att]);
                // If it's a folder, set it as the working directory for file tools
                if (att.type === 'folder') {
                  setWorkingDirectory(att.path);
                  addMessage(
                    'system',
                    `Attached: ${getAttachmentPreview(att)}\nWorking directory set to: ${att.path}`
                  );
                } else {
                  addMessage('system', `Attached: ${getAttachmentPreview(att)}`);
                }
              } else {
                addMessage('system', `File not found: ${path}`);
              }
            } else {
              addMessage('system', 'Usage: /attach <path>');
            }
            return;
          case 'attachments':
            if (attachments.length === 0) {
              addMessage('system', 'No attachments');
            } else {
              const list = attachments
                .map((a, i) => `${i + 1}. ${getAttachmentPreview(a)}`)
                .join('\n');
              addMessage('system', `Attachments:\n${list}`);
            }
            return;
          case 'clear-attachments':
          case 'ca':
            setAttachments([]);
            addMessage('system', 'Attachments cleared');
            return;
          case 'pwd':
            addMessage('system', `Working directory: ${getWorkingDirectory()}`);
            return;
          case 'tools':
            if (agentRef.current?.getTools) {
              const tools = agentRef.current.getTools();
              if (tools && tools.length > 0) {
                const toolList = tools.map((t) => `• ${t.name}: ${t.description}`).join('\n');
                addMessage('system', `Registered tools (${tools.length}):\n${toolList}`);
              } else {
                addMessage('system', 'No tools registered');
              }
            } else if (agentRef.current?.listPlugins) {
              const plugins = agentRef.current.listPlugins();
              if (plugins && plugins.length > 0) {
                const pluginInfo = plugins
                  .map((p) => {
                    const toolNames = p.tools?.map((t) => t.name).join(', ') || 'none';
                    return `• ${p.name} v${p.version}: ${toolNames}`;
                  })
                  .join('\n');
                addMessage('system', `Registered plugins:\n${pluginInfo}`);
              } else {
                addMessage('system', 'No plugins registered');
              }
            } else {
              addMessage('system', 'Agent not ready or tools not supported');
            }
            return;
          case 'status':
          case 'graph':
            if (graphRef.current) {
              const nodes = graphRef.current.getNodes?.() || [];
              const status = graphRef.current.getStatus?.() || 'idle';
              const usage = graphRef.current.getUsage?.();
              let info = `Session: ${currentSession?.name || 'none'}\n`;
              info += `Graph Status: ${status}\n`;
              info += `Nodes: ${nodes.length}\n`;
              info += `Turns: ${turnCountRef.current}\n`;
              info += `Working directory: ${getWorkingDirectory()}`;
              if (usage?.totalTokens) {
                info += `\nTotal tokens: ${usage.totalTokens}`;
              }
              addMessage('system', info);
            } else {
              addMessage(
                'system',
                `Session: ${currentSession?.name || 'none'}\nGraph: not initialized\nWorking directory: ${getWorkingDirectory()}`
              );
            }
            return;
          case 'help':
            addMessage(
              'system',
              '/model /provider /sessions /new /attach /clear-attachments /tools /graph /settings /clear /exit'
            );
            return;
          case 'exit':
          case 'quit':
          case 'q':
            exit();
            return;
          default:
            addMessage('system', `Unknown: ${cmd}`);
            return;
        }
      }

      if (!catalog || !model) {
        addMessage(
          'system',
          'No validated model is selected. Use /model or /provider before sending a message.'
        );
        return;
      }
      if (!currentSession) {
        addMessage('system', 'No session is available. Use /new before sending a message.');
        return;
      }
      submittingRef.current = true;

      // Build message - keep user message clean for history
      const currentAttachments = [...attachments];
      const workingDir = getWorkingDirectory();

      // Display message is just the user's input (clean for history)
      addMessage('user', trimmed);
      // Clear attachments after sending (they're message-specific, but working directory persists)
      setAttachments([]);
      setIsLoading(true);
      setIsThinking(true);
      setStreamingContent('');
      setTokenCount(0);
      setElapsedTime(0);
      setExecutedTools([]);

      // Start timer
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      try {
        const validated = resolveModelSelection(model, catalog);
        if (validated.provider !== provider) throw new Error('Provider and model do not match.');
        const sdk = sdkRef.current || (await import('@astreus-ai/astreus'));
        sdkRef.current = sdk;
        const runtime = await prepareRuntime(sdk, model, currentSession, {
          agent: agentRef.current,
          graph: graphRef.current,
        });
        const updatedSession = {
          ...runtime.session,
          provider,
          messages: currentSessionRef.current?.messages || currentSession.messages,
        };
        saveSession(updatedSession);
        setCurrentSession(updatedSession);
        // Commit the pair only after both have been prepared successfully.
        agentRef.current = runtime.agent;
        graphRef.current = runtime.graph;
        if (runtime.contextRestarted) {
          addMessage(
            'system',
            'A fresh conversation context is active for this model. Previous messages and graph records are retained, but are not sent to the new agent.'
          );
        }

        streamingRef.current = '';
        streamingDoneRef.current = false;
        interruptedRef.current = false;

        // Prepare attachments for the agent
        const agentAttachments =
          currentAttachments.length > 0 ? attachmentsToAgentFormat(currentAttachments) : undefined;

        // Build prompt with working directory and attachments
        // Note: Conversation history is handled by SDK's memory/context system via loadGraphContext()
        let prompt = trimmed;

        // Add working directory context
        if (workingDir !== process.cwd()) {
          prompt = `[IMPORTANT: Working directory is set to: ${workingDir}. All file operations should be relative to this directory or use absolute paths within it.]\n\n${prompt}`;
        }

        if (agentAttachments && agentAttachments.length > 0) {
          const attachmentList = agentAttachments
            .map((a) => `- ${a.name || a.path} (${a.type})`)
            .join('\n');
          prompt = `${prompt}\n\n[Attached files:\n${attachmentList}]`;
        }

        // Use Graph system for conversation management
        if (graphRef.current) {
          // Add task node to graph
          const nodeId =
            retryTaskRef.current ||
            graphRef.current.addTaskNode({
              name: `Turn-${turnCountRef.current + 1}`,
              model,
              prompt: prompt,
              stream: true,
              metadata: {
                useTools: true, // Enable tool execution
                ...(agentAttachments ? { attachments: JSON.stringify(agentAttachments) } : {}),
                workingDirectory: workingDir,
              },
            });

          retryTaskRef.current = null;

          // Run graph with streaming
          const result = await graphRef.current.run({
            stream: true,
            timeout: 300000, // 5 minutes for complex tasks
            onChunk: (chunk: string) => {
              if (streamingDoneRef.current || interruptedRef.current) return;
              streamingRef.current += chunk;
              const currentContent = streamingRef.current;
              setIsThinking(false);
              setStreamingContent(currentContent);
              setTokenCount(Math.ceil(currentContent.length / 4));
            },
            onToolCall: (
              toolName: string,
              _args: Record<string, unknown>,
              status: 'start' | 'end',
              result?: string
            ) => {
              // Convert tool_name to "Tool Name" format
              const _displayName = toolName
                .split('_')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');

              if (status === 'start') {
                // Tool marker - will be shown inline, no newlines needed
                setCurrentToolCall({ name: toolName, status: 'running' });
                setIsThinking(false);
              } else {
                // Tool completed - just update state, don't pollute streaming content
                setCurrentToolCall(null);
                setExecutedTools((prev) => [...prev, { name: toolName, result }]);
              }
            },
          });

          // Check if interrupted
          if (interruptedRef.current) return;

          // Mark streaming as done
          streamingDoneRef.current = true;

          // Get response from result
          let finalResponse = streamingRef.current;

          // Check for errors in result (use result.success not result.status)
          if (result && !result.success && result.errors) {
            const errorMsgs = Object.values(result.errors).filter(Boolean);
            if (errorMsgs.length > 0) {
              const errorStr = errorMsgs.join(', ');

              // Check if it's an API key error - trigger modal instead of showing error
              if (isApiKeyError(errorStr)) {
                streamingRef.current = '';
                setStreamingContent('');
                setIsThinking(false);
                retryTaskRef.current = nodeId;
                setPendingMessage(trimmed);
                setModal('apikey');
                setMessages((prev) => prev.slice(0, -1)); // Remove the user message
                return;
              }

              if (finalResponse) {
                finalResponse += `\n\n[Error: ${errorStr}]`;
              } else {
                finalResponse = `Error: ${errorStr}`;
              }
            }
          }

          // If no streaming content, try to get from result.results
          if (!finalResponse && result?.results) {
            const nodeResult = result.results[nodeId] || Object.values(result.results)[0];
            if (nodeResult) {
              try {
                const parsed = typeof nodeResult === 'string' ? JSON.parse(nodeResult) : nodeResult;
                finalResponse = parsed.response || parsed.content || String(nodeResult);
              } catch {
                finalResponse = String(nodeResult);
              }
            }
          }

          streamingRef.current = '';
          setStreamingContent('');
          setIsThinking(false);
          turnCountRef.current++;

          if (finalResponse) {
            addMessage('assistant', finalResponse);
          } else {
            addMessage('system', `No response from model`);
          }
        }
      } catch (e: unknown) {
        // If interrupted, don't show error
        if (interruptedRef.current) return;

        streamingDoneRef.current = true;
        streamingRef.current = '';
        setStreamingContent('');
        setIsThinking(false);
        const msg = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack || '' : '';
        if (isApiKeyError(msg)) {
          setPendingMessage(trimmed);
          setModal('apikey');
          setMessages((prev) => prev.slice(0, -1));
        } else {
          const errorDetail = process.env.DEBUG ? `Error: ${msg}\n${stack}` : `Error: ${msg}`;
          addMessage('system', errorDetail);
        }
      } finally {
        submittingRef.current = false;
        setIsLoading(false);
        setCurrentToolCall(null);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    },
    [
      modal,
      isInitializing,
      isLoading,
      catalog,
      attachments,
      changeSelection,
      openSelector,
      model,
      provider,
      addMessage,
      exit,
      resetHistory,
      cmdSuggestionIndex,
      currentSession,
    ]
  );

  const handleApiKeySubmit = useCallback(
    async (key: string) => {
      if (!key.trim()) {
        setModal(null);
        setPendingMessage(null);
        retryTaskRef.current = null;
        return;
      }
      saveApiKey(provider, key.trim());
      addMessage('system', 'API key saved to .env');
      setApiKeyInput('');
      setModal(null);

      // Recreate and rebind together on the next turn, even after an init error.
      sdkRef.current?.clearLLMInstances();
      agentRef.current = null;
      if (pendingMessage) {
        retryMessageRef.current = pendingMessage;
        setPendingMessage(null);
      }
    },
    [provider, pendingMessage, addMessage]
  );

  useEffect(() => {
    if (!modal && !isLoading && retryMessageRef.current) {
      const message = retryMessageRef.current;
      retryMessageRef.current = null;
      void handleSubmit(message);
    }
  }, [modal, isLoading, handleSubmit]);

  // Handle interrupt
  const handleInterrupt = useCallback(() => {
    if (isLoading) {
      interruptedRef.current = true;
      streamingDoneRef.current = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const partial = streamingRef.current;
      streamingRef.current = '';
      setStreamingContent('');
      setIsThinking(false);
      setIsLoading(false);
      if (partial) {
        addMessage('assistant', partial + '\n\n[Interrupted]');
      } else {
        addMessage('system', 'Interrupted');
      }
    }
  }, [isLoading, addMessage]);

  // Handle session selection
  const handleSessionSelect = useCallback(async (sessionId: string) => {
    const session = loadSession(sessionId);
    if (session) {
      setCurrentSession(session);
      setMessages(session.messages);
      turnCountRef.current = Math.floor(session.messages.length / 2);

      // Keep the previous agent's native transcript archived. The next turn
      // restores this session's own agent and graph through prepareRuntime.
      agentRef.current = null;
      graphRef.current = null;
      retryTaskRef.current = null;
    }
    setModal(null);
  }, []);

  // Handle new session from modal
  const handleNewSession = useCallback(async (sessionId: string) => {
    const session = loadSession(sessionId);
    if (session) {
      // Clear terminal screen
      console.clear();

      setCurrentSession(session);
      setMessages([]);
      turnCountRef.current = 0;

      agentRef.current = null;
      graphRef.current = null;
      retryTaskRef.current = null;
    }
    setModal(null);
  }, []);

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      exit();
      return;
    }

    // Escape to interrupt during loading
    if (key.escape && isLoading) {
      handleInterrupt();
      return;
    }

    // Settings modal handles its own input
    if (modal === 'settings') {
      return;
    }

    // Sessions modal handles its own input
    if (modal === 'sessions') {
      return;
    }

    if (modal === 'apikey') {
      if (key.escape) {
        setModal(null);
        setApiKeyInput('');
        setPendingMessage(null);
        retryTaskRef.current = null;
      }
      return;
    }

    if (modal) {
      const options = modal === 'model' ? models : PROVIDERS;
      if (key.escape) {
        setModal(null);
        return;
      }
      if (options.length === 0) return;
      if (key.upArrow) {
        setSelectIndex((i) => (i > 0 ? i - 1 : options.length - 1));
        return;
      }
      if (key.downArrow) {
        setSelectIndex((i) => (i < options.length - 1 ? i + 1 : 0));
        return;
      }
      if (key.return) {
        const selected = options[selectIndex];
        if (selected) void changeSelection(modal, selected);
        return;
      }
      return;
    }

    // Command suggestions navigation
    if (showCommandSuggestions && filteredCommands.length > 0) {
      if (key.upArrow) {
        setCmdSuggestionIndex((i) => (i > 0 ? i - 1 : filteredCommands.length - 1));
        return;
      }
      if (key.downArrow) {
        setCmdSuggestionIndex((i) => (i < filteredCommands.length - 1 ? i + 1 : 0));
        return;
      }
      if (key.tab) {
        const cmd = filteredCommands[cmdSuggestionIndex];
        if (cmd) {
          setInput(`/${cmd.name}`);
          setCmdSuggestionIndex(0);
        }
        return;
      }
    }

    // History navigation (only when not showing command suggestions)
    if (!showCommandSuggestions) {
      if (key.upArrow && history.length > 0) {
        navigateUp();
        return;
      }
      if (key.downArrow) {
        navigateDown();
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        version={VERSION}
        model={model || 'not selected'}
        provider={provider}
        cwd={cwd}
        sessionName={currentSession?.name}
      />

      <Messages messages={messages} streamingContent={streamingContent} />

      <Attachments attachments={attachments} />

      <InputArea
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        isInitializing={isInitializing}
        isStreaming={!!streamingContent}
        modal={modal}
        line={line}
        elapsedTime={elapsedTime}
        tokenCount={tokenCount}
        currentTool={currentToolCall?.name}
      />

      {showCommandSuggestions && filteredCommands.length > 0 && (
        <CommandSuggestions filter={input} selectedIndex={cmdSuggestionIndex} />
      )}

      {showShortcuts && (
        <Box marginTop={1}>
          <Text>
            <Text color="cyan">/model</Text> <Text color="cyan">/provider</Text>{' '}
            <Text color="cyan">/sessions</Text> <Text color="cyan">/new</Text>{' '}
            <Text color="cyan">/settings</Text> <Text color="cyan">/clear</Text>{' '}
            <Text color="cyan">/exit</Text>
          </Text>
        </Box>
      )}

      {modal === 'model' && (
        <ModelModal models={models} currentModel={model} selectIndex={selectIndex} />
      )}

      {modal === 'provider' && (
        <ProviderModal providers={PROVIDERS} currentProvider={provider} selectIndex={selectIndex} />
      )}

      {modal === 'apikey' && (
        <ApiKeyModal
          provider={provider}
          value={apiKeyInput}
          onChange={setApiKeyInput}
          onSubmit={handleApiKeySubmit}
        />
      )}

      {modal === 'settings' && (
        <SettingsModal onClose={() => setModal(null)} onSave={(msg) => addMessage('system', msg)} />
      )}

      {modal === 'sessions' && (
        <SessionModal
          currentSessionId={currentSession?.id || null}
          onSelect={handleSessionSelect}
          onNew={handleNewSession}
          onClose={() => setModal(null)}
        />
      )}
    </Box>
  );
}
