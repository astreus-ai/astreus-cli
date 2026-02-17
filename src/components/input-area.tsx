import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import type { ModalType } from '../types';

interface InputAreaProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (value: string) => void;
  isLoading: boolean;
  isInitializing: boolean;
  isStreaming: boolean;
  modal: ModalType;
  line: string;
  elapsedTime: number;
  tokenCount: number;
  currentTool?: string | null;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

export function InputArea({
  input,
  setInput,
  onSubmit,
  isLoading,
  isInitializing,
  isStreaming,
  modal,
  line,
  elapsedTime,
  tokenCount,
  currentTool,
}: InputAreaProps) {
  const disabled = isLoading || isInitializing || modal !== null;

  // Format tool name for display
  const toolDisplay = currentTool
    ? currentTool
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : null;

  return (
    <Box flexDirection="column" marginTop={1}>
      {isLoading && (
        <Box marginBottom={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          {toolDisplay ? (
            <Text>
              {' '}
              <Text color="yellow">{toolDisplay}</Text>
            </Text>
          ) : (
            <Text dimColor> {isStreaming ? 'Streaming' : 'Thinking'}...</Text>
          )}
          <Text dimColor> (esc</Text>
          {elapsedTime > 0 && <Text dimColor> · {formatTime(elapsedTime)}</Text>}
          {tokenCount > 0 && <Text dimColor> · {formatTokens(tokenCount)}t</Text>}
          <Text dimColor>)</Text>
        </Box>
      )}
      <Text dimColor>{line}</Text>
      {!modal ? (
        <Box>
          <Text color={disabled ? 'gray' : 'cyan'}>{'>'} </Text>
          <TextInput
            value={disabled ? '' : input}
            onChange={disabled ? () => {} : setInput}
            onSubmit={disabled ? () => {} : onSubmit}
            focus={!disabled}
          />
          {!disabled && !input && <Text dimColor>Type message or /help</Text>}
          {isInitializing && <Text dimColor>Initializing...</Text>}
        </Box>
      ) : (
        <Box>
          <Text color="cyan">{'>'} </Text>
          <Text dimColor>/{modal}</Text>
        </Box>
      )}
      <Text dimColor>{line}</Text>
      <Text dimColor> ? shortcuts | up/down history</Text>
    </Box>
  );
}
