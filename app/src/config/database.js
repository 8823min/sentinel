import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * データベース接続を取得
 * @param {string} dbPath - データベースファイルのパス
 * @returns {Database} SQLiteデータベースインスタンス
 */
export function getDatabase(dbPath = null) {
  const defaultPath = path.join(__dirname, '../../data/sentinel.db');
  const finalPath = dbPath || process.env.DATABASE_PATH || defaultPath;
  
  // データベースディレクトリが存在しない場合は作成
  const dbDir = path.dirname(finalPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  const db = new Database(finalPath);
  db.pragma('journal_mode = WAL'); // Write-Ahead Logging を有効化
  
  return db;
}

