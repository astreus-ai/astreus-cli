import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Message } from '../types';

export interface Session {
  id: string;
  graphId: string; // SDK graph ID for context management
  name: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  model?: string;
  provider?: string;
}

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

const SESSIONS_DIR = join(homedir(), '.astreus', 'sessions');
const CURRENT_SESSION_FILE = join(homedir(), '.astreus', 'current-session');

function ensureDir(): void {
  const astreusDir = join(homedir(), '.astreus');
  if (!existsSync(astreusDir)) {
    mkdirSync(astreusDir, { recursive: true });
  }
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateGraphId(): string {
  return `graph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSession(name?: string): Session {
  ensureDir();
  const id = generateSessionId();
  const graphId = generateGraphId();
  const now = new Date().toISOString();
  const session: Session = {
    id,
    graphId,
    name: name || `Chat ${new Date().toLocaleString()}`,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  saveSession(session);
  setCurrentSessionId(id);
  return session;
}

export function saveSession(session: Session): void {
  ensureDir();
  session.updatedAt = new Date().toISOString();
  const filePath = join(SESSIONS_DIR, `${session.id}.json`);
  writeFileSync(filePath, JSON.stringify(session, null, 2));
}

export function loadSession(id: string): Session | null {
  const filePath = join(SESSIONS_DIR, `${id}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = readFileSync(filePath, 'utf-8');
    const session = JSON.parse(content) as Session;

    // Migration: add graphId if missing (for old sessions)
    if (!session.graphId) {
      session.graphId = generateGraphId();
      saveSession(session);
    }

    return session;
  } catch {
    return null;
  }
}

export function deleteSession(id: string): boolean {
  const filePath = join(SESSIONS_DIR, `${id}.json`);
  if (!existsSync(filePath)) {
    return false;
  }
  try {
    unlinkSync(filePath);
    // If deleting current session, clear the current session reference
    if (getCurrentSessionId() === id) {
      clearCurrentSession();
    }
    return true;
  } catch {
    return false;
  }
}

export function listSessions(): SessionMeta[] {
  ensureDir();
  try {
    const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
    const sessions: SessionMeta[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(join(SESSIONS_DIR, file), 'utf-8');
        const session = JSON.parse(content) as Session;
        sessions.push({
          id: session.id,
          name: session.name,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length,
        });
      } catch {
        // Skip corrupted files
      }
    }

    // Sort by updatedAt descending (most recent first)
    return sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function getCurrentSessionId(): string | null {
  if (!existsSync(CURRENT_SESSION_FILE)) {
    return null;
  }
  try {
    return readFileSync(CURRENT_SESSION_FILE, 'utf-8').trim();
  } catch {
    return null;
  }
}

export function setCurrentSessionId(id: string): void {
  ensureDir();
  writeFileSync(CURRENT_SESSION_FILE, id);
}

export function clearCurrentSession(): void {
  if (existsSync(CURRENT_SESSION_FILE)) {
    unlinkSync(CURRENT_SESSION_FILE);
  }
}

export function getOrCreateCurrentSession(): Session {
  const currentId = getCurrentSessionId();
  if (currentId) {
    const session = loadSession(currentId);
    if (session) {
      return session;
    }
  }
  // Create new session if none exists or current is invalid
  return createSession();
}

export function renameSession(id: string, newName: string): boolean {
  const session = loadSession(id);
  if (!session) {
    return false;
  }
  session.name = newName;
  saveSession(session);
  return true;
}
