-- Agent Sessions: tracks autonomous workflow state
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'INTENT' CHECK (phase IN ('INTENT', 'PLANNING', 'EXECUTION', 'ANALYSIS', 'DECISION', 'DONE', 'ERROR')),
  plan JSONB DEFAULT '{"steps": [], "current_step": 0}',
  context JSONB DEFAULT '{}',
  findings JSONB DEFAULT '[]',
  tool_history JSONB DEFAULT '[]',
  step_count INTEGER DEFAULT 0,
  max_steps INTEGER DEFAULT 30,
  no_progress_count INTEGER DEFAULT 0,
  security_score INTEGER,
  started_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Agent Memory: short-term and long-term memory storage
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('short_term', 'long_term')),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Decisions: audit trail for all decisions made
CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('continue', 'change_plan', 'stop', 'run_tool', 'escalate', 'skip')),
  reason TEXT,
  tool_name TEXT,
  input JSONB,
  output JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_sessions_chat_session ON agent_sessions(chat_session_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_target ON agent_sessions(target);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_phase ON agent_sessions(phase);
CREATE INDEX IF NOT EXISTS idx_agent_memory_session ON agent_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_type ON agent_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_session ON agent_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_phase ON agent_decisions(phase);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_agent_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS trigger_agent_session_updated ON agent_sessions;
CREATE TRIGGER trigger_agent_session_updated
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_session_timestamp();

-- RLS Policies (enable row level security)
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (adjust as needed)
CREATE POLICY "Allow all for agent_sessions" ON agent_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for agent_memory" ON agent_memory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for agent_decisions" ON agent_decisions FOR ALL USING (true) WITH CHECK (true);
