import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { ProviderType } from "../../types";
import { getEnvKeyName } from "../../utils/env";

interface ApiKeyModalProps {
  provider: ProviderType;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export function ApiKeyModal({ provider, value, onChange, onSubmit }: ApiKeyModalProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="yellow" bold>API key required for {provider}</Text>
      <Text dimColor>Enter your {getEnvKeyName(provider)}:</Text>
      <Box marginTop={1}>
        <Text color="cyan">{">"} </Text>
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          mask="*"
        />
      </Box>
      <Text dimColor>Press Enter to save, or Esc to cancel</Text>
    </Box>
  );
}
