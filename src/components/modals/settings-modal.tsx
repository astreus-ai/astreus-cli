import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { getEnvValue, saveEnvVar } from '../../utils/env';
import type { SettingsCategory } from '../../types';

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    name: 'Providers',
    key: 'providers',
    items: [
      // OpenAI
      { key: '_openai', label: 'OpenAI', value: '', isHeader: true },
      { key: 'OPENAI_API_KEY', label: 'API Key', value: '', secret: true },
      {
        key: 'OPENAI_BASE_URL',
        label: 'Base URL',
        value: '',
        placeholder: 'https://api.openai.com/v1',
      },
      // Anthropic
      { key: '_anthropic', label: 'Anthropic', value: '', isHeader: true },
      { key: 'ANTHROPIC_API_KEY', label: 'API Key', value: '', secret: true },
      {
        key: 'ANTHROPIC_BASE_URL',
        label: 'Base URL',
        value: '',
        placeholder: 'https://api.anthropic.com',
      },
      // Gemini
      { key: '_gemini', label: 'Gemini', value: '', isHeader: true },
      { key: 'GEMINI_API_KEY', label: 'API Key', value: '', secret: true },
      {
        key: 'GEMINI_BASE_URL',
        label: 'Base URL',
        value: '',
        placeholder: 'https://generativelanguage.googleapis.com',
      },
      // Ollama
      { key: '_ollama', label: 'Ollama', value: '', isHeader: true },
      {
        key: 'OLLAMA_BASE_URL',
        label: 'Base URL',
        value: '',
        placeholder: 'http://localhost:11434',
      },
    ],
  },
  {
    name: 'Database',
    key: 'database',
    items: [
      { key: 'DB_URL', label: 'Database URL', value: '', placeholder: 'sqlite://./astreus.db' },
      {
        key: 'KNOWLEDGE_DB_URL',
        label: 'Knowledge DB URL',
        value: '',
        placeholder: 'postgresql://...',
      },
    ],
  },
  {
    name: 'Encryption',
    key: 'encryption',
    items: [
      { key: 'ENCRYPTION_ENABLED', label: 'Enabled', value: '', options: ['true', 'false'] },
      { key: 'ENCRYPTION_MASTER_KEY', label: 'Master Key', value: '', secret: true },
      { key: 'ENCRYPTION_ALGORITHM', label: 'Algorithm', value: '', placeholder: 'aes-256-gcm' },
    ],
  },
];

interface SettingsModalProps {
  onClose: () => void;
  onSave: (message: string) => void;
}

type Mode = 'category' | 'item' | 'edit' | 'select';

export function SettingsModal({ onClose, onSave }: SettingsModalProps) {
  const [mode, setMode] = useState<Mode>('category');
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [optionIndex, setOptionIndex] = useState(0);
  const [editValue, setEditValue] = useState('');
  const [categories, setCategories] = useState<SettingsCategory[]>([]);

  // Load current values
  useEffect(() => {
    const loaded = SETTINGS_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.map((item) => ({
        ...item,
        value: getEnvValue(item.key),
      })),
    }));
    setCategories(loaded);
  }, []);

  const currentCategory = categories[categoryIndex];
  const currentItem = currentCategory?.items[itemIndex];

  // Get non-header items for navigation
  const getEditableIndices = (items: typeof currentCategory.items) => {
    return items.map((item, i) => (!item.isHeader ? i : -1)).filter((i) => i !== -1);
  };

  const findNextEditableIndex = (
    items: typeof currentCategory.items,
    current: number,
    direction: 1 | -1
  ) => {
    const editableIndices = getEditableIndices(items);
    if (editableIndices.length === 0) return current;

    const currentPos = editableIndices.indexOf(current);
    if (currentPos === -1) {
      // Current is a header, find nearest editable
      return editableIndices[0];
    }

    let newPos = currentPos + direction;
    if (newPos < 0) newPos = editableIndices.length - 1;
    if (newPos >= editableIndices.length) newPos = 0;
    return editableIndices[newPos];
  };

  // Set initial itemIndex to first editable item
  useEffect(() => {
    if (currentCategory && mode === 'item') {
      const editableIndices = getEditableIndices(currentCategory.items);
      if (editableIndices.length > 0 && currentCategory.items[itemIndex]?.isHeader) {
        setItemIndex(editableIndices[0]);
      }
    }
  }, [categoryIndex, mode]);

  useInput((input, key) => {
    if (key.escape) {
      if (mode === 'edit' || mode === 'select') {
        setMode('item');
      } else if (mode === 'item') {
        setMode('category');
        setItemIndex(0);
      } else {
        onClose();
      }
      return;
    }

    if (mode === 'category') {
      if (key.upArrow) {
        setCategoryIndex((i) => (i > 0 ? i - 1 : categories.length - 1));
      } else if (key.downArrow) {
        setCategoryIndex((i) => (i < categories.length - 1 ? i + 1 : 0));
      } else if (key.return) {
        setMode('item');
        const editableIndices = getEditableIndices(currentCategory?.items || []);
        setItemIndex(editableIndices[0] ?? 0);
      }
      return;
    }

    if (mode === 'item') {
      const items = currentCategory?.items || [];
      if (key.upArrow) {
        setItemIndex((i) => findNextEditableIndex(items, i, -1));
      } else if (key.downArrow) {
        setItemIndex((i) => findNextEditableIndex(items, i, 1));
      } else if (key.return && currentItem && !currentItem.isHeader) {
        if (currentItem.options) {
          setMode('select');
          setOptionIndex(Math.max(0, currentItem.options.indexOf(currentItem.value)));
        } else {
          setMode('edit');
          setEditValue(currentItem.value);
        }
      }
      return;
    }

    if (mode === 'select' && currentItem?.options) {
      const options = currentItem.options;
      if (key.upArrow) {
        setOptionIndex((i) => (i > 0 ? i - 1 : options.length - 1));
      } else if (key.downArrow) {
        setOptionIndex((i) => (i < options.length - 1 ? i + 1 : 0));
      } else if (key.return) {
        const selected = options[optionIndex];
        saveEnvVar(currentItem.key, selected);
        setCategories((cats) =>
          cats.map((cat, ci) =>
            ci === categoryIndex
              ? {
                  ...cat,
                  items: cat.items.map((item, ii) =>
                    ii === itemIndex ? { ...item, value: selected } : item
                  ),
                }
              : cat
          )
        );
        onSave(`${currentItem.key}=${selected}`);
        setMode('item');
      }
      return;
    }
  });

  const handleEditSubmit = (value: string) => {
    if (currentItem) {
      saveEnvVar(currentItem.key, value);
      setCategories((cats) =>
        cats.map((cat, ci) =>
          ci === categoryIndex
            ? {
                ...cat,
                items: cat.items.map((item, ii) => (ii === itemIndex ? { ...item, value } : item)),
              }
            : cat
        )
      );
      onSave(`${currentItem.key} saved`);
    }
    setMode('item');
  };

  if (categories.length === 0) {
    return <Text dimColor>Loading settings...</Text>;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="green" bold>
        Settings
      </Text>
      <Text dimColor>Esc to go back | Enter to select</Text>

      <Box marginTop={1}>
        {/* Categories */}
        <Box flexDirection="column" marginRight={2}>
          {categories.map((cat, i) => (
            <Text
              key={cat.key}
              color={i === categoryIndex ? 'cyan' : undefined}
              dimColor={mode !== 'category' && i !== categoryIndex}
            >
              {i === categoryIndex && mode === 'category' ? '> ' : '  '}
              {cat.name}
            </Text>
          ))}
        </Box>

        {/* Items */}
        {currentCategory && (
          <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
            {currentCategory.items.map((item, i) => {
              if (item.isHeader) {
                return (
                  <Box key={item.key} marginTop={i > 0 ? 1 : 0}>
                    <Text color="yellow" bold>
                      {item.label}
                    </Text>
                  </Box>
                );
              }

              const isSelected = i === itemIndex && mode !== 'category';
              return (
                <Box key={item.key}>
                  <Text color={isSelected ? 'cyan' : undefined} dimColor={mode === 'category'}>
                    {isSelected && mode === 'item' ? '> ' : '  '}
                    {item.label}:{' '}
                  </Text>
                  {mode === 'edit' && i === itemIndex ? (
                    <TextInput
                      value={editValue}
                      onChange={setEditValue}
                      onSubmit={handleEditSubmit}
                      mask={item.secret ? '*' : undefined}
                    />
                  ) : mode === 'select' && i === itemIndex && item.options ? (
                    <Box>
                      {item.options.map((opt, oi) => (
                        <Text key={opt} color={oi === optionIndex ? 'yellow' : undefined}>
                          {oi === optionIndex ? `[${opt}]` : ` ${opt} `}
                        </Text>
                      ))}
                    </Box>
                  ) : (
                    <Text dimColor={!item.value}>
                      {item.value
                        ? item.secret
                          ? '*'.repeat(Math.min(item.value.length, 20))
                          : item.value
                        : item.placeholder || '(not set)'}
                    </Text>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}
