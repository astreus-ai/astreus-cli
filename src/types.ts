export interface Message {
  id: string;
  content: string;
  type: 'user' | 'assistant' | 'system';
}

export type ModalType = 'model' | 'provider' | 'apikey' | 'settings' | 'sessions' | null;

export type ProviderType = 'openai' | 'claude' | 'gemini' | 'ollama';

export interface SettingsCategory {
  name: string;
  key: string;
  items: SettingsItem[];
}

export interface SettingsItem {
  key: string;
  label: string;
  value: string;
  placeholder?: string;
  secret?: boolean;
  options?: string[];
  isHeader?: boolean;
}
