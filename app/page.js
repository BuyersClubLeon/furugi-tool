"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createSupabaseBrowser } from "../lib/supabase";
import {
  Camera, FileText, TrendingUp, Calculator, Shield,
  MessageCircle, Menu, X, Loader2, Copy, Check,
  Sparkles, Package, Send, RotateCcw, ImagePlus, LogOut,
} from "lucide-react";

/* ── API呼び出し（server proxy経由） ── */
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
const [marketResearchSummaryError, setMarketResearchSummaryError] = useState("");

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

const [marketResearchSummaryLoading, setMarketResearchSummaryLoading] = useState(false);

useEffect(() => {
  if (page !== "listing") {
    setMarketResearchSummary(null);
    setMarketResearchSummaryLoading(false);
    setMarketResearchSummaryError("");
    return;
  }

  const fetchMarketResearchResult = async () => {
    const runIdFromUrl = new URLSearchParams(window.location.search).get("run_id");

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
        setMarketResearchSummaryError("market research の結果取得に失敗しました。"
... omitted for brevity identical remainder from current main ...
