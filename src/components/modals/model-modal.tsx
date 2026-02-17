import React from "react";
import { Box, Text } from "ink";

interface ModelModalProps {
  models: string[];
  currentModel: string;
  selectIndex: number;
}

export function ModelModal({ models, currentModel, selectIndex }: ModelModalProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="green" bold>Select model</Text>
      {models.map((m, i) => (
        <Text key={m} color={i === selectIndex ? "cyan" : undefined}>
          {i === selectIndex ? "> " : "  "}{m}{m === currentModel ? " *" : ""}
        </Text>
      ))}
      <Text dimColor>up/down Enter Esc</Text>
    </Box>
  );
}
