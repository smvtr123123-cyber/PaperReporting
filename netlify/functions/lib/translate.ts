import Anthropic from "@anthropic-ai/sdk";

export interface TranslationInput {
  key: string;
  title: string;
  abstract: string;
}

export interface TranslationOutput {
  key: string;
  titleKo: string;    // 한국어 제목
  abstractKo: string; // 초록 한국어 번역
  summaryKo: string;  // 2~3문장 핵심 요약
}

const SYSTEM =
  "당신은 학술 논문 전문 번역가입니다. 영어 논문의 제목과 초록(Abstract)을 " +
  "학술 용어를 정확히 살려 자연스러운 한국어로 번역합니다. " +
  "전문 용어는 필요 시 괄호로 원어를 병기합니다. 과장 없이 원문에 충실하게 번역하세요.";

function buildInstruction(inputs: TranslationInput[]): string {
  const payload = inputs.map((p) => ({
    key: p.key,
    title: p.title,
    abstract: p.abstract.slice(0, 4000),
  }));
  return (
    "다음 JSON 배열의 각 논문에 대해 한국어 번역과 요약을 만들어 주세요.\n" +
    "각 항목에 대해 아래 필드를 채운 JSON 배열만 출력하세요(설명·마크다운 금지):\n" +
    '[{"key": "...", "titleKo": "한국어 제목", "abstractKo": "초록 전체 한국어 번역", ' +
    '"summaryKo": "핵심 결과를 2~3문장으로 요약"}]\n\n' +
    "입력:\n" +
    JSON.stringify(payload)
  );
}

// 프로바이더 자동 선택: GEMINI_API_KEY 가 있으면 Gemini, 없으면 Anthropic.
export async function translatePapers(
  inputs: TranslationInput[]
): Promise<Map<string, TranslationOutput>> {
  const out = new Map<string, TranslationOutput>();
  if (inputs.length === 0) return out;

  let parsed: any[];
  if (process.env.GEMINI_API_KEY) {
    parsed = await callGemini(inputs);
  } else if (process.env.ANTHROPIC_API_KEY) {
    parsed = await callClaude(inputs);
  } else {
    throw new Error("GEMINI_API_KEY 또는 ANTHROPIC_API_KEY 중 하나를 설정하세요.");
  }

  for (const item of parsed) {
    if (item && typeof item.key === "string") {
      out.set(item.key, {
        key: item.key,
        titleKo: String(item.titleKo ?? ""),
        abstractKo: String(item.abstractKo ?? ""),
        summaryKo: String(item.summaryKo ?? ""),
      });
    }
  }
  return out;
}

// ── Gemini (Google AI Studio, 무료 등급 가능) ─────────────────────────
async function callGemini(inputs: TranslationInput[]): Promise<any[]> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: buildInstruction(inputs) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini 요청 실패: ${res.status} ${await res.text()}`);
  const data: any = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  return extractJsonArray(text);
}

// ── Anthropic (대체) ──────────────────────────────────────────────────
async function callClaude(inputs: TranslationInput[]): Promise<any[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: buildInstruction(inputs) }],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return extractJsonArray(text);
}

// 모델 응답에서 JSON 배열만 안전하게 추출
function extractJsonArray(text: string): any[] {
  const trimmed = (text ?? "").trim();
  try {
    const direct = JSON.parse(trimmed);
    if (Array.isArray(direct)) return direct;
  } catch {
    /* fall through */
  }
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const arr = JSON.parse(trimmed.slice(start, end + 1));
      if (Array.isArray(arr)) return arr;
    } catch {
      /* ignore */
    }
  }
  return [];
}
