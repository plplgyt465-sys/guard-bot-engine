/**
 * Gemini Unofficial Client - No API Key Required
 * 
 * Uses Puter.js for FREE, UNLIMITED access to Gemini models
 * No API keys, no cookies, no tokens needed - just works!
 */

// Puter.js types
declare global {
  interface Window {
    puter: {
      ai: {
        chat: (
          prompt: string | Array<{ role: string; content: string }>,
          options?: {
            model?: string;
            stream?: boolean;
          }
        ) => Promise<string | AsyncIterable<{ text?: string }>>;
      };
      print: (text: string) => void;
    };
  }
}

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface GeminiConfig {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

// Available FREE models via Puter.js (no API key needed!)
export const GEMINI_MODELS = [
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', description: 'Most capable, latest model' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: 'Fast and efficient' },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', description: 'Fastest, cost-efficient' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', description: 'Powerful reasoning' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Stable and reliable' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast responses' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Legacy fast model' },
];

const DEFAULT_MODEL = 'gemini-3.1-pro-preview';

// Flag to track if Puter.js is loaded
let puterLoaded = false;
let puterLoadPromise: Promise<void> | null = null;

/**
 * Load Puter.js dynamically
 */
async function loadPuter(): Promise<void> {
  if (puterLoaded && window.puter) {
    return;
  }

  if (puterLoadPromise) {
    return puterLoadPromise;
  }

  puterLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.puter) {
      puterLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.puter.com/v2/';
    script.async = true;
    
    script.onload = () => {
      // Wait a bit for puter to initialize
      const checkPuter = () => {
        if (window.puter) {
          puterLoaded = true;
          console.log('[Gemini] Puter.js loaded successfully - FREE Gemini access enabled!');
          resolve();
        } else {
          setTimeout(checkPuter, 100);
        }
      };
      checkPuter();
    };
    
    script.onerror = () => {
      reject(new Error('Failed to load Puter.js'));
    };
    
    document.head.appendChild(script);
  });

  return puterLoadPromise;
}

/**
 * Conversation memory manager for persistent history
 */
class ConversationMemory {
  private history: Map<string, GeminiMessage[]> = new Map();
  private maxHistory: number = 100; // Keep more history for context

  constructor() {
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
      console.warn('[Gemini] Failed to load history:', e);
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
      console.warn('[Gemini] Failed to save history:', e);
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

  getFormattedHistory(sessionId: string): Array<{ role: string; content: string }> {
    const history = this.getHistory(sessionId);
    return history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.parts.map(p => p.text).join('\n')
    }));
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
 * Main Gemini Client using Puter.js (FREE, no API key!)
 */
export class GeminiUnofficial {
  private model: string;
  private sessionId: string;
  private systemInstruction: string = '';

  constructor(sessionId?: string, model?: string) {
    this.model = model || DEFAULT_MODEL;
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
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  /**
   * Generate content with conversation history
   */
  async generate(prompt: string, includeHistory: boolean = true): Promise<string> {
    // Ensure Puter.js is loaded
    await loadPuter();

    // Build messages array with history
    const messages: Array<{ role: string; content: string }> = [];

    // Add system instruction if set
    if (this.systemInstruction) {
      messages.push({
        role: 'system',
        content: this.systemInstruction
      });
    }

    // Add conversation history
    if (includeHistory) {
      const history = conversationMemory.getFormattedHistory(this.sessionId);
      messages.push(...history);
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: prompt
    });

    try {
      // Use Puter.js chat - this is FREE!
      const response = await window.puter.ai.chat(
        messages.length === 1 ? prompt : messages,
        { model: this.model }
      );

      const responseText = typeof response === 'string' ? response : '';

      // Save to history
      conversationMemory.addMessage(this.sessionId, 'user', prompt);
      conversationMemory.addMessage(this.sessionId, 'model', responseText);

      return responseText;
    } catch (error) {
      console.error('[Gemini] Generation failed:', error);
      throw error;
    }
  }

  /**
   * Stream response with conversation history
   */
  async *generateStream(prompt: string, includeHistory: boolean = true): AsyncGenerator<string, void, unknown> {
    // Ensure Puter.js is loaded
    await loadPuter();

    // Build messages array with history
    const messages: Array<{ role: string; content: string }> = [];

    // Add system instruction if set
    if (this.systemInstruction) {
      messages.push({
        role: 'system',
        content: this.systemInstruction
      });
    }

    // Add conversation history
    if (includeHistory) {
      const history = conversationMemory.getFormattedHistory(this.sessionId);
      messages.push(...history);
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: prompt
    });

    // Save user message immediately
    conversationMemory.addMessage(this.sessionId, 'user', prompt);

    let fullResponse = '';

    try {
      // Use Puter.js streaming - this is FREE!
      const response = await window.puter.ai.chat(
        messages.length === 1 ? prompt : messages,
        { 
          model: this.model,
          stream: true
        }
      );

      // Handle streaming response
      if (typeof response === 'string') {
        // Non-streaming fallback
        fullResponse = response;
        yield response;
      } else {
        // Streaming response
        for await (const part of response) {
          if (part?.text) {
            fullResponse += part.text;
            yield part.text;
          }
        }
      }

      // Save complete response to history
      if (fullResponse) {
        conversationMemory.addMessage(this.sessionId, 'model', fullResponse);
      }
    } catch (error) {
      console.error('[Gemini] Stream failed:', error);
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
      await loadPuter();
      const response = await window.puter.ai.chat('Say "OK" if you can hear me.', { model: this.model });
      const text = typeof response === 'string' ? response : '';
      return {
        success: text.toLowerCase().includes('ok') || text.length > 0,
        model: this.model
      };
    } catch (error) {
      return {
        success: false,
        model: this.model,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const gemini = new GeminiUnofficial();

// Export helper functions
export async function chat(prompt: string, sessionId?: string): Promise<string> {
  const client = sessionId ? new GeminiUnofficial(sessionId) : gemini;
  return client.generate(prompt);
}

export async function* chatStream(prompt: string, sessionId?: string): AsyncGenerator<string, void, unknown> {
  const client = sessionId ? new GeminiUnofficial(sessionId) : gemini;
  yield* client.generateStream(prompt);
}

// Preload Puter.js on module load
if (typeof window !== 'undefined') {
  loadPuter().catch(console.error);
}
