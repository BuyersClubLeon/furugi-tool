"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createSupabaseBrowser } from "../lib/supabase";
import {
  Camera, FileText, TrendingUp, Calculator, Shield,
  MessageCircle, Menu, X, Loader2, Copy, Check,
  Sparkles, Package, Send, RotateCcw, ImagePlus, LogOut,
} from "lucide-react";

/* ── API呼び出し（サーバーサイドプロキシ経由） ── */
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getClaudeErrorMessage(data, status, rawText) {
  const errorText =
    typeof data?.error === "string" ? data.error : `API error: ${status}`;

  let detailText = "";

  if (typeof data?.detail === "string") {
    detailText = data.detail;
  } else if (data?.detail && typeof data.detail === "object") {
    if (typeof data.detail?.error?.type === "string") {
      detailText = data.detail.error.type;
    } else {
      try {
        detailText = JSON.stringify(data.detail);
      } catch {
        detailText = "";
      }
    }
  }

  const mergedText = `${errorText} ${detailText}`.toLowerCase();

  if (status === 529 || mergedText.includes("overloaded_error")) {
    return "現在アクセスが集中しています。少し時間をおいて、もう一度お試しください。";
  }

  if (!data && rawText) {
    return `サーバー応答の読み取りに失敗しました: ${rawText.slice(0, 120)}`;
  }

  return detailText ? `${errorText} / ${detailText}` : errorText;
}

function isErrorResultText(value) {
  if (!value) return false;
  return (
    value.startsWith("エラー:") ||
    value.startsWith("写真の自動認識に失敗しました:")
  );
}

const MARKET_RESEARCH_MEASUREMENT_LABELS = {
  width_cm: "身幅",
  length_cm: "着丈",
  sleeve_cm: "袖丈",
  shoulder_cm: "肩幅",
};

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function formatCompletedMarketResearchSummary(source) {
  const { values } = buildMarketResearchReflectSource(source, {});
  const lines = MARKET_RESEARCH_REFLECT_FIELDS
    .filter((field) => values[field.targetKey])
    .map((field) => `・${field.label}: ${values[field.targetKey]}`);
  const measurementLabels = getMarketResearchMeasurementLabels(source);

  if (measurementLabels.length > 0) {
    lines.push(`・採寸項目: ${measurementLabels.join("、")}`);
  }

  if (lines.length > 0) return lines.join("\n");

  if (typeof source === "string" && source.trim()) return source;
  if (typeof source?.summaryText === "string" && source.summaryText.trim()) {
    return source.summaryText;
  }

  return "結果を取得できませんでした。";
}

async function callClaude(systemPrompt, userMessage, images = []) {
  const content = [];

  for (const img of images) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.type, data: img.data },
    });
  }

  content.push({ type: "text", text: userMessage });

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: systemPrompt,
      messages: [{ role: "user", content }],
    }),
  });

  const rawText = await res.text();
  const data = safeJsonParse(rawText);

  if (!res.ok) {
    throw new Error(getClaudeErrorMessage(data, res.status, rawText));
  }

  if (!data || typeof data !== "object") {
    throw new Error(
      `サーバー応答の読み取りに失敗しました: ${rawText.slice(0, 120)}`
    );
  }

  if (data.error) {
    throw new Error(getClaudeErrorMessage(data, res.status, rawText));
  }

  const blocks = Array.isArray(data.content)
    ? data.content
        .filter((b) => b?.type === "text")
        .map((b) => b?.text || "")
        .filter(Boolean)
    : [];

  return blocks.join("\n").trim() || "エラーが発生しました";
}

/* ══════════════════════════════════════════════
   修正済みシステムプロンプト群
   ══════════════════════════════════════════════ */

const SYSTEM_BASE = `あなたは100年に1人の確率で現れるカリスマ古着販売者です。
様々な洋服（古着）に精通しており、洋服（古着）に興味の無い人にも心に響く説明をすることができます。
洋服（古着）好きに対しては、しっかりと商品の特徴を伝えることができ、マニアックな説明を行うこともできます。
ハルシネーションは禁止です。入力情報にない内容は断定せず、推測で補わないでください。
入力にない素材、年代、生産国は絶対に断定しないこと。
全ての出力は日本語で行うこと。
メタ認知をしっかりと活用してください。
生成全体を通して、必ずハルシネーションを起こさないようにしてください。要注意。`;

/* ── 出品文章生成プロンプト ── */
const LISTING_PROMPT = `${SYSTEM_BASE}

【前提条件】
・あなたは、100年に1人の確率で現れるカリスマ洋服（古着）販売者です。
・様々な洋服（古着）に精通しており、洋服（古着）に興味の無い人にも心に響く説明をすることができます。
・洋服（古着）好きに対しては、しっかりと商品の特徴を伝えることができ、マニアックな説明を行うこともできます。
・今回作成の説明文を見たときに、インパクトがあり、しっかりと商品の特徴を理解してもらえる文章を作ってください。
・説明文はメルカリでの販売を想定し、スマホで読みやすく、購入理由が伝わる構成にしてください。
・CVR向上を意識し、「欲しい理由」が明確になる文章にしてください。
・過剰表現は避け、自然で信頼感のある文章にしてください。

【出力ルール】
・出力は必ず以下の順番で作成すること（9セクション構成）
・日本語の説明文の後に、短めの英語説明文もつける
・タイトルは65文字以内
・全体は9999文字以内

【文章トーン】
・やわらかい
・安心感がある
・押し売り感がない
・古着初心者にもわかりやすい
・ただし安っぽくしない
・ブランドやアイテムの魅力は簡潔に伝える
・スマホで流し読みしても要点が伝わるようにする

【タイトル作成ルール】
・タイトルは「年代 or テイスト / ブランド名 / アイテム名 / 特徴 / 色」の順を基本にする
・日本語検索とブランド検索の両方を意識する
・不要な記号や過剰な装飾は使わない
・例: 00s Timberland レザージャケット 本革 ティンバーランド 黒

【ベース情報の扱いルール】
・【現時点の商品説明用ベース情報】が入力されている場合は、その内容を必ず確認し、本文・魅力訴求・キーワード作成時の参考情報として反映する
・ただし、ベース情報に書かれている内容でも、他の入力情報と矛盾する場合は断定せず、確実に確認できる情報を優先する
・ベース情報の文章はそのまま機械的に繰り返さず、今回の商品情報に合わせて自然な表現に整理して組み込む
・ベース情報に書かれていない内容を推測で補わない
・ベース情報は、主に以下へ反映する: ①冒頭の魅力訴求 ②本文 ③検索キーワード
・タイトル、状態、サイズは必ず今回の入力情報を優先する
・ベース情報が空欄の場合は、他の入力情報のみで通常通り生成する

【説明文の構成 — 必ずこの順番で出力すること】

1. タイトル（65文字以内）

2. 冒頭の魅力訴求を3〜4行
・各行は「●」で始める
・見た瞬間に魅力が伝わる内容にする
・購入理由になる内容を優先する
・【現時点の商品説明用ベース情報】に使える要素がある場合は自然に反映する

3. 本文
・2〜4文程度
・長すぎず、スマホで読みやすい長さにする
・ブランドやアイテムの特徴、着こなしや合わせやすさ、素材感や雰囲気を自然にまとめる
・【現時点の商品説明用ベース情報】がある場合は、内容を要約・整理して自然に組み込む
・入力情報にないことは書かない

4. サイズ欄（必ず以下のフォーマットで出力）
●サイズ：○○
●実寸（単位:㎝）
着丈：○○㎝
身幅：○○㎝
肩幅：○○㎝
袖丈：○○㎝
※平置き実寸となります。多少の誤差がある可能性がございますのでご了承下さい。

重要：サイズは必ず着丈→身幅→肩幅→袖丈の順で4項目すべてを記載すること。
数値が未確定・未入力の場合も項目自体は省略せず「肩幅：___㎝」のように空欄で残すこと。

5. 状態欄
●状態⇒【ランク記号】
［S］未使用・デッドストック
［A］目立つ傷汚れなし・良好
［B］多少の使用感、小さな汚れあり（着用に問題なし）
［C］使用感や部分的なダメージあり（古着慣れ向け）
［D］全体的に大きめのダメージあり
・必要があれば、状態補足を1文だけ追加する
・補足も事実ベースのみ

6. 問い合わせ文
商品に関するお問い合わせがありましたらお気軽にご連絡ください。

7. キーワード
・検索を意識した関連キーワードを日本語中心で8〜12個
・ブランド名の英語 / 日本語表記も入れる
・ただし入力内容から逸脱しない
・【現時点の商品説明用ベース情報】に検索上有効な語句があれば、入力内容と矛盾しない範囲で反映する

8. 英語説明
・海外購入者向けの短い英語説明を2〜4文程度
・不自然に長くしない
・必要に応じて以下を自然に含める:
You can purchase immediately.
Please rest assured that this item is authentic.

【禁止事項 — 厳守】
・入力にない素材を断定しない
・入力にない年代を断定しない
・入力にない生産国を断定しない
・「激レア」「絶対おすすめ」「一生モノ」など過剰な煽り表現は禁止
・意味の薄い美辞麗句で文字数を増やさない
・専門用語を使いすぎない
・本文を長くしすぎない
・【現時点の商品説明用ベース情報】を、そのまま丸写しするだけの出力は禁止
・ベース情報を優先しすぎて、今回の個別入力情報とズレた内容にしない`;

const ANALYSIS_PROMPT = `${SYSTEM_BASE}
対象アイテムの詳細な商品分析を行ってください。
■市場分析: 需要スコア(/100)、予想販売価格帯(メルカリ)、季節トレンド、競合状況
■商品評価: 希少性(/100)、状態(/100)、トレンド適合(/100)、ブランド価値(/100)
■出品方式の推奨: 定額出品推奨価格、推奨出品時期、推奨終了時間
■推奨戦略: 最適出品時期、キーワード提案、撮影アドバイス`;

const AUTH_PROMPT = `${SYSTEM_BASE}
対象アイテムの真贋判定を行ってください。
■基本チェック: ブランドタグの縫製、素材タグの位置と形状、ブランドロゴの精度
■詳細チェック: ステッチの間隔と均一性、糸の品質、ジッパーやボタンの刻印
■判定結果: 真贋判定（本物の可能性:高/中/低/判定不可）、判定根拠、注意点、年代推定
写真が不十分な場合は追加で必要な写真を具体的に指示してください。`;

const PROFIT_PROMPT = `${SYSTEM_BASE}
仕入れ価格をもとにメルカリでの想定利益を計算してください。
条件: メルカリ手数料10%、送料はユーザー指定値
出力: 想定売価(最低〜最高)、手数料、送料、想定利益、利益率
販売シナリオ: 最低限/平均的/好条件の3パターン
利益率20%以上→おすすめ、10-20%→検討余地、10%未満→要注意`;

const REPLY_PROMPT = `${SYSTEM_BASE}
メルカリで買い手からの質問に対する返答文を作成してください。
・購入してもらうのに適切な返答文
・1000文字以内
・丁寧で安心感のある文面`;

const AUTOFILL_PROMPT = `あなたは古着の専門家です。添付された商品写真を分析し、以下の情報をJSON形式のみで返してください。
写真から確認できない項目は空文字""にしてください。推測や断定は禁止です。
写真から読み取れる事実のみを記載してください。

必ず以下のJSON形式のみで返答してください。説明文やMarkdownは不要です。JSONだけを返してください。

{
  "brand": "ブランド名（タグから読み取れる場合のみ）",
  "item": "アイテムの種類（例：レザージャケット、チェスターコート等）",
  "era": "年代（タグや特徴から推定できる場合のみ。例：90s）",
  "material": "素材（タグから読み取れる場合のみ）",
  "color": "カラー（見た目から判断）",
  "sizeLabel": "サイズ表記（タグから読み取れる場合のみ）",
  "features": "特徴・ディテール（カンマ区切り。例：フルジップ,裏地あり,フード付き）",
  "condition": "状態ランク S/A/B/C/D（写真から判断できる場合のみ。判断できなければA）",
  "conditionNote": "状態の補足（汚れやダメージが見える場合のみ）"
}`;

const EMPTY_FEEDBACK = {
  rating: "",
  issueType: "",
  comment: "",
  correctedBrand: "",
  correctedCategory: "",
  correctedEra: "",
  correctedCondition: "",
};

const FEEDBACK_PAGE_SIZE = 20;

const FEATURE_LABELS = {
  listing: "出品文章生成",
  analysis: "商品分析",
  profit: "利益計算",
  auth: "真贋判定",
  reply: "メルカリ返答",
  feedback: "フィードバック管理",
};

const RATING_LABELS = {
  good: "良かった",
  close: "惜しい",
  bad: "修正が必要",
};

function getFeatureLabel(value) {
  return FEATURE_LABELS[value] || value || "-";
}

function getRatingLabel(value) {
  return RATING_LABELS[value] || value || "-";
}

function getIssueLabel(value) {
  const found = FEEDBACK_ISSUES.find((item) => item.value === value);
  return found?.label || value || "指定なし";
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

function prettyJson(value) {
  if (!value) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}



const MARKET_RESEARCH_REFLECT_FIELDS = [
  {
    targetKey: "brand",
    label: "ブランド名",
    jsonKeys: ["brand", "brandName", "brand_name", "ブランド", "ブランド名"],
    textLabels: ["ブランド名", "ブランド"],
  },
  {
    targetKey: "item",
    label: "アイテム名",
    jsonKeys: ["item", "itemName", "item_name", "category", "アイテム", "アイテム名"],
    textLabels: ["アイテム名", "アイテム"],
  },
  {
    targetKey: "material",
    label: "素材",
    jsonKeys: ["material", "素材"],
    textLabels: ["素材"],
  },
  {
    targetKey: "color",
    label: "カラー",
    jsonKeys: ["color", "カラー", "色"],
    textLabels: ["カラー", "色"],
  },
  {
    targetKey: "sizeLabel",
    label: "サイズ表記",
    jsonKeys: ["sizeLabel", "size_label", "size", "サイズ", "サイズ表記"],
    textLabels: ["サイズ表記", "サイズ"],
  },
  {
    targetKey: "condition",
    label: "状態",
    jsonKeys: ["condition", "状態"],
    textLabels: ["状態"],
  },
];

const MARKET_RESEARCH_EMPTY_VALUES = new Set(["", "不明", "未取得", "-"]);

function normalizeMarketResearchReflectValue(value) {
  if (value === null || value === undefined) return "";

  const valueText = String(value).trim();
  return MARKET_RESEARCH_EMPTY_VALUES.has(valueText) ? "" : valueText;
}

function collectMarketResearchReflectSources(source) {
  const jsonSources = [];
  const textSources = [];

  const addTextSource = (value) => {
    if (typeof value !== "string" || !value.trim()) return;
    textSources.push(value);

    const parsed = safeJsonParse(value);
    if (isPlainObject(parsed)) jsonSources.push(parsed);
  };

  const addJsonSource = (value) => {
    if (isPlainObject(value)) jsonSources.push(value);
  };

  if (typeof source === "string") {
    addTextSource(source);
  } else if (isPlainObject(source)) {
    addTextSource(source.summaryText);
    addTextSource(source.reflectPreviewSummaryText);
    addJsonSource(source.normalized_search_params);
    addJsonSource(source.normalizedSearchParams);
    addJsonSource(source.summaryJson);
    addJsonSource(source);
  }

  return { jsonSources, textSources };
}

function findMarketResearchJsonValue(parsed, jsonKeys) {
  if (!isPlainObject(parsed)) return "";

  for (const key of jsonKeys) {
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      const value = normalizeMarketResearchReflectValue(parsed[key]);
      if (value) return value;
    }
  }

  for (const nestedKey of [
    "normalized_search_params",
    "normalizedSearchParams",
    "product",
    "item_info",
    "itemInfo",
    "product_info",
    "productInfo",
  ]) {
    const nestedValue = parsed[nestedKey];
    if (isPlainObject(nestedValue)) {
      const value = findMarketResearchJsonValue(nestedValue, jsonKeys);
      if (value) return value;
    }
  }

  return "";
}

function findMarketResearchTextValue(summaryText, textLabels) {
  if (typeof summaryText !== "string" || !summaryText.trim()) return "";

  const escapedLabels = textLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const labelPattern = escapedLabels.join("|");
  const matcher = new RegExp(`(?:^|\\n)\\s*(?:・\\s*)?(?:${labelPattern})\\s*[:：]\\s*([^\\n]+)`, "i");
  const match = summaryText.match(matcher);

  return normalizeMarketResearchReflectValue(match?.[1]);
}

function getMarketResearchMeasurementLabels(source) {
  const { jsonSources } = collectMarketResearchReflectSources(source);

  for (const jsonSource of jsonSources) {
    const measurements = findMarketResearchMeasurements(jsonSource);
    if (!measurements) continue;

    const measurementLabels = Object.entries(MARKET_RESEARCH_MEASUREMENT_LABELS)
      .filter(([key]) => Object.prototype.hasOwnProperty.call(measurements, key))
      .map(([, label]) => label);

    if (measurementLabels.length > 0) return measurementLabels;
  }

  return [];
}

function findMarketResearchMeasurements(parsed) {
  if (!isPlainObject(parsed)) return null;

  if (isPlainObject(parsed.measurements)) return parsed.measurements;

  for (const nestedKey of [
    "normalized_search_params",
    "normalizedSearchParams",
    "product",
    "item_info",
    "itemInfo",
    "product_info",
    "productInfo",
  ]) {
    const nestedValue = parsed[nestedKey];
    const measurements = findMarketResearchMeasurements(nestedValue);
    if (measurements) return measurements;
  }

  return null;
}


function hasMarketResearchNumericMeasurementValue(source) {
  const { jsonSources } = collectMarketResearchReflectSources(source);

  return jsonSources.some((jsonSource) => {
    const measurements = findMarketResearchMeasurements(jsonSource);
    if (!measurements) return false;

    return Object.keys(MARKET_RESEARCH_MEASUREMENT_LABELS).some((key) => {
      const value = measurements[key];
      const valueText = String(value ?? "").trim();
      if (!valueText) return false;
      return Number.isFinite(Number(valueText));
    });
  });
}

function buildMarketResearchReflectSource(source, form = {}) {
  const { jsonSources, textSources } = collectMarketResearchReflectSources(source);

  if (jsonSources.length === 0 && textSources.length === 0) {
    return { values: {}, reflectableLabels: [], filledLabels: [] };
  }

  const values = {};
  const reflectableLabels = [];
  const filledLabels = [];

  MARKET_RESEARCH_REFLECT_FIELDS.forEach((field) => {
    const jsonValue = jsonSources.reduce(
      (foundValue, jsonSource) => foundValue || findMarketResearchJsonValue(jsonSource, field.jsonKeys),
      ""
    );
    const textValue = textSources.reduce(
      (foundValue, textSource) => foundValue || findMarketResearchTextValue(textSource, field.textLabels),
      ""
    );
    const sourceValue = jsonValue || textValue;

    if (!sourceValue) return;

    values[field.targetKey] = sourceValue;

    if (!String(form[field.targetKey] || "").trim()) {
      reflectableLabels.push(field.label);
    } else {
      filledLabels.push(field.label);
    }
  });

  return { values, reflectableLabels, filledLabels };
}

function hasMarketResearchReflectableValue(source, form) {
  return buildMarketResearchReflectSource(source, form).reflectableLabels.length > 0;
}

function buildMarketResearchReflectPreview(source, form) {
  const { reflectableLabels } = buildMarketResearchReflectSource(source, form);
  const previewLines = [];

  if (reflectableLabels.length > 0) {
    previewLines.push(`反映できる内容: ${reflectableLabels.join("、")}`);
  }

  if (
    getMarketResearchMeasurementLabels(source).length > 0 &&
    !hasMarketResearchNumericMeasurementValue(source)
  ) {
    previewLines.push("採寸は数値未取得（手入力してください）");
  }

  return previewLines.join("\n");
}

function buildFeedbackSummary(item) {
  const parts = [];
  if (item?.issue_type) parts.push(`修正点: ${getIssueLabel(item.issue_type)}`);
  if (item?.corrected_brand) parts.push(`ブランド: ${item.corrected_brand}`);
  if (item?.corrected_category) parts.push(`カテゴリ: ${item.corrected_category}`);
  if (item?.corrected_era) parts.push(`年代: ${item.corrected_era}`);
  if (item?.corrected_condition) parts.push(`状態: ${item.corrected_condition}`);
  return parts.join(" / ");
}

function getResultTextFromItem(item) {
  return item?.request?.output_json?.result_text || "";
}

function getResultPreviewText(text, maxLength = 220) {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getImageCountFromItem(item) {
  return Number(item?.request?.input_text_json?.image_context?.total_count || 0);
}

function getShortRequestId(value) {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function buildFeedbackSearchTarget(item) {
  const inputTextJson = item?.request?.input_text_json;
  const baseListing = inputTextJson?.normalized_input?.listing;
  const rawForm = inputTextJson?.raw_state?.form;
  const rawProfitForm = inputTextJson?.raw_state?.profitForm;
  const rawReplyForm = inputTextJson?.raw_state?.replyForm;

  const pieces = [
    getFeatureLabel(item?.feature_type),
    getRatingLabel(item?.rating),
    getIssueLabel(item?.issue_type),

    item?.comment || "",
    item?.corrected_brand || "",
    item?.corrected_category || "",
    item?.corrected_era || "",
    item?.corrected_condition || "",

    item?.profile?.display_name || "",
    item?.profile?.email || "",
    item?.request_id || "",

    getResultTextFromItem(item),

    inputTextJson?.page || "",
    inputTextJson?.feature_type || "",
    inputTextJson?.prompt_context?.prompt_name || "",
    inputTextJson?.prompt_context?.uses_images ? "uses_images true" : "uses_images false",
    String(inputTextJson?.prompt_context?.image_count_for_prompt ?? ""),

    baseListing?.brand || "",
    baseListing?.item || "",
    baseListing?.era || "",
    baseListing?.material || "",
    baseListing?.color || "",
    baseListing?.features || "",
    baseListing?.sizeLabel || "",
    baseListing?.length || "",
    baseListing?.width || "",
    baseListing?.shoulder || "",
    baseListing?.sleeve || "",
    baseListing?.condition || "",
    baseListing?.conditionNote || "",
    baseListing?.baseInfo || "",

    rawForm?.brand || "",
    rawForm?.item || "",
    rawForm?.era || "",
    rawForm?.material || "",
    rawForm?.color || "",
    rawForm?.features || "",
    rawForm?.sizeLabel || "",
    rawForm?.length || "",
    rawForm?.width || "",
    rawForm?.shoulder || "",
    rawForm?.sleeve || "",
    rawForm?.condition || "",
    rawForm?.conditionNote || "",
    rawForm?.baseInfo || "",

    rawProfitForm?.purchasePrice || "",
    rawProfitForm?.shipping || "",

    rawReplyForm?.question || "",
  ];

  return pieces.map((value) => String(value)).join(" ").toLowerCase();
}

/* ── カラートークン ── */
const T = {
  bg: "#EDE8DA",
  surface: "#E4DFCF",
  surfaceAlt: "#F5F1E6",
  border: "#D1CBBA",
  borderLight: "#C2BBA8",
  text: "#1A2A1A",
  textMuted: "#4A5F4A",
  textDim: "#7A7662",
  accent: "#C5A44B",
  accentLight: "#A8872E",
  success: "#3D8B4F",
  warning: "#B8922A",
  danger: "#B04040",
};

/* ── ナビゲーション定義 ── */
const NAV = [
  { id: "listing", icon: FileText, label: "出品文章生成", desc: "タイトル・説明文の自動生成" },
  { id: "analysis", icon: TrendingUp, label: "商品分析", desc: "市場分析・価格査定" },
  { id: "profit", icon: Calculator, label: "利益計算", desc: "仕入れ価格から利益算出" },
  { id: "auth", icon: Shield, label: "真贋判定", desc: "真贋チェックポイント分析" },
  { id: "reply", icon: MessageCircle, label: "メルカリ返答", desc: "質問対応の返答文生成" },
  { id: "feedback", icon: MessageCircle, label: "フィードバック管理", desc: "保存済みフィードバックの確認" },
];

const CONDITIONS = [
  { value: "", label: "未選択" },
  { value: "S", label: "S - 未使用・デッドストック" },
  { value: "A", label: "A - 目立つ傷汚れなし・良好" },
  { value: "B", label: "B - 多少の使用感あり" },
  { value: "C", label: "C - 使用感やダメージあり" },
  { value: "D", label: "D - 大きめのダメージあり" },
];

const FEEDBACK_ISSUES = [
  { value: "", label: "選択してください" },
  { value: "brand", label: "ブランドが違う" },
  { value: "category", label: "カテゴリが違う" },
  { value: "era", label: "年代が違う" },
  { value: "condition", label: "状態が違う" },
  { value: "tone", label: "文章トーンを直したい" },
  { value: "other", label: "その他" },
];

/* ── サブコンポーネント ── */
function FieldGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: T.textMuted,
          marginBottom: 6,
          display: "block",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ImageUploader({ images, setImages, isMobile }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

const compressImageFile = useCallback((file) => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("file_read_failed"));

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => reject(new Error("image_load_failed"));

      img.onload = () => {
        const maxSide = 1600;
        const longestSide = Math.max(img.width, img.height);
        const scale = longestSide > maxSide ? maxSide / longestSide : 1;
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
        const baseName = file.name.replace(/\.[^.]+$/, "");

        resolve({
          data: compressedDataUrl.split(",")[1],
          type: "image/jpeg",
          name: `${baseName || "image"}.jpg`,
          preview: compressedDataUrl,
        });
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  })
), []);

const processFiles = useCallback(async (files) => {
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) continue;

    try {
      const compressed = await compressImageFile(file);
      setImages((prev) => [...prev, compressed]);
    } catch (error) {
      console.error("Failed to compress image:", error);
    }
  }
}, [compressImageFile, setImages]);
  return (
    <div>
      <div
        style={{
          border: `2px dashed ${dragActive ? T.accent : T.border}`,
          borderRadius: 12,
          padding: isMobile ? 20 : 40,
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s",
          background: dragActive ? `${T.accent}08` : "transparent",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          processFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus size={28} color={T.textDim} style={{ margin: "0 auto 10px", display: "block" }} />
        <div style={{ fontSize: 13, color: T.textMuted }}>写真をドラッグ&ドロップ、またはクリック</div>
        <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>全体・タグ・ディテール・サイズ表記を推奨</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => processFiles(e.target.files)}
        />
      </div>

      {images.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img
                src={img.preview}
                alt=""
                style={{
                  width: isMobile ? 60 : 80,
                  height: isMobile ? 60 : 80,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                }}
              />
              <button
                onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: T.danger,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                <X size={11} color="#fff" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        background: "transparent",
        color: T.textMuted,
        fontSize: 12,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <><Check size={13} /> コピー済み</> : <><Copy size={13} /> コピー</>}
    </button>
  );
}

/* ── スタイルヘルパー ── */
const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  background: T.surfaceAlt,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  color: T.text,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 100,
  lineHeight: 1.7,
};

const cardStyle = {
  background: "rgba(245,241,230,0.9)",
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
};

const cardTitleStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: T.accent,
  marginBottom: 16,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const btnStyle = (variant = "primary") => ({
  padding: "10px 20px",
  borderRadius: 8,
  border: variant === "ghost" ? `1px solid ${T.border}` : "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  transition: "all 0.2s",
  background: variant === "primary" ? T.accent : "transparent",
  color: variant === "primary" ? "#1A2A1A" : T.textMuted,
});

/* ── メインアプリ ── */
export default function Home() {
  const [isMobile, setIsMobile] = useState(false);
  const [page, setPage] = useState("listing");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState("");
  const [requestId, setRequestId] = useState("");
  const [requestSaveError, setRequestSaveError] = useState("");
  const [generatedFeatureType, setGeneratedFeatureType] = useState("");
  const [feedback, setFeedback] = useState({ ...EMPTY_FEEDBACK });
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackMessageType, setFeedbackMessageType] = useState("");

  const [feedbackList, setFeedbackList] = useState([]);
  const [feedbackListLoading, setFeedbackListLoading] = useState(false);
  const [feedbackListError, setFeedbackListError] = useState("");
  const [feedbackListTotal, setFeedbackListTotal] = useState(0);
const [feedbackListOffset, setFeedbackListOffset] = useState(0);
const [feedbackFilterFeatureType, setFeedbackFilterFeatureType] = useState("");
const [feedbackFilterRating, setFeedbackFilterRating] = useState("");
const [feedbackSearchText, setFeedbackSearchText] = useState("");
const [feedbackExpandedId, setFeedbackExpandedId] = useState("");
const [feedbackOutputExpandedId, setFeedbackOutputExpandedId] = useState("");
const [isAdmin, setIsAdmin] = useState(false);
const [marketResearchSummary, setMarketResearchSummary] = useState(null);
const [marketResearchSummaryLoading, setMarketResearchSummaryLoading] = useState(false);
const [marketResearchSummaryError, setMarketResearchSummaryError] = useState("");
const [marketResearchRunId, setMarketResearchRunId] = useState("");
const [marketResearchSubmitting, setMarketResearchSubmitting] = useState(false);
const [marketResearchReflectMessage, setMarketResearchReflectMessage] = useState("");

const visibleNav = isAdmin
  ? NAV
  : NAV.filter((item) => item.id !== "feedback");

useEffect(() => {
  const check = () => {
    const mobile = window.innerWidth < 768;
    setIsMobile(mobile);
    if (!mobile) setSidebarOpen(true);
    if (mobile) setSidebarOpen(false);
  };

  check();
  window.addEventListener("resize", check);
  return () => window.removeEventListener("resize", check);
}, []);

useEffect(() => {
  const supabase = createSupabaseBrowser();

const loadFeedbackPermission = async (nextUserId) => {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    if (sessionError || !accessToken) {
      setIsAdmin(false);
      return;
    }

    const res = await fetch("/api/feedback-list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: accessToken,
        limit: 1,
        offset: 0,
      }),
    });

    if (res.status === 200) {
      setIsAdmin(true);
      return;
    }

    setIsAdmin(false);
  } catch {
    setIsAdmin(false);
  }
};

  loadFeedbackPermission();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    const nextUserId = session?.user?.id;

    if (!nextUserId) {
      setIsAdmin(false);
      return;
    }

    loadFeedbackPermission(nextUserId);
  });

  return () => {
    subscription.unsubscribe();
  };
}, []);
useEffect(() => {
  if (!isAdmin && page === "feedback") {
    setPage("listing");
  }
}, [isAdmin, page]);

useEffect(() => {
  if (page !== "listing") {
    setMarketResearchRunId("");
    setMarketResearchSummary(null);
    setMarketResearchSummaryLoading(false);
    setMarketResearchSummaryError("");
    return;
  }

  const fetchMarketResearchResult = async () => {
    const runIdFromUrl = new URLSearchParams(window.location.search).get("run_id");
    setMarketResearchRunId(runIdFromUrl || "");

    if (!runIdFromUrl) {
      setMarketResearchSummary(null);
      setMarketResearchSummaryLoading(false);
      setMarketResearchSummaryError("");
      return;
    }

    try {
      setMarketResearchSummaryLoading(true);
      setMarketResearchSummaryError("");

      const accessToken = await getAccessToken();

      if (!accessToken) {
        setMarketResearchSummary(null);
        setMarketResearchSummaryError("セッション取得に失敗しました。");
        return;
      }

      const response = await fetch("/api/market-research-result", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_token: accessToken,
          run_id: runIdFromUrl,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.ok) {
        setMarketResearchSummary(null);
        setMarketResearchSummaryError("market research の結果取得に失敗しました。");
        return;
      }

      const summaryJson =
        data?.summary_json &&
        typeof data.summary_json === "object" &&
        !Array.isArray(data.summary_json)
          ? data.summary_json
          : {};

      const fallbackStatus =
        typeof data?.status === "string" && data.status.trim().length > 0
          ? data.status
          : typeof data?.run?.status === "string" && data.run.status.trim().length > 0
            ? data.run.status
            : "-";

      const normalizedSearchParams =
        summaryJson.normalized_search_params &&
        typeof summaryJson.normalized_search_params === "object" &&
        !Array.isArray(summaryJson.normalized_search_params)
          ? summaryJson.normalized_search_params
          : {};
      const reflectPreviewSummaryText =
        typeof summaryJson.reflectPreviewSummaryText === "string" &&
        summaryJson.reflectPreviewSummaryText.trim().length > 0
          ? summaryJson.reflectPreviewSummaryText
          : typeof summaryJson.reflect_preview_summary_text === "string" &&
              summaryJson.reflect_preview_summary_text.trim().length > 0
            ? summaryJson.reflect_preview_summary_text
            : prettyJson(normalizedSearchParams);
      const summaryText =
        typeof summaryJson.summary === "string" && summaryJson.summary.trim().length > 0
          ? summaryJson.summary
          : reflectPreviewSummaryText || prettyJson(summaryJson) || "要約なし";
      const progress =
  summaryJson.progress &&
  typeof summaryJson.progress === "object" &&
  !Array.isArray(summaryJson.progress)
    ? summaryJson.progress
    : null;
const highlights =
  summaryJson.highlights &&
  typeof summaryJson.highlights === "object" &&
  !Array.isArray(summaryJson.highlights)
    ? summaryJson.highlights
    : null;
const updatedAt =
  typeof summaryJson.updated_at === "string" && summaryJson.updated_at.trim().length > 0
    ? summaryJson.updated_at
    : "-";

      setMarketResearchSummary({
        status:
          typeof summaryJson.status === "string" && summaryJson.status.trim().length > 0
            ? summaryJson.status
            : fallbackStatus,
        nextStep:
          typeof summaryJson.next_step === "string" || summaryJson.next_step === null
            ? summaryJson.next_step
            : null,
        progressStepIndex:
          typeof progress?.step_index === "number" ? progress.step_index : "-",
        progressStepTotal:
          typeof progress?.step_total === "number" ? progress.step_total : "-",
progressPhase:
  typeof progress?.phase === "string" && progress.phase.trim().length > 0
    ? progress.phase
    : "-",
sampleTitle:
  typeof highlights?.sample_title === "string" && highlights.sample_title.trim().length > 0
    ? highlights.sample_title
    : "-",
samplePriceYen:
  typeof highlights?.sample_price_yen === "number" ||
  typeof highlights?.sample_price_yen === "string"
    ? highlights.sample_price_yen
    : "-",
insightReady:
  typeof highlights?.insight_ready === "boolean"
    ? highlights.insight_ready
      ? "true"
      : "false"
    : "-",
collectionMode:
  typeof highlights?.collection_mode === "string" && highlights.collection_mode.trim().length > 0
    ? highlights.collection_mode
    : "-",
updatedAt,
summaryText,
reflectPreviewSummaryText,
normalized_search_params: normalizedSearchParams,
summaryJson,
      });
      setMarketResearchSummaryError("");
    } catch (error) {
      setMarketResearchSummary(null);
      setMarketResearchSummaryError("market research の結果取得で通信エラーが発生しました。");
    } finally {
      setMarketResearchSummaryLoading(false);
    }
  };

  fetchMarketResearchResult();
}, [page]);

const [form, setForm] = useState({
  brand: "",
  item: "",
  era: "",
  material: "",
  color: "",
  features: "",
  sizeLabel: "",
  length: "",
  width: "",
  shoulder: "",
  sleeve: "",
  condition: "",
  conditionNote: "",
  baseInfo: "",
});
  const [profitForm, setProfitForm] = useState({
    purchasePrice: "",
    shipping: "1000",
  });

  const [replyForm, setReplyForm] = useState({
    question: "",
  });

  const u = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const uf = (key, val) => setFeedback((p) => ({ ...p, [key]: val }));

  const resetFeedback = () => {
    setFeedback({ ...EMPTY_FEEDBACK });
    setFeedbackLoading(false);
    setFeedbackMessage("");
    setFeedbackMessageType("");
  };

  const resetResultArea = () => {
    setResult("");
    setRequestId("");
    setRequestSaveError("");
    setGeneratedFeatureType("");
    resetFeedback();
  };

  const getAccessToken = async () => {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  };

  const buildMarketResearchSearchParams = () => ({
    brand: form.brand || "",
    item: form.item || "",
    era: form.era || "",
    material: form.material || "",
    color: form.color || "",
    features: form.features || "",
    size_label: form.sizeLabel || "",
    measurements: {
      length_cm: form.length || "",
      width_cm: form.width || "",
      shoulder_cm: form.shoulder || "",
      sleeve_cm: form.sleeve || "",
    },
    condition: form.condition || "",
    condition_note: form.conditionNote || "",
    base_info: form.baseInfo || "",
  });

  const applyMarketResearchToProduct = () => {
    const { values, reflectableLabels, filledLabels } = buildMarketResearchReflectSource(
      marketResearchSummary,
      form
    );

    if (reflectableLabels.length === 0) return;
    const updates = {};

    MARKET_RESEARCH_REFLECT_FIELDS.forEach((field) => {
      if (!reflectableLabels.includes(field.label)) return;
      updates[field.targetKey] = values[field.targetKey];
    });

    const messages = [];
    const hasUpdates = Object.keys(updates).length > 0;

    if (hasUpdates) {
      setForm((prev) => {
        const safeUpdates = {};

        Object.entries(updates).forEach(([key, value]) => {
          if (!String(prev[key] || "").trim()) {
            safeUpdates[key] = value;
          }
        });

        return Object.keys(safeUpdates).length > 0
          ? { ...prev, ...safeUpdates }
          : prev;
      });
      messages.push("商品情報へ反映しました");
    }

    if (filledLabels.length > 0) {
      messages.push(`入力済みのため維持: ${filledLabels.join("、")}`);
    }

    setMarketResearchReflectMessage(
      messages.length > 0
        ? messages.join("\n")
        : "反映できる入力値がありませんでした"
    );
  };

const runMarketResearch = async () => {
    setMarketResearchSubmitting(true);
    setMarketResearchSummaryError("");

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setMarketResearchSummaryError("セッション取得に失敗しました。");
        return;
      }

      const response = await fetch("/api/market-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          search_params_json: buildMarketResearchSearchParams(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      const runId = typeof data?.run_id === "string" ? data.run_id : "";

      if (!response.ok || !data?.ok || !runId) {
        setMarketResearchSummaryError("market research の実行に失敗しました。");
        return;
      }

      await fetch("/api/market-research-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_token: accessToken,
          run_id: runId,
        }),
      }).catch(() => null);

      const collectResponse = await fetch("/api/market-research-collect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_token: accessToken,
          run_id: runId,
        }),
      });

      const collectData = await collectResponse.json().catch(() => ({}));
      if (!collectResponse.ok || !collectData?.ok) {
        setMarketResearchSummaryError(
          `market research collect に失敗しました: ${collectData?.error || collectData?.detail || "unknown_error"}`
        );
      }

        await fetch("/api/market-research-analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            access_token: accessToken,
            run_id: runId,
          }),
        }).catch(() => null);

        await fetch("/api/market-research-generate-insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            access_token: accessToken,
            run_id: runId,
          }),
        }).catch(() => null);

        await fetch("/api/market-research-complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            access_token: accessToken,
            run_id: runId,
          }),
        }).catch(() => null);

      setMarketResearchRunId(runId);
      setPage("listing");

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("run_id", runId);
      window.history.replaceState({}, "", nextUrl.toString());
    } catch {
      setMarketResearchSummaryError("market research の実行で通信エラーが発生しました。");
    } finally {
      setMarketResearchSubmitting(false);
    }
  };

  const buildInputTextJson = (type) => {
    const promptNameMap = {
      listing: "LISTING_PROMPT",
      analysis: "ANALYSIS_PROMPT",
      auth: "AUTH_PROMPT",
      profit: "PROFIT_PROMPT",
      reply: "REPLY_PROMPT",
    };

    const usesImages = type !== "profit" && type !== "reply";

    return {
      schema_version: 2,
      feature_type: type,
      page,
      raw_state: {
        form,
        profitForm,
        replyForm,
      },
      normalized_input: {
        listing: {
          brand: form.brand || "",
          item: form.item || "",
          era: form.era || "",
          material: form.material || "",
          color: form.color || "",
          features: form.features || "",
          sizeLabel: form.sizeLabel || "",
          length: form.length || "",
          width: form.width || "",
          shoulder: form.shoulder || "",
          sleeve: form.sleeve || "",
          condition: form.condition || "",
          conditionNote: form.conditionNote || "",
          baseInfo: form.baseInfo || "",
        },
      },
      prompt_context: {
        prompt_name: promptNameMap[type] || "",
        uses_images: usesImages,
        image_count_for_prompt: usesImages ? images.length : 0,
      },
      image_context: {
        total_count: images.length,
        files: images.map((img) => ({
          name: img.name || "",
          type: img.type || "",
        })),
      },
      ui_context: {
        current_page: page,
        is_mobile: isMobile,
        sidebar_open: sidebarOpen,
      },
      save_context: {
        save_api: "/api/analysis-request",
        target_table: "analysis_requests",
        save_feature_type: type,
      },
      form,
      profitForm,
      replyForm,
    };
  };

  const buildInputImagesJson = () => {
    return images.map((img) => ({
      name: img.name,
      type: img.type,
    }));
  };

  const saveAnalysisRequest = async (type, outputText) => {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      throw new Error("session_not_found");
    }

    const response = await fetch("/api/analysis-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: accessToken,
        feature_type: type,
        input_images_json: buildInputImagesJson(),
        input_text_json: buildInputTextJson(type),
        output_json: {
          result_text: outputText,
        },
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.request_id) {
      throw new Error(data?.error || "analysis_request_failed");
    }

    return data.request_id;
  };

  const loadFeedbackList = async (
    customOffset = feedbackListOffset,
    customFeatureType = feedbackFilterFeatureType,
    customRating = feedbackFilterRating
  ) => {
    setFeedbackListLoading(true);
    setFeedbackListError("");
    setFeedbackExpandedId("");

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setFeedbackList([]);
        setFeedbackListTotal(0);
        setFeedbackListError("セッション取得に失敗しました。ログインし直して再度お試しください。");
        setFeedbackListLoading(false);
        return;
      }

      const response = await fetch("/api/feedback-list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_token: accessToken,
          feature_type: customFeatureType,
          rating: customRating,
          limit: FEEDBACK_PAGE_SIZE,
          offset: customOffset,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.ok) {
        setFeedbackList([]);
        setFeedbackListTotal(0);
        setFeedbackListError("フィードバック一覧の取得に失敗しました。");
        setFeedbackListLoading(false);
        return;
      }

      setFeedbackList(Array.isArray(data.items) ? data.items : []);
      setFeedbackListTotal(Number(data.total || 0));
      setFeedbackListOffset(customOffset);
    } catch (err) {
      setFeedbackList([]);
      setFeedbackListTotal(0);
      setFeedbackListError("通信エラーが発生しました。もう一度お試しください。");
    }

    setFeedbackListLoading(false);
  };

  const autoFill = async () => {
    if (images.length === 0) return;

    setAnalyzing(true);

    try {
      const imgData = images.map((i) => ({ data: i.data, type: i.type }));
      const raw = await callClaude(
        AUTOFILL_PROMPT,
        "添付写真を分析して、商品情報をJSON形式で返してください。",
        imgData
      );

      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      setForm((prev) => ({
        ...prev,
        brand: parsed.brand || prev.brand,
        item: parsed.item || prev.item,
        era: parsed.era || prev.era,
        material: parsed.material || prev.material,
        color: parsed.color || prev.color,
        sizeLabel: parsed.sizeLabel || prev.sizeLabel,
        features: parsed.features || prev.features,
        condition: parsed.condition || prev.condition,
        conditionNote: parsed.conditionNote || prev.conditionNote,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      setResult("写真の自動認識に失敗しました: " + message);
    } finally {
      setAnalyzing(false);
    }
  };

  const generate = async (type) => {
    setLoading(true);
    resetResultArea();

    try {
      let sys;
      let msg;
      const imgData = images.map((i) => ({ data: i.data, type: i.type }));

      if (type === "listing") {
        sys = LISTING_PROMPT;
        msg = `以下の商品情報をもとに、メルカリ出品用のタイトルと説明文を生成してください。

【現時点の商品説明用ベース情報】
${form.baseInfo || "（なし）"}

ブランド：${form.brand || "不明"}
アイテム名：${form.item || "不明"}
年代：${form.era || "不明"}
素材：${form.material || "不明"}
カラー：${form.color || "不明"}
特徴：${form.features || "特になし"}
サイズ表記：${form.sizeLabel || "不明"}
実寸：
着丈：${form.length || "___"}㎝
身幅：${form.width || "___"}㎝
肩幅：${form.shoulder || "___"}㎝
袖丈：${form.sleeve || "___"}㎝
状態ランク：${form.condition}
状態補足：${form.conditionNote || "特になし"}
${images.length > 0
  ? "添付写真も参考にしてください。写真から読み取れる情報は活用してください。ただし、写真から確認できない情報は断定しないでください。"
  : "写真は添付されていません。入力情報のみで生成してください。入力にない情報は断定せず空欄にしてください。"}

【出力開始】`;
      } else if (type === "analysis") {
        sys = ANALYSIS_PROMPT;
        msg = `対象のアイテムを分析します。\n\nブランド：${form.brand}\nアイテム：${form.item}\n素材：${form.material}\nカラー：${form.color}\n状態：${form.condition}\n特徴：${form.features}\n${images.length > 0 ? "添付写真も参考にしてください。" : ""}`;
      } else if (type === "auth") {
        sys = AUTH_PROMPT;
        msg = `対象のアイテムを分析します。\n\nブランド：${form.brand}\nアイテム：${form.item}\n${images.length > 0 ? "添付写真を元に判定してください。" : "写真がないため一般的なチェックポイントを提示してください。"}`;
      } else if (type === "profit") {
        sys = PROFIT_PROMPT;
        msg = `仕入れ価格：${profitForm.purchasePrice}円\n送料：${profitForm.shipping}円\nブランド：${form.brand}\nアイテム：${form.item}\n状態：${form.condition}`;
      } else if (type === "reply") {
        sys = REPLY_PROMPT;
        msg = `出品中：${form.brand} ${form.item}（状態${form.condition}）\n\n購入希望者の質問：\n${replyForm.question}`;
      }

      const res = await callClaude(
        sys,
        msg,
        type !== "profit" && type !== "reply" ? imgData : []
      );

      setResult(res);
      setGeneratedFeatureType(type);

      try {
        const savedRequestId = await saveAnalysisRequest(type, res);
        setRequestId(savedRequestId);
        setRequestSaveError("");
      } catch (saveErr) {
        setRequestId("");
        setRequestSaveError(saveErr.message || "analysis_request_failed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      setResult("エラー: " + message);
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async () => {
    if (!requestId) {
      setFeedbackMessage("先に生成結果の保存が必要です。もう一度生成を試してください。");
      setFeedbackMessageType("error");
      return;
    }

    setFeedbackLoading(true);
    setFeedbackMessage("");
    setFeedbackMessageType("");

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        setFeedbackMessage("セッション取得に失敗しました。ログインし直して再度お試しください。");
        setFeedbackMessageType("error");
        setFeedbackLoading(false);
        return;
      }

      const response = await fetch("/api/analysis-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_token: accessToken,
          request_id: requestId,
          feature_type: generatedFeatureType || page,
          rating: feedback.rating,
          issue_type: feedback.issueType,
          comment: feedback.comment,
          corrected_brand: feedback.correctedBrand,
          corrected_category: feedback.correctedCategory,
          corrected_era: feedback.correctedEra,
          corrected_condition: feedback.correctedCondition,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.ok) {
        setFeedbackMessage("フィードバック保存に失敗しました。もう一度お試しください。");
        setFeedbackMessageType("error");
        setFeedbackLoading(false);
        return;
      }

      setFeedbackMessage("フィードバックを保存しました。");
      setFeedbackMessageType("success");
    } catch (err) {
      setFeedbackMessage("通信エラーが発生しました。もう一度お試しください。");
      setFeedbackMessageType("error");
    }

    setFeedbackLoading(false);
  };

  const nav = NAV.find((n) => n.id === page);
  const generatedNav = NAV.find((n) => n.id === generatedFeatureType);
  const hasResultError = isErrorResultText(result);

  const normalizedFeedbackSearchText = feedbackSearchText.trim().toLowerCase();

  const visibleFeedbackList = feedbackList.filter((item) => {
    if (!normalizedFeedbackSearchText) return true;
    return buildFeedbackSearchTarget(item).includes(normalizedFeedbackSearchText);
  });

  const feedbackStats = feedbackList.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item?.rating === "good") acc.good += 1;
      if (item?.rating === "close") acc.close += 1;
      if (item?.rating === "bad") acc.bad += 1;
      return acc;
    },
    { total: 0, good: 0, close: 0, bad: 0 }
  );

  const marketResearchReflectPreview = buildMarketResearchReflectPreview(
    marketResearchSummary,
    form
  );
  const canApplyMarketResearchToProduct = hasMarketResearchReflectableValue(
    marketResearchSummary,
    form
  );
  const marketResearchNoAutoInputMessage = canApplyMarketResearchToProduct
    ? ""
    : "反映できる自動入力値はありません\n採寸は手入力してください";
  const shouldShowMeasurementManualInputGuide = marketResearchReflectPreview.includes(
    "採寸は数値未取得"
  );


  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 998,
          }}
        />
      )}

      <aside
        style={{
          ...(isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                height: "100vh",
                zIndex: 999,
                transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.3s ease",
                width: 260,
              }
            : {
                width: sidebarOpen ? 260 : 0,
                minHeight: "100vh",
                transition: "width 0.3s",
                overflow: "hidden",
                flexShrink: 0,
              }),
          background: "#1E2E1E",
          borderRight: `1px solid #3A4D3A`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ width: 260, padding: "24px 0", display: "flex", flexDirection: "column", height: "100%" }}>
          <div
            style={{
              padding: "0 20px 24px",
              borderBottom: `1px solid #3A4D3A`,
              marginBottom: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.08em", color: T.accent }}>
                FURIGI TOOL
              </div>
              <div style={{ fontSize: 11, color: "#A8A28E", marginTop: 2 }}>
                古着出品アシスタント
              </div>
            </div>

            {isMobile && (
              <button
                onClick={() => setSidebarOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
              >
                <X size={20} color="#C2BBA8" />
              </button>
            )}
          </div>

          <nav style={{ flex: 1, paddingTop: 8 }}>
            {visibleNav.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  setPage(n.id);
                  resetResultArea();
                  if (n.id === "feedback") {
                    loadFeedbackList(0, feedbackFilterFeatureType, feedbackFilterRating);
                  }
                  if (isMobile) setSidebarOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 20px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  background: page === n.id ? `${T.accent}15` : "transparent",
                  borderLeft: page === n.id ? `3px solid ${T.accent}` : "3px solid transparent",
                  color: page === n.id ? T.accent : "#C2BBA8",
                  fontSize: 14,
                  fontWeight: page === n.id ? 600 : 400,
                }}
              >
                <n.icon size={18} />
                <span>{n.label}</span>
              </div>
            ))}
          </nav>

          <div style={{ padding: "12px 20px", borderTop: `1px solid #3A4D3A` }}>
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #3A4D3A",
                background: "transparent",
                color: "#C2BBA8",
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <LogOut size={14} /> ログアウト
            </button>
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: isMobile ? "12px 16px" : "16px 28px",
            borderBottom: `1px solid ${T.border}`,
            background: "#1E2E1E",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 14 }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
            >
              <Menu size={isMobile ? 22 : 18} color="#C2BBA8" />
            </button>

            <div>
              <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: "#EDE8DA" }}>
                {nav?.label}
              </div>
              {!isMobile && (
                <div style={{ fontSize: 11, color: "#A8A28E", marginTop: 1 }}>
                  {nav?.desc}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {!isMobile && (
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  background: `${T.accent}20`,
                  color: T.accent,
                  border: `1px solid ${T.accent}40`,
                }}
              >
                メルカリ対応
              </span>
            )}
            <span
              style={{
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                background: `${T.success}20`,
                color: T.success,
                border: `1px solid ${T.success}40`,
              }}
            >
              {images.length} 写真
            </span>
          </div>
        </header>

        <div style={{ flex: 1, padding: isMobile ? 14 : 28, overflowY: "auto" }}>
          <div style={{ maxWidth: 880, margin: "0 auto" }}>

            {["listing", "analysis", "auth"].includes(page) && (
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                <div style={cardTitleStyle}><Camera size={15} /> 商品写真</div>
                <ImageUploader images={images} setImages={setImages} isMobile={isMobile} />

                {page === "listing" && images.length > 0 && (
                  <button
                    style={{
                      ...btnStyle("ghost"),
                      marginTop: 14,
                      width: "100%",
                      justifyContent: "center",
                      borderColor: T.accent,
                      color: T.accent,
                    }}
                    onClick={autoFill}
                    disabled={analyzing}
                  >
                    {analyzing
                      ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                      : <Sparkles size={15} />}
                    {analyzing ? "写真を分析中..." : "写真から自動入力"}
                  </button>
                )}
              </div>
            )}
            
            {page === "listing" && (marketResearchRunId || marketResearchSummaryLoading || marketResearchSummary || marketResearchSummaryError) && (
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                

                <div style={cardTitleStyle}>
                <TrendingUp size={15} />
                {String(marketResearchSummary?.status || "").trim() === "completed_market_research"
                  ? "市場調査結果"
                  : "市場調査結果"}
              </div>

                {marketResearchSummaryLoading ? (
                  <div style={{ fontSize: 13, color: T.textMuted }}>
                    読み込み中
                  </div>
                ) : marketResearchSummaryError ? (
                  <div style={{ fontSize: 13, color: T.warning }}>
                    {marketResearchSummaryError}
                  </div>
                ) : String(marketResearchSummary?.status || "").trim() === "completed_market_research" ? (
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: T.text }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>
                      市場調査が完了しました
                    </div>
                    <div style={{ whiteSpace: "pre-line" }}>
                      {formatCompletedMarketResearchSummary(marketResearchSummary)}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      {canApplyMarketResearchToProduct && marketResearchReflectPreview ? (
                        <div
                          style={{
                            marginBottom: 6,
                            fontSize: 11,
                            color: T.textMuted,
                            whiteSpace: "pre-line",
                          }}
                        >
                          {marketResearchReflectPreview}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={applyMarketResearchToProduct}
                        disabled={!canApplyMarketResearchToProduct}
                        style={{
                          ...btnStyle("ghost"),
                          padding: "6px 10px",
                          fontSize: 12,
                          opacity: canApplyMarketResearchToProduct ? 1 : 0.5,
                          cursor: canApplyMarketResearchToProduct ? "pointer" : "not-allowed",
                        }}
                      >
                        商品情報へ反映
                      </button>
                      {marketResearchNoAutoInputMessage ? (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 11,
                            color: T.textMuted,
                            whiteSpace: "pre-line",
                          }}
                        >
                          {marketResearchNoAutoInputMessage}
                        </div>
                      ) : null}
                      {marketResearchReflectMessage ? (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 11,
                            color: T.textMuted,
                            whiteSpace: "pre-line",
                          }}
                        >
                          {marketResearchReflectMessage}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: T.text }}>
                    <div>処理状態: {marketResearchSummary?.status}</div>
                    <div>次のステップ: {marketResearchSummary?.nextStep ?? "null"}</div>
                    <div>
                      進捗: {marketResearchSummary?.progressStepIndex} / {marketResearchSummary?.progressStepTotal}
                    </div>
                  <div>フェーズ: {marketResearchSummary?.progressPhase}</div>
<div>サンプルタイトル: {marketResearchSummary?.sampleTitle}</div>
<div>参考価格: {marketResearchSummary?.samplePriceYen}</div>
<div>Insight準備: {marketResearchSummary?.insightReady}</div>
<div>収集モード: {marketResearchSummary?.collectionMode}</div>
<div>最終更新: {marketResearchSummary?.updatedAt}</div>
                    <div style={{ marginTop: 8 }}>
                      要約: {marketResearchSummary?.summaryText}
                    </div>
                  </div>
                )}
              </div>
            )}
            {page === "listing" && (
              <>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                  <div style={cardTitleStyle}><Package size={15} /> 商品情報</div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <FieldGroup label="ブランド名">
                      <input
                        style={inputStyle}
                        placeholder="例: Timberland"
                        value={form.brand}
                        onChange={(e) => u("brand", e.target.value)}
                      />
                    </FieldGroup>

                    <FieldGroup label="アイテム名">
                      <input
                        style={inputStyle}
                        placeholder="例: レザージャケット"
                        value={form.item}
                        onChange={(e) => u("item", e.target.value)}
                      />
                    </FieldGroup>

                    <FieldGroup label="年代（不明なら空欄）">
                      <input
                        style={inputStyle}
                        placeholder="例: 90s"
                        value={form.era}
                        onChange={(e) => u("era", e.target.value)}
                      />
                    </FieldGroup>

                    <FieldGroup label="素材（不明なら空欄）">
                      <input
                        style={inputStyle}
                        placeholder="例: 本革"
                        value={form.material}
                        onChange={(e) => u("material", e.target.value)}
                      />
                    </FieldGroup>

                    <FieldGroup label="カラー">
                      <input
                        style={inputStyle}
                        placeholder="例: ブラック"
                        value={form.color}
                        onChange={(e) => u("color", e.target.value)}
                      />
                    </FieldGroup>

                    <FieldGroup label="サイズ表記">
                      <input
                        style={inputStyle}
                        placeholder="例: L"
                        value={form.sizeLabel}
                        onChange={(e) => u("sizeLabel", e.target.value)}
                      />
                    </FieldGroup>
                  </div>

                  <FieldGroup label="特徴・ディテール">
                    <input
                      style={inputStyle}
                      placeholder="例: フルジップ、裏地あり"
                      value={form.features}
                      onChange={(e) => u("features", e.target.value)}
                    />
                  </FieldGroup>

                  <div style={{ ...cardTitleStyle, marginTop: 20, marginBottom: 12 }}>
                    実寸（㎝）— 未計測は空欄のままでOK
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12 }}>
                    {shouldShowMeasurementManualInputGuide ? (
                      <div
                        style={{
                          gridColumn: "1 / -1",
                          marginBottom: 12,
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: `1px solid ${T.warning}35`,
                          background: `${T.warning}12`,
                          color: T.warning,
                          fontSize: 12,
                          lineHeight: 1.6,
                        }}
                      >
                        <div>市場調査では採寸数値を取得できませんでした。</div>
                        <div>着丈・身幅・肩幅・袖丈を手入力してください。</div>
                      </div>
                    ) : null}
                    <FieldGroup label="着丈">
                      <input
                        style={inputStyle}
                        placeholder="__"
                        value={form.length}
                        onChange={(e) => u("length", e.target.value)}
                      />
                    </FieldGroup>

                    <FieldGroup label="身幅">
                      <input
                        style={inputStyle}
                        placeholder="__"
                        value={form.width}
                        onChange={(e) => u("width", e.target.value)}
                      />
                    </FieldGroup>

                    <FieldGroup label="肩幅">
                      <input
                        style={inputStyle}
                        placeholder="__"
                        value={form.shoulder}
                        onChange={(e) => u("shoulder", e.target.value)}
                      />
                    </FieldGroup>

                    <FieldGroup label="袖丈">
                      <input
                        style={inputStyle}
                        placeholder="__"
                        value={form.sleeve}
                        onChange={(e) => u("sleeve", e.target.value)}
                      />
                    </FieldGroup>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <FieldGroup label="状態ランク">
                      <select
                        style={{ ...inputStyle, cursor: "pointer" }}
                        value={form.condition}
                        onChange={(e) => u("condition", e.target.value)}
                      >
                        {CONDITIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </FieldGroup>

                    <FieldGroup label="状態補足">
                      <input
                        style={inputStyle}
                        placeholder="例: 左袖に小さなシミあり"
                        value={form.conditionNote}
                        onChange={(e) => u("conditionNote", e.target.value)}
                      />
                    </FieldGroup>
                  </div>

                  <FieldGroup label="ベース情報（既存の説明文があれば貼り付け — 丸写しせず自然に反映されます）">
                    <textarea
                      style={textareaStyle}
                      placeholder="既存の商品説明文やメモがあればここに…"
                      value={form.baseInfo}
                      onChange={(e) => u("baseInfo", e.target.value)}
                    />
                  </FieldGroup>
                </div>

                <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, marginBottom: 20 }}>
                  <button
                    style={{ ...btnStyle("primary"), width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                    onClick={() => generate("listing")}
                    disabled={loading}
                  >
                    {loading
                      ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                      : <Sparkles size={15} />}
                    {loading ? "生成中..." : "出品文章を生成"}
                  </button>

                  <button
                    style={{ ...btnStyle("ghost"), width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                    onClick={resetResultArea}
                  >
                    <RotateCcw size={14} /> リセット
                  </button>
                </div>
              </>
            )}

            {page === "analysis" && (
              <>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                  <div style={cardTitleStyle}><TrendingUp size={15} /> アイテム情報</div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <FieldGroup label="ブランド名">
                      <input style={inputStyle} value={form.brand} onChange={(e) => u("brand", e.target.value)} />
                    </FieldGroup>
                    <FieldGroup label="アイテム名">
                      <input style={inputStyle} value={form.item} onChange={(e) => u("item", e.target.value)} />
                    </FieldGroup>
                    <FieldGroup label="素材">
                      <input style={inputStyle} value={form.material} onChange={(e) => u("material", e.target.value)} />
                    </FieldGroup>
                    <FieldGroup label="カラー">
                      <input style={inputStyle} value={form.color} onChange={(e) => u("color", e.target.value)} />
                    </FieldGroup>
                  </div>

                  <FieldGroup label="特徴">
                    <input style={inputStyle} value={form.features} onChange={(e) => u("features", e.target.value)} />
                  </FieldGroup>

                  <FieldGroup label="状態ランク">
                    <select
                      style={{ ...inputStyle, cursor: "pointer" }}
                      value={form.condition}
                      onChange={(e) => u("condition", e.target.value)}
                    >
                      {CONDITIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </FieldGroup>
                </div>

                <button
                  style={{ ...btnStyle("primary"), marginBottom: 20, width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                  onClick={() => generate("analysis")}
                  disabled={loading}
                >
                  {loading
                    ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                    : <TrendingUp size={15} />}
                  {loading ? "分析中..." : "商品を分析"}
                </button>

                <button
                  style={{ ...btnStyle("ghost"), marginBottom: 20, width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                  onClick={runMarketResearch}
                  disabled={marketResearchSubmitting}
                >
                  {marketResearchSubmitting
                    ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                    : <TrendingUp size={15} />}
                  {marketResearchSubmitting ? "実行中..." : "market research を実行"}
                </button>

              </>
            )}

            {page === "auth" && (
              <>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                  <div style={cardTitleStyle}><Shield size={15} /> 判定対象</div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <FieldGroup label="ブランド名">
                      <input style={inputStyle} value={form.brand} onChange={(e) => u("brand", e.target.value)} />
                    </FieldGroup>
                    <FieldGroup label="アイテム名">
                      <input style={inputStyle} value={form.item} onChange={(e) => u("item", e.target.value)} />
                    </FieldGroup>
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: T.warning,
                      marginTop: 8,
                      padding: "8px 12px",
                      background: `${T.warning}10`,
                      borderRadius: 6,
                      border: `1px solid ${T.warning}30`,
                    }}
                  >
                    ※ タグ・ロゴ・ステッチのアップ写真を追加すると判定精度が上がります
                  </div>
                </div>

                <button
                  style={{ ...btnStyle("primary"), marginBottom: 20, width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                  onClick={() => generate("auth")}
                  disabled={loading}
                >
                  {loading
                    ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                    : <Shield size={15} />}
                  {loading ? "判定中..." : "真贋判定を実行"}
                </button>
              </>
            )}

            {page === "profit" && (
              <>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                  <div style={cardTitleStyle}><Calculator size={15} /> 利益計算</div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <FieldGroup label="ブランド名">
                      <input style={inputStyle} value={form.brand} onChange={(e) => u("brand", e.target.value)} />
                    </FieldGroup>
                    <FieldGroup label="アイテム名">
                      <input style={inputStyle} value={form.item} onChange={(e) => u("item", e.target.value)} />
                    </FieldGroup>
                  </div>

                  <FieldGroup label="状態ランク">
                    <select
                      style={{ ...inputStyle, cursor: "pointer" }}
                      value={form.condition}
                      onChange={(e) => u("condition", e.target.value)}
                    >
                      {CONDITIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </FieldGroup>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <FieldGroup label="仕入れ価格（円）">
                      <input
                        style={inputStyle}
                        type="number"
                        placeholder="例: 3000"
                        value={profitForm.purchasePrice}
                        onChange={(e) => setProfitForm((p) => ({ ...p, purchasePrice: e.target.value }))}
                      />
                    </FieldGroup>

                    <FieldGroup label="送料（円）">
                      <input
                        style={inputStyle}
                        type="number"
                        value={profitForm.shipping}
                        onChange={(e) => setProfitForm((p) => ({ ...p, shipping: e.target.value }))}
                      />
                    </FieldGroup>
                  </div>

                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>
                    ※ メルカリ手数料10%で自動計算
                  </div>
                </div>

                <button
                  style={{ ...btnStyle("primary"), marginBottom: 20, width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                  onClick={() => generate("profit")}
                  disabled={loading || !profitForm.purchasePrice}
                >
                  {loading
                    ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                    : <Calculator size={15} />}
                  {loading ? "計算中..." : "利益を計算"}
                </button>
              </>
            )}

            {page === "reply" && (
              <>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                  <div style={cardTitleStyle}><MessageCircle size={15} /> 返答生成</div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <FieldGroup label="ブランド名">
                      <input style={inputStyle} value={form.brand} onChange={(e) => u("brand", e.target.value)} />
                    </FieldGroup>
                    <FieldGroup label="アイテム名">
                      <input style={inputStyle} value={form.item} onChange={(e) => u("item", e.target.value)} />
                    </FieldGroup>
                  </div>

                  <FieldGroup label="状態ランク">
                    <select
                      style={{ ...inputStyle, cursor: "pointer" }}
                      value={form.condition}
                      onChange={(e) => u("condition", e.target.value)}
                    >
                      {CONDITIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </FieldGroup>

                  <FieldGroup label="購入希望者からの質問内容">
                    <textarea
                      style={{ ...textareaStyle, minHeight: 120 }}
                      placeholder="例: サイズ感はどのくらいですか？"
                      value={replyForm.question}
                      onChange={(e) => setReplyForm({ question: e.target.value })}
                    />
                  </FieldGroup>

                  <div style={{ fontSize: 11, color: T.textDim }}>
                    ※ 1000文字以内で生成します
                  </div>
                </div>

                <button
                  style={{ ...btnStyle("primary"), marginBottom: 20, width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                  onClick={() => generate("reply")}
                  disabled={loading || !replyForm.question}
                >
                  {loading
                    ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                    : <Send size={15} />}
                  {loading ? "生成中..." : "返答文を生成"}
                </button>
              </>
            )}

            {page === "feedback" && (
              <>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                  <div style={cardTitleStyle}>
                    <MessageCircle size={15} /> フィードバック一覧
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: T.textDim,
                      marginBottom: 16,
                      padding: "10px 12px",
                      background: T.surfaceAlt,
                      border: `1px solid ${T.border}`,
                      borderRadius: 8,
                      lineHeight: 1.7,
                    }}
                  >
                    保存済みのフィードバックと、対応する生成内容をあとから見返せます。<br />
                    今回は、一覧内検索の対象を増やしています。
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <FieldGroup label="機能で絞り込み">
                      <select
                        style={{ ...inputStyle, cursor: "pointer" }}
                        value={feedbackFilterFeatureType}
                        onChange={(e) => setFeedbackFilterFeatureType(e.target.value)}
                      >
                        <option value="">すべて</option>
                        <option value="listing">出品文章生成</option>
                        <option value="analysis">商品分析</option>
                        <option value="profit">利益計算</option>
                        <option value="auth">真贋判定</option>
                        <option value="reply">メルカリ返答</option>
                      </select>
                    </FieldGroup>

                    <FieldGroup label="評価で絞り込み">
                      <select
                        style={{ ...inputStyle, cursor: "pointer" }}
                        value={feedbackFilterRating}
                        onChange={(e) => setFeedbackFilterRating(e.target.value)}
                      >
                        <option value="">すべて</option>
                        <option value="good">良かった</option>
                        <option value="close">惜しい</option>
                        <option value="bad">修正が必要</option>
                      </select>
                    </FieldGroup>
                  </div>

                  <FieldGroup label="一覧内キーワード検索">
                    <input
                      style={inputStyle}
                      placeholder="ブランド名 / アイテム名 / 年代 / 素材 / サイズ / 実寸 / 状態 / コメント / request_id / メールアドレス などで検索"
                      value={feedbackSearchText}
                      onChange={(e) => setFeedbackSearchText(e.target.value)}
                    />
                  </FieldGroup>

                  <div
                    style={{
                      fontSize: 11,
                      color: T.textDim,
                      marginTop: -6,
                      marginBottom: 14,
                    }}
                  >
                    ※ この検索は、今読み込んでいる一覧だけを対象にします。素材・サイズ・実寸・状態・ベース情報・corrected項目も検索対象です
                  </div>

                  <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12 }}>
                    <button
                      style={{ ...btnStyle("primary"), width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                      onClick={() => loadFeedbackList(0, feedbackFilterFeatureType, feedbackFilterRating)}
                      disabled={feedbackListLoading}
                    >
                      {feedbackListLoading
                        ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                        : <Sparkles size={15} />}
                      {feedbackListLoading ? "読み込み中..." : "一覧を読み込む"}
                    </button>

                    <button
                      style={{ ...btnStyle("ghost"), width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                      onClick={() => {
                        setFeedbackFilterFeatureType("");
                        setFeedbackFilterRating("");
                        setFeedbackSearchText("");
                        setFeedbackExpandedId("");
                        loadFeedbackList(0, "", "");
                      }}
                      disabled={feedbackListLoading}
                    >
                      <RotateCcw size={14} /> 絞り込みをクリア
                    </button>
                  </div>
                </div>

                {feedbackListError && (
                  <div
                    style={{
                      ...cardStyle,
                      padding: isMobile ? 16 : 24,
                      background: `${T.danger}10`,
                      border: `1px solid ${T.danger}40`,
                      color: T.danger,
                    }}
                  >
                    {feedbackListError}
                  </div>
                )}

                {!feedbackListLoading && !feedbackListError && feedbackList.length === 0 && (
                  <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                    <div style={{ fontSize: 13, color: T.textMuted }}>
                      まだ表示できるフィードバックがありません。上の「一覧を読み込む」を押してください。
                    </div>
                  </div>
                )}

                {feedbackListLoading && (
                  <div style={{ ...cardStyle, padding: isMobile ? 16 : 24, textAlign: "center" }}>
                    <Loader2 size={28} color={T.accent} style={{ animation: "spin 1s linear infinite" }} />
                    <div style={{ fontSize: 13, color: T.textMuted, marginTop: 14 }}>
                      フィードバック一覧を取得しています…
                    </div>
                  </div>
                )}

                {!feedbackListLoading && !feedbackListError && feedbackList.length > 0 && (
                  <>
                    <div
                      style={{
                        ...cardStyle,
                        padding: isMobile ? 16 : 20,
                      }}
                    >
                      <div style={{ fontSize: 12, color: T.textDim, marginBottom: 10 }}>
                        {feedbackListTotal}件中 {feedbackListOffset + 1}-
                        {Math.min(feedbackListOffset + feedbackList.length, feedbackListTotal)}件を表示 /
                        画面内一致 {visibleFeedbackList.length}件
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <div
                          style={{
                            padding: "8px 12px",
                            borderRadius: 999,
                            background: T.surfaceAlt,
                            border: `1px solid ${T.border}`,
                            fontSize: 12,
                            color: T.text,
                          }}
                        >
                          読み込み件数: {feedbackStats.total}
                        </div>
                        <div
                          style={{
                            padding: "8px 12px",
                            borderRadius: 999,
                            background: `${T.success}12`,
                            border: `1px solid ${T.success}35`,
                            fontSize: 12,
                            color: T.success,
                          }}
                        >
                          良かった: {feedbackStats.good}
                        </div>
                        <div
                          style={{
                            padding: "8px 12px",
                            borderRadius: 999,
                            background: `${T.warning}12`,
                            border: `1px solid ${T.warning}35`,
                            fontSize: 12,
                            color: T.warning,
                          }}
                        >
                          惜しい: {feedbackStats.close}
                        </div>
                        <div
                          style={{
                            padding: "8px 12px",
                            borderRadius: 999,
                            background: `${T.danger}12`,
                            border: `1px solid ${T.danger}35`,
                            fontSize: 12,
                            color: T.danger,
                          }}
                        >
                          修正が必要: {feedbackStats.bad}
                        </div>
                      </div>
                    </div>

                    {visibleFeedbackList.length === 0 && (
                      <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                        <div style={{ fontSize: 13, color: T.textMuted }}>
                          一覧は読み込めていますが、検索条件に一致するフィードバックがありません。
                        </div>
                      </div>
                    )}

                    {visibleFeedbackList.map((item) => {
                    const outputText = getResultTextFromItem(item);
const outputPreview = getResultPreviewText(outputText, 260);
const feedbackSummary = buildFeedbackSummary(item);
const isExpanded = feedbackExpandedId === item.id;
const imageCount = getImageCountFromItem(item);
const inputTextJson = item.request?.input_text_json;
const listingSummary = inputTextJson?.normalized_input?.listing || {};
const rawForm = inputTextJson?.raw_state?.form || {};
const rawProfitForm = inputTextJson?.raw_state?.profitForm || {};
const rawReplyForm = inputTextJson?.raw_state?.replyForm || {};
const baseInfoPreview = getResultPreviewText(
  listingSummary?.baseInfo || rawForm?.baseInfo || "",
  180
);
const replyQuestionPreview = getResultPreviewText(
  rawReplyForm?.question || "",
  180
);
                      return (
                        <div
                          key={item.id}
                          style={{
                            ...cardStyle,
                            padding: isMobile ? 16 : 24,
                            border: isExpanded ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
                            boxShadow: isExpanded ? "0 0 0 2px rgba(197,164,75,0.08)" : "none",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 12,
                              marginBottom: 14,
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <div
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  background: `${T.accent}16`,
                                  border: `1px solid ${T.accent}35`,
                                  fontSize: 12,
                                  color: T.accent,
                                  fontWeight: 600,
                                }}
                              >
                                {getFeatureLabel(item.feature_type)}
                              </div>

                              <div
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  background:
                                    item.rating === "good"
                                      ? `${T.success}14`
                                      : item.rating === "bad"
                                      ? `${T.danger}14`
                                      : `${T.warning}14`,
                                  border:
                                    item.rating === "good"
                                      ? `1px solid ${T.success}35`
                                      : item.rating === "bad"
                                      ? `1px solid ${T.danger}35`
                                      : `1px solid ${T.warning}35`,
                                  fontSize: 12,
                                  color:
                                    item.rating === "good"
                                      ? T.success
                                      : item.rating === "bad"
                                      ? T.danger
                                      : T.warning,
                                  fontWeight: 600,
                                }}
                              >
                                {getRatingLabel(item.rating)}
                              </div>

                              <div
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  background: T.surfaceAlt,
                                  border: `1px solid ${T.border}`,
                                  fontSize: 12,
                                  color: T.textMuted,
                                }}
                              >
                                {getIssueLabel(item.issue_type)}
                              </div>

                              <div
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  background: T.surfaceAlt,
                                  border: `1px solid ${T.border}`,
                                  fontSize: 12,
                                  color: T.textDim,
                                }}
                              >
                                画像 {imageCount}枚
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: T.textDim,
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  border: `1px solid ${T.border}`,
                                  background: T.surfaceAlt,
                                }}
                              >
                                {formatDateTime(item.created_at)}
                              </div>

                              <button
                                onClick={() =>
                                  setFeedbackExpandedId((prev) => (prev === item.id ? "" : item.id))
                                }
                                style={{
                                  ...btnStyle("ghost"),
                                  padding: "8px 12px",
                                  fontSize: 12,
                                }}
                              >
                                {isExpanded ? "詳細を閉じる" : "詳細を開く"}
                              </button>
                            </div>
                          </div>

                                   <div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr 1fr",
    gap: 12,
    marginBottom: 14,
  }}
>
                            <div
                              style={{
                                background: T.surfaceAlt,
                                border: `1px solid ${T.border}`,
                                borderRadius: 8,
                                padding: "12px 14px",
                                fontSize: 12,
                                lineHeight: 1.7,
                              }}
                            >
                              <div style={{ color: T.textDim, marginBottom: 4 }}>ユーザー</div>
                              <div style={{ color: T.text, fontWeight: 600 }}>
                                {item.profile?.display_name || "名称未設定"}
                              </div>
                              <div style={{ color: T.textMuted }}>
                                {item.profile?.email || "-"}
                              </div>
                            </div>

                            <div
  style={{
    background: T.surfaceAlt,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 12,
    lineHeight: 1.7,
  }}
>
  <div style={{ color: T.textDim, marginBottom: 4 }}>request_id</div>
  <div style={{ color: T.text, fontWeight: 600 }}>
    {getShortRequestId(item.request_id)}
  </div>
  {item.request_id && (
    <div style={{ marginTop: 8 }}>
      <CopyButton text={item.request_id} />
    </div>
  )}
  <div style={{ color: T.textMuted }}>
    feature_type: {item.feature_type || "-"}
  </div>
</div>
                            <div
                              style={{
                                background: T.surfaceAlt,
                                border: `1px solid ${T.border}`,
                                borderRadius: 8,
                                padding: "12px 14px",
                                fontSize: 12,
                                lineHeight: 1.7,
                              }}
                            >
                              <div style={{ color: T.textDim, marginBottom: 4 }}>補足</div>
                              <div style={{ color: T.text, fontWeight: 600 }}>
                                {getIssueLabel(item.issue_type)}
                              </div>
                              <div style={{ color: T.textMuted }}>
                                schema: {inputTextJson?.schema_version || "-"}
                              </div>
                            </div>
                          </div>

                                                    {isExpanded && (
                            <div
                              style={{
                                background: "#efe9d9",
                                border: `1px solid ${T.border}`,
                                borderRadius: 8,
                                padding: 14,
                                marginBottom: 14,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  color: T.textDim,
                                  marginBottom: 10,
                                  fontWeight: 600,
                                }}
                              >
                                重要項目サマリー
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>ブランド</div>
                                  <div style={{ color: T.text, fontWeight: 600 }}>
                                    {listingSummary?.brand || "-"}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>アイテム</div>
                                  <div style={{ color: T.text, fontWeight: 600 }}>
                                    {listingSummary?.item || "-"}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>年代</div>
                                  <div style={{ color: T.text, fontWeight: 600 }}>
                                    {listingSummary?.era || "-"}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>素材</div>
                                  <div style={{ color: T.text, fontWeight: 600 }}>
                                    {listingSummary?.material || "-"}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>カラー</div>
                                  <div style={{ color: T.text, fontWeight: 600 }}>
                                    {listingSummary?.color || "-"}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>サイズ表記</div>
                                  <div style={{ color: T.text, fontWeight: 600 }}>
                                    {listingSummary?.sizeLabel || "-"}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>状態</div>
                                  <div style={{ color: T.text, fontWeight: 600 }}>
                                    {listingSummary?.condition || "-"}
                                    {listingSummary?.conditionNote ? ` / ${listingSummary.conditionNote}` : ""}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>画像 / prompt</div>
                                  <div style={{ color: T.text, fontWeight: 600 }}>
                                    {inputTextJson?.prompt_context?.image_count_for_prompt ?? 0}枚 / {inputTextJson?.prompt_context?.prompt_name || "-"}
                                  </div>
                                </div>
                              </div>

                              <div
                                style={{
                                  marginTop: 10,
                                  display: "grid",
                                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>実寸</div>
                                  <div style={{ color: T.text, fontWeight: 600, lineHeight: 1.8 }}>
                                    着丈: {listingSummary?.length || "___"} / 身幅: {listingSummary?.width || "___"} / 肩幅: {listingSummary?.shoulder || "___"} / 袖丈: {listingSummary?.sleeve || "___"}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>ページ / feature</div>
                                  <div style={{ color: T.text, fontWeight: 600, lineHeight: 1.8 }}>
                                    {inputTextJson?.page || "-"} / {inputTextJson?.feature_type || "-"}
                                  </div>
                                </div>
                              </div>

                              {!!baseInfoPreview && (
                                <div
                                  style={{
                                    marginTop: 10,
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                    lineHeight: 1.8,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>ベース情報プレビュー</div>
                                  <div style={{ color: T.text, whiteSpace: "pre-wrap" }}>
                                    {baseInfoPreview}
                                  </div>
                                </div>
                              )}

                              {(rawProfitForm?.purchasePrice || rawProfitForm?.shipping) && (
                                <div
                                  style={{
                                    marginTop: 10,
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                    lineHeight: 1.8,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>利益計算入力</div>
                                  <div style={{ color: T.text }}>
                                    仕入れ価格: {rawProfitForm?.purchasePrice || "-"} / 送料: {rawProfitForm?.shipping || "-"}
                                  </div>
                                </div>
                              )}

                              {!!replyQuestionPreview && (
                                <div
                                  style={{
                                    marginTop: 10,
                                    background: "#f7f1e5",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 12,
                                    lineHeight: 1.8,
                                  }}
                                >
                                  <div style={{ color: T.textDim, marginBottom: 4 }}>質問文プレビュー</div>
                                  <div style={{ color: T.text, whiteSpace: "pre-wrap" }}>
                                    {replyQuestionPreview}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr 1fr",
                              gap: 12,
                              marginBottom: 14,
                            }}
                          >
                            <div
                              style={{
                                background: T.surfaceAlt,
                                border: `1px solid ${T.border}`,
                                borderRadius: 8,
                                padding: "12px 14px",
                                fontSize: 13,
                                lineHeight: 1.8,
                                color: T.text,
                              }}
                            >
                              <div style={{ fontSize: 12, color: T.textDim, marginBottom: 6 }}>コメント</div>
                              {item.comment || "コメントなし"}
                            </div>

                            <div
                              style={{
                                background: T.surfaceAlt,
                                border: `1px solid ${T.border}`,
                                borderRadius: 8,
                                padding: "12px 14px",
                                fontSize: 12,
                                lineHeight: 1.8,
                                color: T.text,
                              }}
                            >
                              <div style={{ fontSize: 12, color: T.textDim, marginBottom: 6 }}>生成結果プレビュー</div>
                              <div style={{ whiteSpace: "pre-wrap" }}>
                                {outputPreview || "生成結果なし"}
                              </div>
                            </div>
                          </div>

                          {!!feedbackSummary && (
                            <div
                              style={{
                                marginBottom: 14,
                                background: `${T.accent}12`,
                                border: `1px solid ${T.accent}30`,
                                borderRadius: 8,
                                padding: "12px 14px",
                                fontSize: 12,
                                lineHeight: 1.8,
                                color: T.text,
                              }}
                            >
                              <div style={{ fontSize: 12, color: T.textDim, marginBottom: 6 }}>修正情報</div>
                              {feedbackSummary}
                            </div>
                          )}

                           {isExpanded && (
  <div
    style={{
      display: "grid",
      gap: 12,
      marginTop: 12,
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
        gap: 10,
      }}
    >
      <div
        style={{
          background: "#efe9d9",
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 12,
        }}
      >
        <div style={{ color: T.textDim, marginBottom: 4 }}>page</div>
        <div style={{ color: T.text, fontWeight: 600 }}>
          {inputTextJson?.page || "-"}
        </div>
      </div>

      <div
        style={{
          background: "#efe9d9",
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 12,
        }}
      >
        <div style={{ color: T.textDim, marginBottom: 4 }}>uses_images</div>
        <div style={{ color: T.text, fontWeight: 600 }}>
          {String(inputTextJson?.prompt_context?.uses_images ?? "-")}
        </div>
      </div>

      <div
        style={{
          background: "#efe9d9",
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 12,
        }}
      >
        <div style={{ color: T.textDim, marginBottom: 4 }}>image_count</div>
        <div style={{ color: T.text, fontWeight: 600 }}>
          {inputTextJson?.prompt_context?.image_count_for_prompt ?? 0}
        </div>
      </div>

      <div
        style={{
          background: "#efe9d9",
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 12,
        }}
      >
        <div style={{ color: T.textDim, marginBottom: 4 }}>current_page</div>
        <div style={{ color: T.text, fontWeight: 600 }}>
          {inputTextJson?.ui_context?.current_page || "-"}
        </div>
      </div>
    </div>

    <div>
      <div style={{ fontSize: 12, color: T.textDim, marginBottom: 6 }}>
        input_text_json
      </div>
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "#efe9d9",
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: 12,
          fontSize: 11,
          lineHeight: 1.7,
          color: T.text,
          maxHeight: 260,
          overflowY: "auto",
        }}
      >
        {prettyJson(item.request?.input_text_json)}
      </pre>
    </div>

  <div>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
      flexWrap: "wrap",
    }}
  >
    <div style={{ fontSize: 12, color: T.textDim }}>
      output_json
    </div>

    <button
      onClick={() =>
        setFeedbackOutputExpandedId((prev) =>
          prev === item.id ? "" : item.id
        )
      }
      style={{
        ...btnStyle("ghost"),
        padding: "6px 10px",
        fontSize: 11,
      }}
    >
      {feedbackOutputExpandedId === item.id ? "閉じる" : "全文を表示"}
    </button>
  </div>

  <pre
    style={{
      margin: 0,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      background: "#efe9d9",
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: 12,
      fontSize: 11,
      lineHeight: 1.7,
      color: T.text,
      maxHeight: feedbackOutputExpandedId === item.id ? "none" : 220,
      overflowY: feedbackOutputExpandedId === item.id ? "visible" : "auto",
    }}
  >
    {prettyJson(item.request?.output_json)}
  </pre>
</div>

    <div>
      <div style={{ fontSize: 12, color: T.textDim, marginBottom: 6 }}>
        feedback row
      </div>
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "#efe9d9",
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: 12,
          fontSize: 11,
          lineHeight: 1.7,
          color: T.text,
          maxHeight: 220,
          overflowY: "auto",
        }}
      >
        {prettyJson({
          id: item.id,
          request_id: item.request_id,
          feature_type: item.feature_type,
          rating: item.rating,
          issue_type: item.issue_type,
          comment: item.comment,
          corrected_brand: item.corrected_brand,
          corrected_category: item.corrected_category,
          corrected_era: item.corrected_era,
          corrected_condition: item.corrected_condition,
          created_at: item.created_at,
        })}
      </pre>
    </div>
  </div>
)}
                        </div>
                      );
                    })}

                    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center" }}>
                      <button
                        style={{ ...btnStyle("ghost"), width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                        onClick={() => loadFeedbackList(Math.max(feedbackListOffset - FEEDBACK_PAGE_SIZE, 0))}
                        disabled={feedbackListLoading || feedbackListOffset === 0}
                      >
                        前の{FEEDBACK_PAGE_SIZE}件
                      </button>

                      <div style={{ fontSize: 12, color: T.textDim, textAlign: "center" }}>
                        {feedbackListTotal > 0 ? `${Math.floor(feedbackListOffset / FEEDBACK_PAGE_SIZE) + 1}ページ目` : "0ページ"}
                      </div>

                      <button
                        style={{ ...btnStyle("ghost"), width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                        onClick={() => loadFeedbackList(feedbackListOffset + FEEDBACK_PAGE_SIZE)}
                        disabled={feedbackListLoading || feedbackListOffset + FEEDBACK_PAGE_SIZE >= feedbackListTotal}
                      >
                        次の{FEEDBACK_PAGE_SIZE}件
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {(loading || result || marketResearchSummary || marketResearchSummaryError) && (
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={cardTitleStyle}>
                    <Sparkles size={15} />
                    {loading ? "AIが生成中です..." : hasResultError ? "エラー" : "生成結果"}
                  </div>
                  {result && <CopyButton text={result} />}
                </div>

                {loading ? (
                  <div style={{ textAlign: "center", padding: isMobile ? 24 : 40 }}>
                    <Loader2 size={28} color={T.accent} style={{ animation: "spin 1s linear infinite" }} />
                    <div style={{ fontSize: 13, color: T.textMuted, marginTop: 14 }}>
                      分析・生成しています…
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      background: T.surfaceAlt,
                      border: `1px solid ${hasResultError ? T.danger : T.border}`,
                      borderRadius: 10,
                      padding: isMobile ? 14 : 20,
                      whiteSpace: "pre-wrap",
                      fontSize: 13,
                      lineHeight: 1.8,
                      maxHeight: isMobile ? "none" : 600,
                      overflowY: "auto",
                      color: hasResultError ? T.danger : T.text,
                    }}
                  >
                    {result}
                  </div>
                )}

                {!!result && !loading && !hasResultError && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${requestId ? T.success : T.warning}40`,
                      background: requestId ? `${T.success}14` : `${T.warning}14`,
                      color: requestId ? T.success : T.warning,
                      fontSize: 12,
                      lineHeight: 1.7,
                    }}
                  >
                    {requestId
                      ? "この生成結果は保存対象として記録できています。続けてフィードバック送信もできます。"
                      : `生成結果は表示できていますが、保存準備でエラーが出ています: ${requestSaveError || "unknown_error"}`}
                  </div>
                )}

                {!!result && !loading && !hasResultError && (
                  <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                    <div style={cardTitleStyle}>
                      <MessageCircle size={15} /> この結果のフィードバック
                    </div>

                    <div style={{ marginBottom: 12, fontSize: 12, color: T.textDim }}>
                      生成結果が良かったか、修正したい点があれば記録できます。
                    </div>

                    <FieldGroup label="評価">
                      <select
                        style={inputStyle}
                        value={feedback.rating}
                        onChange={(e) => uf("rating", e.target.value)}
                      >
                        <option value="">選択してください</option>
                        <option value="good">良かった</option>
                        <option value="close">惜しい</option>
                        <option value="bad">修正が必要</option>
                      </select>
                    </FieldGroup>

                    <FieldGroup label="修正したい点">
                      <select
                        style={inputStyle}
                        value={feedback.issueType}
                        onChange={(e) => uf("issueType", e.target.value)}
                      >
                        {FEEDBACK_ISSUES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </FieldGroup>

                    <FieldGroup label="自由コメント">
                      <textarea
                        style={{ ...textareaStyle, minHeight: 120 }}
                        placeholder="例：ブランドは合っているけど、アイテム名と状態説明を直したいです。"
                        value={feedback.comment}
                        onChange={(e) => uf("comment", e.target.value)}
                      />
                    </FieldGroup>

                    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12 }}>
                      <button
                        style={{ ...btnStyle("primary"), width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                        onClick={submitFeedback}
                        disabled={feedbackLoading}
                      >
                        {feedbackLoading ? (
                          <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                        ) : (
                          <Send size={15} />
                        )}
                        {feedbackLoading ? "送信中..." : "フィードバックを送信"}
                      </button>

                      <button
                        style={{ ...btnStyle("ghost"), width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                        onClick={resetFeedback}
                      >
                        <RotateCcw size={14} /> フォームをクリア
                      </button>
                    </div>

                    {!!feedbackMessage && (
                      <div
                        style={{
                          marginTop: 14,
                          padding: "12px 14px",
                          borderRadius: 8,
                          background: feedbackMessageType === "success" ? `${T.success}14` : `${T.danger}14`,
                          border: `1px solid ${feedbackMessageType === "success" ? T.success : T.danger}40`,
                          color: feedbackMessageType === "success" ? T.success : T.danger,
                          fontSize: 13,
                          lineHeight: 1.7,
                        }}
                      >
                        {feedbackMessage}
                      </div>
                    )}
                  </div>
                )}

                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
          </div>
          </div>
          </div>
      </div>
    );
}
