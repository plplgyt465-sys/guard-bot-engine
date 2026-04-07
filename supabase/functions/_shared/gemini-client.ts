/**
 * Unofficial Gemini API Client
 * 
 * Uses unofficial Gemini endpoint (google.com/_/BardChatUi)
 * No authentication required - perfect for autonomous agents
 * 
 * Supports:
 * - Streaming responses
 * - Rate limiting
 * - Error recovery with retry logic
 * - Context window optimization
 */

import { fetch } from "https://deno.land/std@0.208.0/http/mod.ts";

export interface GeminiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GeminiResponse {
  text: string;
  timestamp: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export class GeminiClient {
  private static readonly URL = "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";
  private static readonly HEADERS = {
    "accept": "*/*",
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    "x-same-domain": "1",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  };

  private conversationHistory: GeminiMessage[] = [];
  private rateLimitResetTime = 0;
  private requestCount = 0;
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MAX_REQUESTS_PER_MINUTE = 20;

  constructor(initialHistory?: GeminiMessage[]) {
    this.conversationHistory = initialHistory || [];
  }

  /**
   * Build optimized payload for Gemini API
   */
  private buildPayload(prompt: string): string {
    const inner = [
      [prompt, 0, null, null, null, null, 0],
      ["en-US"],
      ["", "", "", null, null, null, null, null, null, ""],
      "", "", null, [0], 1, null, null, 1, 0,
      null, null, null, null, null, [[0]], 0
    ];

    const outer = [null, JSON.stringify(inner)];

    const params = new URLSearchParams({
      "f.req": JSON.stringify(outer)
    });

    return params.toString() + "&";
  }

  /**
   * Parse streaming response from Gemini
   */
  private parseResponse(text: string): string {
    text = text.replace(")]}'", "");
    let best = "";

    for (const line of text.split("\n")) {
      if (!line.includes("wrb.fr")) continue;

      try {
        const data = JSON.parse(line);
        const entries = [];

        if (Array.isArray(data)) {
          if (data[0] === "wrb.fr") {
            entries.push(data);
          } else {
            entries.push(...data.filter((i: any) => Array.isArray(i) && i[0] === "wrb.fr"));
          }
        }

        for (const entry of entries) {
          try {
            const inner = JSON.parse(entry[2]);

            if (Array.isArray(inner) && Array.isArray(inner[4])) {
              for (const c of inner[4]) {
                if (Array.isArray(c) && Array.isArray(c[1])) {
                  const txt = c[1].filter((t: any) => typeof t === "string").join("");
                  if (txt.length > best.length) {
                    best = txt;
                  }
                }
              }
            }
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }

    return best.trim();
  }

  /**
   * Check rate limits
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    
    if (now > this.rateLimitResetTime) {
      this.rateLimitResetTime = now + this.RATE_LIMIT_WINDOW;
      this.requestCount = 0;
    }

    if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
      return false;
    }

    this.requestCount++;
    return true;
  }

  /**
   * Make request to Gemini with retry logic
   */
  async request(prompt: string, maxRetries = 3): Promise<GeminiResponse> {
    // Check rate limit
    if (!this.checkRateLimit()) {
      throw new Error("Rate limit exceeded. Please wait before making another request.");
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const payload = this.buildPayload(prompt);

        const response = await fetch(GeminiClient.URL, {
          method: "POST",
          headers: GeminiClient.HEADERS,
          body: payload,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();
        const parsedText = this.parseResponse(text);

        if (!parsedText) {
          throw new Error("Empty response from Gemini");
        }

        // Add to conversation history
        this.conversationHistory.push(
          { role: 'user', content: prompt },
          { role: 'assistant', content: parsedText }
        );

        return {
          text: parsedText,
          timestamp: new Date().toISOString(),
          usage: {
            input_tokens: Math.ceil(prompt.length / 4),
            output_tokens: Math.ceil(parsedText.length / 4),
          }
        };
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries - 1) {
          // Exponential backoff
          const waitTime = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError || new Error("Failed to get response from Gemini after retries");
  }

  /**
   * Get conversation history
   */
  getHistory(): GeminiMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Add message to history (for manual context building)
   */
  addMessage(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get context window utilization
   */
  getContextUsage(): { messages: number; approximateTokens: number } {
    const approximateTokens = this.conversationHistory.reduce(
      (acc, msg) => acc + Math.ceil(msg.content.length / 4),
      0
    );

    return {
      messages: this.conversationHistory.length,
      approximateTokens
    };
  }

  /**
   * Compress old history when approaching token limits
   * Keeps last N messages in full, summarizes older ones
   */
  compressHistory(keepFullMessages = 20): void {
    if (this.conversationHistory.length <= keepFullMessages) return;

    const olderMessages = this.conversationHistory.slice(0, -keepFullMessages);
    const recentMessages = this.conversationHistory.slice(-keepFullMessages);

    // Create a summary of older messages
    const summary = {
      role: 'assistant' as const,
      content: `[COMPRESSED HISTORY] Previous conversation summary: ${olderMessages.length} messages covering topics: ${this.extractTopics(olderMessages)}. Context preserved for continuity.`
    };

    this.conversationHistory = [summary, ...recentMessages];
  }

  /**
   * Extract topics from messages for compression
   */
  private extractTopics(messages: GeminiMessage[]): string {
    const topics = new Set<string>();
    
    for (const msg of messages) {
      // Extract first few words as topic indicators
      const words = msg.content.split(' ').slice(0, 3).join(' ');
      if (words) topics.add(words);
    }

    return Array.from(topics).slice(0, 5).join(', ');
  }
}

/**
 * Singleton instance for use across the agent
 */
let geminiInstance: GeminiClient | null = null;

export function getGeminiClient(history?: GeminiMessage[]): GeminiClient {
  if (!geminiInstance) {
    geminiInstance = new GeminiClient(history);
  }
  return geminiInstance;
}

export function resetGeminiClient(): void {
  geminiInstance = null;
}
