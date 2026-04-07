/**
 * Gemini + Skills + Memory Integration
 * 
 * Unified agent that combines:
 * - Unofficial Gemini API (no auth required)
 * - 300 executable skills with automatic selection
 * - Full conversation memory persistence
 * - Autonomous multi-phase execution
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GeminiClient, getGeminiClient } from "./gemini-client.ts";
import { SkillsRegistry, getSkillsRegistry, Skill, SkillMatch } from "./skills-registry.ts";
import { SkillSelector, createSkillSelector, SelectionContext } from "./skill-selector.ts";
import { ConversationMemory, createConversationMemory } from "./conversation-memory.ts";
import { SKILLS_DATABASE } from "./skills-database.ts";

export interface SkillAgentConfig {
  supabase: SupabaseClient;
  conversationId: string;
  sessionId: string;
  autoExecute?: boolean;
  maxSkillsPerRequest?: number;
  minConfidenceLevel?: 'low' | 'medium' | 'high';
}

export interface AgentRequest {
  query: string;
  category?: string;
  requireApproval?: boolean;
  parameters?: Record<string, any>;
}

export interface AgentResponse {
  status: 'success' | 'partial' | 'error';
  message: string;
  selected_skills: SkillMatch[];
  execution_results: ExecutionResult[];
  reasoning: string;
  errors?: string[];
}

export interface ExecutionResult {
  skill_id: string;
  skill_name: string;
  success: boolean;
  output?: string;
  error?: string;
  duration_ms: number;
}

/**
 * Advanced AI Agent with Skills, Gemini, and Memory
 */
export class SkillfulAgent {
  private gemini: GeminiClient;
  private registry: SkillsRegistry;
  private selector: SkillSelector;
  private memory: ConversationMemory;
  private supabase: SupabaseClient;
  private config: Required<SkillAgentConfig>;

  private currentPhase: 'planning' | 'executing' | 'verifying' | 'reporting' = 'planning';
  private executionHistory: ExecutionResult[] = [];

  constructor(config: SkillAgentConfig) {
    this.supabase = config.supabase;
    this.config = {
      ...config,
      autoExecute: config.autoExecute ?? true,
      maxSkillsPerRequest: config.maxSkillsPerRequest ?? 5,
      minConfidenceLevel: config.minConfidenceLevel ?? 'medium'
    };

    // Initialize components
    this.gemini = getGeminiClient();
    this.registry = getSkillsRegistry();
    this.selector = createSkillSelector(this.registry, this.gemini);
    this.memory = createConversationMemory(
      this.supabase,
      config.conversationId,
      config.sessionId
    );

    // Register all 300+ skills
    if (this.registry.getAllSkills().length === 0) {
      this.registry.registerSkills(SKILLS_DATABASE);
      console.log(`[v0] Registered ${SKILLS_DATABASE.length} skills`);
    }
  }

  /**
   * Main agent loop - autonomous execution
   */
  async process(request: AgentRequest): Promise<AgentResponse> {
    console.log(`[v0] Agent processing: "${request.query}"`);

    try {
      // Add user message to memory
      await this.memory.addUserMessage(request.query, {
        category: request.category,
        has_parameters: !!request.parameters
      });

      // Transition to planning phase
      await this.transitionPhase('planning', 'User initiated request');

      // 1. SELECT SKILLS
      console.log("[v0] Phase 1: Skill selection");
      const selection = await this.selectSkills(request);

      if (selection.selected_skills.length === 0) {
        return {
          status: 'error',
          message: 'No relevant skills found for your request',
          selected_skills: [],
          execution_results: [],
          reasoning: 'Skill matching returned no results with sufficient confidence'
        };
      }

      // Log skill selection
      await this.memory.logSkillSelection(
        request.query,
        selection.selected_skills.map(m => ({
          id: m.skill.id,
          name: m.skill.name,
          score: m.relevance_score
        })),
        selection.reasoning
      );

      // 2. PREPARE EXECUTION PLAN
      console.log("[v0] Phase 2: Planning execution");
      await this.transitionPhase('executing', 'Executing skills autonomously');

      // 3. EXECUTE SKILLS
      console.log("[v0] Phase 3: Executing selected skills");
      const executionResults = await this.executeSkills(
        request,
        selection.selected_skills
      );

      // 4. VERIFY RESULTS
      console.log("[v0] Phase 4: Verifying results");
      await this.transitionPhase('verifying', 'Validating execution results');

      const anySuccess = executionResults.some(r => r.success);
      if (!anySuccess) {
        return {
          status: 'error',
          message: 'All skill executions failed',
          selected_skills: selection.selected_skills,
          execution_results: executionResults,
          reasoning: selection.reasoning,
          errors: executionResults.filter(r => r.error).map(r => r.error!)
        };
      }

      // 5. GENERATE REPORT
      console.log("[v0] Phase 5: Generating report");
      await this.transitionPhase('reporting', 'Preparing results');

      const report = await this.generateReport(
        request.query,
        selection.selected_skills,
        executionResults
      );

      // Add AI response to memory
      await this.memory.addAIResponse(report);

      return {
        status: anySuccess ? 'success' : 'partial',
        message: report,
        selected_skills: selection.selected_skills,
        execution_results: executionResults,
        reasoning: selection.reasoning
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[v0] Agent error:", errorMsg);

      await this.memory.addAIResponse(`Error: ${errorMsg}`);

      return {
        status: 'error',
        message: `Agent error: ${errorMsg}`,
        selected_skills: [],
        execution_results: this.executionHistory,
        reasoning: 'Error occurred during processing'
      };
    }
  }

  /**
   * Select relevant skills for the request
   */
  private async selectSkills(request: AgentRequest): Promise<{ selected_skills: SkillMatch[]; reasoning: string }> {
    const context: SelectionContext = {
      user_input: request.query,
      required_category: request.category,
      max_results: this.config.maxSkillsPerRequest,
      min_confidence: this.config.minConfidenceLevel
    };

    return this.selector.selectSkills(context);
  }

  /**
   * Execute skills sequentially
   */
  private async executeSkills(
    request: AgentRequest,
    matchedSkills: SkillMatch[]
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const match of matchedSkills) {
      const skill = match.skill;
      const startTime = Date.now();

      try {
        console.log(`[v0] Executing skill: ${skill.name}`);

        // Build prompt for skill execution using Gemini
        const skillPrompt = this.buildSkillPrompt(skill, request);

        // Execute with Gemini
        const response = await this.gemini.request(skillPrompt);

        const duration = Date.now() - startTime;

        // Log execution
        await this.memory.logSkillExecution(
          skill.id,
          skill.name,
          { query: request.query, parameters: request.parameters },
          { response: response.text },
          true,
          duration
        );

        // Update skill stats
        this.registry.updateUsageStats(skill.id, true);

        results.push({
          skill_id: skill.id,
          skill_name: skill.name,
          success: true,
          output: response.text,
          duration_ms: duration
        });

      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : String(error);

        console.error(`[v0] Skill execution failed: ${skill.name}`, errorMsg);

        // Log failure
        await this.memory.logSkillExecution(
          skill.id,
          skill.name,
          { query: request.query, parameters: request.parameters },
          { error: errorMsg },
          false,
          duration
        );

        // Update skill stats
        this.registry.updateUsageStats(skill.id, false);

        results.push({
          skill_id: skill.id,
          skill_name: skill.name,
          success: false,
          error: errorMsg,
          duration_ms: duration
        });
      }
    }

    this.executionHistory = results;
    return results;
  }

  /**
   * Build prompt for skill execution
   */
  private buildSkillPrompt(skill: Skill, request: AgentRequest): string {
    let prompt = `You are now operating as a specialist with the following skill:\n\n`;
    prompt += `SKILL: ${skill.name}\n`;
    prompt += `CATEGORY: ${skill.category}\n`;
    prompt += `DESCRIPTION: ${skill.description}\n\n`;
    prompt += `INSTRUCTIONS:\n${skill.instructions}\n\n`;

    if (request.parameters && Object.keys(request.parameters).length > 0) {
      prompt += `PROVIDED PARAMETERS:\n`;
      for (const [key, value] of Object.entries(request.parameters)) {
        prompt += `- ${key}: ${JSON.stringify(value)}\n`;
      }
      prompt += `\n`;
    }

    prompt += `USER REQUEST:\n${request.query}\n\n`;
    prompt += `Execute this skill to address the user's request. Provide a clear, actionable response.`;

    return prompt;
  }

  /**
   * Transition between phases
   */
  private async transitionPhase(phase: string, reason: string): Promise<void> {
    const oldPhase = this.currentPhase;
    this.currentPhase = phase as any;

    await this.memory.logPhaseTransition(oldPhase, phase, reason);
    console.log(`[v0] Phase transition: ${oldPhase} → ${phase}`);
  }

  /**
   * Generate final report
   */
  private async generateReport(
    query: string,
    selectedSkills: SkillMatch[],
    results: ExecutionResult[]
  ): Promise<string> {
    const successCount = results.filter(r => r.success).length;
    const skillsList = selectedSkills.map(m => m.skill.name).join(', ');

    const prompt = `Summarize the results of executing these skills for the user's request:

Request: "${query}"

Skills Used: ${skillsList}

Results:
${results.map(r => `- ${r.skill_name}: ${r.success ? 'SUCCESS' : 'FAILED'}\n  ${r.output || r.error}`).join('\n')}

Provide a concise, actionable summary that the user can immediately act on. Include:
1. What was accomplished
2. Key findings or outputs
3. Next steps (if any)`;

    try {
      const response = await this.gemini.request(prompt);
      return response.text;
    } catch (error) {
      console.error("[v0] Error generating report:", error);
      return `Successfully executed ${successCount}/${results.length} skills. Check individual results above.`;
    }
  }

  /**
   * Get conversation memory
   */
  getMemory(): ConversationMemory {
    return this.memory;
  }

  /**
   * Get skills registry
   */
  getRegistry(): SkillsRegistry {
    return this.registry;
  }

  /**
   * Get Gemini client
   */
  getGemini(): GeminiClient {
    return this.gemini;
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): string {
    return this.currentPhase;
  }

  /**
   * Get execution statistics
   */
  getStats() {
    return {
      total_skills_available: this.registry.getAllSkills().length,
      skills_registry_stats: this.registry.getStats(),
      gemini_context_usage: this.gemini.getContextUsage(),
      last_executions: this.executionHistory.slice(-10),
      current_phase: this.currentPhase
    };
  }
}

/**
 * Factory function
 */
export async function createSkillfulAgent(config: SkillAgentConfig): Promise<SkillfulAgent> {
  const agent = new SkillfulAgent(config);

  // Load conversation history if it exists
  await agent.getMemory().loadFromDatabase();

  return agent;
}
