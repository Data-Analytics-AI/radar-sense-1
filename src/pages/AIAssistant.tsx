import { useState, useRef, useEffect } from 'react';
import {
  Sparkles, Send, MessageSquare, FileText, AlertTriangle,
  Loader2, Trash2, Bot, User, CreditCard, BarChart3, Briefcase,
  Plus, History,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAIChat, type ChatMessage, type ChatSessionMeta } from '@/hooks/useAIChat';
import { AIResponseRenderer } from '@/components/ai/AIResponseRenderer';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const SESSIONS_KEY = ['/api/chat-sessions'] as const;

const suggestedQueries = [
  { text: "Why was transaction TXN-A7X3F2 flagged?", icon: CreditCard, category: "Transaction" },
  { text: "Show me structuring patterns for CUST-4521", icon: User, category: "Customer" },
  { text: "What are the top fraud indicators this week?", icon: BarChart3, category: "Analytics" },
  { text: "Draft a SAR narrative for case CASE-B9K2M", icon: FileText, category: "SAR" },
  { text: "Summarize case CASE-B9K2M with timeline", icon: Briefcase, category: "Case" },
];

function StreamingIndicator() {
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
        <span>Analyzing...</span>
      </div>
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  if (message.isStreaming || !message.envelope) {
    if (!message.content) {
      return <StreamingIndicator />;
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span>Processing response...</span>
        </div>
        <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-40 overflow-hidden opacity-50">
          {message.content.slice(0, 300)}...
        </div>
      </div>
    );
  }

  return <AIResponseRenderer envelope={message.envelope} />;
}

const AIAssistant = () => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const {
    messages, isLoading, sendMessage, clearMessages,
    sessionId, loadSession, startNewChat,
  } = useAIChat({
    onError: (error) => {
      toast({
        title: "AI Assistant Error",
        description: error,
        variant: "destructive",
      });
    },
  });

  const sessionsQuery = useQuery<ChatSessionMeta[]>({
    queryKey: SESSIONS_KEY,
    refetchOnMount: true,
  });

  // Auto-refresh the sidebar after a message is persisted (signalled by sessionId update + isLoading -> false).
  useEffect(() => {
    if (!isLoading && sessionId) {
      qc.invalidateQueries({ queryKey: SESSIONS_KEY });
    }
  }, [isLoading, sessionId, qc]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (overrideMessage?: string) => {
    const text = overrideMessage || input.trim();
    if (!text || isLoading) return;
    setInput('');
    await sendMessage(text);
  };

  const handleSelectSession = async (id: string) => {
    if (id === sessionId) return;
    await loadSession(id);
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest('DELETE', `/api/chat-sessions/${id}`);
      toast({ title: 'Chat deleted' });
      if (id === sessionId) startNewChat();
      qc.invalidateQueries({ queryKey: SESSIONS_KEY });
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  const sessions = sessionsQuery.data ?? [];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-fade-in" data-testid="ai-assistant-page">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Investigation Assistant
          </h1>
          <p className="text-muted-foreground">Context-aware fraud analysis with structured responses</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={startNewChat} data-testid="button-new-chat">
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearMessages} data-testid="button-clear-chat">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Chat
            </Button>
          )}
          <Badge variant="outline" className="border-primary/30 text-primary">
            <span className="w-2 h-2 rounded-full bg-primary mr-2 animate-pulse" />
            Connected
          </Badge>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        <div className="flex-1 flex flex-col stat-card p-0 overflow-hidden">
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-8">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold mb-2">How can I help you today?</h2>
                <p className="text-muted-foreground text-center max-w-md text-sm mb-6">
                  Ask about transactions, customers, cases, or trends. Responses are automatically structured for analyst workflows.
                </p>
                <div className="grid grid-cols-1 gap-2 w-full max-w-md">
                  {suggestedQueries.slice(0, 3).map((query, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(query.text)}
                      disabled={isLoading}
                      className="text-left text-sm p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-all disabled:opacity-50 flex items-center gap-3"
                      data-testid={`button-suggested-query-${i}`}
                    >
                      <query.icon className="h-4 w-4 text-primary flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{query.category}</span>
                        <p className="text-xs text-foreground">{query.text}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn('flex gap-3', message.role === 'user' && 'flex-row-reverse')}
                    data-testid={`chat-message-${message.role}-${index}`}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      message.role === 'assistant' ? 'bg-primary/20' : 'bg-muted'
                    )}>
                      {message.role === 'assistant' ? (
                        <Bot className="h-4 w-4 text-primary" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className={cn(
                      'rounded-lg max-w-[85%]',
                      message.role === 'assistant'
                        ? 'flex-1 bg-muted/30 border border-border p-4'
                        : 'bg-primary/10 border border-primary/20 ml-auto p-3'
                    )}>
                      {message.role === 'assistant' ? (
                        <AssistantMessage message={message} />
                      ) : (
                        <p className="text-sm text-foreground">{message.content}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="p-4 border-t border-border">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex gap-2"
            >
              <Input
                placeholder="Ask about transactions, patterns, or cases..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                data-testid="input-chat-message"
              />
              <Button type="submit" disabled={isLoading || !input.trim()} data-testid="button-send-message">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </div>

        <div className="w-80 space-y-4 hidden lg:flex lg:flex-col min-h-0">
          <div className="stat-card flex flex-col min-h-0 flex-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <History className="h-4 w-4 text-primary" /> Past Chats
              </h3>
              <Badge variant="outline" className="text-[10px]" data-testid="badge-chat-count">
                {sessions.length}
              </Badge>
            </div>
            {sessionsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">
                Past chats will appear here once you send your first message.
              </p>
            ) : (
              <ScrollArea className="flex-1 -mx-2">
                <div className="space-y-1 px-2">
                  {sessions.map(s => (
                    <div
                      key={s.id}
                      className={cn(
                        'group flex items-start gap-2 p-2 rounded-md text-xs cursor-pointer border transition-colors',
                        s.id === sessionId
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-transparent hover:bg-muted/50'
                      )}
                      onClick={() => handleSelectSession(s.id)}
                      data-testid={`button-past-chat-${s.id}`}
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground truncate">{s.title}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {s.lastMessagePreview || `${s.messageCount} messages`}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteSession(s.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        aria-label="Delete chat"
                        data-testid={`button-delete-chat-${s.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="stat-card">
            <h3 className="text-sm font-medium mb-3">Suggested Queries</h3>
            <div className="space-y-2">
              {suggestedQueries.map((query, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(query.text)}
                  disabled={isLoading}
                  className="w-full text-left text-xs p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-2"
                  data-testid={`button-sidebar-query-${i}`}
                >
                  <query.icon className="h-3 w-3 text-primary flex-shrink-0" />
                  <span>{query.text}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
