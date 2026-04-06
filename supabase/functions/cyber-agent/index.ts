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
  action: 'start' | 'continue' | 'stop' | 'status';
  chatSessionId?: string;
  target?: string;
  intent?: string;
  agentSessionId?: string;
  maxSteps?: number;
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

// Main agent loop - processes one iteration and returns
async function runAgentStep(
  session: AgentSession,
  supabase: ReturnType<typeof createClient>,
  encoder: TextEncoder,
  send: (text: string) => void
): Promise<{ session: AgentSession; shouldContinue: boolean; decision: Decision }> {
  const phaseController = new PhaseController(session, supabase);
  const loopProtection = new LoopProtection(session);
  const memory = new AgentMemory(session, supabase);
  const decisionEngine = new DecisionEngine(supabase, loopProtection);
  
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
  
  // Make a decision
  const decision = await decisionEngine.decide({
    phase: currentPhase,
    session,
    availableTools,
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
      
      if (toolResult.success) {
        send(`Result: ${JSON.stringify(toolResult.result).slice(0, 500)}\n`);
        
        // Transition to ANALYSIS phase
        await phaseController.transitionTo('ANALYSIS');
        
        // Analyze the result
        const previousFindingsCount = session.context.vulnerabilities.length;
        const { updatedContext, findings } = analyzeToolResult(session.context, decision.tool_name, toolResult.result);
        
        session.context = updatedContext;
        session.findings.push(...findings);
        
        // Update progress counter
        loopProtection.updateProgressCounter(updatedContext.vulnerabilities.length, previousFindingsCount);
        
        for (const finding of findings) {
          send(`Finding: ${finding}\n`);
        }
        
        // Mark step as completed
        if (session.plan.current_step < session.plan.steps.length) {
          session.plan.steps[session.plan.current_step].status = 'completed';
          session.plan.steps[session.plan.current_step].result = toolResult.result;
          session.plan.current_step++;
        }
      } else {
        send(`Error: ${toolResult.error}\n`);
        
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
      
      return { session: phaseController.getSession(), shouldContinue: true, decision };
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

        // Run agent loop in background
        (async () => {
          let currentSession = session;
          let stepsThisRequest = 0;
          const maxStepsThisRequest = maxSteps || MAX_STEPS_PER_REQUEST;
          
          try {
            while (stepsThisRequest < maxStepsThisRequest) {
              const { session: updatedSession, shouldContinue, decision } = await runAgentStep(
                currentSession,
                supabase,
                encoder,
                (text) => send(text)
              );
              
              currentSession = updatedSession;
              stepsThisRequest++;
              
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

        return new Response(JSON.stringify({
          success: true,
          session,
          report: session.phase === 'DONE' ? formatFindingsReport(session) : undefined,
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
