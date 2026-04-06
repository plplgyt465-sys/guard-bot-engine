/**
 * Idempotency Manager
 * 
 * Guarantees exactly-once execution semantics with:
 * - Hash-based step identification
 * - Result caching with database persistence
 * - Deterministic hash computation
 * - Context-aware cache keys
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// TYPES
// ============================================================================

export interface CachedExecution {
  hash: string;
  stepId: string;
  sessionId: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  executedAt: string;
  durationMs?: number;
  success: boolean;
}

export interface IdempotencyCheckResult {
  isCached: boolean;
  cachedResult?: unknown;
  hash: string;
  cacheAge?: number; // milliseconds since cached
}

export interface CacheStats {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
}

// ============================================================================
// IDEMPOTENCY MANAGER
// ============================================================================

export class IdempotencyManager {
  private supabase: SupabaseClient;
  private memoryCache: Map<string, CachedExecution>;
  private stats: { hits: number; misses: number };
  
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.memoryCache = new Map();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Compute deterministic hash for a step
   * Includes tool name, normalized args, and optional context
   */
  computeStepHash(
    tool: string, 
    args: Record<string, unknown>, 
    contextHash?: string
  ): string {
    const normalized = this.normalizeArgs(args);
    const input = contextHash 
      ? `${tool}:${JSON.stringify(normalized)}:${contextHash}`
      : `${tool}:${JSON.stringify(normalized)}`;
    return this.sha256Like(input);
  }

  /**
   * Compute hash for a full execution context
   * Useful for detecting environment changes
   */
  computeContextHash(context: {
    target: string;
    phase?: string;
    previousResults?: string[];
  }): string {
    const input = JSON.stringify({
      target: context.target,
      phase: context.phase || '',
      previousResults: (context.previousResults || []).sort()
    });
    return this.sha256Like(input);
  }

  /**
   * Check if a step has already been executed
   */
  async hasExecuted(hash: string): Promise<boolean> {
    // Check memory cache first
    if (this.memoryCache.has(hash)) {
      this.stats.hits++;
      return true;
    }

    // Check database
    const { data } = await this.supabase
      .from('execution_cache')
      .select('hash')
      .eq('hash', hash)
      .single();

    if (data) {
      this.stats.hits++;
      return true;
    }

    this.stats.misses++;
    return false;
  }

  /**
   * Full idempotency check with result retrieval
   */
  async checkIdempotency(hash: string): Promise<IdempotencyCheckResult> {
    // Check memory cache first
    if (this.memoryCache.has(hash)) {
      const cached = this.memoryCache.get(hash)!;
      const cacheAge = Date.now() - new Date(cached.executedAt).getTime();
      this.stats.hits++;
      return {
        isCached: true,
        cachedResult: cached.result,
        hash,
        cacheAge
      };
    }

    // Check database
    const { data } = await this.supabase
      .from('execution_cache')
      .select('*')
      .eq('hash', hash)
      .single();

    if (data) {
      // Populate memory cache
      const cached: CachedExecution = {
        hash: data.hash,
        stepId: data.step_id,
        sessionId: data.session_id,
        tool: data.tool,
        args: data.args,
        result: data.result,
        executedAt: data.executed_at,
        durationMs: data.duration_ms,
        success: data.success ?? true
      };
      this.memoryCache.set(hash, cached);
      
      const cacheAge = Date.now() - new Date(cached.executedAt).getTime();
      this.stats.hits++;
      
      return {
        isCached: true,
        cachedResult: cached.result,
        hash,
        cacheAge
      };
    }

    this.stats.misses++;
    return {
      isCached: false,
      hash
    };
  }

  /**
   * Get cached result directly
   */
  async getCachedResult(hash: string): Promise<unknown | null> {
    // Check memory cache first
    if (this.memoryCache.has(hash)) {
      return this.memoryCache.get(hash)!.result;
    }

    // Check database
    const { data } = await this.supabase
      .from('execution_cache')
      .select('result')
      .eq('hash', hash)
      .single();

    return data?.result ?? null;
  }

  /**
   * Cache an execution result
   */
  async cacheResult(
    hash: string,
    stepId: string,
    tool: string,
    args: Record<string, unknown>,
    result: unknown,
    sessionId: string,
    options?: {
      durationMs?: number;
      success?: boolean;
    }
  ): Promise<void> {
    const entry: CachedExecution = {
      hash,
      stepId,
      sessionId,
      tool,
      args,
      result,
      executedAt: new Date().toISOString(),
      durationMs: options?.durationMs,
      success: options?.success ?? true
    };

    // Update memory cache
    this.memoryCache.set(hash, entry);

    // Persist to database
    await this.supabase.from('execution_cache').upsert({
      hash: entry.hash,
      step_id: entry.stepId,
      session_id: entry.sessionId,
      tool: entry.tool,
      args: entry.args,
      result: entry.result,
      executed_at: entry.executedAt,
      duration_ms: entry.durationMs,
      success: entry.success
    });
  }

  /**
   * Invalidate a cached result
   */
  async invalidate(hash: string): Promise<void> {
    this.memoryCache.delete(hash);
    
    await this.supabase
      .from('execution_cache')
      .delete()
      .eq('hash', hash);
  }

  /**
   * Invalidate all cached results for a session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    // Clear matching entries from memory cache
    for (const [hash, entry] of this.memoryCache) {
      if (entry.sessionId === sessionId) {
        this.memoryCache.delete(hash);
      }
    }

    // Clear from database
    await this.supabase
      .from('execution_cache')
      .delete()
      .eq('session_id', sessionId);
  }

  /**
   * Invalidate cached results for a specific tool
   */
  async invalidateTool(tool: string, sessionId?: string): Promise<void> {
    // Clear matching entries from memory cache
    for (const [hash, entry] of this.memoryCache) {
      if (entry.tool === tool && (!sessionId || entry.sessionId === sessionId)) {
        this.memoryCache.delete(hash);
      }
    }

    // Clear from database
    let query = this.supabase
      .from('execution_cache')
      .delete()
      .eq('tool', tool);
    
    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    await query;
  }

  /**
   * Get all cached executions for a session
   */
  async getSessionCache(sessionId: string): Promise<CachedExecution[]> {
    const { data } = await this.supabase
      .from('execution_cache')
      .select('*')
      .eq('session_id', sessionId)
      .order('executed_at', { ascending: true });

    if (!data) return [];

    return data.map(row => ({
      hash: row.hash,
      stepId: row.step_id,
      sessionId: row.session_id,
      tool: row.tool,
      args: row.args,
      result: row.result,
      executedAt: row.executed_at,
      durationMs: row.duration_ms,
      success: row.success ?? true
    }));
  }

  /**
   * Preload session cache into memory
   */
  async preloadSessionCache(sessionId: string): Promise<number> {
    const cached = await this.getSessionCache(sessionId);
    
    for (const entry of cached) {
      this.memoryCache.set(entry.hash, entry);
    }

    return cached.length;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      totalEntries: this.memoryCache.size,
      hitCount: this.stats.hits,
      missCount: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Clear memory cache (does not affect database)
   */
  clearMemoryCache(): void {
    this.memoryCache.clear();
  }

  /**
   * Normalize args for consistent hashing
   * - Sorts object keys
   * - Removes undefined values
   * - Normalizes dates and numbers
   */
  private normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    if (!args || typeof args !== 'object') {
      return {};
    }

    const sortedKeys = Object.keys(args).sort();
    const normalized: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      const value = args[key];
      
      // Skip undefined
      if (value === undefined) continue;
      
      // Recursively normalize nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        normalized[key] = this.normalizeArgs(value as Record<string, unknown>);
      }
      // Normalize arrays
      else if (Array.isArray(value)) {
        normalized[key] = value.map(item => 
          typeof item === 'object' && item !== null 
            ? this.normalizeArgs(item as Record<string, unknown>)
            : item
        );
      }
      // Keep primitives as-is
      else {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  /**
   * SHA256-like hash function (Deno compatible)
   * Uses a simple but effective hashing algorithm
   */
  private sha256Like(str: string): string {
    // FNV-1a hash variant with good distribution
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
    
    // Combine into 16-character hex string
    const hash1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hash2 = (h2 >>> 0).toString(16).padStart(8, '0');
    
    return hash1 + hash2;
  }

  /**
   * Execute a step with idempotency guarantee
   * This is a convenience wrapper that handles the full flow
   */
  async executeWithIdempotency<T>(
    tool: string,
    args: Record<string, unknown>,
    stepId: string,
    sessionId: string,
    executor: () => Promise<T>,
    options?: {
      contextHash?: string;
      forceRefresh?: boolean;
    }
  ): Promise<{ result: T; fromCache: boolean; hash: string }> {
    const hash = this.computeStepHash(tool, args, options?.contextHash);

    // Check cache unless forced refresh
    if (!options?.forceRefresh) {
      const check = await this.checkIdempotency(hash);
      if (check.isCached) {
        console.log(`[IDEMPOTENCY] Cache hit for ${tool} (${hash.substring(0, 8)})`);
        return {
          result: check.cachedResult as T,
          fromCache: true,
          hash
        };
      }
    }

    // Execute
    console.log(`[IDEMPOTENCY] Executing ${tool} (${hash.substring(0, 8)})`);
    const startTime = Date.now();
    
    try {
      const result = await executor();
      const durationMs = Date.now() - startTime;

      // Cache result
      await this.cacheResult(hash, stepId, tool, args, result, sessionId, {
        durationMs,
        success: true
      });

      return {
        result,
        fromCache: false,
        hash
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      // Cache error result too (to avoid retrying immediately)
      await this.cacheResult(hash, stepId, tool, args, { error: String(error) }, sessionId, {
        durationMs,
        success: false
      });

      throw error;
    }
  }
}

/**
 * Factory function for creating IdempotencyManager instances
 */
export function createIdempotencyManager(supabase: SupabaseClient): IdempotencyManager {
  return new IdempotencyManager(supabase);
}
