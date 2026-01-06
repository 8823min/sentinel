import { getDatabase } from '../config/database.js';

/**
 * データベーススキーマを初期化
 * すべてのテーブルを作成する
 */
export function initializeDatabase() {
  const db = getDatabase();

  // users テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      twitter_username TEXT,
      board_channel_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // マイグレーション: board_channel_id カラムが存在しない場合に備えて追加を試みる
  try {
    db.exec(`ALTER TABLE users ADD COLUMN board_channel_id TEXT`);
  } catch (error) {
    // カラムが既に存在する場合はエラーになるので無視
    if (!error.message.includes('duplicate column name')) {
      console.warn('マイグレーション警告:', error.message);
    }
  }

  // restrictions テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS restrictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      start_datetime DATETIME,
      end_datetime DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'inactive',
      -- status: inactive, scheduled, active, expired
      original_roles TEXT, -- 制限開始時に剥奪したロールIDのリスト（JSON形式）
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
  `);

  // マイグレーション: original_roles カラムが存在しない場合に備えて追加
  try {
    db.exec(`ALTER TABLE restrictions ADD COLUMN original_roles TEXT`);
  } catch (error) {
    if (!error.message.includes('duplicate column name')) {
      console.warn('マイグレーション警告(restrictions):', error.message);
    }
  }

  // discord_activity テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS discord_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      activity_date DATE NOT NULL,
      -- 1日1回までカウント（0 or 1）
      has_activity INTEGER NOT NULL DEFAULT 0,
      -- メッセージ送信数
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, activity_date),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
  `);

  // マイグレーション: message_count カラムが存在しない場合に備えて追加を試みる
  try {
    db.exec(`ALTER TABLE discord_activity ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0`);
  } catch (error) {
    if (!error.message.includes('duplicate column name')) {
      console.warn('マイグレーション警告(discord_activity):', error.message);
    }
  }

  // twitter_activity テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS twitter_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      activity_date DATE NOT NULL,
      tweet_count INTEGER,
      -- NULL の場合は N/A（取得失敗）
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, activity_date),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
  `);

  // warnings テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      warning_type TEXT NOT NULL,
      -- warning_type: admin_bypass, activity_increase
      warning_date DATE NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
  `);

  // whitelisted_channels テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS whitelisted_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, channel_id)
    )
  `);

  // インデックス作成
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_restrictions_user_id ON restrictions(user_id);
    CREATE INDEX IF NOT EXISTS idx_restrictions_status ON restrictions(status);
    CREATE INDEX IF NOT EXISTS idx_discord_activity_user_date ON discord_activity(user_id, activity_date);
    CREATE INDEX IF NOT EXISTS idx_twitter_activity_user_date ON twitter_activity(user_id, activity_date);
    CREATE INDEX IF NOT EXISTS idx_warnings_user_date ON warnings(user_id, warning_date);
    CREATE INDEX IF NOT EXISTS idx_whitelisted_channels_guild ON whitelisted_channels(guild_id);
  `);

  console.log('データベーススキーマを初期化しました');

  return db;
}

