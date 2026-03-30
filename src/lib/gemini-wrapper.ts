import { spawn } from 'child_process';
import path from 'path';

export interface GeminiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface GeminiResponse {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Call Gemini directly through the Python script
 * No API keys needed - connects directly to Google's Gemini service
 */
export async function callGeminiPython(messages: GeminiMessage[]): Promise<GeminiResponse> {
  return new Promise((resolve) => {
    try {
      // Get the last user message as the prompt
      const lastUserMessage = messages
        .filter(m => m.role === 'user')
        .slice(-1)[0]?.content || '';

      if (!lastUserMessage) {
        resolve({ success: false, error: 'No user message provided' });
        return;
      }

      const pythonScript = path.join(process.cwd(), 'src', 'utils', 'gemini.py');
      
      const python = spawn('python3', [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000, // 60 second timeout
      });

      let output = '';
      let errorOutput = '';

      python.stdout?.on('data', (data) => {
        output += data.toString();
      });

      python.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          // Remove the "Bot: " prefix if present
          const result = output.replace(/^Bot:\s*/, '').trim();
          resolve({ success: true, content: result });
        } else {
          resolve({
            success: false,
            error: errorOutput || `Python script exited with code ${code}`,
          });
        }
      });

      python.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to execute Python script: ${error.message}`,
        });
      });

      // Send the prompt to stdin (simulating user input)
      python.stdin?.write(lastUserMessage + '\n');
      python.stdin?.write('exit\n'); // Send exit command to close the chat loop
      python.stdin?.end();

      // Set a timeout in case the process hangs
      setTimeout(() => {
        python.kill();
        resolve({
          success: false,
          error: 'Python script execution timeout',
        });
      }, 65000);
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
