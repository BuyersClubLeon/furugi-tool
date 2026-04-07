"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Camera, FileText, TrendingUp, Calculator, Shield,
  MessageCircle, Menu, X, Loader2, Copy, Check,
  Sparkles, Package, Send, RotateCcw, ImagePlus, LogOut,
} from "lucide-react";

/* ── API呼び出し（サーバーサイドプロキシ経由） ── */
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

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.content?.map((b) => b.text || "").join("\n") || "エラーが発生しました";
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

/* ── 出品文章生成プロンプト（修正済み：5項目すべて反映） ── */
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

/* ── 写真自動認識プロンプト ── */
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

/* ── カラートークン ── */
const T = {
  bg: "#EDE8DA", surface: "#E4DFCF", surfaceAlt: "#F5F1E6",
  border: "#D1CBBA", borderLight: "#C2BBA8",
  text: "#1A2A1A", textMuted: "#4A5F4A", textDim: "#7A7662",
  accent: "#C5A44B", accentLight: "#A8872E",
  success: "#3D8B4F", warning: "#B8922A", danger: "#B04040",
};

/* ── ナビゲーション定義 ── */
const NAV = [
  { id: "listing", icon: FileText, label: "出品文章生成", desc: "タイトル・説明文の自動生成" },
  { id: "analysis", icon: TrendingUp, label: "商品分析", desc: "市場分析・価格査定" },
  { id: "profit", icon: Calculator, label: "利益計算", desc: "仕入れ価格から利益算出" },
  { id: "auth", icon: Shield, label: "真贋判定", desc: "真贋チェックポイント分析" },
  { id: "reply", icon: MessageCircle, label: "メルカリ返答", desc: "質問対応の返答文生成" },
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
      <label style={{ fontSize: 12, fontWeight: 500, color: T.textMuted, marginBottom: 6, display: "block" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ImageUploader({ images, setImages, isMobile }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const processFiles = useCallback((files) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(",")[1];
        setImages((prev) => [...prev, { data: base64, type: file.type, name: file.name, preview: e.target.result }]);
      };
      reader.readAsDataURL(file);
    });
  }, [setImages]);

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
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); processFiles(e.dataTransfer.files); }}
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
  const [feedback, setFeedback] = useState({ ...EMPTY_FEEDBACK });
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

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
    condition: "A",
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
    setFeedbackSubmitted(false);
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
      setResult("写真の自動認識に失敗しました: " + err.message);
    }
    setAnalyzing(false);
  };

  const generate = async (type) => {
    setLoading(true);
    setResult("");
    resetFeedback();

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
        (type !== "profit" && type !== "reply") ? imgData : []
      );

      setResult(res);
    } catch (err) {
      setResult("エラー: " + err.message);
    }

    setLoading(false);
  };

  const nav = NAV.find((n) => n.id === page);

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
            {NAV.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  setPage(n.id);
                  setResult("");
                  resetFeedback();
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
                    onClick={() => {
                      setResult("");
                      resetFeedback();
                    }}
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

            {(loading || result) && (
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={cardTitleStyle}>
                    <Sparkles size={15} /> {loading ? "AIが生成中です..." : "生成結果"}
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
                      border: `1px solid ${T.border}`,
                      borderRadius: 10,
                      padding: isMobile ? 14 : 20,
                      whiteSpace: "pre-wrap",
                      fontSize: 13,
                      lineHeight: 1.8,
                      maxHeight: isMobile ? "none" : 600,
                      overflowY: "auto",
                    }}
                  >
                    {result}
                  </div>
                )}
              </div>
            )}

            {!!result && !loading && (
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                <div style={cardTitleStyle}>
                  <MessageCircle size={15} /> この結果のフィードバック
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: T.textDim,
                    marginBottom: 14,
                    padding: "10px 12px",
                    background: T.surfaceAlt,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    lineHeight: 1.7,
                  }}
                >
                  今回の {nav?.label} の結果について、合っていたか確認できます。<br />
                  ※ この版はまず画面だけ追加しています。まだDB保存にはつないでいません。
                </div>

                <FieldGroup label="全体の評価">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { value: "good", label: "良かった" },
                      { value: "close", label: "惜しい" },
                      { value: "bad", label: "修正が必要" },
                    ].map((item) => (
                      <button
                        key={item.value}
                        onClick={() => uf("rating", item.value)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 8,
                          border: `1px solid ${feedback.rating === item.value ? T.accent : T.border}`,
                          background: feedback.rating === item.value ? `${T.accent}20` : "transparent",
                          color: feedback.rating === item.value ? T.accent : T.textMuted,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </FieldGroup>

                <FieldGroup label="どこを直したいですか？">
                  <select
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={feedback.issueType}
                    onChange={(e) => uf("issueType", e.target.value)}
                  >
                    {FEEDBACK_ISSUES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </FieldGroup>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                  <FieldGroup label="正しいブランド名（必要なら）">
                    <input
                      style={inputStyle}
                      placeholder="例: Timberland"
                      value={feedback.correctedBrand}
                      onChange={(e) => uf("correctedBrand", e.target.value)}
                    />
                  </FieldGroup>

                  <FieldGroup label="正しいカテゴリ（必要なら）">
                    <input
                      style={inputStyle}
                      placeholder="例: レザージャケット"
                      value={feedback.correctedCategory}
                      onChange={(e) => uf("correctedCategory", e.target.value)}
                    />
                  </FieldGroup>

                  <FieldGroup label="正しい年代（必要なら）">
                    <input
                      style={inputStyle}
                      placeholder="例: 90s"
                      value={feedback.correctedEra}
                      onChange={(e) => uf("correctedEra", e.target.value)}
                    />
                  </FieldGroup>

                  <FieldGroup label="正しい状態（必要なら）">
                    <input
                      style={inputStyle}
                      placeholder="例: B"
                      value={feedback.correctedCondition}
                      onChange={(e) => uf("correctedCondition", e.target.value)}
                    />
                  </FieldGroup>
                </div>

                <FieldGroup label="自由コメント">
                  <textarea
                    style={{ ...textareaStyle, minHeight: 120 }}
                    placeholder="例: ブランドは合っているけど、アイテム名と状態説明を直したいです。"
                    value={feedback.comment}
                    onChange={(e) => uf("comment", e.target.value)}
                  />
                </FieldGroup>

                <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12 }}>
                  <button
                    style={{ ...btnStyle("primary"), width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                    onClick={() => setFeedbackSubmitted(true)}
                    disabled={!feedback.rating && !feedback.issueType && !feedback.comment}
                  >
                    <Send size={15} /> 入力内容を確認
                  </button>

                  <button
                    style={{ ...btnStyle("ghost"), width: isMobile ? "100%" : "auto", justifyContent: "center" }}
                    onClick={resetFeedback}
                  >
                    <RotateCcw size={14} /> フォームをクリア
                  </button>
                </div>

                {feedbackSubmitted && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "12px 14px",
                      borderRadius: 8,
                      background: `${T.success}14`,
                      border: `1px solid ${T.success}40`,
                      color: T.success,
                      fontSize: 13,
                      lineHeight: 1.7,
                    }}
                  >
                    入力はできています。<br />
                    次の工程で、この内容を `analysis_feedback` に保存するAPIにつなげます。
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
