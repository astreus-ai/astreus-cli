import { useState, useRef, useCallback } from 'react';

interface UseHistoryOptions {
  history: string[];
  input: string;
  setInput: (value: string) => void;
}

interface UseHistoryReturn {
  historyIndex: number;
  navigateUp: () => void;
  navigateDown: () => void;
  resetHistory: () => void;
}

export function useHistory({ history, input, setInput }: UseHistoryOptions): UseHistoryReturn {
  const [historyIndex, setHistoryIndex] = useState(-1);
  const tempInput = useRef('');

  const navigateUp = useCallback(() => {
    if (history.length === 0) return;

    if (historyIndex === -1) {
      tempInput.current = input;
      setHistoryIndex(history.length - 1);
      setInput(history[history.length - 1]);
    } else if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setInput(history[historyIndex - 1]);
    }
  }, [history, historyIndex, input, setInput]);

  const navigateDown = useCallback(() => {
    if (historyIndex === -1) return;

    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setInput(history[historyIndex + 1]);
    } else {
      setHistoryIndex(-1);
      setInput(tempInput.current);
    }
  }, [history, historyIndex, setInput]);

  const resetHistory = useCallback(() => {
    setHistoryIndex(-1);
  }, []);

  return {
    historyIndex,
    navigateUp,
    navigateDown,
    resetHistory,
  };
}
