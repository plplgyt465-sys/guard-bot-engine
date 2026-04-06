/**
 * Cyber Agent - Autonomous Security Testing Agent
 * 
 * Implements the full agent loop architecture:
 * INTENT -> PLANNING -> EXECUTION -> ANALYSIS -> DECISION (loop)
 * 
 * Features:
 * - State machine for phase management
 * - Loop protection (max steps, duplicate detection, no-progress)
 * - Persistent memory across sessions
 * - Rule-based + LLM decision engine
 * - Full audit trail
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AgentSession,
  AgentPhase,
  AgentPlan,
  AgentContext,
  PhaseController,
  LoopProtection,
  AgentMemory,
  DecisionEngine,
  AgentSessionManager,
  generateDefaultPlan,
  calculateSecurityScore,
  formatFindingsReport,
  ToolExecution,
  Decision,
} from "../_shared/agent-core.ts";
import {
  ExploitIntelligence,
  Vulnerability,
  FeedbackResult,
  RiskAssessment,
} from "../_shared/exploit-engine.ts";
import { CheckpointManager } from "../_shared/checkpoint-manager.ts";
import { IntentResolver } from "../_shared/intent-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || SUPABASE_ANON_KEY;

// AI Configuration
const MAX_STEPS_PER_REQUEST = 10; // Max steps in a single HTTP request
const TOOL_TIMEOUT_MS = 30_000;

interface AgentRequest {
  action: 'start' | 'continue' | 'stop' | 'status' | 'approve_risk' | 'resume';
  chatSessionId?: string;
  target?: string;
  intent?: string;
  userIntent?: string; // For resume action (e.g., "واصل" or "continue")
  agentSessionId?: string;
  maxSteps?: number;
  // Exploit intelligence options
  riskTolerance?: 'low' | 'medium' | 'high';
  hasAuthorization?: boolean;
  isProduction?: boolean;
  // Risk approval
  riskAssessmentId?: string;
  mitigations?: string[];
}

interface AgentResponse {
  success: boolean;
  session?: AgentSession;
  message?: string;
  report?: string;
  error?: string;
  toolResults?: Array<{ tool: string; result: unknown }>;
  phase?: AgentPhase;
  stepCount?: number;
  decision?: Decision;
  // Exploit intelligence additions
  riskAssessment?: RiskAssessment;
  feedbackResult?: FeedbackResult;
  exploitChain?: Array<{ vuln_type: string; tool_id: string; status: string }>;
  pendingApprovals?: RiskAssessment[];
  riskSummary?: {
    total: number;
    byLevel: Record<string, number>;
    pendingApproval: number;
    highRiskActions: number;
  };
}

// Execute a security tool by calling cyber-execute
async function executeTool(toolName: string, args: Record<string, unknown>): Promise<{ success: boolean; result: unknown; error?: string; duration_ms: number }> {
  const startTime = performance.now();
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/cyber-execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ tool: toolName, args }),
    });

    const duration_ms = performance.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, result: null, error: `HTTP ${response.status}: ${errorText}`, duration_ms };
    }

    const data = await response.json();
    return { success: true, result: data.result || data, error: undefined, duration_ms };
  } catch (e) {
    const duration_ms = performance.now() - startTime;
    return { success: false, result: null, error: e instanceof Error ? e.message : "Unknown error", duration_ms };
  }
}

// Get AI analysis/decision using LLM
async function getAIDecision(
  session: AgentSession, 
  context: string,
  availableTools: string[]
): Promise<{ nextAction: 'continue' | 'stop' | 'run_tool'; reason: string; tool?: string; args?: Record<string, unknown> }> {
  // For now, use rule-based logic. LLM integration can be added later.
  // This is a simplified decision maker
  
  const { plan, context: ctx, step_count, tool_history } = session;
  
  // Check if plan has more steps
  if (plan.current_step < plan.steps.length) {
    const nextStep = plan.steps[plan.current_step];
    if (nextStep.status === 'pending') {
      return {
        nextAction: 'run_tool',
        reason: `Executing planned step ${plan.current_step + 1}: ${nextStep.description}`,
        tool: nextStep.tool,
        args: nextStep.args as Record<string, unknown>,
      };
    }
  }
  
  // If we have findings and completed the plan, analyze what else we need
  if (ctx.vulnerabilities.length > 0 && ctx.vulnerabilities.some(v => v.severity === 'critical' || v.severity === 'high')) {
    return {
      nextAction: 'stop',
      reason: 'Critical/high vulnerabilities found. Stopping for immediate review.',
    };
  }
  
  // Check for web services that need more analysis
  if (ctx.services.some(s => ['http', 'https'].includes(s.service.toLowerCase())) && ctx.technologies.length === 0) {
    return {
      nextAction: 'run_tool',
      reason: 'Web service detected but no technologies identified yet',
      tool: 'tech_detect',
      args: { target: ctx.target },
    };
  }
  
  // Default: stop if no more planned steps
  return {
    nextAction: 'stop',
    reason: 'All planned steps completed',
  };
}

// Analyze tool result and update context
function analyzeToolResult(
  ctx: AgentContext, 
  toolName: string, 
  result: unknown
): { updatedContext: AgentContext; findings: string[] } {
  const findings: string[] = [];
  const updatedContext = { ...ctx };
  
  // Type-safe result handling
  const resultObj = result as Record<string, unknown> | null;
  
  switch (toolName) {
    case 'port_scan': {
      const ports = (resultObj?.ports as number[]) || [];
      if (Array.isArray(ports)) {
        updatedContext.open_ports = [...new Set([...updatedContext.open_ports, ...ports])];
        if (ports.length > 0) {
          findings.push(`Found ${ports.length} open ports: ${ports.slice(0, 10).join(', ')}${ports.length > 10 ? '...' : ''}`);
        }
      }
      break;
    }
    
    case 'tech_detect': {
      const techs = (resultObj?.technologies as string[]) || [];
      if (Array.isArray(techs)) {
        updatedContext.technologies = [...new Set([...updatedContext.technologies, ...techs])];
        if (techs.length > 0) {
          findings.push(`Detected technologies: ${techs.join(', ')}`);
        }
      }
      break;
    }
    
    case 'http_headers':
    case 'header_check': {
      const missingHeaders = (resultObj?.missing_security_headers as string[]) || [];
      if (Array.isArray(missingHeaders) && missingHeaders.length > 0) {
        updatedContext.vulnerabilities.push({
          id: crypto.randomUUID(),
          type: 'missing_security_headers',
          severity: 'medium',
          description: `Missing security headers: ${missingHeaders.join(', ')}`,
          evidence: JSON.stringify(missingHeaders),
        });
        findings.push(`Missing security headers: ${missingHeaders.join(', ')}`);
      }
      break;
    }
    
    case 'ssl_check': {
      const sslResult = resultObj as { valid?: boolean; expires_soon?: boolean; issues?: string[] } | null;
      if (sslResult?.valid === false) {
        updatedContext.vulnerabilities.push({
          id: crypto.randomUUID(),
          type: 'ssl_invalid',
          severity: 'high',
          description: 'Invalid SSL certificate',
          evidence: JSON.stringify(sslResult),
        });
        findings.push('Invalid SSL certificate detected');
      }
      if (sslResult?.expires_soon) {
        findings.push('SSL certificate expiring soon');
      }
      break;
    }
    
    case 'sqli_test':
    case 'xss_test':
    case 'lfi_test':
    case 'ssrf_test':
    case 'ssti_test': {
      const vulnResult = resultObj as { vulnerable?: boolean; payload?: string; severity?: string } | null;
      if (vulnResult?.vulnerable) {
        const vulnType = toolName.replace('_test', '').toUpperCase();
        updatedContext.vulnerabilities.push({
          id: crypto.randomUUID(),
          type: vulnType,
          severity: (vulnResult.severity as 'critical' | 'high' | 'medium' | 'low' | 'info') || 'high',
          description: `${vulnType} vulnerability detected`,
          evidence: vulnResult.payload,
        });
        findings.push(`${vulnType} vulnerability found!`);
      }
      break;
    }
    
    case 'subdomain_enum': {
      const subdomains = (resultObj?.subdomains as string[]) || [];
      if (Array.isArray(subdomains) && subdomains.length > 0) {
        updatedContext.discovered_info['subdomains'] = subdomains;
        findings.push(`Found ${subdomains.length} subdomains`);
      }
      break;
    }
    
    case 'dns_lookup': {
      updatedContext.discovered_info['dns'] = resultObj;
      findings.push('DNS records retrieved');
      break;
    }
    
    case 'whois': {
      updatedContext.discovered_info['whois'] = resultObj;
      findings.push('WHOIS information retrieved');
      break;
    }
    
    default: {
      // Generic handling for unknown tools
      if (resultObj && typeof resultObj === 'object') {
        updatedContext.discovered_info[toolName] = resultObj;
        findings.push(`${toolName} completed`);
      }
    }
  }
  
  return { updatedContext, findings };
}

// Configuration for exploit intelligence
interface ExploitConfig {
  riskTolerance: 'low' | 'medium' | 'high';
  hasAuthorization: boolean;
  isProduction: boolean;
}

// Helper function to analyze tool results and extract findings
function analyzeToolResult(context: AgentContext, toolName: string, result: unknown): { updatedContext: AgentContext; findings: string[] } {
  const findings: string[] = [];
  const updatedContext = { ...context };

  if (!result || typeof result !== 'object') {
    return { updatedContext, findings };
  }

  const resultObj = result as Record<string, unknown>;

  // Extract vulnerabilities from results based on tool type
  if (toolName.includes('scan') || toolName.includes('test')) {
    if (Array.isArray(resultObj.vulnerabilities)) {
      resultObj.vulnerabilities.forEach((vuln: unknown) => {
        if (typeof vuln === 'object' && vuln) {
          const v = vuln as Record<string, unknown>;
          updatedContext.vulnerabilities.push({
            id: `${toolName}-${Date.now()}`,
            type: (v.type as string) || toolName.replace('_scan', '').replace('_test', ''),
            severity: (v.severity as any) || 'medium',
            description: (v.description as string) || JSON.stringify(v),
            evidence: (v.evidence as string),
            confirmed: false,
            exploited: false,
            cve: (v.cve as string),
            cvss: typeof v.cvss === 'number' ? v.cvss : undefined,
          });
          findings.push(`Found ${(v.type as string) || 'vulnerability'}: ${(v.description as string) || 'Unknown'}`);
        }
      });
    } else if (resultObj.found || resultObj.vulnerable) {
      findings.push(`${toolName} detected a potential vulnerability`);
    }
  }

  // Extract open ports
  if (toolName === 'port_scan' && Array.isArray(resultObj.ports)) {
    const ports = (resultObj.ports as Array<any>)
      .filter(p => p && typeof p === 'object' && typeof p.port === 'number')
      .map(p => p.port);
    updatedContext.open_ports = [...new Set([...updatedContext.open_ports, ...ports])];
    findings.push(`Found ${ports.length} open ports`);
  }

  // Extract services
  if ((toolName === 'service_detect' || toolName === 'tech_detect') && Array.isArray(resultObj.services)) {
    const services = (resultObj.services as Array<any>)
      .filter(s => s && typeof s === 'object' && typeof s.port === 'number')
      .map(s => ({ port: s.port, service: (s.name || s.service || 'unknown') as string, version: s.version as string | undefined }));
    updatedContext.services = [...updatedContext.services, ...services];
    findings.push(`Detected ${services.length} services`);
  }

  // Extract technologies
  if (toolName.includes('tech') && Array.isArray(resultObj.technologies)) {
    const techs = (resultObj.technologies as string[]).filter(t => typeof t === 'string');
    updatedContext.technologies = [...new Set([...updatedContext.technologies, ...techs])];
    findings.push(`Detected ${techs.length} technologies`);
  }

  // Extract any generic findings
  if (resultObj.findings && Array.isArray(resultObj.findings)) {
    const resultFindings = (resultObj.findings as string[]).filter(f => typeof f === 'string');
    findings.push(...resultFindings);
  }

  return { updatedContext, findings };
}

// Configuration for exploit intelligence

// Main agent loop - processes one iteration and returns
async function runAgentStep(
  session: AgentSession,
  supabase: ReturnType<typeof createClient>,
  encoder: TextEncoder,
  send: (text: string) => void,
  exploitConfig: ExploitConfig = { riskTolerance: 'medium', hasAuthorization: false, isProduction: false }
): Promise<{ session: AgentSession; shouldContinue: boolean; decision: Decision; feedbackResult?: FeedbackResult }> {
  const phaseController = new PhaseController(session, supabase);
  const loopProtection = new LoopProtection(session);
  const memory = new AgentMemory(session, supabase);
  const decisionEngine = new DecisionEngine(supabase, loopProtection);
  const exploitIntel = decisionEngine.getExploitIntelligence();
  
  // Load memory cache
  await memory.loadShortTermCache();
  
  // Check loop protection first
  const stopReason = loopProtection.getStopReason();
  if (stopReason) {
    await phaseController.transitionTo('DONE', stopReason);
    return {
      session: phaseController.getSession(),
      shouldContinue: false,
      decision: { type: 'stop', reason: stopReason },
    };
  }
  
  const currentPhase = phaseController.getCurrentPhase();
  send(`\n[${currentPhase}] Step ${session.step_count + 1}/${session.max_steps}\n`);
  
  // Get available tools for decision context
  const availableTools = [
    'port_scan', 'dns_lookup', 'http_headers', 'ssl_check', 'whois',
    'tech_detect', 'subdomain_enum', 'sqli_test', 'xss_test', 'lfi_test',
    'cors_test', 'clickjacking_test', 'dir_bruteforce', 'cve_search',
  ];
  
  // Determine current vulnerability being targeted (if any)
  const unprocessedVulns = session.context.vulnerabilities.filter(v => !v.exploited && v.confirmed);
  const currentVulnerability = unprocessedVulns.length > 0 ? (unprocessedVulns[0] as Vulnerability) : undefined;
  
  // Determine exploit phase based on session state
  let exploitPhase: 'scan' | 'exploit' | 'verify' | 'post_exploit' | undefined;
  if (currentVulnerability) {
    const attemptedExploits = session.tool_history.filter(t => 
      t.tool.includes('exploit') || t.tool.includes('inject')
    );
    if (attemptedExploits.length === 0) {
      exploitPhase = 'scan';
    } else if (attemptedExploits.some(t => t.success)) {
      exploitPhase = 'post_exploit';
    } else {
      exploitPhase = 'exploit';
    }
  }

  // Make a decision with exploit intelligence context
  const decision = await decisionEngine.decide({
    phase: currentPhase,
    session,
    availableTools,
    currentVulnerability,
    exploitPhase,
    riskTolerance: exploitConfig.riskTolerance,
    hasAuthorization: exploitConfig.hasAuthorization,
    isProduction: exploitConfig.isProduction,
  });
  
  send(`Decision: ${decision.type} - ${decision.reason}\n`);
  
  // Handle the decision
  switch (decision.type) {
    case 'run_tool': {
      if (!decision.tool_name) {
        return { session, shouldContinue: false, decision: { type: 'stop', reason: 'No tool specified' } };
      }
      
      // Check for duplicate tool
      const skipCheck = loopProtection.shouldSkipTool(decision.tool_name);
      if (skipCheck.skip) {
        send(`Skipping: ${skipCheck.reason}\n`);
        
        // Mark step as skipped and move to next
        if (session.plan.current_step < session.plan.steps.length) {
          session.plan.steps[session.plan.current_step].status = 'skipped';
          session.plan.current_step++;
        }
        
        await phaseController.updateSession({ plan: session.plan });
        return { session, shouldContinue: true, decision };
      }
      
      // Log risk assessment if present
      if (decision.risk_assessment) {
        send(`Risk Assessment: ${decision.risk_assessment.risk_level} (score: ${(decision.risk_assessment.risk_score * 100).toFixed(0)}%)\n`);
        if (decision.risk_assessment.risk_factors.length > 0) {
          send(`Risk Factors: ${decision.risk_assessment.risk_factors.join(', ')}\n`);
        }
      }
      
      // Transition to EXECUTION phase
      await phaseController.transitionTo('EXECUTION');
      
      send(`Executing: ${decision.tool_name}\n`);
      
      // Execute the tool
      const toolResult = await executeTool(decision.tool_name, decision.tool_args || {});
      
      // Record tool execution
      const toolExecution: ToolExecution = {
        tool: decision.tool_name,
        args: decision.tool_args || {},
        result: toolResult.result,
        timestamp: new Date().toISOString(),
        duration_ms: toolResult.duration_ms,
        success: toolResult.success,
        error: toolResult.error,
      };
      
      session.tool_history.push(toolExecution);
      loopProtection.incrementStep();
      
      // Store in memory
      await memory.storeToolResult(decision.tool_name, decision.tool_args || {}, toolResult.result);
      
      // Process through feedback loop if we're targeting a vulnerability
      let feedbackResult: FeedbackResult | undefined;
      if (currentVulnerability) {
        feedbackResult = await decisionEngine.processToolResult(
          session.id,
          currentVulnerability,
          decision.tool_name!,
          {
            success: toolResult.success,
            output: toolResult.result,
            executionTimeMs: toolResult.duration_ms,
            error: toolResult.error,
          }
        );
        
        send(`Feedback: ${feedbackResult.next_action} - ${feedbackResult.reason} (confidence: ${(feedbackResult.confidence * 100).toFixed(0)}%)\n`);
        
        if (feedbackResult.alternative_tools.length > 0) {
          send(`Alternative tools available: ${feedbackResult.alternative_tools.join(', ')}\n`);
        }
      }
      
      if (toolResult.success) {
        send(`Result: ${JSON.stringify(toolResult.result).slice(0, 500)}\n`);
        
        // Transition to ANALYSIS phase
        await phaseController.transitionTo('ANALYSIS');
        
        // Analyze the result
        const previousFindingsCount = session.context.vulnerabilities.length;
        const { updatedContext, findings } = analyzeToolResult(session.context, decision.tool_name!, toolResult.result);
        
        session.context = updatedContext;
        session.findings.push(...findings);
        
        // Update progress counter
        loopProtection.updateProgressCounter(updatedContext.vulnerabilities.length, previousFindingsCount);
        
        for (const finding of findings) {
          send(`Finding: ${finding}\n`);
        }
        
        // Handle feedback loop verification
        if (feedbackResult?.next_action === 'verify') {
          send(`Verification required for high-confidence exploit result\n`);
        }
        
        // Mark step as completed
        if (session.plan.current_step < session.plan.steps.length) {
          session.plan.steps[session.plan.current_step].status = 'completed';
          session.plan.steps[session.plan.current_step].result = toolResult.result;
          session.plan.current_step++;
        }
      } else {
        send(`Error: ${toolResult.error}\n`);
        
        // Handle feedback loop retry
        if (feedbackResult?.next_action === 'retry_alternative' && feedbackResult.alternative_tools.length > 0) {
          send(`Will try alternative tool: ${feedbackResult.alternative_tools[0]}\n`);
        }
        
        // Mark step as failed
        if (session.plan.current_step < session.plan.steps.length) {
          session.plan.steps[session.plan.current_step].status = 'failed';
          session.plan.steps[session.plan.current_step].error = toolResult.error;
          session.plan.current_step++;
        }
      }
      
      // Transition to DECISION phase for next iteration
      await phaseController.transitionTo('DECISION');
      
      // Update session in database
      await phaseController.updateSession({
        plan: session.plan,
        context: session.context,
        findings: session.findings,
        tool_history: session.tool_history,
        step_count: session.step_count + 1,
        no_progress_count: session.no_progress_count,
      });
      
      return { session: phaseController.getSession(), shouldContinue: true, decision, feedbackResult };
    }
    
    case 'escalate': {
      // Handle escalation - requires user approval
      send(`ESCALATION REQUIRED: ${decision.reason}\n`);
      if (decision.risk_assessment) {
        send(`Risk Level: ${decision.risk_assessment.risk_level}\n`);
        send(`Risk Factors: ${decision.risk_assessment.risk_factors.join(', ')}\n`);
      }
      
      // Pause the session and wait for approval
      await phaseController.updateSession({
        context: {
          ...session.context,
          discovered_info: {
            ...session.context.discovered_info,
            pending_approval: {
              tool: decision.tool_name,
              risk_assessment_id: decision.risk_assessment?.id,
              reason: decision.reason,
            }
          }
        }
      });
      
      return { 
        session: phaseController.getSession(), 
        shouldContinue: false, 
        decision,
      };
    }
    
    case 'stop': {
      // Calculate final security score
      const securityScore = calculateSecurityScore(session.context);
      session.security_score = securityScore;
      
      await phaseController.transitionTo('DONE', decision.reason);
      await phaseController.updateSession({
        security_score: securityScore,
        completed_at: new Date().toISOString(),
      });
      
      send(`\nAgent completed. Security Score: ${securityScore}/100\n`);
      return { session: phaseController.getSession(), shouldContinue: false, decision };
    }
    
    case 'skip': {
      // Skip current step
      if (session.plan.current_step < session.plan.steps.length) {
        session.plan.steps[session.plan.current_step].status = 'skipped';
        session.plan.current_step++;
      }
      await phaseController.updateSession({ plan: session.plan });
      return { session, shouldContinue: true, decision };
    }
    
    case 'change_plan': {
      // Update plan if new plan provided
      if (decision.new_plan) {
        session.plan = decision.new_plan;
        await phaseController.updateSession({ plan: session.plan });
      }
      await phaseController.transitionTo('PLANNING');
      return { session, shouldContinue: true, decision };
    }
    
    default:
      return { session, shouldContinue: false, decision: { type: 'stop', reason: 'Unknown decision type' } };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: AgentRequest = await req.json();
    const { action, chatSessionId, target, intent, agentSessionId, maxSteps } = body;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const sessionManager = new AgentSessionManager(supabase);

    // Handle different actions
    switch (action) {
      case 'start': {
        if (!chatSessionId || !target) {
          return new Response(JSON.stringify({ success: false, error: 'chatSessionId and target are required' }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Create new agent session
        const agentIntent = intent || `Comprehensive security assessment of ${target}`;
        const session = await sessionManager.createSession(chatSessionId, target, agentIntent);
        
        // Generate default plan
        const plan = generateDefaultPlan(target, agentIntent);
        session.plan = plan;
        
        // Update session with plan
        await supabase
          .from('agent_sessions')
          .update({ plan, phase: 'PLANNING' })
          .eq('id', session.id);
        
        session.phase = 'PLANNING';

        return new Response(JSON.stringify({
          success: true,
          session,
          message: `Agent session created with ${plan.steps.length} planned steps`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case 'resume': {
        if (!agentSessionId || !chatSessionId) {
          return new Response(JSON.stringify({ success: false, error: 'agentSessionId and chatSessionId are required' }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Resolve intent from user message
        const intentResolver = new IntentResolver(supabase, chatSessionId);
        const userIntentText = body.userIntent || 'واصل'; // Default to Arabic "continue"
        const intentResolution = await intentResolver.resolveIntent(userIntentText, agentSessionId);

        console.log('[v0] Resolved intent:', intentResolution);

        // Get existing session
        const session = await sessionManager.getSession(agentSessionId);
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: 'Session not found' }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Initialize checkpoint manager
        const checkpointManager = new CheckpointManager(supabase, agentSessionId);

        // Try to recover from checkpoint
        let resumeSession = session;
        let recoveryInfo = null;

        if (intentResolution.should_use_checkpoint) {
          const recovery = await checkpointManager.recoverFromCheckpoint();
          if (recovery) {
            console.log('[v0] Recovering from checkpoint:', recovery);
            checkpointManager.restoreSessionFromCheckpoint(resumeSession, recovery.checkpoint);
            recoveryInfo = recovery;
          }
        }

        // Stream response for real-time updates
        const encoder = new TextEncoder();
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        
        const send = async (text: string) => {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'progress', content: text })}\n\n`));
        };

        // Send resume info
        await send(`Resuming session...\nIntent: ${intentResolution.action}\nLanguage: ${intentResolution.detected_language}\n`);
        if (recoveryInfo) {
          await send(`Recovered from checkpoint: ${recoveryInfo.next_action}\nSteps recovered: ${recoveryInfo.steps_recovered}\n\n`);
        } else {
          await send(`No checkpoint found. Continuing from current state.\n\n`);
        }

        // Exploit config from request
        const exploitConfig: ExploitConfig = {
          riskTolerance: body.riskTolerance || 'medium',
          hasAuthorization: body.hasAuthorization || false,
          isProduction: body.isProduction || false,
        };

        // Run agent loop in background
        (async () => {
          let currentSession = resumeSession;
          let stepsThisRequest = 0;
          const maxStepsThisRequest = maxSteps || MAX_STEPS_PER_REQUEST;
          const requestStartTime = Date.now();
          
          try {
            while (stepsThisRequest < maxStepsThisRequest) {
              // Check for timeout (110s buffer)
              if (checkpointManager.isApproachingTimeout(requestStartTime)) {
                await send('\n⚠️ Approaching 120s timeout. Saving checkpoint...\n');
                await checkpointManager.saveCheckpoint(currentSession, true);
                break;
              }

              const { session: updatedSession, shouldContinue, decision, feedbackResult } = await runAgentStep(
                currentSession,
                supabase,
                encoder,
                (text) => send(text),
                exploitConfig
              );
              
              currentSession = updatedSession;
              stepsThisRequest++;

              // Save checkpoint every few steps
              if (stepsThisRequest % 2 === 0) {
                await checkpointManager.saveCheckpoint(currentSession, false);
              }
              
              if (!shouldContinue) {
                break;
              }
              
              // Small delay to prevent overwhelming
              await new Promise(r => setTimeout(r, 500));
            }
            
            // Send final status
            await send(`\n--- Session Status ---\n`);
            await send(`Phase: ${currentSession.phase}\n`);
            await send(`Steps: ${currentSession.step_count}/${currentSession.max_steps}\n`);
            await send(`Findings: ${currentSession.findings.length}\n`);
            await send(`Vulnerabilities: ${currentSession.context.vulnerabilities.length}\n`);
            
            if (currentSession.phase === 'DONE') {
              await send(`\nSecurity Score: ${currentSession.security_score}/100\n`);
              await writer.write(encoder.encode(`data: ${JSON.stringify({ 
                type: 'complete', 
                session: currentSession,
                report: formatFindingsReport(currentSession),
              })}\n\n`));
            } else {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ 
                type: 'paused', 
                session: currentSession,
                message: `Paused after ${stepsThisRequest} steps. Send 'resume' with 'واصل' to continue.`,
              })}\n\n`));
            }
          } catch (e) {
            console.error('Agent error:', e);
            await send(`Error: ${e instanceof Error ? e.message : 'Unknown error'}\n`);
            await checkpointManager.saveCheckpoint(currentSession, false); // Save state on error
            await sessionManager.errorSession(currentSession.id, e instanceof Error ? e.message : 'Unknown error');
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: e instanceof Error ? e.message : 'Unknown error' })}\n\n`));
          } finally {
            await writer.write(encoder.encode('data: [DONE]\n\n'));
            await writer.close();
          }
        })();

        return new Response(stream.readable, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      }

      case 'continue': {
        if (!agentSessionId) {
          return new Response(JSON.stringify({ success: false, error: 'agentSessionId is required' }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get existing session
        const session = await sessionManager.getSession(agentSessionId);
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: 'Session not found' }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if session is already complete
        if (session.phase === 'DONE' || session.phase === 'ERROR') {
          return new Response(JSON.stringify({
            success: true,
            session,
            message: 'Session already completed',
            report: formatFindingsReport(session),
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Stream response for real-time updates
        const encoder = new TextEncoder();
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        
        const send = async (text: string) => {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'progress', content: text })}\n\n`));
        };

        // Exploit config from request
        const exploitConfig: ExploitConfig = {
          riskTolerance: body.riskTolerance || 'medium',
          hasAuthorization: body.hasAuthorization || false,
          isProduction: body.isProduction || false,
        };

        // Initialize checkpoint manager for timeout handling
        const checkpointManager = new CheckpointManager(supabase, agentSessionId);

        // Run agent loop in background
        (async () => {
          let currentSession = session;
          let stepsThisRequest = 0;
          const maxStepsThisRequest = maxSteps || MAX_STEPS_PER_REQUEST;
          const requestStartTime = Date.now();
          
          try {
            while (stepsThisRequest < maxStepsThisRequest) {
              // Check for timeout (110s buffer before 120s limit)
              if (checkpointManager.isApproachingTimeout(requestStartTime)) {
                await send('\n⚠️ Approaching 120s timeout. Saving checkpoint before timeout...\n');
                await checkpointManager.saveCheckpoint(currentSession, true);
                break;
              }

              const { session: updatedSession, shouldContinue, decision, feedbackResult } = await runAgentStep(
                currentSession,
                supabase,
                encoder,
                (text) => send(text),
                exploitConfig
              );
              
              currentSession = updatedSession;
              stepsThisRequest++;

              // Save checkpoint every 2 steps for recovery
              if (stepsThisRequest % 2 === 0) {
                await checkpointManager.saveCheckpoint(currentSession, false);
              }
              
              if (!shouldContinue) {
                break;
              }
              
              // Small delay to prevent overwhelming
              await new Promise(r => setTimeout(r, 500));
            }
            
            // Send final status
            await send(`\n--- Session Status ---\n`);
            await send(`Phase: ${currentSession.phase}\n`);
            await send(`Steps: ${currentSession.step_count}/${currentSession.max_steps}\n`);
            await send(`Findings: ${currentSession.findings.length}\n`);
            await send(`Vulnerabilities: ${currentSession.context.vulnerabilities.length}\n`);
            
            if (currentSession.phase === 'DONE') {
              await send(`\nSecurity Score: ${currentSession.security_score}/100\n`);
              await writer.write(encoder.encode(`data: ${JSON.stringify({ 
                type: 'complete', 
                session: currentSession,
                report: formatFindingsReport(currentSession),
              })}\n\n`));
            } else {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ 
                type: 'paused', 
                session: currentSession,
                message: `Paused after ${stepsThisRequest} steps. Send 'continue' to resume.`,
              })}\n\n`));
            }
          } catch (e) {
            console.error('Agent error:', e);
            await send(`Error: ${e instanceof Error ? e.message : 'Unknown error'}\n`);
            // Save checkpoint before marking as error for potential recovery
            await checkpointManager.saveCheckpoint(currentSession, false);
            await sessionManager.errorSession(currentSession.id, e instanceof Error ? e.message : 'Unknown error');
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: e instanceof Error ? e.message : 'Unknown error' })}\n\n`));
          } finally {
            await writer.write(encoder.encode('data: [DONE]\n\n'));
            await writer.close();
          }
        })();

        return new Response(stream.readable, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      }

      case 'stop': {
        if (!agentSessionId) {
          return new Response(JSON.stringify({ success: false, error: 'agentSessionId is required' }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const session = await sessionManager.getSession(agentSessionId);
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: 'Session not found' }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const securityScore = calculateSecurityScore(session.context);
        await sessionManager.completeSession(agentSessionId, securityScore);
        
        session.phase = 'DONE';
        session.security_score = securityScore;

        return new Response(JSON.stringify({
          success: true,
          session,
          message: 'Agent session stopped',
          report: formatFindingsReport(session),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case 'status': {
        if (!agentSessionId && !chatSessionId) {
          return new Response(JSON.stringify({ success: false, error: 'agentSessionId or chatSessionId is required' }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let session: AgentSession | null = null;
        
        if (agentSessionId) {
          session = await sessionManager.getSession(agentSessionId);
        } else if (chatSessionId) {
          session = await sessionManager.getActiveSessionForChat(chatSessionId);
        }

        if (!session) {
          return new Response(JSON.stringify({ success: false, error: 'No active session found' }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get exploit intelligence data
        const exploitIntel = new ExploitIntelligence(supabase);
        const riskSummary = await exploitIntel.risk.getRiskSummary(session.id);
        const pendingApprovals = await exploitIntel.risk.getPendingAssessments(session.id);
        const exploitChain = await exploitIntel.feedback.getExploitChain(session.id);

        return new Response(JSON.stringify({
          success: true,
          session,
          report: session.phase === 'DONE' ? formatFindingsReport(session) : undefined,
          riskSummary,
          pendingApprovals,
          exploitChain: exploitChain.map(e => ({
            vuln_type: e.vuln_type,
            tool_id: e.tool_id,
            status: e.status,
          })),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case 'approve_risk': {
        const { riskAssessmentId, mitigations } = body;
        
        if (!riskAssessmentId) {
          return new Response(JSON.stringify({ success: false, error: 'riskAssessmentId is required' }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const exploitIntel = new ExploitIntelligence(supabase);
        await exploitIntel.risk.approveRisk(riskAssessmentId, mitigations || []);

        return new Response(JSON.stringify({
          success: true,
          message: 'Risk approved. The agent can now continue.',
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ success: false, error: 'Invalid action. Use: start, continue, stop, or status' }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    console.error('Agent error:', e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
