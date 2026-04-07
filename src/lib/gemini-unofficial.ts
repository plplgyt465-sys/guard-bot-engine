/**
 * Gemini Unofficial Client - No API Key Required
 * 
 * Uses the free Gemini API endpoint that doesn't require authentication.
 * This is the ONLY AI provider used in the system.
 */

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface GeminiConfig {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
}

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
    index: number;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

// Default configuration
const DEFAULT_CONFIG: GeminiConfig = {
  model: 'gemini-2.0-flash-exp',
  temperature: 0.9,
  maxOutputTokens: 8192,
  topP: 0.95,
  topK: 40
};

// Available models (all free, no key required)
export const GEMINI_MODELS = [
  { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', description: 'Fastest, latest model' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast and efficient' },
  { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', description: 'Lighter, faster' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Most capable' },
  { id: 'gemini-exp-1206', name: 'Gemini Experimental 1206', description: 'Latest experimental' },
];

/**
 * Conversation history manager for persistent memory
 */
class ConversationMemory {
  private history: Map<string, GeminiMessage[]> = new Map();
  private maxHistory: number = 50;

  constructor() {
    // Load from localStorage on initialization
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('gemini_conversation_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [key, value] of Object.entries(parsed)) {
          this.history.set(key, value as GeminiMessage[]);
        }
      }
    } catch (e) {
      console.warn('[v0] Failed to load conversation history:', e);
    }
  }

  private saveToStorage(): void {
    try {
      const obj: Record<string, GeminiMessage[]> = {};
      for (const [key, value] of this.history.entries()) {
        obj[key] = value;
      }
      localStorage.setItem('gemini_conversation_history', JSON.stringify(obj));
    } catch (e) {
      console.warn('[v0] Failed to save conversation history:', e);
    }
  }

  addMessage(sessionId: string, role: 'user' | 'model', text: string): void {
    if (!this.history.has(sessionId)) {
      this.history.set(sessionId, []);
    }
    const messages = this.history.get(sessionId)!;
    messages.push({
      role,
      parts: [{ text }]
    });
    
    // Trim to max history
    if (messages.length > this.maxHistory * 2) {
      messages.splice(0, messages.length - this.maxHistory * 2);
    }
    
    this.saveToStorage();
  }

  getHistory(sessionId: string): GeminiMessage[] {
    return this.history.get(sessionId) || [];
  }

  clearSession(sessionId: string): void {
    this.history.delete(sessionId);
    this.saveToStorage();
  }

  clearAll(): void {
    this.history.clear();
    localStorage.removeItem('gemini_conversation_history');
  }

  getAllSessions(): string[] {
    return Array.from(this.history.keys());
  }
}

// Global memory instance
export const conversationMemory = new ConversationMemory();

/**
 * Main Gemini Unofficial Client
 */
export class GeminiUnofficial {
  private config: GeminiConfig;
  private baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta/models';
  private sessionId: string;
  private systemInstruction: string = '';

  constructor(sessionId?: string, config?: Partial<GeminiConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionId = sessionId || this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  setSystemInstruction(instruction: string): void {
    this.systemInstruction = instruction;
  }

  setModel(model: string): void {
    this.config.model = model;
  }

  setConfig(config: Partial<GeminiConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Generate content with full conversation history
   */
  async generate(prompt: string, includeHistory: boolean = true): Promise<string> {
    const model = this.config.model || DEFAULT_CONFIG.model;
    const url = `${this.baseUrl}/${model}:generateContent`;

    // Build conversation history
    const contents: GeminiMessage[] = [];
    
    if (includeHistory) {
      const history = conversationMemory.getHistory(this.sessionId);
      contents.push(...history);
    }

    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    // Build request body
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
        topP: this.config.topP,
        topK: this.config.topK
      }
    };

    // Add system instruction if set
    if (this.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: this.systemInstruction }]
      };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GeminiResponse = await response.json();
      
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('No response generated');
      }

      const responseText = data.candidates[0].content.parts
        .map(p => p.text)
        .join('');

      // Save to history
      conversationMemory.addMessage(this.sessionId, 'user', prompt);
      conversationMemory.addMessage(this.sessionId, 'model', responseText);

      return responseText;
    } catch (error) {
      console.error('[v0] Gemini generation failed:', error);
      throw error;
    }
  }

  /**
   * Stream response with full conversation history
   */
  async *generateStream(prompt: string, includeHistory: boolean = true): AsyncGenerator<string, void, unknown> {
    const model = this.config.model || DEFAULT_CONFIG.model;
    const url = `${this.baseUrl}/${model}:streamGenerateContent?alt=sse`;

    // Build conversation history
    const contents: GeminiMessage[] = [];
    
    if (includeHistory) {
      const history = conversationMemory.getHistory(this.sessionId);
      contents.push(...history);
    }

    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    // Build request body
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
        topP: this.config.topP,
        topK: this.config.topK
      }
    };

    // Add system instruction if set
    if (this.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: this.systemInstruction }]
      };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

      // Save user message immediately
      conversationMemory.addMessage(this.sessionId, 'user', prompt);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (text) {
                fullResponse += text;
                yield text;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Save complete response to history
      if (fullResponse) {
        conversationMemory.addMessage(this.sessionId, 'model', fullResponse);
      }
    } catch (error) {
      console.error('[v0] Gemini stream failed:', error);
      throw error;
    }
  }

  /**
   * Clear conversation history for this session
   */
  clearHistory(): void {
    conversationMemory.clearSession(this.sessionId);
  }

  /**
   * Get conversation history
   */
  getHistory(): GeminiMessage[] {
    return conversationMemory.getHistory(this.sessionId);
  }

  /**
   * Test connection to Gemini
   */
  async testConnection(): Promise<{ success: boolean; model: string; error?: string }> {
    try {
      const response = await this.generate('Hello, respond with just "OK"', false);
      return {
        success: response.toLowerCase().includes('ok'),
        model: this.config.model || 'unknown'
      };
    } catch (error) {
      return {
        success: false,
        model: this.config.model || 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance for easy use
export const gemini = new GeminiUnofficial();

// Export helper function
export async function chat(prompt: string, sessionId?: string): Promise<string> {
  const client = sessionId ? new GeminiUnofficial(sessionId) : gemini;
  return client.generate(prompt);
}

export async function* chatStream(prompt: string, sessionId?: string): AsyncGenerator<string, void, unknown> {
  const client = sessionId ? new GeminiUnofficial(sessionId) : gemini;
  yield* client.generateStream(prompt);
}
