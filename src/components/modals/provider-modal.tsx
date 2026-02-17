import React from "react";
import { Box, Text } from "ink";
import type { ProviderType } from "../../types";

interface ProviderModalProps {
  providers: ProviderType[];
  currentProvider: ProviderType;
  selectIndex: number;
}

export function ProviderModal({ providers, currentProvider, selectIndex }: ProviderModalProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="green" bold>Select provider</Text>
      {providers.map((p, i) => (
        <Text key={p} color={i === selectIndex ? "cyan" : undefined}>
          {i === selectIndex ? "> " : "  "}{p}{p === currentProvider ? " *" : ""}
        </Text>
      ))}
      <Text dimColor>up/down Enter Esc</Text>
    </Box>
  );
}
