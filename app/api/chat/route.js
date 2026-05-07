// app/api/chat/route.js
// サーバーサイドでAnthropic APIを呼び出す
// 529 / overloaded_error のときも、必ず JSON で返す安全版

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildJsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function normalizeDetail(parsed, text) {
  if (parsed !== null) {
    return parsed;
  }

  if (typeof text === "string") {
    return text;
  }

  return "";
}

function isListingPrompt(system) {
  return (
    typeof system === "string" &&
    system.includes("【説明文の構成") &&
    system.includes("8. 英語説明") &&
    system.includes("真贋保証表現は禁止")
  );
}

function collectMessageText(messages) {
  if (!Array.isArray(messages)) return "";

  return messages
    .map((message) => {
      if (typeof message?.content === "string") return message.content;
      if (!Array.isArray(message?.content)) return "";

      return message.content
        .map((block) => (block?.type === "text" ? block.text || "" : ""))
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

function includesAnyText(text, words) {
  if (typeof text !== "string") return false;
  const lowerText = text.toLowerCase();
  return words.some((word) => lowerText.includes(word.toLowerCase()));
}

function cleanUnresolvedConditionBlock(text) {
  return text
    .replace(
      /^●状態⇒【(?:\s*|___|＿+|ランク記号未確定|状態未確定|未確定|未選択)】\n［S］未使用・デッドストック\n［A］目立つ傷汚れなし・良好\n［B］多少の使用感、小さな汚れあり（着用に問題なし）\n［C］使用感や部分的なダメージあり（古着慣れ向け）\n［D］全体的に大きめのダメージあり/gm,
      "●状態⇒【A】\n写真で確認できる範囲では、目立つ傷汚れは確認できません。"
    )
    .replace(
      /^●状態⇒【(?:\s*|___|＿+|ランク記号未確定|状態未確定|未確定|未選択)】\n写真でご確認いただき、ご判断ください。/gm,
      "●状態⇒【A】\n写真で確認できる範囲では、目立つ傷汚れは確認できません。"
    )
    .replace(
      /^●状態⇒【(?:\s*|___|＿+|ランク記号未確定|状態未確定|未確定|未選択)】\s*$/gm,
      "●状態⇒【A】\n写真で確認できる範囲では、目立つ傷汚れは確認できません。"
    );
}

function cleanDanglingFragments(text) {
  return text
    .replace(/^●\s*$/gm, "")
    .replace(/^●\s*(?:の|が|を|に|で|と|も|は|や|など|として|という)[^\n]*$/gm, "")
    .replace(/^●[^\n]{0,80}(?:で|が|を|に|と|も|は|や|など|として|という)\s*$/gm, "")
    .replace(/です。(?:の表記が|という表記も)[^。\n]*。/g, "です。")
    .replace(/[^。\n]*品質への信頼感[^。\n]*。/g, "")
    .replace(/[^。\n]*品質の良さ[^。\n]*。/g, "")
    .replace(/\s+as shown on the label\./gi, "")
    .replace(/\.\s+with quality construction and full zip design for easy layering\./gi, ". Full zip design makes it easy to layer.")
    .replace(/\s+with quality construction and full zip design for easy layering\./gi, " Full zip design makes it easy to layer.")
    .replace(/\s+with quality construction[^.]*\./gi, "")
    .replace(/\n{3,}/g, "\n\n");
}

function cleanUnconfirmedDetails(text, requestText) {
  let cleaned = text;

  if (!includesAnyText(requestText, ["カナダ製", "canada", "made in canada"])) {
    cleaned = cleaned
      .replace(/[ 　]*カナダ製/g, "")
      .replace(/[ ,、]*Made in Canada/gi, "");
  }

  if (!includesAnyText(requestText, ["厚手", "肉厚", "程よい厚み", "しっかりとした生地", "生地感", "heavyweight", "thick fabric"])) {
    cleaned = cleaned
      .replace(/程よい厚みで着回しやすく、?/g, "羽織りとして使いやすく、")
      .replace(/程よい厚みで[^。\n]*[。]?/g, "")
      .replace(/しっかりとした生地感で長く愛用いただけ、?/g, "落ち着いた雰囲気で日常のコーディネートにも取り入れやすく、")
      .replace(/しっかりとした生地感で[^。\n]*[。]?/g, "")
      .replace(/厚手の生地感でしっかりとした作りになっており、?/g, "")
      .replace(/厚手の生地感でしっかりとした作りです。?/g, "")
      .replace(/The thick fabric construction and full-zip design make it versatile for layering\./g, "The full-zip design makes it versatile for layering.")
      .replace(/The thick fabric construction makes it versatile for layering\./g, "The full-zip design makes it versatile for layering.");
  }

  if (!includesAnyText(requestText, ["長く愛用", "長くご愛用", "ご愛用", "長年", "丈夫", "耐久", "long lasting", "durable"])) {
    cleaned = cleaned
      .replace(/長くご愛用いただける[^。\n]*[。]?/g, "日常のコーディネートにも取り入れやすい一枚です。")
      .replace(/長く愛用いただけ、?/g, "日常のコーディネートにも取り入れやすく、")
      .replace(/長く愛用できる[^。\n]*[。]?/g, "")
      .replace(/長年愛用できる[^。\n]*[。]?/g, "");
  }

  if (!includesAnyText(requestText, ["毛玉", "毛羽立ち", "毛羽", "pilling", "fuzz"] )) {
    cleaned = cleaned
      .replace(/全体的に使用感があり、毛玉や毛羽立ちが見られます。?/g, "ニット素材特有の使用感は写真にてご確認ください。")
      .replace(/毛玉や毛羽立ちが見られます。?/g, "ニット素材特有の使用感は写真にてご確認ください。")
      .replace(/毛玉[^。\n]*。/g, "ニット素材特有の使用感は写真にてご確認ください。")
      .replace(/毛羽立ち[^。\n]*。/g, "ニット素材特有の使用感は写真にてご確認ください。");
  }

  if (!includesAnyText(requestText, ["希少", "レア", "rare"])) {
    cleaned = cleaned
      .replace(/希少な一着[、。]?/g, "")
      .replace(/希少性の高い一着[、。]?/g, "");
  }

  return cleaned;
}

function sanitizeListingText(text, requestText = "") {
  if (typeof text !== "string" || !text) return text;

  let sanitized = text
    .replace(/(●状態⇒【([SABCD])】\n)［\2］/g, "$1")
    .replace(/^●サイズ：\s*(?:___|＿+|未入力|-)?\s*$/gm, "●サイズ：不明")
    .replace(/You can purchase immediately\./g, "Immediate purchase is welcome.")
    .replace(/[^。.!?\n]*(?:Please rest assured that this item is authentic|authenticity|authentic|legit|100%\s*authentic)[^。.!?\n]*[。.!?]?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  sanitized = cleanUnresolvedConditionBlock(sanitized);
  sanitized = cleanDanglingFragments(sanitized);
  sanitized = cleanUnconfirmedDetails(sanitized, requestText);

  return sanitized
    .replace(/[ 　]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeListingResponse(parsed, system, messages) {
  if (!isListingPrompt(system) || !parsed || typeof parsed !== "object") {
    return parsed;
  }

  if (!Array.isArray(parsed.content)) return parsed;

  const requestText = collectMessageText(messages);

  return {
    ...parsed,
    content: parsed.content.map((block) => {
      if (!block || block.type !== "text") return block;

      return {
        ...block,
        text: sanitizeListingText(block.text, requestText),
      };
    }),
  };
}

async function callAnthropic({ apiKey, system, messages }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 60000);

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ["x-api" + "-key"]: apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: system ?? "",
        messages,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    const parsed = safeJsonParse(text);

    return {
      ok: response.ok,
      status: response.status,
      parsed,
      text,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown fetch error";

    return {
      ok: false,
      status: 502,
      parsed: null,
      text: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const body = safeJsonParse(rawBody);

    if (!body || typeof body !== "object") {
      return buildJsonResponse(
        {
          error: "リクエスト本文がJSONではありません",
          detail: typeof rawBody === "string" ? rawBody.slice(0, 500) : "",
        },
        400
      );
    }

    const { system, messages } = body;

    if (!Array.isArray(messages)) {
      return buildJsonResponse(
        {
          error: "messages は配列で送ってください",
          detail: { receivedType: typeof messages },
        },
        400
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return buildJsonResponse(
        {
          error: "APIキーが設定されていません",
        },
        500
      );
    }

    let lastResult = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      lastResult = await callAnthropic({
        apiKey,
        system,
        messages,
      });

      if (lastResult.ok) {
        if (lastResult.parsed !== null) {
          const responseBody = sanitizeListingResponse(lastResult.parsed, system, messages);
          return buildJsonResponse(responseBody, 200);
        }

        return buildJsonResponse(
          {
            error: "Anthropic success response was not valid JSON",
            detail: lastResult.text,
          },
          502
        );
      }

      const detail = normalizeDetail(lastResult.parsed, lastResult.text);

      const overloadedErrorType =
        lastResult.parsed &&
        typeof lastResult.parsed === "object" &&
        lastResult.parsed.error &&
        typeof lastResult.parsed.error === "object" &&
        lastResult.parsed.error.type === "overloaded_error";

      const retryable =
        RETRYABLE_STATUS.has(lastResult.status) || overloadedErrorType;

      const isLastAttempt = attempt === MAX_RETRIES;

      if (!retryable || isLastAttempt) {
        return buildJsonResponse(
          {
            error: `Anthropic API error: ${lastResult.status}`,
            detail,
            retryable,
          },
          lastResult.status
        );
      }

      await sleep(800 * (attempt + 1));
    }

    return buildJsonResponse(
      {
        error: "Anthropic API error",
        detail: "Unknown error",
      },
      500
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return buildJsonResponse(
      {
        error: "サーバーエラー",
        detail: message,
      },
      500
    );
  }
}
