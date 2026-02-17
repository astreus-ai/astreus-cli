import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
  listSessions,
  createSession,
  deleteSession,
  renameSession,
  type SessionMeta,
} from '../../utils/sessions';

interface SessionModalProps {
  currentSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNew: (sessionId: string) => void;
  onClose: () => void;
}

type Mode = 'list' | 'new' | 'rename' | 'delete-confirm';

export function SessionModal({ currentSessionId, onSelect, onNew, onClose }: SessionModalProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const loaded = listSessions();
    setSessions(loaded);
    // Find current session index
    const currentIndex = loaded.findIndex((s) => s.id === currentSessionId);
    if (currentIndex >= 0) {
      setSelectedIndex(currentIndex);
    }
  }, [currentSessionId]);

  const selectedSession = sessions[selectedIndex];

  useInput((input, key) => {
    if (mode === 'new' || mode === 'rename') {
      if (key.escape) {
        setMode('list');
        setInputValue('');
      }
      return;
    }

    if (mode === 'delete-confirm') {
      if (input.toLowerCase() === 'y') {
        if (selectedSession) {
          deleteSession(selectedSession.id);
          const newSessions = sessions.filter((s) => s.id !== selectedSession.id);
          setSessions(newSessions);
          if (selectedIndex >= newSessions.length) {
            setSelectedIndex(Math.max(0, newSessions.length - 1));
          }
        }
        setMode('list');
      } else if (input.toLowerCase() === 'n' || key.escape) {
        setMode('list');
      }
      return;
    }

    // List mode
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : sessions.length - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((i) => (i < sessions.length - 1 ? i + 1 : 0));
      return;
    }

    if (key.return) {
      if (selectedSession) {
        onSelect(selectedSession.id);
      }
      return;
    }

    // Keyboard shortcuts
    if (input === 'n') {
      setMode('new');
      setInputValue('');
      return;
    }

    if (input === 'r' && selectedSession) {
      setMode('rename');
      setInputValue(selectedSession.name);
      return;
    }

    if (input === 'd' && selectedSession && sessions.length > 1) {
      setMode('delete-confirm');
      return;
    }
  });

  const handleNewSubmit = (value: string) => {
    const name = value.trim() || undefined;
    const session = createSession(name);
    onNew(session.id);
  };

  const handleRenameSubmit = (value: string) => {
    if (selectedSession && value.trim()) {
      renameSession(selectedSession.id, value.trim());
      setSessions(listSessions());
    }
    setMode('list');
    setInputValue('');
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return (
      date.toLocaleDateString() +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  if (mode === 'delete-confirm' && selectedSession) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="red" bold>
          Delete Session
        </Text>
        <Text>Are you sure you want to delete "{selectedSession.name}"?</Text>
        <Text dimColor>(y/n)</Text>
      </Box>
    );
  }

  if (mode === 'new') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="green" bold>
          New Session
        </Text>
        <Box>
          <Text>Name: </Text>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleNewSubmit}
            placeholder="Enter session name (optional)"
          />
        </Box>
        <Text dimColor>Press Enter to create, Esc to cancel</Text>
      </Box>
    );
  }

  if (mode === 'rename' && selectedSession) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow" bold>
          Rename Session
        </Text>
        <Box>
          <Text>Name: </Text>
          <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleRenameSubmit} />
        </Box>
        <Text dimColor>Press Enter to save, Esc to cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="green" bold>
        Sessions
      </Text>
      <Text dimColor>
        Esc close | Enter select | n new | r rename{sessions.length > 1 ? ' | d delete' : ''}
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {sessions.length === 0 ? (
          <Text dimColor>No sessions found. Press "n" to create one.</Text>
        ) : (
          sessions.map((session, i) => {
            const isSelected = i === selectedIndex;
            const isCurrent = session.id === currentSessionId;
            return (
              <Box key={session.id}>
                <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                  {isSelected ? '> ' : '  '}
                  {session.name}
                  {isCurrent ? ' *' : ''}
                </Text>
                <Text dimColor>
                  {'  '}({session.messageCount} msgs, {formatDate(session.updatedAt)})
                </Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
