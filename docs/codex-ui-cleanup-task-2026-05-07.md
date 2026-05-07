# Codex実行用タスク: UI見出し・案内文整理 2026-05-07

## 目的

FURIGI TOOL の出品文作成画面を、既存機能を壊さずに使いやすく整理する。

このタスクは、market/API/DB工程とは完全に分離して行う。

---

## 最重要ルール

- Codexでできることは自動実行する
- ユーザーへの許可取りは不要
- 作業後に、実施内容・結果・ユーザー確認が必要な点だけ報告する
- ユーザーに手動作業を依頼するのは、本番画面の目視確認など本人確認が必要な場合だけ

---

## 作業前確認

```bash
cd /Users/seiya/Documents/GitHub/furugi-tool
pwd
git status --short
git pull --ff-only origin main
```

期待する作業ディレクトリ:

```text
/Users/seiya/Documents/GitHub/furugi-tool
```

---

## 今回変更してよい範囲

```text
app/page.js
```

ただし、変更はUIの見出し・案内文・余白の軽微な整理に限定する。

---

## 絶対に触らない範囲

```text
app/api/*
supabase/*
app/api/market-research/route.js
app/api/market-research-plan/route.js
market_items
market_item_snapshots
SQL
RLS policy
市場データ取得
平均価格計算
SEO生成
market UI 本実装
```

---

## 実装内容

### 1. 商品写真エリア

現在の見出し:

```text
商品写真
```

必要なら補足文を追加する。

候補文:

```text
まず商品写真をアップロードしてください。写真から読み取れる範囲で、ブランド名・アイテム名・カラーなどを自動入力できます。
```

---

### 2. 写真から自動入力ボタン付近

ボタンの意味が分かるように、近くに短い説明を追加する。

候補文:

```text
写真解析後、読み取れた内容を商品情報へ反映できます。
```

---

### 3. 市場調査結果カード

既存の機能は変えない。

以下の仕様は維持する。

- `商品情報へ反映` ボタン
- 反映できる項目だけ表示
- 反映できない場合は disabled
- 採寸は手入力案内を出す
- フォーム側の入力済み項目は上書きしない

文言だけ、必要に応じて分かりやすくする。

---

### 4. 商品情報エリア

現在の見出し:

```text
商品情報
```

補足文候補:

```text
入力された内容をもとに、タイトル・説明文・検索キーワードを作成します。不明な項目は空欄のままで問題ありません。
```

---

### 5. 採寸エリア

既存の採寸未取得ガイドを分かりやすくする。

現在の意味:

```text
市場調査では採寸数値を取得できませんでした。
着丈・身幅・肩幅・袖丈を手入力してください。
```

候補文:

```text
採寸は写真から取得できない場合があります。未入力でも文章生成は可能です。必要に応じて、着丈・身幅・肩幅・袖丈を手入力してください。
```

---

### 6. 生成結果エリア

生成結果の見出しを分かりやすくする。

候補:

```text
生成結果
```

補足文候補:

```text
内容を確認し、必要に応じてコピーして出品ページへ貼り付けてください。
```

---

## 変更方針

- ロジック変更はしない
- API呼び出しは変更しない
- DB操作は変更しない
- 既存の関数名は変えない
- ボタンの onClick は変えない
- state構造は変えない
- 見出し、補足文、軽微な余白調整だけにする

---

## 確認コマンド

```bash
npm run build
git diff --check
git status --short
```

環境変数不足で build が途中停止する場合でも、`Compiled successfully` まで進んでいるか確認する。

---

## コミット

`app/page.js` だけをaddする。

```bash
git add app/page.js
git commit -m "Improve listing UI guidance copy"
git push origin main
```

`git add .` は使わない。

---

## 反映確認

```bash
git rev-parse --short HEAD
git ls-remote origin main | awk '{print substr($1,1,7)}'
```

2つの短縮SHAが一致することを確認する。

---

## Vercel本番反映

```bash
npx vercel --prod --force
```

確認URL:

```text
https://furugi-tool.vercel.app/?v=<短縮SHA>
```

ユーザー確認が必要な場合のみ、以下を案内する。

```text
上記URLを開いて Command + Shift + R を押してください。
```

---

## 完了条件

- `app/page.js` のみ変更
- API/DB/Supabaseに変更なし
- buildまたは構文確認完了
- mainへpush済み
- 本番確認URLを出せる状態
