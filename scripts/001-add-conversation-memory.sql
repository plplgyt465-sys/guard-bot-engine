-- Migration: Add full conversation memory tables
-- Purpose: Store complete interaction history for autonomous agent with full context preservation

-- Conversation History Table
-- Stores every interaction: messages, tool calls, skill executions, decisions
CREATE TABLE IF NOT EXISTS conversation_history (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'user_message',
    'ai_response',
    'skill_selection',
    'skill_execution',
    'tool_call',
    'tool_result',
    'phase_transition',
    'decision'
  )),
  content JSONB NOT NULL,
  metadata JSONB,
  tokens_used INTEGER DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT fk_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_conversation_history_conversation ON conversation_history(conversation_id);
CREATE INDEX idx_conversation_history_type ON conversation_history(type);
CREATE INDEX idx_conversation_history_timestamp ON conversation_history(timestamp);
CREATE INDEX idx_conversation_history_session ON conversation_history(session_id);

-- Skills Execution Log
-- Tracks every skill execution with input, output, duration, success rate
CREATE TABLE IF NOT EXISTS skills_executions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  skill_category TEXT NOT NULL,
  input JSONB NOT NULL,
  output JSONB,
  success BOOLEAN NOT NULL,
  duration_ms INTEGER,
  error_message TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_skills_exec_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_skills_executions_conversation ON skills_executions(conversation_id);
CREATE INDEX idx_skills_executions_skill ON skills_executions(skill_id);
CREATE INDEX idx_skills_executions_success ON skills_executions(success);
CREATE INDEX idx_skills_executions_timestamp ON skills_executions(timestamp);

-- Phase Transitions Log
-- Tracks autonomous phase progression for debugging and analysis
CREATE TABLE IF NOT EXISTS phase_transitions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  from_phase TEXT NOT NULL,
  to_phase TEXT NOT NULL,
  reason TEXT,
  context JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_phases_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_phase_transitions_conversation ON phase_transitions(conversation_id);
CREATE INDEX idx_phase_transitions_timestamp ON phase_transitions(timestamp);

-- Skills Registry
-- Central registry of all 300+ skills with metadata
CREATE TABLE IF NOT EXISTS skills_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN (
    'sales',
    'marketing',
    'finance',
    'hr',
    'operations',
    'product',
    'tech',
    'c-suite',
    'general'
  )),
  description TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  trigger_keywords TEXT[] DEFAULT '{}',
  instructions TEXT NOT NULL,
  parameters JSONB DEFAULT '{}',
  complexity TEXT NOT NULL CHECK (complexity IN ('low', 'medium', 'high')),
  output_format TEXT,
  usage_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  success_rate NUMERIC DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_skills_category ON skills_registry(category);
CREATE INDEX idx_skills_complexity ON skills_registry(complexity);
CREATE INDEX idx_skills_success_rate ON skills_registry(success_rate DESC);

-- Conversation Memory Snapshots
-- Periodic snapshots of agent state for resumption and analysis
CREATE TABLE IF NOT EXISTS memory_snapshots (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  total_entries INTEGER,
  total_tokens INTEGER,
  last_phase TEXT,
  summary JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_snapshot_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_memory_snapshots_conversation ON memory_snapshots(conversation_id);
CREATE INDEX idx_memory_snapshots_timestamp ON memory_snapshots(timestamp);

-- Skill Performance Metrics
-- Analytics on skill performance across all conversations
CREATE TABLE IF NOT EXISTS skill_metrics (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  total_uses INTEGER DEFAULT 0,
  successful_uses INTEGER DEFAULT 0,
  failed_uses INTEGER DEFAULT 0,
  average_duration_ms NUMERIC DEFAULT 0,
  success_rate NUMERIC DEFAULT 0.0,
  last_used TIMESTAMP WITH TIME ZONE,
  most_used_category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_skill_metrics_name ON skill_metrics(skill_name);
CREATE INDEX idx_skill_metrics_success_rate ON skill_metrics(success_rate DESC);

-- Skill Selection History
-- Tracks which skills were selected for which requests (for ML training)
CREATE TABLE IF NOT EXISTS skill_selections (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_query TEXT NOT NULL,
  selected_skill_ids TEXT[] NOT NULL,
  selected_skill_names TEXT[] NOT NULL,
  confidence_scores NUMERIC[] NOT NULL,
  selection_reasoning TEXT,
  execution_successful BOOLEAN,
  user_feedback TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_selection_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_skill_selections_conversation ON skill_selections(conversation_id);
CREATE INDEX idx_skill_selections_successful ON skill_selections(execution_successful);

-- Enable Row Level Security on sensitive tables
ALTER TABLE conversation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_transitions ENABLE ROW LEVEL SECURITY;

-- Add columns to existing conversations table if they don't exist
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS current_phase TEXT DEFAULT 'planning';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS total_tokens_used INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS skills_used TEXT[] DEFAULT '{}';
