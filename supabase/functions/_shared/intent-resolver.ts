/**
 * Intent Resolver Module
 * 
 * Understands user continuations in Arabic and English
 * Maps commands like "واصل" (continue), "كمّل" (resume), etc. to actions
 * Features:
 * - Arabic pattern recognition (واصل, استمر, كمّل, تابع)
 * - English pattern recognition (continue, resume, retry, go on)
 * - Context-aware action mapping
 * - Confidence scoring
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type IntentType = "continue" | "resume" | "retry" | "new_task" | "unknown";

export interface IntentResolution {
  type: IntentType;
  confidence: number; // 0 to 1
  original_text: string;
  detected_language: "ar" | "en" | "mixed";
  action: string;
  context_hint?: string;
  should_use_checkpoint: boolean;
}

export interface IntentContext {
  id?: string;
  session_id: string;
  chat_session_id: string;
  last_action?: string;
  last_target?: string;
  last_phase?: string;
  last_findings?: unknown[];
  pending_steps?: unknown[];
  continuation_hint?: string;
  continuation_hint_en?: string;
  active_session_id?: string;
  updated_at?: string;
}

export class IntentResolver {
  private supabase: SupabaseClient;
  private chatSessionId: string;

  // Arabic continuation patterns
  private arabicPatterns = {
    continue: ["واصل", "واصلي", "واصلو", "ركض", "انطلق"],
    resume: ["استمر", "استمري", "استمروا", "رجع", "عود"],
    retry: ["أعد", "حاول", "حاولي", "كرر", "جرب"],
    "continue_implicit": ["كمّل", "كملي", "كملو", "أكمل", "أكملي"],
  };

  // English continuation patterns
  private englishPatterns = {
    continue: ["continue", "go on", "next", "proceed", "move forward", "keep going"],
    resume: ["resume", "restart", "restart from", "pick up where", "get back to"],
    retry: ["retry", "try again", "redo", "attempt again", "have another go"],
    "continue_implicit": ["go", "run", "execute", "start", "begin"],
  };

  constructor(supabase: SupabaseClient, chatSessionId: string) {
    this.supabase = supabase;
    this.chatSessionId = chatSessionId;
  }

  /**
   * Resolve user intent from text
   */
  async resolveIntent(text: string, sessionId?: string): Promise<IntentResolution> {
    const normalizedText = text.trim().toLowerCase();

    // Detect language
    const language = this.detectLanguage(normalizedText);

    // Check for continuation patterns
    let intentType: IntentType = "unknown";
    let confidence = 0;

    if (language === "ar" || language === "mixed") {
      const result = this.matchArabicPatterns(normalizedText);
      if (result.type !== "unknown") {
        intentType = result.type;
        confidence = Math.max(confidence, result.confidence);
      }
    }

    if ((language === "en" || language === "mixed") && intentType === "unknown") {
      const result = this.matchEnglishPatterns(normalizedText);
      if (result.type !== "unknown") {
        intentType = result.type;
        confidence = Math.max(confidence, result.confidence);
      }
    }

    // Get context for more informed decision
    const context = await this.getIntentContext(sessionId);
    const action = this.mapIntentToAction(intentType, context);
    const shouldUseCheckpoint = intentType !== "new_task";

    const resolution: IntentResolution = {
      type: intentType,
      confidence: Math.min(1, confidence),
      original_text: text,
      detected_language: language,
      action,
      context_hint: context?.continuation_hint || context?.continuation_hint_en,
      should_use_checkpoint: shouldUseCheckpoint,
    };

    // Save resolved intent for audit trail
    await this.saveResolvedIntent(resolution, sessionId);

    return resolution;
  }

  /**
   * Detect if text is Arabic, English, or mixed
   */
  private detectLanguage(text: string): "ar" | "en" | "mixed" {
    const arabicRegex = /[\u0600-\u06FF]/g;
    const englishRegex = /[a-zA-Z]/g;

    const arabicMatches = text.match(arabicRegex) || [];
    const englishMatches = text.match(englishRegex) || [];

    if (arabicMatches.length > 0 && englishMatches.length > 0) {
      return "mixed";
    } else if (arabicMatches.length > englishMatches.length) {
      return "ar";
    } else {
      return "en";
    }
  }

  /**
   * Match Arabic patterns
   */
  private matchArabicPatterns(text: string): { type: IntentType; confidence: number } {
    for (const [intentType, patterns] of Object.entries(this.arabicPatterns)) {
      for (const pattern of patterns) {
        if (text.includes(pattern)) {
          // Full match is higher confidence
          const isFullMatch = text.split(/\s+/).some((word) => word === pattern);
          const confidence = isFullMatch ? 0.95 : 0.75;
          return { type: intentType as IntentType, confidence };
        }
      }
    }
    return { type: "unknown", confidence: 0 };
  }

  /**
   * Match English patterns
   */
  private matchEnglishPatterns(text: string): { type: IntentType; confidence: number } {
    for (const [intentType, patterns] of Object.entries(this.englishPatterns)) {
      for (const pattern of patterns) {
        if (text.includes(pattern)) {
          // Check if it's a complete word or phrase match
          const regex = new RegExp(`\\b${pattern}\\b`, "i");
          if (regex.test(text)) {
            const confidence = 0.95;
            return { type: intentType as IntentType, confidence };
          } else {
            const confidence = 0.65;
            return { type: intentType as IntentType, confidence };
          }
        }
      }
    }
    return { type: "unknown", confidence: 0 };
  }

  /**
   * Map intent type to specific action
   */
  private mapIntentToAction(
    intentType: IntentType,
    context?: IntentContext
  ): string {
    switch (intentType) {
      case "continue":
        return context?.continuation_hint_en
          ? context.continuation_hint_en
          : "Continue from last checkpoint";
      case "resume":
        return "Resume last session from checkpoint";
      case "retry":
        return `Retry last action: ${context?.last_action || "scanning"}`;
      case "new_task":
        return "Start new task";
      default:
        return "Unable to determine intent";
    }
  }

  /**
   * Get intent context from database
   */
  private async getIntentContext(sessionId?: string): Promise<IntentContext | null> {
    try {
      let query = this.supabase
        .from("agent_intent_context")
        .select("*")
        .eq("chat_session_id", this.chatSessionId);

      if (sessionId) {
        query = query.eq("active_session_id", sessionId);
      }

      const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows found
          return null;
        }
        console.error("[v0] Failed to get intent context:", error.message);
        return null;
      }

      return data as IntentContext;
    } catch (err) {
      console.error("[v0] Intent context retrieval exception:", err);
      return null;
    }
  }

  /**
   * Save resolved intent for audit trail
   */
  private async saveResolvedIntent(resolution: IntentResolution, sessionId?: string): Promise<void> {
    try {
      const { error } = await this.supabase.from("agent_intent_context").insert([
        {
          chat_session_id: this.chatSessionId,
          active_session_id: sessionId,
          last_action: resolution.action,
          detected_language: resolution.detected_language,
          continuation_hint_en: resolution.action,
          updated_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        console.error("[v0] Failed to save intent context:", error.message);
      }
    } catch (err) {
      console.error("[v0] Intent context save exception:", err);
    }
  }

  /**
   * Update context hint for next continuation
   */
  async updateContextHint(
    sessionId: string,
    lastAction: string,
    lastTarget?: string,
    lastPhase?: string,
    findings?: unknown[]
  ): Promise<void> {
    try {
      const contextHint = this.generateContextHint(lastAction, lastPhase);
      const contextHintEn = this.generateContextHintEn(lastAction, lastPhase);

      // Try to update, insert if doesn't exist
      const { error } = await this.supabase
        .from("agent_intent_context")
        .upsert(
          [
            {
              chat_session_id: this.chatSessionId,
              active_session_id: sessionId,
              last_action: lastAction,
              last_target: lastTarget,
              last_phase: lastPhase,
              last_findings: findings || [],
              continuation_hint: contextHint,
              continuation_hint_en: contextHintEn,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: "chat_session_id,active_session_id" }
        );

      if (error) {
        console.error("[v0] Failed to update context hint:", error.message);
      }
    } catch (err) {
      console.error("[v0] Context hint update exception:", err);
    }
  }

  /**
   * Generate Arabic context hint
   */
  private generateContextHint(action: string, phase?: string): string {
    const phaseMap: Record<string, string> = {
      INTENT: "تحديد الهدف",
      PLANNING: "التخطيط",
      EXECUTION: "التنفيذ",
      ANALYSIS: "التحليل",
      DECISION: "اتخاذ القرار",
    };

    const phaseAr = phase ? phaseMap[phase] || phase : "العملية";
    return `واصل في ${phaseAr} - ${action}`;
  }

  /**
   * Generate English context hint
   */
  private generateContextHintEn(action: string, phase?: string): string {
    const phaseMap: Record<string, string> = {
      INTENT: "Intent Recognition",
      PLANNING: "Planning",
      EXECUTION: "Execution",
      ANALYSIS: "Analysis",
      DECISION: "Decision Making",
    };

    const phaseEn = phase ? phaseMap[phase] || phase : "Operation";
    return `Continue in ${phaseEn} - ${action}`;
  }
}
