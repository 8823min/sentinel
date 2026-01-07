# Sentinel - 勉強管理 Discord Bot

自己規律支援を目的とした勉強管理Discord Botです。

## 機能

- 学習制限機能（チャンネル閲覧制限）
- Discord活動監視（浮上数カウント）
- Twitter活動監視（Nitter経由）
- 週次・月次レポート自動送信
- 管理者・制限回避検知

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

プロジェクトルートに `.env` ファイルを作成し、以下の内容を設定してください：

**Windows (PowerShell):**
```powershell
New-Item -Path .env -ItemType File
```

**Linux/Mac:**
```bash
touch .env
```

`.env` ファイルに以下を記述：

```env
# Discord Bot設定（必須）
DISCORD_TOKEN=your_bot_token_here

# Discord Bot設定（オプション）
# DISCORD_CLIENT_ID=your_client_id_here  # 未指定の場合は自動取得
# DISCORD_GUILD_ID=your_guild_id_here    # 未指定の場合はグローバルコマンドとして登録

# データベース設定
DATABASE_PATH=./data/sentinel.db

# ヘルスチェックサーバー設定（オプション、デフォルト: 8000）
# Koyebなどのクラウドプラットフォームでは自動的にPORTが設定されます
PORT=8000

# タイムゾーン設定（オプション、デフォルト: Asia/Tokyo）
TZ=Asia/Tokyo
```

**重要:** 
- `DISCORD_TOKEN`: Discord Developer Portalで取得したBotトークン（**必須**）
- `DISCORD_CLIENT_ID`: BotのアプリケーションID（オプション、未指定の場合は自動取得）
- `DISCORD_GUILD_ID`: 開発用サーバーID（オプション、指定するとギルドコマンドとして即座に反映、未指定の場合はグローバルコマンド）

### 3. Botの起動

```bash
npm start
```

開発モード（ファイル変更を監視）：

```bash
npm run dev
```

### 4. ヘルスチェックエンドポイント

Botが起動すると、ヘルスチェック用のHTTPサーバーも自動的に起動します（デフォルト: ポート8000）。

利用可能なエンドポイント：

- **`GET /health`** - ヘルスチェック（Koyeb等のプラットフォーム用）
  - Bot稼働中: `200 OK`
  - Bot未起動: `503 Service Unavailable`

- **`GET /status`** - 詳細ステータス
  - Bot情報、接続サーバー数、メモリ使用量、WebSocket Ping等

- **`GET /ping`** - シンプルなPing応答
  - 常に `200 OK` を返す

例：
```bash
# ヘルスチェック
curl http://localhost:8000/health

# 詳細ステータス
curl http://localhost:8000/status
```

## プロジェクト構造

```
sentinel/
├── src/
│   ├── index.js              # メインエントリーポイント
│   ├── config/
│   │   └── database.js       # データベース接続設定
│   ├── database/
│   │   └── schema.js         # データベーススキーマ
│   ├── utils/
│   │   ├── embed.js          # Embedユーティリティ
│   │   ├── db.js             # データベース操作ユーティリティ
│   │   └── roles.js           # ロール・チャンネル管理ユーティリティ
│   └── commands/             # スラッシュコマンド
│       ├── setup.js          # /study setup
│       ├── start.js          # /study start
│       ├── stop.js           # /study stop
│       └── status.js         # /study status
├── data/                     # データベースファイル（自動生成）
├── package.json
├── .env.example
└── README.md
```

## データベース

SQLiteを使用してデータを永続化します。以下のテーブルが自動的に作成されます：

- `users` - ユーザー情報
- `restrictions` - 制限期間
- `discord_activity` - Discord活動記録
- `twitter_activity` - Twitter活動記録
- `warnings` - 警告履歴

## 要件定義

詳細な要件定義は `設計要件.md` を参照してください。

## Koyebへのデプロイ

Koyebにデプロイする際の設定：

### 1. 環境変数の設定

Koyebのダッシュボードで以下の環境変数を設定してください：

```
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_guild_id_here (オプション)
DATABASE_PATH=./data/sentinel.db
TZ=Asia/Tokyo
```

**注意:** `PORT` 環境変数はKoyebが自動的に設定するため、手動で設定する必要はありません。

### 2. ヘルスチェックの設定

Koyebのサービス設定で以下を指定：

- **Health Check Path:** `/health`
- **Health Check Port:** `8000` (または環境変数 `PORT` で指定したポート)
- **Health Check Protocol:** `HTTP`
- **Grace Period:** `60` 秒（Botの起動に時間がかかる場合があるため）

### 3. ビルド設定

- **Build Command:** (空欄でOK、依存関係は自動インストール)
- **Run Command:** `npm start`

### 4. その他の推奨設定

- **Instance Type:** Nano または Micro（軽量なBotの場合）
- **Regions:** 最も近いリージョンを選択（例: Frankfurt）
- **Auto-deploy:** `main` ブランチへのプッシュで自動デプロイ

## ライセンス

MIT

