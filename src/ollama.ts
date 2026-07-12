// Local Ollama client — replaces cloud Gemini. No API key, no cloud calls; talks to the
// ollama-engine container on 127.0.0.1:11434. `think:false` keeps qwen fast on modest hardware.

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

export interface OllamaOptions {
  json?: boolean; // ask Ollama to constrain output to a JSON value
  temperature?: number;
  num_predict?: number;
  timeoutMs?: number;
  model?: string;
}

// Single-shot generation against the local Ollama server.
export async function ollamaGenerate(prompt: string, opts: OllamaOptions = {}): Promise<string> {
  const {
    json = false,
    temperature = 0.6,
    num_predict = 512,
    timeoutMs = 120000,
    model = OLLAMA_MODEL,
  } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        think: false,
        ...(json ? { format: "json" } : {}),
        options: { temperature, num_predict },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const data: any = await res.json();
    if (data.error) throw new Error(`ollama: ${data.error}`);
    return (data.response || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

// Parse a JSON array/object out of a model response, tolerating stray prose or code fences.
export function extractJson<T = any>(text: string): T {
  let t = text.trim();
  if (t.includes("```")) {
    const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) t = m[1].trim();
  }
  try {
    return JSON.parse(t) as T;
  } catch {
    const arr = t.match(/\[[\s\S]*\]/);
    if (arr) return JSON.parse(arr[0]) as T;
    const obj = t.match(/\{[\s\S]*\}/);
    if (obj) return JSON.parse(obj[0]) as T;
    throw new Error("no JSON found in model output");
  }
}

// Is the local Ollama server reachable?
export async function ollamaHealthy(timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function ollamaInfo() {
  return { url: OLLAMA_URL, model: OLLAMA_MODEL };
}
