import { queryGeminiAI } from "./gemini-ai";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Stream Gemini AI responses directly without any API keys or tokens
 * Maintains compatibility with existing chat stream interface
 */
export async function streamGeminiChat({
  messages,
  customSystemPrompt,
  onDelta,
  onDone,
  onError,
}: {
  messages: ChatMessage[];
  customSystemPrompt?: string;
  onDelta: (deltaText: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  try {
    // Build the complete prompt from messages and system prompt
    let prompt = "";
    
    if (customSystemPrompt) {
      prompt += customSystemPrompt + "\n\n";
    }
    
    // Add conversation history
    for (const message of messages) {
      const role = message.role === "user" ? "User" : "Assistant";
      prompt += `${role}: ${message.content}\n`;
    }
    
    // Query Gemini
    const response = await queryGeminiAI(prompt);
    
    if (response.startsWith("[ERROR")) {
      onError(response);
      return;
    }
    
    // Stream the response character by character
    for (const char of response) {
      onDelta(char);
      // Add minimal delay to allow for proper delta processing
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    
    onDone();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    onError(`Failed to connect to Gemini: ${errorMessage}`);
  }
}

/**
 * Direct query to Gemini without streaming
 * Useful for simple, non-streaming use cases
 */
export async function queryGeminiDirect(prompt: string): Promise<string> {
  try {
    const response = await queryGeminiAI(prompt);
    
    if (response.startsWith("[ERROR")) {
      throw new Error(response);
    }
    
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    throw new Error(`Gemini query failed: ${errorMessage}`);
  }
}

/**
 * Check if Gemini connection is available
 */
export async function checkGeminiConnection(): Promise<boolean> {
  try {
    const testResponse = await queryGeminiAI("ping");
    return !testResponse.startsWith("[ERROR");
  } catch {
    return false;
  }
}
