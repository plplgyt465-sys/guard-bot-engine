/**
 * Replay Engine
 * 
 * Enables deterministic resume from checkpoints with:
 * - Full action recording with state snapshots
 * - History replay for state reconstruction
 * - State validation and drift detection
 * - Sequence management for ordering
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ExecutionGraph, ExecutionGraphManager } from "./execution-graph.ts";
import { AgentSession } from "./agent-core.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface StateSnapshot {
  memoryHash: string;
  graphHash: string;
  contextHash: string;
  timestamp: string;
}

export interface ExecutedAction {
  id: string;
  sessionId: string;
  sequenceNumber: number;
  timestamp: string;
  
  // Action details
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  success: boolean;
  error?: string;
  durationMs: number;
  
  // State snapshots
  preState: StateSnapshot;
  postState: StateSnapshot;
  
  // Graph position
  nodeId: string;
  graphVersion: number;
}

export interface RestoredState {
  session: AgentSession;
  graph: ExecutionGraph;
  memoryData: string;
  history: ExecutedAction[];
  lastValidAction: ExecutedAction | null;
  lastSequence: number;
  isValid: boolean;
  validationErrors: string[];
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  version: number;
  timestamp: string;
  
  // Full state
  sessionState: Partial<AgentSession>;
  graphState: string;
  memorySnapshot: string;
  
  // Replay support
  lastSequence: number;
  expectedStateHash: string;
  
  // Metadata
  stepIndex: number;
  phase: string;
  reason: 'periodic' | 'pre_risk' | 'error' | 'manual' | 'complete';
}

export interface ReplayOptions {
  validateState?: boolean;
  stopAtSequence?: number;
  skipActions?: string[];
}

// ============================================================================
// REPLAY ENGINE
// ============================================================================

export class ReplayEngine {
  private supabase: SupabaseClient;
  private graphManager: ExecutionGraphManager;
  private sequenceCounters: Map<string, number>;
  
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.graphManager = new ExecutionGraphManager(supabase);
    this.sequenceCounters = new Map();
  }

  /**
   * Record an executed action with full state snapshots
   */
  async recordAction(
    sessionId: string,
    action: {
      tool: string;
      args: Record<string, unknown>;
      result: unknown;
      success: boolean;
      error?: string;
      durationMs: number;
      nodeId: string;
      graphVersion: number;
      preState: StateSnapshot;
      postState: StateSnapshot;
    }
  ): Promise<string> {
    const sequence = await this.getNextSequence(sessionId);
    const actionId = `${sessionId}_${sequence}`;

    const executedAction: ExecutedAction = {
      id: actionId,
      sessionId,
      sequenceNumber: sequence,
      timestamp: new Date().toISOString(),
      ...action
    };

    await this.supabase.from('execution_history').insert({
      id: executedAction.id,
      session_id: executedAction.sessionId,
      sequence_number: executedAction.sequenceNumber,
      timestamp: executedAction.timestamp,
      tool: executedAction.tool,
      args: executedAction.args,
      result: executedAction.result,
      success: executedAction.success,
      error: executedAction.error,
      duration_ms: executedAction.durationMs,
      node_id: executedAction.nodeId,
      graph_version: executedAction.graphVersion,
      pre_state: executedAction.preState,
      post_state: executedAction.postState
    });

    return actionId;
  }

  /**
   * Get next sequence number for a session
   */
  private async getNextSequence(sessionId: string): Promise<number> {
    // Check memory cache
    if (this.sequenceCounters.has(sessionId)) {
      const next = this.sequenceCounters.get(sessionId)! + 1;
      this.sequenceCounters.set(sessionId, next);
      return next;
    }

    // Get from database
    const { data } = await this.supabase
      .from('execution_history')
      .select('sequence_number')
      .eq('session_id', sessionId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .single();

    const next = (data?.sequence_number ?? -1) + 1;
    this.sequenceCounters.set(sessionId, next);
    return next;
  }

  /**
   * Get full execution history for a session
   */
  async getExecutionHistory(sessionId: string): Promise<ExecutedAction[]> {
    const { data } = await this.supabase
      .from('execution_history')
      .select('*')
      .eq('session_id', sessionId)
      .order('sequence_number', { ascending: true });

    if (!data) return [];

    return data.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      sequenceNumber: row.sequence_number,
      timestamp: row.timestamp,
      tool: row.tool,
      args: row.args,
      result: row.result,
      success: row.success,
      error: row.error,
      durationMs: row.duration_ms,
      nodeId: row.node_id,
      graphVersion: row.graph_version,
      preState: row.pre_state,
      postState: row.post_state
    }));
  }

  /**
   * Get history since a specific sequence number
   */
  async getHistorySince(sessionId: string, afterSequence: number): Promise<ExecutedAction[]> {
    const { data } = await this.supabase
      .from('execution_history')
      .select('*')
      .eq('session_id', sessionId)
      .gt('sequence_number', afterSequence)
      .order('sequence_number', { ascending: true });

    if (!data) return [];

    return data.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      sequenceNumber: row.sequence_number,
      timestamp: row.timestamp,
      tool: row.tool,
      args: row.args,
      result: row.result,
      success: row.success,
      error: row.error,
      durationMs: row.duration_ms,
      nodeId: row.node_id,
      graphVersion: row.graph_version,
      preState: row.pre_state,
      postState: row.post_state
    }));
  }

  /**
   * Get the last recorded action
   */
  async getLastAction(sessionId: string): Promise<ExecutedAction | null> {
    const { data } = await this.supabase
      .from('execution_history')
      .select('*')
      .eq('session_id', sessionId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .single();

    if (!data) return null;

    return {
      id: data.id,
      sessionId: data.session_id,
      sequenceNumber: data.sequence_number,
      timestamp: data.timestamp,
      tool: data.tool,
      args: data.args,
      result: data.result,
      success: data.success,
      error: data.error,
      durationMs: data.duration_ms,
      nodeId: data.node_id,
      graphVersion: data.graph_version,
      preState: data.pre_state,
      postState: data.post_state
    };
  }

  /**
   * Restore full state from checkpoint
   */
  async restoreFromCheckpoint(
    checkpoint: Checkpoint,
    options: ReplayOptions = {}
  ): Promise<RestoredState> {
    const validationErrors: string[] = [];

    // 1. Restore session state
    const { data: sessionData } = await this.supabase
      .from('agent_sessions')
      .select('*')
      .eq('id', checkpoint.sessionId)
      .single();

    if (!sessionData) {
      throw new Error(`Session ${checkpoint.sessionId} not found`);
    }

    const session = sessionData as AgentSession;

    // 2. Restore graph state
    const graph = this.graphManager.deserializeGraph(checkpoint.graphState);

    // 3. Get history since checkpoint
    const history = await this.getHistorySince(
      checkpoint.sessionId,
      checkpoint.lastSequence
    );

    // 4. Replay history to rebuild state
    if (history.length > 0) {
      console.log(`[REPLAY] Replaying ${history.length} actions since checkpoint`);
      await this.replayHistory(history, graph, options);
    }

    // 5. Validate state consistency
    let isValid = true;
    if (options.validateState !== false) {
      const currentStateHash = this.computeGraphStateHash(graph);
      
      // If we replayed actions, validate against post-state of last action
      if (history.length > 0) {
        const lastAction = history[history.length - 1];
        if (lastAction.postState.graphHash !== currentStateHash) {
          validationErrors.push(
            `Graph state drift detected: expected ${lastAction.postState.graphHash}, got ${currentStateHash}`
          );
          isValid = false;
        }
      }
    }

    // 6. Update sequence counter
    const lastSequence = history.length > 0 
      ? history[history.length - 1].sequenceNumber 
      : checkpoint.lastSequence;
    this.sequenceCounters.set(checkpoint.sessionId, lastSequence);

    return {
      session,
      graph,
      memoryData: checkpoint.memorySnapshot,
      history,
      lastValidAction: history.length > 0 ? history[history.length - 1] : null,
      lastSequence,
      isValid,
      validationErrors
    };
  }

  /**
   * Replay execution history to rebuild state
   */
  async replayHistory(
    history: ExecutedAction[],
    graph: ExecutionGraph,
    options: ReplayOptions = {}
  ): Promise<void> {
    for (const action of history) {
      // Stop at specific sequence if requested
      if (options.stopAtSequence !== undefined && 
          action.sequenceNumber > options.stopAtSequence) {
        break;
      }

      // Skip specific actions if requested
      if (options.skipActions?.includes(action.id)) {
        continue;
      }

      // Apply action to graph
      this.applyActionToGraph(graph, action);
    }
  }

  /**
   * Apply a single action to graph state (without re-executing)
   */
  private applyActionToGraph(graph: ExecutionGraph, action: ExecutedAction): void {
    const node = graph.nodes.get(action.nodeId);
    if (!node) {
      console.warn(`[REPLAY] Node ${action.nodeId} not found in graph`);
      return;
    }

    // Update node state based on action result
    if (action.success) {
      node.status = "done";
      node.result = action.result;
    } else {
      node.status = "failed";
      node.error = action.error;
    }
    node.completedAt = action.timestamp;

    // Update graph counters
    if (action.success) {
      graph.completedCount++;
    } else {
      graph.failedCount++;
    }

    // Update dependent nodes
    for (const dependentId of node.dependents) {
      const dependent = graph.nodes.get(dependentId);
      if (dependent && dependent.status === "pending") {
        const allDepsDone = dependent.dependsOn.every(depId => {
          const depNode = graph.nodes.get(depId);
          return depNode && (depNode.status === "done" || depNode.status === "skipped");
        });
        
        if (allDepsDone) {
          dependent.status = "ready";
        }
      }
    }
  }

  /**
   * Validate state consistency between expected and actual
   */
  validateStateConsistency(expected: string, actual: string): boolean {
    return expected === actual;
  }

  /**
   * Compute state hash for a graph
   */
  computeGraphStateHash(graph: ExecutionGraph): string {
    const stateData = {
      completedNodes: Array.from(graph.nodes.entries())
        .filter(([, n]) => n.status === 'done' || n.status === 'skipped')
        .map(([id]) => id)
        .sort(),
      failedNodes: Array.from(graph.nodes.entries())
        .filter(([, n]) => n.status === 'failed')
        .map(([id]) => id)
        .sort(),
      version: graph.version
    };
    return this.simpleHash(JSON.stringify(stateData));
  }

  /**
   * Compute state hash for memory
   */
  computeMemoryHash(memoryData: string): string {
    return this.simpleHash(memoryData);
  }

  /**
   * Compute combined state hash
   */
  computeFullStateHash(
    session: { phase: string; step_count: number },
    graph: ExecutionGraph,
    memoryHash: string
  ): string {
    const input = JSON.stringify({
      sessionPhase: session.phase,
      stepCount: session.step_count,
      graphHash: this.computeGraphStateHash(graph),
      memoryHash
    });
    return this.simpleHash(input);
  }

  /**
   * Create a state snapshot
   */
  createStateSnapshot(
    memoryData: string,
    graph: ExecutionGraph,
    context: Record<string, unknown>
  ): StateSnapshot {
    return {
      memoryHash: this.computeMemoryHash(memoryData),
      graphHash: this.computeGraphStateHash(graph),
      contextHash: this.simpleHash(JSON.stringify(context)),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Simple hash function (Deno compatible)
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
    
    const hash1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hash2 = (h2 >>> 0).toString(16).padStart(8, '0');
    
    return hash1 + hash2;
  }

  /**
   * Get action statistics for a session
   */
  async getActionStats(sessionId: string): Promise<{
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    totalDurationMs: number;
    averageDurationMs: number;
    toolUsage: Record<string, number>;
  }> {
    const history = await this.getExecutionHistory(sessionId);
    
    const stats = {
      totalActions: history.length,
      successfulActions: 0,
      failedActions: 0,
      totalDurationMs: 0,
      averageDurationMs: 0,
      toolUsage: {} as Record<string, number>
    };

    for (const action of history) {
      if (action.success) {
        stats.successfulActions++;
      } else {
        stats.failedActions++;
      }
      stats.totalDurationMs += action.durationMs;
      stats.toolUsage[action.tool] = (stats.toolUsage[action.tool] || 0) + 1;
    }

    stats.averageDurationMs = stats.totalActions > 0 
      ? stats.totalDurationMs / stats.totalActions 
      : 0;

    return stats;
  }

  /**
   * Delete history for a session
   */
  async deleteHistory(sessionId: string): Promise<void> {
    await this.supabase
      .from('execution_history')
      .delete()
      .eq('session_id', sessionId);
    
    this.sequenceCounters.delete(sessionId);
  }

  /**
   * Trim old history (keep only recent entries)
   */
  async trimHistory(sessionId: string, keepCount: number): Promise<number> {
    const { data } = await this.supabase
      .from('execution_history')
      .select('id, sequence_number')
      .eq('session_id', sessionId)
      .order('sequence_number', { ascending: false });

    if (!data || data.length <= keepCount) {
      return 0;
    }

    const idsToDelete = data.slice(keepCount).map(row => row.id);
    
    await this.supabase
      .from('execution_history')
      .delete()
      .in('id', idsToDelete);

    return idsToDelete.length;
  }
}

/**
 * Factory function for creating ReplayEngine instances
 */
export function createReplayEngine(supabase: SupabaseClient): ReplayEngine {
  return new ReplayEngine(supabase);
}
