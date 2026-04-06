/**
 * Checkpoint Manager
 * 
 * Manages full state persistence and recovery:
 * - Periodic checkpoint creation
 * - Full state snapshots (session + graph + memory)
 * - Deterministic restore with replay engine integration
 * - Risk-aware checkpointing before dangerous operations
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AgentSession } from "./agent-core.ts";
import { ExecutionGraph, ExecutionGraphManager } from "./execution-graph.ts";
import { ReplayEngine, Checkpoint, RestoredState } from "./replay-engine.ts";
import { UnifiedMemoryManager } from "./memory-index.ts";

// ============================================================================
// TYPES
// ============================================================================

export type CheckpointReason = 'periodic' | 'pre_risk' | 'error' | 'manual' | 'complete';

export interface CheckpointConfig {
  periodicInterval: number;     // Create checkpoint every N steps
  createOnRisk: boolean;        // Create checkpoint before risky operations
  createOnError: boolean;       // Create checkpoint on errors
  maxCheckpoints: number;       // Max checkpoints to keep per session
  compressSnapshots: boolean;   // Compress large snapshots
}

export interface CheckpointResult {
  checkpoint: Checkpoint;
  created: boolean;
  reason: CheckpointReason;
}

export interface RestoreResult {
  success: boolean;
  state?: RestoredState;
  error?: string;
  checkpointId?: string;
  replayed?: number;
}

// ============================================================================
// CHECKPOINT MANAGER
// ============================================================================

export class CheckpointManager {
  private supabase: SupabaseClient;
  private replayEngine: ReplayEngine;
  private graphManager: ExecutionGraphManager;
  private config: CheckpointConfig;
  private versionCounters: Map<string, number>;

  constructor(
    supabase: SupabaseClient,
    replayEngine: ReplayEngine,
    config?: Partial<CheckpointConfig>
  ) {
    this.supabase = supabase;
    this.replayEngine = replayEngine;
    this.graphManager = new ExecutionGraphManager(supabase);
    this.config = {
      periodicInterval: 2,
      createOnRisk: true,
      createOnError: true,
      maxCheckpoints: 10,
      compressSnapshots: false,
      ...config
    };
    this.versionCounters = new Map();
  }

  /**
   * Create a checkpoint with full state
   */
  async createCheckpoint(
    session: AgentSession,
    graph: ExecutionGraph,
    memory: UnifiedMemoryManager,
    reason: CheckpointReason
  ): Promise<CheckpointResult> {
    const version = await this.getNextVersion(session.id);
    const lastAction = await this.replayEngine.getLastAction(session.id);

    // Serialize state
    const graphState = this.graphManager.serializeGraph(graph);
    const memorySnapshot = memory.serialize();

    // Compute expected state hash for validation
    const expectedStateHash = this.replayEngine.computeFullStateHash(
      { phase: session.phase, step_count: session.step_count },
      graph,
      this.replayEngine.computeMemoryHash(memorySnapshot)
    );

    const checkpoint: Checkpoint = {
      id: `cp_${session.id}_${Date.now()}`,
      sessionId: session.id,
      version,
      timestamp: new Date().toISOString(),
      
      sessionState: this.extractSessionState(session),
      graphState: this.config.compressSnapshots 
        ? this.compress(graphState) 
        : graphState,
      memorySnapshot: this.config.compressSnapshots 
        ? this.compress(memorySnapshot) 
        : memorySnapshot,
      
      lastSequence: lastAction?.sequenceNumber ?? 0,
      expectedStateHash,
      
      stepIndex: this.getCurrentStepIndex(graph),
      phase: session.phase,
      reason
    };

    // Persist checkpoint
    await this.supabase.from('agent_checkpoints').insert({
      id: checkpoint.id,
      session_id: checkpoint.sessionId,
      version: checkpoint.version,
      timestamp: checkpoint.timestamp,
      session_state: checkpoint.sessionState,
      graph_state: checkpoint.graphState,
      memory_snapshot: checkpoint.memorySnapshot,
      last_sequence: checkpoint.lastSequence,
      expected_state_hash: checkpoint.expectedStateHash,
      step_index: checkpoint.stepIndex,
      phase: checkpoint.phase,
      reason: checkpoint.reason
    });

    // Cleanup old checkpoints
    await this.cleanupOldCheckpoints(session.id);

    console.log(`[CHECKPOINT] Created checkpoint ${checkpoint.id} (v${version}, reason: ${reason})`);

    return {
      checkpoint,
      created: true,
      reason
    };
  }

  /**
   * Get the last checkpoint for a session
   */
  async getLastCheckpoint(sessionId: string): Promise<Checkpoint | null> {
    const { data } = await this.supabase
      .from('agent_checkpoints')
      .select('*')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (!data) return null;

    return {
      id: data.id,
      sessionId: data.session_id,
      version: data.version,
      timestamp: data.timestamp,
      sessionState: data.session_state,
      graphState: this.config.compressSnapshots 
        ? this.decompress(data.graph_state) 
        : data.graph_state,
      memorySnapshot: this.config.compressSnapshots 
        ? this.decompress(data.memory_snapshot) 
        : data.memory_snapshot,
      lastSequence: data.last_sequence,
      expectedStateHash: data.expected_state_hash,
      stepIndex: data.step_index,
      phase: data.phase,
      reason: data.reason as CheckpointReason
    };
  }

  /**
   * Get checkpoint by version
   */
  async getCheckpointByVersion(sessionId: string, version: number): Promise<Checkpoint | null> {
    const { data } = await this.supabase
      .from('agent_checkpoints')
      .select('*')
      .eq('session_id', sessionId)
      .eq('version', version)
      .single();

    if (!data) return null;

    return {
      id: data.id,
      sessionId: data.session_id,
      version: data.version,
      timestamp: data.timestamp,
      sessionState: data.session_state,
      graphState: this.config.compressSnapshots 
        ? this.decompress(data.graph_state) 
        : data.graph_state,
      memorySnapshot: this.config.compressSnapshots 
        ? this.decompress(data.memory_snapshot) 
        : data.memory_snapshot,
      lastSequence: data.last_sequence,
      expectedStateHash: data.expected_state_hash,
      stepIndex: data.step_index,
      phase: data.phase,
      reason: data.reason as CheckpointReason
    };
  }

  /**
   * Full restore from checkpoint using replay engine
   */
  async restoreFromCheckpoint(sessionId: string): Promise<RestoreResult> {
    try {
      const checkpoint = await this.getLastCheckpoint(sessionId);
      if (!checkpoint) {
        return {
          success: false,
          error: `No checkpoint found for session ${sessionId}`
        };
      }

      // Use replay engine for full restore
      const state = await this.replayEngine.restoreFromCheckpoint(checkpoint);

      console.log(`[CHECKPOINT] Restored from checkpoint ${checkpoint.id} (v${checkpoint.version})`);
      if (state.history.length > 0) {
        console.log(`[CHECKPOINT] Replayed ${state.history.length} actions`);
      }

      return {
        success: true,
        state,
        checkpointId: checkpoint.id,
        replayed: state.history.length
      };
    } catch (error) {
      console.error('[CHECKPOINT] Restore failed:', error);
      return {
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * Check if a checkpoint should be created
   */
  shouldCreateCheckpoint(
    stepCount: number,
    isRiskyOperation: boolean,
    hasError: boolean
  ): { should: boolean; reason: CheckpointReason } {
    // Error checkpoint
    if (hasError && this.config.createOnError) {
      return { should: true, reason: 'error' };
    }

    // Pre-risk checkpoint
    if (isRiskyOperation && this.config.createOnRisk) {
      return { should: true, reason: 'pre_risk' };
    }

    // Periodic checkpoint
    if (stepCount > 0 && stepCount % this.config.periodicInterval === 0) {
      return { should: true, reason: 'periodic' };
    }

    return { should: false, reason: 'periodic' };
  }

  /**
   * Check if an operation is risky (requires checkpoint before)
   */
  isRiskyOperation(toolName: string): boolean {
    const riskyTools = new Set([
      'sqlmap_scan', 'brute_force', 'exploit_execute', 'payload_inject',
      'shell_upload', 'privilege_escalate', 'data_exfil', 'reverse_shell',
      'sql_injection', 'xss_exploit', 'rce_exploit', 'lfi_exploit'
    ]);
    return riskyTools.has(toolName);
  }

  /**
   * List all checkpoints for a session
   */
  async listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    const { data } = await this.supabase
      .from('agent_checkpoints')
      .select('*')
      .eq('session_id', sessionId)
      .order('version', { ascending: false });

    if (!data) return [];

    return data.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      version: row.version,
      timestamp: row.timestamp,
      sessionState: row.session_state,
      graphState: row.graph_state,
      memorySnapshot: row.memory_snapshot,
      lastSequence: row.last_sequence,
      expectedStateHash: row.expected_state_hash,
      stepIndex: row.step_index,
      phase: row.phase,
      reason: row.reason as CheckpointReason
    }));
  }

  /**
   * Delete a specific checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    await this.supabase
      .from('agent_checkpoints')
      .delete()
      .eq('id', checkpointId);
  }

  /**
   * Delete all checkpoints for a session
   */
  async deleteAllCheckpoints(sessionId: string): Promise<void> {
    await this.supabase
      .from('agent_checkpoints')
      .delete()
      .eq('session_id', sessionId);
    
    this.versionCounters.delete(sessionId);
  }

  /**
   * Cleanup old checkpoints (keep only maxCheckpoints)
   */
  private async cleanupOldCheckpoints(sessionId: string): Promise<void> {
    const { data } = await this.supabase
      .from('agent_checkpoints')
      .select('id, version')
      .eq('session_id', sessionId)
      .order('version', { ascending: false });

    if (!data || data.length <= this.config.maxCheckpoints) {
      return;
    }

    // Keep the most recent N checkpoints
    const toDelete = data.slice(this.config.maxCheckpoints).map(row => row.id);
    
    await this.supabase
      .from('agent_checkpoints')
      .delete()
      .in('id', toDelete);

    console.log(`[CHECKPOINT] Cleaned up ${toDelete.length} old checkpoints`);
  }

  /**
   * Get next version number for a session
   */
  private async getNextVersion(sessionId: string): Promise<number> {
    if (this.versionCounters.has(sessionId)) {
      const next = this.versionCounters.get(sessionId)! + 1;
      this.versionCounters.set(sessionId, next);
      return next;
    }

    const { data } = await this.supabase
      .from('agent_checkpoints')
      .select('version')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const next = (data?.version ?? 0) + 1;
    this.versionCounters.set(sessionId, next);
    return next;
  }

  /**
   * Extract relevant session state for checkpoint
   */
  private extractSessionState(session: AgentSession): Partial<AgentSession> {
    return {
      id: session.id,
      chat_session_id: session.chat_session_id,
      target: session.target,
      phase: session.phase,
      plan: session.plan,
      context: session.context,
      findings: session.findings,
      step_count: session.step_count,
      security_score: session.security_score,
      started_at: session.started_at,
      updated_at: session.updated_at
    };
  }

  /**
   * Get current step index from graph
   */
  private getCurrentStepIndex(graph: ExecutionGraph): number {
    let maxCompleted = -1;
    for (const [, node] of graph.nodes) {
      if ((node.status === 'done' || node.status === 'skipped') && 
          node.stepIndex > maxCompleted) {
        maxCompleted = node.stepIndex;
      }
    }
    return maxCompleted + 1;
  }

  /**
   * Simple compression (for large snapshots)
   */
  private compress(data: string): string {
    // Simple RLE-like compression for repeated patterns
    // In production, use proper compression
    return data; // Placeholder - implement as needed
  }

  /**
   * Decompress data
   */
  private decompress(data: string): string {
    return data; // Placeholder - implement as needed
  }

  /**
   * Get checkpoint statistics
   */
  async getStats(sessionId: string): Promise<{
    totalCheckpoints: number;
    latestVersion: number;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
    byReason: Record<CheckpointReason, number>;
  }> {
    const checkpoints = await this.listCheckpoints(sessionId);
    
    const byReason: Record<CheckpointReason, number> = {
      periodic: 0,
      pre_risk: 0,
      error: 0,
      manual: 0,
      complete: 0
    };

    for (const cp of checkpoints) {
      byReason[cp.reason]++;
    }

    return {
      totalCheckpoints: checkpoints.length,
      latestVersion: checkpoints[0]?.version ?? 0,
      oldestTimestamp: checkpoints[checkpoints.length - 1]?.timestamp ?? null,
      newestTimestamp: checkpoints[0]?.timestamp ?? null,
      byReason
    };
  }
}

/**
 * Factory function
 */
export function createCheckpointManager(
  supabase: SupabaseClient,
  replayEngine: ReplayEngine,
  config?: Partial<CheckpointConfig>
): CheckpointManager {
  return new CheckpointManager(supabase, replayEngine, config);
}
