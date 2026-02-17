import { useState, useEffect, useRef, useCallback } from "react";
import type { Message } from "../types";

interface UseAgentOptions {
  model: string;
  onMessage: (type: Message["type"], content: string) => void;
}

interface UseAgentReturn {
  isInitializing: boolean;
  isLoading: boolean;
  sendMessage: (message: string) => Promise<void>;
  updateModel: (newModel: string) => void;
  clearContext: () => void;
}

export function useAgent({ model, onMessage }: UseAgentOptions): UseAgentReturn {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const agentRef = useRef<any>(null);
  const sdkRef = useRef<any>(null);
  const currentModel = useRef(model);

  useEffect(() => {
    currentModel.current = model;
  }, [model]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const sdk = await import("@astreus-ai/astreus");
        if (!mounted) return;
        sdkRef.current = sdk;

        const agent = await (sdk.Agent as any).create({
          name: "astreus-cli",
          model: currentModel.current,
          systemPrompt: "Be concise and helpful.",
        });

        if (!mounted) return;
        agentRef.current = agent;

        // Load existing context
        try {
          const context = agent.getContext?.() || [];
          context.forEach((msg: any, i: number) => {
            if (msg.content) {
              const type = msg.role === "user" ? "user" : msg.role === "assistant" ? "assistant" : "system";
              onMessage(type, msg.content);
            }
          });
        } catch {}
      } catch (e: any) {
        if (mounted) {
          onMessage("system", `Error: ${e.message}`);
        }
      } finally {
        if (mounted) setIsInitializing(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    setIsLoading(true);

    try {
      // Recreate agent if model changed
      if (agentRef.current?.config?.model !== currentModel.current && sdkRef.current) {
        agentRef.current = await (sdkRef.current.Agent as any).create({
          name: "astreus-cli",
          model: currentModel.current,
          systemPrompt: "Be concise and helpful.",
        });
      }

      if (!agentRef.current) {
        throw new Error("Agent not ready");
      }

      let response = "";
      await agentRef.current.run(message, {
        stream: true,
        onChunk: (chunk: string) => { response += chunk; },
      });

      onMessage("assistant", response || "No response");
    } catch (e: any) {
      throw e; // Re-throw for caller to handle
    } finally {
      setIsLoading(false);
    }
  }, [onMessage]);

  const updateModel = useCallback((newModel: string) => {
    currentModel.current = newModel;
  }, []);

  const clearContext = useCallback(() => {
    agentRef.current?.clearContext?.();
  }, []);

  const resetAgent = useCallback(() => {
    agentRef.current = null;
  }, []);

  return {
    isInitializing,
    isLoading,
    sendMessage,
    updateModel,
    clearContext,
  };
}
