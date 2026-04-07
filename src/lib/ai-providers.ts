/**
 * AI Provider - Gemini Unofficial ONLY
 * 
 * This module provides Gemini unofficial API as the ONLY AI provider.
 * No API keys, tokens, or cookies required.
 */

import { GeminiUnofficial, GEMINI_MODELS, conversationMemory } from './gemini-unofficial';
import { skillsEngine, SkillsEngine } from './skills-engine';

// Re-export Gemini types
export { GEMINI_MODELS, conversationMemory };

// Single AI Provider - Gemini Unofficial
export interface AIProvider {
  id: string;
  name: string;
  nameAr: string;
  models: { id: string; name: string; description?: string }[];
  requiresKey: boolean;
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "gemini-unofficial",
    name: "Gemini (Free - No Key Required)",
    nameAr: "جيميني (مجاني - بدون مفتاح)",
    models: GEMINI_MODELS,
    requiresKey: false
  }
];

// Current settings (simplified - no API keys needed)
export interface AIProviderSettings {
  providerId: string;
  modelId: string;
  enabled: boolean;
}

// Default to Gemini 3.1 Pro (free via Puter.js)
const DEFAULT_SETTINGS: AIProviderSettings = {
  providerId: 'gemini-unofficial',
  modelId: 'gemini-3.1-pro-preview',
  enabled: true
};

// Settings stored in localStorage
const SETTINGS_KEY = 'ai_provider_settings';

export function getAIProviderSettings(): AIProviderSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('[v0] Failed to load AI settings:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveAIProviderSettings(settings: AIProviderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[v0] Failed to save AI settings:', e);
  }
}

export function clearAIProviderSettings(): void {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch (e) {
    console.warn('[v0] Failed to clear AI settings:', e);
  }
}

// ============================================================================
// UNIFIED AI CLIENT - Uses Gemini + Skills Engine
// ============================================================================

export class UnifiedAIClient {
  private gemini: GeminiUnofficial;
  private skills: SkillsEngine;
  private sessionId: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || `unified_${Date.now()}`;
    const settings = getAIProviderSettings();
    this.gemini = new GeminiUnofficial(this.sessionId, settings.modelId);
    this.skills = new SkillsEngine(this.sessionId);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Process a message - automatically uses skills when appropriate
   */
  async chat(message: string, options?: {
    useSkills?: boolean;
    systemPrompt?: string;
  }): Promise<string> {
    const useSkills = options?.useSkills !== false;

    // Try to match a skill first
    if (useSkills) {
      const match = await this.skills.selectSkill(message);
      if (match && match.score >= 10) {
        console.log(`[v0] Using skill: ${match.skill.name} (score: ${match.score})`);
        const result = await this.skills.run(message);
        if (result.execution?.success) {
          return result.execution.output;
        }
      }
    }

    // Fall back to direct Gemini chat
    if (options?.systemPrompt) {
      this.gemini.setSystemInstruction(options.systemPrompt);
    }
    return this.gemini.generate(message);
  }

  /**
   * Stream a chat response
   */
  async *chatStream(message: string, options?: {
    useSkills?: boolean;
    systemPrompt?: string;
  }): AsyncGenerator<string, void, unknown> {
    const useSkills = options?.useSkills !== false;

    // Try skills first
    if (useSkills) {
      const match = await this.skills.selectSkill(message);
      if (match && match.score >= 10) {
        for await (const update of this.skills.runStream(message)) {
          if (update.content) {
            yield update.content;
          }
        }
        return;
      }
    }

    // Fall back to direct streaming
    if (options?.systemPrompt) {
      this.gemini.setSystemInstruction(options.systemPrompt);
    }
    yield* this.gemini.generateStream(message);
  }

  /**
   * Get conversation history
   */
  getHistory() {
    return this.gemini.getHistory();
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.gemini.clearHistory();
  }

  /**
   * Test connection to Gemini
   */
  async testConnection(): Promise<{ success: boolean; model: string; error?: string }> {
    return this.gemini.testConnection();
  }

  /**
   * Get skills engine for direct access
   */
  getSkillsEngine(): SkillsEngine {
    return this.skills;
  }

  /**
   * Get Gemini client for direct access
   */
  getGeminiClient(): GeminiUnofficial {
    return this.gemini;
  }
}

// Export singleton
export const aiClient = new UnifiedAIClient();

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================

// These are kept for backward compatibility but they don't do anything with API keys
export interface APIKeyEntry {
  key: string;
  label: string;
  status?: "unknown" | "valid" | "invalid" | "no_balance";
  balance?: string;
  lastChecked?: number;
}

export type ProviderKeysMap = Record<string, APIKeyEntry[]>;

export async function updateKeyStatus(_keyIndex: number, _status: APIKeyEntry["status"], _balance?: string): Promise<void> {
  // No-op - Gemini unofficial doesn't need API keys
}

// Security API providers (kept for compatibility)
export interface SecurityAPIProvider {
  id: string;
  name: string;
  nameAr: string;
  apiKeyUrl: string;
  description: string;
}

export const SECURITY_API_PROVIDERS: SecurityAPIProvider[] = [
  {
    id: "virustotal",
    name: "VirusTotal",
    nameAr: "فايروس توتال",
    apiKeyUrl: "https://www.virustotal.com/gui/my-apikey",
    description: "فحص URLs والنطاقات و IPs من البرمجيات الخبيثة",
  },
];
