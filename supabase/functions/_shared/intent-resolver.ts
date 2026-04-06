/**
 * Intent Resolver
 * 
 * Handles intent classification for agent continuation:
 * - Arabic language support (واصل، استمر، كمل، إلخ)
 * - English language support (continue, resume, go, etc.)
 * - Context-aware intent detection
 * - Smart session selection for continuation
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// TYPES
// ============================================================================

export type IntentType = 
  | 'continue'      // Resume existing session
  | 'start'         // Start new session
  | 'stop'          // Stop current session
  | 'status'        // Check session status
  | 'approve'       // Approve risky action
  | 'reject'        // Reject risky action
  | 'restart'       // Restart from beginning
  | 'rollback'      // Rollback to checkpoint
  | 'unknown';      // Could not determine intent

export interface ResolvedIntent {
  type: IntentType;
  confidence: number;          // 0-1 scale
  language: 'ar' | 'en' | 'mixed';
  originalText: string;
  normalizedText: string;
  
  // Additional context
  target?: string;             // Target URL/IP if mentioned
  checkpointRef?: number;      // Checkpoint version if mentioned
  actionRef?: string;          // Specific action referenced
  
  // Session hints
  shouldResume: boolean;
  sessionSelector?: {
    byId?: string;
    byTarget?: string;
    mostRecent?: boolean;
  };
}

export interface IntentPattern {
  patterns: RegExp[];
  intent: IntentType;
  language: 'ar' | 'en' | 'mixed';
  confidence: number;
}

// ============================================================================
// INTENT PATTERNS
// ============================================================================

const ARABIC_PATTERNS: IntentPattern[] = [
  // Continue patterns
  {
    patterns: [
      /^واصل$/i,
      /^استمر$/i,
      /^كمل$/i,
      /^تابع$/i,
      /^أكمل$/i,
      /واصل العمل/i,
      /استمر في/i,
      /كمل الشغل/i,
      /تابع العملية/i,
      /خلص الباقي/i,
      /أكمل المهمة/i,
      /استأنف/i,
      /رجع كمل/i,
      /كمل من وين وقفت/i,
      /وين وصلت.*كمل/i,
      /استمرار/i
    ],
    intent: 'continue',
    language: 'ar',
    confidence: 0.95
  },
  // Stop patterns
  {
    patterns: [
      /^وقف$/i,
      /^توقف$/i,
      /^قف$/i,
      /^خلاص$/i,
      /أوقف العملية/i,
      /وقف كل شي/i,
      /إلغاء/i,
      /ألغي/i,
      /كفاية/i,
      /يكفي/i,
      /وقف هنا/i
    ],
    intent: 'stop',
    language: 'ar',
    confidence: 0.95
  },
  // Status patterns
  {
    patterns: [
      /وين وصلت/i,
      /شو صار/i,
      /ايش الوضع/i,
      /كيف الحال/i,
      /الحالة/i,
      /تحديث/i,
      /النتائج/i,
      /شو لقيت/i,
      /ايش اكتشفت/i,
      /عطني تقرير/i
    ],
    intent: 'status',
    language: 'ar',
    confidence: 0.9
  },
  // Approve patterns
  {
    patterns: [
      /^موافق$/i,
      /^تمام$/i,
      /^نعم$/i,
      /^أيوا$/i,
      /^ماشي$/i,
      /وافق/i,
      /صدق/i,
      /نفذ/i,
      /اعمل/i,
      /خلاص نفذ/i,
      /موافق.*خطر/i
    ],
    intent: 'approve',
    language: 'ar',
    confidence: 0.9
  },
  // Reject patterns
  {
    patterns: [
      /^لا$/i,
      /^رفض$/i,
      /^ممنوع$/i,
      /لا تنفذ/i,
      /إلغي هذا/i,
      /ارفض/i,
      /خطر.*(لا|رفض)/i
    ],
    intent: 'reject',
    language: 'ar',
    confidence: 0.9
  },
  // Restart patterns
  {
    patterns: [
      /ابدأ من جديد/i,
      /من الصفر/i,
      /إعادة/i,
      /ابدأ من البداية/i,
      /امسح وابدأ/i
    ],
    intent: 'restart',
    language: 'ar',
    confidence: 0.85
  },
  // Rollback patterns
  {
    patterns: [
      /ارجع ل/i,
      /رجع لـ?نقطة/i,
      /استعادة/i,
      /ارجع خطوة/i,
      /تراجع/i
    ],
    intent: 'rollback',
    language: 'ar',
    confidence: 0.85
  }
];

const ENGLISH_PATTERNS: IntentPattern[] = [
  // Continue patterns
  {
    patterns: [
      /^continue$/i,
      /^resume$/i,
      /^go$/i,
      /^proceed$/i,
      /^next$/i,
      /^carry on$/i,
      /keep going/i,
      /continue from/i,
      /resume from/i,
      /pick up where/i,
      /finish the rest/i,
      /complete the task/i,
      /move forward/i,
      /go ahead/i,
      /proceed with/i,
      /continue execution/i,
      /resume operation/i,
      /keep running/i
    ],
    intent: 'continue',
    language: 'en',
    confidence: 0.95
  },
  // Stop patterns
  {
    patterns: [
      /^stop$/i,
      /^halt$/i,
      /^abort$/i,
      /^cancel$/i,
      /^quit$/i,
      /stop now/i,
      /stop everything/i,
      /halt execution/i,
      /abort mission/i,
      /cancel operation/i,
      /terminate/i,
      /kill/i,
      /end session/i
    ],
    intent: 'stop',
    language: 'en',
    confidence: 0.95
  },
  // Status patterns
  {
    patterns: [
      /^status$/i,
      /what.*(status|progress)/i,
      /how.*(going|far)/i,
      /show me.*results/i,
      /what.*found/i,
      /give me.*update/i,
      /report/i,
      /findings/i,
      /progress/i,
      /where are we/i,
      /current state/i
    ],
    intent: 'status',
    language: 'en',
    confidence: 0.9
  },
  // Approve patterns
  {
    patterns: [
      /^yes$/i,
      /^ok$/i,
      /^okay$/i,
      /^approved?$/i,
      /^confirm$/i,
      /^allow$/i,
      /^accept$/i,
      /go ahead/i,
      /proceed/i,
      /approve.*action/i,
      /confirm.*risk/i,
      /i understand.*proceed/i,
      /accept.*risk/i
    ],
    intent: 'approve',
    language: 'en',
    confidence: 0.9
  },
  // Reject patterns
  {
    patterns: [
      /^no$/i,
      /^reject$/i,
      /^deny$/i,
      /^decline$/i,
      /^refuse$/i,
      /don't do/i,
      /do not/i,
      /reject.*action/i,
      /skip.*risk/i,
      /too risky/i
    ],
    intent: 'reject',
    language: 'en',
    confidence: 0.9
  },
  // Start patterns
  {
    patterns: [
      /^start$/i,
      /^begin$/i,
      /^launch$/i,
      /^scan$/i,
      /start.*scan/i,
      /begin.*assessment/i,
      /run.*against/i,
      /test.*security/i,
      /analyze.*target/i,
      /pentest/i,
      /hack/i,
      /attack/i
    ],
    intent: 'start',
    language: 'en',
    confidence: 0.85
  },
  // Restart patterns
  {
    patterns: [
      /^restart$/i,
      /start over/i,
      /from scratch/i,
      /fresh start/i,
      /reset/i,
      /begin again/i,
      /wipe and start/i
    ],
    intent: 'restart',
    language: 'en',
    confidence: 0.85
  },
  // Rollback patterns
  {
    patterns: [
      /rollback/i,
      /go back to/i,
      /restore.*checkpoint/i,
      /revert/i,
      /undo/i,
      /back to step/i,
      /return to/i
    ],
    intent: 'rollback',
    language: 'en',
    confidence: 0.85
  }
];

// ============================================================================
// INTENT RESOLVER
// ============================================================================

export class IntentResolver {
  private supabase: SupabaseClient;
  private patterns: IntentPattern[];

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.patterns = [...ARABIC_PATTERNS, ...ENGLISH_PATTERNS];
  }

  /**
   * Resolve intent from user message
   */
  resolve(message: string): ResolvedIntent {
    const normalizedText = this.normalizeText(message);
    const language = this.detectLanguage(message);

    // Try to match patterns
    let bestMatch: { pattern: IntentPattern; match: RegExpMatchArray } | null = null;
    let highestConfidence = 0;

    for (const pattern of this.patterns) {
      for (const regex of pattern.patterns) {
        const match = normalizedText.match(regex);
        if (match && pattern.confidence > highestConfidence) {
          bestMatch = { pattern, match };
          highestConfidence = pattern.confidence;
        }
      }
    }

    // Extract additional context
    const target = this.extractTarget(message);
    const checkpointRef = this.extractCheckpointRef(message);

    // Determine session selector
    const sessionSelector = this.determineSessionSelector(message, target);

    if (bestMatch) {
      return {
        type: bestMatch.pattern.intent,
        confidence: bestMatch.pattern.confidence,
        language: bestMatch.pattern.language,
        originalText: message,
        normalizedText,
        target,
        checkpointRef,
        shouldResume: bestMatch.pattern.intent === 'continue',
        sessionSelector
      };
    }

    // Fallback: try to infer intent from context
    const inferredIntent = this.inferIntent(normalizedText, language);
    
    return {
      type: inferredIntent.type,
      confidence: inferredIntent.confidence,
      language,
      originalText: message,
      normalizedText,
      target,
      checkpointRef,
      shouldResume: inferredIntent.type === 'continue',
      sessionSelector
    };
  }

  /**
   * Check if message is a continuation intent
   */
  isContinueIntent(message: string): boolean {
    const resolved = this.resolve(message);
    return resolved.type === 'continue' && resolved.confidence >= 0.7;
  }

  /**
   * Check if message is a stop intent
   */
  isStopIntent(message: string): boolean {
    const resolved = this.resolve(message);
    return resolved.type === 'stop' && resolved.confidence >= 0.7;
  }

  /**
   * Check if message is an approval
   */
  isApprovalIntent(message: string): boolean {
    const resolved = this.resolve(message);
    return resolved.type === 'approve' && resolved.confidence >= 0.7;
  }

  /**
   * Normalize text for matching
   */
  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      // Normalize Arabic characters
      .replace(/[أإآ]/g, 'ا')
      .replace(/[ة]/g, 'ه')
      .replace(/[ى]/g, 'ي')
      // Remove extra whitespace
      .replace(/\s+/g, ' ');
  }

  /**
   * Detect primary language
   */
  private detectLanguage(text: string): 'ar' | 'en' | 'mixed' {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    
    if (arabicChars > 0 && englishChars > 0) {
      return arabicChars > englishChars ? 'ar' : 'en';
    }
    if (arabicChars > 0) return 'ar';
    return 'en';
  }

  /**
   * Extract target URL/IP from message
   */
  private extractTarget(message: string): string | undefined {
    // URL pattern
    const urlMatch = message.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) return urlMatch[0];

    // Domain pattern
    const domainMatch = message.match(/(?:www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/i);
    if (domainMatch) return domainMatch[0];

    // IP pattern
    const ipMatch = message.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    if (ipMatch) return ipMatch[0];

    return undefined;
  }

  /**
   * Extract checkpoint reference from message
   */
  private extractCheckpointRef(message: string): number | undefined {
    // "checkpoint 3", "version 2", "نقطة 5"
    const match = message.match(/(?:checkpoint|version|نقطة|إصدار)\s*(\d+)/i);
    if (match) return parseInt(match[1], 10);
    return undefined;
  }

  /**
   * Determine session selector from message
   */
  private determineSessionSelector(message: string, target?: string): ResolvedIntent['sessionSelector'] {
    const selector: ResolvedIntent['sessionSelector'] = {};

    // If target mentioned, select by target
    if (target) {
      selector.byTarget = target;
    }

    // Check for "last", "recent", "previous" keywords
    if (/(?:last|recent|previous|آخر|السابق)/i.test(message)) {
      selector.mostRecent = true;
    }

    // Check for session ID reference
    const sessionIdMatch = message.match(/session[:\s]+([a-f0-9-]{36})/i);
    if (sessionIdMatch) {
      selector.byId = sessionIdMatch[1];
    }

    return Object.keys(selector).length > 0 ? selector : { mostRecent: true };
  }

  /**
   * Infer intent from context when no pattern matches
   */
  private inferIntent(
    text: string, 
    language: 'ar' | 'en' | 'mixed'
  ): { type: IntentType; confidence: number } {
    // Very short messages are likely continuation
    if (text.length <= 10) {
      // Common short words
      const shortContinue = ['go', 'ok', 'yes', 'yep', 'sure', 'ماشي', 'تمام', 'يلا'];
      if (shortContinue.some(w => text.includes(w))) {
        return { type: 'continue', confidence: 0.6 };
      }
    }

    // Check for question marks (likely status query)
    if (text.includes('?') || text.includes('؟')) {
      return { type: 'status', confidence: 0.5 };
    }

    // Check for target-like content (likely start)
    if (this.extractTarget(text)) {
      return { type: 'start', confidence: 0.6 };
    }

    return { type: 'unknown', confidence: 0.3 };
  }

  /**
   * Get the most appropriate session for continuation
   */
  async selectSessionForContinuation(
    chatSessionId: string,
    selector?: ResolvedIntent['sessionSelector']
  ): Promise<string | null> {
    let query = this.supabase
      .from('agent_sessions')
      .select('id, target, phase, updated_at')
      .eq('chat_session_id', chatSessionId)
      .is('completed_at', null);

    // Apply selectors
    if (selector?.byId) {
      query = query.eq('id', selector.byId);
    } else if (selector?.byTarget) {
      query = query.eq('target', selector.byTarget);
    }

    query = query.order('updated_at', { ascending: false }).limit(1);

    const { data } = await query.single();
    return data?.id || null;
  }

  /**
   * Get intent statistics (for debugging/monitoring)
   */
  getPatternCount(): { arabic: number; english: number; total: number } {
    const arabic = ARABIC_PATTERNS.reduce((sum, p) => sum + p.patterns.length, 0);
    const english = ENGLISH_PATTERNS.reduce((sum, p) => sum + p.patterns.length, 0);
    return {
      arabic,
      english,
      total: arabic + english
    };
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern: IntentPattern): void {
    this.patterns.push(pattern);
  }
}

/**
 * Factory function
 */
export function createIntentResolver(supabase: SupabaseClient): IntentResolver {
  return new IntentResolver(supabase);
}
