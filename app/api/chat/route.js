// app/api/chat/route.js
// サーバーサイドでAnthropicAPIを呼び出す（APIキーを安全に管理）

export async function POST(request) {
  try {
    const body = await request.json();
    const { system, messages } = body;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "APIキーが設定されていません" },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: system,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json(
        { error: `Anthropic API error: ${response.status}`, detail: errText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: "サーバーエラー: " + err.message },
      { status: 500 }
    );
  }
}
