-- ============================================================================
-- Autonomous Loop Engine Tables
-- 
-- This migration adds tables required for:
-- - Execution Graph (DAG-based step tracking)
-- - Idempotency (hash-based execution caching)
-- - Replay Engine (deterministic resume)
-- - Unified Memory Index
-- - Checkpoints (state persistence)
-- - Failure Logging (pattern learning)
-- - Semantic Patterns (cross-session learning)
-- ============================================================================

-- ============================================================================
-- EXECUTION GRAPH (DAG)
-- Tracks step dependencies and execution state
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution_nodes (
  id TEXT PRIMARY KEY,
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  tool TEXT NOT NULL,
  args JSONB DEFAULT '{}',
  description TEXT,
  depends_on TEXT[] DEFAULT '{}',
  dependents TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'ready', 'running', 'done', 'failed', 'skipped')
  ),
  result JSONB,
  error TEXT,
  hash TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for execution_nodes
CREATE INDEX IF NOT EXISTS idx_execution_nodes_session ON execution_nodes(session_id);
CREATE INDEX IF NOT EXISTS idx_execution_nodes_hash ON execution_nodes(hash);
CREATE INDEX IF NOT EXISTS idx_execution_nodes_status ON execution_nodes(status);
CREATE INDEX IF NOT EXISTS idx_execution_nodes_step ON execution_nodes(session_id, step_index);

-- ============================================================================
-- EXECUTION CACHE (IDEMPOTENCY)
-- Hash-based caching of step results for exactly-once execution
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution_cache (
  hash TEXT PRIMARY KEY,
  step_id TEXT NOT NULL,
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  args JSONB,
  result JSONB,
  duration_ms INTEGER,
  success BOOLEAN DEFAULT true,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for execution_cache
CREATE INDEX IF NOT EXISTS idx_execution_cache_session ON execution_cache(session_id);
CREATE INDEX IF NOT EXISTS idx_execution_cache_tool ON execution_cache(tool);

-- ============================================================================
-- EXECUTION HISTORY (REPLAY)
-- Full action log with state snapshots for deterministic resume
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution_history (
  id TEXT PRIMARY KEY,
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- Action details
  tool TEXT NOT NULL,
  args JSONB,
  result JSONB,
  success BOOLEAN DEFAULT true,
  error TEXT,
  duration_ms INTEGER,
  
  -- Graph position
  node_id TEXT,
  graph_version INTEGER,
  
  -- State snapshots for validation
  pre_state JSONB,
  post_state JSONB
);

-- Indexes for execution_history
CREATE INDEX IF NOT EXISTS idx_execution_history_session ON execution_history(session_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_sequence ON execution_history(session_id, sequence_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_history_unique_seq ON execution_history(session_id, sequence_number);

-- ============================================================================
-- MEMORY INDEX
-- Unified index across all memory layers
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_index (
  id TEXT PRIMARY KEY,
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  
  -- Indexing keys
  step_id TEXT,
  tool_hash TEXT,
  goal TEXT,
  target TEXT,
  
  -- Content
  type TEXT NOT NULL CHECK (
    type IN ('action', 'result', 'observation', 'decision', 'pattern', 'error', 'discovery')
  ),
  content JSONB,
  
  -- Metadata
  layer TEXT NOT NULL CHECK (layer IN ('short', 'long', 'semantic')),
  importance REAL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  tags TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for memory_index
CREATE INDEX IF NOT EXISTS idx_memory_index_session ON memory_index(session_id);
CREATE INDEX IF NOT EXISTS idx_memory_index_step ON memory_index(step_id);
CREATE INDEX IF NOT EXISTS idx_memory_index_tool_hash ON memory_index(tool_hash);
CREATE INDEX IF NOT EXISTS idx_memory_index_goal ON memory_index(goal);
CREATE INDEX IF NOT EXISTS idx_memory_index_target ON memory_index(target);
CREATE INDEX IF NOT EXISTS idx_memory_index_type ON memory_index(type);
CREATE INDEX IF NOT EXISTS idx_memory_index_layer ON memory_index(layer);
CREATE INDEX IF NOT EXISTS idx_memory_index_importance ON memory_index(importance DESC);

-- ============================================================================
-- AGENT CHECKPOINTS
-- Full state snapshots for recovery
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_checkpoints (
  id TEXT PRIMARY KEY,
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full state
  session_state JSONB,
  graph_state TEXT,          -- Serialized graph (can be large)
  memory_snapshot TEXT,      -- Serialized memory (can be large)
  
  -- Replay support
  last_sequence INTEGER,
  expected_state_hash TEXT,
  
  -- Metadata
  step_index INTEGER,
  phase TEXT,
  reason TEXT CHECK (reason IN ('periodic', 'pre_risk', 'error', 'manual', 'complete'))
);

-- Indexes for agent_checkpoints
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_session ON agent_checkpoints(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_checkpoints_version ON agent_checkpoints(session_id, version);
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_timestamp ON agent_checkpoints(timestamp DESC);

-- ============================================================================
-- FAILURE LOGS
-- Detailed failure logging for pattern analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS failure_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  node_id TEXT,
  
  -- Failure details
  failure_type TEXT NOT NULL CHECK (
    failure_type IN (
      'waf_blocked', 'rate_limited', 'timeout', 'auth_required',
      'not_found', 'connection_error', 'permission_denied',
      'payload_rejected', 'detection', 'unknown'
    )
  ),
  tool TEXT,
  args JSONB,
  error_message TEXT,
  status_code INTEGER,
  response_snippet TEXT,
  
  -- Mitigation
  mitigation_strategy TEXT,
  mitigation_applied BOOLEAN DEFAULT false,
  mitigation_success BOOLEAN,
  
  -- Pattern reference
  pattern_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for failure_logs
CREATE INDEX IF NOT EXISTS idx_failure_logs_session ON failure_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_failure_logs_type ON failure_logs(failure_type);
CREATE INDEX IF NOT EXISTS idx_failure_logs_tool ON failure_logs(tool);
CREATE INDEX IF NOT EXISTS idx_failure_logs_pattern ON failure_logs(pattern_id);
CREATE INDEX IF NOT EXISTS idx_failure_logs_created ON failure_logs(created_at DESC);

-- ============================================================================
-- SEMANTIC PATTERNS
-- Cross-session learned patterns (failures, successes, strategies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS semantic_patterns (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('failure', 'success', 'strategy')),
  
  -- Pattern data
  pattern JSONB NOT NULL,
  
  -- Effectiveness tracking
  effectiveness REAL DEFAULT 0.5 CHECK (effectiveness >= 0 AND effectiveness <= 1),
  usage_count INTEGER DEFAULT 0,
  
  -- Timestamps
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for semantic_patterns
CREATE INDEX IF NOT EXISTS idx_semantic_patterns_category ON semantic_patterns(category);
CREATE INDEX IF NOT EXISTS idx_semantic_patterns_effectiveness ON semantic_patterns(effectiveness DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_patterns_usage ON semantic_patterns(usage_count DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE execution_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_patterns ENABLE ROW LEVEL SECURITY;

-- Allow all operations (adjust for production)
CREATE POLICY "Allow all for execution_nodes" ON execution_nodes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for execution_cache" ON execution_cache FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for execution_history" ON execution_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for memory_index" ON memory_index FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for agent_checkpoints" ON agent_checkpoints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for failure_logs" ON failure_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for semantic_patterns" ON semantic_patterns FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to clean up old checkpoints (keep only N most recent per session)
CREATE OR REPLACE FUNCTION cleanup_old_checkpoints(session_uuid UUID, keep_count INTEGER DEFAULT 10)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY version DESC) as rn
    FROM agent_checkpoints
    WHERE session_id = session_uuid
  )
  DELETE FROM agent_checkpoints
  WHERE id IN (SELECT id FROM ranked WHERE rn > keep_count);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get session execution statistics
CREATE OR REPLACE FUNCTION get_session_stats(session_uuid UUID)
RETURNS TABLE (
  total_nodes BIGINT,
  completed_nodes BIGINT,
  failed_nodes BIGINT,
  cached_executions BIGINT,
  total_actions BIGINT,
  checkpoint_count BIGINT,
  failure_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM execution_nodes WHERE session_id = session_uuid),
    (SELECT COUNT(*) FROM execution_nodes WHERE session_id = session_uuid AND status IN ('done', 'skipped')),
    (SELECT COUNT(*) FROM execution_nodes WHERE session_id = session_uuid AND status = 'failed'),
    (SELECT COUNT(*) FROM execution_cache WHERE session_id = session_uuid),
    (SELECT COUNT(*) FROM execution_history WHERE session_id = session_uuid),
    (SELECT COUNT(*) FROM agent_checkpoints WHERE session_id = session_uuid),
    (SELECT COUNT(*) FROM failure_logs WHERE session_id = session_uuid);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE execution_nodes IS 'DAG-based execution tracking with dependencies';
COMMENT ON TABLE execution_cache IS 'Hash-based idempotency cache for exactly-once execution';
COMMENT ON TABLE execution_history IS 'Full action history with state snapshots for replay';
COMMENT ON TABLE memory_index IS 'Unified index across short-term, long-term, and semantic memory';
COMMENT ON TABLE agent_checkpoints IS 'Full state checkpoints for crash recovery and resume';
COMMENT ON TABLE failure_logs IS 'Detailed failure logging for pattern learning';
COMMENT ON TABLE semantic_patterns IS 'Cross-session learned patterns for adaptive behavior';
