import { getAIProviderSettings } from "./ai-providers";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cyber-chat`;
const AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cyber-agent`;

// ============================================================================
// AUTONOMOUS AGENT TYPES
// ============================================================================

export type AgentPhase = 'INTENT' | 'PLANNING' | 'EXECUTION' | 'ANALYSIS' | 'DECISION' | 'DONE' | 'ERROR';

export interface AgentSession {
  id: string;
  chat_session_id: string;
  target: string;
  phase: AgentPhase;
  plan: {
    steps: Array<{
      id: string;
      tool: string;
      args: Record<string, unknown>;
      description: string;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
      result?: unknown;
      error?: string;
    }>;
    current_step: number;
    objective: string;
  };
  context: {
    target: string;
    intent: string;
    discovered_info: Record<string, unknown>;
    vulnerabilities: Array<{
      id: string;
      type: string;
      severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
      description: string;
      evidence?: string;
      confirmed?: boolean;
      exploited?: boolean;
      cve?: string;
      cvss?: number;
    }>;
    open_ports: number[];
    services: Array<{ port: number; service: string; version?: string }>;
    technologies: string[];
  };
  findings: unknown[];
  tool_history: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
    timestamp: string;
    duration_ms: number;
    success: boolean;
    error?: string;
  }>;
  step_count: number;
  max_steps: number;
  no_progress_count: number;
  security_score: number | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AgentProgress {
  type: 'progress' | 'complete' | 'paused' | 'error';
  content?: string;
  session?: AgentSession;
  report?: string;
  message?: string;
  error?: string;
}

// ============================================================================
// AUTONOMOUS AGENT FUNCTIONS
// ============================================================================

/**
 * Start a new autonomous agent session
 */
export async function startAutonomousScan({
  chatSessionId,
  target,
  intent,
  onProgress,
  onComplete,
  onError,
}: {
  chatSessionId: string;
  target: string;
  intent?: string;
  onProgress: (progress: AgentProgress) => void;
  onComplete: (session: AgentSession, report: string) => void;
  onError: (error: string) => void;
}): Promise<{ sessionId: string; abort: () => void }> {
  let aborted = false;
  let agentSessionId: string | null = null;

  const abort = () => {
    aborted = true;
    if (agentSessionId) {
      stopAutonomousScan(agentSessionId).catch(console.error);
    }
  };

  try {
    // Step 1: Start the agent session
    const startResponse = await fetch(AGENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        action: 'start',
        chatSessionId,
        target,
        intent,
      }),
    });

    if (!startResponse.ok) {
      const data = await startResponse.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to start agent session');
    }

    const startData = await startResponse.json();
    if (!startData.success || !startData.session) {
      throw new Error(startData.error || 'Failed to create agent session');
    }

    agentSessionId = startData.session.id;
    onProgress({ type: 'progress', content: `Agent session started with ${startData.session.plan.steps.length} planned steps\n`, session: startData.session });

    // Step 2: Continue the agent loop until complete
    while (!aborted) {
      const continueResponse = await fetch(AGENT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          action: 'continue',
          agentSessionId,
          maxSteps: 10,
        }),
      });

      if (!continueResponse.ok) {
        const data = await continueResponse.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to continue agent session');
      }

      // Handle streaming response
      if (continueResponse.body) {
        const reader = continueResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sessionComplete = false;

        while (!aborted && !sessionComplete) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);

            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;

            try {
              const parsed: AgentProgress = JSON.parse(jsonStr);
              onProgress(parsed);

              if (parsed.type === 'complete') {
                sessionComplete = true;
                if (parsed.session && parsed.report) {
                  onComplete(parsed.session, parsed.report);
                }
                return { sessionId: agentSessionId, abort };
              }

              if (parsed.type === 'error') {
                throw new Error(parsed.error || 'Agent error');
              }

              if (parsed.type === 'paused') {
                // Session paused, will continue in next iteration
                break;
              }
            } catch (e) {
              // Ignore parse errors for incomplete data
            }
          }
        }

        if (sessionComplete) break;
      }

      // Small delay before next iteration
      await new Promise(r => setTimeout(r, 1000));
    }

    return { sessionId: agentSessionId, abort };
  } catch (e) {
    onError(e instanceof Error ? e.message : 'Unknown error');
    return { sessionId: agentSessionId || '', abort };
  }
}

/**
 * Stop an autonomous agent session
 */
export async function stopAutonomousScan(agentSessionId: string): Promise<{ session: AgentSession | null; report: string | null }> {
  try {
    const response = await fetch(AGENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        action: 'stop',
        agentSessionId,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to stop agent session');
    }

    const data = await response.json();
    return { session: data.session || null, report: data.report || null };
  } catch (e) {
    console.error('Failed to stop agent:', e);
    return { session: null, report: null };
  }
}

/**
 * Resume an autonomous agent session with continuation intent
 * Supports Arabic commands like "واصل" (continue) and English "continue"
 */
export async function resumeAutonomousScan({
  chatSessionId,
  agentSessionId,
  userIntent,
  onProgress,
  onComplete,
  onError,
}: {
  chatSessionId: string;
  agentSessionId: string;
  userIntent: string; // User's continuation command (e.g., "واصل", "continue")
  onProgress: (progress: AgentProgress) => void;
  onComplete: (session: AgentSession, report: string) => void;
  onError: (error: string) => void;
}): Promise<{ sessionId: string; abort: () => void }> {
  let aborted = false;

  const abort = () => {
    aborted = true;
    if (agentSessionId) {
      stopAutonomousScan(agentSessionId).catch(console.error);
    }
  };

  try {
    onProgress({ type: 'progress', content: `Resolving continuation intent: "${userIntent}"\n` });

    // Resume the agent loop with intent resolution
    while (!aborted) {
      const resumeResponse = await fetch(AGENT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          action: 'resume',
          agentSessionId,
          chatSessionId,
          userIntent,
          maxSteps: 10,
        }),
      });

      if (!resumeResponse.ok) {
        const data = await resumeResponse.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to resume agent session');
      }

      // Handle streaming response
      if (resumeResponse.body) {
        const reader = resumeResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sessionComplete = false;

        while (!aborted && !sessionComplete) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);

            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;

            try {
              const parsed: AgentProgress = JSON.parse(jsonStr);
              onProgress(parsed);

              if (parsed.type === 'complete') {
                sessionComplete = true;
                if (parsed.session && parsed.report) {
                  onComplete(parsed.session, parsed.report);
                }
                return { sessionId: agentSessionId, abort };
              }

              if (parsed.type === 'error') {
                throw new Error(parsed.error || 'Agent error');
              }

              if (parsed.type === 'paused') {
                // Session paused, user can send another resume command
                break;
              }
            } catch (e) {
              // Ignore parse errors for incomplete data
            }
          }
        }

        if (sessionComplete) break;
      }

      // Small delay before next iteration
      await new Promise(r => setTimeout(r, 1000));
    }

    return { sessionId: agentSessionId, abort };
  } catch (e) {
    onError(e instanceof Error ? e.message : 'Unknown error');
    return { sessionId: agentSessionId, abort };
  }
}

/**
 * Check if message is a continuation command for resumed agent execution
 * Supports Arabic: واصل, استمر, كمّل, تابع
 * Supports English: continue, resume, proceed, go on, keep going
 */
export function isContinuationCommand(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();
  
  // Arabic continuation patterns
  const arabicPatterns = [
    /^واصل/,           // continue
    /^استمر/,          // resume
    /^كمّل/,            // complete/continue
    /^تابع/,            // proceed
    /^أكمل/,            // continue
  ];

  // English continuation patterns
  const englishPatterns = [
    /^continue/i,
    /^resume/i,
    /^proceed/i,
    /^go\s+on/i,
    /^keep\s+going/i,
    /^next/i,
  ];

  return (
    arabicPatterns.some(p => p.test(lowerMessage)) ||
    englishPatterns.some(p => p.test(lowerMessage))
  );
}

/**
 * Get the status of an autonomous agent session
 */
export async function getAgentStatus(params: { agentSessionId?: string; chatSessionId?: string }): Promise<AgentSession | null> {
  try {
    const response = await fetch(AGENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        action: 'status',
        ...params,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.session || null;
  } catch (e) {
    console.error('Failed to get agent status:', e);
    return null;
  }
}

/**
 * Check if autonomous mode should be triggered based on user message
 */
export function shouldTriggerAutonomousMode(message: string): { trigger: boolean; target?: string } {
  const lowerMessage = message.toLowerCase();
  
  // Patterns that indicate autonomous scan request
  const autonomousPatterns = [
    /(?:فحص|اختبار|تحليل)\s+(?:شامل|كامل|مستقل|autonomous)/i,
    /(?:comprehensive|full|complete|autonomous)\s+(?:scan|test|assessment)/i,
    /اختبر?\s+(?:بشكل\s+)?(?:مستقل|تلقائي|شامل)/i,
    /افحص?\s+(?:بشكل\s+)?(?:مستقل|تلقائي|شامل)/i,
    /run\s+autonomous/i,
    /start\s+agent/i,
    /ابدأ\s+(?:الوكيل|العميل)/i,
  ];
  
  const isAutonomous = autonomousPatterns.some(p => p.test(message));
  
  if (!isAutonomous) {
    return { trigger: false };
  }
  
  // Extract target from message
  const urlMatch = message.match(/https?:\/\/[^\s]+/i);
  const domainMatch = message.match(/(?:^|\s)([a-zA-Z0-9][-a-zA-Z0-9]*\.)+[a-zA-Z]{2,}(?:\s|$)/);
  
  const target = urlMatch?.[0] || domainMatch?.[0]?.trim();
  
  return { trigger: true, target };
}

export async function streamChat({
  messages,
  customSystemPrompt,
  onDelta,
  onDone,
  onError,
}: {
  messages: ChatMessage[];
  customSystemPrompt?: string;
  onDelta: (deltaText: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  const providerSettings = await getAIProviderSettings();
  const body: any = { messages, customSystemPrompt };

  // Build allProviderKeys from ALL providers that have keys, regardless of enabled state
  const allProviderKeys: { providerId: string; keys: string[] }[] = [];
  if (providerSettings) {
    for (const [pid, keys] of Object.entries(providerSettings.providerKeys || {})) {
      const validKeys = (keys || []).filter(k => k.key.trim()).map(k => k.key);
      if (validKeys.length > 0) {
        allProviderKeys.push({ providerId: pid, keys: validKeys });
      }
    }
  }

  if (providerSettings && providerSettings.enabled) {
    const activeKeys = (providerSettings.providerKeys?.[providerSettings.providerId] || []).filter(k => k.key.trim());
    if (activeKeys.length > 0) {
      allProviderKeys.sort((a, b) => a.providerId === providerSettings.providerId ? -1 : b.providerId === providerSettings.providerId ? 1 : 0);
      body.customProvider = {
        providerId: providerSettings.providerId,
        modelId: providerSettings.modelId,
        apiKey: activeKeys[0].key,
        apiKeys: activeKeys.map(k => k.key),
        allProviderKeys,
      };
    }
  } else if (allProviderKeys.length > 0) {
    // Custom provider disabled but keys exist - send as fallback when default fails
    body.fallbackProviderKeys = allProviderKeys;
  }

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    onError(data.error || "فشل الاتصال بالوكيل");
    return;
  }

  if (!resp.body) {
    onError("لا يوجد استجابة");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamDone = true;
        break;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}
