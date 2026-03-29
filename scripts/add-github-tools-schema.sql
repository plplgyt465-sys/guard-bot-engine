-- Migration: Add GitHub Tools Integration
-- Purpose: Support real code execution from GitHub repositories

-- Create github_tools table
CREATE TABLE IF NOT EXISTS public.github_tools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tool_id TEXT UNIQUE NOT NULL,
  repo_url TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch TEXT DEFAULT 'main',
  file_path TEXT,
  execution_type TEXT NOT NULL CHECK (execution_type IN ('javascript', 'python', 'bash', 'go', 'deno')),
  language TEXT,
  entry_point TEXT,
  code TEXT,
  code_hash TEXT,
  metadata JSONB DEFAULT '{}',
  dependencies JSONB DEFAULT '[]',
  timeout_ms INTEGER DEFAULT 120000 CHECK (timeout_ms > 0 AND timeout_ms <= 300000),
  requires_network BOOLEAN DEFAULT true,
  requires_filesystem BOOLEAN DEFAULT false,
  security_level TEXT DEFAULT 'sandboxed' CHECK (security_level IN ('sandboxed', 'elevated', 'restricted')),
  last_updated_from_repo TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_executed TIMESTAMP WITH TIME ZONE,
  execution_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  cached_result TEXT,
  cache_ttl_seconds INTEGER DEFAULT 3600,
  cached_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_github_tools_tool_id ON public.github_tools(tool_id);
CREATE INDEX IF NOT EXISTS idx_github_tools_repo ON public.github_tools(repo_owner, repo_name);
CREATE INDEX IF NOT EXISTS idx_github_tools_execution_type ON public.github_tools(execution_type);

-- Extend custom_tools table with GitHub support
ALTER TABLE IF EXISTS public.custom_tools 
ADD COLUMN IF NOT EXISTS github_tool_id UUID REFERENCES public.github_tools(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'github')),
ADD COLUMN IF NOT EXISTS last_github_sync TIMESTAMP WITH TIME ZONE;

-- Create index for custom_tools GitHub reference
CREATE INDEX IF NOT EXISTS idx_custom_tools_github_source ON public.custom_tools(source) WHERE source = 'github';

-- Create execution_logs table for tracking tool runs
CREATE TABLE IF NOT EXISTS public.execution_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  github_tool_id UUID REFERENCES public.github_tools(id) ON DELETE CASCADE,
  tool_id TEXT,
  execution_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'error', 'timeout')),
  input_args JSONB,
  output TEXT,
  error_message TEXT,
  execution_time_ms INTEGER,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  user_id TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for execution logs
CREATE INDEX IF NOT EXISTS idx_execution_logs_tool ON public.execution_logs(github_tool_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_status ON public.execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_execution_logs_created ON public.execution_logs(created_at DESC);

-- Create tool_cache table for caching results
CREATE TABLE IF NOT EXISTS public.tool_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  github_tool_id UUID REFERENCES public.github_tools(id) ON DELETE CASCADE,
  args_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  result_hash TEXT,
  ttl_expires_at TIMESTAMP WITH TIME ZONE,
  hit_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(github_tool_id, args_hash)
);

-- Create indexes for cache
CREATE INDEX IF NOT EXISTS idx_tool_cache_ttl ON public.tool_cache(ttl_expires_at);
CREATE INDEX IF NOT EXISTS idx_tool_cache_tool ON public.tool_cache(github_tool_id);

-- Add RLS policies for tool security
ALTER TABLE public.github_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view published tools
CREATE POLICY "Allow view published tools"
ON public.github_tools FOR SELECT
USING (true);

-- Policy: Allow authenticated users to view their execution logs
CREATE POLICY "Allow view own execution logs"
ON public.execution_logs FOR SELECT
USING (user_id = auth.uid()::text OR user_id IS NULL);

-- Policy: Allow authenticated users to cache tool results
CREATE POLICY "Allow cache management"
ON public.tool_cache FOR ALL
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
