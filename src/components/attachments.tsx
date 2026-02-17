import React from 'react';
import { Box, Text } from 'ink';
import type { Attachment } from '../utils/attachments';

interface AttachmentsProps {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
}

export function Attachments({ attachments }: AttachmentsProps) {
  if (attachments.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>Attachments ({attachments.length}):</Text>
      {attachments.map((att, index) => (
        <Box key={att.id}>
          <Text dimColor> {index + 1}. </Text>
          {att.type === 'image' && <Text color="magenta">[IMG] </Text>}
          {att.type === 'folder' && <Text color="blue">[DIR] </Text>}
          {att.type === 'file' && <Text color="yellow">[FILE] </Text>}
          <Text>{att.name}</Text>
        </Box>
      ))}
      <Text dimColor> (type /clear-attachments to remove all)</Text>
    </Box>
  );
}
