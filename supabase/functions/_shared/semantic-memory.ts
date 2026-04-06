/**
 * Semantic Memory
 * 
 * Handles pattern learning and strategy persistence:
 * - Failure pattern recognition and learning
 * - Success pattern extraction
 * - Strategy adaptation based on history
 * - Cross-session knowledge transfer
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// TYPES
// ============================================================================

export type FailureType = 
  | 'waf_blocked'
  | 'rate_limited'
  | 'timeout'
  | 'auth_required'
  | 'not_found'
  | 'connection_error'
  | 'permission_denied'
  | 'payload_rejected'
  | 'detection'
  | 'unknown';

export interface FailurePattern {
  id: string;
  type: FailureType;
  signature: {
    errorMessage?: string;
    statusCode?: number;
    responsePattern?: string;
    toolName?: string;
    targetPattern?: string;
  };
  occurrences: number;
  lastOccurred: string;
  mitigation: MitigationStrategy | null;
  effectiveness: number; // 0-1, how often mitigation works
}

export interface MitigationStrategy {
  id: string;
  name: string;
  description: string;
  actions: MitigationAction[];
  successRate: number;
  usageCount: number;
}

export type MitigationAction = 
  | { type: 'delay'; durationMs: number }
  | { type: 'rotate_proxy' }
  | { type: 'change_user_agent' }
  | { type: 'use_encoding'; encoding: string }
  | { type: 'split_payload' }
  | { type: 'use_alternative_tool'; toolName: string }
  | { type: 'reduce_concurrency' }
  | { type: 'add_jitter' }
  | { type: 'use_evasion'; technique: string };

export interface SuccessPattern {
  id: string;
  category: string;
  trigger: {
    vulnType?: string;
    targetTech?: string;
    phase?: string;
  };
  action: {
    toolSequence: string[];
    payloadType?: string;
    timing?: string;
  };
  effectiveness: number;
  usageCount: number;
  lastUsed: string;
}

export interface LearnedStrategy {
  id: string;
  targetType: string;       // e.g., 'wordpress', 'react_app', 'api'
  vulnCategory: string;     // e.g., 'injection', 'auth', 'disclosure'
  approach: StrategyApproach;
  confidence: number;
  basedOn: number;          // Number of sessions this is based on
  createdAt: string;
  updatedAt: string;
}

export interface StrategyApproach {
  initialTools: string[];
  exploitOrder: string[];
  payloadPreferences: string[];
  timingStrategy: 'aggressive' | 'moderate' | 'stealth';
  evasionTechniques: string[];
  checkpointFrequency: number;
}

// ============================================================================
// SEMANTIC MEMORY MANAGER
// ============================================================================

export class SemanticMemoryManager {
  private supabase: SupabaseClient;
  private failurePatterns: Map<string, FailurePattern>;
  private successPatterns: Map<string, SuccessPattern>;
  private strategies: Map<string, LearnedStrategy>;
  private pendingLearnings: Array<{
    type: 'success' | 'failure';
    data: unknown;
    timestamp: string;
  }>;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.failurePatterns = new Map();
    this.successPatterns = new Map();
    this.strategies = new Map();
    this.pendingLearnings = [];
  }

  // ==========================================================================
  // FAILURE PATTERN LEARNING
  // ==========================================================================

  /**
   * Record and learn from a failure
   */
  async recordFailure(
    error: string,
    context: {
      toolName: string;
      target: string;
      statusCode?: number;
      responseSnippet?: string;
      sessionId: string;
    }
  ): Promise<{ pattern: FailurePattern; mitigation: MitigationStrategy | null }> {
    // Classify the failure
    const failureType = this.classifyFailure(error, context.statusCode, context.responseSnippet);
    
    // Generate signature
    const signature = this.generateFailureSignature(error, context);
    const signatureHash = this.hashSignature(signature);

    // Check if pattern exists
    let pattern = this.failurePatterns.get(signatureHash);
    
    if (pattern) {
      // Update existing pattern
      pattern.occurrences++;
      pattern.lastOccurred = new Date().toISOString();
    } else {
      // Create new pattern
      pattern = {
        id: `fp_${signatureHash}`,
        type: failureType,
        signature,
        occurrences: 1,
        lastOccurred: new Date().toISOString(),
        mitigation: this.suggestMitigation(failureType),
        effectiveness: 0.5 // Default
      };
      this.failurePatterns.set(signatureHash, pattern);
    }

    // Persist to database
    await this.persistFailurePattern(pattern, context.sessionId);

    // Log for learning
    await this.logFailure(context.sessionId, pattern, context);

    return { pattern, mitigation: pattern.mitigation };
  }

  /**
   * Classify failure type from error and context
   */
  classifyFailure(error: string, statusCode?: number, response?: string): FailureType {
    const errorLower = error.toLowerCase();
    const responseLower = (response || '').toLowerCase();

    // WAF detection
    if (
      statusCode === 403 ||
      errorLower.includes('waf') ||
      errorLower.includes('firewall') ||
      responseLower.includes('blocked') ||
      responseLower.includes('access denied') ||
      responseLower.includes('cloudflare') ||
      responseLower.includes('incapsula') ||
      responseLower.includes('akamai')
    ) {
      return 'waf_blocked';
    }

    // Rate limiting
    if (
      statusCode === 429 ||
      errorLower.includes('rate limit') ||
      errorLower.includes('too many requests') ||
      responseLower.includes('rate limit')
    ) {
      return 'rate_limited';
    }

    // Timeout
    if (
      errorLower.includes('timeout') ||
      errorLower.includes('timed out') ||
      errorLower.includes('etimedout') ||
      errorLower.includes('econnreset')
    ) {
      return 'timeout';
    }

    // Auth required
    if (
      statusCode === 401 ||
      statusCode === 407 ||
      errorLower.includes('unauthorized') ||
      errorLower.includes('authentication')
    ) {
      return 'auth_required';
    }

    // Not found
    if (
      statusCode === 404 ||
      errorLower.includes('not found')
    ) {
      return 'not_found';
    }

    // Connection error
    if (
      errorLower.includes('econnrefused') ||
      errorLower.includes('enotfound') ||
      errorLower.includes('connection') ||
      errorLower.includes('network')
    ) {
      return 'connection_error';
    }

    // Permission denied
    if (
      statusCode === 403 ||
      errorLower.includes('permission') ||
      errorLower.includes('forbidden')
    ) {
      return 'permission_denied';
    }

    // Payload rejected (likely detection)
    if (
      statusCode === 400 ||
      errorLower.includes('bad request') ||
      errorLower.includes('invalid') ||
      responseLower.includes('suspicious') ||
      responseLower.includes('malicious')
    ) {
      return 'payload_rejected';
    }

    // Detection/blocking
    if (
      responseLower.includes('blocked') ||
      responseLower.includes('detected') ||
      responseLower.includes('security')
    ) {
      return 'detection';
    }

    return 'unknown';
  }

  /**
   * Generate failure signature for deduplication
   */
  private generateFailureSignature(
    error: string,
    context: { toolName: string; target: string; statusCode?: number }
  ): FailurePattern['signature'] {
    // Extract domain/pattern from target
    const targetPattern = this.extractTargetPattern(context.target);
    
    // Extract key error message
    const errorMessage = this.normalizeErrorMessage(error);

    return {
      errorMessage,
      statusCode: context.statusCode,
      toolName: context.toolName,
      targetPattern
    };
  }

  /**
   * Suggest mitigation strategy for failure type
   */
  private suggestMitigation(failureType: FailureType): MitigationStrategy | null {
    const mitigations: Record<FailureType, MitigationStrategy | null> = {
      waf_blocked: {
        id: 'mit_waf',
        name: 'WAF Evasion',
        description: 'Apply WAF bypass techniques',
        actions: [
          { type: 'use_encoding', encoding: 'double_url' },
          { type: 'split_payload' },
          { type: 'use_evasion', technique: 'case_variation' },
          { type: 'add_jitter' }
        ],
        successRate: 0.6,
        usageCount: 0
      },
      rate_limited: {
        id: 'mit_rate',
        name: 'Rate Limit Handling',
        description: 'Slow down and add delays',
        actions: [
          { type: 'delay', durationMs: 5000 },
          { type: 'reduce_concurrency' },
          { type: 'add_jitter' },
          { type: 'rotate_proxy' }
        ],
        successRate: 0.8,
        usageCount: 0
      },
      timeout: {
        id: 'mit_timeout',
        name: 'Timeout Handling',
        description: 'Handle slow responses',
        actions: [
          { type: 'delay', durationMs: 2000 },
          { type: 'reduce_concurrency' }
        ],
        successRate: 0.7,
        usageCount: 0
      },
      auth_required: {
        id: 'mit_auth',
        name: 'Auth Required',
        description: 'Authentication needed',
        actions: [], // Requires user intervention
        successRate: 0.1,
        usageCount: 0
      },
      not_found: null, // Usually not recoverable
      connection_error: {
        id: 'mit_conn',
        name: 'Connection Retry',
        description: 'Retry connection with delay',
        actions: [
          { type: 'delay', durationMs: 3000 },
          { type: 'rotate_proxy' }
        ],
        successRate: 0.5,
        usageCount: 0
      },
      permission_denied: null,
      payload_rejected: {
        id: 'mit_payload',
        name: 'Payload Variation',
        description: 'Try alternative payloads',
        actions: [
          { type: 'use_encoding', encoding: 'unicode' },
          { type: 'use_evasion', technique: 'comment_injection' },
          { type: 'split_payload' }
        ],
        successRate: 0.5,
        usageCount: 0
      },
      detection: {
        id: 'mit_detect',
        name: 'Detection Evasion',
        description: 'Evade detection systems',
        actions: [
          { type: 'change_user_agent' },
          { type: 'add_jitter' },
          { type: 'delay', durationMs: 10000 },
          { type: 'use_evasion', technique: 'slow_scan' }
        ],
        successRate: 0.4,
        usageCount: 0
      },
      unknown: null
    };

    return mitigations[failureType];
  }

  /**
   * Update mitigation effectiveness based on result
   */
  async updateMitigationEffectiveness(
    patternId: string,
    mitigationId: string,
    success: boolean
  ): Promise<void> {
    const pattern = this.failurePatterns.get(patternId.replace('fp_', ''));
    if (!pattern || !pattern.mitigation) return;

    // Update success rate using exponential moving average
    const alpha = 0.3; // Learning rate
    pattern.mitigation.successRate = 
      alpha * (success ? 1 : 0) + (1 - alpha) * pattern.mitigation.successRate;
    pattern.mitigation.usageCount++;

    // Update effectiveness
    pattern.effectiveness = pattern.mitigation.successRate;

    // Persist update
    await this.persistFailurePattern(pattern);
  }

  // ==========================================================================
  // SUCCESS PATTERN LEARNING
  // ==========================================================================

  /**
   * Record a successful approach
   */
  async recordSuccess(
    context: {
      vulnType?: string;
      targetTech?: string;
      phase?: string;
      toolSequence: string[];
      payloadType?: string;
      sessionId: string;
    }
  ): Promise<SuccessPattern> {
    const patternId = this.generateSuccessPatternId(context);
    
    let pattern = this.successPatterns.get(patternId);
    
    if (pattern) {
      // Reinforce existing pattern
      pattern.effectiveness = Math.min(1, pattern.effectiveness + 0.1);
      pattern.usageCount++;
      pattern.lastUsed = new Date().toISOString();
    } else {
      // Create new pattern
      pattern = {
        id: patternId,
        category: context.vulnType || 'general',
        trigger: {
          vulnType: context.vulnType,
          targetTech: context.targetTech,
          phase: context.phase
        },
        action: {
          toolSequence: context.toolSequence,
          payloadType: context.payloadType
        },
        effectiveness: 0.6,
        usageCount: 1,
        lastUsed: new Date().toISOString()
      };
      this.successPatterns.set(patternId, pattern);
    }

    // Persist
    await this.persistSuccessPattern(pattern);

    return pattern;
  }

  /**
   * Get recommended approach for a situation
   */
  getRecommendedApproach(context: {
    vulnType?: string;
    targetTech?: string;
    phase?: string;
  }): SuccessPattern | null {
    let bestMatch: SuccessPattern | null = null;
    let bestScore = 0;

    for (const [, pattern] of this.successPatterns) {
      let score = 0;
      
      // Match on vuln type
      if (context.vulnType && pattern.trigger.vulnType === context.vulnType) {
        score += 3;
      }
      
      // Match on target tech
      if (context.targetTech && pattern.trigger.targetTech === context.targetTech) {
        score += 2;
      }
      
      // Match on phase
      if (context.phase && pattern.trigger.phase === context.phase) {
        score += 1;
      }

      // Weight by effectiveness
      score *= pattern.effectiveness;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = pattern;
      }
    }

    return bestMatch;
  }

  // ==========================================================================
  // STRATEGY LEARNING
  // ==========================================================================

  /**
   * Learn or update strategy for target type
   */
  async learnStrategy(
    sessionId: string,
    context: {
      targetType: string;
      vulnCategory: string;
      successfulTools: string[];
      failedTools: string[];
      timingUsed: 'aggressive' | 'moderate' | 'stealth';
      evasionUsed: string[];
    }
  ): Promise<LearnedStrategy> {
    const strategyKey = `${context.targetType}:${context.vulnCategory}`;
    let strategy = this.strategies.get(strategyKey);

    if (strategy) {
      // Update existing strategy
      strategy = this.updateStrategy(strategy, context);
    } else {
      // Create new strategy
      strategy = {
        id: `strat_${strategyKey}`,
        targetType: context.targetType,
        vulnCategory: context.vulnCategory,
        approach: {
          initialTools: context.successfulTools.slice(0, 3),
          exploitOrder: context.successfulTools,
          payloadPreferences: [],
          timingStrategy: context.timingUsed,
          evasionTechniques: context.evasionUsed,
          checkpointFrequency: 2
        },
        confidence: 0.5,
        basedOn: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    this.strategies.set(strategyKey, strategy);
    await this.persistStrategy(strategy);

    return strategy;
  }

  /**
   * Update strategy based on new evidence
   */
  private updateStrategy(
    existing: LearnedStrategy,
    context: {
      successfulTools: string[];
      failedTools: string[];
      timingUsed: 'aggressive' | 'moderate' | 'stealth';
      evasionUsed: string[];
    }
  ): LearnedStrategy {
    // Merge successful tools (favor recent)
    const toolSet = new Set([
      ...context.successfulTools,
      ...existing.approach.exploitOrder.filter(t => !context.failedTools.includes(t))
    ]);
    
    // Update approach
    existing.approach.exploitOrder = Array.from(toolSet);
    existing.approach.initialTools = existing.approach.exploitOrder.slice(0, 3);
    
    // Merge evasion techniques
    existing.approach.evasionTechniques = Array.from(new Set([
      ...existing.approach.evasionTechniques,
      ...context.evasionUsed
    ]));

    // Update timing if the new approach worked better
    // (simplified - could use more sophisticated logic)
    existing.approach.timingStrategy = context.timingUsed;

    // Update confidence
    existing.confidence = Math.min(0.95, existing.confidence + 0.1);
    existing.basedOn++;
    existing.updatedAt = new Date().toISOString();

    return existing;
  }

  /**
   * Get strategy for target
   */
  getStrategy(targetType: string, vulnCategory: string): LearnedStrategy | null {
    const key = `${targetType}:${vulnCategory}`;
    return this.strategies.get(key) || null;
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Load all patterns from database
   */
  async load(): Promise<void> {
    // Load failure patterns
    const { data: failures } = await this.supabase
      .from('semantic_patterns')
      .select('*')
      .eq('category', 'failure');

    if (failures) {
      for (const row of failures) {
        const pattern = row.pattern as FailurePattern;
        this.failurePatterns.set(pattern.id.replace('fp_', ''), pattern);
      }
    }

    // Load success patterns
    const { data: successes } = await this.supabase
      .from('semantic_patterns')
      .select('*')
      .eq('category', 'success');

    if (successes) {
      for (const row of successes) {
        const pattern = row.pattern as SuccessPattern;
        this.successPatterns.set(pattern.id, pattern);
      }
    }

    // Load strategies
    const { data: strategies } = await this.supabase
      .from('semantic_patterns')
      .select('*')
      .eq('category', 'strategy');

    if (strategies) {
      for (const row of strategies) {
        const strategy = row.pattern as LearnedStrategy;
        this.strategies.set(`${strategy.targetType}:${strategy.vulnCategory}`, strategy);
      }
    }
  }

  /**
   * Persist failure pattern
   */
  private async persistFailurePattern(pattern: FailurePattern, sessionId?: string): Promise<void> {
    await this.supabase.from('semantic_patterns').upsert({
      id: pattern.id,
      category: 'failure',
      pattern,
      effectiveness: pattern.effectiveness,
      usage_count: pattern.occurrences,
      last_used: pattern.lastOccurred
    });

    // Also log to failure_logs if session provided
    if (sessionId) {
      await this.logFailure(sessionId, pattern);
    }
  }

  /**
   * Persist success pattern
   */
  private async persistSuccessPattern(pattern: SuccessPattern): Promise<void> {
    await this.supabase.from('semantic_patterns').upsert({
      id: pattern.id,
      category: 'success',
      pattern,
      effectiveness: pattern.effectiveness,
      usage_count: pattern.usageCount,
      last_used: pattern.lastUsed
    });
  }

  /**
   * Persist strategy
   */
  private async persistStrategy(strategy: LearnedStrategy): Promise<void> {
    await this.supabase.from('semantic_patterns').upsert({
      id: strategy.id,
      category: 'strategy',
      pattern: strategy,
      effectiveness: strategy.confidence,
      usage_count: strategy.basedOn,
      last_used: strategy.updatedAt
    });
  }

  /**
   * Log failure to failure_logs table
   */
  private async logFailure(
    sessionId: string,
    pattern: FailurePattern,
    context?: { toolName: string; target: string }
  ): Promise<void> {
    await this.supabase.from('failure_logs').insert({
      session_id: sessionId,
      failure_type: pattern.type,
      tool: context?.toolName,
      error_message: pattern.signature.errorMessage,
      mitigation_strategy: pattern.mitigation?.name,
      pattern_id: pattern.id
    });
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Extract pattern from target URL
   */
  private extractTargetPattern(target: string): string {
    try {
      const url = new URL(target.startsWith('http') ? target : `http://${target}`);
      // Return domain pattern (e.g., *.example.com)
      return url.hostname.replace(/^[^.]+/, '*');
    } catch {
      return target;
    }
  }

  /**
   * Normalize error message for comparison
   */
  private normalizeErrorMessage(error: string): string {
    return error
      .toLowerCase()
      .replace(/\d+/g, 'N') // Replace numbers
      .replace(/[a-f0-9]{8,}/gi, 'HASH') // Replace hashes
      .substring(0, 100);
  }

  /**
   * Hash signature for deduplication
   */
  private hashSignature(signature: FailurePattern['signature']): string {
    const str = JSON.stringify(signature, Object.keys(signature).sort());
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return Math.abs(h).toString(16).padStart(8, '0');
  }

  /**
   * Generate success pattern ID
   */
  private generateSuccessPatternId(context: {
    vulnType?: string;
    targetTech?: string;
    toolSequence: string[];
  }): string {
    const key = `${context.vulnType || 'gen'}:${context.targetTech || 'any'}:${context.toolSequence.slice(0, 3).join(',')}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = Math.imul(31, h) + key.charCodeAt(i) | 0;
    }
    return `sp_${Math.abs(h).toString(16).padStart(8, '0')}`;
  }

  /**
   * Get statistics
   */
  getStats(): {
    failurePatterns: number;
    successPatterns: number;
    strategies: number;
    topFailureTypes: Array<{ type: FailureType; count: number }>;
  } {
    const failureCounts = new Map<FailureType, number>();
    for (const [, pattern] of this.failurePatterns) {
      const count = failureCounts.get(pattern.type) || 0;
      failureCounts.set(pattern.type, count + pattern.occurrences);
    }

    const topFailures = Array.from(failureCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      failurePatterns: this.failurePatterns.size,
      successPatterns: this.successPatterns.size,
      strategies: this.strategies.size,
      topFailureTypes: topFailures
    };
  }
}

/**
 * Factory function
 */
export function createSemanticMemoryManager(supabase: SupabaseClient): SemanticMemoryManager {
  return new SemanticMemoryManager(supabase);
}
