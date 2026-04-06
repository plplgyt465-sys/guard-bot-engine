import { useState, useRef, useEffect, useCallback } from "react";
import { Shield, Terminal, Wrench, Plus, Trash2, History, Download } from "lucide-react";
import { AgentSettingsDialog, getAgentCustomPrompt } from "@/components/AgentSettingsDialog";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { SuggestionChips } from "@/components/SuggestionChips";
import { ExecutionResult } from "@/components/ExecutionResult";
import { streamChat, type ChatMessage as ChatMsg } from "@/lib/chat-stream";
import { fetchSessions, createSession, updateSessionMessages, deleteSession, type ChatSession } from "@/lib/chat-sessions";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [executionResults, setExecutionResults] = useState<string[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Load sessions on mount
  useEffect(() => {
    fetchSessions().then(setSessions).catch(console.error);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, executionResults]);

  // Save messages to DB whenever they change
  const saveMessages = useCallback(async (sessionId: string, msgs: ChatMsg[]) => {
    if (msgs.length === 0) return;
    try {
      await updateSessionMessages(sessionId, msgs);
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: msgs, title: msgs.find(m => m.role === "user")?.content?.slice(0, 50) || s.title, updated_at: new Date().toISOString() } : s));
    } catch (e) { console.error("Failed to save session:", e); }
  }, []);

  const startNewChat = async () => {
    try {
      const session = await createSession();
      setSessions(prev => [session, ...prev]);
      setCurrentSessionId(session.id);
      setMessages([]);
      setExecutionResults([]);
    } catch (e) {
      console.error(e);
    }
  };

  const loadSession = async (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setExecutionResults([]);
    setShowSidebar(false);
    // Always fetch fresh messages from DB
    try {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("id", session.id)
        .maybeSingle();
      if (data) {
        const msgs = (data.messages || []) as ChatMsg[];
        setMessages(msgs);
        setSessions(prev => prev.map(s => s.id === session.id ? { ...s, messages: msgs } : s));
      } else {
        setMessages(session.messages);
      }
    } catch {
      setMessages(session.messages);
    }
  };

  const removeSession = async (id: string) => {
    try {
      await deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch (e) { console.error(e); }
  };

  const send = async (input: string) => {
    let sessionId = currentSessionId;
    if (!sessionId) {
      try {
        const session = await createSession(input.slice(0, 50));
        setSessions(prev => [session, ...prev]);
        sessionId = session.id;
        setCurrentSessionId(sessionId);
      } catch (e) {
        console.error(e);
        return;
      }
    }

    const userMsg: ChatMsg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: newMessages,
        customSystemPrompt: getAgentCustomPrompt() || undefined,
        onDelta: (chunk) => upsertAssistant(chunk),
        onDone: () => {
          setIsLoading(false);
          // Save after streaming completes
          setMessages(prev => {
            saveMessages(sessionId!, prev);
            return prev;
          });
        },
        onError: (error) => {
          setIsLoading(false);
          toast({ title: "خطأ", description: error, variant: "destructive" });
        },
      });
    } catch (e) {
      console.error(e);
      setIsLoading(false);
      toast({ title: "خطأ", description: "فشل الاتصال بالوكيل", variant: "destructive" });
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Chat History Sidebar */}
      <aside className={`${showSidebar ? 'flex' : 'hidden'} md:hidden fixed inset-0 z-50 bg-background flex-col w-full`}>
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">سجل المحادثات</h2>
          </div>
          <button onClick={() => setShowSidebar(false)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
        </div>
        <div className="p-2">
          <button onClick={startNewChat} className="w-full flex items-center gap-2 p-2 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors">
            <Plus className="w-4 h-4" /> محادثة جديدة
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map(s => (
            <div key={s.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm transition-colors ${s.id === currentSessionId ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'}`}>
              <button onClick={() => loadSession(s)} className="flex-1 text-right truncate">{s.title}</button>
              <button onClick={() => removeSession(s.id)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </aside>

      {/* Desktop Sessions Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-primary" />
            المحادثات
          </span>
          <button onClick={startNewChat} className="text-primary hover:text-primary/80 p-1 rounded hover:bg-primary/10 transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessions.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-6 px-2">لا توجد محادثات بعد.<br />ابدأ محادثة جديدة.</p>
          )}
          {sessions.map(s => (
            <div key={s.id} className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${s.id === currentSessionId ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <button onClick={() => loadSession(s)} className="flex-1 text-right truncate">{s.title}</button>
              <button onClick={() => removeSession(s.id)} className="hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center animate-pulse-glow">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
                CyberGuard AI
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">AGENT</span>
              </h1>
              <p className="text-xs text-muted-foreground">وكيل أمن سيبراني ذكي • تنفيذ أكواد حقيقي</p>
            </div>

            {/* Mobile header actions */}
            <div className="ml-auto flex md:hidden gap-1">
              <AgentSettingsDialog />
              <button onClick={() => setShowSidebar(true)} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                <History className="w-4 h-4" />
              </button>
              <Link to="/tools" className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                <Wrench className="w-4 h-4" />
              </Link>
            </div>

            {/* Desktop header actions */}
            <div className="hidden md:flex ml-auto items-center gap-2">
              <AgentSettingsDialog />
              <Link to="/tools" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-lg hover:bg-primary/10 border border-border">
                <Wrench className="w-3.5 h-3.5" />
                <span>الأدوات</span>
              </Link>
              <Link to="/terminal" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-lg hover:bg-primary/10 border border-border">
                <Terminal className="w-3.5 h-3.5" />
                <span>Terminal</span>
              </Link>
              <Link to="/install" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-lg hover:bg-primary/10 border border-border">
                <Download className="w-3.5 h-3.5" />
                <span>تثبيت</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto" ref={scrollRef}>
          <div className="max-w-4xl mx-auto p-4 space-y-4">
            {messages.length === 0 && executionResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center animate-pulse-glow">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-display font-bold text-foreground">CyberGuard AI</h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    وكيل ذكاء اصطناعي متخصص في الأمن السيبراني مع قدرة تنفيذ أكواد حقيقية.
                    <br />
                    استخدم الأدوات الجانبية أو اسأل الوكيل مباشرة.
                  </p>
                </div>
                <SuggestionChips onSelect={send} />
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <ChatMessage key={i} message={msg} isStreaming={isLoading && i === messages.length - 1 && msg.role === "assistant"} />
                ))}
                {executionResults.map((result, i) => (
                  <ExecutionResult key={`exec-${i}`} result={result} onClose={() => setExecutionResults((prev) => prev.filter((_, idx) => idx !== i))} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Input */}
        <ChatInput onSend={send} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default Index;
