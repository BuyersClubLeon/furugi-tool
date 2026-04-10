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
        "x-api-key": apiKey,
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
          return buildJsonResponse(lastResult.parsed, 200);
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
