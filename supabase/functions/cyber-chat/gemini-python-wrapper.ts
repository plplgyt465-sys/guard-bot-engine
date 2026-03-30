// Wrapper to execute Gemini Python script from Deno/Node.js environment
import { spawn } from "child_process";
import { promisify } from "util";

const exec = promisify(require("child_process").exec);

export async function executeGeminiPython(messages: any[]): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Prepare messages for Python script
      const messagesJson = JSON.stringify(messages);
      
      // Spawn Python process
      const pythonProcess = spawn("python3", ["./src/utils/gemini-client.py"], {
        cwd: process.cwd(),
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      pythonProcess.stdin?.write(messagesJson);
      pythonProcess.stdin?.end();

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Python script failed: ${stderr || stdout}`));
        }
      });

      pythonProcess.on("error", (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}
