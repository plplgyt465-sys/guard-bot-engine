import { NextRequest, NextResponse } from "next/server";
import {
  executeGitHubTool,
  logExecution,
  getToolStats,
} from "@/lib/github-tools-executor";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// Helper to hash input for caching
function hashInput(input: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

// Helper to check cache
async function getFromCache(toolId: string, inputHash: string) {
  const { data, error } = await supabase
    .from("tool_cache")
    .select("output")
    .eq("tool_id", toolId)
    .eq("input_hash", inputHash)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) return null;
  return data.output;
}

// Helper to save to cache
async function saveToCache(
  toolId: string,
  inputHash: string,
  output: unknown,
  ttlMinutes: number = 60
) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await supabase.from("tool_cache").upsert(
    {
      tool_id: toolId,
      input_hash: inputHash,
      output,
      expires_at: expiresAt,
    },
    { onConflict: "tool_id, input_hash" }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { toolId, params = {}, useCache = true, cacheTtl = 60 } = body;

    // Validate input
    if (!toolId) {
      return NextResponse.json(
        { error: "Missing toolId" },
        { status: 400 }
      );
    }

    // Get user from request
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    // Get tool from database
    const { data: tool, error: toolError } = await supabase
      .from("github_tools")
      .select("*")
      .eq("id", toolId)
      .single();

    if (toolError || !tool) {
      return NextResponse.json(
        { error: "Tool not found" },
        { status: 404 }
      );
    }

    // Check cache if enabled
    const inputHash = hashInput(params);
    let cachedOutput = null;

    if (useCache) {
      cachedOutput = await getFromCache(toolId, inputHash);
      if (cachedOutput) {
        console.log("[v0] Cache hit for tool:", toolId);
        return NextResponse.json({
          success: true,
          output: cachedOutput,
          cached: true,
          executionTimeMs: 0,
        });
      }
    }

    // Execute the tool
    console.log("[v0] Executing tool:", tool.name, "with params:", params);
    const result = await executeGitHubTool(
      tool.language,
      tool.source_code,
      params,
      tool.metadata?.timeout || 120000
    );

    // Log execution
    await logExecution(toolId, user.id, params, result);

    // Cache successful results
    if (result.success && useCache) {
      await saveToCache(toolId, inputHash, result.output, cacheTtl);
    }

    // Get tool stats
    const stats = await getToolStats(toolId);

    return NextResponse.json({
      success: result.success,
      output: result.output,
      error: result.error,
      status: result.status,
      executionTimeMs: result.executionTimeMs,
      cached: false,
      stats,
    });
  } catch (error) {
    console.error("Execution error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Execution failed" },
      { status: 500 }
    );
  }
}

// Get tool information
export async function GET(request: NextRequest) {
  try {
    const toolId = request.nextUrl.searchParams.get("toolId");

    if (!toolId) {
      return NextResponse.json(
        { error: "Missing toolId" },
        { status: 400 }
      );
    }

    // Get tool
    const { data: tool, error } = await supabase
      .from("github_tools")
      .select("*")
      .eq("id", toolId)
      .single();

    if (error || !tool) {
      return NextResponse.json(
        { error: "Tool not found" },
        { status: 404 }
      );
    }

    // Get stats
    const stats = await getToolStats(toolId);

    return NextResponse.json({
      success: true,
      tool,
      stats,
    });
  } catch (error) {
    console.error("Fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tool" },
      { status: 500 }
    );
  }
}
