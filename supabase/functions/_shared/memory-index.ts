/**
 * Unified Memory Index
 * 
 * Provides a global index across all memory layers to prevent "forgetting":
 * - Multi-key indexing (stepId, toolHash, goal, target)
 * - Cross-layer search capabilities
 * - Action deduplication checking
 * - Efficient relevance-based retrieval
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// TYPES
// ============================================================================

export type MemoryLayer = 'short' | 'long' | 'semantic';
export type MemoryType = 'action' | 'result' | 'observation' | 'decision' | 'pattern' | 'error' | 'discovery';

export interface MemoryEntry {
  id: string;
  sessionId: string;
  
  // Indexing keys
  stepId?: string;
  toolHash?: string;
  goal?: string;
  target?: string;
  
  // Content
  type: MemoryType;
  content: unknown;
  
  // Metadata
  timestamp: string;
  layer: MemoryLayer;
  importance: number; // 0-1 scale
  tags?: string[];
}

export interface MemoryIndex {
  byStepId: Map<string, MemoryEntry>;
  byToolHash: Map<string, MemoryEntry>;
  byGoal: Map<string, MemoryEntry[]>;
  byTarget: Map<string, MemoryEntry[]>;
  byType: Map<MemoryType, MemoryEntry[]>;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  matchedKeys: string[];
}

export interface ActionCheck {
  hasExecuted: boolean;
  entry?: MemoryEntry;
  result?: unknown;
}

// ============================================================================
// UNIFIED MEMORY MANAGER
// ============================================================================

export class UnifiedMemoryManager {
  private supabase: SupabaseClient;
  private index: MemoryIndex;
  private shortTerm: MemoryEntry[];
  private longTerm: MemoryEntry[];
  private semantic: MemoryEntry[];
  private sessionId: string;
  
  constructor(supabase: SupabaseClient, sessionId: string) {
    this.supabase = supabase;
    this.sessionId = sessionId;
    this.index = this.createEmptyIndex();
    this.shortTerm = [];
    this.longTerm = [];
    this.semantic = [];
  }

  /**
   * Create empty index structure
   */
  private createEmptyIndex(): MemoryIndex {
    return {
      byStepId: new Map(),
      byToolHash: new Map(),
      byGoal: new Map(),
      byTarget: new Map(),
      byType: new Map()
    };
  }

  /**
   * Add and index a new memory entry
   */
  async addEntry(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry> {
    const fullEntry: MemoryEntry = {
      ...entry,
      id: `mem_${this.sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    // Add to appropriate layer
    switch (fullEntry.layer) {
      case 'short': this.shortTerm.push(fullEntry); break;
      case 'long': this.longTerm.push(fullEntry); break;
      case 'semantic': this.semantic.push(fullEntry); break;
    }

    // Index the entry
    this.indexEntry(fullEntry);

    // Persist to database
    await this.persistEntry(fullEntry);

    return fullEntry;
  }

  /**
   * Index an entry across all applicable keys
   */
  indexEntry(entry: MemoryEntry): void {
    // Index by step
    if (entry.stepId) {
      this.index.byStepId.set(entry.stepId, entry);
    }

    // Index by tool hash
    if (entry.toolHash) {
      this.index.byToolHash.set(entry.toolHash, entry);
    }

    // Index by goal
    if (entry.goal) {
      const existing = this.index.byGoal.get(entry.goal) || [];
      existing.push(entry);
      this.index.byGoal.set(entry.goal, existing);
    }

    // Index by target
    if (entry.target) {
      const existing = this.index.byTarget.get(entry.target) || [];
      existing.push(entry);
      this.index.byTarget.set(entry.target, existing);
    }

    // Index by type
    const byType = this.index.byType.get(entry.type) || [];
    byType.push(entry);
    this.index.byType.set(entry.type, byType);
  }

  /**
   * Query by step ID
   */
  queryByStep(stepId: string): MemoryEntry | null {
    return this.index.byStepId.get(stepId) || null;
  }

  /**
   * Query by tool hash
   */
  queryByToolHash(hash: string): MemoryEntry | null {
    return this.index.byToolHash.get(hash) || null;
  }

  /**
   * Query all entries for a goal
   */
  queryByGoal(goal: string): MemoryEntry[] {
    return this.index.byGoal.get(goal) || [];
  }

  /**
   * Query all entries for a target
   */
  queryByTarget(target: string): MemoryEntry[] {
    return this.index.byTarget.get(target) || [];
  }

  /**
   * Query all entries of a type
   */
  queryByType(type: MemoryType): MemoryEntry[] {
    return this.index.byType.get(type) || [];
  }

  /**
   * Check if an action has already been executed
   * Critical for preventing duplicate work
   */
  hasExecutedAction(toolName: string, args: Record<string, unknown>): ActionCheck {
    const hash = this.computeToolHash(toolName, args);
    const entry = this.index.byToolHash.get(hash);
    
    if (entry) {
      return {
        hasExecuted: true,
        entry,
        result: (entry.content as { result?: unknown })?.result
      };
    }

    return { hasExecuted: false };
  }

  /**
   * Record an action execution
   */
  async recordAction(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    options: {
      stepId?: string;
      goal?: string;
      target?: string;
      success?: boolean;
      importance?: number;
    } = {}
  ): Promise<MemoryEntry> {
    const hash = this.computeToolHash(toolName, args);
    
    return this.addEntry({
      sessionId: this.sessionId,
      stepId: options.stepId,
      toolHash: hash,
      goal: options.goal,
      target: options.target,
      type: 'action',
      content: {
        tool: toolName,
        args,
        result,
        success: options.success ?? true
      },
      layer: 'short',
      importance: options.importance ?? 0.5
    });
  }

  /**
   * Record an observation (discovered information)
   */
  async recordObservation(
    observation: string,
    data: unknown,
    options: {
      goal?: string;
      target?: string;
      importance?: number;
    } = {}
  ): Promise<MemoryEntry> {
    return this.addEntry({
      sessionId: this.sessionId,
      goal: options.goal,
      target: options.target,
      type: 'observation',
      content: {
        observation,
        data
      },
      layer: 'short',
      importance: options.importance ?? 0.5
    });
  }

  /**
   * Record a decision made by the agent
   */
  async recordDecision(
    decision: string,
    reasoning: string,
    options: {
      goal?: string;
      target?: string;
      importance?: number;
    } = {}
  ): Promise<MemoryEntry> {
    return this.addEntry({
      sessionId: this.sessionId,
      goal: options.goal,
      target: options.target,
      type: 'decision',
      content: {
        decision,
        reasoning
      },
      layer: 'short',
      importance: options.importance ?? 0.6
    });
  }

  /**
   * Record a learned pattern (goes to semantic memory)
   */
  async recordPattern(
    pattern: {
      name: string;
      trigger: string;
      action: string;
      effectiveness: number;
    },
    options: {
      goal?: string;
      target?: string;
    } = {}
  ): Promise<MemoryEntry> {
    return this.addEntry({
      sessionId: this.sessionId,
      goal: options.goal,
      target: options.target,
      type: 'pattern',
      content: pattern,
      layer: 'semantic',
      importance: pattern.effectiveness
    });
  }

  /**
   * Record an error for learning
   */
  async recordError(
    error: string,
    context: {
      tool?: string;
      args?: Record<string, unknown>;
      phase?: string;
    },
    options: {
      goal?: string;
      target?: string;
    } = {}
  ): Promise<MemoryEntry> {
    return this.addEntry({
      sessionId: this.sessionId,
      goal: options.goal,
      target: options.target,
      type: 'error',
      content: {
        error,
        context
      },
      layer: 'long',
      importance: 0.7
    });
  }

  /**
   * Search memories by relevance to a query
   */
  searchMemories(query: string, limit: number = 10): MemorySearchResult[] {
    const allEntries = [...this.shortTerm, ...this.longTerm, ...this.semantic];
    
    const scored = allEntries.map(entry => ({
      entry,
      score: this.computeRelevance(entry, query),
      matchedKeys: this.getMatchedKeys(entry, query)
    }));

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Search by multiple criteria
   */
  advancedSearch(criteria: {
    goal?: string;
    target?: string;
    type?: MemoryType;
    layer?: MemoryLayer;
    minImportance?: number;
    since?: string;
    limit?: number;
  }): MemoryEntry[] {
    let results: MemoryEntry[] = [];
    
    // Start with appropriate layer(s)
    if (criteria.layer) {
      switch (criteria.layer) {
        case 'short': results = [...this.shortTerm]; break;
        case 'long': results = [...this.longTerm]; break;
        case 'semantic': results = [...this.semantic]; break;
      }
    } else {
      results = [...this.shortTerm, ...this.longTerm, ...this.semantic];
    }

    // Filter by criteria
    if (criteria.goal) {
      results = results.filter(e => e.goal === criteria.goal);
    }
    if (criteria.target) {
      results = results.filter(e => e.target === criteria.target);
    }
    if (criteria.type) {
      results = results.filter(e => e.type === criteria.type);
    }
    if (criteria.minImportance !== undefined) {
      results = results.filter(e => e.importance >= criteria.minImportance!);
    }
    if (criteria.since) {
      results = results.filter(e => e.timestamp >= criteria.since!);
    }

    // Sort by importance and recency
    results.sort((a, b) => {
      const importanceDiff = b.importance - a.importance;
      if (importanceDiff !== 0) return importanceDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return results.slice(0, criteria.limit || 100);
  }

  /**
   * Get recent memories
   */
  getRecentMemories(count: number = 10): MemoryEntry[] {
    const all = [...this.shortTerm, ...this.longTerm, ...this.semantic];
    return all
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);
  }

  /**
   * Get important memories
   */
  getImportantMemories(count: number = 10): MemoryEntry[] {
    const all = [...this.shortTerm, ...this.longTerm, ...this.semantic];
    return all
      .sort((a, b) => b.importance - a.importance)
      .slice(0, count);
  }

  /**
   * Promote a memory to long-term storage
   */
  async promoteToLongTerm(entryId: string): Promise<void> {
    // Find in short-term
    const index = this.shortTerm.findIndex(e => e.id === entryId);
    if (index === -1) return;

    const entry = this.shortTerm[index];
    entry.layer = 'long';
    
    // Move to long-term
    this.shortTerm.splice(index, 1);
    this.longTerm.push(entry);

    // Update in database
    await this.supabase
      .from('memory_index')
      .update({ layer: 'long' })
      .eq('id', entryId);
  }

  /**
   * Serialize memory for checkpoint
   */
  serialize(): string {
    return JSON.stringify({
      shortTerm: this.shortTerm,
      longTerm: this.longTerm,
      semantic: this.semantic
    });
  }

  /**
   * Deserialize memory from checkpoint
   */
  deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.shortTerm = parsed.shortTerm || [];
      this.longTerm = parsed.longTerm || [];
      this.semantic = parsed.semantic || [];
      
      // Rebuild index
      this.rebuildIndex();
    } catch (error) {
      console.error('[MEMORY] Failed to deserialize:', error);
      this.shortTerm = [];
      this.longTerm = [];
      this.semantic = [];
      this.index = this.createEmptyIndex();
    }
  }

  /**
   * Load memory from database
   */
  async load(): Promise<void> {
    const { data } = await this.supabase
      .from('memory_index')
      .select('*')
      .eq('session_id', this.sessionId)
      .order('created_at', { ascending: true });

    if (!data) return;

    for (const row of data) {
      const entry: MemoryEntry = {
        id: row.id,
        sessionId: row.session_id,
        stepId: row.step_id,
        toolHash: row.tool_hash,
        goal: row.goal,
        target: row.target,
        type: row.type as MemoryType,
        content: row.content,
        timestamp: row.created_at,
        layer: row.layer as MemoryLayer,
        importance: row.importance,
        tags: row.tags
      };

      switch (entry.layer) {
        case 'short': this.shortTerm.push(entry); break;
        case 'long': this.longTerm.push(entry); break;
        case 'semantic': this.semantic.push(entry); break;
      }

      this.indexEntry(entry);
    }
  }

  /**
   * Persist an entry to database
   */
  private async persistEntry(entry: MemoryEntry): Promise<void> {
    await this.supabase.from('memory_index').insert({
      id: entry.id,
      session_id: entry.sessionId,
      step_id: entry.stepId,
      tool_hash: entry.toolHash,
      goal: entry.goal,
      target: entry.target,
      type: entry.type,
      content: entry.content,
      layer: entry.layer,
      importance: entry.importance,
      tags: entry.tags
    });
  }

  /**
   * Rebuild index from memory layers
   */
  private rebuildIndex(): void {
    this.index = this.createEmptyIndex();
    
    for (const entry of [...this.shortTerm, ...this.longTerm, ...this.semantic]) {
      this.indexEntry(entry);
    }
  }

  /**
   * Compute tool hash for indexing
   */
  computeToolHash(tool: string, args: Record<string, unknown>): string {
    const normalized = JSON.stringify(args, Object.keys(args).sort());
    return this.simpleHash(`${tool}:${normalized}`);
  }

  /**
   * Compute relevance score for search
   */
  private computeRelevance(entry: MemoryEntry, query: string): number {
    const queryLower = query.toLowerCase();
    let score = 0;

    // Check content
    const contentStr = JSON.stringify(entry.content).toLowerCase();
    if (contentStr.includes(queryLower)) {
      score += 0.5;
    }

    // Check goal
    if (entry.goal?.toLowerCase().includes(queryLower)) {
      score += 0.3;
    }

    // Check target
    if (entry.target?.toLowerCase().includes(queryLower)) {
      score += 0.2;
    }

    // Boost by importance
    score *= (0.5 + entry.importance * 0.5);

    // Slight recency boost
    const ageMs = Date.now() - new Date(entry.timestamp).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < 1) score *= 1.2;
    else if (ageHours < 24) score *= 1.1;

    return score;
  }

  /**
   * Get matched keys for search result
   */
  private getMatchedKeys(entry: MemoryEntry, query: string): string[] {
    const queryLower = query.toLowerCase();
    const matched: string[] = [];

    if (entry.goal?.toLowerCase().includes(queryLower)) matched.push('goal');
    if (entry.target?.toLowerCase().includes(queryLower)) matched.push('target');
    if (JSON.stringify(entry.content).toLowerCase().includes(queryLower)) matched.push('content');

    return matched;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    
    return (h1 >>> 0).toString(16).padStart(8, '0') + 
           (h2 >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    shortTermCount: number;
    longTermCount: number;
    semanticCount: number;
    totalCount: number;
    indexedByStep: number;
    indexedByTool: number;
    indexedByGoal: number;
    indexedByTarget: number;
  } {
    return {
      shortTermCount: this.shortTerm.length,
      longTermCount: this.longTerm.length,
      semanticCount: this.semantic.length,
      totalCount: this.shortTerm.length + this.longTerm.length + this.semantic.length,
      indexedByStep: this.index.byStepId.size,
      indexedByTool: this.index.byToolHash.size,
      indexedByGoal: this.index.byGoal.size,
      indexedByTarget: this.index.byTarget.size
    };
  }

  /**
   * Clear all memory (use with caution)
   */
  async clear(): Promise<void> {
    this.shortTerm = [];
    this.longTerm = [];
    this.semantic = [];
    this.index = this.createEmptyIndex();

    await this.supabase
      .from('memory_index')
      .delete()
      .eq('session_id', this.sessionId);
  }

  /**
   * Garbage collect old short-term memories
   */
  async gc(maxShortTermAge: number = 3600000): Promise<number> {
    const cutoff = Date.now() - maxShortTermAge;
    const toRemove: string[] = [];

    this.shortTerm = this.shortTerm.filter(entry => {
      const entryTime = new Date(entry.timestamp).getTime();
      if (entryTime < cutoff && entry.importance < 0.7) {
        toRemove.push(entry.id);
        return false;
      }
      return true;
    });

    // Rebuild index after removal
    this.rebuildIndex();

    // Remove from database
    if (toRemove.length > 0) {
      await this.supabase
        .from('memory_index')
        .delete()
        .in('id', toRemove);
    }

    return toRemove.length;
  }
}

/**
 * Factory function
 */
export function createUnifiedMemoryManager(
  supabase: SupabaseClient, 
  sessionId: string
): UnifiedMemoryManager {
  return new UnifiedMemoryManager(supabase, sessionId);
}
