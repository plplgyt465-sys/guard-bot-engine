import { NextRequest, NextResponse } from "next/server";
import { importToolFromGitHub } from "@/lib/github-tools-discovery";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repoUrl, filePath, customName } = body;

    // Validate input
    if (!repoUrl || !filePath) {
      return NextResponse.json(
        { error: "Missing required fields: repoUrl and filePath" },
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

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    // Import tool from GitHub
    const toolInfo = await importToolFromGitHub(repoUrl, filePath, customName);

    // Save to database
    const { data, error } = await supabase
      .from("github_tools")
      .insert({
        name: toolInfo.name,
        description: toolInfo.description,
        repo_url: toolInfo.repoUrl,
        repo_owner: toolInfo.repoOwner,
        repo_name: toolInfo.repoName,
        file_path: toolInfo.filePath,
        language: toolInfo.language,
        source_code: toolInfo.sourceCode,
        code_hash: toolInfo.codeHash,
        metadata: toolInfo.metadata,
        is_verified: toolInfo.isVerified,
        verification_status: toolInfo.isVerified ? "verified" : "pending",
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to save tool to database" },
        { status: 500 }
      );
    }

    // Also add to custom_tools table
    await supabase.from("custom_tools").insert({
      name: toolInfo.name,
      description: toolInfo.description,
      function_schema: toolInfo.metadata,
      source_type: "github",
      github_tool_id: data.id,
      is_github_source: true,
      created_by: user.id,
    });

    return NextResponse.json({
      success: true,
      tool: data,
      message: "Tool imported successfully",
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
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

    // Get user's imported tools
    const { data, error } = await supabase
      .from("github_tools")
      .select("*")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      tools: data,
    });
  } catch (error) {
    console.error("Fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tools" },
      { status: 500 }
    );
  }
}
