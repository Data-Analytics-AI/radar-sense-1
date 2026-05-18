import { useState, useCallback, useRef, useEffect } from 'react';
import { parseAIResponse, type AIResponseEnvelope } from '@/lib/ai-response-parser';
import { _notifyFallbackForChat } from '@/lib/ai';
import { apiRequest } from '@/lib/queryClient';
import { actorHeaders } from '@/lib/currentUser';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  userPrompt?: string;
  envelope?: AIResponseEnvelope | null;
  isStreaming?: boolean;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  ownerName: string;
  messageCount: number;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
}

interface UseAIChatOptions {
  onError?: (error: string) => void;
}

async function persistSession(id: string, messages: ChatMessage[]): Promise<ChatSessionMeta | null> {
  try {
    const cleaned = messages
      .filter(m => !m.isStreaming)
      .map(m => ({
        role: m.role,
        content: m.content,
        ...(m.userPrompt ? { userPrompt: m.userPrompt } : {}),
        ...(m.envelope ? { envelope: m.envelope as unknown } : {}),
      }));
    return await apiRequest<ChatSessionMeta>('PUT', `/api/chat-sessions/${id}`, { messages: cleaned });
  } catch (err) {
    console.warn('[useAIChat] persist failed:', err);
    return null;
  }
}

const ACTIVE_SESSION_KEY = 'snapfort.activeChatSessionId';

function readActiveSessionId(): string | null {
  try { return typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_SESSION_KEY) : null; }
  catch { return null; }
}
function writeActiveSessionId(id: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (id) window.localStorage.setItem(ACTIVE_SESSION_KEY, id);
    else window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch { /* ignore */ }
}

export function useAIChat(options: UseAIChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const restoreAttemptedRef = useRef(false);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const created = await apiRequest<ChatSessionMeta>('POST', '/api/chat-sessions', {});
    sessionIdRef.current = created.id;
    setSessionId(created.id);
    writeActiveSessionId(created.id);
    return created.id;
  }, []);

  const loadSession = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/chat-sessions/${id}`, { credentials: 'include', headers: actorHeaders() });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      const data = (await res.json()) as { messages: ChatMessage[] };
      sessionIdRef.current = id;
      setSessionId(id);
      writeActiveSessionId(id);
      setMessages(data.messages.map(m => ({ ...m, isStreaming: false })));
    } catch (err) {
      // If the persisted active session id is stale (deleted, foreign owner),
      // forget it so we don't keep failing on every mount.
      writeActiveSessionId(null);
      options.onError?.(err instanceof Error ? err.message : 'Failed to load chat');
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const startNewChat = useCallback(() => {
    sessionIdRef.current = null;
    setSessionId(null);
    setMessages([]);
    writeActiveSessionId(null);
  }, []);

  // On mount, restore the most recently active chat (if any) so that a page
  // refresh transparently brings the conversation back. Best-effort — silent
  // on failure.
  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    const saved = readActiveSessionId();
    if (saved) void loadSession(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(async (input: string) => {
    const userMsg: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    let assistantContent = '';

    try {
      const apiMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Request failed with status ${response.status}`;
        if (response.status === 429) {
          options.onError?.('Rate limit exceeded. Please wait a moment and try again.');
        } else {
          options.onError?.(errorMessage);
        }
        setIsLoading(false);
        return;
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;

      setMessages(prev => [...prev, { role: 'assistant', content: '', userPrompt: input, envelope: null, isStreaming: true }]);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed?.meta?.fallbackUsed) _notifyFallbackForChat(parsed.meta.providerLabel);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (updated[lastIdx]?.role === 'assistant') {
                  updated[lastIdx] = { ...updated[lastIdx], content: assistantContent, isStreaming: true };
                }
                return updated;
              });
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
            }
          } catch { /* ignore */ }
        }
      }

      const envelope = parseAIResponse(input, assistantContent);
      // Build the final assistant message deterministically (don't rely on
      // setState updater callbacks for side-effects like persistence).
      const finalAssistant: ChatMessage = {
        role: 'assistant',
        content: assistantContent,
        userPrompt: input,
        envelope,
        isStreaming: false,
      };
      // `messages` (closure) holds the conversation as it was BEFORE this turn,
      // so the deterministic final transcript is messages + userMsg + finalAssistant.
      const finalMessages: ChatMessage[] = [...messages, userMsg, finalAssistant];
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.role === 'assistant') {
          updated[lastIdx] = finalAssistant;
          return updated;
        }
        return finalMessages;
      });

      // Persist to OBS via the server. Best-effort — failures are logged but
      // never block the user from continuing the conversation.
      try {
        const id = await ensureSession();
        await persistSession(id, finalMessages);
      } catch (err) {
        console.warn('[useAIChat] session persist skipped:', err);
      }

    } catch (error) {
      console.error('Chat error:', error);
      options.onError?.(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  }, [messages, options, ensureSession]);

  const clearMessages = useCallback(() => {
    startNewChat();
  }, [startNewChat]);

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    sessionId,
    loadSession,
    startNewChat,
  };
}
