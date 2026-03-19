# FURIGI TOOL デプロイ手順書

## 概要

FURIGI TOOLを独立したWebアプリとして公開するための手順です。
Vercel（無料）を使って、最短15分で公開できます。

---

## 必要なもの

1. **GitHubアカウント**（無料） → https://github.com
2. **Vercelアカウント**（無料） → https://vercel.com
3. **Anthropic APIキー**（従量課金） → https://console.anthropic.com

---

## コスト目安

| 項目 | 費用 |
|------|------|
| Vercelホスティング | 無料（個人利用） |
| ドメイン | 無料（xxxxx.vercel.app） |
| Anthropic API | 1回の生成 ≒ 3〜8円 |
| **月100回利用の場合** | **約300〜800円/月** |

※ 写真を多く添付するほど1回あたりの料金が上がります

---

## 手順

### STEP 1: Anthropic APIキーを取得

1. https://console.anthropic.com にアクセス
2. アカウントを作成（またはログイン）
3. 左メニュー「API Keys」→「Create Key」
4. キーをコピーして安全な場所に保存
5. 「Plans & Billing」でクレジットを追加（$5〜でOK）

### STEP 2: GitHubにコードをアップロード

1. https://github.com にログイン
2. 右上の「+」→「New repository」
3. Repository name: `furigi-tool`（好きな名前でOK）
4. 「Private」を選択（公開したくない場合）
5. 「Create repository」をクリック

次に、ダウンロードしたファイルをアップロードします。

**方法A: GitHub上で直接アップロード（簡単）**

1. 作成したリポジトリページで「uploading an existing file」をクリック
2. ダウンロードしたフォルダ内の全ファイルをドラッグ&ドロップ
3. 「Commit changes」をクリック

※ フォルダ構造が以下のようになっていることを確認：

```
furigi-tool/
├── app/
│   ├── api/
│   │   └── generate/
│   │       └── route.js      ← APIキーを安全に管理するサーバー側
│   ├── layout.js
│   └── page.js               ← メインのアプリ画面
├── package.json
├── next.config.js
├── .env.example
└── .gitignore
```

**方法B: Git コマンドを使う（慣れている方）**

```bash
cd furigi-tool
git init
git add .
git commit -m "初回コミット"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/furigi-tool.git
git push -u origin main
```

### STEP 3: Vercelでデプロイ

1. https://vercel.com にアクセスし、GitHubアカウントでログイン
2. 「Add New...」→「Project」
3. GitHubリポジトリ一覧から `furigi-tool` を選択し「Import」
4. 設定画面で以下を確認：
   - Framework Preset: **Next.js**（自動検出されるはず）
   - Root Directory: そのまま
5. **「Environment Variables」を展開し、以下を追加：**

   | Key | Value |
   |-----|-------|
   | `ANTHROPIC_API_KEY` | `sk-ant-xxxxx...`（STEP 1で取得したキー） |

6. 「Deploy」をクリック

**2〜3分でデプロイ完了！**

完了すると `https://furigi-tool.vercel.app` のようなURLが発行されます。

---

## 使い方

1. 発行されたURLにアクセス
2. サイドバーから機能を選択（出品文章生成、商品分析、etc.）
3. 商品写真をアップロード＋商品情報を入力
4. 「出品文章を生成」ボタンをクリック
5. 生成された文章を「コピー」ボタンでメルカリに貼り付け

---

## よくある質問

### Q: URLを自分だけが使えるようにしたい

Vercelの無料プランでは簡易的なアクセス制限が難しいですが、
以下の方法があります：

- URLを誰にも共有しない（推測されにくいURLなので基本安全）
- より本格的には `app/api/generate/route.js` にパスワード認証を追加

### Q: APIキーが漏洩しないか心配

APIキーはVercelのサーバー側（Environment Variables）に保存され、
ブラウザには一切送信されません。`route.js` がサーバーサイドで
Anthropic APIを呼び出す仕組みなので安全です。

### Q: デプロイ後にコードを更新したい

GitHubにpush（またはファイルをアップロード）するだけで
Vercelが自動的に再デプロイします。

### Q: スマホからも使えますか？

はい、レスポンシブ対応しているのでスマホからも利用可能です。

---

## トラブルシューティング

| 症状 | 対処法 |
|------|--------|
| デプロイ失敗 | Vercelのログを確認。package.jsonの構文エラーが多い |
| 「APIキーが設定されていません」 | Vercelの Settings → Environment Variables を確認 |
| 生成が遅い | 写真の枚数を減らす。通常10〜30秒かかります |
| 「API呼び出しに失敗」 | Anthropicのクレジット残高を確認 |
