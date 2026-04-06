/**
 * Agent Core Module
 * 
 * Implements the autonomous agent loop architecture:
 * - PhaseController: State machine for managing phases
 * - DecisionEngine: Rules-based + LLM fallback decision making
 * - LoopProtection: Prevents infinite loops and stuck states
 * - Memory: Short-term and long-term memory management
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// TYPES
// ============================================================================

export type AgentPhase = 'INTENT' | 'PLANNING' | 'EXECUTION' | 'ANALYSIS' | 'DECISION' | 'DONE' | 'ERROR';

export type DecisionType = 'continue' | 'change_plan' | 'stop' | 'run_tool' | 'escalate' | 'skip';

export interface PlanStep {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
}

export interface AgentPlan {
  steps: PlanStep[];
  current_step: number;
  objective: string;
}

export interface AgentContext {
  target: string;
  intent: string;
  discovered_info: Record<string, unknown>;
  vulnerabilities: Array<{
    id: string;
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    description: string;
    evidence?: string;
  }>;
  open_ports: number[];
  services: Array<{ port: number; service: string; version?: string }>;
  technologies: string[];
}

export interface ToolExecution {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  timestamp: string;
  duration_ms: number;
  success: boolean;
  error?: string;
}

export interface AgentSession {
  id: string;
  chat_session_id: string;
  target: string;
  phase: AgentPhase;
  plan: AgentPlan;
  context: AgentContext;
  findings: unknown[];
  tool_history: ToolExecution[];
  step_count: number;
  max_steps: number;
  no_progress_count: number;
  security_score: number | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Decision {
  type: DecisionType;
  reason: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  new_plan?: AgentPlan;
}

export interface MemoryEntry {
  id: string;
  session_id: string;
  memory_type: 'short_term' | 'long_term';
  key: string;
  value: unknown;
  created_at: string;
}

// ============================================================================
// PHASE CONTROLLER
// ============================================================================

const PHASE_TRANSITIONS: Record<AgentPhase, AgentPhase[]> = {
  'INTENT': ['PLANNING', 'ERROR'],
  'PLANNING': ['EXECUTION', 'ERROR'],
  'EXECUTION': ['ANALYSIS', 'ERROR'],
  'ANALYSIS': ['DECISION', 'ERROR'],
  'DECISION': ['EXECUTION', 'PLANNING', 'DONE', 'ERROR'],
  'DONE': [],
  'ERROR': ['INTENT'] // Can retry from start
};

export class PhaseController {
  private session: AgentSession;
  private supabase: SupabaseClient;

  constructor(session: AgentSession, supabase: SupabaseClient) {
    this.session = session;
    this.supabase = supabase;
  }

  getCurrentPhase(): AgentPhase {
    return this.session.phase;
  }

  canTransitionTo(newPhase: AgentPhase): boolean {
    const allowedTransitions = PHASE_TRANSITIONS[this.session.phase];
    return allowedTransitions.includes(newPhase);
  }

  async transitionTo(newPhase: AgentPhase, reason?: string): Promise<boolean> {
    if (!this.canTransitionTo(newPhase)) {
      console.error(`Invalid phase transition: ${this.session.phase} -> ${newPhase}`);
      return false;
    }

    const oldPhase = this.session.phase;
    this.session.phase = newPhase;

    // Persist to database
    const { error } = await this.supabase
      .from('agent_sessions')
      .update({ phase: newPhase })
      .eq('id', this.session.id);

    if (error) {
      console.error('Failed to update phase:', error);
      this.session.phase = oldPhase; // Rollback
      return false;
    }

    // Log the transition decision
    await this.supabase.from('agent_decisions').insert({
      session_id: this.session.id,
      phase: newPhase,
      decision_type: 'continue',
      reason: reason || `Transitioned from ${oldPhase} to ${newPhase}`
    });

    console.log(`Phase transition: ${oldPhase} -> ${newPhase}`);
    return true;
  }

  isTerminal(): boolean {
    return this.session.phase === 'DONE' || this.session.phase === 'ERROR';
  }

  getSession(): AgentSession {
    return this.session;
  }

  async updateSession(updates: Partial<AgentSession>): Promise<void> {
    Object.assign(this.session, updates);
    
    const { error } = await this.supabase
      .from('agent_sessions')
      .update(updates)
      .eq('id', this.session.id);

    if (error) {
      console.error('Failed to update session:', error);
    }
  }
}

// ============================================================================
// LOOP PROTECTION
// ============================================================================

export interface LoopProtectionConfig {
  maxSteps: number;
  maxDuplicateTools: number;
  maxNoProgressRounds: number;
}

const DEFAULT_LOOP_CONFIG: LoopProtectionConfig = {
  maxSteps: 30,
  maxDuplicateTools: 3,
  maxNoProgressRounds: 3
};

export class LoopProtection {
  private config: LoopProtectionConfig;
  private session: AgentSession;

  constructor(session: AgentSession, config?: Partial<LoopProtectionConfig>) {
    this.session = session;
    this.config = { ...DEFAULT_LOOP_CONFIG, ...config };
  }

  /**
   * Check if the agent has exceeded maximum steps
   */
  isMaxStepsReached(): boolean {
    return this.session.step_count >= this.config.maxSteps;
  }

  /**
   * Check if the same tool has been called too many times consecutively
   */
  isDuplicateToolDetected(toolName: string): boolean {
    const recentTools = this.session.tool_history.slice(-this.config.maxDuplicateTools);
    
    if (recentTools.length < this.config.maxDuplicateTools) {
      return false;
    }

    return recentTools.every(t => t.tool === toolName);
  }

  /**
   * Check if agent is making no progress (same findings count for N rounds)
   */
  isNoProgressDetected(): boolean {
    return this.session.no_progress_count >= this.config.maxNoProgressRounds;
  }

  /**
   * Increment step count
   */
  incrementStep(): number {
    this.session.step_count++;
    return this.session.step_count;
  }

  /**
   * Update no-progress counter based on findings change
   */
  updateProgressCounter(newFindingsCount: number, previousFindingsCount: number): void {
    if (newFindingsCount <= previousFindingsCount) {
      this.session.no_progress_count++;
    } else {
      this.session.no_progress_count = 0; // Reset if progress made
    }
  }

  /**
   * Get a stop reason if any protection is triggered
   */
  getStopReason(): string | null {
    if (this.isMaxStepsReached()) {
      return `Maximum steps reached (${this.config.maxSteps}). Stopping to prevent infinite loop.`;
    }
    if (this.isNoProgressDetected()) {
      return `No progress detected for ${this.config.maxNoProgressRounds} consecutive rounds. Stopping.`;
    }
    return null;
  }

  /**
   * Check if a tool should be skipped due to duplicate detection
   */
  shouldSkipTool(toolName: string): { skip: boolean; reason?: string } {
    if (this.isDuplicateToolDetected(toolName)) {
      return {
        skip: true,
        reason: `Tool "${toolName}" called ${this.config.maxDuplicateTools}+ times consecutively. Skipping to prevent loop.`
      };
    }
    return { skip: false };
  }
}

// ============================================================================
// MEMORY SYSTEM
// ============================================================================

export class AgentMemory {
  private session: AgentSession;
  private supabase: SupabaseClient;
  private shortTermCache: Map<string, unknown> = new Map();

  constructor(session: AgentSession, supabase: SupabaseClient) {
    this.session = session;
    this.supabase = supabase;
  }

  /**
   * Store in short-term memory (session-scoped, fast access)
   */
  async setShortTerm(key: string, value: unknown): Promise<void> {
    this.shortTermCache.set(key, value);
    
    await this.supabase.from('agent_memory').upsert({
      session_id: this.session.id,
      memory_type: 'short_term',
      key,
      value
    }, {
      onConflict: 'session_id,key'
    });
  }

  /**
   * Get from short-term memory
   */
  getShortTerm(key: string): unknown {
    return this.shortTermCache.get(key);
  }

  /**
   * Store in long-term memory (persists across sessions for same target)
   */
  async setLongTerm(key: string, value: unknown): Promise<void> {
    await this.supabase.from('agent_memory').insert({
      session_id: this.session.id,
      memory_type: 'long_term',
      key,
      value
    });
  }

  /**
   * Get from long-term memory (searches all sessions for same target)
   */
  async getLongTerm(key: string): Promise<unknown[]> {
    const { data } = await this.supabase
      .from('agent_memory')
      .select('value')
      .eq('memory_type', 'long_term')
      .eq('key', key)
      .order('created_at', { ascending: false })
      .limit(10);

    return data?.map(d => d.value) || [];
  }

  /**
   * Load all short-term memory for this session into cache
   */
  async loadShortTermCache(): Promise<void> {
    const { data } = await this.supabase
      .from('agent_memory')
      .select('key, value')
      .eq('session_id', this.session.id)
      .eq('memory_type', 'short_term');

    if (data) {
      for (const entry of data) {
        this.shortTermCache.set(entry.key, entry.value);
      }
    }
  }

  /**
   * Store tool execution result for later analysis
   */
  async storeToolResult(tool: string, args: Record<string, unknown>, result: unknown): Promise<void> {
    const key = `tool_result:${tool}:${Date.now()}`;
    await this.setShortTerm(key, { tool, args, result, timestamp: new Date().toISOString() });
  }

  /**
   * Get recent tool results for analysis
   */
  getRecentToolResults(limit = 5): Array<{ tool: string; args: Record<string, unknown>; result: unknown }> {
    const results: Array<{ tool: string; args: Record<string, unknown>; result: unknown }> = [];
    
    for (const [key, value] of this.shortTermCache.entries()) {
      if (key.startsWith('tool_result:')) {
        results.push(value as { tool: string; args: Record<string, unknown>; result: unknown });
      }
    }
    
    return results.slice(-limit);
  }

  /**
   * Store a discovered vulnerability
   */
  async storeVulnerability(vuln: AgentContext['vulnerabilities'][0]): Promise<void> {
    await this.setLongTerm(`vulnerability:${vuln.type}:${vuln.severity}`, vuln);
  }

  /**
   * Get historical vulnerabilities for this target
   */
  async getHistoricalVulnerabilities(): Promise<unknown[]> {
    const { data } = await this.supabase
      .from('agent_memory')
      .select('value')
      .eq('memory_type', 'long_term')
      .like('key', 'vulnerability:%')
      .limit(50);

    return data?.map(d => d.value) || [];
  }
}

// ============================================================================
// DECISION ENGINE
// ============================================================================

export interface DecisionContext {
  phase: AgentPhase;
  session: AgentSession;
  lastToolResult?: unknown;
  availableTools: string[];
}

type DecisionRule = (ctx: DecisionContext) => Decision | null;

export class DecisionEngine {
  private rules: DecisionRule[] = [];
  private supabase: SupabaseClient;
  private loopProtection: LoopProtection;

  constructor(supabase: SupabaseClient, loopProtection: LoopProtection) {
    this.supabase = supabase;
    this.loopProtection = loopProtection;
    this.initializeRules();
  }

  private initializeRules(): void {
    // Rule 1: Stop if max steps reached
    this.rules.push((ctx) => {
      const stopReason = this.loopProtection.getStopReason();
      if (stopReason) {
        return { type: 'stop', reason: stopReason };
      }
      return null;
    });

    // Rule 2: If no ports found after port scan, try different approach
    this.rules.push((ctx) => {
      if (ctx.phase === 'ANALYSIS') {
        const portScanResults = ctx.session.tool_history.filter(t => t.tool === 'port_scan');
        if (portScanResults.length > 0) {
          const lastScan = portScanResults[portScanResults.length - 1];
          const ports = (lastScan.result as { ports?: number[] })?.ports || [];
          if (ports.length === 0 && ctx.session.context.open_ports.length === 0) {
            return {
              type: 'run_tool',
              reason: 'No open ports found, trying HTTP probe on common web ports',
              tool_name: 'http_probe',
              tool_args: { target: ctx.session.target, ports: [80, 443, 8080, 8443] }
            };
          }
        }
      }
      return null;
    });

    // Rule 3: After finding open ports, enumerate services
    this.rules.push((ctx) => {
      if (ctx.phase === 'DECISION') {
        const { open_ports, services } = ctx.session.context;
        if (open_ports.length > 0 && services.length === 0) {
          return {
            type: 'run_tool',
            reason: 'Open ports found, enumerating services',
            tool_name: 'service_detection',
            tool_args: { target: ctx.session.target, ports: open_ports }
          };
        }
      }
      return null;
    });

    // Rule 4: If web service found, run web-specific tools
    this.rules.push((ctx) => {
      if (ctx.phase === 'DECISION') {
        const { services, technologies } = ctx.session.context;
        const hasWebService = services.some(s => 
          ['http', 'https', 'nginx', 'apache', 'iis'].includes(s.service.toLowerCase())
        );
        
        if (hasWebService && technologies.length === 0) {
          return {
            type: 'run_tool',
            reason: 'Web service detected, running technology detection',
            tool_name: 'tech_detect',
            tool_args: { target: ctx.session.target }
          };
        }
      }
      return null;
    });

    // Rule 5: If critical vulnerability found, stop and report
    this.rules.push((ctx) => {
      const criticalVulns = ctx.session.context.vulnerabilities.filter(v => v.severity === 'critical');
      if (criticalVulns.length > 0) {
        return {
          type: 'stop',
          reason: `Critical vulnerability found: ${criticalVulns[0].type}. Stopping for immediate attention.`
        };
      }
      return null;
    });

    // Rule 6: Complete if all plan steps are done
    this.rules.push((ctx) => {
      if (ctx.phase === 'DECISION') {
        const { plan } = ctx.session;
        const completedSteps = plan.steps.filter(s => s.status === 'completed' || s.status === 'skipped');
        if (completedSteps.length === plan.steps.length && plan.steps.length > 0) {
          return {
            type: 'stop',
            reason: 'All planned steps completed successfully'
          };
        }
      }
      return null;
    });
  }

  /**
   * Make a decision based on current context
   * First tries rules, then falls back to LLM if no rule matches
   */
  async decide(ctx: DecisionContext): Promise<Decision> {
    // Try rules first
    for (const rule of this.rules) {
      const decision = rule(ctx);
      if (decision) {
        await this.logDecision(ctx.session.id, ctx.phase, decision);
        return decision;
      }
    }

    // Default: continue with next plan step
    const { plan } = ctx.session;
    if (plan.current_step < plan.steps.length) {
      const nextStep = plan.steps[plan.current_step];
      
      // Check duplicate protection
      const skipCheck = this.loopProtection.shouldSkipTool(nextStep.tool);
      if (skipCheck.skip) {
        return {
          type: 'skip',
          reason: skipCheck.reason!
        };
      }

      return {
        type: 'run_tool',
        reason: `Executing plan step ${plan.current_step + 1}: ${nextStep.description}`,
        tool_name: nextStep.tool,
        tool_args: nextStep.args
      };
    }

    // No more steps, done
    return {
      type: 'stop',
      reason: 'No more actions to take'
    };
  }

  private async logDecision(sessionId: string, phase: AgentPhase, decision: Decision): Promise<void> {
    await this.supabase.from('agent_decisions').insert({
      session_id: sessionId,
      phase,
      decision_type: decision.type,
      reason: decision.reason,
      tool_name: decision.tool_name,
      input: decision.tool_args,
      output: null
    });
  }

  /**
   * Add a custom rule
   */
  addRule(rule: DecisionRule): void {
    this.rules.push(rule);
  }
}

// ============================================================================
// AGENT SESSION MANAGER
// ============================================================================

export class AgentSessionManager {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Create a new agent session
   */
  async createSession(chatSessionId: string, target: string, intent: string): Promise<AgentSession> {
    const initialContext: AgentContext = {
      target,
      intent,
      discovered_info: {},
      vulnerabilities: [],
      open_ports: [],
      services: [],
      technologies: []
    };

    const initialPlan: AgentPlan = {
      steps: [],
      current_step: 0,
      objective: intent
    };

    const { data, error } = await this.supabase
      .from('agent_sessions')
      .insert({
        chat_session_id: chatSessionId,
        target,
        phase: 'INTENT',
        plan: initialPlan,
        context: initialContext,
        findings: [],
        tool_history: [],
        step_count: 0,
        max_steps: 30,
        no_progress_count: 0
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create agent session: ${error.message}`);
    }

    return data as AgentSession;
  }

  /**
   * Get existing session by ID
   */
  async getSession(sessionId: string): Promise<AgentSession | null> {
    const { data, error } = await this.supabase
      .from('agent_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.error('Failed to get session:', error);
      return null;
    }

    return data as AgentSession;
  }

  /**
   * Get active session for a chat
   */
  async getActiveSessionForChat(chatSessionId: string): Promise<AgentSession | null> {
    const { data, error } = await this.supabase
      .from('agent_sessions')
      .select('*')
      .eq('chat_session_id', chatSessionId)
      .is('completed_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return null;
    }

    return data as AgentSession;
  }

  /**
   * Mark session as complete
   */
  async completeSession(sessionId: string, securityScore?: number): Promise<void> {
    await this.supabase
      .from('agent_sessions')
      .update({
        phase: 'DONE',
        completed_at: new Date().toISOString(),
        security_score: securityScore
      })
      .eq('id', sessionId);
  }

  /**
   * Mark session as error
   */
  async errorSession(sessionId: string, error: string): Promise<void> {
    await this.supabase
      .from('agent_sessions')
      .update({
        phase: 'ERROR',
        completed_at: new Date().toISOString(),
        context: { error }
      })
      .eq('id', sessionId);
  }
}

// ============================================================================
// PLAN GENERATOR
// ============================================================================

export function generateDefaultPlan(target: string, intent: string): AgentPlan {
  const steps: PlanStep[] = [];
  const lowerIntent = intent.toLowerCase();

  // Always start with reconnaissance
  steps.push({
    id: crypto.randomUUID(),
    tool: 'port_scan',
    args: { target, ports: '1-1000' },
    description: 'Scan top 1000 ports to identify open services',
    status: 'pending'
  });

  // HTTP probe for web targets
  if (lowerIntent.includes('web') || lowerIntent.includes('http') || lowerIntent.includes('website')) {
    steps.push({
      id: crypto.randomUUID(),
      tool: 'http_probe',
      args: { target },
      description: 'Probe HTTP/HTTPS services',
      status: 'pending'
    });

    steps.push({
      id: crypto.randomUUID(),
      tool: 'tech_detect',
      args: { target },
      description: 'Detect web technologies and frameworks',
      status: 'pending'
    });

    steps.push({
      id: crypto.randomUUID(),
      tool: 'dir_enum',
      args: { target, wordlist: 'common' },
      description: 'Enumerate directories and files',
      status: 'pending'
    });
  }

  // DNS enumeration
  if (lowerIntent.includes('dns') || lowerIntent.includes('subdomain') || lowerIntent.includes('full')) {
    steps.push({
      id: crypto.randomUUID(),
      tool: 'dns_enum',
      args: { target },
      description: 'Enumerate DNS records and subdomains',
      status: 'pending'
    });
  }

  // SSL/TLS analysis
  if (lowerIntent.includes('ssl') || lowerIntent.includes('tls') || lowerIntent.includes('certificate') || lowerIntent.includes('full')) {
    steps.push({
      id: crypto.randomUUID(),
      tool: 'ssl_check',
      args: { target },
      description: 'Analyze SSL/TLS configuration',
      status: 'pending'
    });
  }

  // Vulnerability scanning
  if (lowerIntent.includes('vuln') || lowerIntent.includes('security') || lowerIntent.includes('pentest') || lowerIntent.includes('full')) {
    steps.push({
      id: crypto.randomUUID(),
      tool: 'cve_lookup',
      args: { target },
      description: 'Check for known CVEs',
      status: 'pending'
    });
  }

  // Header security check
  if (lowerIntent.includes('header') || lowerIntent.includes('security') || lowerIntent.includes('web') || lowerIntent.includes('full')) {
    steps.push({
      id: crypto.randomUUID(),
      tool: 'header_check',
      args: { target },
      description: 'Check HTTP security headers',
      status: 'pending'
    });
  }

  return {
    steps,
    current_step: 0,
    objective: intent
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function calculateSecurityScore(context: AgentContext): number {
  let score = 100;

  // Deduct for vulnerabilities
  for (const vuln of context.vulnerabilities) {
    switch (vuln.severity) {
      case 'critical': score -= 30; break;
      case 'high': score -= 20; break;
      case 'medium': score -= 10; break;
      case 'low': score -= 5; break;
      case 'info': score -= 1; break;
    }
  }

  // Deduct for excessive open ports
  if (context.open_ports.length > 10) {
    score -= Math.min(20, (context.open_ports.length - 10) * 2);
  }

  // Ensure score is between 0 and 100
  return Math.max(0, Math.min(100, score));
}

export function formatFindingsReport(session: AgentSession): string {
  const { context, tool_history } = session;
  
  let report = `# Security Assessment Report\n\n`;
  report += `**Target:** ${context.target}\n`;
  report += `**Objective:** ${context.intent}\n`;
  report += `**Security Score:** ${calculateSecurityScore(context)}/100\n\n`;

  if (context.open_ports.length > 0) {
    report += `## Open Ports\n`;
    report += context.open_ports.map(p => `- Port ${p}`).join('\n');
    report += '\n\n';
  }

  if (context.services.length > 0) {
    report += `## Services\n`;
    report += context.services.map(s => `- ${s.port}: ${s.service}${s.version ? ` (${s.version})` : ''}`).join('\n');
    report += '\n\n';
  }

  if (context.technologies.length > 0) {
    report += `## Technologies\n`;
    report += context.technologies.map(t => `- ${t}`).join('\n');
    report += '\n\n';
  }

  if (context.vulnerabilities.length > 0) {
    report += `## Vulnerabilities\n`;
    for (const vuln of context.vulnerabilities) {
      report += `### [${vuln.severity.toUpperCase()}] ${vuln.type}\n`;
      report += `${vuln.description}\n`;
      if (vuln.evidence) {
        report += `**Evidence:** ${vuln.evidence}\n`;
      }
      report += '\n';
    }
  }

  report += `## Tool Execution Summary\n`;
  report += `Total tools executed: ${tool_history.length}\n`;
  report += `Steps completed: ${session.step_count}\n`;

  return report;
}
