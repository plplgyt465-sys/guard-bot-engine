/**
 * Example: Skillful Agent Implementation
 * 
 * Demonstrates how to use the Gemini + 300 Skills system
 * to process business requests autonomously
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSkillfulAgent } from "../_shared/skillful-agent.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

interface RequestBody {
  query: string;
  conversationId?: string;
  category?: string;
  parameters?: Record<string, any>;
}

serve(async (req: Request) => {
  // Enable CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  try {
    const body: RequestBody = await req.json();

    if (!body.query) {
      return new Response(
        JSON.stringify({ error: "Missing 'query' field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generate or use provided IDs
    const conversationId = body.conversationId || `conv_${Date.now()}`;
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[v0] Processing request in conversation: ${conversationId}`);

    // Create and initialize agent
    const agent = await createSkillfulAgent({
      supabase,
      conversationId,
      sessionId,
      autoExecute: true,
      maxSkillsPerRequest: 5,
      minConfidenceLevel: 'medium'
    });

    // Process the request
    console.log(`[v0] Agent processing: "${body.query}"`);
    const response = await agent.process({
      query: body.query,
      category: body.category,
      parameters: body.parameters
    });

    // Get statistics
    const stats = agent.getStats();
    const memory = agent.getMemory();
    const snapshot = await memory.getMemorySnapshot();

    console.log(`[v0] Agent response status: ${response.status}`);

    return new Response(
      JSON.stringify({
        status: response.status,
        message: response.message,
        selected_skills: response.selected_skills.map(s => ({
          id: s.skill.id,
          name: s.skill.name,
          relevance_score: s.relevance_score,
          confidence: s.confidence
        })),
        execution_results: response.execution_results,
        reasoning: response.reasoning,
        errors: response.errors,
        statistics: {
          total_skills_available: stats.total_skills_available,
          current_phase: stats.current_phase,
          gemini_context: stats.gemini_context_usage,
          conversation: {
            total_entries: snapshot.total_entries,
            total_tokens: snapshot.total_tokens,
            last_phase: snapshot.last_phase
          }
        }
      }),
      {
        status: response.status === 'error' ? 400 : 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );

  } catch (error) {
    console.error("[v0] Error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
});

/**
 * Example Usage:
 * 
 * POST /functions/v1/skillful-agent-example
 * Content-Type: application/json
 * 
 * {
 *   "query": "Create a prospect research brief for Acme Corp's VP of Sales",
 *   "category": "sales",
 *   "parameters": {
 *     "company": "Acme Corp",
 *     "target_title": "VP of Sales"
 *   }
 * }
 * 
 * Response:
 * {
 *   "status": "success",
 *   "message": "...",
 *   "selected_skills": [...],
 *   "execution_results": [...],
 *   "reasoning": "...",
 *   "statistics": {...}
 * }
 */
