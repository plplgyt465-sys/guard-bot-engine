import requests
import json
import urllib.parse

URL = "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate"

HEADERS = {
    "accept": "*/*",
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    "x-same-domain": "1",
    "cookie": ""  # waywaaa
}


def build_payload(prompt):
    inner = [
        [prompt, 0, None, None, None, None, 0],
        ["en-US"],
        ["", "", "", None, None, None, None, None, None, ""],
        "", "", None, [0], 1, None, None, 1, 0,
        None, None, None, None, None, [[0]], 0
    ]

    outer = [None, json.dumps(inner)]

    return urllib.parse.urlencode({
        "f.req": json.dumps(outer)
    }) + "&"


def parse_response(text):
    text = text.replace(")]}'", "")
    best = ""

    for line in text.splitlines():
        if "wrb.fr" not in line:
            continue

        try:
            data = json.loads(line)
        except:
            continue

        entries = []
        if isinstance(data, list):
            if data[0] == "wrb.fr":
                entries = [data]
            else:
                entries = [i for i in data if isinstance(i, list) and i[0] == "wrb.fr"]

        for entry in entries:
            try:
                inner = json.loads(entry[2])

                if isinstance(inner, list) and isinstance(inner[4], list):
                    for c in inner[4]:
                        if isinstance(c, list) and isinstance(c[1], list):
                            txt = "".join([t for t in c[1] if isinstance(t, str)])
                            if len(txt) > len(best):
                                best = txt
            except:
                continue

    return best.strip()


def ask(prompt):
    payload = build_payload(prompt)

    res = requests.post(URL, headers=HEADERS, data=payload)

    if res.status_code != 200:
        return f"[ERROR {res.status_code}]"

    return parse_response(res.text) or "[No response]"


// TypeScript wrapper for Node.js/TypeScript environment
export async function queryGeminiAI(prompt: string): Promise<string> {
    const URL = "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";
    
    const HEADERS = {
        "accept": "*/*",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "x-same-domain": "1",
        "cookie": ""
    };

    function buildPayload(userPrompt: string): string {
        const inner = [
            [userPrompt, 0, null, null, null, null, 0],
            ["en-US"],
            ["", "", "", null, null, null, null, null, null, ""],
            "", "", null, [0], 1, null, null, 1, 0,
            null, null, null, null, null, [[0]], 0
        ];

        const outer = [null, JSON.stringify(inner)];

        const params = new URLSearchParams();
        params.append("f.req", JSON.stringify(outer));
        return params.toString() + "&";
    }

    function parseResponse(text: string): string {
        text = text.replace(")]}'", "");
        let best = "";

        for (const line of text.split("\n")) {
            if (!line.includes("wrb.fr")) continue;

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
                                    const txt = c[1].filter((t: any) => typeof t === "string").join("");
                                    if (txt.length > best.length) {
                                        best = txt;
                                    }
                                }
                            }
                        }
                    } catch {
                        continue;
                    }
                }
            } catch {
                continue;
            }
        }

        return best.trim();
    }

    try {
        const payload = buildPayload(prompt);
        
        const response = await fetch(URL, {
            method: "POST",
            headers: HEADERS,
            body: payload
        });

        if (!response.ok) {
            return `[ERROR ${response.status}]`;
        }

        const text = await response.text();
        const result = parseResponse(text);
        
        return result || "[No response]";
    } catch (error) {
        console.error("Gemini AI Error:", error);
        return `[ERROR: ${error instanceof Error ? error.message : "Unknown error"}]`;
    }
}

export interface GeminiMessage {
    role: "user" | "assistant";
    content: string;
}

/**
 * Stream-based Gemini AI query
 * Directly connects to Google's Gemini without any API keys or tokens required
 */
export async function streamGeminiAI(
    prompt: string,
    onDelta: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
): Promise<void> {
    try {
        const response = await queryGeminiAI(prompt);
        
        // Stream the response character by character
        for (const char of response) {
            onDelta(char);
            // Small delay to simulate streaming
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        
        onComplete();
    } catch (error) {
        onError(error instanceof Error ? error.message : "Unknown error");
    }
}
