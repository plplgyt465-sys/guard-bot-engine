import { supabase } from "@/integrations/supabase/client";

export interface AIProvider {
  id: string;
  name: string;
  nameAr: string;
  baseUrl: string;
  apiKeyUrl: string;
  models: { id: string; name: string }[];
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "gemini",
    name: "Gemini (Python)",
    nameAr: "جيميني (بايثون)",
    baseUrl: "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate",
    apiKeyUrl: "https://support.google.com/gemini/answer/13584499",
    models: [
      { id: "gemini-python", name: "Gemini (Unofficial Python Script)" },
    ],
  },
];

// Security API providers (VirusTotal, Shodan, etc.)
export interface SecurityAPIProvider {
  id: string;
  name: string;
  nameAr: string;
  apiKeyUrl: string;
  description: string;
}

export const SECURITY_API_PROVIDERS: SecurityAPIProvider[] = [
  {
    id: "virustotal",
    name: "VirusTotal",
    nameAr: "فايروس توتال",
    apiKeyUrl: "https://www.virustotal.com/gui/my-apikey",
    description: "فحص URLs والنطاقات و IPs من البرمجيات الخبيثة",
  },
];

export interface APIKeyEntry {
  key: string;
  label: string;
  status?: "unknown" | "valid" | "invalid" | "no_balance";
  balance?: string;
  lastChecked?: number;
}

// Keys stored per provider: { "openai": [...], "groq": [...], ... }
export type ProviderKeysMap = Record<string, APIKeyEntry[]>;

export interface AIProviderSettings {
  providerId: string;
  modelId: string;
  apiKey: string;
  apiKeys: APIKeyEntry[]; // active provider's keys (derived)
  providerKeys: ProviderKeysMap; // all providers' keys
  enabled: boolean;
}

// ---- Database-backed persistence ----

export async function getAIProviderSettings(): Promise<AIProviderSettings | null> {
  try {
    const { data, error } = await supabase
      .from("ai_provider_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const raw = data.api_keys as unknown;
    let providerKeys: ProviderKeysMap = {};

    // Migration: if old format (flat array), convert to new per-provider map
    if (Array.isArray(raw)) {
      providerKeys[data.provider_id] = raw as APIKeyEntry[];
    } else if (raw && typeof raw === "object") {
      providerKeys = raw as ProviderKeysMap;
    }

    const activeKeys = providerKeys[data.provider_id] || [];

    return {
      providerId: data.provider_id,
      modelId: data.model_id,
      apiKey: activeKeys[0]?.key || "",
      apiKeys: activeKeys,
      providerKeys,
      enabled: data.enabled,
    };
  } catch {
    return null;
  }
}

export async function saveAIProviderSettings(settings: AIProviderSettings) {
  const activeKeys = settings.providerKeys[settings.providerId] || [];
  settings.apiKey = activeKeys[0]?.key || "";
  settings.apiKeys = activeKeys;

  const row = {
    provider_id: settings.providerId,
    model_id: settings.modelId,
    api_keys: settings.providerKeys as any,
    enabled: settings.enabled,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("ai_provider_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("ai_provider_settings")
      .update(row)
      .eq("id", existing.id);
  } else {
    await supabase
      .from("ai_provider_settings")
      .insert(row);
  }
}

export async function clearAIProviderSettings() {
  await supabase.from("ai_provider_settings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

export async function updateKeyStatus(keyIndex: number, status: APIKeyEntry["status"], balance?: string) {
  try {
    const settings = await getAIProviderSettings();
    if (!settings) return;
    const activeKeys = settings.providerKeys[settings.providerId] || [];
    if (!activeKeys[keyIndex]) return;
    activeKeys[keyIndex].status = status;
    activeKeys[keyIndex].balance = balance;
    activeKeys[keyIndex].lastChecked = Date.now();
    settings.providerKeys[settings.providerId] = activeKeys;
    await saveAIProviderSettings(settings);
  } catch {}
}
