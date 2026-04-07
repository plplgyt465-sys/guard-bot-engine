/**
 * Full Conversation Memory Manager
 * 
 * Stores complete interaction history:
 * - User messages
 * - AI responses  
 * - Skill selections and executions
 * - Tool calls and results
 * - Phase transitions
 * - Decisions and reasoning
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ConversationEntry {
  id?: string;
  type: 'user_message' | 'ai_response' | 'skill_selection' | 'skill_execution' | 'tool_call' | 'tool_result' | 'phase_transition' | 'decision';
  content: Record<string, any>;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface MemorySnapshot {
  conversation_id: string;
  session_id: string;
  total_entries: number;
  total_tokens: number;
  last_phase: string;
  last_update: string;
  summary?: string;
}

export class ConversationMemory {
  private supabase: SupabaseClient;
  private conversationId: string;
  private sessionId: string;
  private entries: ConversationEntry[] = [];
  private tokenCount: number = 0;
  private readonly MAX_TOKENS_BEFORE_COMPRESS = 100000;

  constructor(supabase: SupabaseClient, conversationId: string, sessionId: string) {
    this.supabase = supabase;
    this.conversationId = conversationId;
    this.sessionId = sessionId;
  }

  /**
   * Add an entry to conversation memory
   */
  async addEntry(entry: Omit<ConversationEntry, 'timestamp'>): Promise<ConversationEntry> {
    const fullEntry: ConversationEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      id: `${this.conversationId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    this.entries.push(fullEntry);
    this.tokenCount += this.estimateTokens(JSON.stringify(entry.content));

    // Store in database
    try {
      await this.supabase.from('conversation_history').insert({
        id: fullEntry.id,
        conversation_id: this.conversationId,
        session_id: this.sessionId,
        type: entry.type,
        content: entry.content,
        metadata: entry.metadata,
        tokens_used: this.estimateTokens(JSON.stringify(entry.content))
      });
    } catch (error) {
      console.error("[v0] Error storing conversation entry:", error);
    }

    // Check if compression is needed
    if (this.tokenCount > this.MAX_TOKENS_BEFORE_COMPRESS) {
      await this.compressHistory();
    }

    return fullEntry;
  }

  /**
   * Add user message
   */
  async addUserMessage(content: string, metadata?: Record<string, any>): Promise<ConversationEntry> {
    return this.addEntry({
      type: 'user_message',
      content: { text: content },
      metadata
    });
  }

  /**
   * Add AI response
   */
  async addAIResponse(content: string, metadata?: Record<string, any>): Promise<ConversationEntry> {
    return this.addEntry({
      type: 'ai_response',
      content: { text: content },
      metadata
    });
  }

  /**
   * Log skill selection
   */
  async logSkillSelection(
    userQuery: string,
    selectedSkills: Array<{ id: string; name: string; score: number }>,
    reasoning: string
  ): Promise<ConversationEntry> {
    return this.addEntry({
      type: 'skill_selection',
      content: {
        query: userQuery,
        selected_skills: selectedSkills,
        reasoning
      }
    });
  }

  /**
   * Log skill execution
   */
  async logSkillExecution(
    skillId: string,
    skillName: string,
    input: Record<string, any>,
    output: Record<string, any>,
    success: boolean,
    duration_ms: number
  ): Promise<ConversationEntry> {
    return this.addEntry({
      type: 'skill_execution',
      content: {
        skill_id: skillId,
        skill_name: skillName,
        input,
        output,
        success,
        duration_ms
      }
    });
  }

  /**
   * Log tool call
   */
  async logToolCall(
    toolName: string,
    parameters: Record<string, any>,
    result: Record<string, any>,
    success: boolean
  ): Promise<ConversationEntry> {
    return this.addEntry({
      type: 'tool_call',
      content: {
        tool_name: toolName,
        parameters,
        result,
        success
      }
    });
  }

  /**
   * Log phase transition
   */
  async logPhaseTransition(
    fromPhase: string,
    toPhase: string,
    reason: string
  ): Promise<ConversationEntry> {
    return this.addEntry({
      type: 'phase_transition',
      content: {
        from_phase: fromPhase,
        to_phase: toPhase,
        reason
      }
    });
  }

  /**
   * Log decision
   */
  async logDecision(
    decision: string,
    options: string[],
    reasoning: string
  ): Promise<ConversationEntry> {
    return this.addEntry({
      type: 'decision',
      content: {
        decision,
        options,
        reasoning
      }
    });
  }

  /**
   * Get full conversation history
   */
  getFullHistory(): ConversationEntry[] {
    return [...this.entries];
  }

  /**
   * Get recent history (last N entries)
   */
  getRecentHistory(limit: number = 20): ConversationEntry[] {
    return this.entries.slice(-limit);
  }

  /**
   * Get conversation summary
   */
  async getConversationSummary(): Promise<string> {
    // Group entries by type
    const byType: Record<string, number> = {};
    for (const entry of this.entries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }

    // Build summary
    const summary = {
      total_messages: this.entries.length,
      by_type: byType,
      user_messages: this.entries.filter(e => e.type === 'user_message').length,
      ai_responses: this.entries.filter(e => e.type === 'ai_response').length,
      skills_used: this.entries.filter(e => e.type === 'skill_execution').length,
      total_tokens_used: this.tokenCount,
      first_entry: this.entries[0]?.timestamp,
      last_entry: this.entries[this.entries.length - 1]?.timestamp
    };

    return JSON.stringify(summary, null, 2);
  }

  /**
   * Get entries of specific type
   */
  getEntriesByType(type: ConversationEntry['type']): ConversationEntry[] {
    return this.entries.filter(e => e.type === type);
  }

  /**
   * Search conversation history
   */
  searchHistory(query: string): ConversationEntry[] {
    const lower = query.toLowerCase();
    return this.entries.filter(entry => {
      const content = JSON.stringify(entry.content).toLowerCase();
      return content.includes(lower);
    });
  }

  /**
   * Estimate tokens from text
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Compress history when approaching token limits
   * Keeps recent entries in full, summarizes older ones
   */
  private async compressHistory(): Promise<void> {
    if (this.entries.length < 50) return;

    const recentEntries = this.entries.slice(-30);
    const olderEntries = this.entries.slice(0, -30);

    // Create summary of older entries
    const summary = {
      total_entries: olderEntries.length,
      message_count: olderEntries.filter(e => e.type === 'user_message').length,
      response_count: olderEntries.filter(e => e.type === 'ai_response').length,
      skills_used: olderEntries.filter(e => e.type === 'skill_execution').length,
      first_timestamp: olderEntries[0]?.timestamp,
      last_timestamp: olderEntries[olderEntries.length - 1]?.timestamp
    };

    // Add compressed entry
    this.entries = [
      {
        id: `${this.conversationId}-compressed-${Date.now()}`,
        type: 'user_message',
        content: {
          text: `[COMPRESSED HISTORY: ${JSON.stringify(summary)}]`,
          is_compressed: true
        },
        timestamp: new Date().toISOString(),
        metadata: { compressed: true }
      },
      ...recentEntries
    ];

    // Reset token count
    this.tokenCount = this.entries.reduce(
      (sum, entry) => sum + this.estimateTokens(JSON.stringify(entry.content)),
      0
    );

    console.log("[v0] History compressed. Entries: " + this.entries.length + ", Tokens: " + this.tokenCount);
  }

  /**
   * Get memory snapshot
   */
  async getMemorySnapshot(): Promise<MemorySnapshot> {
    const lastPhaseEntry = this.entries.findLast(e => e.type === 'phase_transition');
    
    return {
      conversation_id: this.conversationId,
      session_id: this.sessionId,
      total_entries: this.entries.length,
      total_tokens: this.tokenCount,
      last_phase: (lastPhaseEntry?.content as any)?.to_phase || 'unknown',
      last_update: this.entries[this.entries.length - 1]?.timestamp || new Date().toISOString(),
      summary: await this.getConversationSummary()
    };
  }

  /**
   * Load conversation from database
   */
  async loadFromDatabase(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('conversation_history')
        .select('*')
        .eq('conversation_id', this.conversationId)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      if (data) {
        this.entries = data.map(row => ({
          id: row.id,
          type: row.type,
          content: row.content,
          timestamp: row.timestamp,
          metadata: row.metadata
        }));

        this.tokenCount = data.reduce((sum, row) => sum + (row.tokens_used || 0), 0);
      }
    } catch (error) {
      console.error("[v0] Error loading conversation from database:", error);
    }
  }

  /**
   * Export conversation as JSON
   */
  export(): string {
    return JSON.stringify({
      conversation_id: this.conversationId,
      session_id: this.sessionId,
      entries: this.entries,
      token_count: this.tokenCount,
      exported_at: new Date().toISOString()
    }, null, 2);
  }
}

/**
 * Factory function
 */
export function createConversationMemory(
  supabase: SupabaseClient,
  conversationId: string,
  sessionId: string
): ConversationMemory {
  return new ConversationMemory(supabase, conversationId, sessionId);
}
