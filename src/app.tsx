import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { Header, Messages, InputArea, Attachments, ModelModal, ProviderModal, ApiKeyModal, SettingsModal, SessionModal, CommandSuggestions, getFilteredCommands } from "./components";
import { useHistory } from "./hooks";
import { PROVIDERS, getModelsFromSDK, getDefaultModel } from "./config";
import { saveApiKey, isApiKeyError } from "./utils/env";
import { getOrCreateCurrentSession, saveSession, loadSession, createSession, type Session } from "./utils/sessions";
import { fileToolsPlugin, setWorkingDirectory, getWorkingDirectory } from "./tools/file-tools";
import { ASTREUS_SYSTEM_PROMPT } from "./prompts/system-prompt";
import { createAttachment, parsePathFromInput, getAttachmentPreview, attachmentsToAgentFormat, type Attachment } from "./utils/attachments";
import type { Message, ModalType, ProviderType } from "./types";


const VERSION = "0.5.37";

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

    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  const cols = terminalWidth - 4;
  const line = "-".repeat(cols);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [selectIndex, setSelectIndex] = useState(0);
  const [provider, setProvider] = useState<ProviderType>(
    (process.env.ASTREUS_PROVIDER as ProviderType) || "openai"
  );
  const [model, setModel] = useState(process.env.ASTREUS_MODEL || "gpt-4o");
  const [models, setModels] = useState<string[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [cmdSuggestionIndex, setCmdSuggestionIndex] = useState(0);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentToolCall, setCurrentToolCall] = useState<{ name: string; status: 'running' | 'done'; result?: string } | null>(null);
  const [executedTools, setExecutedTools] = useState<Array<{ name: string; result?: string }>>([]);
  const streamingRef = useRef("");
  const streamingDoneRef = useRef(false);
  const interruptedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const graphRef = useRef<any>(null);
  const turnCountRef = useRef(0);

  const showCommandSuggestions = input.startsWith("/") && !modal && !isLoading && !isInitializing;
  const filteredCommands = showCommandSuggestions ? getFilteredCommands(input) : [];

  // Reset suggestion index when input changes
  useEffect(() => {
    setCmdSuggestionIndex(0);
  }, [input]);

  // Detect dropped/pasted file paths and auto-attach
  useEffect(() => {
    if (!input || input.startsWith("/")) return;

    const detectedPath = parsePathFromInput(input);
    if (detectedPath) {
      const att = createAttachment(detectedPath);
      if (att) {
        setAttachments((prev) => {
          // Avoid duplicates
          if (prev.some(a => a.path === att.path)) return prev;
          return [...prev, att];
        });
        // If it's a folder, set it as the working directory
        if (att.type === "folder") {
          setWorkingDirectory(att.path);
        }
        setInput(""); // Clear the path from input
      }
    }
  }, [input]);

  const agentRef = React.useRef<any>(null);
  const sdkRef = React.useRef<any>(null);

  const history = messages.filter((m) => m.type === "user").map((m) => m.content);
  const { navigateUp, navigateDown, resetHistory } = useHistory({
    history,
    input,
    setInput,
  });

  const cwd = process.cwd().replace(process.env.HOME || "", "~");

  // Load models from SDK
  useEffect(() => {
    getModelsFromSDK().then((modelMap) => {
      setModels(modelMap[provider] || []);
    });
  }, [provider]);

  // Initialize agent, graph and load session
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

        const sdk = await import("@astreus-ai/astreus");
        if (!mounted) return;
        sdkRef.current = sdk;

        // Create agent
        const agent = await (sdk.Agent as any).create({
          name: "astreus-cli",
          model,
          systemPrompt: ASTREUS_SYSTEM_PROMPT,
          useTools: true,
          memory: true,
        });

        if (!mounted) return;

        // Register file tools plugin
        if (agent.registerPlugin) {
          await agent.registerPlugin(fileToolsPlugin);
        }

        agentRef.current = agent;

        // Create Graph for session
        const GraphClass = sdk.Graph;
        if (GraphClass) {
          // Try to load existing graph or create new one
          let graph: any = null;

          if (session.graphId) {
            try {
              graph = await GraphClass.findById(session.graphId, agent);
            } catch {
              // Graph not found, will create new
            }
          }

          if (!graph) {
            graph = new GraphClass({
              name: session.name || "Chat Session",
              description: "Astreus CLI chat session",
              maxConcurrency: 1,
              autoLink: true,
              timeout: 300000,
            }, agent);

            // Save and update session with graphId
            const graphId = await graph.save();
            if (graphId && session.graphId !== graphId) {
              session.graphId = graphId;
              saveSession(session);
            }
          }

          graphRef.current = graph;
        }
      } catch (e: any) {
        if (mounted) {
          const msg = e.message || String(e);
          // Check if it's an API key error during init
          if (isApiKeyError(msg)) {
            setModal("apikey");
          } else {
            setMessages((prev) => [...prev, { id: `${Date.now()}`, type: "system", content: `Error: ${msg}` }]);
          }
        }
      } finally {
        if (mounted) setIsInitializing(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, []);

  const addMessage = useCallback((type: Message["type"], content: string) => {
    const newMessage: Message = { id: `${Date.now()}-${Math.random()}`, type, content };
    setMessages((prev) => {
      const updated = [...prev, newMessage];
      // Save to session (only user and assistant messages)
      if (currentSession && (type === "user" || type === "assistant")) {
        const sessionMessages = updated.filter((m) => m.type === "user" || m.type === "assistant");
        saveSession({ ...currentSession, messages: sessionMessages });
      }
      return updated;
    });
    resetHistory();
  }, [resetHistory, currentSession]);

  const handleSubmit = useCallback(async (value: string) => {
    if (modal || isInitializing) return;

    let finalValue = value;

    // If command suggestions are visible and a partial command is entered,
    // use the selected suggestion
    if (value.startsWith("/") && !value.includes(" ")) {
      const currentFilteredCommands = getFilteredCommands(value);
      if (currentFilteredCommands.length > 0) {
        const exactMatch = currentFilteredCommands.find(
          (cmd) => `/${cmd.name}` === value.toLowerCase() || cmd.aliases?.some((a) => `/${a}` === value.toLowerCase())
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

    setInput("");
    resetHistory();
    setCmdSuggestionIndex(0);

    if (trimmed === "?") {
      setShowShortcuts((s) => !s);
      return;
    }
    setShowShortcuts(false);

    if (trimmed.startsWith("/")) {
      const [cmd, ...args] = trimmed.slice(1).split(" ");
      switch (cmd) {
        case "model":
          if (args[0]) {
            setModel(args[0]);
            addMessage("system", `Model: ${args[0]}`);
          } else {
            setSelectIndex(Math.max(0, models.indexOf(model)));
            setModal("model");
          }
          return;
        case "provider":
          if (args[0] && PROVIDERS.includes(args[0] as ProviderType)) {
            const newProvider = args[0] as ProviderType;
            setProvider(newProvider);
            setModel(getDefaultModel(newProvider));
            addMessage("system", `Provider: ${newProvider}`);
          } else {
            setSelectIndex(Math.max(0, PROVIDERS.indexOf(provider)));
            setModal("provider");
          }
          return;
        case "clear":
          setMessages([]);
          agentRef.current?.clearContext?.();
          if (currentSession) {
            saveSession({ ...currentSession, messages: [] });
          }
          return;
        case "sessions":
        case "session":
          setModal("sessions");
          return;
        case "new":
          console.clear();
          const newSession = createSession();
          setCurrentSession(newSession);
          setMessages([]);
          agentRef.current?.clearContext?.();
          turnCountRef.current = 0;
          setExecutedTools([]);
          // Create new graph for new session
          if (sdkRef.current?.Graph && agentRef.current) {
            const newGraph = new sdkRef.current.Graph({
              name: newSession.name || "Chat Session",
              description: "Astreus CLI chat session",
              maxConcurrency: 1,
              autoLink: true,
              timeout: 300000,
            }, agentRef.current);
            newGraph.save().then((graphId: string) => {
              if (graphId) {
                newSession.graphId = graphId;
                saveSession(newSession);
              }
            });
            graphRef.current = newGraph;
          }
          addMessage("system", `New session: ${newSession.name}`);
          return;
        case "settings":
          setModal("settings");
          return;
        case "attach":
        case "add":
        case "a":
          if (args[0]) {
            const path = args.join(" ");
            const att = createAttachment(path);
            if (att) {
              setAttachments((prev) => [...prev, att]);
              // If it's a folder, set it as the working directory for file tools
              if (att.type === "folder") {
                setWorkingDirectory(att.path);
                addMessage("system", `Attached: ${getAttachmentPreview(att)}\nWorking directory set to: ${att.path}`);
              } else {
                addMessage("system", `Attached: ${getAttachmentPreview(att)}`);
              }
            } else {
              addMessage("system", `File not found: ${path}`);
            }
          } else {
            addMessage("system", "Usage: /attach <path>");
          }
          return;
        case "attachments":
          if (attachments.length === 0) {
            addMessage("system", "No attachments");
          } else {
            const list = attachments.map((a, i) => `${i + 1}. ${getAttachmentPreview(a)}`).join("\n");
            addMessage("system", `Attachments:\n${list}`);
          }
          return;
        case "clear-attachments":
        case "ca":
          setAttachments([]);
          addMessage("system", "Attachments cleared");
          return;
        case "pwd":
          addMessage("system", `Working directory: ${getWorkingDirectory()}`);
          return;
        case "tools":
          if (agentRef.current?.getTools) {
            const tools = agentRef.current.getTools();
            if (tools && tools.length > 0) {
              const toolList = tools.map((t: any) => `• ${t.name}: ${t.description}`).join("\n");
              addMessage("system", `Registered tools (${tools.length}):\n${toolList}`);
            } else {
              addMessage("system", "No tools registered");
            }
          } else if (agentRef.current?.listPlugins) {
            const plugins = agentRef.current.listPlugins();
            if (plugins && plugins.length > 0) {
              const pluginInfo = plugins.map((p: any) => {
                const toolNames = p.tools?.map((t: any) => t.name).join(", ") || "none";
                return `• ${p.name} v${p.version}: ${toolNames}`;
              }).join("\n");
              addMessage("system", `Registered plugins:\n${pluginInfo}`);
            } else {
              addMessage("system", "No plugins registered");
            }
          } else {
            addMessage("system", "Agent not ready or tools not supported");
          }
          return;
        case "status":
        case "graph":
          if (graphRef.current) {
            const nodes = graphRef.current.getNodes?.() || [];
            const status = graphRef.current.getStatus?.() || "idle";
            const usage = graphRef.current.getUsage?.();
            let info = `Session: ${currentSession?.name || "none"}\n`;
            info += `Graph Status: ${status}\n`;
            info += `Nodes: ${nodes.length}\n`;
            info += `Turns: ${turnCountRef.current}\n`;
            info += `Working directory: ${getWorkingDirectory()}`;
            if (usage?.totalTokens) {
              info += `\nTotal tokens: ${usage.totalTokens}`;
            }
            addMessage("system", info);
          } else {
            addMessage("system", `Session: ${currentSession?.name || "none"}\nGraph: not initialized\nWorking directory: ${getWorkingDirectory()}`);
          }
          return;
        case "help":
          addMessage("system", "/model /provider /sessions /new /attach /clear-attachments /tools /graph /settings /clear /exit");
          return;
        case "exit":
        case "quit":
        case "q":
          exit();
          return;
        default:
          addMessage("system", `Unknown: ${cmd}`);
          return;
      }
    }

    // Build message - keep user message clean for history
    const currentAttachments = [...attachments];
    const workingDir = getWorkingDirectory();

    // Display message is just the user's input (clean for history)
    addMessage("user", trimmed);
    // Clear attachments after sending (they're message-specific, but working directory persists)
    setAttachments([]);
    setIsLoading(true);
    setIsThinking(true);
    setStreamingContent("");
    setTokenCount(0);
    setElapsedTime(0);
    setExecutedTools([]);

    // Start timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      // Check if agent needs to be recreated for model change
      if (agentRef.current?.config?.model !== model && sdkRef.current) {
        const newAgent = await (sdkRef.current.Agent as any).create({
          name: "astreus-cli",
          model,
          systemPrompt: ASTREUS_SYSTEM_PROMPT,
          useTools: true,
          memory: true,
        });
        if (newAgent.registerPlugin) {
          await newAgent.registerPlugin(fileToolsPlugin);
        }
        agentRef.current = newAgent;
      }

      if (!agentRef.current) throw new Error("Agent not ready");

      streamingRef.current = "";
      streamingDoneRef.current = false;
      interruptedRef.current = false;

      // Prepare attachments for the agent
      const agentAttachments = currentAttachments.length > 0
        ? attachmentsToAgentFormat(currentAttachments)
        : undefined;

      // Build prompt with working directory and attachments
      // Note: Conversation history is handled by SDK's memory/context system via loadGraphContext()
      let prompt = trimmed;

      // Add working directory context
      if (workingDir !== process.cwd()) {
        prompt = `[IMPORTANT: Working directory is set to: ${workingDir}. All file operations should be relative to this directory or use absolute paths within it.]\n\n${prompt}`;
      }

      if (agentAttachments && agentAttachments.length > 0) {
        const attachmentList = agentAttachments.map(a => `- ${a.name || a.path} (${a.type})`).join("\n");
        prompt = `${prompt}\n\n[Attached files:\n${attachmentList}]`;
      }

      // Use Graph system for conversation management
      if (graphRef.current) {
        // Add task node to graph
        const nodeId = graphRef.current.addTaskNode({
          name: `Turn-${turnCountRef.current + 1}`,
          prompt: prompt,
          stream: true,
          metadata: {
            useTools: true, // Enable tool execution
            attachments: agentAttachments,
            workingDirectory: workingDir,
          },
        });

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
          onToolCall: (toolName: string, _args: Record<string, unknown>, status: 'start' | 'end', result?: string) => {
            // Convert tool_name to "Tool Name" format
            const displayName = toolName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

            if (status === 'start') {
              // Tool marker - will be shown inline, no newlines needed
              setCurrentToolCall({ name: toolName, status: 'running' });
              setIsThinking(false);
            } else {
              // Tool completed - just update state, don't pollute streaming content
              setCurrentToolCall(null);
              setExecutedTools(prev => [...prev, { name: toolName, result }]);
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
              streamingRef.current = "";
              setStreamingContent("");
              setIsThinking(false);
              setPendingMessage(trimmed);
              setModal("apikey");
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

        streamingRef.current = "";
        setStreamingContent("");
        setIsThinking(false);
        turnCountRef.current++;

        if (finalResponse) {
          addMessage("assistant", finalResponse);
        } else {
          addMessage("system", `No response from model`);
        }
      } else {
        // Fallback to agent.ask() if no graph
        const result = await agentRef.current.ask(prompt, {
          stream: true,
          useTools: true,
          attachments: agentAttachments,
          timeout: 300000, // 5 minutes for complex tasks
          onChunk: (chunk: string) => {
            if (streamingDoneRef.current || interruptedRef.current) return;
            streamingRef.current += chunk;
            const currentContent = streamingRef.current;
            setIsThinking(false);
            setStreamingContent(currentContent);
            setTokenCount(Math.ceil(currentContent.length / 4));
          },
        });

        // Check if interrupted
        if (interruptedRef.current) return;

        // Mark streaming as done
        streamingDoneRef.current = true;

        // Get response
        let finalResponse = streamingRef.current;
        if (!finalResponse && result) {
          if (typeof result === "string") {
            finalResponse = result;
          } else if (result.response) {
            finalResponse = result.response;
          } else if (typeof result === "object") {
            finalResponse = JSON.stringify(result, null, 2);
          }
        }

        streamingRef.current = "";
        setStreamingContent("");
        setIsThinking(false);
        addMessage("assistant", finalResponse || "No response received");
      }
    } catch (e: any) {
      // If interrupted, don't show error
      if (interruptedRef.current) return;

      streamingDoneRef.current = true;
      streamingRef.current = "";
      setStreamingContent("");
      setIsThinking(false);
      const msg = e.message || String(e) || "Unknown error";
      const stack = e.stack || "";
      if (isApiKeyError(msg)) {
        setPendingMessage(trimmed);
        setModal("apikey");
        setMessages((prev) => prev.slice(0, -1));
      } else {
        const errorDetail = process.env.DEBUG ? `Error: ${msg}\n${stack}` : `Error: ${msg}`;
        addMessage("system", errorDetail);
      }
    } finally {
      setIsLoading(false);
      setCurrentToolCall(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [modal, isInitializing, models, model, provider, addMessage, exit, resetHistory, cmdSuggestionIndex, currentSession]);

  const handleApiKeySubmit = useCallback(async (key: string) => {
    if (!key.trim()) {
      setModal(null);
      setPendingMessage(null);
      return;
    }
    saveApiKey(provider, key.trim());
    addMessage("system", "API key saved to .env");
    setApiKeyInput("");
    setModal(null);

    if (pendingMessage) {
      const msg = pendingMessage;
      setPendingMessage(null);
      // Clear SDK's cached LLM instances so new API key is used
      if (sdkRef.current?.clearLLMInstances) {
        sdkRef.current.clearLLMInstances();
      }
      agentRef.current = null;
      setTimeout(() => handleSubmit(msg), 100);
    }
  }, [provider, pendingMessage, handleSubmit, addMessage]);

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
      streamingRef.current = "";
      setStreamingContent("");
      setIsThinking(false);
      setIsLoading(false);
      if (partial) {
        addMessage("assistant", partial + "\n\n[Interrupted]");
      } else {
        addMessage("system", "Interrupted");
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

      // Clear old context and load graph for session
      if (agentRef.current) {
        await agentRef.current.clearContext?.();

        // Load or create graph for this session
        if (sdkRef.current?.Graph) {
          try {
            let graph = null;
            if (session.graphId) {
              graph = await sdkRef.current.Graph.findById(session.graphId, agentRef.current);
            }
            if (!graph) {
              graph = new sdkRef.current.Graph({
                name: session.name || "Chat Session",
                description: "Astreus CLI chat session",
                maxConcurrency: 1,
                autoLink: true,
                timeout: 300000,
              }, agentRef.current);
              const graphId = await graph.save();
              if (graphId) {
                session.graphId = graphId;
                saveSession(session);
              }
            }
            graphRef.current = graph;
          } catch {
            // Create new graph on error
            const graph = new sdkRef.current.Graph({
              name: session.name || "Chat Session",
              description: "Astreus CLI chat session",
              maxConcurrency: 1,
              autoLink: true,
              timeout: 300000,
            }, agentRef.current);
            graphRef.current = graph;
          }
        }
      }
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

      // Clear context and create new graph
      if (agentRef.current) {
        await agentRef.current.clearContext?.();

        // Create new graph for new session
        if (sdkRef.current?.Graph) {
          const graph = new sdkRef.current.Graph({
            name: session.name || "Chat Session",
            description: "Astreus CLI chat session",
            maxConcurrency: 1,
            autoLink: true,
            timeout: 300000,
          }, agentRef.current);

          const graphId = await graph.save();
          if (graphId) {
            session.graphId = graphId;
            saveSession(session);
          }

          graphRef.current = graph;
        }
      }
    }
    setModal(null);
  }, []);

  useInput((char, key) => {
    if (key.ctrl && char === "c") {
      exit();
      return;
    }

    // Escape to interrupt during loading
    if (key.escape && isLoading) {
      handleInterrupt();
      return;
    }

    // Settings modal handles its own input
    if (modal === "settings") {
      return;
    }

    // Sessions modal handles its own input
    if (modal === "sessions") {
      return;
    }

    if (modal === "apikey") {
      if (key.escape) {
        setModal(null);
        setApiKeyInput("");
        setPendingMessage(null);
      }
      return;
    }

    if (modal) {
      const options = modal === "model" ? models : PROVIDERS;
      if (key.escape) { setModal(null); return; }
      if (key.upArrow) { setSelectIndex((i) => (i > 0 ? i - 1 : options.length - 1)); return; }
      if (key.downArrow) { setSelectIndex((i) => (i < options.length - 1 ? i + 1 : 0)); return; }
      if (key.return) {
        const sel = options[selectIndex];
        if (modal === "model") {
          setModel(sel);
          addMessage("system", `Model: ${sel}`);
        } else {
          const newProvider = sel as ProviderType;
          setProvider(newProvider);
          setModel(getDefaultModel(newProvider));
          addMessage("system", `Provider: ${sel}`);
        }
        setModal(null);
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
      <Header version={VERSION} model={model} provider={provider} cwd={cwd} sessionName={currentSession?.name} />

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
            <Text color="cyan">/model</Text>{" "}
            <Text color="cyan">/provider</Text>{" "}
            <Text color="cyan">/sessions</Text>{" "}
            <Text color="cyan">/new</Text>{" "}
            <Text color="cyan">/settings</Text>{" "}
            <Text color="cyan">/clear</Text>{" "}
            <Text color="cyan">/exit</Text>
          </Text>
        </Box>
      )}

      {modal === "model" && (
        <ModelModal models={models} currentModel={model} selectIndex={selectIndex} />
      )}

      {modal === "provider" && (
        <ProviderModal providers={PROVIDERS} currentProvider={provider} selectIndex={selectIndex} />
      )}

      {modal === "apikey" && (
        <ApiKeyModal
          provider={provider}
          value={apiKeyInput}
          onChange={setApiKeyInput}
          onSubmit={handleApiKeySubmit}
        />
      )}

      {modal === "settings" && (
        <SettingsModal
          onClose={() => setModal(null)}
          onSave={(msg) => addMessage("system", msg)}
        />
      )}

      {modal === "sessions" && (
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
