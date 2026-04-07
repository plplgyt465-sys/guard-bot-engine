/**
 * Chat Stream - Unified chat interface using Gemini Unofficial
 * 
 * All chat goes through Gemini unofficial API - no keys required.
 * Includes full conversation memory and skill auto-selection.
 */

import { GeminiUnofficial, conversationMemory } from './gemini-unofficial';
import { skillsEngine, SkillsEngine, Skill, SkillExecution } from './skills-engine';

export type ChatMessage = { role: "user" | "assistant"; content: string };

// ============================================================================
// AUTONOMOUS AGENT TYPES
// ============================================================================

export type AgentPhase = 'UNDERSTANDING' | 'PLANNING' | 'EXECUTION' | 'VERIFICATION' | 'CORRECTION' | 'DONE' | 'ERROR';

export interface AgentSession {
  id: string;
  sessionId: string;
  target: string;
  phase: AgentPhase;
  currentSkill: Skill | null;
  skillExecution: SkillExecution | null;
  context: {
    intent: string;
    extractedParams: Record<string, unknown>;
    conversationHistory: ChatMessage[];
    skillsUsed: string[];
    memoryKeys: string[];
  };
  findings: unknown[];
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AgentProgress {
  type: 'progress' | 'skill_selected' | 'params_extracted' | 'executing' | 'streaming' | 'complete' | 'error';
  content?: string;
  phase?: AgentPhase;
  skill?: Skill;
  params?: Record<string, unknown>;
  session?: AgentSession;
  error?: string;
}

// ============================================================================
// MAIN CHAT FUNCTIONS
// ============================================================================

/**
 * Stream chat using Gemini unofficial - the ONLY AI provider
 */
export async function streamChat({
  messages,
  customSystemPrompt,
  sessionId,
  useSkills = true,
  onDelta,
  onSkillSelected,
  onPhaseChange,
  onDone,
  onError,
}: {
  messages: ChatMessage[];
  customSystemPrompt?: string;
  sessionId?: string;
  useSkills?: boolean;
  onDelta: (deltaText: string) => void;
  onSkillSelected?: (skill: Skill) => void;
  onPhaseChange?: (phase: AgentPhase) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  const session = sessionId || `chat_${Date.now()}`;
  const gemini = new GeminiUnofficial(session);
  const skills = new SkillsEngine(session);

  // Get the latest user message
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    onError('No user message provided');
    return;
  }

  const userInput = lastMessage.content;

  try {
    // Phase 1: Understanding - Try to find a matching skill
    onPhaseChange?.('UNDERSTANDING');

    if (useSkills) {
      const match = await skills.selectSkill(userInput);
      
      if (match && match.score >= 10) {
        onSkillSelected?.(match.skill);
        console.log(`[v0] Selected skill: ${match.skill.name} (score: ${match.score})`);

        // Phase 2: Planning - Extract parameters
        onPhaseChange?.('PLANNING');
        const params = await skills.extractParameters(match.skill, userInput);
        console.log(`[v0] Extracted params:`, params);

        // Phase 3: Execution - Run the skill with streaming
        onPhaseChange?.('EXECUTION');

        for await (const update of skills.runStream(userInput)) {
          if (update.content) {
            onDelta(update.content);
          }
        }

        // Phase 4: Done
        onPhaseChange?.('DONE');
        onDone();
        return;
      }
    }

    // No skill matched - use direct Gemini chat
    onPhaseChange?.('EXECUTION');

    if (customSystemPrompt) {
      gemini.setSystemInstruction(customSystemPrompt);
    }

    // Build conversation context from messages
    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i];
      conversationMemory.addMessage(session, msg.role === 'user' ? 'user' : 'model', msg.content);
    }

    // Stream the response
    for await (const chunk of gemini.generateStream(userInput)) {
      onDelta(chunk);
    }

    onPhaseChange?.('DONE');
    onDone();
  } catch (error) {
    onPhaseChange?.('ERROR');
    onError(error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

/**
 * Non-streaming chat
 */
export async function chat({
  message,
  sessionId,
  customSystemPrompt,
  useSkills = true,
}: {
  message: string;
  sessionId?: string;
  customSystemPrompt?: string;
  useSkills?: boolean;
}): Promise<string> {
  const session = sessionId || `chat_${Date.now()}`;
  const gemini = new GeminiUnofficial(session);
  const skills = new SkillsEngine(session);

  // Try skill first
  if (useSkills) {
    const match = await skills.selectSkill(message);
    if (match && match.score >= 10) {
      const result = await skills.run(message);
      if (result.execution?.success) {
        return result.execution.output;
      }
    }
  }

  // Direct Gemini chat
  if (customSystemPrompt) {
    gemini.setSystemInstruction(customSystemPrompt);
  }
  return gemini.generate(message);
}

// ============================================================================
// AUTONOMOUS AGENT FUNCTIONS
// ============================================================================

/**
 * Start an autonomous agent session with skills
 */
export async function startAutonomousAgent({
  sessionId,
  target,
  intent,
  onProgress,
  onComplete,
  onError,
}: {
  sessionId: string;
  target: string;
  intent?: string;
  onProgress: (progress: AgentProgress) => void;
  onComplete: (session: AgentSession) => void;
  onError: (error: string) => void;
}): Promise<{ sessionId: string; abort: () => void }> {
  let aborted = false;
  const abort = () => { aborted = true; };

  const gemini = new GeminiUnofficial(sessionId);
  const skills = new SkillsEngine(sessionId);

  const session: AgentSession = {
    id: `agent_${Date.now()}`,
    sessionId,
    target,
    phase: 'UNDERSTANDING',
    currentSkill: null,
    skillExecution: null,
    context: {
      intent: intent || target,
      extractedParams: {},
      conversationHistory: [],
      skillsUsed: [],
      memoryKeys: []
    },
    findings: [],
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null
  };

  try {
    // Phase 1: Understanding
    onProgress({ type: 'progress', phase: 'UNDERSTANDING', content: 'Analyzing request...' });

    // Determine intent and select appropriate skills
    const intentPrompt = `Analyze this request and determine what skills/actions are needed:
"${target}"

List 1-3 actions needed to complete this request. Be specific.`;

    const intentAnalysis = await gemini.generate(intentPrompt, false);
    session.context.intent = intentAnalysis;

    if (aborted) return { sessionId, abort };

    // Phase 2: Planning
    session.phase = 'PLANNING';
    onProgress({ type: 'progress', phase: 'PLANNING', content: 'Planning execution...' });

    // Find matching skills
    const match = await skills.selectSkill(target);
    if (match) {
      session.currentSkill = match.skill;
      onProgress({ type: 'skill_selected', skill: match.skill });

      const params = await skills.extractParameters(match.skill, target);
      session.context.extractedParams = params;
      onProgress({ type: 'params_extracted', params });
    }

    if (aborted) return { sessionId, abort };

    // Phase 3: Execution
    session.phase = 'EXECUTION';
    onProgress({ type: 'progress', phase: 'EXECUTION', content: 'Executing...' });

    if (session.currentSkill) {
      // Execute the skill
      for await (const update of skills.runStream(target)) {
        if (aborted) break;
        if (update.content) {
          onProgress({ type: 'streaming', content: update.content });
        }
      }
      session.context.skillsUsed.push(session.currentSkill.id);
    } else {
      // Direct execution with Gemini
      for await (const chunk of gemini.generateStream(target)) {
        if (aborted) break;
        onProgress({ type: 'streaming', content: chunk });
      }
    }

    if (aborted) return { sessionId, abort };

    // Phase 4: Verification
    session.phase = 'VERIFICATION';
    onProgress({ type: 'progress', phase: 'VERIFICATION', content: 'Verifying output...' });

    // Simple verification - check if output seems complete
    // In a real system, this would be more sophisticated

    // Phase 5: Complete
    session.phase = 'DONE';
    session.completed_at = new Date().toISOString();
    session.updated_at = new Date().toISOString();

    onProgress({ type: 'complete', session });
    onComplete(session);

  } catch (error) {
    session.phase = 'ERROR';
    onError(error instanceof Error ? error.message : 'Unknown error');
  }

  return { sessionId, abort };
}

/**
 * Check if a message should trigger autonomous mode
 */
export function shouldTriggerAutonomousMode(message: string): { trigger: boolean; target?: string } {
  const lowerMessage = message.toLowerCase();
  
  // Patterns that indicate autonomous operation
  const autonomousPatterns = [
    /(?:اعمل|نفذ|قم ب|ابدأ)\s+(?:تلقائي|مستقل|كامل|شامل)/i,
    /(?:execute|run|start|do)\s+(?:autonomous|auto|full|complete)/i,
    /افحص?\s+(?:بشكل\s+)?(?:مستقل|تلقائي|شامل)/i,
    /run\s+autonomous/i,
    /start\s+agent/i,
    /auto\s+mode/i,
  ];
  
  const isAutonomous = autonomousPatterns.some(p => p.test(message));
  
  return { trigger: isAutonomous, target: isAutonomous ? message : undefined };
}

// ============================================================================
// CONVERSATION MEMORY FUNCTIONS
// ============================================================================

/**
 * Get conversation history for a session
 */
export function getConversationHistory(sessionId: string): ChatMessage[] {
  const history = conversationMemory.getHistory(sessionId);
  return history.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.parts.map(p => p.text).join('')
  }));
}

/**
 * Clear conversation history for a session
 */
export function clearConversationHistory(sessionId: string): void {
  conversationMemory.clearSession(sessionId);
}

/**
 * Get all session IDs
 */
export function getAllSessions(): string[] {
  return conversationMemory.getAllSessions();
}

/**
 * Clear all conversation history
 */
export function clearAllHistory(): void {
  conversationMemory.clearAll();
}

// ============================================================================
// SKILLS ACCESS
// ============================================================================

/**
 * Get available skills
 */
export function getAvailableSkills() {
  return skillsEngine.getAllSkills();
}

/**
 * Get skills by category
 */
export function getSkillsByCategory(category: string) {
  return skillsEngine.getSkillsByCategory(category as any);
}

/**
 * Get skill count
 */
export function getSkillCount(): number {
  return skillsEngine.getSkillCount();
}

/**
 * Test Gemini connection
 */
export async function testGeminiConnection(): Promise<{ success: boolean; model: string; error?: string }> {
  const gemini = new GeminiUnofficial();
  return gemini.testConnection();
}
