import ReactMarkdown from "react-markdown";
import { Shield, User, Copy, Check } from "lucide-react";
import { useState, useMemo } from "react";
import type { ChatMessage as ChatMsg } from "@/lib/chat-stream";
import { SecurityScore } from "@/components/SecurityScore";
import { ScanProgressBar } from "@/components/ScanProgressBar";

interface ChatMessageProps {
  message: ChatMsg;
  isStreaming?: boolean;
}

function parseSecurityScore(content: string): number | null {
  const match = content.match(/<!--SECURITY_SCORE:(\d+)-->/);
  return match ? parseInt(match[1]) : null;
}

function parseProgress(content: string): { step: number; tools: string[]; phase?: string } | null {
  // Match step number: <!--STEP:123--> or [PHASE] Step 123
  const stepMatch = content.match(/<!--STEP:(\d+)-->/) || content.match(/\[(\w+)\]\s*Step\s*(\d+)/);
  if (!stepMatch) return null;
  
  const step = parseInt(stepMatch[2] || stepMatch[1]);
  const phaseMatch = content.match(/\[(\w+)\]\s*Step/);
  const phase = phaseMatch ? phaseMatch[1] : undefined;
  
  // Extract tool names from execution lines
  const toolMatches = content.match(/⚡\s*(?:\*\*)?(?:الخطوة|Step)\s*\d+\s*[-–]\s*(?:تنفيذ|Execute)[:\s]*(?:\*\*)?\s*(.+)/gi) || [];
  const tools = toolMatches.flatMap(m => {
    const inner = m.match(/(?:تنفيذ|Execute)[:\s]*(?:\*\*)?\s*(.+)/i);
    return inner ? inner[1].split(/[,،]/).map(t => t.trim()).filter(Boolean) : [];
  });
  
  return { step, tools, phase };
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";
  const securityScore = useMemo(() => parseSecurityScore(message.content), [message.content]);
  const progress = useMemo(() => isStreaming ? parseProgress(message.content) : null, [message.content, isStreaming]);
  
  // Clean hidden tags from display
  const displayContent = useMemo(() => 
    message.content
      .replace(/<!--SECURITY_SCORE:\d+-->/g, "")
      .replace(/<!--STEP:\d+-->/g, ""),
    [message.content]
  );

  return (
    <div className={`flex gap-3 animate-matrix-fade ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border ${
          isUser
            ? "bg-muted border-border"
            : "bg-primary/10 border-primary/30 animate-pulse-glow"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-muted-foreground" />
        ) : (
          <Shield className="w-4 h-4 text-primary" />
        )}
      </div>

      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-muted border border-border"
            : "bg-card border border-border"
        }`}
      >
        {isUser ? (
          <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none text-card-foreground">
            {progress && isStreaming && (
              <ScanProgressBar
                currentStep={progress.step}
                toolsExecuted={progress.tools}
                currentPhase={progress.phase}
              />
            )}
            <ReactMarkdown
              components={{
                a({ href, children, ...props }) {
                  const isDownload = href?.includes('/file-proxy?');
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={isDownload ? true : undefined}
                      className={`${isDownload ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 no-underline font-medium text-xs transition-colors' : 'text-primary underline hover:text-primary/80'}`}
                      {...props}
                    >
                      {children}
                    </a>
                  );
                },
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match;
                  if (isInline) {
                    return (
                      <code className="bg-muted px-1.5 py-0.5 rounded text-primary text-xs font-mono" {...props}>
                        {children}
                      </code>
                    );
                  }
                  return (
                    <CodeBlock language={match[1]}>
                      {String(children).replace(/\n$/, "")}
                    </CodeBlock>
                  );
                },
                pre({ children }) {
                  return <>{children}</>;
                },
              }}
            >
              {displayContent}
            </ReactMarkdown>
            {securityScore !== null && <SecurityScore score={securityScore} />}
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-primary ml-1 animate-typing-cursor" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ... keep existing code (CodeBlock component)
function CodeBlock({ children, language }: { children: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="cyber-code-block my-3">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs text-primary font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-primary transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto">
        <code className="text-xs font-mono text-foreground">{children}</code>
      </pre>
    </div>
  );
}
