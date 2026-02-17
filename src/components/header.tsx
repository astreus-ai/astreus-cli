import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  version: string;
  model: string;
  provider: string;
  cwd: string;
  sessionName?: string;
}

export function Header({ version, model, provider, cwd, sessionName }: HeaderProps) {
  return (
    <Box flexDirection="row">
      <Box flexDirection="column">
        <Text color="cyan"> ██</Text>
        <Text color="cyan"> ████</Text>
        <Text color="cyan">██ ██</Text>
      </Box>
      <Box flexDirection="column" marginLeft={2} justifyContent="center">
        <Text>
          <Text color="cyan" bold>
            Astreus CLI{' '}
          </Text>
          <Text dimColor>v{version}</Text>
          {sessionName && (
            <>
              <Text dimColor> · </Text>
              <Text color="green">{sessionName}</Text>
            </>
          )}
        </Text>
        <Text>
          <Text>{model}</Text>
          <Text dimColor> · </Text>
          <Text color="gray">{provider}</Text>
        </Text>
        <Text dimColor>{cwd}</Text>
      </Box>
    </Box>
  );
}
