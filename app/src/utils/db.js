import { getDatabase } from '../config/database.js';

/**
 * ユーザーを取得または作成
 * @param {string} userId - DiscordユーザーID
 * @returns {Object|null} ユーザー情報
 */
export function getOrCreateUser(userId) {
  const db = getDatabase();

  let user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);

  if (!user) {
    db.prepare('INSERT INTO users (user_id) VALUES (?)').run(userId);
    user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  }

  return user;
}

/**
 * ユーザーのTwitterユーザー名を設定
 * @param {string} userId - DiscordユーザーID
 * @param {string} twitterUsername - Twitterユーザー名
 */
export function setTwitterUsername(userId, twitterUsername) {
  const db = getDatabase();
  db.prepare('UPDATE users SET twitter_username = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
    .run(twitterUsername, userId);
}

/**
 * ユーザーの個人掲示板チャンネルIDを設定
 * @param {string} userId - DiscordユーザーID
 * @param {string} channelId - チャンネルID
 */
export function updateUserBoardChannel(userId, channelId) {
  const db = getDatabase();
  db.prepare('UPDATE users SET board_channel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
    .run(channelId, userId);
}

/**
 * 制限情報を取得
 * @param {string} userId - DiscordユーザーID
 * @returns {Object|null} 制限情報
 */
export function getRestriction(userId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM restrictions 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get(userId);
}

/**
 * 制限を開始（新規作成または上書き）
 * @param {string} userId - DiscordユーザーID
 * @param {string|null} startDatetime - 開始日時（ISO形式、nullの場合は即座に開始）
 * @param {string} endDatetime - 終了日時（ISO形式、必須）
 * @param {Array<string>} originalRoles - 元のロールIDリスト（デフォルト: []）
 * @returns {Object} 作成された制限情報
 */
export function createRestriction(userId, startDatetime, endDatetime, originalRoles = []) {
  const db = getDatabase();

  // 既存の制限を無効化（上書き時）
  db.prepare(`
    UPDATE restrictions 
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
    WHERE user_id = ? AND status IN ('scheduled', 'active')
  `).run(userId);

  // 状態を決定
  const now = new Date().toISOString();
  let status = 'scheduled';
  if (!startDatetime || startDatetime <= now) {
    status = 'active';
  }

  const rolesJson = JSON.stringify(originalRoles);

  // 新しい制限を作成
  const result = db.prepare(`
    INSERT INTO restrictions (user_id, start_datetime, end_datetime, status, original_roles)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, startDatetime || now, endDatetime, status, rolesJson);

  return db.prepare('SELECT * FROM restrictions WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * 制限を解除（状態をexpiredに変更）
 * @param {string} userId - DiscordユーザーID
 */
export function stopRestriction(userId) {
  const db = getDatabase();
  db.prepare(`
    UPDATE restrictions 
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
    WHERE user_id = ? AND status IN ('scheduled', 'active')
  `).run(userId);
}

/**
 * アクティブな制限を取得（scheduled または active）
 * @param {string} userId - DiscordユーザーID
 * @returns {Object|null} 制限情報
 */
export function getActiveRestriction(userId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM restrictions 
    WHERE user_id = ? AND status IN ('scheduled', 'active')
    ORDER BY created_at DESC 
    LIMIT 1
  `).get(userId);
}

/**
 * ホワイトリストにチャンネルを追加
 * @param {string} guildId - サーバーID
 * @param {string} channelId - チャンネルID
 */
export function addWhitelistedChannel(guildId, channelId) {
  const db = getDatabase();
  try {
    db.prepare('INSERT INTO whitelisted_channels (guild_id, channel_id) VALUES (?, ?)').run(guildId, channelId);
    return true;
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return false; // 既に存在する
    }
    throw error;
  }
}

/**
 * ホワイトリストからチャンネルを削除
 * @param {string} guildId - サーバーID
 * @param {string} channelId - チャンネルID
 */
export function removeWhitelistedChannel(guildId, channelId) {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM whitelisted_channels WHERE guild_id = ? AND channel_id = ?').run(guildId, channelId);
  return result.changes > 0;
}

/**
 * ホワイトリストのチャンネル一覧を取得
 * @param {string} guildId - サーバーID
 * @returns {Array<string>} チャンネルIDの配列
 */
export function getWhitelistedChannels(guildId) {
  const db = getDatabase();
  const rows = db.prepare('SELECT channel_id FROM whitelisted_channels WHERE guild_id = ?').all(guildId);
  return rows.map(row => row.channel_id);
}

/**
 * チャンネルがホワイトリストに含まれるか確認
 * @param {string} guildId - サーバーID
 * @param {string} channelId - チャンネルID
 * @returns {boolean}
 */
export function isChannelWhitelisted(guildId, channelId) {
  const db = getDatabase();
  const result = db.prepare('SELECT 1 FROM whitelisted_channels WHERE guild_id = ? AND channel_id = ?').get(guildId, channelId);
  return !!result;
}

