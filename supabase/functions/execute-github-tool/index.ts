import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  executionTimeMs: number;
  status: "success" | "failed" | "timeout";
}

// Execute JavaScript code safely
async function executeJavaScript(
  code: string,
  params: Record<string, unknown>,
  timeout: number = 120000
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    // Create a function from the code
    const func = new Function(...Object.keys(params), code);

    // Create a promise that resolves with the function result
    const executionPromise = Promise.resolve(func(...Object.values(params)));

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Execution timeout after ${timeout}ms`)), timeout)
    );

    // Race between execution and timeout
    const result = await Promise.race([executionPromise, timeoutPromise]);

    return {
      success: true,
      output: result,
      status: "success",
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes("timeout");

    return {
      success: false,
      error: errorMessage,
      status: isTimeout ? "timeout" : "failed",
      executionTimeMs: Date.now() - startTime,
    };
  }
}

// Execute Python code via subprocess
async function executePython(
  code: string,
  params: Record<string, unknown>,
  timeout: number = 120000
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    // Create a Python wrapper that passes parameters
    const pythonScript = `
import json
import sys

# Parameters
params = json.loads('''${JSON.stringify(params)}''')

# Execute user code
try:
    ${code}
    result = locals().get('result', None)
    print(json.dumps({"success": True, "output": result}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

    // Write script to temp file
    const scriptPath = `/tmp/tool_script_${Date.now()}.py`;
    await Deno.writeTextFile(scriptPath, pythonScript);

    // Run with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const process = new Deno.Command("python3", {
        args: [scriptPath],
        signal: controller.signal,
      });

      const { success, stdout, stderr } = await process.output();
      clearTimeout(timeoutId);

      // Clean up script
      await Deno.remove(scriptPath).catch(() => {});

      if (!success) {
        const errorMsg = new TextDecoder().decode(stderr);
        return {
          success: false,
          error: errorMsg || "Python execution failed",
          status: "failed",
          executionTimeMs: Date.now() - startTime,
        };
      }

      const output = new TextDecoder().decode(stdout);
      const result = JSON.parse(output);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        status: result.success ? "success" : "failed",
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      await Deno.remove(scriptPath).catch(() => {});
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes("AbortError");

      return {
        success: false,
        error: errorMessage,
        status: isTimeout ? "timeout" : "failed",
        executionTimeMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      status: "failed",
      executionTimeMs: Date.now() - startTime,
    };
  }
}

// Execute Bash script
async function executeBash(
  code: string,
  params: Record<string, unknown>,
  timeout: number = 120000
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    // Escape parameters for bash
    const envVars = Object.entries(params)
      .map(([key, value]) => `${key}='${String(value).replace(/'/g, "'\"'\"'")}'`)
      .join("\n");

    const bashScript = `#!/bin/bash\n${envVars}\n${code}`;

    // Write script to temp file
    const scriptPath = `/tmp/tool_script_${Date.now()}.sh`;
    await Deno.writeTextFile(scriptPath, bashScript);
    await Deno.chmod(scriptPath, 0o755);

    // Run with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const process = new Deno.Command("bash", {
        args: [scriptPath],
        signal: controller.signal,
      });

      const { success, stdout, stderr } = await process.output();
      clearTimeout(timeoutId);

      // Clean up script
      await Deno.remove(scriptPath).catch(() => {});

      const output = new TextDecoder().decode(stdout);
      const error = new TextDecoder().decode(stderr);

      return {
        success,
        output: output || (success ? "Script executed successfully" : error),
        error: error || undefined,
        status: success ? "success" : "failed",
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      await Deno.remove(scriptPath).catch(() => {});
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes("AbortError");

      return {
        success: false,
        error: errorMessage,
        status: isTimeout ? "timeout" : "failed",
        executionTimeMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      status: "failed",
      executionTimeMs: Date.now() - startTime,
    };
  }
}

// Execute Go code
async function executeGo(
  code: string,
  params: Record<string, unknown>,
  timeout: number = 120000
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    const goCode = `
package main

import (
  "fmt"
  "encoding/json"
)

func main() {
  ${code}
}
`;

    // Write to temp file
    const filePath = `/tmp/tool_${Date.now()}.go`;
    await Deno.writeTextFile(filePath, goCode);

    // Compile and run
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const process = new Deno.Command("go", {
        args: ["run", filePath],
        signal: controller.signal,
      });

      const { success, stdout, stderr } = await process.output();
      clearTimeout(timeoutId);

      // Clean up
      await Deno.remove(filePath).catch(() => {});

      const output = new TextDecoder().decode(stdout);
      const error = new TextDecoder().decode(stderr);

      return {
        success,
        output: output || (success ? "Go program executed" : error),
        error: error || undefined,
        status: success ? "success" : "failed",
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      await Deno.remove(filePath).catch(() => {});
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes("AbortError");

      return {
        success: false,
        error: errorMessage,
        status: isTimeout ? "timeout" : "failed",
        executionTimeMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      status: "failed",
      executionTimeMs: Date.now() - startTime,
    };
  }
}

// Main dispatcher
async function executeGitHubTool(
  language: string,
  code: string,
  params: Record<string, unknown>,
  timeout: number = 120000
): Promise<ExecutionResult> {
  switch (language) {
    case "javascript":
      return executeJavaScript(code, params, timeout);
    case "python":
      return executePython(code, params, timeout);
    case "bash":
      return executeBash(code, params, timeout);
    case "go":
      return executeGo(code, params, timeout);
    default:
      return {
        success: false,
        error: `Unsupported language: ${language}`,
        status: "failed",
        executionTimeMs: 0,
      };
  }
}

// Helper to get tool stats
async function getToolStats(toolId: string) {
  const { data, error } = await supabase
    .from("execution_logs")
    .select("execution_time_ms, status")
    .eq("tool_id", toolId);

  if (error) return null;

  return {
    totalExecutions: data?.length || 0,
    successCount: data?.filter((d) => d.status === "success").length || 0,
    failureCount: data?.filter((d) => d.status === "failed").length || 0,
    timeoutCount: data?.filter((d) => d.status === "timeout").length || 0,
    avgExecutionTime: data && data.length > 0
      ? Math.round(
          data.reduce((sum, d) => sum + (d.execution_time_ms || 0), 0) / data.length
        )
      : 0,
  };
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { tool_id, params, useCache } = await req.json();

    if (!tool_id) {
      return new Response(JSON.stringify({ error: "Missing tool_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get tool from database
    const { data: tool, error: toolError } = await supabase
      .from("github_tools")
      .select("*")
      .eq("id", tool_id)
      .single();

    if (toolError || !tool) {
      return new Response(JSON.stringify({ error: "Tool not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Execute the tool
    console.log(`[v0] Executing GitHub tool: ${tool.name}`);
    const result = await executeGitHubTool(
      tool.language,
      tool.source_code,
      params || {},
      tool.metadata?.timeout || 120000
    );

    // Get stats
    const stats = await getToolStats(tool_id);

    return new Response(
      JSON.stringify({
        success: result.success,
        output: result.output,
        error: result.error,
        status: result.status,
        executionTimeMs: result.executionTimeMs,
        cached: false,
        stats,
      }),
      {
        status: result.success ? 200 : 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Execution failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
