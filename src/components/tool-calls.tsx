import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface ToolCall {
  name: string;
  result?: string;
}

interface ToolCallsProps {
  tools: ToolCall[];
  currentTool?: { name: string; status: 'running' | 'done'; result?: string } | null;
}

function truncateResult(result: string | undefined, maxLen: number = 60): string {
  if (!result) return "";
  // Remove newlines and extra spaces
  const cleaned = result.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + "...";
}

export function ToolCalls({ tools, currentTool }: ToolCallsProps) {
  if (tools.length === 0 && !currentTool) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {tools.map((tool, i) => (
        <Box key={i}>
          <Text color="green">[check] </Text>
          <Text color="cyan">{tool.name}</Text>
          {tool.result && (
            <Text dimColor> → {truncateResult(tool.result)}</Text>
          )}
        </Box>
      ))}
      {currentTool && currentTool.status === 'running' && (
        <Box>
          <Text color="yellow"><Spinner type="dots" /> </Text>
          <Text color="cyan">{currentTool.name}</Text>
        </Box>
      )}
    </Box>
  );
}
