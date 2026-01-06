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

## ライセンス

MIT

