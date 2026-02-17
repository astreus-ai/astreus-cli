import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../types';

interface MessagesProps {
  messages: Message[];
  streamingContent?: string;
}

// Simple markdown renderer
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    const key = `line-${lineIndex}`;

    // Empty line - preserve spacing
    if (line.trim() === '') {
      elements.push(<Text key={key}> </Text>);
      return;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <Text key={key} color="cyan" bold>
          {line.slice(4)}
        </Text>
      );
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <Text key={key} color="cyan" bold>
          {line.slice(3)}
        </Text>
      );
      return;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <Text key={key} color="cyan" bold>
          {line.slice(2)}
        </Text>
      );
      return;
    }

    // Horizontal rule
    if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/)) {
      elements.push(
        <Text key={key} dimColor>
          {'─'.repeat(40)}
        </Text>
      );
      return;
    }

    // List items
    if (line.match(/^(\d+)\.\s/)) {
      const content = line.replace(/^\d+\.\s/, '');
      elements.push(
        <Text key={key}>
          {' '}
          {line.match(/^\d+/)?.[0]}. {renderInlineMarkdown(content)}
        </Text>
      );
      return;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<Text key={key}> • {renderInlineMarkdown(line.slice(2))}</Text>);
      return;
    }

    // Regular line with inline formatting
    elements.push(<Text key={key}>{renderInlineMarkdown(line)}</Text>);
  });

  return elements;
}

// Handle inline markdown (bold, italic, code)
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let partIndex = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code: `text`
    const codeMatch = remaining.match(/`([^`]+)`/);

    let firstMatch: {
      type: 'bold' | 'code';
      index: number;
      length: number;
      content: string;
    } | null = null;

    if (boldMatch && boldMatch.index !== undefined) {
      if (!firstMatch || boldMatch.index < firstMatch.index) {
        firstMatch = {
          type: 'bold',
          index: boldMatch.index,
          length: boldMatch[0].length,
          content: boldMatch[1],
        };
      }
    }
    if (codeMatch && codeMatch.index !== undefined) {
      if (!firstMatch || codeMatch.index < firstMatch.index) {
        firstMatch = {
          type: 'code',
          index: codeMatch.index,
          length: codeMatch[0].length,
          content: codeMatch[1],
        };
      }
    }

    if (firstMatch) {
      // Add text before match
      if (firstMatch.index > 0) {
        parts.push(remaining.slice(0, firstMatch.index));
      }

      // Add formatted text
      if (firstMatch.type === 'bold') {
        parts.push(
          <Text key={`part-${partIndex++}`} bold>
            {firstMatch.content}
          </Text>
        );
      } else if (firstMatch.type === 'code') {
        parts.push(
          <Text key={`part-${partIndex++}`} color="yellow">
            {firstMatch.content}
          </Text>
        );
      }

      remaining = remaining.slice(firstMatch.index + firstMatch.length);
    } else {
      // No more matches, add remaining text
      parts.push(remaining);
      break;
    }
  }

  return parts.length > 0 ? parts : [text];
}

export function Messages({ messages, streamingContent }: MessagesProps) {
  const hasContent = messages.length > 0 || streamingContent;

  if (!hasContent) return null;

  return (
    <Box flexDirection="column" marginY={1}>
      {messages.map((msg) => (
        <Box key={msg.id} marginTop={1} flexDirection="column">
          {msg.type === 'user' && (
            <Text>
              <Text color="cyan" bold>
                You:{' '}
              </Text>
              {msg.content}
            </Text>
          )}
          {msg.type === 'assistant' && (
            <Box flexDirection="column">
              {renderMarkdown(msg.content).map((line, idx) =>
                idx === 0 ? (
                  <Text key={idx}>
                    <Text color="green" bold>
                      Astreus:
                    </Text>{' '}
                    {line}
                  </Text>
                ) : (
                  <Box key={idx}>{line}</Box>
                )
              )}
            </Box>
          )}
          {msg.type === 'system' && <Text dimColor>{msg.content}</Text>}
        </Box>
      ))}
      {streamingContent && (
        <Box marginTop={1} flexDirection="column">
          {renderMarkdown(streamingContent).map((line, idx) =>
            idx === 0 ? (
              <Text key={idx}>
                <Text color="green" bold>
                  Astreus:
                </Text>{' '}
                {line}
              </Text>
            ) : (
              <Box key={idx}>{line}</Box>
            )
          )}
        </Box>
      )}
    </Box>
  );
}
