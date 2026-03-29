import requests from 'node:http';
import urllib from 'node:url';

const URL = "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";

const HEADERS = {
  "accept": "*/*",
  "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
  "x-same-domain": "1",
  "cookie": "" // Add your cookie here if needed
};

function buildPayload(prompt: string): string {
  const inner = [
    [prompt, 0, null, null, null, null, 0],
    ["en-US"],
    ["", "", "", null, null, null, null, null, null, ""],
    "", "", null, [0], 1, null, null, 1, 0,
    null, null, null, null, null, [[0]], 0
  ];

  const outer = [null, JSON.stringify(inner)];

  return new URLSearchParams({
    "f.req": JSON.stringify(outer)
  }).toString() + "&";
}

function parseResponse(text: string): string {
  let cleanedText = text.replace(")]}'", "");
  let best = "";

  for (const line of cleanedText.split('\n')) {
    if (!line.includes("wrb.fr")) {
      continue;
    }

    try {
      const data = JSON.parse(line);
      let entries = [];
      
      if (Array.isArray(data)) {
        if (data[0] === "wrb.fr") {
          entries = [data];
        } else {
          entries = data.filter((i: any) => Array.isArray(i) && i[0] === "wrb.fr");
        }
      }

      for (const entry of entries) {
        try {
          const inner = JSON.parse(entry[2]);

          if (Array.isArray(inner) && Array.isArray(inner[4])) {
            for (const c of inner[4]) {
              if (Array.isArray(c) && Array.isArray(c[1])) {
                const txt = c[1]
                  .filter((t: any) => typeof t === 'string')
                  .join('');
                if (txt.length > best.length) {
                  best = txt;
                }
              }
            }
          }
        } catch {}
      }
    } catch {}
  }

  return best.trim();
}

export async function askGemini(prompt: string): Promise<string> {
  const payload = buildPayload(prompt);

  try {
    const response = await fetch(URL, {
      method: 'POST',
      headers: HEADERS,
      body: payload
    });

    if (response.status !== 200) {
      return `[ERROR ${response.status}]`;
    }

    const text = await response.text();
    return parseResponse(text) || "[No response]";
  } catch (error) {
    return `[Error: ${error instanceof Error ? error.message : 'Unknown error'}]`;
  }
}
