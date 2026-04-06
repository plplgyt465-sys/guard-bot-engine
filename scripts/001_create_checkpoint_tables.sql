-- Agent Checkpoints: Granular state snapshots for resumption after timeout
-- Enables the agent to save state before 120s timeout and resume exactly where it left off
CREATE TABLE IF NOT EXISTS agent_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('INTENT', 'PLANNING', 'EXECUTION', 'ANALYSIS', 'DECISION', 'DONE', 'ERROR')),
  state_snapshot JSONB NOT NULL,          -- Full serialized session state
  tool_in_progress TEXT,                   -- Tool that was running when checkpoint was saved
  tool_input JSONB,                        -- Input to the tool in progress
  context_hash TEXT,                       -- Hash for detecting context changes
  is_timeout_checkpoint BOOLEAN DEFAULT false, -- True if saved due to approaching timeout
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Intent Context: Tracks conversation context for intent resolution
-- Enables understanding of "واصل" (continue) and similar commands
CREATE TABLE IF NOT EXISTS agent_intent_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_session_id UUID NOT NULL,
  last_action TEXT,                        -- Last action performed (scan, exploit, etc.)
  last_target TEXT,                        -- Last target being worked on
  last_phase TEXT,                         -- Phase when last action was taken
  last_findings JSONB DEFAULT '[]',        -- Recent findings for context
  pending_steps JSONB DEFAULT '[]',        -- Steps that were pending when paused
  continuation_hint TEXT,                  -- What "واصل" should do (Arabic hint)
  continuation_hint_en TEXT,               -- English continuation hint
  active_session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON agent_checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_session_step ON agent_checkpoints(session_id, step_index DESC);
CREATE INDEX IF NOT EXISTS idx_checkpoints_timeout ON agent_checkpoints(session_id, is_timeout_checkpoint) WHERE is_timeout_checkpoint = true;
CREATE INDEX IF NOT EXISTS idx_intent_context_chat ON agent_intent_context(chat_session_id);
CREATE INDEX IF NOT EXISTS idx_intent_context_active_session ON agent_intent_context(active_session_id);

-- Function to auto-update intent context timestamp
CREATE OR REPLACE FUNCTION update_intent_context_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS trigger_intent_context_updated ON agent_intent_context;
CREATE TRIGGER trigger_intent_context_updated
  BEFORE UPDATE ON agent_intent_context
  FOR EACH ROW
  EXECUTE FUNCTION update_intent_context_timestamp();

-- RLS Policies
ALTER TABLE agent_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_intent_context ENABLE ROW LEVEL SECURITY;

-- Allow all operations (adjust based on security requirements)
CREATE POLICY "Allow all for agent_checkpoints" ON agent_checkpoints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for agent_intent_context" ON agent_intent_context FOR ALL USING (true) WITH CHECK (true);

-- Function to cleanup old checkpoints (keep last N per session)
CREATE OR REPLACE FUNCTION cleanup_old_checkpoints(p_session_id UUID, p_keep_count INTEGER DEFAULT 5)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH checkpoints_to_delete AS (
    SELECT id FROM agent_checkpoints
    WHERE session_id = p_session_id
    ORDER BY step_index DESC
    OFFSET p_keep_count
  )
  DELETE FROM agent_checkpoints
  WHERE id IN (SELECT id FROM checkpoints_to_delete);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get latest checkpoint for a session
CREATE OR REPLACE FUNCTION get_latest_checkpoint(p_session_id UUID)
RETURNS TABLE (
  id UUID,
  step_index INTEGER,
  phase TEXT,
  state_snapshot JSONB,
  tool_in_progress TEXT,
  is_timeout_checkpoint BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.step_index,
    c.phase,
    c.state_snapshot,
    c.tool_in_progress,
    c.is_timeout_checkpoint,
    c.created_at
  FROM agent_checkpoints c
  WHERE c.session_id = p_session_id
  ORDER BY c.step_index DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
