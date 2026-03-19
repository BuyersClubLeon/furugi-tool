# FURIGI TOOL デプロイガイド

## 構成と費用

**ホスティング**: Vercel（無料プラン）
**AI**: Anthropic Claude API（従量課金）

### 月額コスト目安
- Vercel: **¥0**（個人利用の無料プランで十分）
- Anthropic API: 1回の文章生成あたり **約¥3〜8**
  - 月100回生成しても **約¥300〜800**
  - APIキーにクレジット上限を設定可能

---

## 準備するもの

1. **GitHubアカウント**（無料）→ https://github.com
2. **Vercelアカウント**（無料）→ https://vercel.com（GitHubで登録可）
3. **Anthropic APIキー**（従量課金）→ https://console.anthropic.com

---

## 手順

### STEP 1: Anthropic APIキーを取得

1. https://console.anthropic.com にアクセス
2. アカウントを作成（クレジットカード必要）
3. 「API Keys」→「Create Key」でキーを発行
4. `sk-ant-...` で始まるキーをコピーして保存
5. 「Settings」→「Spending Limits」で月額上限を設定（例: $10）

### STEP 2: GitHubにリポジトリを作成

1. https://github.com/new にアクセス
2. リポジトリ名: `furigi-tool`（何でもOK）
3. 「Private」を選択（推奨）
4. 「Create repository」をクリック

### STEP 3: プロジェクトファイルをアップロード

#### 方法A: GitHub画面からアップロード（簡単）

1. 作成したリポジトリのページで「uploading an existing file」をクリック
2. ダウンロードしたプロジェクトフォルダ内の全ファイルをドラッグ&ドロップ
3. 「Commit changes」をクリック

**アップロードするファイル構成:**
```
furigi-tool/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.js      ← APIプロキシ（キーをサーバー側で管理）
│   ├── layout.js             ← 全体レイアウト
│   └── page.js               ← メインアプリ
├── public/                    ← 空フォルダ（必要に応じてfavicon等を追加）
├── .gitignore
├── next.config.js
└── package.json
```

#### 方法B: ターミナルから（Git経験者向け）

```bash
cd furigi-tool
git init
git add .
git commit -m "初回コミット"
git remote add origin https://github.com/あなたのユーザー名/furigi-tool.git
git push -u origin main
```

### STEP 4: Vercelにデプロイ

1. https://vercel.com にログイン（GitHub連携）
2. 「Add New」→「Project」をクリック
3. 「Import Git Repository」でfurigi-toolを選択
4. **Environment Variables（環境変数）を設定**（重要!）
   - 「Environment Variables」セクションを開く
   - Name: `ANTHROPIC_API_KEY`
   - Value: STEP 1で取得した `sk-ant-...` キーを貼り付け
   - 「Add」をクリック
5. 「Deploy」をクリック

→ 2〜3分でデプロイ完了。表示されるURL（例: `furigi-tool.vercel.app`）でアクセス可能！

---

## デプロイ後

### アクセス方法
- Vercelが発行したURL（`https://furigi-tool.vercel.app` 等）にアクセスするだけ
- スマホからもアクセス可能

### コード修正時
- GitHubのファイルを編集してコミットすると、Vercelが自動で再デプロイ

### APIキー変更時
- Vercelダッシュボード → Settings → Environment Variables で変更

---

## セキュリティ上の注意

- APIキーは `.env.local`（ローカル）またはVercelの環境変数（本番）にのみ保存
- GitHubにAPIキーを直接書かないこと（`.gitignore`で除外済み）
- 自分だけが使う場合はVercelのPassword Protectionも検討（Proプラン）

---

## トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| 「APIキーが設定されていません」 | Vercelの環境変数が未設定 | VercelのSettings → Environment Variablesを確認 |
| 生成ボタンが反応しない | ブラウザのJSエラー | DevToolsのConsoleを確認 |
| API呼び出しエラー | APIキー無効 or クレジット不足 | Anthropicコンソールで確認 |
| デプロイ失敗 | ファイル構成の問題 | Vercelのログでエラーを確認 |

---

## ローカルで開発する場合

```bash
# プロジェクトフォルダに移動
cd furigi-tool

# 依存パッケージをインストール
npm install

# 環境変数ファイルを作成
cp .env.local.example .env.local
# .env.local を編集してAPIキーを入力

# 開発サーバーを起動
npm run dev

# ブラウザで http://localhost:3000 にアクセス
```
