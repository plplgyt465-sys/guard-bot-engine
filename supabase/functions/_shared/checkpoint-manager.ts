/**
 * Checkpoint Manager Module
 * 
 * Provides automatic state checkpointing for agent sessions to handle timeouts.
 * Features:
 * - Auto-save state before 120s timeout (110s buffer)
 * - Graceful recovery from crashes
 * - Step-level granularity for resumption
 * - Context hash for detecting environment changes
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AgentSession, AgentPhase } from "./agent-core.ts";

export interface CheckpointData {
  id?: string;
  session_id: string;
  step_index: number;
  phase: AgentPhase;
  state_snapshot: AgentSession;
  tool_in_progress?: string;
  tool_input?: Record<string, unknown>;
  context_hash?: string;
  is_timeout_checkpoint: boolean;
  created_at?: string;
}

export interface CheckpointRecovery {
  checkpoint: CheckpointData;
  steps_recovered: number;
  last_tool?: string;
  next_action: string;
}

export class CheckpointManager {
  private supabase: SupabaseClient;
  private sessionId: string;
  private checkpointInterval: number = 2; // Save checkpoint every N steps
  private lastCheckpointStep: number = 0;

  constructor(supabase: SupabaseClient, sessionId: string) {
    this.supabase = supabase;
    this.sessionId = sessionId;
  }

  /**
   * Generate hash of context for detecting changes
   */
  private generateContextHash(session: AgentSession): string {
    const contextStr = JSON.stringify({
      target: session.target,
      intent: session.context?.intent,
      phase: session.phase,
    });
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < contextStr.length; i++) {
      const char = contextStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Save a checkpoint of the current session state
   * Returns true if successful, false otherwise
   */
  async saveCheckpoint(
    session: AgentSession,
    isTimeoutCheckpoint: boolean = false,
    toolInProgress?: string,
    toolInput?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const checkpointNumber = Math.floor(session.step_count / this.checkpointInterval);
      
      // Don't save if we just saved at this step
      if (checkpointNumber === this.lastCheckpointStep && !isTimeoutCheckpoint) {
        return true;
      }

      const checkpoint: CheckpointData = {
        session_id: this.sessionId,
        step_index: session.step_count,
        phase: session.phase,
        state_snapshot: JSON.parse(JSON.stringify(session)), // Deep copy
        tool_in_progress: toolInProgress,
        tool_input: toolInput,
        context_hash: this.generateContextHash(session),
        is_timeout_checkpoint: isTimeoutCheckpoint,
      };

      const { error } = await this.supabase
        .from("agent_checkpoints")
        .insert([checkpoint]);

      if (error) {
        console.error("[v0] Checkpoint save failed:", error.message);
        return false;
      }

      this.lastCheckpointStep = checkpointNumber;
      console.log("[v0] Checkpoint saved at step", session.step_count);
      return true;
    } catch (err) {
      console.error("[v0] Checkpoint save exception:", err);
      return false;
    }
  }

  /**
   * Get the latest checkpoint for this session
   */
  async getLatestCheckpoint(): Promise<CheckpointData | null> {
    try {
      const { data, error } = await this.supabase
        .from("agent_checkpoints")
        .select("*")
        .eq("session_id", this.sessionId)
        .order("step_index", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows found - this is OK
          return null;
        }
        console.error("[v0] Failed to get checkpoint:", error.message);
        return null;
      }

      return data as CheckpointData;
    } catch (err) {
      console.error("[v0] Checkpoint retrieval exception:", err);
      return null;
    }
  }

  /**
   * Recover session from latest checkpoint
   * Returns recovery info if successful, null if no checkpoint exists
   */
  async recoverFromCheckpoint(): Promise<CheckpointRecovery | null> {
    try {
      const checkpoint = await this.getLatestCheckpoint();
      if (!checkpoint) {
        return null;
      }

      // Verify context hasn't changed significantly
      const currentContextHash = this.generateContextHash(checkpoint.state_snapshot);
      if (currentContextHash !== checkpoint.context_hash) {
        console.warn("[v0] Context has changed since checkpoint. Using checkpoint anyway.");
      }

      const stepsRecovered = Math.max(0, checkpoint.step_index - 1);
      const nextAction = checkpoint.tool_in_progress
        ? `Resume ${checkpoint.tool_in_progress}`
        : `Continue from phase ${checkpoint.phase}`;

      const recovery: CheckpointRecovery = {
        checkpoint,
        steps_recovered: stepsRecovered,
        last_tool: checkpoint.tool_in_progress,
        next_action: nextAction,
      };

      return recovery;
    } catch (err) {
      console.error("[v0] Checkpoint recovery exception:", err);
      return null;
    }
  }

  /**
   * Restore a session from checkpoint data
   * Modifies the session object in place
   */
  restoreSessionFromCheckpoint(session: AgentSession, checkpoint: CheckpointData): void {
    // Restore critical state
    session.phase = checkpoint.phase;
    session.step_count = checkpoint.step_index;
    session.plan = checkpoint.state_snapshot.plan;
    session.context = checkpoint.state_snapshot.context;
    session.findings = checkpoint.state_snapshot.findings;
    session.tool_history = checkpoint.state_snapshot.tool_history;
    session.no_progress_count = checkpoint.state_snapshot.no_progress_count;
    
    console.log("[v0] Session restored from checkpoint at step", checkpoint.step_index);
  }

  /**
   * Check if we're approaching timeout (within 110s)
   * Used to decide when to save checkpoint
   */
  isApproachingTimeout(startTime: number): boolean {
    const elapsedMs = Date.now() - startTime;
    const timeoutBufferMs = 110 * 1000; // 110 seconds
    return elapsedMs > (120 * 1000 - timeoutBufferMs);
  }

  /**
   * Cleanup old checkpoints for this session (keep only last N)
   */
  async cleanupOldCheckpoints(keepCount: number = 5): Promise<number> {
    try {
      // Get checkpoints to delete
      const { data: checkpoints, error: fetchError } = await this.supabase
        .from("agent_checkpoints")
        .select("id")
        .eq("session_id", this.sessionId)
        .order("step_index", { ascending: false })
        .range(keepCount, 10000); // Get all after position keepCount

      if (fetchError) {
        console.error("[v0] Failed to fetch checkpoints for cleanup:", fetchError.message);
        return 0;
      }

      if (!checkpoints || checkpoints.length === 0) {
        return 0;
      }

      const idsToDelete = checkpoints.map((cp) => cp.id);
      const { error: deleteError } = await this.supabase
        .from("agent_checkpoints")
        .delete()
        .in("id", idsToDelete);

      if (deleteError) {
        console.error("[v0] Failed to delete old checkpoints:", deleteError.message);
        return 0;
      }

      console.log("[v0] Cleaned up", idsToDelete.length, "old checkpoints");
      return idsToDelete.length;
    } catch (err) {
      console.error("[v0] Checkpoint cleanup exception:", err);
      return 0;
    }
  }
}
