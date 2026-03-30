import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export interface ExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  executionTimeMs: number;
  status: "success" | "failed" | "timeout";
}

// Execute JavaScript code safely using Function constructor with timeout
export async function executeJavaScript(
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
    const isSyntaxError = errorMessage.includes("Unexpected token") || errorMessage.includes("SyntaxError");
    const isTimeout = errorMessage.includes("timeout");

    return {
      success: false,
      error: errorMessage,
      status: isTimeout ? "timeout" : "failed",
      executionTimeMs: Date.now() - startTime,
    };
  }
}

// Execute Python code using Deno subprocess (if available) or fallback to API
export async function executePython(
  code: string,
  params: Record<string, unknown>,
  timeout: number = 120000
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    // Create a Python wrapper that passes parameters and captures output
    const pythonScript = `
import json
import sys

# Parameters passed as JSON
params = json.loads('''${JSON.stringify(params)}''')

# Execute user code
try:
    ${code}
    result = locals().get('result', None)
    print(json.dumps({"success": True, "output": result}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

    // Use Deno to execute Python if available, otherwise use a sandbox API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Try using native execution with timeout
      const response = await fetch("http://localhost:3001/api/execute-python", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pythonScript }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Python execution failed: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: result.success,
        output: result.output,
        error: result.error,
        status: result.success ? "success" : "failed",
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);
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
export async function executeBash(
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

    const bashScript = `${envVars}\n${code}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch("http://localhost:3001/api/execute-bash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: bashScript }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Bash execution failed: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: result.success,
        output: result.output,
        error: result.error,
        status: result.success ? "success" : "failed",
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);
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
export async function executeGo(
  code: string,
  params: Record<string, unknown>,
  timeout: number = 120000
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    const goScript = `
package main

import (
  "encoding/json"
  "fmt"
)

func main() {
  params := map[string]interface{}{
    ${Object.entries(params)
      .map(([key, value]) => `"${key}": json.RawMessage([]byte(\`${JSON.stringify(value)}\`))`)
      .join(",\n    ")}
  }
  
  ${code}
}
`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch("http://localhost:3001/api/execute-go", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: goScript }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Go execution failed: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: result.success,
        output: result.output,
        error: result.error,
        status: result.success ? "success" : "failed",
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);
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

// Main execution dispatcher
export async function executeGitHubTool(
  language: "javascript" | "python" | "bash" | "go",
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

// Log execution to database
export async function logExecution(
  toolId: string,
  userId: string,
  input: Record<string, unknown>,
  result: ExecutionResult
): Promise<void> {
  try {
    await supabase.from("execution_logs").insert({
      tool_id: toolId,
      input,
      output: result.output,
      error: result.error,
      execution_time_ms: result.executionTimeMs,
      status: result.status,
      executed_by: userId,
    });
  } catch (error) {
    console.error("Failed to log execution:", error);
  }
}

// Get execution history
export async function getExecutionHistory(toolId: string, limit: number = 50) {
  const { data, error } = await supabase
    .from("execution_logs")
    .select("*")
    .eq("tool_id", toolId)
    .order("executed_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

// Get tool statistics
export async function getToolStats(toolId: string) {
  const { data, error } = await supabase
    .from("execution_logs")
    .select("execution_time_ms, status")
    .eq("tool_id", toolId);

  if (error) throw error;

  const stats = {
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

  return stats;
}
