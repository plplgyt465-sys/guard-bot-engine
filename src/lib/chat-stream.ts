import { getAIProviderSettings } from "./ai-providers";
import { callGeminiPython } from "./gemini-wrapper";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cyber-chat`;

export async function streamChat({
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
  const providerSettings = await getAIProviderSettings();

  // Check if using Gemini Python (no API key needed)
  if (providerSettings?.providerId === "gemini" || !providerSettings) {
    try {
      const response = await callGeminiPython(messages as any);
      if (response.success && response.content) {
        // Stream the response character by character for consistency
        for (const char of response.content) {
          onDelta(char);
          await new Promise(resolve => setTimeout(resolve, 10)); // Small delay for streaming effect
        }
        onDone();
      } else {
        onError(response.error || "فشل الحصول على رد من Gemini");
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "خطأ في التواصل مع Gemini");
    }
    return;
  }

  const body: any = { messages, customSystemPrompt };

  // Build allProviderKeys from ALL providers that have keys, regardless of enabled state
  const allProviderKeys: { providerId: string; keys: string[] }[] = [];
  if (providerSettings) {
    for (const [pid, keys] of Object.entries(providerSettings.providerKeys || {})) {
      const validKeys = (keys || []).filter(k => k.key.trim()).map(k => k.key);
      if (validKeys.length > 0) {
        allProviderKeys.push({ providerId: pid, keys: validKeys });
      }
    }
  }

  if (providerSettings && providerSettings.enabled) {
    const activeKeys = (providerSettings.providerKeys?.[providerSettings.providerId] || []).filter(k => k.key.trim());
    if (activeKeys.length > 0) {
      allProviderKeys.sort((a, b) => a.providerId === providerSettings.providerId ? -1 : b.providerId === providerSettings.providerId ? 1 : 0);
      body.customProvider = {
        providerId: providerSettings.providerId,
        modelId: providerSettings.modelId,
        apiKey: activeKeys[0].key,
        apiKeys: activeKeys.map(k => k.key),
        allProviderKeys,
      };
    }
  } else if (allProviderKeys.length > 0) {
    // Custom provider disabled but keys exist - send as fallback when default fails
    body.fallbackProviderKeys = allProviderKeys;
  }

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    onError(data.error || "فشل الاتصال بالوكيل");
    return;
  }

  if (!resp.body) {
    onError("لا يوجد استجابة");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamDone = true;
        break;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}
