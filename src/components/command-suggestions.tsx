import React from 'react';
import { Box, Text } from 'ink';

export interface Command {
  name: string;
  description: string;
  aliases?: string[];
}

export const COMMANDS: Command[] = [
  { name: 'model', description: 'Change the AI model' },
  { name: 'provider', description: 'Change the AI provider' },
  { name: 'sessions', description: 'Manage chat sessions', aliases: ['session'] },
  { name: 'new', description: 'Start a new chat session' },
  { name: 'attach', description: 'Attach a file or folder', aliases: ['add', 'a'] },
  { name: 'attachments', description: 'Show current attachments' },
  { name: 'clear-attachments', description: 'Clear all attachments', aliases: ['ca'] },
  { name: 'pwd', description: 'Show current working directory' },
  { name: 'tools', description: 'Show registered tools' },
  { name: 'graph', description: 'Show graph state', aliases: ['status'] },
  { name: 'settings', description: 'Open settings panel' },
  { name: 'clear', description: 'Clear chat history' },
  { name: 'help', description: 'Show available commands' },
  { name: 'exit', description: 'Exit the CLI', aliases: ['quit', 'q'] },
];

interface CommandSuggestionsProps {
  filter: string;
  selectedIndex: number;
}

export function getFilteredCommands(filter: string): Command[] {
  const search = filter.toLowerCase().replace(/^\//, '');
  if (!search) return COMMANDS;

  return COMMANDS.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(search) ||
      cmd.aliases?.some((a) => a.toLowerCase().includes(search))
  );
}

export function CommandSuggestions({ filter, selectedIndex }: CommandSuggestionsProps) {
  const filtered = getFilteredCommands(filter);

  if (filtered.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {filtered.map((cmd, i) => (
        <Box key={cmd.name}>
          <Text color={i === selectedIndex ? 'cyan' : 'gray'} bold={i === selectedIndex}>
            {i === selectedIndex ? '> ' : '  '}/{cmd.name}
          </Text>
          <Text dimColor> {cmd.description}</Text>
        </Box>
      ))}
    </Box>
  );
}
