import crypto from "crypto";

export interface ToolMetadata {
  params: Record<string, { type: string; description?: string; required?: boolean }>;
  returns?: { type: string; description?: string };
  timeout?: number; // milliseconds
  dependencies?: string[];
  description?: string;
}

export interface GitHubToolInfo {
  name: string;
  description: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  filePath: string;
  language: "javascript" | "python" | "bash" | "go";
  sourceCode: string;
  codeHash: string;
  metadata: ToolMetadata;
  isVerified: boolean;
}

// Detect language from file extension
export function detectLanguage(filePath: string): "javascript" | "python" | "bash" | "go" {
  if (filePath.endsWith(".js") || filePath.endsWith(".ts") || filePath.endsWith(".mjs")) return "javascript";
  if (filePath.endsWith(".py")) return "python";
  if (filePath.endsWith(".sh") || filePath.endsWith(".bash")) return "bash";
  if (filePath.endsWith(".go")) return "go";
  throw new Error(`Unsupported file type: ${filePath}`);
}

// Extract metadata from code comments
export function extractMetadata(code: string, language: string): ToolMetadata {
  const metadata: ToolMetadata = {
    params: {},
    timeout: 120000, // Default 120 seconds
  };

  if (language === "javascript" || language === "python") {
    // Look for JSDoc/docstring style comments
    const docRegex = language === "javascript"
      ? /\/\*\*[\s\S]*?\*\//
      : /"""[\s\S]*?"""|'''[\s\S]*?'''/;

    const docMatch = code.match(docRegex);
    if (docMatch) {
      const doc = docMatch[0];

      // Extract description
      const descMatch = doc.match(/@description\s+(.+)$/m);
      if (descMatch) metadata.description = descMatch[1].trim();

      // Extract parameters
      const paramMatches = doc.matchAll(/@param\s+\{(.+?)\}\s+(\w+)\s*-?\s*(.+)$/gm);
      for (const match of paramMatches) {
        const [, type, name, description] = match;
        metadata.params[name] = {
          type: type.trim(),
          description: description.trim(),
          required: true,
        };
      }

      // Extract returns
      const returnMatch = doc.match(/@returns?\s+\{(.+?)\}\s*-?\s*(.+)$/m);
      if (returnMatch) {
        metadata.returns = {
          type: returnMatch[1].trim(),
          description: returnMatch[2].trim(),
        };
      }

      // Extract timeout
      const timeoutMatch = doc.match(/@timeout\s+(\d+)/);
      if (timeoutMatch) {
        metadata.timeout = parseInt(timeoutMatch[1]);
      }
    }
  }

  return metadata;
}

// Fetch file from GitHub raw content
export async function fetchGitHubFile(
  owner: string,
  repo: string,
  filePath: string,
  ref: string = "main"
): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch file from GitHub: ${response.statusText}`);
  }

  return response.text();
}

// Verify repository exists and is accessible
export async function verifyGitHubRepo(owner: string, repo: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Check if file exists in repository
export async function fileExistsInRepo(
  owner: string,
  repo: string,
  filePath: string,
  ref: string = "main"
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

// Calculate code hash for detecting changes
export function calculateCodeHash(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// Validate code for security issues
export async function validateCodeSecurity(code: string, language: string): Promise<{ safe: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check for dangerous patterns
  const dangerousPatterns = {
    javascript: [
      /eval\s*\(/i,
      /Function\s*\(/i,
      /innerHTML\s*=/i,
      /process\.exit/i,
      /child_process/,
    ],
    python: [
      /exec\s*\(/i,
      /eval\s*\(/i,
      /subprocess\.call.*shell\s*=\s*True/i,
      /os\.system/i,
      /pickle\.loads/i,
    ],
    bash: [
      /rm\s+-rf\s+\//,
      /dd\s+if=\/dev\/zero/,
    ],
    go: [
      /os\/exec\.Command/,
    ],
  };

  const patterns = dangerousPatterns[language as keyof typeof dangerousPatterns] || [];
  for (const pattern of patterns) {
    if (pattern.test(code)) {
      issues.push(`Potentially dangerous pattern detected: ${pattern.source}`);
    }
  }

  return {
    safe: issues.length === 0,
    issues,
  };
}

// Parse GitHub URL and extract owner/repo/path
export function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  filePath?: string;
  ref?: string;
} | null {
  const patterns = [
    // https://github.com/owner/repo/blob/ref/path/to/file
    /https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/,
    // https://github.com/owner/repo/tree/ref/path/to/file
    /https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/,
    // https://github.com/owner/repo (for finding tools)
    /https:\/\/github\.com\/([^/]+)\/([^/]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      if (match[4]) {
        return {
          owner: match[1],
          repo: match[2],
          ref: match[3],
          filePath: match[4],
        };
      } else {
        return {
          owner: match[1],
          repo: match[2],
        };
      }
    }
  }

  return null;
}

// Import tool from GitHub
export async function importToolFromGitHub(
  repoUrl: string,
  filePath: string,
  customName?: string
): Promise<GitHubToolInfo> {
  // Parse URL
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub URL");
  }

  const { owner, repo, ref = "main" } = parsed;

  // Verify repo exists
  const repoExists = await verifyGitHubRepo(owner, repo);
  if (!repoExists) {
    throw new Error(`Repository not found: ${owner}/${repo}`);
  }

  // Verify file exists
  const fileExists = await fileExistsInRepo(owner, repo, filePath, ref);
  if (!fileExists) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Fetch file content
  const sourceCode = await fetchGitHubFile(owner, repo, filePath, ref);

  // Detect language
  const language = detectLanguage(filePath);

  // Extract metadata
  const metadata = extractMetadata(sourceCode, language);

  // Validate security
  const securityCheck = await validateCodeSecurity(sourceCode, language);

  // Calculate hash
  const codeHash = calculateCodeHash(sourceCode);

  // Extract tool name from file or use custom name
  const toolName = customName || filePath.split("/").pop()?.replace(/\.[^.]+$/, "") || "imported-tool";

  return {
    name: toolName,
    description: metadata.description || `Imported from ${owner}/${repo}`,
    repoUrl,
    repoOwner: owner,
    repoName: repo,
    filePath,
    language,
    sourceCode,
    codeHash,
    metadata,
    isVerified: securityCheck.safe,
  };
}
