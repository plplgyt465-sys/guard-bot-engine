-- Create github_tools table to store imported tools from GitHub
CREATE TABLE IF NOT EXISTS github_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  repo_url TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL, -- 'javascript', 'python', 'bash', 'go'
  source_code TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE, -- For detecting changes
  metadata JSONB DEFAULT '{}', -- params, returns, dependencies
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_synced_at TIMESTAMP,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status TEXT DEFAULT 'pending', -- 'pending', 'verified', 'suspicious'
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(repo_owner, repo_name, file_path)
);

-- Create execution_logs table to track tool executions
CREATE TABLE IF NOT EXISTS execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID REFERENCES github_tools(id) ON DELETE CASCADE,
  input JSONB NOT NULL,
  output JSONB,
  error TEXT,
  execution_time_ms INTEGER,
  status TEXT NOT NULL, -- 'success', 'failed', 'timeout'
  executed_at TIMESTAMP DEFAULT NOW(),
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create tool_cache table for caching execution results
CREATE TABLE IF NOT EXISTS tool_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID REFERENCES github_tools(id) ON DELETE CASCADE,
  input_hash TEXT NOT NULL,
  output JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  UNIQUE(tool_id, input_hash)
);

-- Extend custom_tools table to support GitHub sources
ALTER TABLE IF EXISTS custom_tools ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual', -- 'manual', 'github'
ADD COLUMN IF NOT EXISTS github_tool_id UUID REFERENCES github_tools(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_github_source BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_github_sync TIMESTAMP;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_github_tools_repo ON github_tools(repo_owner, repo_name);
CREATE INDEX IF NOT EXISTS idx_github_tools_language ON github_tools(language);
CREATE INDEX IF NOT EXISTS idx_github_tools_verified ON github_tools(is_verified);
CREATE INDEX IF NOT EXISTS idx_execution_logs_tool ON execution_logs(tool_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_executed_at ON execution_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_cache_expires ON tool_cache(expires_at);

-- Enable RLS policies
ALTER TABLE github_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_cache ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own github tools"
  ON github_tools FOR SELECT
  USING (auth.uid() = created_by OR is_verified = TRUE);

CREATE POLICY "Users can create github tools"
  ON github_tools FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own github tools"
  ON github_tools FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can view their execution logs"
  ON execution_logs FOR SELECT
  USING (auth.uid() = executed_by);

CREATE POLICY "Users can create execution logs"
  ON execution_logs FOR INSERT
  WITH CHECK (auth.uid() = (SELECT auth.uid()));

CREATE POLICY "Users can view tool cache"
  ON tool_cache FOR SELECT
  USING (TRUE);

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_github_tools_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating timestamp
CREATE TRIGGER github_tools_updated_at
  BEFORE UPDATE ON github_tools
  FOR EACH ROW
  EXECUTE FUNCTION update_github_tools_timestamp();
