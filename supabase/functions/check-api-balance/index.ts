import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { providerId, apiKey } = await req.json();
    if (!providerId || !apiKey) {
      return new Response(JSON.stringify({ error: "Missing providerId or apiKey" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let status: "valid" | "invalid" | "no_balance" = "valid";
    let balance: string | null = null;

    if (providerId === "openai") {
      // Test with a minimal request
      const resp = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (resp.status === 401) status = "invalid";
      else if (resp.status === 429) status = "no_balance";
      else if (!resp.ok) status = "invalid";
      else {
        status = "valid";
        balance = "✓ صالح";
      }
    } else if (providerId === "deepseek") {
      // DeepSeek has a balance API
      const resp = await fetch("https://api.deepseek.com/user/balance", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (resp.status === 401) status = "invalid";
      else if (resp.ok) {
        const data = await resp.json();
        const balanceInfo = data.balance_infos?.[0];
        if (balanceInfo) {
          const total = parseFloat(balanceInfo.total_balance || "0");
          balance = `$${total.toFixed(2)}`;
          status = total > 0 ? "valid" : "no_balance";
        } else {
          status = "valid";
          balance = "✓ صالح";
        }
      } else {
        status = "invalid";
      }
    } else if (providerId === "google" || providerId === "gemini") {
      // Test with models list
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (resp.status === 400 || resp.status === 403) status = "invalid";
      else if (resp.ok) { status = "valid"; balance = "✓ صالح"; }
      else status = "invalid";
    } else if (providerId === "anthropic") {
      // Test with a minimal message
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-3-5-haiku-20241022", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
      });
      if (resp.status === 401) status = "invalid";
      else if (resp.status === 429) status = "no_balance";
      else { status = "valid"; balance = "✓ صالح"; }
    } else if (providerId === "groq") {
      const resp = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (resp.status === 401) status = "invalid";
      else if (resp.ok) { status = "valid"; balance = "✓ مجاني"; }
      else status = "invalid";
    } else if (providerId === "xai") {
      const resp = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (resp.status === 401) status = "invalid";
      else if (resp.ok) { status = "valid"; balance = "✓ صالح"; }
      else status = "invalid";
    } else if (providerId === "virustotal") {
      const resp = await fetch("https://www.virustotal.com/api/v3/users/me", {
        headers: { "x-apikey": apiKey },
      });
      if (resp.status === 401 || resp.status === 403) status = "invalid";
      else if (resp.ok) {
        const data = await resp.json();
        const quotas = data?.data?.attributes?.quotas;
        if (quotas?.api_requests_daily) {
          const used = quotas.api_requests_daily.used || 0;
          const allowed = quotas.api_requests_daily.allowed || 500;
          balance = `${used}/${allowed} يومي`;
          status = used < allowed ? "valid" : "no_balance";
        } else {
          status = "valid";
          balance = "✓ صالح";
        }
      } else status = "invalid";
    } else {
      status = "valid";
      balance = "غير متاح";
    }

    return new Response(JSON.stringify({ status, balance }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
